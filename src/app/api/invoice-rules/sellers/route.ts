import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const webhookUrl = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'
    const apiKey = process.env.INVOICE_API_KEY || ''

    const response = await fetch(`${webhookUrl}/api/invoices/sellers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'x-api-key': apiKey }),
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to fetch sellers' },
        { status: response.status }
      )
    }

    return NextResponse.json({ sellers: data.sellers || [] })
  } catch (error) {
    console.error('Error fetching sellers:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}
