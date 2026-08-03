import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

console.log(supabaseUrl)
console.log(!!supabaseAnonKey)


export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export function createSupabaseClient() {
  if (!isSupabaseConfigured) {
    return null
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  })
}

export const supabase = createSupabaseClient()
