import { NextRequest, NextResponse } from 'next/server'

const WEBHOOK_SYSTEM_URL = process.env.WEBHOOK_SYSTEM_URL || 'http://localhost:3000'

export async function GET(request: NextRequest) {
  try {
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

    const url = `${WEBHOOK_SYSTEM_URL}/api/invoices${params.toString() ? '?' + params.toString() : ''}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to fetch invoices' },
        { status: response.status }
      )
    }

    // Map ps_pratica_iri to ps_pratica_id for frontend compatibility
    const mappedData = (data.data || []).map((invoice: Record<string, unknown>) => ({
      ...invoice,
      ps_pratica_id: invoice.ps_pratica_iri || invoice.ps_pratica_id || null,
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
