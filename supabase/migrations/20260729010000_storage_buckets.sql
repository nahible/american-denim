-- Storefront Storage buckets
--
-- This migration is idempotent. It does not rename or remove the existing
-- profile-avatars bucket; it only makes sure its expected configuration is
-- present alongside the public storefront buckets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'profile-avatars',
    'profile-avatars',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'product-images',
    'product-images',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'lookbook',
    'lookbook',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'brand-assets',
    'brand-assets',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
  )
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Profile pictures remain user-owned. Public bucket visibility is required by
-- the existing frontend getPublicUrl() call, while object access is scoped to
-- the authenticated user's first path segment for non-public operations.
drop policy if exists "profile_avatars_select_own" on storage.objects;
create policy "profile_avatars_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "profile_avatars_public_read" on storage.objects;
create policy "profile_avatars_public_read" on storage.objects
for select to anon, authenticated
using (bucket_id = 'profile-avatars');

drop policy if exists "profile_avatars_insert_own" on storage.objects;
create policy "profile_avatars_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "profile_avatars_update_own" on storage.objects;
create policy "profile_avatars_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "profile_avatars_delete_own" on storage.objects;
create policy "profile_avatars_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- Public storefront media is readable by everyone. Storefront clients must
-- not be able to mutate catalog or editorial assets; trusted upload tooling
-- can use the service role or future restricted administrative policies.
do $$
declare
  bucket_name text;
begin
  foreach bucket_name in array array['product-images', 'lookbook', 'brand-assets'] loop
    execute format('drop policy if exists %I on storage.objects', bucket_name || '_public_read');
    execute format(
      'create policy %I on storage.objects for select to anon, authenticated using (bucket_id = %L)',
      bucket_name || '_public_read',
      bucket_name
    );

    execute format('drop policy if exists %I on storage.objects', bucket_name || '_authenticated_insert');
    execute format('drop policy if exists %I on storage.objects', bucket_name || '_authenticated_update');
    execute format('drop policy if exists %I on storage.objects', bucket_name || '_authenticated_delete');
  end loop;
end $$;
