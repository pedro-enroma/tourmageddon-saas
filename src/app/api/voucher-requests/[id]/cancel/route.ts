import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditUpdate } from '@/lib/audit-logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { reason } = body

    const supabase = getServiceRoleClient()

    // Fetch the voucher request
    const { data: voucherRequest, error: fetchError } = await supabase
      .from('voucher_requests')
      .select(`
        *,
        partners (partner_id, name, email),
        ticket_categories (id, name)
      `)
      .eq('id', id)
      .single()

    if (fetchError || !voucherRequest) {
      return NextResponse.json({ error: 'Voucher request not found' }, { status: 404 })
    }

    // Validate status - can only cancel draft or sent requests
    if (voucherRequest.status === 'fulfilled') {
      return NextResponse.json({
        error: 'Cannot cancel a fulfilled request'
      }, { status: 400 })
    }

    if (voucherRequest.status === 'cancelled') {
      return NextResponse.json({
        error: 'Request is already cancelled'
      }, { status: 400 })
    }

    // Update voucher request status
    const { data: updatedRequest, error: updateError } = await supabase
      .from('voucher_requests')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || null
      })
      .eq('id', id)
      .select(`
        *,
        partners (partner_id, name, email),
        ticket_categories (id, name)
      `)
      .single()

    if (updateError) {
      console.error('Error updating voucher request status:', updateError)
      return NextResponse.json({ error: 'Failed to update voucher request' }, { status: 500 })
    }

    // Audit log
    await auditUpdate(request, user, 'voucher_request', id, voucherRequest, updatedRequest)

    return NextResponse.json({
      success: true,
      message: 'Voucher request cancelled',
      data: updatedRequest
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
