import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - Query commission summary
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const seller = searchParams.get('seller')

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Try to query from the view first
    let query = supabase
      .from('v_seller_commission_summary')
      .select('*')
      .gte('activity_date', startDate)
      .lte('activity_date', endDate)

    if (seller) {
      query = query.eq('seller_name', seller)
    }

    const { data: viewData, error: viewError } = await query

    if (!viewError && viewData) {
      return NextResponse.json({ data: viewData })
    }

    // Fallback: aggregate from activity_bookings directly if view doesn't exist
    console.log('View query failed, falling back to direct aggregation:', viewError)

    const { data: bookings, error: bookingsError } = await supabase
      .from('activity_bookings')
      .select('activity_seller, start_date_time, total_price, net_price, tourmageddon_seller_commission_amount')
      .gte('start_date_time', `${startDate}T00:00:00`)
      .lte('start_date_time', `${endDate}T23:59:59`)
      .in('status', ['CONFIRMED', 'COMPLETED'])
      .not('activity_seller', 'is', null)

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError)
      return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
    }

    // Aggregate by seller
    const aggregated = new Map<string, {
      seller_name: string
      booking_count: number
      total_revenue: number
      total_commission: number
    }>()

    bookings?.forEach(booking => {
      const sellerName = booking.activity_seller
      if (seller && sellerName !== seller) return

      const stats = aggregated.get(sellerName) || {
        seller_name: sellerName,
        booking_count: 0,
        total_revenue: 0,
        total_commission: 0
      }

      stats.booking_count++
      stats.total_revenue += Number(booking.total_price) || Number(booking.net_price) || 0
      stats.total_commission += Number(booking.tourmageddon_seller_commission_amount) || 0

      aggregated.set(sellerName, stats)
    })

    const data = Array.from(aggregated.values()).sort((a, b) =>
      b.total_revenue - a.total_revenue
    )

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
