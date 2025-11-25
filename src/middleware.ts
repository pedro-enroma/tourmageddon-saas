import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  })

  // Create Supabase client for server-side token validation
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({
            request: {
              headers: req.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Validate the session - this actually verifies the JWT
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // Protected routes check
  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (error || !user) {
      // Clear any invalid cookies
      res.cookies.delete('sb-access-token')
      res.cookies.delete('sb-refresh-token')

      const redirectUrl = new URL('/login', req.url)
      redirectUrl.searchParams.set('error', 'session_expired')
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Redirect logged-in users away from login page
  if (req.nextUrl.pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/login']
}