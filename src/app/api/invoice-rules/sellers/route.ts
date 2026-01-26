import { NextResponse } from 'next/server'

const WEBHOOK_SYSTEM_URL = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'

export async function GET() {
  try {
    const response = await fetch(`${WEBHOOK_SYSTEM_URL}/api/invoices/sellers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
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
