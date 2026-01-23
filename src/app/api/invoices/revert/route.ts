import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Revert invoices back to pending (delete them from invoices table)
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()
    const { invoice_ids, booking_ids } = body

    if (!invoice_ids && !booking_ids) {
      return NextResponse.json({ error: 'invoice_ids or booking_ids required' }, { status: 400 })
    }

    let deletedCount = 0

    if (invoice_ids && Array.isArray(invoice_ids)) {
      // Delete by invoice IDs
      const { error, count } = await supabase
        .from('invoices')
        .delete()
        .in('id', invoice_ids)

      if (error) {
        console.error('Error deleting invoices:', error)
        return NextResponse.json({ error: 'Failed to delete invoices', details: error.message }, { status: 500 })
      }
      deletedCount = count || invoice_ids.length
    } else if (booking_ids && Array.isArray(booking_ids)) {
      // Delete by booking IDs
      const { error, count } = await supabase
        .from('invoices')
        .delete()
        .in('booking_id', booking_ids)

      if (error) {
        console.error('Error deleting invoices:', error)
        return NextResponse.json({ error: 'Failed to delete invoices', details: error.message }, { status: 500 })
      }
      deletedCount = count || booking_ids.length

      // Also delete any scheduled_invoices for these bookings
      await supabase
        .from('scheduled_invoices')
        .delete()
        .in('booking_id', booking_ids)
    }

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      message: `Reverted ${deletedCount} invoice(s) back to pending`
    })

  } catch (error) {
    console.error('Revert invoices error:', error)
    return NextResponse.json(
      { error: 'Revert failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET endpoint to revert all test invoices (use with caution)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const searchParams = request.nextUrl.searchParams
    const confirmationCodePrefix = searchParams.get('prefix')

    if (!confirmationCodePrefix) {
      return NextResponse.json({ error: 'prefix parameter required (e.g., CIV-, ENRO-)' }, { status: 400 })
    }

    // Delete invoices with matching confirmation code prefix
    const { data: invoices, error: fetchError } = await supabase
      .from('invoices')
      .select('id, booking_id, confirmation_code')
      .like('confirmation_code', `${confirmationCodePrefix}%`)

    if (fetchError) {
      return NextResponse.json({ error: 'Failed to fetch invoices', details: fetchError.message }, { status: 500 })
    }

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ message: 'No invoices found with that prefix', deleted: 0 })
    }

    const invoiceIds = invoices.map(i => i.id)
    const bookingIds = invoices.map(i => i.booking_id)

    // Delete the invoices
    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .in('id', invoiceIds)

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete invoices', details: deleteError.message }, { status: 500 })
    }

    // Also delete any scheduled_invoices
    await supabase
      .from('scheduled_invoices')
      .delete()
      .in('booking_id', bookingIds)

    return NextResponse.json({
      success: true,
      deleted: invoices.length,
      confirmation_codes: invoices.map(i => i.confirmation_code),
      message: `Reverted ${invoices.length} invoice(s) with prefix ${confirmationCodePrefix}`
    })

  } catch (error) {
    console.error('Revert invoices error:', error)
    return NextResponse.json(
      { error: 'Revert failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
