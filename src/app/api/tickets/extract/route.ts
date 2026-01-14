import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { verifySession } from '@/lib/supabase-server'

// Maximum file size: 10MB for PDFs
const MAX_FILE_SIZE = 10 * 1024 * 1024

const getAnthropic = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not found')
    return null
  }
  return new Anthropic({ apiKey })
}

interface ExtractedTicket {
  ticket_code: string
  holder_name: string
  ticket_type: string
  price: number
}

interface ExtractedVoucher {
  booking_number: string
  booking_date: string | null
  visit_date: string
  entry_time: string
  product_name: string
  tickets: ExtractedTicket[]
}

export async function POST(request: NextRequest) {
  // Verify authentication
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 413 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
    }

    const anthropic = getAnthropic()
    if (!anthropic) {
      return NextResponse.json({
        error: 'Anthropic API not configured. Please set ANTHROPIC_API_KEY.'
      }, { status: 500 })
    }

    // Convert PDF to base64 for Claude's native PDF support
    const bytes = await file.arrayBuffer()
    const pdfBase64 = Buffer.from(bytes).toString('base64')

    console.log(`Processing PDF: ${file.name}, size: ${file.size} bytes`)

    const systemPrompt = `You are a ticket/voucher data extraction assistant. Extract structured information from PDF tickets.

You will analyze the PDF and extract:
1. Booking information (booking_number, booking_date, visit_date, entry_time, product_name)
2. Individual ticket details (ticket_code, holder_name, ticket_type, price)

SUPPORTED TICKET TYPES:
- Vatican Museums: Look for "Musei Vaticani", codes are 24 alphanumeric chars, tickets are "Biglietto Intero" (€20) or "Biglietto Ridotto" (€8)
- Colosseum: Look for "COLOSSEO" or "Parco archeologico del Colosseo", codes start with "SPC" (16 chars), various ticket types
- Pompei: Look for "Parco Archeologico di Pompei" or "ticketone", TktID codes (10 digits), "INTERO" (€19) or "Gratuito" (€0)
- Italo trains: Look for "italotreno", use "CODICE BIGLIETTO" + "RIC. N.", extract unique passengers only (appear on multiple pages)
- Trenitalia trains: Look for "TRENITALIA", use "PNR:" + "Numero Titolo:", extract unique passengers only

RULES:
- For train tickets, passengers appear on BOTH outbound and return pages - extract each person ONLY ONCE
- For train tickets, generate ticket_code as "{CARRIER}-{BOOKING}-{INDEX}" (e.g., "ITALO-109846687-1")
- Convert all dates to YYYY-MM-DD format
- Convert all times to HH:MM format
- Use Title Case for holder names
- If ticket has no individual name (like Vatican), use "Ticket 1", "Ticket 2", etc.

RESPOND WITH ONLY VALID JSON in this exact structure:
{
  "booking_number": "string",
  "booking_date": "YYYY-MM-DD or null",
  "visit_date": "YYYY-MM-DD",
  "entry_time": "HH:MM",
  "product_name": "string",
  "detected_type": "vatican|colosseum|pompei|italo|trenitalia|unknown",
  "tickets": [
    {
      "ticket_code": "string",
      "holder_name": "string",
      "ticket_type": "string",
      "price": 0.00
    }
  ]
}`

    console.log('Sending PDF to Claude Haiku 4.5...')

    let content: string
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64
              }
            },
            {
              type: 'text',
              text: 'Extract all ticket information from this PDF voucher. Return ONLY valid JSON, no markdown or explanation.'
            }
          ]
        }],
        system: systemPrompt
      })

      // Extract text from response
      const textBlock = response.content.find(block => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        return NextResponse.json({ error: 'No text response from AI' }, { status: 500 })
      }
      content = textBlock.text

      console.log(`Claude response received, usage: ${response.usage.input_tokens} input, ${response.usage.output_tokens} output tokens`)
    } catch (aiError) {
      console.error('Claude API error:', aiError)
      return NextResponse.json({
        error: 'AI extraction failed',
        details: aiError instanceof Error ? aiError.message : 'Unknown AI error'
      }, { status: 500 })
    }

    // Parse the JSON response - handle potential markdown code blocks
    let extractedData: ExtractedVoucher & { detected_type?: string }
    try {
      // Remove markdown code blocks if present
      let jsonContent = content.trim()
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7)
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3)
      }
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.slice(0, -3)
      }
      jsonContent = jsonContent.trim()

      extractedData = JSON.parse(jsonContent)
    } catch {
      console.error('Failed to parse AI response:', content)
      return NextResponse.json({
        error: 'Failed to parse AI response',
        rawResponse: content
      }, { status: 500 })
    }

    // Validate required fields
    if (!extractedData.booking_number || !extractedData.visit_date || !extractedData.entry_time) {
      console.error('Missing required fields. Claude returned:', JSON.stringify(extractedData, null, 2))
      return NextResponse.json({
        error: 'Missing required fields in extracted data',
        details: `booking_number: ${extractedData.booking_number || 'MISSING'}, visit_date: ${extractedData.visit_date || 'MISSING'}, entry_time: ${extractedData.entry_time || 'MISSING'}`,
        data: extractedData
      }, { status: 400 })
    }

    const extractedCount = extractedData.tickets?.length || 0
    const pdfType = extractedData.detected_type || 'unknown'
    console.log(`Extraction complete: ${extractedCount} tickets, type: ${pdfType}`)

    return NextResponse.json({
      success: true,
      data: {
        booking_number: extractedData.booking_number,
        booking_date: extractedData.booking_date,
        visit_date: extractedData.visit_date,
        entry_time: extractedData.entry_time,
        product_name: extractedData.product_name,
        tickets: extractedData.tickets || []
      },
      ticketCount: extractedCount,
      pdfType
    })

  } catch (error) {
    console.error('PDF extraction error:', error)
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack)
    }
    return NextResponse.json(
      {
        error: 'Failed to extract data from PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.name : typeof error
      },
      { status: 500 }
    )
  }
}
