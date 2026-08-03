-- Stripe Checkout is only a payment collection step.  The data used to create
-- an order is kept here, rather than accepting any amount or item data from a
-- webhook payload.

create table if not exists public.stripe_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  items jsonb not null,
  stripe_session_id text unique,
  stripe_payment_intent text,
  status text not null default 'created' check (status in ('created', 'expired', 'payment_failed', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0)
);

create index if not exists stripe_checkout_attempts_user_created_idx
on public.stripe_checkout_attempts (user_id, created_at desc);

drop trigger if exists stripe_checkout_attempts_set_updated_at on public.stripe_checkout_attempts;
create trigger stripe_checkout_attempts_set_updated_at
before update on public.stripe_checkout_attempts
for each row execute function public.set_updated_at();

alter table public.stripe_checkout_attempts enable row level security;
revoke all on table public.stripe_checkout_attempts from anon, authenticated;

alter table public.orders
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent text,
  add column if not exists payment_status text,
  add column if not exists paid_at timestamptz;

create unique index if not exists orders_stripe_session_id_key
on public.orders (stripe_session_id) where stripe_session_id is not null;

create unique index if not exists orders_stripe_payment_intent_key
on public.orders (stripe_payment_intent) where stripe_payment_intent is not null;

-- The advisory lock serializes retries for one Stripe Checkout Session.  The
-- existing create_customer_order function remains the only code that prices,
-- validates, creates line items, and reserves inventory.
create or replace function public.finalize_paid_stripe_checkout(
  p_checkout_reference uuid,
  p_checkout_user_id uuid,
  p_stripe_session_id text,
  p_stripe_payment_intent text,
  p_payment_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_attempt public.stripe_checkout_attempts;
  existing_order public.orders;
  result jsonb;
  order_id uuid;
begin
  if p_checkout_reference is null
    or p_checkout_user_id is null
    or coalesce(length(trim(p_stripe_session_id)), 0) = 0
    or coalesce(length(trim(p_stripe_payment_intent)), 0) = 0
    or p_payment_status <> 'paid' then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'INVALID_PAYMENT_CONFIRMATION',
        'message', 'The payment confirmation is invalid.'
      )
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_stripe_session_id, 0));

  select * into existing_order
  from public.orders
  where stripe_session_id = p_stripe_session_id
  for update;

  if found then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order', jsonb_build_object(
        'id', existing_order.id,
        'status', existing_order.status,
        'payment_status', existing_order.payment_status
      )
    );
  end if;

  select * into checkout_attempt
  from public.stripe_checkout_attempts
  where id = p_checkout_reference
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'UNKNOWN_CHECKOUT_REFERENCE',
        'message', 'The checkout reference is not recognized.'
      )
    );
  end if;

  if checkout_attempt.stripe_session_id is not null
    and checkout_attempt.stripe_session_id <> p_stripe_session_id then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'CHECKOUT_SESSION_MISMATCH',
        'message', 'The checkout session does not match its trusted reference.'
      )
    );
  end if;

  if checkout_attempt.user_id <> p_checkout_user_id then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'CHECKOUT_USER_MISMATCH',
        'message', 'The checkout user does not match its trusted reference.'
      )
    );
  end if;

  -- Binding here also covers the small window between creating the Stripe
  -- Session and recording its ID in create-checkout-session.
  update public.stripe_checkout_attempts
  set stripe_session_id = p_stripe_session_id,
      stripe_payment_intent = p_stripe_payment_intent
  where id = checkout_attempt.id;

  result := public.create_customer_order(
    checkout_attempt.user_id,
    checkout_attempt.items,
    '{}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb
  );

  if coalesce((result->>'ok')::boolean, false) is not true then
    return result;
  end if;

  order_id := (result->'order'->>'id')::uuid;

  update public.orders
  set status = 'paid',
      stripe_session_id = p_stripe_session_id,
      stripe_payment_intent = p_stripe_payment_intent,
      payment_status = p_payment_status,
      paid_at = now()
  where id = order_id;

  update public.stripe_checkout_attempts
  set status = 'paid',
      stripe_payment_intent = p_stripe_payment_intent
  where id = checkout_attempt.id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'order', jsonb_build_object('id', order_id, 'status', 'paid', 'payment_status', p_payment_status)
  );
end;
$$;

revoke all on function public.finalize_paid_stripe_checkout(uuid, uuid, text, text, text) from public;
grant execute on function public.finalize_paid_stripe_checkout(uuid, uuid, text, text, text) to service_role;
