import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { extractText } from 'unpdf'
import { verifySession } from '@/lib/supabase-server'

// Maximum file size: 10MB for PDFs
const MAX_FILE_SIZE = 10 * 1024 * 1024

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
    try {
      const { text, totalPages } = await extractText(new Uint8Array(bytes))
      // Keep individual pages for per-ticket extraction
      pdfPages = Array.isArray(text) ? text : [text]
      pdfText = pdfPages.join('\n\n--- PAGE BREAK ---\n\n')
      console.log(`Extracted ${pdfText.length} characters from ${totalPages} pages`)

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

    // Pre-extract ticket codes
    const allCodes = pdfText.match(/[A-Z0-9]{16}/g) || []
    const uniqueTicketCodes = [...new Set(allCodes)].filter(code =>
      !/^(.)\1+$/.test(code) && // Not all same character
      /^SPC/.test(code) // Ticket codes typically start with SPC
    )
    const expectedTicketCount = uniqueTicketCodes.length

    console.log(`Pre-extracted ${expectedTicketCount} ticket codes: ${uniqueTicketCodes.join(', ')}`)

    // Use GPT-4o to extract structured data - but we'll also do our own extraction
    console.log('Sending text to GPT-4o...')
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a data extraction assistant. Extract ticket information from PDF text.

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
      return NextResponse.json({
        error: 'Missing required fields in extracted data',
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

        // Try to extract holder name from the page
        // In these tickets, names are typically in UPPERCASE on their own line
        let holderName = 'Unknown'
        let ticketType = 'Unknown'
        let price = 0

        // The name is usually right after the ticket code or near "Intestatario"
        const codePos = pageText.indexOf(code)
        if (codePos >= 0) {
          // Get text around the code
          const before = pageText.substring(Math.max(0, codePos - 500), codePos)
          const after = pageText.substring(codePos, Math.min(pageText.length, codePos + 500))

          // Look for name patterns - usually UPPERCASE names
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
