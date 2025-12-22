import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// POST - Assign vouchers to a split
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { split_id, voucher_ids } = body

    if (!split_id) {
      return NextResponse.json({ error: 'split_id is required' }, { status: 400 })
    }

    if (!voucher_ids || !Array.isArray(voucher_ids) || voucher_ids.length === 0) {
      return NextResponse.json({ error: 'voucher_ids array is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Verify the split exists and get its availability_id
    const { data: split, error: splitError } = await supabase
      .from('time_slot_splits')
      .select('id, activity_availability_id')
      .eq('id', split_id)
      .single()

    if (splitError || !split) {
      return NextResponse.json({ error: 'Split not found' }, { status: 404 })
    }

    // Validate that all vouchers belong to this time slot
    const { data: vouchers, error: vouchersError } = await supabase
      .from('vouchers')
      .select('id, activity_availability_id')
      .in('id', voucher_ids)

    if (vouchersError) {
      console.error('Error fetching vouchers:', vouchersError)
      return NextResponse.json({ error: 'Failed to validate vouchers' }, { status: 500 })
    }

    // Check each voucher belongs to the correct time slot
    const invalidVouchers = vouchers?.filter(
      (v: { activity_availability_id: number | null }) =>
        v.activity_availability_id !== split.activity_availability_id
    ) || []

    if (invalidVouchers.length > 0) {
      return NextResponse.json({
        error: 'Some vouchers do not belong to this time slot',
        invalid_voucher_ids: invalidVouchers.map((v: { id: string }) => v.id)
      }, { status: 400 })
    }

    // Remove any existing assignments for these vouchers (move from other splits)
    const { error: deleteError } = await supabase
      .from('time_slot_split_vouchers')
      .delete()
      .in('voucher_id', voucher_ids)

    if (deleteError) {
      console.error('Error removing existing assignments:', deleteError)
      return NextResponse.json({ error: 'Failed to update assignments' }, { status: 500 })
    }

    // Insert new assignments
    const inserts = voucher_ids.map((voucher_id: string) => ({
      split_id,
      voucher_id
    }))

    const { data, error } = await supabase
      .from('time_slot_split_vouchers')
      .insert(inserts)
      .select()

    if (error) {
      console.error('Error assigning vouchers:', error)
      return NextResponse.json({ error: 'Failed to assign vouchers' }, { status: 500 })
    }

    return NextResponse.json({ data, count: data?.length || 0 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Remove vouchers from a split (return to unsplit pool)
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { voucher_ids } = body

    if (!voucher_ids || !Array.isArray(voucher_ids) || voucher_ids.length === 0) {
      return NextResponse.json({ error: 'voucher_ids array is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { error } = await supabase
      .from('time_slot_split_vouchers')
      .delete()
      .in('voucher_id', voucher_ids)

    if (error) {
      console.error('Error removing vouchers:', error)
      return NextResponse.json({ error: 'Failed to remove vouchers' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
