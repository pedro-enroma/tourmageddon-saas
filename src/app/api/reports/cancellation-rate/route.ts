import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const dateType = searchParams.get('date_type') || 'travel' // 'travel' or 'booking'

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const dateField = dateType === 'booking' ? 'created_at' : 'start_date_time'
    const startDateTime = `${startDate}T00:00:00`
    const endDateTime = `${endDate}T23:59:59`

    // Fetch all bookings with pagination
    type BookingRecord = {
      activity_booking_id: number
      booking_id: number
      activity_id: string | null
      start_date_time: string
      created_at: string
      status: string
      total_price: number | null
      product_title: string | null
      activities: { activity_id: string; title: string } | null
      pricing_category_bookings: { pricing_category_booking_id: number }[] | null
    }

    const PAGE_SIZE = 1000
    let allBookings: BookingRecord[] = []
    let page = 0
    let hasMore = true

    while (hasMore) {
      const { data: bookingsPage, error } = await supabase
        .from('activity_bookings')
        .select(`
          activity_booking_id,
          booking_id,
          activity_id,
          start_date_time,
          created_at,
          status,
          total_price,
          product_title,
          activities (
            activity_id,
            title
          ),
          pricing_category_bookings (
            pricing_category_booking_id
          )
        `)
        .gte(dateField, startDateTime)
        .lte(dateField, endDateTime)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        .order('activity_booking_id', { ascending: true })

      if (error) {
        console.error('Error fetching bookings:', error)
        return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
      }

      if (bookingsPage && bookingsPage.length > 0) {
        allBookings = [...allBookings, ...bookingsPage]
        hasMore = bookingsPage.length === PAGE_SIZE
        page++
      } else {
        hasMore = false
      }
    }

    // Process data
    const byDate = new Map<string, { date: string; confirmed: number; cancelled: number; total: number; cancelled_pax: number; confirmed_pax: number; cancelled_revenue: number }>()
    const byTour = new Map<string, { activity_id: string; title: string; confirmed: number; cancelled: number; total: number; cancellation_rate: number; cancelled_revenue: number }>()
    const byMonth = new Map<string, { month: string; month_label: string; confirmed: number; cancelled: number; total: number; cancellation_rate: number; cancelled_pax: number; confirmed_pax: number; cancelled_revenue: number }>()

    // Totals
    let totalConfirmed = 0
    let totalCancelled = 0
    let totalCancelledPax = 0
    let totalConfirmedPax = 0
    let totalCancelledRevenue = 0

    allBookings.forEach(booking => {
      const date = dateType === 'booking'
        ? new Date(booking.created_at).toISOString().split('T')[0]
        : new Date(booking.start_date_time).toISOString().split('T')[0]

      const monthKey = date.substring(0, 7) // YYYY-MM
      const monthDate = new Date(monthKey + '-01')
      const monthLabel = monthDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

      const activityId = booking.activity_id || 'unknown'
      const activityData = booking.activities as { activity_id: string; title: string } | null
      const activityTitle = activityData?.title || booking.product_title || 'Unknown Tour'

      const pricingBookings = booking.pricing_category_bookings as { pricing_category_booking_id: number }[] | null
      const pax = pricingBookings?.length || 0
      const revenue = Number(booking.total_price) || 0

      const isCancelled = booking.status === 'CANCELLED'

      // Update totals (count each activity_booking)
      if (isCancelled) {
        totalCancelled++
        totalCancelledPax += pax
        totalCancelledRevenue += revenue
      } else if (booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
        totalConfirmed++
        totalConfirmedPax += pax
      }

      // By Date
      const dateStats = byDate.get(date) || { date, confirmed: 0, cancelled: 0, total: 0, cancelled_pax: 0, confirmed_pax: 0, cancelled_revenue: 0 }
      if (isCancelled) {
        dateStats.cancelled++
        dateStats.cancelled_pax += pax
        dateStats.cancelled_revenue += revenue
      } else if (booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
        dateStats.confirmed++
        dateStats.confirmed_pax += pax
      }
      dateStats.total = dateStats.confirmed + dateStats.cancelled
      byDate.set(date, dateStats)

      // By Month
      const monthStats = byMonth.get(monthKey) || { month: monthKey, month_label: monthLabel, confirmed: 0, cancelled: 0, total: 0, cancellation_rate: 0, cancelled_pax: 0, confirmed_pax: 0, cancelled_revenue: 0 }
      if (isCancelled) {
        monthStats.cancelled++
        monthStats.cancelled_pax += pax
        monthStats.cancelled_revenue += revenue
      } else if (booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
        monthStats.confirmed++
        monthStats.confirmed_pax += pax
      }
      monthStats.total = monthStats.confirmed + monthStats.cancelled
      monthStats.cancellation_rate = monthStats.total > 0 ? (monthStats.cancelled / monthStats.total) * 100 : 0
      byMonth.set(monthKey, monthStats)

      // By Tour
      const tourStats = byTour.get(activityId) || { activity_id: activityId, title: activityTitle, confirmed: 0, cancelled: 0, total: 0, cancellation_rate: 0, cancelled_revenue: 0 }
      if (isCancelled) {
        tourStats.cancelled++
        tourStats.cancelled_revenue += revenue
      } else if (booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
        tourStats.confirmed++
      }
      tourStats.total = tourStats.confirmed + tourStats.cancelled
      tourStats.cancellation_rate = tourStats.total > 0 ? (tourStats.cancelled / tourStats.total) * 100 : 0
      byTour.set(activityId, tourStats)
    })

    // Convert to sorted arrays
    const dateData = Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))

    const monthData = Array.from(byMonth.values())
      .sort((a, b) => a.month.localeCompare(b.month))

    const tourData = Array.from(byTour.values())
      .filter(t => t.total >= 5) // Only show tours with at least 5 bookings
      .sort((a, b) => b.cancellation_rate - a.cancellation_rate)

    const totalBookings = totalConfirmed + totalCancelled
    const overallCancellationRate = totalBookings > 0 ? (totalCancelled / totalBookings) * 100 : 0

    return NextResponse.json({
      summary: {
        total_bookings: totalBookings,
        total_confirmed: totalConfirmed,
        total_cancelled: totalCancelled,
        cancellation_rate: overallCancellationRate,
        cancelled_pax: totalCancelledPax,
        confirmed_pax: totalConfirmedPax,
        cancelled_revenue: totalCancelledRevenue
      },
      by_date: dateData,
      by_month: monthData,
      by_tour: tourData
    })
  } catch (err) {
    console.error('Cancellation rate error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
