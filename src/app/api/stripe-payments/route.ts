import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const webhookUrl = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'

    const searchParams = request.nextUrl.searchParams
    const limit = searchParams.get('limit') || ''
    const status = searchParams.get('status') || ''
    const isBokun = searchParams.get('is_bokun') || ''

    const params = new URLSearchParams()
    if (limit) params.append('limit', limit)
    if (status) params.append('status', status)
    if (isBokun) params.append('is_bokun', isBokun)

    const url = `${webhookUrl}/webhook/stripe/payments${params.toString() ? '?' + params.toString() : ''}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to fetch stripe payments' },
        { status: response.status }
      )
    }

    return NextResponse.json({ count: data.count || 0, payments: data.payments || [] })
  } catch (error) {
    console.error('Error fetching stripe payments:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}
