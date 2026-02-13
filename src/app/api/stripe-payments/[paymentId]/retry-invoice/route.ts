import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const { paymentId } = await params
    const webhookUrl = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'

    const response = await fetch(
      `${webhookUrl}/webhook/stripe/payments/${paymentId}/retry-invoice`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to retry invoice' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error retrying invoice:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}
