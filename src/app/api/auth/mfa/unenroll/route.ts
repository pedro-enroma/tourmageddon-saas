import { NextRequest, NextResponse } from 'next/server'
import { getServerClient, getServiceRoleClient } from '@/lib/supabase-server'
import { logAudit, getRequestContext } from '@/lib/audit-logger'

// POST - Unenroll from MFA (remove factor)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { factorId } = body

    if (!factorId) {
      return NextResponse.json({ error: 'factorId is required' }, { status: 400 })
    }

    const supabase = await getServerClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Unenroll the factor
    const { error } = await supabase.auth.mfa.unenroll({
      factorId
    })

    if (error) {
      console.error('Error unenrolling from MFA:', error)
      return NextResponse.json({ error: 'Failed to remove MFA' }, { status: 500 })
    }

    // Update app_users to mark MFA as disabled
    const serviceSupabase = getServiceRoleClient()
    await serviceSupabase
      .from('app_users')
      .update({ mfa_enabled: false })
      .eq('id', user.id)

    // Log the removal
    const { ip, userAgent } = getRequestContext(request)
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'MFA_REMOVED',
      entityType: 'session',
      changes: { old: { factorId, mfa_enabled: true }, new: { mfa_enabled: false } },
      ipAddress: ip,
      userAgent
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
