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
            const fileName = url.split('/').pop() || 'attachment.pdf'
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

        const { data, error } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Tourmageddon <onboarding@resend.dev>',
          to: recipient.email,
          subject: personalizedSubject,
          html: personalizedBody.replace(/\n/g, '<br>'),
          attachments: attachments.length > 0 ? attachments : undefined
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
