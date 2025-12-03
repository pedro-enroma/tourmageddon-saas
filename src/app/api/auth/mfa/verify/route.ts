import { NextRequest, NextResponse } from 'next/server'
import { getServerClient, getServiceRoleClient } from '@/lib/supabase-server'
import { logAudit, getRequestContext } from '@/lib/audit-logger'

// POST - Verify MFA code (during login or setup)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { factorId, challengeId, code } = body

    if (!factorId || !code) {
      return NextResponse.json({ error: 'factorId and code are required' }, { status: 400 })
    }

    const supabase = await getServerClient()
    const { ip, userAgent } = getRequestContext(request)

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    // If challengeId is provided, verify the challenge
    // Otherwise, this might be the initial setup verification
    if (challengeId) {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code
      })

      if (error) {
        console.error('MFA verification failed:', error)
        await logAudit({
          userId: user?.id,
          userEmail: user?.email,
          action: 'MFA_FAILED',
          entityType: 'session',
          changes: { new: { factorId, reason: error.message } },
          ipAddress: ip,
          userAgent
        })
        return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 })
      }

      // Log successful verification
      await logAudit({
        userId: user?.id,
        userEmail: user?.email,
        action: 'MFA_VERIFIED',
        entityType: 'session',
        changes: { new: { factorId } },
        ipAddress: ip,
        userAgent
      })

      // Update app_users to mark MFA as enabled
      if (user) {
        const serviceSupabase = getServiceRoleClient()
        await serviceSupabase
          .from('app_users')
          .update({ mfa_enabled: true })
          .eq('id', user.id)
      }

      return NextResponse.json({ success: true })
    } else {
      // Initial setup - create challenge and verify
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId
      })

      if (challengeError) {
        console.error('Error creating MFA challenge:', challengeError)
        return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 })
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code
      })

      if (verifyError) {
        console.error('MFA verification failed:', verifyError)
        await logAudit({
          userId: user?.id,
          userEmail: user?.email,
          action: 'MFA_FAILED',
          entityType: 'session',
          changes: { new: { factorId, reason: verifyError.message } },
          ipAddress: ip,
          userAgent
        })
        return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 })
      }

      // Update app_users to mark MFA as enabled
      if (user) {
        const serviceSupabase = getServiceRoleClient()
        await serviceSupabase
          .from('app_users')
          .update({ mfa_enabled: true })
          .eq('id', user.id)
      }

      await logAudit({
        userId: user?.id,
        userEmail: user?.email,
        action: 'MFA_VERIFIED',
        entityType: 'session',
        changes: { new: { factorId, setup: true } },
        ipAddress: ip,
        userAgent
      })

      return NextResponse.json({ success: true })
    }
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
