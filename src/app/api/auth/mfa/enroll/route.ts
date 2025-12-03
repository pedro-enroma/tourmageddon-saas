import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase-server'
import { logAudit, getRequestContext } from '@/lib/audit-logger'

// POST - Enroll in MFA (generate QR code)
export async function POST(request: NextRequest) {
  try {
    const supabase = await getServerClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Enroll in TOTP MFA
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Authenticator App'
    })

    if (error) {
      console.error('Error enrolling in MFA:', error)
      return NextResponse.json({ error: 'Failed to enroll in MFA' }, { status: 500 })
    }

    // Log the enrollment attempt
    const { ip, userAgent } = getRequestContext(request)
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'MFA_SETUP',
      entityType: 'session',
      changes: { new: { factorId: data.id, type: 'totp' } },
      ipAddress: ip,
      userAgent
    })

    return NextResponse.json({
      factorId: data.id,
      qr_code: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
