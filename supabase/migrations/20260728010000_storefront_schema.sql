-- American Denim customer storefront schema.
-- Paste this file into the Supabase SQL Editor, or run it after the previous
-- customer profile migration. It is intentionally idempotent.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

-- The current frontend still reads and writes public.users. Keep that legacy
-- relation available while profiles is the canonical customer table.
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text default 'customer',
  status text default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users add column if not exists email text;
alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists role text default 'customer';
alter table public.users add column if not exists status text default 'active';
alter table public.users add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists created_at timestamptz not null default now();
alter table public.users add column if not exists updated_at timestamptz not null default now();

update public.profiles
set metadata = '{}'::jsonb
where metadata is null;

alter table public.profiles
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

update public.users
set metadata = '{}'::jsonb
where metadata is null;

alter table public.users
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create or replace function public.sync_user_compatibility_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, metadata)
  values (
    new.id,
    new.email,
    new.full_name,
    nullif(new.metadata ->> 'avatar_url', ''),
    coalesce(new.metadata, '{}'::jsonb)
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    metadata = excluded.metadata,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists users_sync_profiles on public.users;
create trigger users_sync_profiles
after insert or update on public.users
for each row execute function public.sync_user_compatibility_profile();

create or replace function public.sync_profile_compatibility_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  insert into public.users (id, email, full_name, metadata)
  values (
    new.id,
    new.email,
    new.full_name,
    coalesce(
      jsonb_set(
        coalesce(new.metadata, '{}'::jsonb),
        '{avatar_url}',
        coalesce(to_jsonb(new.avatar_url), 'null'::jsonb),
        true
      ),
      '{}'::jsonb
    )
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    metadata = excluded.metadata,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists profiles_sync_users on public.profiles;
create trigger profiles_sync_users
after insert or update on public.profiles
for each row execute function public.sync_profile_compatibility_user();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Member'
  );

  insert into public.profiles (id, email, full_name, avatar_url, metadata)
  values (
    new.id,
    new.email,
    display_name,
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();

  insert into public.users (id, email, full_name, metadata)
  values (new.id, new.email, display_name, coalesce(new.raw_user_meta_data, '{}'::jsonb))
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill accounts created before the trigger was installed.
insert into public.profiles (id, email, full_name, avatar_url, metadata)
select
  au.id,
  au.email,
  coalesce(
    nullif(au.raw_user_meta_data ->> 'full_name', ''),
    nullif(au.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(au.email, '@', 1), ''),
    'Member'
  ),
  nullif(au.raw_user_meta_data ->> 'avatar_url', ''),
  coalesce(au.raw_user_meta_data, '{}'::jsonb)
from auth.users au
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  description text,
  status text not null default 'active',
  featured boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt_text text,
  sort_order integer not null default 0 check (sort_order >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text unique,
  name text,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= price),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  color text,
  size text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, color, size)
);

create index if not exists products_status_created_idx on public.products (status, created_at desc);
create index if not exists products_featured_idx on public.products (featured) where featured = true;
create index if not exists product_images_product_sort_idx on public.product_images (product_id, sort_order, created_at);
create index if not exists product_variants_product_idx on public.product_variants (product_id);
create index if not exists product_variants_color_idx on public.product_variants (color);
create index if not exists product_variants_size_idx on public.product_variants (size);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists product_images_set_updated_at on public.product_images;
create trigger product_images_set_updated_at
before update on public.product_images
for each row execute function public.set_updated_at();

drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Carts
-- ---------------------------------------------------------------------------

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  currency text not null default 'USD' check (char_length(currency) = 3),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id, variant_id)
);

create unique index if not exists carts_one_active_per_user_idx
on public.carts (user_id) where status = 'active';
create index if not exists carts_user_status_idx on public.carts (user_id, status, updated_at desc);
create index if not exists cart_items_cart_idx on public.cart_items (cart_id);
create index if not exists cart_items_product_idx on public.cart_items (product_id);

drop trigger if exists carts_set_updated_at on public.carts;
create trigger carts_set_updated_at
before update on public.carts
for each row execute function public.set_updated_at();

drop trigger if exists cart_items_set_updated_at on public.cart_items;
create trigger cart_items_set_updated_at
before update on public.cart_items
for each row execute function public.set_updated_at();

-- The current frontend still persists serialized cart metadata in public.cart.
-- Keep this compatibility table until the frontend is moved to cart_items.
create table if not exists public.cart (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  currency text not null default 'USD' check (char_length(currency) = 3),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cart_one_active_per_user_idx
on public.cart (user_id) where status = 'active';
create index if not exists cart_user_status_idx on public.cart (user_id, status, updated_at desc);

drop trigger if exists cart_set_updated_at on public.cart;
create trigger cart_set_updated_at
before update on public.cart
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Orders and historical line-item snapshots
-- ---------------------------------------------------------------------------

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  cart_id uuid references public.carts(id) on delete set null,
  status text not null default 'pending_payment',
  currency text not null default 'USD' check (char_length(currency) = 3),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  shipping_total numeric(12, 2) not null default 0 check (shipping_total >= 0),
  tax_total numeric(12, 2) not null default 0 check (tax_total >= 0),
  discount_total numeric(12, 2) not null default 0 check (discount_total >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text,
  variant_name text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_created_idx on public.orders (status, created_at desc);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists order_items_set_updated_at on public.order_items;
create trigger order_items_set_updated_at
before update on public.order_items
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.cart enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users for select to authenticated using (auth.uid() = id);
drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users for insert to authenticated with check (auth.uid() = id);
drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "products_public_select" on public.products;
create policy "products_public_select" on public.products for select to anon, authenticated using (status = 'active');
drop policy if exists "product_images_public_select" on public.product_images;
create policy "product_images_public_select" on public.product_images for select to anon, authenticated using (true);
drop policy if exists "product_variants_public_select" on public.product_variants;
create policy "product_variants_public_select" on public.product_variants for select to anon, authenticated using (true);

drop policy if exists "carts_own_all" on public.carts;
create policy "carts_own_all" on public.carts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "cart_items_own_all" on public.cart_items;
create policy "cart_items_own_all" on public.cart_items for all to authenticated
using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

drop policy if exists "cart_own_all" on public.cart;
create policy "cart_own_all" on public.cart for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders for select to authenticated using (auth.uid() = user_id);
drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "orders_delete_own" on public.orders;
create policy "orders_delete_own" on public.orders for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "order_items_select_own" on public.order_items;
create policy "order_items_select_own" on public.order_items for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
drop policy if exists "order_items_insert_own" on public.order_items;
create policy "order_items_insert_own" on public.order_items for insert to authenticated
with check (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

grant select on public.products, public.product_images, public.product_variants to anon, authenticated;
grant select, insert, update on public.profiles, public.users to authenticated;
grant select, insert, update, delete on public.carts, public.cart_items, public.cart to authenticated;
grant select, insert, delete on public.orders to authenticated;
grant select, insert on public.order_items to authenticated;

-- ---------------------------------------------------------------------------
-- Profile avatar storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_avatars_select_own" on storage.objects;
create policy "profile_avatars_select_own" on storage.objects for select to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "profile_avatars_insert_own" on storage.objects;
create policy "profile_avatars_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "profile_avatars_update_own" on storage.objects;
create policy "profile_avatars_update_own" on storage.objects for update to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "profile_avatars_delete_own" on storage.objects;
create policy "profile_avatars_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
