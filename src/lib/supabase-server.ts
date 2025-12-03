import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Get a Supabase client with service_role privileges.
 * Use this for server-side write operations that need to bypass RLS.
 * NEVER expose this client to the browser.
 */
export const getServiceRoleClient = (): SupabaseClient => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server operations')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Get a Supabase server client with session validation.
 * Uses the anon key but validates the user's session from cookies.
 */
export const getServerClient = async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // This can fail in Server Components, but that's OK
            // as long as we're not trying to modify cookies
          }
        },
      },
    }
  )
}

/**
 * Verify the current session and return the user.
 * Use this at the start of every protected API route.
 */
export const verifySession = async (): Promise<{
  user: { id: string; email?: string } | null
  error: Error | null
}> => {
  try {
    const supabase = await getServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      return { user: null, error }
    }

    if (!user) {
      return { user: null, error: new Error('No user found') }
    }

    return { user: { id: user.id, email: user.email }, error: null }
  } catch (err) {
    return {
      user: null,
      error: err instanceof Error ? err : new Error('Session verification failed')
    }
  }
}

/**
 * Helper to check if a user has a specific role.
 * Queries the app_users table for role information.
 */
export const getUserRole = async (userId: string): Promise<string | null> => {
  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('app_users')
      .select('role')
      .eq('id', userId)
      .single()

    if (error || !data) {
      return null
    }

    return data.role
  } catch {
    return null
  }
}

/**
 * Check if a user is an admin.
 */
export const isAdmin = async (userId: string): Promise<boolean> => {
  const role = await getUserRole(userId)
  return role === 'admin'
}
