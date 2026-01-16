import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib'
import * as fs from 'fs'
import * as path from 'path'

// Pax breakdown: maps ticket_type to quantity (e.g., { "Adulto": 2, "Minore": 1, "Infante": 1 })
type PaxBreakdown = Record<string, number>

interface CustomerBooking {
  name: string
  phone: string
  paxBreakdown: PaxBreakdown
}

interface VoucherRequestPDFData {
  requestId: string
  partnerName: string
  companyName: string // e.g., "TU ITALIA SRL"
  activityName: string
  activityLocation: string // e.g., "San Sebastiano"
  visitDate: string
  entryTime: string
  language: string
  customers: CustomerBooking[]
  totalPax: number
  notes?: string
}

// Helper to format pax breakdown as string (e.g., "2 Adulto + 1 Minore + 1 Infante")
function formatPaxBreakdown(paxBreakdown: PaxBreakdown): string {
  const parts: string[] = []

  // Define preferred order for display
  const order = ['Adulto', 'Minore', 'Infante']
  const processed = new Set<string>()

  // First, add items in preferred order
  for (const ticketType of order) {
    if (paxBreakdown[ticketType] && paxBreakdown[ticketType] > 0) {
      parts.push(`${paxBreakdown[ticketType]} ${ticketType}`)
      processed.add(ticketType)
    }
  }

  // Then add any remaining items not in the preferred order
  for (const [ticketType, qty] of Object.entries(paxBreakdown)) {
    if (!processed.has(ticketType) && qty > 0) {
      parts.push(`${qty} ${ticketType}`)
    }
  }

  return parts.length > 0 ? parts.join(' + ') : '-'
}

// Helper to draw a bullet point
function drawBullet(page: PDFPage, x: number, y: number, font: PDFFont, boldFont: PDFFont, label: string, value: string, fontSize: number = 11) {
  const bulletSize = 4
  const black = rgb(0, 0, 0)

  // Draw bullet
  page.drawCircle({
    x: x + bulletSize / 2,
    y: y + 3,
    size: bulletSize / 2,
    color: black
  })

  // Draw bold label
  page.drawText(`${label}: `, {
    x: x + 15,
    y,
    size: fontSize,
    font: boldFont,
    color: black
  })

  const labelWidth = boldFont.widthOfTextAtSize(`${label}: `, fontSize)

  // Draw value
  page.drawText(value, {
    x: x + 15 + labelWidth,
    y,
    size: fontSize,
    font: font,
    color: black
  })
}

export async function generateVoucherRequestPDF(data: VoucherRequestPDFData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  let page = pdfDoc.addPage([595, 842]) // A4 size
  const { width, height } = page.getSize()

  // Load fonts
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // Colors
  const black = rgb(0, 0, 0)

  const margin = 50
  let y = height - 60

  // --- LOGO AREA (top right) ---
  // Try to load the actual logo image
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo-enroma.png')
    if (fs.existsSync(logoPath)) {
      const logoBytes = fs.readFileSync(logoPath)
      const logoImage = await pdfDoc.embedPng(logoBytes)

      // Scale logo to fit nicely (about 80px wide)
      const logoScale = 80 / logoImage.width
      const logoWidth = logoImage.width * logoScale
      const logoHeight = logoImage.height * logoScale

      page.drawImage(logoImage, {
        x: width - margin - logoWidth,
        y: height - 40 - logoHeight,
        width: logoWidth,
        height: logoHeight,
      })
    } else {
      // Fallback to text-based logo if image not found
      drawTextLogo(page, width, y, helveticaBold)
    }
  } catch (error) {
    // Fallback to text-based logo on error
    console.error('Error loading logo:', error)
    drawTextLogo(page, width, y, helveticaBold)
  }

  y = height - 140

  // --- GREETING ---
  page.drawText('Buongiorno,', {
    x: margin,
    y,
    size: 12,
    font: helvetica,
    color: black
  })

  y -= 30

  // --- INTRO TEXT ---
  const introText1 = 'A seguito degli accordi stabiliti con la nostra società '
  const introText2 = data.companyName
  const introText3 = ', vi inviamo la presente'

  page.drawText(introText1, {
    x: margin,
    y,
    size: 11,
    font: helvetica,
    color: black
  })

  const text1Width = helvetica.widthOfTextAtSize(introText1, 11)

  // Underlined company name
  page.drawText(introText2, {
    x: margin + text1Width,
    y,
    size: 11,
    font: helveticaBold,
    color: black
  })

  const text2Width = helveticaBold.widthOfTextAtSize(introText2, 11)

  // Draw underline
  page.drawLine({
    start: { x: margin + text1Width, y: y - 2 },
    end: { x: margin + text1Width + text2Width, y: y - 2 },
    thickness: 0.5,
    color: black
  })

  page.drawText(introText3, {
    x: margin + text1Width + text2Width,
    y,
    size: 11,
    font: helvetica,
    color: black
  })

  y -= 18

  page.drawText('prenotazione:', {
    x: margin,
    y,
    size: 11,
    font: helvetica,
    color: black
  })

  y -= 30

  // Format date
  const [year, month, day] = data.visitDate.split('-')
  const formattedDate = `${day}/${month}/${year}`

  // --- CUSTOMER LIST (no boxes, just bullet points) ---
  for (let i = 0; i < data.customers.length; i++) {
    const customer = data.customers[i]

    // Check if we need a new page (each customer block is about 140px)
    if (y < 160) {
      page = pdfDoc.addPage([595, 842])
      y = height - 60
    }

    // Nome
    drawBullet(page, margin, y, helvetica, helveticaBold, 'Nome', customer.name)
    y -= 18

    // Telefono del cliente
    drawBullet(page, margin, y, helvetica, helveticaBold, 'Telefono del cliente', customer.phone || '-')
    y -= 18

    // Numero di persone - use the paxBreakdown with mapped names
    const personeText = formatPaxBreakdown(customer.paxBreakdown)
    drawBullet(page, margin, y, helvetica, helveticaBold, 'Numero di persone', personeText)
    y -= 18

    // Data
    drawBullet(page, margin, y, helvetica, helveticaBold, 'Data', formattedDate)
    y -= 18

    // Ora
    drawBullet(page, margin, y, helvetica, helveticaBold, 'Ora', data.entryTime || '-')
    y -= 18

    // Lingua
    drawBullet(page, margin, y, helvetica, helveticaBold, 'Lingua', data.language || '-')
    y -= 18

    // Catacombe/Location
    drawBullet(page, margin, y, helvetica, helveticaBold, 'Catacombe', data.activityLocation || '-')
    y -= 30 // Extra space between customers
  }

  // --- CLOSING TEXT ---
  if (y < 80) {
    page = pdfDoc.addPage([595, 842])
    y = height - 60
  }

  y -= 10

  page.drawText('Vi ringraziamo per la nostra collaborazione, e rimaniamo in attesa di un gentile riscontro.', {
    x: margin,
    y,
    size: 11,
    font: helvetica,
    color: black
  })

  y -= 25

  page.drawText('Un cordiale saluto.', {
    x: margin,
    y,
    size: 11,
    font: helvetica,
    color: black
  })

  return pdfDoc.save()
}

// Fallback text-based logo
function drawTextLogo(page: PDFPage, width: number, y: number, helveticaBold: PDFFont) {
  const brandOrange = rgb(238 / 255, 104 / 255, 42 / 255)
  const brandGreen = rgb(45 / 255, 186 / 255, 125 / 255)

  // Draw "EN" text
  page.drawText('EN', {
    x: width - 100,
    y: y - 10,
    size: 18,
    font: helveticaBold,
    color: brandOrange
  })

  // Draw "ROMA" text with colored O
  page.drawText('R', {
    x: width - 100,
    y: y - 30,
    size: 20,
    font: helveticaBold,
    color: brandOrange
  })
  page.drawText('O', {
    x: width - 85,
    y: y - 30,
    size: 20,
    font: helveticaBold,
    color: brandGreen
  })
  page.drawText('MA', {
    x: width - 68,
    y: y - 30,
    size: 20,
    font: helveticaBold,
    color: brandOrange
  })

  // Draw ".com" subscript
  page.drawText('.com', {
    x: width - 70,
    y: y - 48,
    size: 10,
    font: helveticaBold,
    color: brandOrange
  })
}

// Legacy interface for backward compatibility
interface LegacyVoucherRequestPDFData {
  requestId: string
  partnerName: string
  activityName: string
  visitDate: string
  entryTime?: string
  requestedQuantity: number
  customers: { firstName: string; lastName: string; paxCount: number }[]
  totalPax: number
  notes?: string
}

// Convert legacy data to new format
export function convertLegacyData(legacy: LegacyVoucherRequestPDFData): VoucherRequestPDFData {
  return {
    requestId: legacy.requestId,
    partnerName: legacy.partnerName,
    companyName: 'TU ITALIA SRL',
    activityName: legacy.activityName,
    activityLocation: 'San Sebastiano', // Default
    visitDate: legacy.visitDate,
    entryTime: legacy.entryTime || '',
    language: '', // Not available in legacy format
    customers: legacy.customers.map(c => ({
      name: `${c.firstName} ${c.lastName}`.trim() || '-',
      phone: '',
      paxBreakdown: { 'Adulto': c.paxCount }
    })),
    totalPax: legacy.totalPax,
    notes: legacy.notes
  }
}
