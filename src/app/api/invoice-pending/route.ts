import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const webhookUrl = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'
    const apiKey = process.env.INVOICE_API_KEY || ''

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') || ''
    const endDate = searchParams.get('endDate') || ''
    const seller = searchParams.get('seller') || ''

    const params = new URLSearchParams()
    if (startDate) params.append('startDate', startDate)
    if (endDate) params.append('endDate', endDate)
    if (seller) params.append('seller', seller)

    const url = `${webhookUrl}/api/invoices/pending-bookings${params.toString() ? '?' + params.toString() : ''}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'x-api-key': apiKey }),
      },
    })

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
        { error: data.error || 'Failed to fetch pending bookings' },
        { status: response.status }
      )
    }

    return NextResponse.json({ data: data.data || data })
  } catch (error) {
    console.error('Error fetching pending bookings:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}
