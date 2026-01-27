import { NextRequest, NextResponse } from 'next/server'

const WEBHOOK_SYSTEM_URL = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') || ''
    const endDate = searchParams.get('endDate') || ''
    const seller = searchParams.get('seller') || ''

    const params = new URLSearchParams()
    if (startDate) params.append('startDate', startDate)
    if (endDate) params.append('endDate', endDate)
    if (seller) params.append('seller', seller)

    const url = `${WEBHOOK_SYSTEM_URL}/api/invoices/pending-bookings${params.toString() ? '?' + params.toString() : ''}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to fetch pending bookings' },
        { status: response.status }
      )
    }

    return NextResponse.json({ data: data.data || data })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error fetching pending bookings:', errorMessage, 'URL:', WEBHOOK_SYSTEM_URL)
    return NextResponse.json(
      {
        error: 'Failed to connect to webhook system',
        debug: {
          webhookUrl: WEBHOOK_SYSTEM_URL,
          errorMessage,
        }
      },
      { status: 500 }
    )
  }
}
