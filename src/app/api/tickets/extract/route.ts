import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { extractText } from 'unpdf'
import { verifySession } from '@/lib/supabase-server'

// Maximum file size: 10MB for PDFs
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Detect PDF type based on content
type PDFType = 'colosseum' | 'vatican' | 'pompei' | 'italo' | 'trenitalia' | 'unknown'

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
  if (text.includes('italotreno') || text.includes('Italo -') || text.includes('CODICE BIGLIETTO')) {
    return 'italo'
  }
  if (text.includes('TRENITALIA') || text.includes('trenitalia.com') || text.includes('Frecciarossa')) {
    return 'trenitalia'
  }
  return 'unknown'
}

const getGoogleAI = () => {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    console.error('GOOGLE_AI_API_KEY not found')
    return null
  }
  return new GoogleGenerativeAI(apiKey)
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

    const genAI = getGoogleAI()
    if (!genAI) {
      return NextResponse.json({
        error: 'Google AI service not configured. Please set GOOGLE_AI_API_KEY.'
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
    } else if (pdfType === 'italo' || pdfType === 'trenitalia') {
      // Train tickets don't have per-passenger codes like museum entries
      // All passengers share the same booking code (CODICE BIGLIETTO or PNR)
      // Gemini will extract unique passengers and generate synthetic ticket codes
      // We leave uniqueTicketCodes empty - the count will be determined by Gemini
      uniqueTicketCodes = []
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

    // Use Gemini to extract structured data - but we'll also do our own extraction
    console.log('Sending text to Gemini...')

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
    } else if (pdfType === 'italo') {
      systemPrompt = `You are extracting train ticket info from an Italo PDF.

This PDF contains a round-trip train booking. Extract UNIQUE passengers only (they appear on both outbound and return journey pages).

Extract shared booking info:
- booking_number: Combine "CODICE BIGLIETTO" and "RIC. N." as "{code} (RIC: {ric_n})" e.g., "YKVCYX (RIC: 109846687)"
- booking_date: From "DATA DI ACQUISTO" (convert Italian month to YYYY-MM-DD, e.g., "21 nov 2025" -> "2025-11-21")
- visit_date: From "DATA PARTENZA" of the FIRST journey only (convert Italian month, e.g., "08 DIC 2025" -> "2025-12-08")
- entry_time: From "PARTENZA" departure time of FIRST journey (e.g., "07:40")
- product_name: The route of FIRST journey, e.g., "ROMA TER. - NAPOLI C."

For each UNIQUE passenger (deduplicated across all pages):
- holder_name: Full name in Title Case (e.g., "Ana Maria Gonzalez Burgos", "Jose Maria De La Duena")
- ticket_type: "ADULTO" or "BAMBINO" exactly as shown
- price: Individual ticket price from "Prezzo" section (before discounts), e.g., 42.90 for adult
- ticket_code: Generate as "ITALO-{RIC_N}-{index}" where RIC_N is from "RIC. N." and index is 1,2,3,4...

CRITICAL RULES:
1. Each passenger appears on MULTIPLE pages (outbound + return). Include each name ONLY ONCE.
2. Look for the "NOME PASSEGGERO" table on each page to find all passengers.
3. The same 4 passengers appear on page 1 (outbound) and page 2 (return) - extract only 4 unique tickets.

Return JSON:
{
  "booking_number": "YKVCYX (RIC: 109846687)",
  "booking_date": "2025-11-21",
  "visit_date": "2025-12-08",
  "entry_time": "07:40",
  "product_name": "ROMA TER. - NAPOLI C.",
  "tickets": [
    {"ticket_code": "ITALO-109846687-1", "holder_name": "Ana Maria Gonzalez Burgos", "ticket_type": "ADULTO", "price": 42.90},
    {"ticket_code": "ITALO-109846687-2", "holder_name": "Jose Maria De La Duena", "ticket_type": "ADULTO", "price": 42.90}
  ]
}`
    } else if (pdfType === 'trenitalia') {
      systemPrompt = `You are extracting train ticket info from a Trenitalia PDF.

This PDF contains a round-trip train booking. Extract UNIQUE passengers only (they appear on both outbound and return journey pages).

Extract shared booking info:
- booking_number: Combine "PNR:" and "Numero Titolo:" as "{pnr} (Titolo: {numero})" e.g., "JQX7B5 (Titolo: 2654241724)"
- booking_date: From "Data Emissione" (convert DD/MM/YYYY to YYYY-MM-DD, e.g., "15/10/2025" -> "2025-10-15")
- visit_date: The date of FIRST journey only (convert DD/MM/YYYY to YYYY-MM-DD from the first "Stazione di Partenza" section)
- entry_time: The departure time "Ore" of FIRST journey (e.g., "07:00")
- product_name: The route of FIRST journey as "Stazione Partenza - Stazione Arrivo", e.g., "Roma Termini - Napoli Centrale"

For each UNIQUE passenger (deduplicated across all pages):
- holder_name: Full name in Title Case from "Nome Passeggero" sections (e.g., "Cenobio Moreno Zarano")
- ticket_type: The type shown in parentheses: "Adulto" or "Ragazzo"
- price: For FrecciaFAMILY, adults pay full price and Ragazzo is free (0). Calculate adult price as Importo totale / number of adults.
- ticket_code: Generate as "TRENI-{PNR}-{index}" where PNR is the booking code and index is 1,2,3,4...

CRITICAL RULES:
1. Each passenger appears on MULTIPLE pages (outbound journey + return journey). Include each name ONLY ONCE.
2. Look for "Nome Passeggero (Adulto)" and "Nome Passeggero (Ragazzo)" sections.
3. Pages 1-2 are outbound journey, pages 3-4 are return - same passengers appear in both.
4. The "Numero Titolo" may differ between outbound and return - use the FIRST one.

Return JSON:
{
  "booking_number": "JQX7B5 (Titolo: 2654241724)",
  "booking_date": "2025-10-15",
  "visit_date": "2025-11-06",
  "entry_time": "07:00",
  "product_name": "Roma Termini - Napoli Centrale",
  "tickets": [
    {"ticket_code": "TRENI-JQX7B5-1", "holder_name": "Cenobio Moreno Zarano", "ticket_type": "Adulto", "price": 24.00},
    {"ticket_code": "TRENI-JQX7B5-2", "holder_name": "Juana Magali Cordoba Leal", "ticket_type": "Adulto", "price": 24.00}
  ]
}`
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

    // For train PDFs, we don't know the ticket count in advance
    const userMessage = (pdfType === 'italo' || pdfType === 'trenitalia')
      ? `Extract all unique passengers from this train ticket PDF. Here is the PDF text:\n\n${pdfText}`
      : `Extract data for all ${expectedTicketCount} tickets. Here is the PDF text:\n\n${pdfText}`

    // Add JSON instruction to prompt for Gemini
    const fullPrompt = `${systemPrompt}\n\nIMPORTANT: Respond with ONLY valid JSON, no markdown code blocks, no explanatory text before or after.\n\n${userMessage}`

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json'
      }
    })

    const result = await model.generateContent(fullPrompt)
    const response = result.response
    const content = response.text()
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
      console.error('Missing required fields. Gemini returned:', JSON.stringify(extractedData, null, 2))
      return NextResponse.json({
        error: 'Missing required fields in extracted data',
        details: `booking_number: ${extractedData.booking_number || 'MISSING'}, visit_date: ${extractedData.visit_date || 'MISSING'}, entry_time: ${extractedData.entry_time || 'MISSING'}`,
        data: extractedData
      }, { status: 400 })
    }

    // For train PDFs, if Gemini returned no tickets, try manual extraction
    if ((pdfType === 'italo' || pdfType === 'trenitalia') && (!extractedData.tickets || extractedData.tickets.length === 0)) {
      console.log(`Gemini returned no tickets for ${pdfType}. Attempting manual extraction...`)
      extractedData.tickets = []

      if (pdfType === 'italo') {
        // Extract RIC number for ticket codes
        const ricMatch = pdfText.match(/RIC\. N\.\s*(\d+)/)
        const ricNum = ricMatch ? ricMatch[1] : 'UNKNOWN'

        // Extract unique passengers from "NOME PASSEGGERO" sections
        // Pattern: NAME (uppercase or mixed) followed by ADULTO or BAMBINO
        const passengerMatches = pdfText.matchAll(/([A-ZÀÈÌÒÙÁÉÍÓÚ][A-Za-zÀ-ÿ\s]+?)\s+(ADULTO|BAMBINO)/g)
        const uniquePassengers = new Map<string, string>()

        for (const match of passengerMatches) {
          const name = match[1].trim().split(/\s+/).map(w =>
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          ).join(' ')
          if (!uniquePassengers.has(name)) {
            uniquePassengers.set(name, match[2])
          }
        }

        let index = 1
        for (const [name, type] of uniquePassengers) {
          extractedData.tickets.push({
            ticket_code: `ITALO-${ricNum}-${index}`,
            holder_name: name,
            ticket_type: type,
            price: type === 'ADULTO' ? 42.90 : 21.45 // Default prices
          })
          index++
        }
      } else if (pdfType === 'trenitalia') {
        // Extract PNR for ticket codes
        const pnrMatch = pdfText.match(/PNR:\s*([A-Z0-9]+)/)
        const pnr = pnrMatch ? pnrMatch[1] : 'UNKNOWN'

        // Extract unique passengers from "Nome Passeggero (Adulto/Ragazzo)" sections
        const passengerMatches = pdfText.matchAll(/Nome Passeggero \((Adulto|Ragazzo)\)\s*\n([A-ZÀÈÌÒÙÁÉÍÓÚ][A-Za-zÀ-ÿ\s]+)/g)
        const uniquePassengers = new Map<string, string>()

        for (const match of passengerMatches) {
          const type = match[1]
          const name = match[2].trim().split(/\s+/).map(w =>
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          ).join(' ')
          if (!uniquePassengers.has(name)) {
            uniquePassengers.set(name, type)
          }
        }

        let index = 1
        for (const [name, type] of uniquePassengers) {
          extractedData.tickets.push({
            ticket_code: `TRENI-${pnr}-${index}`,
            holder_name: name,
            ticket_type: type,
            price: type === 'Adulto' ? 24.00 : 0 // Ragazzo is typically free in FrecciaFAMILY
          })
          index++
        }
      }

      console.log(`Manual extraction found ${extractedData.tickets.length} passengers`)
    }

    // CRITICAL: Ensure all ticket codes are included
    // Gemini sometimes misses tickets, so we add any missing codes
    const extractedCodes = new Set((extractedData.tickets || []).map(t => t.ticket_code))
    const missingCodes = uniqueTicketCodes.filter(code => !extractedCodes.has(code))

    if (missingCodes.length > 0) {
      console.log(`Gemini missed ${missingCodes.length} tickets. Adding them manually...`)

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
