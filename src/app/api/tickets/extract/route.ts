import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { extractText } from 'unpdf'

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
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
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
    try {
      const { text, totalPages } = await extractText(new Uint8Array(bytes))
      // text can be an array of strings (one per page) or a single string
      pdfText = Array.isArray(text) ? text.join('\n') : text
      console.log(`Extracted ${pdfText.length} characters from ${totalPages} pages`)
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

    // Use GPT-4o to extract structured data from text
    console.log('Sending text to GPT-4o...')
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a data extraction assistant. Extract ticket information from PDF text content.

The text is extracted from electronic tickets (BIGLIETTO ELETTRONICO) for attractions like the Colosseum.
Each ticket typically contains the following information:
- Booking/Reservation number (Prenotazione n.) - format like "OCO3058684"
- Booking date and time
- Ticket code (alphanumeric code like "SPCOXW5QDWZJQ7DK")
- Holder name (e.g., "GARCIA MARTIN LUCIA")
- Ticket type (e.g., "Intero", "Ridotto", "Gratuito - Under 18", "Guide turistiche con tesserino Gruppi e Scuole")
- Price in EUR (e.g., "0,00 EUR" or "18,00 EUR")
- Visit date (Data validità)
- Entry time (Fascia oraria)
- Product name (e.g., "COLOSSEO-FORO ROMANO PALATINO 24H - GRUPPI")

Return a JSON object with the following structure:
{
  "booking_number": "OCO3058684",
  "booking_date": "2025-11-03T16:39:00",
  "visit_date": "2025-11-11",
  "entry_time": "12:45",
  "product_name": "COLOSSEO-FORO ROMANO PALATINO 24H - GRUPPI",
  "tickets": [
    {
      "ticket_code": "SPCOXW5QDWZJQ7DK",
      "holder_name": "Nora Fernandez Gomez",
      "ticket_type": "Gratuito - Under 18",
      "price": 0.00
    }
  ]
}

Important:
- Extract ALL tickets from the text
- Use ISO 8601 format for dates (YYYY-MM-DD)
- Use 24h format for times (HH:MM)
- Extract the exact ticket type as written
- Price should be a number (convert "18,00 EUR" to 18.00)
- Holder name should be properly capitalized (Title Case)`
        },
        {
          role: 'user',
          content: `Extract all ticket information from this PDF text. Return only valid JSON, no markdown formatting.\n\nPDF Text:\n${pdfText}`
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

    return NextResponse.json({
      success: true,
      data: extractedData,
      ticketCount: extractedData.tickets?.length || 0
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
