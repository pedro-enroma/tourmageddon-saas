import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession, isAdmin } from '@/lib/supabase-server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user is an admin
  const adminCheck = await isAdmin(user.id)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { notificationId, recipients } = body

    if (!notificationId || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'notificationId and recipients array are required' }, { status: 400 })
    }

    // Get the notification details
    const supabase = getServiceRoleClient()
    const { data: notification, error: notifError } = await supabase
      .from('booking_notifications')
      .select('*')
      .eq('id', notificationId)
      .single()

    if (notifError || !notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    // Build email content
    const severityColors: Record<string, string> = {
      error: '#dc2626',
      warning: '#f59e0b',
      info: '#3b82f6'
    }
    const severityColor = severityColors[notification.severity] || '#6b7280'

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${severityColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
            .badge { display: inline-block; background: white; color: ${severityColor}; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
            .details { background: white; padding: 16px; border-radius: 8px; margin-top: 16px; border: 1px solid #e5e7eb; }
            .footer { margin-top: 20px; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="badge">${notification.severity}</span>
              <h2 style="margin: 12px 0 0 0;">${notification.title}</h2>
            </div>
            <div class="content">
              <p style="margin: 0 0 16px 0; font-size: 15px;">${notification.message}</p>

              ${notification.activity_booking_id ? `
                <div class="details">
                  <strong>Booking ID:</strong> #${notification.activity_booking_id}
                </div>
              ` : ''}

              ${notification.details?.event_data ? `
                <div class="details">
                  <h4 style="margin: 0 0 12px 0;">Event Details</h4>
                  ${Object.entries(notification.details.event_data as Record<string, unknown>)
                    .map(([key, value]) => `<div><strong>${key.replace(/_/g, ' ')}:</strong> ${String(value)}</div>`)
                    .join('')}
                </div>
              ` : ''}

              <div class="footer">
                <p>Escalated by: ${user.email}</p>
                <p>Original notification: ${new Date(notification.created_at).toLocaleString()}</p>
                <p>This notification was escalated from Tourmageddon Operations Dashboard.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `

    // Send email via Resend
    const { error: emailError } = await resend.emails.send({
      from: 'Tourmageddon Alerts <alerts@tourmageddon.it>',
      to: recipients,
      subject: `[ESCALATED] ${notification.title}`,
      html: emailHtml
    })

    if (emailError) {
      console.error('Error sending escalation email:', emailError)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    // Log the escalation in the notification metadata
    await supabase
      .from('booking_notifications')
      .update({
        metadata: {
          ...((notification.metadata as Record<string, unknown>) || {}),
          escalated_at: new Date().toISOString(),
          escalated_by: user.email,
          escalated_to: recipients
        }
      })
      .eq('id', notificationId)

    return NextResponse.json({ success: true, recipients })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
