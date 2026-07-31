-- Customer profile storage and first-login provisioning.
-- Safe to run more than once in a project that already has public.users.

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

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and contype = 'f'
      and conname = 'users_id_fkey'
  ) then
    alter table public.users
      add constraint users_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end
$$;

create or replace function public.set_users_updated_at()
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

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_users_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, metadata)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Member'
    ),
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.users enable row level security;

drop policy if exists "Users can view their own profile" on public.users;
create policy "Users can view their own profile"
on public.users for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can create their own profile" on public.users;
create policy "Users can create their own profile"
on public.users for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.users;
create policy "Users can update their own profile"
on public.users for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

grant select, insert, update on table public.users to authenticated;

-- Provision profiles for users created before the trigger was installed.
insert into public.users (id, email, full_name, metadata)
select
  au.id,
  au.email,
  coalesce(
    nullif(au.raw_user_meta_data ->> 'full_name', ''),
    nullif(au.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(au.email, '@', 1), ''),
    'Member'
  ),
  coalesce(au.raw_user_meta_data, '{}'::jsonb)
from auth.users au
on conflict (id) do nothing;
