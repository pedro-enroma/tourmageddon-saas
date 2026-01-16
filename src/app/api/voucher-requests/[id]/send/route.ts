import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { generateVoucherRequestPDF } from '@/lib/pdf/voucher-request-pdf'
import { auditUpdate } from '@/lib/audit-logger'
import { Resend } from 'resend'

const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('RESEND_API_KEY not found')
    return null
  }
  return new Resend(apiKey)
}

// Helper to replace template placeholders
function replaceTemplatePlaceholders(template: string, data: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '')
  }
  return result
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const supabase = getServiceRoleClient()

    // Fetch the voucher request with partner details and activity info
    const { data: voucherRequest, error: fetchError } = await supabase
      .from('voucher_requests')
      .select(`
        *,
        partners (partner_id, name, email),
        ticket_categories (id, name),
        activity_availability (
          id,
          activity_id,
          activities (id, title, language)
        )
      `)
      .eq('id', id)
      .single()

    if (fetchError || !voucherRequest) {
      return NextResponse.json({ error: 'Voucher request not found' }, { status: 404 })
    }

    // Validate status
    if (voucherRequest.status !== 'draft') {
      return NextResponse.json({
        error: `Cannot send request. Current status is '${voucherRequest.status}'. Only drafts can be sent.`
      }, { status: 400 })
    }

    // Validate partner email
    if (!voucherRequest.partners?.email) {
      return NextResponse.json({ error: 'Partner email not found' }, { status: 400 })
    }

    // Get activity language
    const activityLanguage = voucherRequest.activity_availability?.activities?.language || ''
    const activityId = voucherRequest.activity_availability?.activity_id

    // Fetch ticket type mappings for this activity to properly categorize pax
    const { data: ticketTypeMappings } = await supabase
      .from('ticket_type_mappings')
      .select('ticket_type, booked_titles')
      .eq('activity_id', activityId)

    // Build a lookup: booked_title -> ticket_type (e.g., "6 a 17 años" -> "Minore")
    const bookedTitleToTicketType = new Map<string, string>()
    ticketTypeMappings?.forEach(mapping => {
      mapping.booked_titles?.forEach((title: string) => {
        bookedTitleToTicketType.set(title.toLowerCase(), mapping.ticket_type)
      })
    })

    // Get customer data - try to fetch from activity_bookings for phone and pax breakdown
    type PaxBreakdown = Record<string, number> // e.g., { "Adulto": 2, "Minore": 1, "Infante": 1 }
    type CustomerData = {
      name: string
      phone: string
      paxBreakdown: PaxBreakdown
    }
    let customers: CustomerData[] = []

    // Try to fetch actual booking data for this availability
    const { data: activityBookings } = await supabase
      .from('activity_bookings')
      .select(`
        activity_booking_id,
        bookings (
          booking_id,
          customers (
            first_name,
            last_name,
            phone_number
          )
        ),
        pricing_category_bookings (
          booked_title,
          quantity,
          passenger_first_name,
          passenger_last_name
        )
      `)
      .eq('activity_availability_id', voucherRequest.activity_availability_id)
      .not('status', 'eq', 'CANCELLED')

    if (activityBookings && activityBookings.length > 0) {
      // Build customers from actual booking data
      customers = activityBookings.map((booking: Record<string, unknown>) => {
        const bookingData = booking.bookings as { customers?: { first_name?: string; last_name?: string; phone_number?: string } | { first_name?: string; last_name?: string; phone_number?: string }[] } | null
        const customer = Array.isArray(bookingData?.customers)
          ? bookingData?.customers[0]
          : bookingData?.customers
        const pricingCategories = (booking.pricing_category_bookings || []) as { booked_title?: string; quantity?: number }[]

        // Group quantities by mapped ticket_type
        const paxBreakdown: PaxBreakdown = {}
        pricingCategories.forEach(pc => {
          const bookedTitle = pc.booked_title || ''
          const qty = pc.quantity || 0

          // Look up the ticket_type from mappings
          const ticketType = bookedTitleToTicketType.get(bookedTitle.toLowerCase()) || bookedTitle
          paxBreakdown[ticketType] = (paxBreakdown[ticketType] || 0) + qty
        })

        return {
          name: customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : '-',
          phone: customer?.phone_number || '',
          paxBreakdown
        }
      })
    } else {
      // Fallback to stored customer_names
      const storedCustomers = voucherRequest.customer_names as { first_name: string; last_name: string; pax_count: number; phone?: string }[]
      customers = storedCustomers.map(c => ({
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || '-',
        phone: c.phone || '',
        paxBreakdown: { 'Adulto': c.pax_count } // Default to Adulto for legacy data
      }))
    }

    // Generate PDF with new format
    const pdfData = await generateVoucherRequestPDF({
      requestId: voucherRequest.id,
      partnerName: voucherRequest.partners.name,
      companyName: 'TU ITALIA SRL',
      activityName: voucherRequest.activity_name,
      activityLocation: voucherRequest.ticket_categories?.name || 'San Sebastiano',
      visitDate: voucherRequest.visit_date,
      entryTime: voucherRequest.entry_time || '',
      language: activityLanguage,
      customers,
      totalPax: voucherRequest.total_pax,
      notes: voucherRequest.notes
    })

    // Upload PDF to storage
    const pdfFileName = `request-${id}-${Date.now()}.pdf`
    const pdfPath = `${voucherRequest.visit_date}/${pdfFileName}`

    const { error: uploadError } = await supabase.storage
      .from('voucher-requests')
      .upload(pdfPath, pdfData, {
        contentType: 'application/pdf',
        upsert: false
      })

    if (uploadError) {
      console.error('Error uploading PDF:', uploadError)
      return NextResponse.json({ error: 'Failed to upload PDF' }, { status: 500 })
    }

    // Send email with PDF attachment
    const resend = getResend()
    if (!resend) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
    }

    // Fetch partner template from database
    // First try to find a template that matches the partner AND has this activity in activity_ids
    let emailTemplate: { subject: string; body: string } | null = null

    if (activityId) {
      // Try to find a template specifically for this partner + activity
      const { data: specificTemplate } = await supabase
        .from('partner_templates')
        .select('subject, body')
        .eq('partner_id', voucherRequest.partner_id)
        .contains('activity_ids', [activityId])
        .single()

      if (specificTemplate) {
        emailTemplate = specificTemplate
      }
    }

    // If no specific template found, try to find a default template for this partner
    if (!emailTemplate) {
      const { data: defaultTemplate } = await supabase
        .from('partner_templates')
        .select('subject, body')
        .eq('partner_id', voucherRequest.partner_id)
        .eq('is_default', true)
        .single()

      if (defaultTemplate) {
        emailTemplate = defaultTemplate
      }
    }

    // If still no template, try any template for this partner
    if (!emailTemplate) {
      const { data: anyPartnerTemplate } = await supabase
        .from('partner_templates')
        .select('subject, body')
        .eq('partner_id', voucherRequest.partner_id)
        .limit(1)
        .single()

      if (anyPartnerTemplate) {
        emailTemplate = anyPartnerTemplate
      }
    }

    if (!emailTemplate) {
      return NextResponse.json({
        error: 'No email template found for this partner. Please create a partner template in Templates & Meeting Points → Partner Templates.'
      }, { status: 500 })
    }

    const [year, month, day] = voucherRequest.visit_date.split('-')
    const formattedDate = `${day}/${month}/${year}`

    // Template placeholders
    const templateData: Record<string, string> = {
      partner_name: voucherRequest.partners.name,
      activity_name: voucherRequest.activity_name,
      activity_language: activityLanguage,
      visit_date: formattedDate,
      entry_time: voucherRequest.entry_time || '-',
      requested_quantity: String(voucherRequest.requested_quantity),
      total_pax: String(voucherRequest.total_pax),
      notes: voucherRequest.notes || '',
      request_id: voucherRequest.id,
      date: formattedDate,
      time: voucherRequest.entry_time || '-'
    }

    const emailSubject = replaceTemplatePlaceholders(emailTemplate.subject, templateData)
    const emailBody = replaceTemplatePlaceholders(emailTemplate.body, templateData)

    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'EnRoma.com <noreply@enroma.com>',
      to: voucherRequest.partners.email,
      cc: 'visitasguiadas@enroma.com',
      bcc: process.env.EMAIL_BCC_ADDRESS,
      subject: emailSubject,
      html: emailBody,
      attachments: [{
        filename: `Richiesta_Voucher_${formattedDate.replace(/\//g, '-')}.pdf`,
        content: Buffer.from(pdfData)
      }]
    })

    if (emailError) {
      console.error('Error sending email:', emailError)
      return NextResponse.json({ error: 'Failed to send email to partner' }, { status: 500 })
    }

    // Also upload PDF to ticket-vouchers bucket and create voucher record
    // This makes the voucher request PDF appear as tickets in the voucher system

    // Generate booking number like "CAT-2025-08-24" (category abbreviation + date)
    const categoryName = voucherRequest.ticket_categories?.name || 'VR'
    const categoryAbbrev = categoryName.substring(0, 3).toUpperCase()
    const bookingNumber = `${categoryAbbrev}-${voucherRequest.visit_date}`

    const voucherFileName = `${bookingNumber}-${Date.now()}.pdf`
    const { error: voucherUploadError } = await supabase.storage
      .from('ticket-vouchers')
      .upload(voucherFileName, pdfData, {
        contentType: 'application/pdf',
        upsert: false
      })

    let voucherId: string | null = null

    if (!voucherUploadError) {
      // Calculate total tickets (sum of all pax across all customers)
      const totalTickets = customers.reduce((sum, c) => {
        return sum + Object.values(c.paxBreakdown).reduce((s, qty) => s + qty, 0)
      }, 0)

      // Create voucher record
      const { data: voucher, error: voucherError } = await supabase
        .from('vouchers')
        .insert({
          booking_number: bookingNumber,
          booking_date: new Date().toISOString().split('T')[0],
          category_id: voucherRequest.ticket_category_id,
          visit_date: voucherRequest.visit_date,
          entry_time: voucherRequest.entry_time || '00:00',
          product_name: voucherRequest.activity_name,
          pdf_path: voucherFileName,
          activity_availability_id: voucherRequest.activity_availability_id,
          total_tickets: totalTickets,
          notes: `Richiesta voucher inviata al partner ${voucherRequest.partners.name}`
        })
        .select()
        .single()

      if (!voucherError && voucher) {
        voucherId = voucher.id

        // Create individual ticket records for each person (like "Sergio Cazzaro - Adulto 1")
        const ticketRecords: {
          voucher_id: string
          ticket_code: string
          holder_name: string
          ticket_type: string
          price: number
        }[] = []

        customers.forEach((customer, customerIndex) => {
          // For each ticket type in paxBreakdown
          for (const [ticketType, quantity] of Object.entries(customer.paxBreakdown)) {
            // Create individual tickets for each person of this type
            for (let i = 1; i <= quantity; i++) {
              ticketRecords.push({
                voucher_id: voucher.id,
                ticket_code: `${categoryAbbrev}-${customerIndex + 1}-${ticketRecords.length + 1}`,
                holder_name: `${customer.name} - ${ticketType} ${i}`,
                ticket_type: ticketType,
                price: 0 // Partner vouchers have no cost to us
              })
            }
          }
        })

        const { error: ticketsError } = await supabase
          .from('tickets')
          .insert(ticketRecords)

        if (ticketsError) {
          console.error('Error creating tickets:', ticketsError)
        }
      } else if (voucherError) {
        console.error('Error creating voucher record:', voucherError)
      }
    } else {
      console.error('Error uploading voucher PDF:', voucherUploadError)
    }

    // Update voucher request status
    const { data: updatedRequest, error: updateError } = await supabase
      .from('voucher_requests')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_by: user.id,
        request_pdf_path: pdfPath
      })
      .eq('id', id)
      .select(`
        *,
        partners (partner_id, name, email),
        ticket_categories (id, name)
      `)
      .single()

    if (updateError) {
      console.error('Error updating voucher request status:', updateError)
      // Email was sent but status update failed - log error but don't fail the request
    }

    // Audit log
    await auditUpdate(request, user, 'voucher_request', id, voucherRequest, {
      ...voucherRequest,
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_by: user.id
    })

    // Log email
    await supabase.from('email_logs').insert({
      recipient_email: voucherRequest.partners.email,
      recipient_name: voucherRequest.partners.name,
      recipient_type: 'partner',
      recipient_id: voucherRequest.partner_id,
      activity_availability_id: voucherRequest.activity_availability_id,
      service_date: voucherRequest.visit_date,
      subject: emailSubject,
      status: 'sent'
    })

    return NextResponse.json({
      success: true,
      message: 'Voucher request sent successfully',
      data: updatedRequest || { ...voucherRequest, status: 'sent' },
      voucherId: voucherId // ID of the created voucher record (for ticket tracking)
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
