import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const searchParams = request.nextUrl.searchParams
  const checkTravelDates = searchParams.get('check_travel') === 'true'

  try {
    // Get all scheduled invoices grouped by status
    const { data: scheduled, error } = await supabase
      .from('scheduled_invoices')
      .select('*')
      .order('scheduled_send_date', { ascending: true })

    if (error) throw error

    // Group by status
    const byStatus = {
      pending: scheduled?.filter(s => s.status === 'pending') || [],
      sent: scheduled?.filter(s => s.status === 'sent') || [],
      failed: scheduled?.filter(s => s.status === 'failed') || [],
      cancelled: scheduled?.filter(s => s.status === 'cancelled') || [],
    }

    // Get earliest and latest scheduled dates for pending
    const pendingDates = byStatus.pending.map(s => s.scheduled_send_date).sort()

    // Check for bookings with travel dates in early January
    let earlyJanBookings: unknown[] = []
    let earlyJanConfirmed: unknown[] = []
    if (checkTravelDates) {
      // Get activity bookings with early Jan travel dates
      const { data: activities } = await supabase
        .from('activity_bookings')
        .select('booking_id, start_date_time, activity_seller')
        .gte('start_date_time', '2026-01-01')
        .lt('start_date_time', '2026-01-11')
        .order('start_date_time', { ascending: true })

      earlyJanBookings = activities || []

      // Check which of those have CONFIRMED booking status
      if (activities && activities.length > 0) {
        const bookingIds = [...new Set(activities.map(a => a.booking_id))]
        const { data: confirmedBookings } = await supabase
          .from('bookings')
          .select('booking_id, status, confirmation_code')
          .in('booking_id', bookingIds)
          .eq('status', 'CONFIRMED')

        earlyJanConfirmed = confirmedBookings || []
      }
    }

    return NextResponse.json({
      total: scheduled?.length || 0,
      by_status: {
        pending: byStatus.pending.length,
        sent: byStatus.sent.length,
        failed: byStatus.failed.length,
        cancelled: byStatus.cancelled.length,
      },
      pending_date_range: {
        earliest: pendingDates[0] || null,
        latest: pendingDates[pendingDates.length - 1] || null,
      },
      earliest_pending: byStatus.pending.slice(0, 5).map(s => ({
        booking_id: s.booking_id,
        scheduled_send_date: s.scheduled_send_date,
        status: s.status,
      })),
      early_jan_activity_count: earlyJanBookings.length,
      early_jan_confirmed_count: earlyJanConfirmed.length,
      early_jan_confirmed: earlyJanConfirmed,
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
