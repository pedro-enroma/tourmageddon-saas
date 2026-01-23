import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const seller = searchParams.get('seller')
  const sellers = searchParams.get('sellers')?.split(',') // Multiple sellers
  const startDate = searchParams.get('start_date') || '2026-01-01'
  const filterByTravelDate = searchParams.get('filter_by') === 'travel' // Filter by travel date instead of creation date

  const supabase = getSupabase()

  try {
    // Get all confirmed bookings
    let query = supabase
      .from('bookings')
      .select(`
        booking_id,
        confirmation_code,
        creation_date,
        total_price,
        status,
        activity_bookings(activity_seller, status, start_date_time)
      `)
      .eq('status', 'CONFIRMED')
      .order('creation_date', { ascending: false })

    // If not filtering by travel date, filter by creation date
    if (!filterByTravelDate) {
      query = query.gte('creation_date', startDate)
    }

    // Remove default limit - fetch all bookings
    query = query.limit(10000)

    const { data: bookings, error: bookingsError } = await query

    if (bookingsError) throw bookingsError

    // Filter by seller(s) if provided
    const sellerList = sellers || (seller ? [seller] : null)
    let filteredBookings = sellerList
      ? bookings?.filter(b =>
          b.activity_bookings?.some((a: { activity_seller: string }) => sellerList.includes(a.activity_seller))
        )
      : bookings

    // If filtering by travel date, filter by start_date_time
    if (filterByTravelDate && filteredBookings) {
      filteredBookings = filteredBookings.filter(b => {
        const travelDate = b.activity_bookings?.[0]?.start_date_time
        return travelDate && travelDate >= startDate
      })
    }

    // Get existing invoices
    const { data: invoices } = await supabase
      .from('invoices')
      .select('booking_id')
      .eq('invoice_type', 'INVOICE')

    const invoicedIds = new Set(invoices?.map(i => i.booking_id) || [])

    // Get scheduled invoices
    const { data: scheduled } = await supabase
      .from('scheduled_invoices')
      .select('booking_id')
      .not('status', 'eq', 'cancelled')

    const scheduledIds = new Set(scheduled?.map(s => s.booking_id) || [])

    // Categorize bookings
    const stats = {
      total_confirmed: filteredBookings?.length || 0,
      already_invoiced: filteredBookings?.filter(b => invoicedIds.has(b.booking_id)).length || 0,
      already_scheduled: filteredBookings?.filter(b => scheduledIds.has(b.booking_id) && !invoicedIds.has(b.booking_id)).length || 0,
      pending_invoicing: filteredBookings?.filter(b => !invoicedIds.has(b.booking_id) && !scheduledIds.has(b.booking_id)).length || 0,
      seller: seller || 'all',
      start_date: startDate,
      bookings: filteredBookings?.map(b => ({
        booking_id: b.booking_id,
        confirmation_code: b.confirmation_code,
        creation_date: b.creation_date,
        total_price: b.total_price,
        travel_date: b.activity_bookings?.[0]?.start_date_time,
        is_invoiced: invoicedIds.has(b.booking_id),
        is_scheduled: scheduledIds.has(b.booking_id),
      }))
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
