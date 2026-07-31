import { supabase } from '../lib/supabase.js'
import { getUserById } from './usersService.ts'
import { listOrders } from './ordersService.ts'
import { getPublicStorageUrl, STORAGE_BUCKETS } from './storageService.js'

export const PROFILE_AVATAR_BUCKET = STORAGE_BUCKETS.profileAvatars
const MAX_AVATAR_SIZE = 5 * 1024 * 1024

function asText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function configurationError() {
  return new Error('Supabase authentication is not configured.')
}

function profilePayload(authUser) {
  const authMetadata = asObject(authUser?.user_metadata)
  const email = asText(authUser?.email)
  const fullName = asText(authMetadata.full_name) || asText(authMetadata.name) || email.split('@')[0] || 'Member'

  return {
    id: authUser.id,
    email: email || null,
    full_name: fullName,
    metadata: {
      avatar_url: asText(authMetadata.avatar_url) || null,
    },
  }
}

export function buildProfile(authUser, record = null) {
  const metadata = asObject(record?.metadata)
  const authMetadata = asObject(authUser?.user_metadata)
  const email = asText(record?.email) || asText(authUser?.email)

  return {
    id: authUser?.id ?? record?.id ?? '',
    email,
    name: asText(record?.full_name) || asText(authMetadata.full_name) || email.split('@')[0] || 'Member',
    avatarUrl: asText(metadata.avatar_url) || asText(authMetadata.avatar_url) || '',
    metadata,
  }
}

async function getOrCreateUserRecord(authUser) {
  const existingResponse = await getUserById(authUser.id)

  if (existingResponse.error || existingResponse.data) {
    return existingResponse
  }

  if (!supabase) {
    return { data: null, error: configurationError() }
  }

  return supabase
    .from('users')
    .upsert(profilePayload(authUser), { onConflict: 'id' })
    .select('id, email, full_name, metadata')
    .single()
}

export async function fetchUserProfile(authUser) {
  if (!authUser?.id) {
    return {
      profile: null,
      orders: [],
      profileError: new Error('You need to sign in to view your profile.'),
      ordersError: null,
    }
  }

  const [profileResponse, ordersResponse] = await Promise.all([
    getOrCreateUserRecord(authUser),
    listOrders({
      select: 'id, status, subtotal, total, currency, created_at',
      filters: { user_id: authUser.id },
      orderBy: 'created_at',
      ascending: false,
    }),
  ])

  return {
    profile: buildProfile(authUser, profileResponse.data),
    orders: ordersResponse.data ?? [],
    profileError: profileResponse.error,
    ordersError: ordersResponse.error,
  }
}

async function persistProfile(authUser, profile, { name, avatarUrl = profile.avatarUrl }) {
  if (!supabase) {
    return { data: null, error: configurationError() }
  }

  const fullName = asText(name)
  if (!fullName) {
    return { data: null, error: new Error('Enter your name before saving your profile.') }
  }

  const metadata = {
    ...asObject(profile.metadata),
    avatar_url: avatarUrl || null,
  }
  const { data: authData, error: authError } = await supabase.auth.updateUser({
    data: {
      ...asObject(authUser.user_metadata),
      full_name: fullName,
      avatar_url: avatarUrl || null,
    },
  })

  if (authError) {
    return { data: null, error: authError }
  }

  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        id: authUser.id,
        email: authUser.email ?? null,
        full_name: fullName,
        metadata,
      },
      { onConflict: 'id' },
    )
    .select('id, email, full_name, metadata')
    .single()

  if (error) {
    return { data: null, error }
  }

  return {
    data: buildProfile(authData.user ?? authUser, data),
    error: null,
  }
}

export function updateProfileName(authUser, profile, name) {
  return persistProfile(authUser, profile, { name })
}

function fileExtension(file) {
  const namedExtension = file.name.split('.').pop()?.toLowerCase()
  if (namedExtension && /^[a-z0-9]+$/.test(namedExtension)) {
    return namedExtension
  }

  return file.type.split('/')[1] || 'jpg'
}

export async function uploadProfilePicture(authUser, profile, file) {
  if (!supabase) {
    return { data: null, error: configurationError() }
  }

  if (!file?.type.startsWith('image/')) {
    return { data: null, error: new Error('Choose an image file for your profile picture.') }
  }

  if (file.size > MAX_AVATAR_SIZE) {
    return { data: null, error: new Error('Profile pictures must be 5 MB or smaller.') }
  }

  const path = `${authUser.id}/avatar-${Date.now()}.${fileExtension(file)}`
  const { error: uploadError } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: true,
  })

  if (uploadError) {
    return { data: null, error: uploadError }
  }

  const publicUrl = getPublicStorageUrl(PROFILE_AVATAR_BUCKET, path)
  return persistProfile(authUser, profile, {
    name: profile.name,
    avatarUrl: publicUrl,
  })
}
