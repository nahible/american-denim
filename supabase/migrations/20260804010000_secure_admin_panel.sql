-- Secure administration, fulfillment, inventory, refunds, discounts, and audit logging.
-- Existing storefront reads and customer-owned order reads remain available.

-- ---------------------------------------------------------------------------
-- Roles and authorization
-- ---------------------------------------------------------------------------

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_roles (user_id, role)
select id, 'customer' from auth.users
on conflict (user_id) do nothing;

create or replace function public.create_default_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_role on auth.users;
create trigger on_auth_user_created_role
after insert on auth.users
for each row execute function public.create_default_user_role();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_roles.user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.user_roles enable row level security;
drop policy if exists "roles_select_own" on public.user_roles;
create policy "roles_select_own" on public.user_roles
for select to authenticated using (user_id = auth.uid());
drop policy if exists "roles_admin_select" on public.user_roles;
create policy "roles_admin_select" on public.user_roles
for select to authenticated using (public.is_admin());
revoke all on table public.user_roles from anon, authenticated;
grant select on table public.user_roles to authenticated;

-- The legacy public.users.role field is compatibility-only. Authenticated users
-- may update profile fields, but never that role column.
drop policy if exists "Users can update their own profile" on public.users;
drop policy if exists "users_update_own" on public.users;
create policy "users_update_own_safe" on public.users
for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "users_admin_select" on public.users;
create policy "users_admin_select" on public.users
for select to authenticated using (public.is_admin());
revoke update on table public.users from authenticated;
grant update (email, full_name, metadata, updated_at) on table public.users to authenticated;
revoke insert on table public.users from authenticated;
grant insert (id, email, full_name, metadata, created_at, updated_at) on table public.users to authenticated;

drop policy if exists "profiles_admin_select" on public.profiles;
create policy "profiles_admin_select" on public.profiles
for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Admin-facing fields and constraints
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists payment_status text not null default 'pending',
  add column if not exists fulfillment_status text not null default 'unfulfilled',
  add column if not exists carrier text,
  add column if not exists tracking_number text,
  add column if not exists processing_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists refunded_amount_cents integer not null default 0,
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent text;

update public.orders
set payment_status = case when status = 'paid' then 'paid' else payment_status end,
    fulfillment_status = case
      when status in ('processing', 'shipped', 'delivered', 'canceled') then status
      else fulfillment_status
    end;

update public.orders set payment_status = 'pending' where payment_status is null;
update public.orders set payment_status = 'pending'
where payment_status not in ('pending', 'paid', 'partially_refunded', 'refunded', 'failed');
alter table public.orders alter column payment_status set default 'pending';
alter table public.orders alter column payment_status set not null;

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('pending', 'paid', 'partially_refunded', 'refunded', 'failed'));
alter table public.orders drop constraint if exists orders_fulfillment_status_check;
alter table public.orders add constraint orders_fulfillment_status_check
  check (fulfillment_status in ('unfulfilled', 'processing', 'shipped', 'delivered', 'canceled'));
alter table public.orders drop constraint if exists orders_refunded_amount_cents_check;
alter table public.orders add constraint orders_refunded_amount_cents_check check (refunded_amount_cents >= 0);

alter table public.product_variants
  add column if not exists status text not null default 'active',
  add column if not exists low_stock_threshold integer not null default 5;
alter table public.product_variants drop constraint if exists product_variants_status_check;
alter table public.product_variants add constraint product_variants_status_check check (status in ('active', 'inactive'));
alter table public.product_variants drop constraint if exists product_variants_low_stock_threshold_check;
alter table public.product_variants add constraint product_variants_low_stock_threshold_check check (low_stock_threshold >= 0);

create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_payment_status_idx on public.orders (payment_status, created_at desc);
create index if not exists orders_fulfillment_status_idx on public.orders (fulfillment_status, created_at desc);
create index if not exists products_admin_status_idx on public.products (status, updated_at desc);
create index if not exists product_variants_sku_idx on public.product_variants (sku);
create index if not exists product_variants_stock_idx on public.product_variants (stock_quantity);

-- ---------------------------------------------------------------------------
-- Operational tables
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  admin_user_id uuid references auth.users(id) on delete set null,
  adjustment_type text not null check (adjustment_type in ('add', 'remove', 'set', 'sale', 'refund_restock')),
  quantity_change integer not null,
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  reason text not null check (char_length(trim(reason)) between 2 and 500),
  reference_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists inventory_adjustments_reference_key
  on public.inventory_adjustments (reference_id, variant_id) where reference_id is not null;
create index if not exists inventory_adjustments_variant_created_idx
  on public.inventory_adjustments (variant_id, created_at desc);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  stripe_refund_id text unique,
  idempotency_key uuid not null unique default gen_random_uuid(),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'canceled')),
  reason text,
  admin_user_id uuid references auth.users(id) on delete set null,
  restock_requested boolean not null default false,
  restocked_at timestamptz,
  stripe_failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists refunds_order_created_idx on public.refunds (order_id, created_at desc);

create table if not exists public.order_refund_restocks (
  order_id uuid primary key references public.orders(id) on delete restrict,
  stripe_refund_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed_amount')),
  percent_off numeric(5, 2),
  amount_off_cents integer,
  currency text not null default 'USD' check (char_length(currency) = 3),
  active boolean not null default true,
  expires_at timestamptz,
  max_redemptions integer,
  minimum_order_cents integer,
  times_redeemed integer not null default 0,
  stripe_coupon_id text unique,
  stripe_promotion_code_id text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discounts_code_format check (code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  constraint discounts_value_check check (
    (discount_type = 'percentage' and percent_off > 0 and percent_off <= 100 and amount_off_cents is null)
    or (discount_type = 'fixed_amount' and amount_off_cents > 0 and percent_off is null)
  ),
  constraint discounts_limits_check check (
    (max_redemptions is null or max_redemptions > 0)
    and (minimum_order_cents is null or minimum_order_cents >= 0)
  )
);
create unique index if not exists discounts_code_key on public.discounts (upper(code));
create index if not exists discounts_active_idx on public.discounts (active, expires_at);

create table if not exists public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discounts(id) on delete restrict,
  stripe_checkout_session_id text not null unique,
  stripe_event_id text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists discount_redemptions_discount_created_idx
  on public.discount_redemptions (discount_id, created_at desc);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_entity_idx
  on public.admin_audit_log (entity_type, entity_id, created_at desc);
create index if not exists admin_audit_admin_idx
  on public.admin_audit_log (admin_user_id, created_at desc);

drop trigger if exists refunds_set_updated_at on public.refunds;
create trigger refunds_set_updated_at before update on public.refunds
for each row execute function public.set_updated_at();
drop trigger if exists discounts_set_updated_at on public.discounts;
create trigger discounts_set_updated_at before update on public.discounts
for each row execute function public.set_updated_at();

alter table public.inventory_adjustments enable row level security;
alter table public.refunds enable row level security;
alter table public.order_refund_restocks enable row level security;
alter table public.discounts enable row level security;
alter table public.discount_redemptions enable row level security;
alter table public.admin_audit_log enable row level security;

drop policy if exists "inventory_admin_select" on public.inventory_adjustments;
create policy "inventory_admin_select" on public.inventory_adjustments for select to authenticated using (public.is_admin());
drop policy if exists "refunds_admin_select" on public.refunds;
create policy "refunds_admin_select" on public.refunds for select to authenticated using (public.is_admin());
drop policy if exists "refunds_customer_select" on public.refunds;
drop policy if exists "discounts_admin_select" on public.discounts;
create policy "discounts_admin_select" on public.discounts for select to authenticated using (public.is_admin());
drop policy if exists "audit_admin_select" on public.admin_audit_log;
create policy "audit_admin_select" on public.admin_audit_log for select to authenticated using (public.is_admin());

revoke all on public.inventory_adjustments, public.refunds, public.order_refund_restocks,
  public.discounts, public.discount_redemptions, public.admin_audit_log from anon, authenticated;
grant select on public.inventory_adjustments, public.refunds, public.discounts, public.admin_audit_log to authenticated;

create or replace function public.customer_order_refunds()
returns table (
  refund_id uuid,
  order_id uuid,
  amount_cents integer,
  currency text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  restocked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.order_id, r.amount_cents, r.currency, r.status,
         r.created_at, r.updated_at, r.restocked_at is not null
  from public.refunds r
  join public.orders o on o.id = r.order_id
  where o.user_id = auth.uid();
$$;
revoke all on function public.customer_order_refunds() from public;
grant execute on function public.customer_order_refunds() to authenticated;

-- Admin RLS for operational reads and catalog writes. Fulfillment and inventory
-- mutations still go through RPCs so validation and audit rows are atomic.
drop policy if exists "orders_admin_select" on public.orders;
create policy "orders_admin_select" on public.orders for select to authenticated using (public.is_admin());
drop policy if exists "order_items_admin_select" on public.order_items;
create policy "order_items_admin_select" on public.order_items for select to authenticated using (public.is_admin());
drop policy if exists "products_admin_all" on public.products;
create policy "products_admin_all" on public.products for all to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists "product_images_admin_all" on public.product_images;
create policy "product_images_admin_all" on public.product_images for all to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists "product_variants_admin_all" on public.product_variants;
create policy "product_variants_admin_all" on public.product_variants for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "product_variants_public_select" on public.product_variants;
create policy "product_variants_public_select" on public.product_variants for select to anon, authenticated using (
  status = 'active' and exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
);

grant insert, update on public.products, public.product_images, public.product_variants to authenticated;
revoke delete on public.products, public.product_variants from authenticated;
grant delete on public.product_images to authenticated;
revoke insert, update, delete on public.orders from authenticated;
revoke insert, update, delete on public.order_items from authenticated;

-- Admin product image uploads. Object names must live under a user-owned prefix.
drop policy if exists "product_images_admin_insert" on storage.objects;
create policy "product_images_admin_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and public.is_admin() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "product_images_admin_update" on storage.objects;
create policy "product_images_admin_update" on storage.objects for update to authenticated
using (bucket_id = 'product-images' and public.is_admin())
with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "product_images_admin_delete" on storage.objects;
create policy "product_images_admin_delete" on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Transactional admin RPCs
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_fulfillment(
  p_order_id uuid,
  p_fulfillment_status text,
  p_carrier text default null,
  p_tracking_number text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  old_order public.orders;
  new_order public.orders;
  next_carrier text;
  next_tracking_number text;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_order_id is null then raise exception 'ORDER_ID_REQUIRED'; end if;
  if p_fulfillment_status is null
     or p_fulfillment_status not in ('unfulfilled', 'processing', 'shipped', 'delivered', 'canceled') then
    raise exception 'INVALID_FULFILLMENT_STATUS';
  end if;

  select * into old_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;

  next_carrier := case
    when p_carrier is null then old_order.carrier
    else nullif(trim(p_carrier), '')
  end;
  next_tracking_number := case
    when p_tracking_number is null then old_order.tracking_number
    else nullif(trim(p_tracking_number), '')
  end;
  if p_fulfillment_status = 'delivered'
     and old_order.tracking_number is not null
     and next_tracking_number is null then
    next_tracking_number := old_order.tracking_number;
  end if;

  if not (
    (old_order.fulfillment_status = 'unfulfilled' and p_fulfillment_status in ('processing', 'canceled'))
    or (old_order.fulfillment_status = 'processing' and p_fulfillment_status in ('shipped', 'canceled'))
    or (old_order.fulfillment_status = 'shipped' and p_fulfillment_status = 'delivered')
    or old_order.fulfillment_status = p_fulfillment_status
  ) then raise exception 'INVALID_FULFILLMENT_TRANSITION'; end if;

  if p_fulfillment_status in ('processing', 'shipped')
     and old_order.payment_status not in ('paid', 'partially_refunded') then
    raise exception 'PAYMENT_NOT_FULFILLABLE';
  end if;

  if p_fulfillment_status = 'shipped' and coalesce(length(next_tracking_number), 0) = 0 then
    raise exception 'TRACKING_REQUIRED';
  end if;

  update public.orders set
    fulfillment_status = p_fulfillment_status,
    carrier = next_carrier,
    tracking_number = next_tracking_number,
    processing_at = case when p_fulfillment_status = 'processing' then coalesce(processing_at, now()) else processing_at end,
    shipped_at = case when p_fulfillment_status = 'shipped' then coalesce(shipped_at, now()) else shipped_at end,
    delivered_at = case when p_fulfillment_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    canceled_at = case when p_fulfillment_status = 'canceled' then coalesce(canceled_at, now()) else canceled_at end,
    updated_at = now()
  where id = p_order_id returning * into new_order;

  insert into public.admin_audit_log (admin_user_id, action, entity_type, entity_id, old_values, new_values)
  values (auth.uid(), 'fulfillment.updated', 'order', p_order_id::text,
    jsonb_build_object('fulfillment_status', old_order.fulfillment_status, 'carrier', old_order.carrier, 'tracking_number', old_order.tracking_number),
    jsonb_build_object('fulfillment_status', new_order.fulfillment_status, 'carrier', new_order.carrier, 'tracking_number', new_order.tracking_number));
  return new_order;
end;
$$;

create or replace function public.admin_adjust_inventory(
  p_variant_id uuid,
  p_adjustment_type text,
  p_quantity integer,
  p_reason text
)
returns public.product_variants
language plpgsql
security definer
set search_path = public
as $$
declare
  old_variant public.product_variants;
  new_variant public.product_variants;
  next_quantity integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_variant_id is null then raise exception 'VARIANT_ID_REQUIRED'; end if;
  if p_adjustment_type is null or p_adjustment_type not in ('add', 'remove', 'set')
     or p_quantity is null or p_quantity < 0 then
    raise exception 'INVALID_ADJUSTMENT';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then raise exception 'REASON_REQUIRED'; end if;
  if p_adjustment_type in ('add', 'remove') and p_quantity = 0 then raise exception 'INVALID_ADJUSTMENT'; end if;

  select * into old_variant from public.product_variants where id = p_variant_id for update;
  if not found then raise exception 'VARIANT_NOT_FOUND' using errcode = 'P0002'; end if;
  next_quantity := case p_adjustment_type
    when 'add' then old_variant.stock_quantity + p_quantity
    when 'remove' then old_variant.stock_quantity - p_quantity
    else p_quantity end;
  if next_quantity < 0 then raise exception 'INSUFFICIENT_STOCK'; end if;

  update public.product_variants set stock_quantity = next_quantity, updated_at = now()
  where id = p_variant_id returning * into new_variant;
  insert into public.inventory_adjustments
    (variant_id, admin_user_id, adjustment_type, quantity_change, quantity_before, quantity_after, reason)
  values (p_variant_id, auth.uid(), p_adjustment_type, next_quantity - old_variant.stock_quantity,
    old_variant.stock_quantity, next_quantity, trim(p_reason));
  insert into public.admin_audit_log (admin_user_id, action, entity_type, entity_id, old_values, new_values)
  values (auth.uid(), 'inventory.adjusted', 'variant', p_variant_id::text,
    jsonb_build_object('stock_quantity', old_variant.stock_quantity),
    jsonb_build_object('stock_quantity', next_quantity, 'reason', trim(p_reason)));
  return new_variant;
end;
$$;

create or replace function public.admin_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.is_admin() then null else jsonb_build_object(
    'net_paid_revenue', coalesce((select sum(total - refunded_amount_cents / 100.0) from public.orders where payment_status in ('paid', 'partially_refunded', 'refunded')), 0),
    'total_paid_revenue', coalesce((select sum(total - refunded_amount_cents / 100.0) from public.orders where payment_status in ('paid', 'partially_refunded', 'refunded')), 0),
    'gross_paid_orders', (select count(*) from public.orders where payment_status in ('paid', 'partially_refunded', 'refunded')),
    'paid_orders', (select count(*) from public.orders where payment_status in ('paid', 'partially_refunded', 'refunded')),
    'awaiting_fulfillment', (select count(*) from public.orders where payment_status in ('paid', 'partially_refunded') and fulfillment_status = 'unfulfilled'),
    'processing_orders', (select count(*) from public.orders where fulfillment_status = 'processing'),
    'shipped_orders', (select count(*) from public.orders where fulfillment_status = 'shipped'),
    'low_stock_variants', (select count(*) from public.product_variants where status = 'active' and stock_quantity > 0 and stock_quantity <= low_stock_threshold),
    'out_of_stock_variants', (select count(*) from public.product_variants where status = 'active' and stock_quantity = 0),
    'recent_orders', coalesce((select jsonb_agg(row_to_json(recent)) from (
      select o.id, o.created_at, o.total, o.currency, o.payment_status, o.fulfillment_status,
             u.full_name as customer_name, u.email as customer_email
      from public.orders o left join public.users u on u.id = o.user_id
      order by o.created_at desc limit 8
    ) recent), '[]'::jsonb),
    'best_sellers', coalesce((select jsonb_agg(row_to_json(best)) from (
      select oi.product_name, oi.variant_name, sum(oi.quantity)::integer as quantity_sold,
             sum(oi.unit_price * oi.quantity) as revenue
      from public.order_items oi join public.orders o on o.id = oi.order_id
      where o.payment_status in ('paid', 'partially_refunded', 'refunded')
      group by oi.product_name, oi.variant_name order by sum(oi.quantity) desc limit 5
    ) best), '[]'::jsonb),
    'revenue_by_day', coalesce((select jsonb_agg(row_to_json(daily)) from (
      select created_at::date as day, sum(total - refunded_amount_cents / 100.0) as revenue
      from public.orders where payment_status in ('paid', 'partially_refunded', 'refunded')
        and created_at >= now() - interval '30 days'
      group by created_at::date order by created_at::date
    ) daily), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.admin_update_fulfillment(uuid, text, text, text) from public;
revoke all on function public.admin_adjust_inventory(uuid, text, integer, text) from public;
revoke all on function public.admin_dashboard() from public;
grant execute on function public.admin_update_fulfillment(uuid, text, text, text) to authenticated;
grant execute on function public.admin_adjust_inventory(uuid, text, integer, text) to authenticated;
grant execute on function public.admin_dashboard() to authenticated;

create or replace function public.record_discount_redemption(
  p_stripe_promotion_code_id text,
  p_stripe_checkout_session_id text,
  p_stripe_event_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_discount_id uuid;
  inserted_redemption_id uuid;
begin
  if coalesce(length(trim(p_stripe_promotion_code_id)), 0) = 0
     or coalesce(length(trim(p_stripe_checkout_session_id)), 0) = 0
     or coalesce(length(trim(p_stripe_event_id)), 0) = 0 then
    raise exception 'INVALID_DISCOUNT_REDEMPTION';
  end if;

  select id into target_discount_id
  from public.discounts
  where stripe_promotion_code_id = p_stripe_promotion_code_id;
  if not found then return; end if;

  insert into public.discount_redemptions
    (discount_id, stripe_checkout_session_id, stripe_event_id)
  values (target_discount_id, p_stripe_checkout_session_id, p_stripe_event_id)
  on conflict do nothing
  returning id into inserted_redemption_id;

  if inserted_redemption_id is not null then
    update public.discounts
    set times_redeemed = times_redeemed + 1, updated_at = now()
    where id = target_discount_id;
  end if;
end;
$$;
revoke all on function public.record_discount_redemption(text, text, text) from public;
grant execute on function public.record_discount_redemption(text, text, text) to service_role;

-- Audit catalog changes made through admin RLS.
create or replace function public.audit_admin_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    insert into public.admin_audit_log (admin_user_id, action, entity_type, entity_id, old_values, new_values)
    values (auth.uid(), lower(tg_op), tg_table_name,
      case when tg_op = 'DELETE' then old.id::text else new.id::text end,
      case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
      case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.audit_admin_row_change() from public;

drop trigger if exists products_admin_audit on public.products;
create trigger products_admin_audit after insert or update on public.products
for each row execute function public.audit_admin_row_change();
drop trigger if exists variants_admin_audit on public.product_variants;
create trigger variants_admin_audit after insert or update on public.product_variants
for each row execute function public.audit_admin_row_change();

-- Service-role-only helpers used by Stripe functions.
create or replace function public.apply_stripe_checkout_details(
  p_order_id uuid,
  p_subtotal_cents integer,
  p_discount_cents integer,
  p_shipping_cents integer,
  p_tax_cents integer,
  p_total_cents integer,
  p_metadata jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare
  affected_rows integer;
begin
  if p_order_id is null
     or p_subtotal_cents is null or p_subtotal_cents < 0
     or p_discount_cents is null or p_discount_cents < 0
     or p_shipping_cents is null or p_shipping_cents < 0
     or p_tax_cents is null or p_tax_cents < 0
     or p_total_cents is null or p_total_cents < 0 then
    raise exception 'INVALID_CHECKOUT_AMOUNTS';
  end if;
  if p_discount_cents > p_subtotal_cents then
    raise exception 'DISCOUNT_EXCEEDS_SUBTOTAL';
  end if;
  if p_total_cents::bigint <>
     p_subtotal_cents::bigint - p_discount_cents::bigint
       + p_shipping_cents::bigint + p_tax_cents::bigint then
    raise exception 'CHECKOUT_TOTAL_MISMATCH';
  end if;

  update public.orders set
    subtotal = p_subtotal_cents / 100.0,
    discount_total = p_discount_cents / 100.0,
    shipping_total = p_shipping_cents / 100.0,
    tax_total = p_tax_cents / 100.0,
    total = p_total_cents / 100.0,
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
    updated_at = now()
  where id = p_order_id;
  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.apply_stripe_checkout_details(uuid, integer, integer, integer, integer, integer, jsonb) from public;
grant execute on function public.apply_stripe_checkout_details(uuid, integer, integer, integer, integer, integer, jsonb) to service_role;

create or replace function public.record_stripe_refund_event(
  p_order_id uuid,
  p_stripe_refund_id text,
  p_amount_cents integer,
  p_currency text,
  p_status text,
  p_failure_reason text default null,
  p_refund_record_id uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_refund public.refunds;
  target_order public.orders;
  line record;
  before_quantity integer;
  total_refunded integer;
  order_total_cents integer;
  restock_marker uuid;
  restock_admin_user_id uuid;
  order_restock_reference text;
  existing_refund_order_id uuid;
begin
  if p_order_id is null
     or coalesce(length(trim(p_stripe_refund_id)), 0) = 0
     or p_amount_cents is null or p_amount_cents <= 0
     or coalesce(length(trim(p_currency)), 0) <> 3
     or p_status is null or p_status not in ('pending', 'succeeded', 'failed', 'canceled') then
    raise exception 'INVALID_REFUND_EVENT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_stripe_refund_id, 0));
  select order_id into existing_refund_order_id
  from public.refunds
  where stripe_refund_id = p_stripe_refund_id
  for update;
  if found and existing_refund_order_id <> p_order_id then
    raise exception 'REFUND_ORDER_MISMATCH';
  end if;

  select * into target_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  order_total_cents := round(target_order.total * 100)::integer;

  if p_refund_record_id is not null then
    update public.refunds set
      stripe_refund_id = p_stripe_refund_id,
      amount_cents = p_amount_cents,
      currency = upper(p_currency),
      status = p_status,
      stripe_failure_reason = p_failure_reason,
      updated_at = now()
    where id = p_refund_record_id and order_id = p_order_id
    returning * into target_refund;
  end if;
  if target_refund.id is null then
    insert into public.refunds as existing_refund
      (order_id, stripe_refund_id, amount_cents, currency, status, stripe_failure_reason)
    values (p_order_id, p_stripe_refund_id, p_amount_cents, upper(p_currency), p_status, p_failure_reason)
    on conflict (stripe_refund_id) do update set
      amount_cents = excluded.amount_cents,
      currency = excluded.currency,
      status = excluded.status,
      stripe_failure_reason = excluded.stripe_failure_reason,
      updated_at = now()
    where existing_refund.order_id = excluded.order_id
    returning * into target_refund;
    if target_refund.id is null then
      raise exception 'REFUND_ORDER_MISMATCH';
    end if;
  end if;

  select coalesce(sum(amount_cents), 0)::integer into total_refunded
  from public.refunds where order_id = p_order_id and status = 'succeeded';
  if total_refunded > order_total_cents then
    raise exception 'REFUND_TOTAL_EXCEEDS_ORDER';
  end if;

  update public.orders set
    refunded_amount_cents = total_refunded,
    payment_status = case
      when total_refunded = order_total_cents then 'refunded'
      when total_refunded > 0 then 'partially_refunded'
      else payment_status end,
    updated_at = now()
  where id = p_order_id;

  if total_refunded = order_total_cents and exists (
    select 1 from public.refunds
    where order_id = p_order_id and status = 'succeeded' and restock_requested
  ) then
    select admin_user_id into restock_admin_user_id
    from public.refunds
    where order_id = p_order_id and status = 'succeeded' and restock_requested
    order by created_at desc limit 1;

    insert into public.order_refund_restocks (order_id, stripe_refund_id)
    values (p_order_id, p_stripe_refund_id)
    on conflict do nothing
    returning order_id into restock_marker;

    order_restock_reference := 'refund-restock:' || p_order_id::text;
  end if;

  if restock_marker is not null then
    for line in select variant_id, sum(quantity)::integer quantity from public.order_items
      where order_id = p_order_id and variant_id is not null group by variant_id
    loop
      select stock_quantity into before_quantity from public.product_variants where id = line.variant_id for update;
      if found then
        update public.product_variants set stock_quantity = stock_quantity + line.quantity, updated_at = now() where id = line.variant_id;
      else
        continue;
      end if;
      insert into public.inventory_adjustments
        (variant_id, admin_user_id, adjustment_type, quantity_change, quantity_before, quantity_after, reason, reference_id)
      values (line.variant_id, restock_admin_user_id, 'refund_restock', line.quantity,
        before_quantity, before_quantity + line.quantity, 'Cumulative full refund restock', order_restock_reference)
      on conflict do nothing;
    end loop;
    update public.refunds set restocked_at = now()
    where order_id = p_order_id
      and status = 'succeeded'
      and restock_requested
      and restocked_at is null;
  end if;
end;
$$;
revoke all on function public.record_stripe_refund_event(uuid, text, integer, text, text, text, uuid) from public;
grant execute on function public.record_stripe_refund_event(uuid, text, integer, text, text, text, uuid) to service_role;

-- First admin assignment (run manually with the intended auth.users UUID):
-- insert into public.user_roles (user_id, role)
-- values ('00000000-0000-0000-0000-000000000000', 'admin')
-- on conflict (user_id) do update set role = excluded.role, updated_at = now();
