import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const webhookUrl = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'
    const apiKey = process.env.GTM_WEBHOOK_API_KEY || ''

    const response = await fetch(`${webhookUrl}/webhook/gtm/exclusions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
    })

    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text()
      console.error('GTM webhook returned non-JSON response:', text.substring(0, 200))
      return NextResponse.json(
        { error: 'Webhook system returned an invalid response' },
        { status: 502 }
      )
    }

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to fetch exclusions' },
        { status: response.status }
      )
    }

    return NextResponse.json({ data: data.data || data })
  } catch (error) {
    console.error('Error fetching GTM exclusions:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const webhookUrl = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'
    const apiKey = process.env.GTM_WEBHOOK_API_KEY || ''
    const body = await request.json()

    const response = await fetch(`${webhookUrl}/webhook/gtm/exclusions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify(body),
    })

    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text()
      console.error('GTM webhook returned non-JSON response:', text.substring(0, 200))
      return NextResponse.json(
        { error: 'Webhook system returned an invalid response' },
        { status: 502 }
      )
    }

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to add exclusion' },
        { status: response.status }
      )
    }

    return NextResponse.json({ data: data.data || data })
  } catch (error) {
    console.error('Error adding GTM exclusion:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}
