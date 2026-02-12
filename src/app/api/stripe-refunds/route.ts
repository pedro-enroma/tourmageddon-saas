import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getServiceRoleClient()

    // Fetch refunds (no FK to bookings, so no nested join)
    const { data: refundsData, error } = await supabase
      .from('stripe_refunds')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching stripe refunds:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to fetch refunds' },
        { status: 500 }
      )
    }

    // Collect unique booking_ids to look up customer names
    const bookingIds = [
      ...new Set(
        (refundsData || [])
          .map((r) => r.booking_id)
          .filter(Boolean)
      ),
    ]

    const customerMap: Record<string, string> = {}

    if (bookingIds.length > 0) {
      const { data: bookingCustomers } = await supabase
        .from('booking_customers')
        .select('booking_id, customers(first_name, last_name)')
        .in('booking_id', bookingIds)

      if (bookingCustomers) {
        for (const bc of bookingCustomers) {
          const customers = bc.customers as unknown as { first_name: string; last_name: string }[] | null
          const c = customers?.[0] ?? null
          if (c && bc.booking_id) {
            customerMap[bc.booking_id] = `${c.first_name} ${c.last_name}`
          }
        }
      }
    }

    const refunds = (refundsData || []).map((row) => ({
      ...row,
      customer_name: row.booking_id ? customerMap[row.booking_id] || null : null,
    }))

    return NextResponse.json({ refunds })
  } catch (error) {
    console.error('Error fetching stripe refunds:', error)
    return NextResponse.json(
      { error: 'Failed to fetch refunds' },
      { status: 500 }
    )
  }
}
