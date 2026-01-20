import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase-server'

// This endpoint can be called by Vercel Cron or manually
// It checks for overdue placeholder vouchers and escalates them

export async function POST(request: NextRequest) {
  // Verify cron secret or auth (optional - for security)
  const cronSecret = request.headers.get('x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  // Allow if cron secret matches OR if no secret is configured (development)
  if (expectedSecret && cronSecret !== expectedSecret) {
    // For development, also accept requests without the secret
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const supabase = getServiceRoleClient()
    const now = new Date().toISOString()

    // Find all placeholder vouchers that are pending and past deadline
    const { data: overdueVouchers, error: fetchError } = await supabase
      .from('vouchers')
      .select(`
        id,
        booking_number,
        visit_date,
        entry_time,
        product_name,
        name_deadline_at,
        placeholder_ticket_count,
        activity_availability_id,
        ticket_categories (
          id,
          name,
          deadline_notification_emails
        ),
        activity_availability (
          id,
          local_time,
          activities (title)
        )
      `)
      .eq('is_placeholder', true)
      .eq('deadline_status', 'pending')
      .lte('name_deadline_at', now)

    if (fetchError) {
      console.error('Error fetching overdue vouchers:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch overdue vouchers' }, { status: 500 })
    }

    if (!overdueVouchers || overdueVouchers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No overdue placeholder vouchers found',
        processed: 0
      })
    }

    console.log(`Found ${overdueVouchers.length} overdue placeholder vouchers`)

    const processed: string[] = []
    const errors: string[] = []

    for (const voucher of overdueVouchers) {
      try {
        // Update voucher status to escalated
        const { error: updateError } = await supabase
          .from('vouchers')
          .update({
            deadline_status: 'escalated',
            escalated_at: now
          })
          .eq('id', voucher.id)

        if (updateError) {
          console.error(`Error updating voucher ${voucher.id}:`, updateError)
          errors.push(`Failed to update ${voucher.booking_number}`)
          continue
        }

        // Create notification in booking_notifications
        const categoryData = voucher.ticket_categories as unknown
        const activityData = voucher.activity_availability as unknown
        const category = categoryData as { id: string; name: string; deadline_notification_emails?: string[] } | null
        const activity = activityData as { id: number; local_time: string; activities?: { title: string } } | null

        const notificationMessage = `Placeholder voucher "${voucher.booking_number}" for ${category?.name || 'Unknown'} on ${voucher.visit_date} has passed its name deadline. ${voucher.placeholder_ticket_count} tickets need customer names.`

        const { error: notifError } = await supabase
          .from('booking_notifications')
          .insert({
            notification_type: 'voucher_deadline_missed',
            severity: 'error',
            title: `Voucher Deadline Missed - ${voucher.booking_number}`,
            message: notificationMessage,
            related_voucher_id: voucher.id,
            related_activity_availability_id: voucher.activity_availability_id,
            metadata: {
              voucher_id: voucher.id,
              booking_number: voucher.booking_number,
              category_name: category?.name,
              visit_date: voucher.visit_date,
              entry_time: voucher.entry_time,
              ticket_count: voucher.placeholder_ticket_count,
              deadline_at: voucher.name_deadline_at,
              activity_title: activity?.activities?.title
            }
          })

        if (notifError) {
          console.error(`Error creating notification for ${voucher.id}:`, notifError)
          // Don't fail the whole process for notification errors
        }

        // Log to voucher_deadline_notifications table
        const notificationEmails = category?.deadline_notification_emails || []
        await supabase
          .from('voucher_deadline_notifications')
          .insert({
            voucher_id: voucher.id,
            notification_type: 'escalation',
            sent_to: notificationEmails.length > 0 ? notificationEmails : ['admin'],
            details: {
              escalated_at: now,
              visit_date: voucher.visit_date,
              ticket_count: voucher.placeholder_ticket_count
            }
          })

        processed.push(voucher.booking_number)
      } catch (err) {
        console.error(`Error processing voucher ${voucher.id}:`, err)
        errors.push(`Error processing ${voucher.booking_number}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processed.length} overdue vouchers`,
      processed: processed.length,
      vouchers: processed,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (err) {
    console.error('Check deadlines error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Also support GET for easy manual triggering
export async function GET(request: NextRequest) {
  return POST(request)
}
