import { supabase } from '../lib/supabase.js'

export const STORAGE_BUCKETS = {
  profileAvatars: 'profile-avatars',
  productImages: 'product-images',
  lookbook: 'lookbook',
  brandAssets: 'brand-assets',
}

export function getPublicStorageUrl(bucket, value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const normalizedValue = value.trim()

  if (/^https?:\/\//i.test(normalizedValue)) {
    return normalizedValue
  }

  if (!supabase || !bucket) {
    return null
  }

  const path = normalizedValue.replace(/^\/+/, '').replace(new RegExp(`^${bucket}/`), '')
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data?.publicUrl ?? null
}

export async function listPublicStorageUrls(bucket) {
  if (!supabase || !bucket) {
    return { data: [], error: new Error('Supabase Storage is not configured.') }
  }

  const { data, error } = await supabase.storage.from(bucket).list('', {
    limit: 100,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  })

  if (error) {
    return { data: [], error }
  }

  const urls = (data ?? [])
    .filter((file) => file?.name && file.name !== '.emptyFolderPlaceholder')
    .map((file) => getPublicStorageUrl(bucket, file.name))
    .filter(Boolean)

  return { data: urls, error: null }
}
