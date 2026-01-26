import { NextRequest, NextResponse } from 'next/server'

const WEBHOOK_SYSTEM_URL = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params
    const bookingIdNum = parseInt(bookingId)

    if (isNaN(bookingIdNum)) {
      return NextResponse.json(
        { error: 'Invalid booking ID' },
        { status: 400 }
      )
    }

    // Use the process-booking endpoint which fetches data and sends to Partner Solution
    // But we need to bypass the rule check for manual sends
    // So we'll use send-to-partner with force flag or create a manual endpoint

    // First fetch the booking data
    const bookingResponse = await fetch(
      `${WEBHOOK_SYSTEM_URL}/api/invoices/pending-bookings?bookingId=${bookingIdNum}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    )

    // Actually, let's call a simpler endpoint that handles everything
    // We'll use the send-to-partner endpoint with minimal required data
    // The webhook system will fetch the rest

    const response = await fetch(
      `${WEBHOOK_SYSTEM_URL}/api/invoices/send-booking/${bookingIdNum}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to send booking to Partner Solution' },
        { status: response.status }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error sending booking to Partner Solution:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}
