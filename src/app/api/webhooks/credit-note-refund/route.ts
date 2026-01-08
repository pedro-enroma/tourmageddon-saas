import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || '')

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

// Process the refund and create credit note
async function processRefund(
  supabase: ReturnType<typeof getSupabase>,
  bookingId: number,
  refundAmount: number | null,
  currency: string
) {
  // Get booking details
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('booking_id, confirmation_code, total_price, currency')
    .eq('booking_id', bookingId)
    .single()

  if (bookingError || !booking) {
    return { error: 'Booking not found', status: 404 }
  }

  // Check if credit note already exists
  if (await hasCreditNote(supabase, bookingId)) {
    return { message: 'Credit note already exists for this booking' }
  }

  // Check if there's an existing invoice for this booking
  const existingInvoice = await getExistingInvoice(supabase, bookingId)
  if (!existingInvoice) {
    return { message: 'No invoice exists for this booking - credit note not needed' }
  }

  // Get activity bookings to find the seller
  const { data: activityData, error: activityError } = await supabase
    .from('activity_bookings')
    .select('activity_seller')
    .eq('booking_id', bookingId)

  if (activityError) {
    console.error('Error fetching activity bookings:', activityError)
    return { error: 'Failed to fetch activity bookings', status: 500 }
  }

  const seller = activityData?.[0]?.activity_seller

  if (!seller) {
    return { message: 'No seller found for booking' }
  }

  // Find rule for this seller
  const rule = await findRuleForSeller(supabase, seller)

  if (!rule) {
    return { message: 'No rule configured for seller', seller }
  }

  // Check if auto credit note is enabled and trigger is 'refund'
  if (!rule.auto_credit_note_enabled) {
    return { message: 'Auto credit note is disabled for this rule', rule_name: rule.name }
  }

  if (rule.credit_note_trigger !== 'refund') {
    return {
      message: 'Rule is configured for cancellation trigger, not refund',
      rule_name: rule.name,
      trigger: rule.credit_note_trigger
    }
  }

  // Use refund amount if provided, otherwise use full booking amount
  const creditNoteAmount = refundAmount ?? booking.total_price

  // Create credit note entry (no API call yet - just record in database)
  const { error: insertError } = await supabase
    .from('invoices')
    .insert({
      booking_id: booking.booking_id,
      confirmation_code: booking.confirmation_code,
      invoice_type: 'CREDIT_NOTE',
      status: 'pending',
      total_amount: creditNoteAmount,
      currency: currency || booking.currency || 'EUR',
      customer_name: existingInvoice.customer_name,
      customer_email: existingInvoice.customer_email,
      seller_name: seller,
      booking_creation_date: existingInvoice.booking_creation_date,
      notes: `Credit note for Stripe refund. Original invoice ID: ${existingInvoice.id}. Refund amount: ${creditNoteAmount}`
    })

  if (insertError) {
    console.error('Error creating credit note:', insertError)
    return { error: 'Failed to create credit note', details: insertError.message, status: 500 }
  }

  console.log('Credit note created for Stripe refund:', {
    booking_id: booking.booking_id,
    confirmation_code: booking.confirmation_code,
    seller,
    rule_name: rule.name,
    refund_amount: creditNoteAmount
  })

  return {
    success: true,
    message: 'Credit note created for refunded booking',
    booking_id: booking.booking_id,
    confirmation_code: booking.confirmation_code,
    seller,
    rule_name: rule.name,
    refund_amount: creditNoteAmount
  }
}

// This webhook is called when a Stripe refund is processed
// Configure in Stripe Dashboard: https://dashboard.stripe.com/webhooks
// Event to listen for: charge.refunded
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.text()
    const sig = request.headers.get('stripe-signature')
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

    let event: Stripe.Event | null = null
    let bookingId: number | null = null
    let refundAmount: number | null = null
    let currency = 'EUR'

    // If we have a Stripe signature and secret, verify it
    if (sig && endpointSecret) {
      try {
        event = getStripe().webhooks.constructEvent(body, sig, endpointSecret)
      } catch (err) {
        const error = err as Error
        console.error('Stripe signature verification failed:', error.message)
        return NextResponse.json({ error: `Webhook signature verification failed: ${error.message}` }, { status: 400 })
      }
    } else {
      // Parse body as JSON for manual testing (no signature verification)
      try {
        const jsonBody = JSON.parse(body)

        // Check if it's a Stripe-like event or direct API call
        if (jsonBody.type === 'charge.refunded') {
          event = jsonBody as Stripe.Event
        } else if (jsonBody.booking_id || jsonBody.confirmation_code) {
          // Direct API call format
          bookingId = jsonBody.booking_id
          refundAmount = jsonBody.refund_amount

          if (!bookingId && jsonBody.confirmation_code) {
            const { data: booking } = await supabase
              .from('bookings')
              .select('booking_id')
              .eq('confirmation_code', jsonBody.confirmation_code)
              .single()

            if (booking) {
              bookingId = booking.booking_id
            }
          }

          if (!bookingId) {
            return NextResponse.json({ error: 'Could not determine booking ID' }, { status: 400 })
          }

          const result = await processRefund(supabase, bookingId, refundAmount, currency)
          if (result.error) {
            return NextResponse.json({ error: result.error }, { status: result.status || 500 })
          }
          return NextResponse.json(result)
        } else {
          return NextResponse.json({ error: 'Invalid request format' }, { status: 400 })
        }
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      }
    }

    // Handle Stripe event
    if (event) {
      if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge

        // Get booking reference from Stripe metadata
        // You should set metadata.booking_id or metadata.confirmation_code when creating the payment
        const metadata = charge.metadata || {}

        if (metadata.booking_id) {
          bookingId = parseInt(metadata.booking_id)
        } else if (metadata.confirmation_code) {
          const { data: booking } = await supabase
            .from('bookings')
            .select('booking_id')
            .eq('confirmation_code', metadata.confirmation_code)
            .single()

          if (booking) {
            bookingId = booking.booking_id
          }
        }

        if (!bookingId) {
          console.log('No booking reference found in Stripe charge metadata:', charge.id)
          return NextResponse.json({
            message: 'No booking reference found in charge metadata',
            charge_id: charge.id
          })
        }

        // Get refund amount (Stripe amounts are in cents)
        if (charge.amount_refunded) {
          refundAmount = charge.amount_refunded / 100
        }
        if (charge.currency) {
          currency = charge.currency.toUpperCase()
        }

        const result = await processRefund(supabase, bookingId, refundAmount, currency)
        if (result.error) {
          return NextResponse.json({ error: result.error }, { status: result.status || 500 })
        }
        return NextResponse.json(result)
      } else {
        // Ignore other event types
        return NextResponse.json({ message: `Ignored event type: ${event.type}` })
      }
    }

    return NextResponse.json({ error: 'No event to process' }, { status: 400 })

  } catch (error) {
    console.error('Credit note refund webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET endpoint to manually trigger for a booking (useful for testing)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const bookingId = searchParams.get('booking_id')
  const confirmationCode = searchParams.get('confirmation_code')
  const refundAmount = searchParams.get('refund_amount')

  if (!bookingId && !confirmationCode) {
    return NextResponse.json({ error: 'booking_id or confirmation_code parameter required' }, { status: 400 })
  }

  // Forward to POST handler
  const mockRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({
      ...(bookingId ? { booking_id: parseInt(bookingId) } : {}),
      ...(confirmationCode ? { confirmation_code: confirmationCode } : {}),
      ...(refundAmount ? { refund_amount: parseFloat(refundAmount) } : {}),
    })
  })

  return POST(mockRequest)
}
