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

// Process all confirmed bookings against invoice rules
// This creates scheduled_invoices entries for bookings that match rules
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dry_run === true

    // Get all invoice rules
    const { data: rules, error: rulesError } = await supabase
      .from('invoice_rules')
      .select('*')

    if (rulesError) {
      return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 })
    }

    if (!rules || rules.length === 0) {
      return NextResponse.json({ message: 'No rules configured', processed: 0 })
    }

    // Build a map of seller -> rule
    const sellerRuleMap = new Map<string, InvoiceRule>()
    for (const rule of rules) {
      if (rule.auto_invoice_enabled && rule.sellers) {
        for (const seller of rule.sellers) {
          sellerRuleMap.set(seller, rule as InvoiceRule)
        }
      }
    }

    if (sellerRuleMap.size === 0) {
      return NextResponse.json({ message: 'No sellers with auto-invoice enabled', processed: 0 })
    }

    // Get all confirmed bookings with their activity bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        booking_id,
        confirmation_code,
        status,
        creation_date,
        total_price,
        currency,
        activity_bookings(
          activity_booking_id,
          activity_seller,
          start_date_time
        )
      `)
      .eq('status', 'CONFIRMED')
      .order('creation_date', { ascending: false })

    if (bookingsError) {
      return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
    }

    // Get existing scheduled invoices to avoid duplicates
    const { data: existingScheduled } = await supabase
      .from('scheduled_invoices')
      .select('booking_id')
      .not('status', 'eq', 'cancelled')

    const alreadyScheduledIds = new Set(existingScheduled?.map(s => s.booking_id) || [])

    // Get existing invoices to avoid duplicates
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('booking_id')
      .eq('invoice_type', 'INVOICE')

    const alreadyInvoicedIds = new Set(existingInvoices?.map(i => i.booking_id) || [])

    // Process bookings
    const results: {
      booking_id: number
      confirmation_code: string
      seller: string
      action: string
      scheduled_date?: string
      scheduled_time?: string
      reason?: string
    }[] = []

    const toInsert: {
      booking_id: number
      rule_id: string
      scheduled_send_date: string
      scheduled_send_time: string
      status: string
    }[] = []

    for (const booking of bookings || []) {
      // Skip if already scheduled or invoiced
      if (alreadyScheduledIds.has(booking.booking_id)) {
        continue
      }
      if (alreadyInvoicedIds.has(booking.booking_id)) {
        continue
      }

      const activityBookings = booking.activity_bookings as {
        activity_booking_id: number
        activity_seller: string
        start_date_time: string
      }[]

      if (!activityBookings || activityBookings.length === 0) {
        continue
      }

      // Use first activity booking's seller and travel date
      const activityBooking = activityBookings[0]
      const seller = activityBooking.activity_seller

      if (!seller) {
        continue
      }

      // Check if seller has a rule
      const rule = sellerRuleMap.get(seller)
      if (!rule) {
        continue
      }

      // Check invoice_start_date filter
      if (rule.invoice_start_date) {
        const travelDate = new Date(activityBooking.start_date_time)
        const startDate = new Date(rule.invoice_start_date)
        if (travelDate < startDate) {
          results.push({
            booking_id: booking.booking_id,
            confirmation_code: booking.confirmation_code,
            seller,
            action: 'skipped',
            reason: `Travel date ${format(travelDate, 'yyyy-MM-dd')} before rule start ${rule.invoice_start_date}`
          })
          continue
        }
      }

      // Calculate scheduled send date
      let scheduledSendDate: Date

      if (rule.invoice_date_type === 'creation') {
        scheduledSendDate = new Date()
      } else {
        const travelDate = new Date(activityBooking.start_date_time)
        scheduledSendDate = addDays(travelDate, rule.travel_date_delay_days)
      }

      const scheduledDateStr = format(scheduledSendDate, 'yyyy-MM-dd')

      const executionTime = rule.execution_time || '08:00'

      toInsert.push({
        booking_id: booking.booking_id,
        rule_id: rule.id,
        scheduled_send_date: scheduledDateStr,
        scheduled_send_time: executionTime,
        status: 'pending',
      })

      results.push({
        booking_id: booking.booking_id,
        confirmation_code: booking.confirmation_code,
        seller,
        action: dryRun ? 'would_schedule' : 'scheduled',
        scheduled_date: scheduledDateStr,
        scheduled_time: executionTime,
      })
    }

    // Insert if not dry run
    if (!dryRun && toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('scheduled_invoices')
        .insert(toInsert)

      if (insertError) {
        console.error('Error inserting scheduled invoices:', insertError)
        return NextResponse.json({ error: 'Failed to create scheduled invoices', details: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      total_bookings: bookings?.length || 0,
      processed: toInsert.length,
      results: results.slice(0, 100), // Limit results to first 100
      message: dryRun
        ? `Would schedule ${toInsert.length} invoices (dry run)`
        : `Scheduled ${toInsert.length} invoices`
    })

  } catch (error) {
    console.error('Process rules error:', error)
    return NextResponse.json(
      { error: 'Processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
