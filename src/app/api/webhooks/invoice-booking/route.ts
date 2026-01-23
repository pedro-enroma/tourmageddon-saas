import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addDays, format } from 'date-fns'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface InvoiceRule {
  id: string
  name: string
  sellers: string[]
  auto_invoice_enabled: boolean
  auto_credit_note_enabled: boolean
  default_regime: string
  default_sales_type: string
  invoice_date_type: 'creation' | 'travel'
  travel_date_delay_days: number
  execution_time: string // HH:MM format
  invoice_start_date: string | null
}

interface BookingRecord {
  booking_id: number
  confirmation_code: string
  status: string
  creation_date: string
  total_price: number
  currency: string
}

interface ActivityBookingRecord {
  activity_booking_id: number
  booking_id: number
  activity_seller: string
  start_date_time: string
}

// Find the rule that applies to a seller
async function findRuleForSeller(supabase: ReturnType<typeof getSupabase>, seller: string): Promise<InvoiceRule | null> {
  const { data: rules, error } = await supabase
    .from('invoice_rules')
    .select('*')

  if (error || !rules) {
    console.error('Error fetching rules:', error)
    return null
  }

  // Find rule where seller is in the sellers array
  for (const rule of rules) {
    if (rule.sellers && rule.sellers.includes(seller)) {
      return rule as InvoiceRule
    }
  }

  return null
}

// Check if booking already has a scheduled invoice
async function hasScheduledInvoice(supabase: ReturnType<typeof getSupabase>, bookingId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('scheduled_invoices')
    .select('id')
    .eq('booking_id', bookingId)
    .not('status', 'eq', 'cancelled')
    .limit(1)

  if (error) {
    console.error('Error checking existing scheduled invoice:', error)
    return false
  }

  return data && data.length > 0
}

// This webhook is called when a booking is confirmed
// It can be triggered by:
// 1. Supabase Database Webhook on bookings table (status change to CONFIRMED)
// 2. External booking system webhook
// 3. Manual trigger
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret if configured
    const webhookSecret = request.headers.get('x-webhook-secret')
    const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET

    if (expectedSecret && webhookSecret !== expectedSecret) {
      console.error('Invalid webhook secret')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = getSupabase()

    // Handle Supabase database webhook format
    // { type: 'INSERT' | 'UPDATE', table: 'bookings', record: {...}, old_record: {...} }
    let bookingRecord: BookingRecord | null = null
    let activityBookings: ActivityBookingRecord[] = []

    if (body.type && body.record) {
      // Supabase webhook format
      const { type, record, old_record } = body

      // Only process if status changed to CONFIRMED
      if (type === 'UPDATE' && record.status === 'CONFIRMED' && old_record?.status !== 'CONFIRMED') {
        bookingRecord = record as BookingRecord
      } else if (type === 'INSERT' && record.status === 'CONFIRMED') {
        bookingRecord = record as BookingRecord
      } else {
        return NextResponse.json({ message: 'Ignored: not a confirmation event' })
      }
    } else if (body.booking_id) {
      // Direct API call format with booking_id
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('booking_id', body.booking_id)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
      }

      bookingRecord = data as BookingRecord
    } else {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400 })
    }

    if (!bookingRecord) {
      return NextResponse.json({ message: 'No booking to process' })
    }

    // Get activity bookings for this booking (to get seller and travel date)
    const { data: activityData, error: activityError } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, booking_id, activity_seller, start_date_time')
      .eq('booking_id', bookingRecord.booking_id)

    if (activityError) {
      console.error('Error fetching activity bookings:', activityError)
      return NextResponse.json({ error: 'Failed to fetch activity bookings' }, { status: 500 })
    }

    activityBookings = (activityData || []) as ActivityBookingRecord[]

    if (activityBookings.length === 0) {
      return NextResponse.json({ message: 'No activity bookings found' })
    }

    // Process each activity booking (a booking can have multiple activities with different sellers)
    const results: { seller: string; status: string; reason?: string }[] = []

    for (const activityBooking of activityBookings) {
      const seller = activityBooking.activity_seller

      if (!seller) {
        results.push({ seller: 'unknown', status: 'skipped', reason: 'No seller' })
        continue
      }

      // Find rule for this seller
      const rule = await findRuleForSeller(supabase, seller)

      if (!rule) {
        results.push({ seller, status: 'skipped', reason: 'No rule for seller' })
        continue
      }

      if (!rule.auto_invoice_enabled) {
        results.push({ seller, status: 'skipped', reason: 'Auto invoice disabled' })
        continue
      }

      // Check invoice_start_date filter
      if (rule.invoice_start_date) {
        const travelDate = new Date(activityBooking.start_date_time)
        const startDate = new Date(rule.invoice_start_date)
        if (travelDate < startDate) {
          results.push({ seller, status: 'skipped', reason: `Travel date before rule start date (${rule.invoice_start_date})` })
          continue
        }
      }

      // Check if already scheduled
      if (await hasScheduledInvoice(supabase, bookingRecord.booking_id)) {
        results.push({ seller, status: 'skipped', reason: 'Already scheduled' })
        continue
      }

      // Calculate scheduled send date based on rule
      let scheduledSendDate: Date

      if (rule.invoice_date_type === 'creation') {
        // Send immediately (today)
        scheduledSendDate = new Date()
      } else {
        // Travel date + delay
        const travelDate = new Date(activityBooking.start_date_time)
        scheduledSendDate = addDays(travelDate, rule.travel_date_delay_days)
      }

      // Create scheduled invoice entry
      const executionTime = rule.execution_time || '08:00'
      const { error: insertError } = await supabase
        .from('scheduled_invoices')
        .insert({
          booking_id: bookingRecord.booking_id,
          rule_id: rule.id,
          scheduled_send_date: format(scheduledSendDate, 'yyyy-MM-dd'),
          scheduled_send_time: executionTime,
          status: 'pending',
        })

      if (insertError) {
        console.error('Error creating scheduled invoice:', insertError)
        results.push({ seller, status: 'error', reason: insertError.message })
      } else {
        results.push({
          seller,
          status: 'scheduled',
          reason: `Scheduled for ${format(scheduledSendDate, 'yyyy-MM-dd')} (${rule.invoice_date_type})`
        })
      }
    }

    console.log('Invoice booking webhook processed:', {
      booking_id: bookingRecord.booking_id,
      confirmation_code: bookingRecord.confirmation_code,
      results
    })

    return NextResponse.json({
      success: true,
      booking_id: bookingRecord.booking_id,
      results
    })

  } catch (error) {
    console.error('Invoice booking webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET endpoint to manually process a booking
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const bookingId = searchParams.get('booking_id')

  if (!bookingId) {
    return NextResponse.json({ error: 'booking_id parameter required' }, { status: 400 })
  }

  // Forward to POST handler
  const mockRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ booking_id: parseInt(bookingId) })
  })

  return POST(mockRequest)
}
