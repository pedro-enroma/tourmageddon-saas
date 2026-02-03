import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

interface PlaceholderVoucher {
  id: string
  booking_number: string
  product_name: string
  placeholder_ticket_count: number
  notes: string | null
  voucher_source: string
  name_deadline_at: string | null
  deadline_status: string
}

// POST - Check for existing placeholder vouchers for a slot
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      category_id,
      visit_date,
      activity_availability_id,
      planned_availability_id
    } = body

    if (!category_id || !visit_date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Build query to find placeholder vouchers
    let query = supabase
      .from('vouchers')
      .select('id, booking_number, product_name, placeholder_ticket_count, notes, voucher_source, name_deadline_at, deadline_status')
      .eq('is_placeholder', true)
      .eq('category_id', category_id)
      .eq('visit_date', visit_date)
      .neq('deadline_status', 'resolved')

    // Match by slot - either activity_availability_id or planned_availability_id
    if (activity_availability_id) {
      query = query.eq('activity_availability_id', activity_availability_id)
    } else if (planned_availability_id) {
      query = query.eq('planned_availability_id', planned_availability_id)
    } else {
      // No slot specified - look for unlinked placeholders (both null)
      query = query.is('activity_availability_id', null).is('planned_availability_id', null)
    }

    const { data: placeholders, error } = await query

    if (error) {
      console.error('Error checking placeholders:', error)
      return NextResponse.json({ error: 'Failed to check placeholders' }, { status: 500 })
    }

    return NextResponse.json({
      hasPlaceholder: placeholders && placeholders.length > 0,
      placeholders: placeholders as PlaceholderVoucher[]
    })
  } catch (err) {
    console.error('Check placeholder error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
