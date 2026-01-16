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
    const { voucher_ids } = body

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

    // Validate status - can only fulfill sent requests
    if (voucherRequest.status !== 'sent') {
      return NextResponse.json({
        error: `Cannot fulfill request. Current status is '${voucherRequest.status}'. Only sent requests can be fulfilled.`
      }, { status: 400 })
    }

    // Validate voucher_ids if provided
    if (voucher_ids && voucher_ids.length > 0) {
      // Verify vouchers exist
      const { data: vouchers, error: vouchersError } = await supabase
        .from('vouchers')
        .select('id')
        .in('id', voucher_ids)

      if (vouchersError) {
        return NextResponse.json({ error: 'Failed to verify vouchers' }, { status: 500 })
      }

      if (vouchers.length !== voucher_ids.length) {
        return NextResponse.json({
          error: 'Some voucher IDs are invalid',
          validCount: vouchers.length,
          requestedCount: voucher_ids.length
        }, { status: 400 })
      }
    }

    // Update voucher request status
    const { data: updatedRequest, error: updateError } = await supabase
      .from('voucher_requests')
      .update({
        status: 'fulfilled',
        fulfilled_at: new Date().toISOString(),
        fulfilled_voucher_ids: voucher_ids || []
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
      message: 'Voucher request marked as fulfilled',
      data: updatedRequest
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
