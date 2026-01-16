import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditDelete, getRequestContext } from '@/lib/audit-logger'

// Security limits
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB for voucher PDFs

interface ExtractedTicket {
  ticket_code: string
  holder_name: string
  ticket_type: string
  price: number
  pricing_category_booking_id?: number | null
  activity_booking_id?: number | null  // For booking-level vouchers (e.g., Catacombe)
  pax_count?: number | null  // Number of pax for booking-level vouchers
}

// POST - Create voucher with tickets and upload PDF
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const voucherDataStr = formData.get('voucherData') as string

    if (!file || !voucherDataStr) {
      return NextResponse.json({ error: 'File and voucher data are required' }, { status: 400 })
    }

    // Security: Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 20MB.' }, { status: 413 })
    }

    // Security: Validate file type (must be PDF)
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
    }

    const voucherData = JSON.parse(voucherDataStr)
    const {
      booking_number,
      booking_date,
      category_id,
      visit_date,
      entry_time,
      product_name,
      activity_availability_id,
      ticket_class,
      tickets
    } = voucherData

    if (!booking_number || !category_id || !visit_date) {
      return NextResponse.json({ error: 'Missing required voucher fields' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { ip, userAgent } = getRequestContext(request)

    // 1. Upload PDF to Supabase storage
    const fileName = `${booking_number}_${Date.now()}.pdf`
    const fileBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('ticket-vouchers')
      .upload(fileName, fileBuffer, {
        contentType: 'application/pdf'
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({
        error: `Failed to upload PDF: ${uploadError.message}`,
        details: uploadError
      }, { status: 500 })
    }

    // 2. Create voucher record
    const { data: voucher, error: voucherError } = await supabase
      .from('vouchers')
      .insert({
        booking_number,
        booking_date,
        category_id,
        visit_date,
        entry_time,
        product_name,
        pdf_path: fileName,
        activity_availability_id,
        ticket_class,
        total_tickets: tickets?.length || 0
      })
      .select()
      .single()

    if (voucherError) {
      // Clean up uploaded file if voucher creation fails
      await supabase.storage.from('ticket-vouchers').remove([fileName])
      console.error('Voucher creation error:', voucherError)

      // Check for duplicate booking number
      if (voucherError.code === '23505' && voucherError.message.includes('booking_number')) {
        return NextResponse.json({
          error: `A voucher with booking number "${booking_number}" already exists`,
          code: 'DUPLICATE_BOOKING'
        }, { status: 409 })
      }

      return NextResponse.json({
        error: `Failed to create voucher record: ${voucherError.message}`,
        details: voucherError
      }, { status: 500 })
    }

    await auditCreate(user.id, user.email, 'voucher', voucher.id, voucher, ip, userAgent)

    // 3. Create ticket records with participant links
    if (tickets && tickets.length > 0) {
      const ticketRecords = tickets.map((ticket: ExtractedTicket) => ({
        voucher_id: voucher.id,
        ticket_code: ticket.ticket_code,
        holder_name: ticket.holder_name,
        ticket_type: ticket.ticket_type,
        price: ticket.price,
        pricing_category_booking_id: ticket.pricing_category_booking_id || null,
        activity_booking_id: ticket.activity_booking_id || null,
        pax_count: ticket.pax_count || null,
        linked_at: (ticket.pricing_category_booking_id || ticket.activity_booking_id) ? new Date().toISOString() : null,
        linked_by: (ticket.pricing_category_booking_id || ticket.activity_booking_id) ? user.id : null
      }))

      const { data: createdTickets, error: ticketsError } = await supabase
        .from('tickets')
        .insert(ticketRecords)
        .select()

      if (ticketsError) {
        console.error('Tickets creation error:', ticketsError)
        // Don't fail the whole operation, just log
      } else {
        for (const ticket of createdTickets || []) {
          await auditCreate(user.id, user.email, 'ticket', ticket.id, ticket, ip, userAgent)
        }
      }
    }

    return NextResponse.json({ data: voucher }, { status: 201 })
  } catch (err) {
    console.error('Voucher creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete voucher and associated tickets
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Voucher ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { ip, userAgent } = getRequestContext(request)

    // Get voucher data for cleanup
    const { data: voucher } = await supabase
      .from('vouchers')
      .select('*')
      .eq('id', id)
      .single()

    if (!voucher) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 })
    }

    // Delete associated tickets first
    const { error: ticketsError } = await supabase
      .from('tickets')
      .delete()
      .eq('voucher_id', id)

    if (ticketsError) {
      console.error('Error deleting tickets:', ticketsError)
    }

    // Delete voucher record
    const { error: voucherError } = await supabase
      .from('vouchers')
      .delete()
      .eq('id', id)

    if (voucherError) {
      console.error('Error deleting voucher:', voucherError)
      return NextResponse.json({ error: 'Failed to delete voucher' }, { status: 500 })
    }

    // Delete PDF from storage
    if (voucher.pdf_path) {
      await supabase.storage.from('ticket-vouchers').remove([voucher.pdf_path])
    }

    await auditDelete(user.id, user.email, 'voucher', id, voucher, ip, userAgent)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Voucher deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
