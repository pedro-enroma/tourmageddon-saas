import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

// Lazy initialization to avoid build-time errors
let resendClient: Resend | null = null
const getResend = () => {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return resendClient
}

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface EmailRequest {
  recipients: {
    email: string
    name: string
    type: 'guide' | 'escort'
    id: string
  }[]
  subject: string
  body: string
  activityAvailabilityId?: number
  attachmentUrls?: string[]
  dailyListData?: string // Base64 encoded Excel file
  dailyListFileName?: string
}

// Convert plain text to styled HTML email
function textToHtml(text: string, hasAttachments: boolean): string {
  // Escape HTML entities
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Convert **bold** to <strong>
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  // Convert line breaks to <br>
  html = html.replace(/\n/g, '<br>')

  // Create styled HTML email
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Service Assignment</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background-color: #2563eb; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">EnRoma.com</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <div style="color: #374151; font-size: 15px; line-height: 1.6;">
                ${html}
              </div>
              ${hasAttachments ? `
              <div style="margin-top: 30px; padding: 20px; background-color: #f3f4f6; border-radius: 8px; border-left: 4px solid #2563eb;">
                <p style="margin: 0; color: #4b5563; font-size: 14px;">
                  <strong style="color: #1f2937;">📎 Attachments included</strong><br>
                  Please find the attached documents for this service.
                </p>
              </div>
              ` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 13px; text-align: center;">
                This email was sent by EnRoma.com<br>
                <span style="color: #9ca3af;">If you have questions, please contact your coordinator.</span>
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

export async function POST(request: NextRequest) {
  try {
    const body: EmailRequest = await request.json()
    const { recipients, subject, body: emailBody, activityAvailabilityId, attachmentUrls, dailyListData, dailyListFileName } = body

    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: 'No recipients provided' }, { status: 400 })
    }

    const resend = getResend()
    if (!resend) {
      return NextResponse.json({ error: 'Email service not configured. Please set RESEND_API_KEY.' }, { status: 500 })
    }

    const supabase = getSupabase()
    const results = []
    const errors = []

    // Prepare attachments
    const attachments: { filename: string; content: Buffer }[] = []

    // Add PDF attachments from URLs
    if (attachmentUrls && attachmentUrls.length > 0) {
      for (const url of attachmentUrls) {
        try {
          const response = await fetch(url)
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer())
            // Extract clean filename
            const urlPath = url.split('/').pop() || 'attachment.pdf'
            const fileName = decodeURIComponent(urlPath.split('?')[0])
            attachments.push({
              filename: fileName,
              content: buffer
            })
          }
        } catch (err) {
          console.error('Error fetching attachment:', url, err)
        }
      }
    }

    // Add daily list Excel file if provided
    if (dailyListData && dailyListFileName) {
      attachments.push({
        filename: dailyListFileName,
        content: Buffer.from(dailyListData, 'base64')
      })
    }

    const hasAttachments = attachments.length > 0

    // Send emails to each recipient
    for (const recipient of recipients) {
      try {
        // Replace template variables in subject and body
        const personalizedSubject = subject
          .replace(/\{\{name\}\}/g, recipient.name)
          .replace(/\{\{email\}\}/g, recipient.email)

        const personalizedBody = emailBody
          .replace(/\{\{name\}\}/g, recipient.name)
          .replace(/\{\{email\}\}/g, recipient.email)

        // Convert to styled HTML
        const htmlContent = textToHtml(personalizedBody, hasAttachments)

        const { data, error } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'EnRoma.com <noreply@enroma.com>',
          to: recipient.email,
          bcc: 'visitasguiadas@enroma.com',
          subject: personalizedSubject,
          html: htmlContent,
          attachments: hasAttachments ? attachments : undefined
        })

        if (error) {
          errors.push({ recipient: recipient.email, error: error.message })

          // Log failed email
          await supabase.from('email_logs').insert({
            recipient_email: recipient.email,
            recipient_name: recipient.name,
            recipient_type: recipient.type,
            recipient_id: recipient.id,
            activity_availability_id: activityAvailabilityId,
            subject: personalizedSubject,
            status: 'failed',
            error_message: error.message
          })
        } else {
          results.push({ recipient: recipient.email, messageId: data?.id })

          // Log successful email
          await supabase.from('email_logs').insert({
            recipient_email: recipient.email,
            recipient_name: recipient.name,
            recipient_type: recipient.type,
            recipient_id: recipient.id,
            activity_availability_id: activityAvailabilityId,
            subject: personalizedSubject,
            status: 'sent'
          })
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        errors.push({ recipient: recipient.email, error: errorMessage })
      }
    }

    return NextResponse.json({
      success: true,
      sent: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Email send error:', error)
    return NextResponse.json(
      { error: 'Failed to send emails', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
