import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const webhookUrl = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'
    const apiKey = process.env.INVOICE_API_KEY || ''
    const { id } = await params

    const response = await fetch(`${webhookUrl}/api/invoices/rules/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'x-api-key': apiKey }),
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to fetch invoice rule' },
        { status: response.status }
      )
    }

    return NextResponse.json({ data: data.data || data })
  } catch (error) {
    console.error('Error fetching invoice rule:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const webhookUrl = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'
    const apiKey = process.env.INVOICE_API_KEY || ''
    const { id } = await params
    const body = await request.json()

    const response = await fetch(`${webhookUrl}/api/invoices/rules/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'x-api-key': apiKey }),
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to update invoice rule' },
        { status: response.status }
      )
    }

    return NextResponse.json({ data: data.data || data })
  } catch (error) {
    console.error('Error updating invoice rule:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const webhookUrl = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'
    const apiKey = process.env.INVOICE_API_KEY || ''
    const { id } = await params

    const response = await fetch(`${webhookUrl}/api/invoices/rules/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'x-api-key': apiKey }),
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to delete invoice rule' },
        { status: response.status }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting invoice rule:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}
