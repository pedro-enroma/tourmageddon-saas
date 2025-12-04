import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { verifySession, getServiceRoleClient } from '@/lib/supabase-server'

// Initialize Resend on each request to ensure env vars are read
const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('RESEND_API_KEY not found. Available env vars:', Object.keys(process.env).filter(k => k.includes('RESEND') || k.includes('SUPABASE')))
    return null
  }
  return new Resend(apiKey)
}

interface EmailRequest {
  recipients: {
    email: string
    name: string
    type: 'guide' | 'escort' | 'headphone'
    id: string
  }[]
  subject: string
  body: string
  activityAvailabilityId?: number
  attachmentUrls?: string[]
  dailyListData?: string // Base64 encoded Excel file
  dailyListFileName?: string
  serviceDate?: string // The date of the service (YYYY-MM-DD format)
  // Additional context for template variables
  serviceContext?: {
    tourTitle?: string
    date?: string
    time?: string
    paxCount?: number
    guideName?: string
    guidePhone?: string
    escortName?: string
    escortPhone?: string
    headphoneName?: string
    headphonePhone?: string
    meetingPoint?: string
  }
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

  // Create styled HTML email with brand colors
  // Brand Orange: #ee682a, Brand Green: #2dba7d
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Service Assignment</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <!-- Header with gradient -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 32px 40px; background: linear-gradient(135deg, #ee682a 0%, #2dba7d 100%); border-radius: 12px 12px 0 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding-right: 16px;">
                          <div style="width: 48px; height: 48px; background-color: rgba(255,255,255,0.2); border-radius: 10px; text-align: center; line-height: 48px;">
                            <span style="color: #ffffff; font-size: 24px; font-weight: bold;">E</span>
                          </div>
                        </td>
                        <td>
                          <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700;">EnRoma.com</h1>
                          <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Tour Operations</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <div style="color: #374151; font-size: 15px; line-height: 1.7;">
                ${html}
              </div>
              ${hasAttachments ? `
              <div style="margin-top: 32px; padding: 20px 24px; background-color: #fef3ee; border-radius: 10px; border-left: 4px solid #ee682a;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong style="color: #c5521f;">📎 Attachments included</strong><br>
                  <span style="color: #78350f;">Please find the attached documents for this service.</span>
                </p>
              </div>
              ` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px 32px; background-color: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px;">
                      This email was sent by <strong style="color: #ee682a;">EnRoma.com</strong>
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                      If you have questions, please contact your coordinator.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!-- Brand footer -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 24px auto 0;">
          <tr>
            <td style="text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">
                Powered by Tourmageddon
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
  // Verify authentication
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body: EmailRequest = await request.json()
    const { recipients, subject, body: emailBody, activityAvailabilityId, attachmentUrls, dailyListData, dailyListFileName, serviceDate, serviceContext } = body

    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: 'No recipients provided' }, { status: 400 })
    }

    const resend = getResend()
    if (!resend) {
      const availableVars = Object.keys(process.env).filter(k => k.includes('RESEND') || k.includes('SUPABASE'))
      return NextResponse.json({
        error: 'Email service not configured. Please set RESEND_API_KEY.',
        debug: `Available vars: ${availableVars.join(', ') || 'none'}`
      }, { status: 500 })
    }

    const supabase = getServiceRoleClient()
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

    // Helper function to replace all template variables
    const replaceTemplateVariables = (text: string, recipientName: string, recipientEmail: string) => {
      let result = text
        // Recipient-specific variables
        .replace(/\{\{name\}\}/g, recipientName)
        .replace(/\{\{email\}\}/g, recipientEmail)

      // Service context variables
      if (serviceContext) {
        result = result
          .replace(/\{\{tour_title\}\}/g, serviceContext.tourTitle || '')
          .replace(/\{\{date\}\}/g, serviceContext.date || '')
          .replace(/\{\{time\}\}/g, serviceContext.time || '')
          .replace(/\{\{pax_count\}\}/g, String(serviceContext.paxCount || ''))
          .replace(/\{\{guide_name\}\}/g, serviceContext.guideName || '')
          .replace(/\{\{guide_phone\}\}/g, serviceContext.guidePhone || '')
          .replace(/\{\{escort_name\}\}/g, serviceContext.escortName || '')
          .replace(/\{\{escort_phone\}\}/g, serviceContext.escortPhone || '')
          .replace(/\{\{headphone_name\}\}/g, serviceContext.headphoneName || '')
          .replace(/\{\{headphone_phone\}\}/g, serviceContext.headphonePhone || '')
          .replace(/\{\{meeting_point\}\}/g, serviceContext.meetingPoint || '')
      }

      return result
    }

    // Send emails to each recipient
    for (const recipient of recipients) {
      try {
        // Replace template variables in subject and body
        const personalizedSubject = replaceTemplateVariables(subject, recipient.name, recipient.email)
        const personalizedBody = replaceTemplateVariables(emailBody, recipient.name, recipient.email)

        // Convert to styled HTML
        const htmlContent = textToHtml(personalizedBody, hasAttachments)

        const { data, error } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'EnRoma.com <noreply@enroma.com>',
          to: recipient.email,
          bcc: process.env.EMAIL_BCC_ADDRESS,
          subject: personalizedSubject,
          html: htmlContent,
          attachments: hasAttachments ? attachments : undefined
        })

        if (error) {
          errors.push({ recipient: recipient.email, error: error.message })

          // Log failed email
          const { error: logError } = await supabase.from('email_logs').insert({
            recipient_email: recipient.email,
            recipient_name: recipient.name,
            recipient_type: recipient.type,
            recipient_id: recipient.id,
            activity_availability_id: activityAvailabilityId || null,
            service_date: serviceDate || null,
            subject: personalizedSubject,
            status: 'failed',
            error_message: error.message
          })
          if (logError) {
            console.error('Failed to log email (failed):', logError)
          }
        } else {
          results.push({ recipient: recipient.email, messageId: data?.id })

          // Log successful email
          const { error: logError } = await supabase.from('email_logs').insert({
            recipient_email: recipient.email,
            recipient_name: recipient.name,
            recipient_type: recipient.type,
            recipient_id: recipient.id,
            activity_availability_id: activityAvailabilityId || null,
            service_date: serviceDate || null,
            subject: personalizedSubject,
            status: 'sent'
          })
          if (logError) {
            console.error('Failed to log email (sent):', logError)
          }
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
