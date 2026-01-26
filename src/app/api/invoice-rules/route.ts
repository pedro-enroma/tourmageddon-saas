import { NextRequest, NextResponse } from 'next/server'

const WEBHOOK_SYSTEM_URL = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'

export async function GET() {
  try {
    const response = await fetch(`${WEBHOOK_SYSTEM_URL}/api/invoices/rules`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to fetch invoice rules' },
        { status: response.status }
      )
    }

    return NextResponse.json({ data: data.data || data })
  } catch (error) {
    console.error('Error fetching invoice rules:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch(`${WEBHOOK_SYSTEM_URL}/api/invoices/rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to create invoice rule' },
        { status: response.status }
      )
    }

    return NextResponse.json({ data: data.data || data })
  } catch (error) {
    console.error('Error creating invoice rule:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}
