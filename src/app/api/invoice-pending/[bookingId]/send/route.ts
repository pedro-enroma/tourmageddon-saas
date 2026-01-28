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

    // Call the send-booking endpoint which handles everything
    const response = await fetch(
      `${WEBHOOK_SYSTEM_URL}/api/invoices/send-booking/${bookingIdNum}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    )

    // Check if response is JSON before parsing
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text()
      console.error('Webhook system returned non-JSON response:', text.substring(0, 200))
      return NextResponse.json(
        { error: 'Webhook system returned an invalid response' },
        { status: 502 }
      )
    }

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
