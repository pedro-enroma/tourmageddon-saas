import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('RESEND_API_KEY not found')
    return null
  }
  return new Resend(apiKey)
}

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Mismatch {
  participant_id: number
  name: string
  dob: string
  age: number
  booked_title: string
  expected_range: string
}

interface NotificationDetails {
  mismatches?: Mismatch[]
  expected_counts?: Record<string, number>
  actual_counts?: Record<string, number>
}

interface Notification {
  id: string
  activity_booking_id: number
  notification_type: string
  severity: string
  title: string
  message: string
  details: NotificationDetails
  created_at: string
}

function generateAlertHtml(notification: Notification): string {
  const mismatches = notification.details?.mismatches || []
  const expectedCounts = notification.details?.expected_counts || {}
  const actualCounts = notification.details?.actual_counts || {}

  let mismatchRows = ''
  for (const m of mismatches) {
    mismatchRows += `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${m.name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${m.dob}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold;">${m.age} yo</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${m.booked_title}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; color: #dc2626;">${m.expected_range} yo</td>
      </tr>
    `
  }

  let countComparisonRows = ''
  for (const key of Object.keys(expectedCounts)) {
    const expected = expectedCounts[key] || 0
    const actual = actualCounts[key] || 0
    const mismatch = expected !== actual
    countComparisonRows += `
      <tr>
        <td style="padding: 8px; ${mismatch ? 'color: #dc2626; font-weight: bold;' : ''}">${key}</td>
        <td style="padding: 8px; text-align: center; ${mismatch ? 'color: #dc2626; font-weight: bold;' : ''}">${expected}</td>
        <td style="padding: 8px; text-align: center; ${mismatch ? 'color: #dc2626; font-weight: bold;' : ''}">${actual}</td>
      </tr>
    `
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(135deg, #dc2626 0%, #f97316 100%); border-radius: 12px 12px 0 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-right: 16px;">
                    <div style="width: 48px; height: 48px; background-color: rgba(255,255,255,0.2); border-radius: 10px; text-align: center; line-height: 48px;">
                      <span style="color: #ffffff; font-size: 24px;">⚠️</span>
                    </div>
                  </td>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Age Mismatch Alert</h1>
                    <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Booking #${notification.activity_booking_id}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px;">
              <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                ${notification.message}
              </p>

              ${mismatches.length > 0 ? `
              <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 16px;">Mismatched Participants:</h3>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #f9fafb;">
                    <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; font-size: 14px;">Name</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; font-size: 14px;">DOB</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; font-size: 14px;">Age</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; font-size: 14px;">Booked As</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; font-size: 14px;">Expected</th>
                  </tr>
                </thead>
                <tbody>
                  ${mismatchRows}
                </tbody>
              </table>
              ` : ''}

              ${Object.keys(expectedCounts).length > 0 ? `
              <h3 style="margin: 24px 0 16px 0; color: #111827; font-size: 16px;">Category Count Comparison:</h3>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #f9fafb;">
                    <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; font-size: 14px;">Category</th>
                    <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151; font-size: 14px;">Booked</th>
                    <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151; font-size: 14px;">Actual (by DOB)</th>
                  </tr>
                </thead>
                <tbody>
                  ${countComparisonRows}
                </tbody>
              </table>
              ` : ''}

              <p style="margin: 24px 0 0 0; padding: 16px; background-color: #fef2f2; border-radius: 8px; color: #991b1b; font-size: 14px;">
                <strong>Action Required:</strong> Please review this booking and update the participant information accordingly.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #6b7280; font-size: 13px; text-align: center;">
                This is an automated alert from Tourmageddon Operations.
                <br>
                <a href="https://tourmageddon.it/dashboard" style="color: #ee682a; text-decoration: none;">View in Dashboard</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

// This webhook is called by Supabase Database Webhook when a notification is created
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret (set this in Supabase webhook config)
    const webhookSecret = request.headers.get('x-webhook-secret')
    const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET

    // If webhook secret is configured, verify it
    if (expectedSecret && webhookSecret !== expectedSecret) {
      console.error('Invalid webhook secret')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Supabase webhook sends: { type: 'INSERT', table: 'booking_notifications', record: {...}, ... }
    const { type, record } = body

    // Only process INSERT events for age_mismatch notifications
    if (type !== 'INSERT') {
      return NextResponse.json({ message: 'Ignored non-INSERT event' })
    }

    if (!record || record.notification_type !== 'age_mismatch' || record.is_resolved === true) {
      return NextResponse.json({ message: 'Ignored non-age_mismatch or resolved notification' })
    }

    const resend = getResend()
    if (!resend) {
      console.error('Email service not configured')
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
    }

    // Always send to operations@enroma.com
    const toEmail = 'operations@enroma.com'

    // Generate email HTML
    const html = generateAlertHtml(record as Notification)

    // Send the email
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Tourmageddon <alerts@tourmageddon.it>',
      to: toEmail,
      subject: `⚠️ Age Mismatch Alert - Booking #${record.activity_booking_id}`,
      html
    })

    if (emailError) {
      console.error('Failed to send alert email:', emailError)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    // Log the email
    const supabase = getSupabase()
    await supabase.from('email_logs').insert({
      recipient_type: 'admin',
      recipient_name: 'Operations',
      recipient_email: toEmail,
      subject: `Age Mismatch Alert - Booking #${record.activity_booking_id}`,
      status: 'sent'
    })

    console.log('Alert email sent successfully for notification:', record.id)

    return NextResponse.json({
      success: true,
      emailId: emailData?.id
    })

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
