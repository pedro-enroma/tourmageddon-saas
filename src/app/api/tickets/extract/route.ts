import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { verifySession, getServiceRoleClient } from '@/lib/supabase-server'

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
  pax_count?: number // For booking-level vouchers (e.g., Catacombe)
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
2. Individual ticket details (ticket_code, holder_name, ticket_type, price, pax_count)

SUPPORTED TICKET TYPES:
- Vatican Museums: Look for "Musei Vaticani", codes are 24 alphanumeric chars, tickets are "Biglietto Intero" (€20) or "Biglietto Ridotto" (€8)
- Colosseum: Look for "COLOSSEO" or "Parco archeologico del Colosseo", codes start with "SPC" (16 chars), various ticket types
- Pompei: Look for "Parco Archeologico di Pompei" or "ticketone", TktID codes (10 digits), "INTERO" (€19) or "Gratuito" (€0)
- Italo trains: Look for "italotreno", use "CODICE BIGLIETTO" + "RIC. N.", extract unique passengers only (appear on multiple pages)
- Trenitalia trains: Look for "TRENITALIA", use "PNR:" + "Numero Titolo:", extract unique passengers only
- Catacombe: Look for "Catacombe" or "TU ITALIA SRL" or "enroma.com". This is a PER-PERSON voucher.
  Each booking entry has: Nome (name), Numero di persone (pax count like "2 adulti + 3 minori"), Data (date), Ora (time), Catacombe (location).
  IMPORTANT: Create a SEPARATE ticket for EACH person (adult or child), NOT one ticket per booking.

RULES:
- For train tickets, passengers appear on BOTH outbound and return pages - extract each person ONLY ONCE
- For train tickets, generate ticket_code as "{CARRIER}-{BOOKING}-{INDEX}" (e.g., "ITALO-109846687-1")
- Convert all dates to YYYY-MM-DD format
- Convert all times to HH:MM format
- Use Title Case for holder names
- If ticket has no individual name (like Vatican), use "Ticket 1", "Ticket 2", etc.
- For Catacombe vouchers (CRITICAL - follow exactly):
  - Parse "Numero di persone" and create ONE ticket per person (e.g., "2 adulti + 3 minori" = 5 separate tickets)
  - For each adult: ticket_type = "Adulto", holder_name = "{BookingName} - Adulto {N}"
  - For each child (minori/bambini): ticket_type = "Minore", holder_name = "{BookingName} - Minore {N}"
  - Generate ticket_code as "CAT-{BOOKING_INDEX}-{PERSON_INDEX}" (e.g., "CAT-1-1", "CAT-1-2" for first booking's persons)
  - Use "Catacombe: {location}" as product_name (e.g., "Catacombe San Sebastiano")
  - Set price to 0 for all tickets
  - Generate booking_number as "CAT-{DATE}" (e.g., "CAT-2025-12-31")
  - Do NOT use pax_count field - each person is a separate ticket

RESPOND WITH ONLY VALID JSON in this exact structure:
{
  "booking_number": "string",
  "booking_date": "YYYY-MM-DD or null",
  "visit_date": "YYYY-MM-DD",
  "entry_time": "HH:MM",
  "product_name": "string",
  "detected_type": "vatican|colosseum|pompei|italo|trenitalia|catacombe|unknown",
  "tickets": [
    {
      "ticket_code": "string",
      "holder_name": "string",
      "ticket_type": "string",
      "price": 0.00,
      "pax_count": null
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

      // Check for rate limit error
      const errorMessage = aiError instanceof Error ? aiError.message : 'Unknown AI error'
      if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
        return NextResponse.json({
          error: 'Rate limit exceeded. Please wait a minute and try again.',
          code: 'RATE_LIMIT',
          details: errorMessage
        }, { status: 429 })
      }

      return NextResponse.json({
        error: 'AI extraction failed',
        details: errorMessage
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

    // B2B Detection and Per-Type Pricing: Check if the product matches a category
    let isB2B = false
    let b2bPriceAdjustment = 0
    let tickets = extractedData.tickets || []

    if (extractedData.product_name) {
      try {
        const supabase = getServiceRoleClient()
        const { data: categories } = await supabase
          .from('ticket_categories')
          .select('id, name, product_names, extraction_mode, default_source, b2b_indicator_text, b2b_price_adjustment')

        // Find matching category by product_name
        const normalizedProductName = extractedData.product_name.toUpperCase().trim()
        const matchingCategory = categories?.find(cat =>
          cat.product_names?.some((pn: string) => {
            const normalizedPN = pn.toUpperCase().trim()
            return normalizedPN === normalizedProductName ||
                   normalizedPN.includes(normalizedProductName) ||
                   normalizedProductName.includes(normalizedPN)
          })
        )

        if (matchingCategory) {
          const defaultSource = matchingCategory.default_source || 'auto'
          const extractionMode = matchingCategory.extraction_mode || 'per_ticket'

          // Per-Type Pricing: For per_person_type extraction, look up prices from ticket_type_mappings
          if (extractionMode === 'per_person_type') {
            console.log(`Category "${matchingCategory.name}" uses per_person_type extraction. Looking up per-type prices...`)

            const { data: typeMappings } = await supabase
              .from('ticket_type_mappings')
              .select('ticket_type, price')
              .eq('category_id', matchingCategory.id)

            if (typeMappings && typeMappings.length > 0) {
              const priceMap = new Map(typeMappings.map(m => [m.ticket_type.toLowerCase(), m.price]))
              console.log(`Found price mappings: ${JSON.stringify(Object.fromEntries(priceMap))}`)

              tickets = tickets.map(ticket => {
                const typePrice = priceMap.get(ticket.ticket_type?.toLowerCase() || '')
                if (typePrice !== undefined && typePrice !== null) {
                  return { ...ticket, price: Number(typePrice) }
                }
                return ticket
              })
            }
          }

          // B2B Detection
          if (defaultSource === 'b2b') {
            // Always B2B
            isB2B = true
            b2bPriceAdjustment = matchingCategory.b2b_price_adjustment || 0
            console.log(`Category "${matchingCategory.name}" is set to always B2B. Price adjustment: €${b2bPriceAdjustment}`)

            // For per_person_type, b2b_price_adjustment is already handled via ticket_type_mappings prices
            // Only apply adjustment if NOT using per_person_type (legacy behavior)
            if (extractionMode !== 'per_person_type' && b2bPriceAdjustment > 0) {
              tickets = tickets.map(ticket => ({
                ...ticket,
                price: Number((ticket.price + b2bPriceAdjustment).toFixed(2))
              }))
            }
          } else if (defaultSource === 'b2c') {
            // Always B2C
            isB2B = false
            console.log(`Category "${matchingCategory.name}" is set to always B2C`)
          } else if (defaultSource === 'auto' && matchingCategory.b2b_indicator_text) {
            // Auto-detect from PDF content
            console.log(`Found B2B rule for ${matchingCategory.name}: looking for "${matchingCategory.b2b_indicator_text}"`)

            // Ask Claude to check for the B2B indicator text
            const b2bCheckResponse = await anthropic.messages.create({
              model: 'claude-haiku-4-5',
              max_tokens: 100,
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
                    text: `Does this PDF contain the exact text "${matchingCategory.b2b_indicator_text}" (case-insensitive)? Answer ONLY with "yes" or "no".`
                  }
                ]
              }]
            })

            const b2bTextBlock = b2bCheckResponse.content.find(block => block.type === 'text')
            const b2bAnswer = b2bTextBlock?.type === 'text' ? b2bTextBlock.text.toLowerCase().trim() : ''

            if (b2bAnswer.includes('yes')) {
              isB2B = true
              b2bPriceAdjustment = matchingCategory.b2b_price_adjustment || 0
              console.log(`B2B detected! Applying price adjustment: €${b2bPriceAdjustment} per ticket`)

              if (extractionMode !== 'per_person_type' && b2bPriceAdjustment > 0) {
                tickets = tickets.map(ticket => ({
                  ...ticket,
                  price: Number((ticket.price + b2bPriceAdjustment).toFixed(2))
                }))
              }
            } else {
              console.log('B2B indicator not found - marking as B2C')
            }
          }
        }
      } catch (b2bError) {
        console.error('B2B detection error:', b2bError)
        // Continue without B2B detection on error
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        booking_number: extractedData.booking_number,
        booking_date: extractedData.booking_date,
        visit_date: extractedData.visit_date,
        entry_time: extractedData.entry_time,
        product_name: extractedData.product_name,
        tickets
      },
      ticketCount: extractedCount,
      pdfType,
      isB2B,
      b2bPriceAdjustment: isB2B ? b2bPriceAdjustment : 0
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
