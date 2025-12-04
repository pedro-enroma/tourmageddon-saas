import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { extractText } from 'unpdf'
import { verifySession } from '@/lib/supabase-server'

// Maximum file size: 10MB for PDFs
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Detect PDF type based on content
type PDFType = 'colosseum' | 'vatican' | 'pompei' | 'unknown'

function detectPDFType(text: string): PDFType {
  if (text.includes('Musei Vaticani') || text.includes('Vatican Museums')) {
    return 'vatican'
  }
  if (text.includes('COLOSSEO') || text.includes('Parco archeologico del Colosseo') || text.includes('FULL EXPERIENCE')) {
    return 'colosseum'
  }
  if (text.includes('Parco Archeologico di Pompei') || text.includes('Scavi di Pompei') || text.includes('ticketone')) {
    return 'pompei'
  }
  return 'unknown'
}

const getOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY not found')
    return null
  }
  return new OpenAI({ apiKey })
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

    const openai = getOpenAI()
    if (!openai) {
      return NextResponse.json({
        error: 'OpenAI service not configured. Please set OPENAI_API_KEY.'
      }, { status: 500 })
    }

    // Extract text from PDF using unpdf
    const bytes = await file.arrayBuffer()

    console.log('Extracting text from PDF with unpdf...')
    let pdfText: string
    let pdfPages: string[] = []
    let pdfType: PDFType = 'unknown'
    try {
      const { text, totalPages } = await extractText(new Uint8Array(bytes))
      // Keep individual pages for per-ticket extraction
      pdfPages = Array.isArray(text) ? text : [text]
      pdfText = pdfPages.join('\n\n--- PAGE BREAK ---\n\n')
      console.log(`Extracted ${pdfText.length} characters from ${totalPages} pages`)

      // Detect PDF type
      pdfType = detectPDFType(pdfText)
      console.log(`Detected PDF type: ${pdfType}`)

      // Count potential tickets by looking for ticket code patterns
      const ticketCodeMatches = pdfText.match(/[A-Z0-9]{16}/g) || []
      console.log(`Found ${ticketCodeMatches.length} potential ticket codes in PDF text`)
    } catch (pdfError) {
      console.error('PDF text extraction error:', pdfError)
      return NextResponse.json({
        error: 'Failed to extract text from PDF',
        details: pdfError instanceof Error ? pdfError.message : 'Unknown error'
      }, { status: 500 })
    }

    if (!pdfText || pdfText.trim().length === 0) {
      return NextResponse.json({ error: 'No text found in PDF' }, { status: 400 })
    }

    // Pre-extract ticket codes based on PDF type
    let uniqueTicketCodes: string[] = []

    if (pdfType === 'vatican') {
      // Vatican Museums: 24-character codes at the start of each ticket
      // Pattern: alphanumeric, 24 chars, appears at start of each page
      const vaticanCodes = pdfText.match(/[A-Z0-9]{24}/g) || []
      uniqueTicketCodes = [...new Set(vaticanCodes)].filter(code =>
        !/^(.)\1+$/.test(code) && // Not all same character
        !/^0+$/.test(code) // Not all zeros
      )
    } else if (pdfType === 'pompei') {
      // Pompei/TicketOne: TktID codes (10 digits)
      // Pattern: TktID: 0515690053
      const tktIdMatches = pdfText.match(/TktID:\s*(\d{10})/g) || []
      uniqueTicketCodes = [...new Set(tktIdMatches.map(m => {
        const match = m.match(/TktID:\s*(\d{10})/)
        return match ? match[1] : ''
      }))].filter(code => code.length > 0)
    } else {
      // Colosseum: 16-character codes starting with SPC
      const allCodes = pdfText.match(/[A-Z0-9]{16}/g) || []
      uniqueTicketCodes = [...new Set(allCodes)].filter(code =>
        !/^(.)\1+$/.test(code) && // Not all same character
        /^SPC/.test(code) // Ticket codes typically start with SPC
      )
    }
    const expectedTicketCount = uniqueTicketCodes.length

    console.log(`Pre-extracted ${expectedTicketCount} ticket codes (${pdfType}): ${uniqueTicketCodes.slice(0, 5).join(', ')}${uniqueTicketCodes.length > 5 ? '...' : ''}`)

    // Use GPT-4o to extract structured data - but we'll also do our own extraction
    console.log('Sending text to GPT-4o...')

    // Different prompts based on PDF type
    let systemPrompt: string

    if (pdfType === 'vatican') {
      systemPrompt = `You are a data extraction assistant. Extract ticket information from Vatican Museums PDF text.

The PDF contains ${expectedTicketCount} electronic tickets. Vatican tickets do NOT have individual holder names - they are generic group tickets.

For EACH ticket code listed below, extract:
- holder_name: Set to "Ticket X" where X is the Pax number (e.g., "Ticket 1", "Ticket 2")
- ticket_type: The ticket type - either "Biglietto Intero" (Full Price) or "Biglietto Ridotto" (Reduced)
- price: The ticket price (20.00 for Intero, 8.00 for Ridotto - NOT including fees)

Also extract shared info:
- booking_number: The Codice/Code (e.g., "2L0ZU3V19KJMMVPDT")
- booking_date: The Data Emissione/Issue Date (convert to YYYY-MM-DD)
- visit_date: The Data/Date of visit (convert to YYYY-MM-DD)
- entry_time: The Ora/Time (HH:MM format)
- product_name: "Musei Vaticani"

TICKET CODES TO EXTRACT (${expectedTicketCount} total):
${uniqueTicketCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

Return JSON with this structure:
{
  "booking_number": "...",
  "booking_date": "...",
  "visit_date": "...",
  "entry_time": "...",
  "product_name": "Musei Vaticani",
  "tickets": [
    {"ticket_code": "...", "holder_name": "Ticket 1", "ticket_type": "Biglietto Intero", "price": 20.00}
  ]
}

IMPORTANT: You MUST return exactly ${expectedTicketCount} tickets in the tickets array - one for each code listed above.`
    } else if (pdfType === 'pompei') {
      systemPrompt = `You are a data extraction assistant. Extract ticket information from Pompei/TicketOne PDF text.

The PDF contains ${expectedTicketCount} electronic tickets for Parco Archeologico di Pompei.

For EACH ticket (one per page), extract:
- holder_name: The person's full name. The name appears on the right side of the ticket in format "LastName" on one line, then "FirstName" below. Combine as "FirstName LastName" (Title Case).
- ticket_type: Either "INTERO" (full price, €18-19) or "Gratuito 18 anni e alt" (free ticket, €0)
- price: The total price (Totale) - 19.00 EUR for INTERO, 0.00 for Gratuito

Also extract shared info:
- booking_number: The "Numero ordine" (e.g., "1282101109")
- booking_date: The "Data ordine" (convert to YYYY-MM-DD, format is DD.MM.YYYY)
- visit_date: The "Data:" in the ticket section (convert Italian month to YYYY-MM-DD, e.g., "14 Novembre 2025" -> "2025-11-14")
- entry_time: The "Ore:" time (e.g., "09:00")
- product_name: "Scavi di Pompei"

TICKET CODES (TktID) TO EXTRACT (${expectedTicketCount} total):
${uniqueTicketCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

Return JSON with this structure:
{
  "booking_number": "...",
  "booking_date": "...",
  "visit_date": "...",
  "entry_time": "...",
  "product_name": "Scavi di Pompei",
  "tickets": [
    {"ticket_code": "...", "holder_name": "FirstName LastName", "ticket_type": "INTERO", "price": 19.00}
  ]
}

IMPORTANT: You MUST return exactly ${expectedTicketCount} tickets in the tickets array - one for each TktID listed above.`
    } else {
      systemPrompt = `You are a data extraction assistant. Extract ticket information from PDF text.

The PDF contains ${expectedTicketCount} electronic tickets. For EACH ticket code listed below, extract:
- holder_name: The person's name (Title Case)
- ticket_type: The ticket category (e.g., "Intero Full Experience", "Guide turistiche con tesserino Full Experience Gru. e Scuole")
- price: The price as a number

Also extract shared info:
- booking_number: The reservation number (format: OCO followed by numbers)
- booking_date: When the booking was made (ISO 8601)
- visit_date: The date of the visit (YYYY-MM-DD)
- entry_time: The entry time slot (HH:MM)
- product_name: The product/attraction name

TICKET CODES TO EXTRACT (${expectedTicketCount} total):
${uniqueTicketCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

Return JSON with this structure:
{
  "booking_number": "...",
  "booking_date": "...",
  "visit_date": "...",
  "entry_time": "...",
  "product_name": "...",
  "tickets": [
    {"ticket_code": "...", "holder_name": "...", "ticket_type": "...", "price": 0.00}
  ]
}

IMPORTANT: You MUST return exactly ${expectedTicketCount} tickets in the tickets array - one for each code listed above.`
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Extract data for all ${expectedTicketCount} tickets. Here is the PDF text:\n\n${pdfText}`
        }
      ],
      max_tokens: 16000,
      response_format: { type: 'json_object' }
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    // Parse the JSON response
    let extractedData: ExtractedVoucher
    try {
      extractedData = JSON.parse(content)
    } catch {
      console.error('Failed to parse AI response:', content)
      return NextResponse.json({
        error: 'Failed to parse AI response',
        rawResponse: content
      }, { status: 500 })
    }

    // Validate required fields
    if (!extractedData.booking_number || !extractedData.visit_date || !extractedData.entry_time) {
      console.error('Missing required fields. GPT returned:', JSON.stringify(extractedData, null, 2))
      return NextResponse.json({
        error: 'Missing required fields in extracted data',
        details: `booking_number: ${extractedData.booking_number || 'MISSING'}, visit_date: ${extractedData.visit_date || 'MISSING'}, entry_time: ${extractedData.entry_time || 'MISSING'}`,
        data: extractedData
      }, { status: 400 })
    }

    // CRITICAL: Ensure all ticket codes are included
    // GPT sometimes misses tickets, so we add any missing codes
    const extractedCodes = new Set((extractedData.tickets || []).map(t => t.ticket_code))
    const missingCodes = uniqueTicketCodes.filter(code => !extractedCodes.has(code))

    if (missingCodes.length > 0) {
      console.log(`GPT missed ${missingCodes.length} tickets. Adding them manually...`)

      // For each missing code, try to extract info from the page containing it
      for (const code of missingCodes) {
        // Find which page contains this code
        const pageIndex = pdfPages.findIndex(page => page.includes(code))
        const pageText = pageIndex >= 0 ? pdfPages[pageIndex] : pdfText

        let holderName = 'Unknown'
        let ticketType = 'Unknown'
        let price = 0

        const codePos = pageText.indexOf(code)
        if (codePos >= 0) {
          // Get text around the code
          const after = pageText.substring(codePos, Math.min(pageText.length, codePos + 1000))

          if (pdfType === 'vatican') {
            // Vatican: Extract Pax number and ticket type
            const paxMatch = after.match(/Pax:\s*(\d+)\s*-\s*\d+/)
            if (paxMatch) {
              holderName = `Ticket ${paxMatch[1]}`
            }

            // Check for Ridotto (reduced) or Intero (full)
            if (after.includes('Biglietto Ridotto') || after.includes('Reduced Ticket')) {
              ticketType = 'Biglietto Ridotto'
              price = 8.00
            } else {
              ticketType = 'Biglietto Intero'
              price = 20.00
            }
          } else if (pdfType === 'pompei') {
            // Pompei/TicketOne: Extract name and ticket type
            // Names appear as "LastName\nFirstName" pattern
            const nameMatch = pageText.match(/Parco Archeologico di Pompei\s+([A-Za-zÀ-ÿ\s]+)\n([A-Za-zÀ-ÿ\s]+)\n/i)
            if (nameMatch) {
              const lastName = nameMatch[1].trim()
              const firstName = nameMatch[2].trim()
              holderName = `${firstName} ${lastName}`
            }

            // Check for Gratuito (free) or INTERO (full price)
            if (pageText.includes('Gratuito') || pageText.includes('€ 0,00')) {
              ticketType = 'Gratuito 18 anni e alt'
              price = 0
            } else {
              ticketType = 'INTERO'
              // Look for Totale price
              const priceMatch = pageText.match(/Totale:\s*(\d+)[,.](\d{2})\s*EUR/i)
              if (priceMatch) {
                price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`)
              } else {
                price = 19.00 // Default Pompei full price
              }
            }
          } else {
            // Colosseum: Extract holder name and ticket type
            const before = pageText.substring(Math.max(0, codePos - 500), codePos)

            // Look for name patterns - usually Title Case names
            const nameMatch = before.match(/([A-ZÀÈÌÒÙÁÉÍÓÚ][a-zàèìòùáéíóú]+(?:\s+[A-ZÀÈÌÒÙÁÉÍÓÚ][a-zàèìòùáéíóú]+)+)\s*$/m)
              || after.match(/^\s*([A-ZÀÈÌÒÙÁÉÍÓÚ][a-zàèìòùáéíóú]+(?:\s+[A-ZÀÈÌÒÙÁÉÍÓÚ][a-zàèìòùáéíóú]+)+)/m)

            if (nameMatch) {
              holderName = nameMatch[1].trim()
            }

            // Look for ticket type
            const typeMatch = pageText.match(/(Intero\s+Full\s+Experience|Guide\s+turistiche[^0-9]*|Gratuito[^0-9]*|Ridotto[^0-9]*)/i)
            if (typeMatch) {
              ticketType = typeMatch[1].trim()
            }

            // Look for price
            const priceMatch = pageText.match(/(\d+)[,.](\d{2})\s*EUR/i)
            if (priceMatch) {
              price = parseFloat(`${priceMatch[1]}.${priceMatch[2]}`)
            }
          }
        }

        // Add the missing ticket
        if (!extractedData.tickets) extractedData.tickets = []
        extractedData.tickets.push({
          ticket_code: code,
          holder_name: holderName,
          ticket_type: ticketType,
          price
        })
      }
    }

    const extractedCount = extractedData.tickets?.length || 0
    console.log(`Final ticket count: ${extractedCount} (expected ${expectedTicketCount})`)

    return NextResponse.json({
      success: true,
      data: extractedData,
      ticketCount: extractedCount,
      potentialTicketCodes: expectedTicketCount,
      pdfType,
      warning: expectedTicketCount > extractedCount
        ? `Warning: Found ${expectedTicketCount} potential ticket codes in PDF but only extracted ${extractedCount} tickets`
        : undefined
    })

  } catch (error) {
    console.error('PDF extraction error:', error)
    return NextResponse.json(
      {
        error: 'Failed to extract data from PDF',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
