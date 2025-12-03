import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getServiceRoleClient } from '@/lib/supabase-server'
import { logAudit, getRequestContext } from '@/lib/audit-logger'

// Simple in-memory rate limiting (use Redis in production)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>()

const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 5

function getRateLimitKey(ip: string, email: string): string {
  return `${ip}:${email}`
}

function checkRateLimit(ip: string, email: string): { allowed: boolean; retryAfter?: number } {
  const key = getRateLimitKey(ip, email)
  const now = Date.now()
  const attempt = loginAttempts.get(key)

  if (!attempt) {
    loginAttempts.set(key, { count: 1, lastAttempt: now })
    return { allowed: true }
  }

  // Reset if window has passed
  if (now - attempt.lastAttempt > RATE_LIMIT_WINDOW) {
    loginAttempts.set(key, { count: 1, lastAttempt: now })
    return { allowed: true }
  }

  // Check if over limit
  if (attempt.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW - (now - attempt.lastAttempt)) / 1000)
    return { allowed: false, retryAfter }
  }

  // Increment counter
  attempt.count++
  attempt.lastAttempt = now
  return { allowed: true }
}

function resetRateLimit(ip: string, email: string): void {
  const key = getRateLimitKey(ip, email)
  loginAttempts.delete(key)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    // Input validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Invalid input format' },
        { status: 400 }
      )
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Get client IP for rate limiting
    const forwardedFor = request.headers.get('x-forwarded-for')
    const ip = forwardedFor?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown'

    // Check rate limit
    const rateLimit = checkRateLimit(ip, email)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many login attempts. Please try again in ${rateLimit.retryAfter} seconds.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfter)
          }
        }
      )
    }

    const cookieStore = await cookies()

    // Create Supabase client for server-side auth
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...options,
                // Security flags
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: 60 * 60 * 24 * 7, // 7 days
              })
            })
          },
        },
      }
    )

    // Attempt login
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      // Log failed login attempt
      const { ip: clientIp, userAgent } = getRequestContext(request)
      await logAudit({
        userEmail: email,
        action: 'LOGIN_FAILED',
        entityType: 'session',
        changes: { new: { reason: 'Invalid credentials' } },
        ipAddress: clientIp,
        userAgent
      })

      // Don't reveal if email exists or not
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Successful login - reset rate limit
    resetRateLimit(ip, email)

    // Check if user has MFA enabled
    const { data: factors } = await supabase.auth.mfa.listFactors()

    if (factors && factors.totp && factors.totp.length > 0) {
      // User has MFA enabled - create challenge
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factors.totp[0].id
      })

      if (challengeError) {
        console.error('[SECURITY] MFA challenge error:', challengeError)
        return NextResponse.json(
          { error: 'Failed to create MFA challenge' },
          { status: 500 }
        )
      }

      // Return that MFA is required
      return NextResponse.json(
        {
          requiresMfa: true,
          factorId: factors.totp[0].id,
          challengeId: challenge.id,
          user: {
            id: data.user?.id,
            email: data.user?.email,
          }
        },
        { status: 200 }
      )
    }

    // No MFA - log successful login and update last_login_at
    const { ip: clientIp, userAgent } = getRequestContext(request)
    await logAudit({
      userId: data.user?.id,
      userEmail: data.user?.email,
      action: 'LOGIN',
      entityType: 'session',
      changes: { new: { method: 'password' } },
      ipAddress: clientIp,
      userAgent
    })

    // Update last_login_at in app_users
    if (data.user) {
      const serviceSupabase = getServiceRoleClient()
      await serviceSupabase
        .from('app_users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', data.user.id)
    }

    console.log(`[SECURITY] Successful login for user: ${data.user?.id} from IP: ${ip}`)

    return NextResponse.json(
      {
        success: true,
        user: {
          id: data.user?.id,
          email: data.user?.email,
        }
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[SECURITY] Login error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
