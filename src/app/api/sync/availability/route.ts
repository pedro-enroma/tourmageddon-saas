import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { availabilitySyncSchema, validateInput } from '@/lib/security/validation'
import { securityLogger } from '@/lib/security/logger'

// Rate limiting for sync operations
const syncAttempts = new Map<string, { count: number; lastAttempt: number }>()
const RATE_LIMIT_WINDOW = 5 * 60 * 1000 // 5 minutes
const MAX_SYNC_ATTEMPTS = 10

function checkSyncRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const attempt = syncAttempts.get(userId)

  if (!attempt) {
    syncAttempts.set(userId, { count: 1, lastAttempt: now })
    return { allowed: true }
  }

  if (now - attempt.lastAttempt > RATE_LIMIT_WINDOW) {
    syncAttempts.set(userId, { count: 1, lastAttempt: now })
    return { allowed: true }
  }

  if (attempt.count >= MAX_SYNC_ATTEMPTS) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW - (now - attempt.lastAttempt)) / 1000)
    return { allowed: false, retryAfter }
  }

  attempt.count++
  attempt.lastAttempt = now
  return { allowed: true }
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  // Create Supabase client to verify user
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Not needed for this endpoint
        },
      },
    }
  )

  // Get client info for logging
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown'

  try {
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      securityLogger.accessDenied(null, '/api/sync/availability', ip)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check rate limit
    const rateLimit = checkSyncRateLimit(user.id)
    if (!rateLimit.allowed) {
      securityLogger.rateLimitExceeded(ip, '/api/sync/availability', user.email)
      return NextResponse.json(
        { error: `Too many sync requests. Please try again in ${rateLimit.retryAfter} seconds.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfter)
          }
        }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validation = validateInput(availabilitySyncSchema, body)

    if (!validation.success) {
      securityLogger.invalidInput('/api/sync/availability', validation.error, ip, user.id)
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const { productId, days } = validation.data

    // Log the API call
    securityLogger.apiCall(
      user.id,
      'booking-webhook-system/sync/availability',
      'POST',
      undefined,
      ip
    )

    // Make the external API call with proper authentication
    // Note: In production, store WEBHOOK_API_KEY in environment variables
    const webhookUrl = process.env.WEBHOOK_SYNC_URL || 'https://booking-webhook-system-production.up.railway.app/api/sync/availability'
    const webhookApiKey = process.env.WEBHOOK_API_KEY

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-By': user.id,
      'X-Request-Timestamp': new Date().toISOString(),
    }

    // Add API key if configured
    if (webhookApiKey) {
      headers['Authorization'] = `Bearer ${webhookApiKey}`
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        productId,
        days
      })
    })

    const data = await response.json()

    // Log the result
    securityLogger.apiCall(
      user.id,
      'booking-webhook-system/sync/availability',
      'POST',
      response.status,
      ip
    )

    if (response.ok) {
      return NextResponse.json(data, { status: 200 })
    } else {
      // Don't expose detailed external API errors to client
      return NextResponse.json(
        { error: data.error || 'Sync failed', details: data.details },
        { status: response.status }
      )
    }
  } catch (error) {
    securityLogger.error('Availability sync failed', error, { ip })

    return NextResponse.json(
      { error: 'Failed to sync availability' },
      { status: 500 }
    )
  }
}
