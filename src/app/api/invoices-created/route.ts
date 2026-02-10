import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.INVOICE_API_KEY || ''
    const webhookUrl = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'

    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') || ''
    const endDate = searchParams.get('endDate') || ''
    const status = searchParams.get('status') || ''
    const confirmationCode = searchParams.get('confirmationCode') || ''

    const params = new URLSearchParams()
    if (startDate) params.append('startDate', startDate)
    if (endDate) params.append('endDate', endDate)
    if (status) params.append('status', status)
    if (confirmationCode) params.append('confirmationCode', confirmationCode)

    const url = `${webhookUrl}/api/invoices${params.toString() ? '?' + params.toString() : ''}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'x-api-key': apiKey }),
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to fetch invoices' },
        { status: response.status }
      )
    }

    // Map webhook field names to frontend field names
    const mappedData = (data.data || []).map((invoice: Record<string, unknown>) => ({
      ...invoice,
      ps_pratica_id: invoice.ps_pratica_iri || invoice.ps_pratica_id || null,
      activity_seller: invoice.seller_name || invoice.activity_seller || null,
      sent_to_ps_at: invoice.sent_at || invoice.sent_to_ps_at || null,
      travel_date: invoice.travel_date || null,
      booking_creation_date: invoice.booking_creation_date || null,
    }))

    return NextResponse.json({ data: mappedData, count: data.count || 0 })
  } catch (error) {
    console.error('Error fetching invoices:', error)
    return NextResponse.json(
      { error: 'Failed to connect to webhook system' },
      { status: 500 }
    )
  }
}
