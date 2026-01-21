import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { evaluateRules } from '@/lib/notification-rules-engine'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface InvoiceRule {
  id: string
  name: string
  sellers: string[]
  auto_credit_note_enabled: boolean
  credit_note_trigger: 'cancellation' | 'refund'
}

interface BookingRecord {
  booking_id: number
  confirmation_code: string
  status: string
  total_price: number
  currency: string
}

interface ActivityBookingRecord {
  activity_booking_id: number
  booking_id: number
  activity_seller: string
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

  for (const rule of rules) {
    if (rule.sellers && rule.sellers.includes(seller)) {
      return rule as InvoiceRule
    }
  }

  return null
}

// Check if booking has an existing invoice
async function getExistingInvoice(supabase: ReturnType<typeof getSupabase>, bookingId: number) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('invoice_type', 'INVOICE')
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('Error checking existing invoice:', error)
  }

  return data
}

// Check if credit note already exists for this booking
async function hasCreditNote(supabase: ReturnType<typeof getSupabase>, bookingId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('invoice_type', 'CREDIT_NOTE')
    .limit(1)

  if (error) {
    console.error('Error checking existing credit note:', error)
    return false
  }

  return data && data.length > 0
}

// Check if booking has vouchers with uploaded names
async function getVoucherInfo(supabase: ReturnType<typeof getSupabase>, bookingId: number): Promise<{ hasVouchers: boolean; voucherCount: number }> {
  // Get activity bookings for this booking
  const { data: activityBookings } = await supabase
    .from('activity_bookings')
    .select('activity_booking_id')
    .eq('booking_id', bookingId)

  if (!activityBookings || activityBookings.length === 0) {
    return { hasVouchers: false, voucherCount: 0 }
  }

  const activityBookingIds = activityBookings.map(ab => ab.activity_booking_id)

  // Check for vouchers linked to these activity bookings (non-placeholder vouchers have names)
  const { data: vouchers, error } = await supabase
    .from('vouchers')
    .select('id, is_placeholder')
    .in('activity_booking_id', activityBookingIds)

  if (error) {
    console.error('Error checking vouchers:', error)
    return { hasVouchers: false, voucherCount: 0 }
  }

  // Count vouchers that have names (not placeholders or placeholders that have been filled)
  const vouchersWithNames = vouchers?.filter(v => !v.is_placeholder) || []

  return {
    hasVouchers: vouchersWithNames.length > 0,
    voucherCount: vouchersWithNames.length
  }
}

// This webhook is called when a booking is cancelled
// It can be triggered by:
// 1. Supabase Database Webhook on bookings table (status change to CANCELLED)
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
    let bookingRecord: BookingRecord | null = null

    if (body.type && body.record) {
      // Supabase webhook format
      const { type, record, old_record } = body

      // Only process if status changed to CANCELLED
      if (type === 'UPDATE' && record.status === 'CANCELLED' && old_record?.status !== 'CANCELLED') {
        bookingRecord = record as BookingRecord
      } else {
        return NextResponse.json({ message: 'Ignored: not a cancellation event' })
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

      if (data.status !== 'CANCELLED') {
        return NextResponse.json({ message: 'Booking is not cancelled' })
      }

      bookingRecord = data as BookingRecord
    } else {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400 })
    }

    if (!bookingRecord) {
      return NextResponse.json({ message: 'No booking to process' })
    }

    // Evaluate notification rules for booking cancellation
    try {
      const voucherInfo = await getVoucherInfo(supabase, bookingRecord.booking_id)

      // Get product info and customer info for the booking
      const { data: activityBookingData } = await supabase
        .from('activity_bookings')
        .select(`
          product_title,
          start_date_time,
          bookings (
            confirmation_code,
            total_price,
            currency,
            customers (
              first_name,
              last_name,
              email
            )
          ),
          pricing_category_bookings (
            quantity
          )
        `)
        .eq('booking_id', bookingRecord.booking_id)
        .limit(1)
        .single()

      const productName = activityBookingData?.product_title || 'Unknown'
      const travelDate = activityBookingData?.start_date_time ? new Date(activityBookingData.start_date_time) : null
      const daysUntilTravel = travelDate ? Math.ceil((travelDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0

      // Extract customer info
      const bookingInfo = activityBookingData?.bookings as { confirmation_code?: string; total_price?: number; currency?: string; customers?: { first_name?: string; last_name?: string; email?: string } } | null
      const customer = bookingInfo?.customers
      const customerName = customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : 'Unknown'
      const customerEmail = customer?.email || ''

      // Calculate pax count from pricing category bookings
      const pricingBookings = activityBookingData?.pricing_category_bookings as { quantity: number }[] | null
      const paxCount = pricingBookings?.reduce((sum, pb) => sum + (pb.quantity || 0), 0) || 0

      await evaluateRules({
        trigger: 'booking_cancelled',
        data: {
          activity_name: productName,
          product_name: productName,
          booking_id: bookingRecord.booking_id,
          confirmation_code: bookingInfo?.confirmation_code || bookingRecord.confirmation_code,
          customer_name: customerName,
          customer_email: customerEmail,
          pax_count: paxCount,
          ticket_count: paxCount,
          travel_date: travelDate ? travelDate.toISOString().split('T')[0] : '',
          days_until_travel: daysUntilTravel,
          has_uploaded_vouchers: voucherInfo.hasVouchers,
          voucher_count: voucherInfo.voucherCount,
          total_price: bookingInfo?.total_price || bookingRecord.total_price || 0,
          currency: bookingInfo?.currency || bookingRecord.currency || 'EUR',
        }
      })
    } catch (rulesError) {
      console.error('Rules evaluation failed for booking cancellation:', rulesError)
      // Don't fail the webhook if rules evaluation fails
    }

    // Check if credit note already exists
    if (await hasCreditNote(supabase, bookingRecord.booking_id)) {
      return NextResponse.json({ message: 'Credit note already exists for this booking' })
    }

    // Check if there's an existing invoice for this booking
    const existingInvoice = await getExistingInvoice(supabase, bookingRecord.booking_id)
    if (!existingInvoice) {
      return NextResponse.json({ message: 'No invoice exists for this booking - credit note not needed' })
    }

    // Get activity bookings to find the seller
    const { data: activityData, error: activityError } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, booking_id, activity_seller')
      .eq('booking_id', bookingRecord.booking_id)

    if (activityError) {
      console.error('Error fetching activity bookings:', activityError)
      return NextResponse.json({ error: 'Failed to fetch activity bookings' }, { status: 500 })
    }

    const activityBookings = (activityData || []) as ActivityBookingRecord[]

    if (activityBookings.length === 0) {
      return NextResponse.json({ message: 'No activity bookings found' })
    }

    // Process to find seller and check rule
    const seller = activityBookings[0]?.activity_seller

    if (!seller) {
      return NextResponse.json({ message: 'No seller found for booking' })
    }

    // Find rule for this seller
    const rule = await findRuleForSeller(supabase, seller)

    if (!rule) {
      return NextResponse.json({
        message: 'No rule configured for seller',
        seller
      })
    }

    // Check if auto credit note is enabled and trigger is 'cancellation'
    if (!rule.auto_credit_note_enabled) {
      return NextResponse.json({
        message: 'Auto credit note is disabled for this rule',
        rule_name: rule.name
      })
    }

    if (rule.credit_note_trigger !== 'cancellation') {
      return NextResponse.json({
        message: 'Rule is configured for refund trigger, not cancellation',
        rule_name: rule.name,
        trigger: rule.credit_note_trigger
      })
    }

    // Create credit note entry (no API call yet - just record in database)
    const { error: insertError } = await supabase
      .from('invoices')
      .insert({
        booking_id: bookingRecord.booking_id,
        confirmation_code: bookingRecord.confirmation_code,
        invoice_type: 'CREDIT_NOTE',
        status: 'pending',
        total_amount: bookingRecord.total_price,
        currency: bookingRecord.currency || 'EUR',
        customer_name: existingInvoice.customer_name,
        customer_email: existingInvoice.customer_email,
        seller_name: seller,
        booking_creation_date: existingInvoice.booking_creation_date,
        // Reference to original invoice
        notes: `Credit note for cancelled booking. Original invoice ID: ${existingInvoice.id}`
      })

    if (insertError) {
      console.error('Error creating credit note:', insertError)
      return NextResponse.json({ error: 'Failed to create credit note', details: insertError.message }, { status: 500 })
    }

    console.log('Credit note created for cancellation:', {
      booking_id: bookingRecord.booking_id,
      confirmation_code: bookingRecord.confirmation_code,
      seller,
      rule_name: rule.name
    })

    return NextResponse.json({
      success: true,
      message: 'Credit note created for cancelled booking',
      booking_id: bookingRecord.booking_id,
      confirmation_code: bookingRecord.confirmation_code,
      seller,
      rule_name: rule.name
    })

  } catch (error) {
    console.error('Credit note cancellation webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET endpoint to manually trigger for a booking
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
