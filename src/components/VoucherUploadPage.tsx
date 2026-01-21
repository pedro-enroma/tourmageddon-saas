'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { vouchersApi } from '@/lib/api-client'
import { Upload, FileText, Check, AlertTriangle, X, ChevronDown, Search, Loader2, Plus, FileEdit, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

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

interface TicketCategory {
  id: string
  name: string
  guide_requires_ticket?: boolean
  skip_name_check?: boolean
}

interface AssignedGuide {
  guide_id: string
  first_name: string
  last_name: string
}

interface ActivityAvailability {
  id: number
  activity_id: string
  local_date: string
  local_time: string
  activities?: { title: string }
}

interface PricingCategoryBooking {
  pricing_category_booking_id: number
  booked_title: string
  passenger_first_name: string
  passenger_last_name: string
}

interface ActivityBookingInfo {
  activity_booking_id: number
  customer_first_name: string | null
  customer_last_name: string | null
  total_participants: number
}

interface ValidationResult {
  ticket: ExtractedTicket
  matchedParticipant: PricingCategoryBooking | null
  matchedGuide: AssignedGuide | null
  matchedActivityBooking: ActivityBookingInfo | null  // For booking-level vouchers
  nameMatch: boolean
  typeMatch: boolean
  paxMatch: boolean  // For booking-level vouchers
  isGuideTicket: boolean
  warnings: string[]
}

interface TicketTypeMapping {
  ticket_type: string
  booked_titles: string[]
}

interface ExtractedPDF {
  file: File
  data: ExtractedVoucher
  warning: string | null
  pdfType: string
  isB2B?: boolean
  b2bPriceAdjustment?: number
}

interface TicketCategoryFull {
  id: string
  name: string
  guide_requires_ticket?: boolean
  skip_name_check?: boolean
  name_deadline_days_b2c?: number | null
  name_deadline_days_b2b?: number | null
  short_code?: string | null
  product_names?: string[] | null
}

interface ActivityInfo {
  id: string
  title: string
}

interface MultiDateAvailabilityStatus {
  date: string
  availabilityId: number | null
  hasSlot: boolean
}

export default function VoucherUploadPage() {
  // Upload mode: 'pdf' or 'manual'
  const [uploadMode, setUploadMode] = useState<'pdf' | 'manual'>('pdf')

  // Manual entry form state
  const [manualFormData, setManualFormData] = useState({
    categoryId: '',
    visitDates: [] as string[],
    entryTime: '',
    productName: '',
    ticketCount: 0,
    notes: '',
    voucherSource: 'b2b' as 'b2b' | 'b2c'
  })

  // Date selection mode
  const [dateMode, setDateMode] = useState<'single' | 'multiple'>('single')
  const [singleDate, setSingleDate] = useState('')
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' })
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]) // 0=Sun, 1=Mon, etc.

  // Day names for toggle buttons
  const dayNames = [
    { key: 1, label: 'M' },
    { key: 2, label: 'T' },
    { key: 3, label: 'W' },
    { key: 4, label: 'T' },
    { key: 5, label: 'F' },
    { key: 6, label: 'S' },
    { key: 0, label: 'S' }
  ]

  // Hour and minute options for entry time
  const hourOptions = Array.from({ length: 11 }, (_, i) => (i + 8).toString().padStart(2, '0')) // 08 to 18
  const minuteOptions = ['00', '15', '30', '45']
  const [entryHour, setEntryHour] = useState('')
  const [entryMinute, setEntryMinute] = useState('')

  // Combine hour and minute into entry time
  const combinedEntryTime = entryHour && entryMinute ? `${entryHour}:${entryMinute}` : ''

  // Generate dates from range and selected days
  const generateDatesFromRange = (start: string, end: string, days: number[]): string[] => {
    if (!start || !end) return []
    const dates: string[] = []
    const startDate = new Date(start)
    const endDate = new Date(end)

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (days.includes(d.getDay())) {
        dates.push(d.toISOString().split('T')[0])
      }
    }
    return dates
  }

  // Calculate dates based on mode - memoized to prevent infinite loops
  const calculatedDates = useMemo(() => {
    return dateMode === 'single'
      ? (singleDate ? [singleDate] : [])
      : generateDatesFromRange(dateRange.startDate, dateRange.endDate, selectedDays)
  }, [dateMode, singleDate, dateRange.startDate, dateRange.endDate, selectedDays])

  // Stable string version of dates for useCallback dependencies
  const calculatedDatesKey = useMemo(() => calculatedDates.join(','), [calculatedDates])
  const [manualFile, setManualFile] = useState<File | null>(null)
  const [categoriesWithDeadline, setCategoriesWithDeadline] = useState<TicketCategoryFull[]>([])

  // State - Multi-file support
  const [files, setFiles] = useState<File[]>([])
  const [extractedPDFs, setExtractedPDFs] = useState<ExtractedPDF[]>([])
  const [extracting, setExtracting] = useState(false)
  const [mismatchWarning, setMismatchWarning] = useState<string | null>(null)
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [availabilities, setAvailabilities] = useState<ActivityAvailability[]>([])
  const [selectedAvailabilityId, setSelectedAvailabilityId] = useState<number | null>(null)
  const [participants, setParticipants] = useState<PricingCategoryBooking[]>([])
  const [typeMappings, setTypeMappings] = useState<TicketTypeMapping[]>([])
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [searchAvailability, setSearchAvailability] = useState('')
  const [showOnlyWithBookings, setShowOnlyWithBookings] = useState(true)
  const [availabilityBookingCounts, setAvailabilityBookingCounts] = useState<Map<number, number>>(new Map())
  const [assignedGuides, setAssignedGuides] = useState<AssignedGuide[]>([])
  const [activityBookings, setActivityBookings] = useState<ActivityBookingInfo[]>([])
  const [categoryGuideRequiresTicket, setCategoryGuideRequiresTicket] = useState(false)
  const [categorySkipNameCheck, setCategorySkipNameCheck] = useState(false)

  // Multi-date tour linking state
  const [multiDateActivities, setMultiDateActivities] = useState<ActivityInfo[]>([])
  const [selectedMultiDateActivityId, setSelectedMultiDateActivityId] = useState<string>('')
  const [selectedMultiDateTime, setSelectedMultiDateTime] = useState<string>('')
  const [multiDateAvailabilityStatus, setMultiDateAvailabilityStatus] = useState<MultiDateAvailabilityStatus[]>([])
  const [checkingAvailability, setCheckingAvailability] = useState(false)

  // Combined extracted data from all PDFs - memoized to prevent infinite loops
  const combinedExtractedData: ExtractedVoucher | null = useMemo(() => {
    if (extractedPDFs.length === 0) return null
    return {
      booking_number: extractedPDFs.map(p => p.data.booking_number).join(', '),
      booking_date: extractedPDFs[0].data.booking_date,
      visit_date: extractedPDFs[0].data.visit_date,
      entry_time: extractedPDFs[0].data.entry_time,
      product_name: extractedPDFs[0].data.product_name,
      tickets: extractedPDFs.flatMap(p => p.data.tickets)
    }
  }, [extractedPDFs])

  // Helper function to normalize names (remove diacritics/accents)
  const normalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/\s+/g, ' ') // Collapse multiple spaces into one
      .trim()
  }

  // Helper function to normalize product names for comparison
  // Treats variations like "FULL EXPERIENCE - ARENA - GRUPPI" and "Intero Full Experience - Arena" as the same
  const normalizeProductName = (productName: string): string => {
    return productName
      .toUpperCase()
      .trim()
      // Remove common ticket type prefixes (Intero, Ridotto, Biglietto, etc.)
      .replace(/^(INTERO|RIDOTTO|BIGLIETTO|GRATUITO|OMAGGIO)\s+/i, '')
      // Remove " - GRUPPI" suffix (group booking variant)
      .replace(/\s*-\s*GRUPPI\s*$/i, '')
      // Normalize COLOSSEO 24H variations
      .replace(/COLOSSEO\s*24\s*H/i, 'COLOSSEO 24H')
      // Normalize spaces and dashes
      .replace(/\s*-\s*/g, ' - ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Load categories on mount
  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('ticket_categories')
      .select('id, name, guide_requires_ticket, skip_name_check, name_deadline_days_b2c, name_deadline_days_b2b, short_code, product_names')
      .order('name')
    setCategories(data || [])
    setCategoriesWithDeadline(data || [])
  }

  // Fetch availabilities when category and visit date are set
  const fetchAvailabilities = useCallback(async () => {
    if (!combinedExtractedData?.visit_date || !selectedCategoryId) return

    // Get activities mapped to this category
    const { data: mappings } = await supabase
      .from('product_activity_mappings')
      .select('activity_id')
      .eq('category_id', selectedCategoryId)

    if (!mappings || mappings.length === 0) {
      setAvailabilities([])
      return
    }

    const activityIds = mappings.map(m => m.activity_id)

    // Get availabilities for those activities on the visit date
    const { data } = await supabase
      .from('activity_availability')
      .select(`
        id,
        activity_id,
        local_date,
        local_time,
        activities (title)
      `)
      .in('activity_id', activityIds)
      .eq('local_date', combinedExtractedData.visit_date)
      .order('local_time')

    // Transform data to match interface (activities comes as array from Supabase)
    const transformed: ActivityAvailability[] = (data || []).map(item => ({
      id: item.id,
      activity_id: item.activity_id,
      local_date: item.local_date,
      local_time: item.local_time,
      activities: Array.isArray(item.activities)
        ? (item.activities[0] as { title: string } | undefined)
        : (item.activities as { title: string } | undefined)
    }))
    setAvailabilities(transformed)

    // Fetch booking counts for each availability (per time slot)
    const countsMap = new Map<number, number>()

    for (const avail of transformed) {
      // Parse the time to create a 1-minute window
      const [hours, minutes] = avail.local_time.split(':')
      const startTime = `${avail.local_date}T${hours}:${minutes}:00`
      const endTime = `${avail.local_date}T${hours}:${minutes}:59.999`

      const { count } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id', { count: 'exact', head: true })
        .eq('activity_id', avail.activity_id)
        .gte('start_date_time', startTime)
        .lte('start_date_time', endTime)
        .in('status', ['CONFIRMED', 'COMPLETED'])

      countsMap.set(avail.id, count || 0)
    }

    setAvailabilityBookingCounts(countsMap)
  }, [combinedExtractedData?.visit_date, selectedCategoryId])

  useEffect(() => {
    fetchAvailabilities()
  }, [fetchAvailabilities])

  // Fetch participants and assigned guides when availability is selected
  const fetchParticipants = useCallback(async () => {
    if (!selectedAvailabilityId) {
      setParticipants([])
      setAssignedGuides([])
      setValidationResults([])
      return
    }

    // Find the selected availability to get activity_id, date and time
    const selectedAvail = availabilities.find(a => a.id === selectedAvailabilityId)
    if (!selectedAvail) {
      setParticipants([])
      setAssignedGuides([])
      setValidationResults([])
      return
    }

    // Fetch assigned guides for this availability
    const { data: guideAssignments } = await supabase
      .from('guide_assignments')
      .select(`
        guide:guides (guide_id, first_name, last_name)
      `)
      .eq('activity_availability_id', selectedAvailabilityId)

    const guides: AssignedGuide[] = (guideAssignments || [])
      .map(ga => {
        const guide = Array.isArray(ga.guide) ? ga.guide[0] : ga.guide
        return guide ? {
          guide_id: guide.guide_id,
          first_name: guide.first_name,
          last_name: guide.last_name
        } : null
      })
      .filter((g): g is AssignedGuide => g !== null)

    setAssignedGuides(guides)

    // Parse the time to create a 1-minute window
    const [hours, minutes] = selectedAvail.local_time.split(':')
    const startTime = `${selectedAvail.local_date}T${hours}:${minutes}:00`
    const endTime = `${selectedAvail.local_date}T${hours}:${minutes}:59.999`

    // Get activity_bookings for this specific time slot with customer info
    const { data: bookings } = await supabase
      .from('activity_bookings')
      .select(`
        activity_booking_id,
        bookings!inner (
          booking_customers (
            customers (first_name, last_name)
          )
        ),
        pricing_category_bookings (
          pricing_category_booking_id
        )
      `)
      .eq('activity_id', selectedAvail.activity_id)
      .gte('start_date_time', startTime)
      .lte('start_date_time', endTime)
      .in('status', ['CONFIRMED', 'COMPLETED'])

    if (!bookings || bookings.length === 0) {
      setParticipants([])
      setActivityBookings([])
      setValidationResults([])
      return
    }

    // Extract activity booking info with customer names and pax count
    const activityBookingInfos: ActivityBookingInfo[] = bookings.map(b => {
      // Get customer info from nested relations
      const bookingData = b.bookings as { booking_customers?: Array<{ customers?: { first_name?: string; last_name?: string } }> } | null
      const customerData = bookingData?.booking_customers?.[0]?.customers
      // Count participants from pricing_category_bookings
      const paxCount = Array.isArray(b.pricing_category_bookings) ? b.pricing_category_bookings.length : 0

      return {
        activity_booking_id: b.activity_booking_id,
        customer_first_name: customerData?.first_name || null,
        customer_last_name: customerData?.last_name || null,
        total_participants: paxCount
      }
    })
    setActivityBookings(activityBookingInfos)

    const bookingIds = bookings.map(b => b.activity_booking_id)

    const { data: pricingData } = await supabase
      .from('pricing_category_bookings')
      .select('pricing_category_booking_id, booked_title, passenger_first_name, passenger_last_name')
      .in('activity_booking_id', bookingIds)

    setParticipants(pricingData || [])
  }, [selectedAvailabilityId, availabilities])

  useEffect(() => {
    fetchParticipants()
  }, [fetchParticipants])

  // Fetch type mappings for validation
  const fetchTypeMappings = useCallback(async () => {
    if (!selectedCategoryId || !selectedAvailabilityId) {
      setTypeMappings([])
      return
    }

    // Get activity_id from selected availability
    const { data: availData } = await supabase
      .from('activity_availability')
      .select('activity_id')
      .eq('id', selectedAvailabilityId)
      .single()

    if (!availData) return

    const { data } = await supabase
      .from('ticket_type_mappings')
      .select('ticket_type, booked_titles')
      .eq('category_id', selectedCategoryId)
      .eq('activity_id', availData.activity_id)

    setTypeMappings(data || [])
  }, [selectedCategoryId, selectedAvailabilityId])

  useEffect(() => {
    fetchTypeMappings()
  }, [fetchTypeMappings])

  // Update category flags when category changes
  useEffect(() => {
    if (selectedCategoryId) {
      const selectedCategory = categories.find(c => c.id === selectedCategoryId)
      setCategoryGuideRequiresTicket(selectedCategory?.guide_requires_ticket ?? false)
      setCategorySkipNameCheck(selectedCategory?.skip_name_check ?? false)
    } else {
      setCategoryGuideRequiresTicket(false)
      setCategorySkipNameCheck(false)
    }
  }, [selectedCategoryId, categories])

  // Validate tickets against participants and guides
  useEffect(() => {
    if (!combinedExtractedData?.tickets) {
      setValidationResults([])
      return
    }

    // Can validate even with no participants if we have guides assigned
    if (participants.length === 0 && assignedGuides.length === 0) {
      setValidationResults([])
      return
    }

    // If skip_name_check is enabled, do quantity-only validation
    if (categorySkipNameCheck) {
      // Count tickets by type
      const ticketTypeCounts: Record<string, number> = {}
      combinedExtractedData.tickets.forEach(ticket => {
        ticketTypeCounts[ticket.ticket_type] = (ticketTypeCounts[ticket.ticket_type] || 0) + 1
      })

      // Count participants by booked_title
      const participantTypeCounts: Record<string, number> = {}
      participants.forEach(p => {
        participantTypeCounts[p.booked_title] = (participantTypeCounts[p.booked_title] || 0) + 1
      })

      const totalTickets = combinedExtractedData.tickets.length
      const totalParticipants = participants.length

      // Count guide tickets (ticket_type contains "guide")
      const guideTicketCount = combinedExtractedData.tickets.filter(t =>
        t.ticket_type.toLowerCase().includes('guide') ||
        t.ticket_type.toLowerCase().includes('guia')
      ).length

      // Create a single summary result for quantity validation
      const warnings: string[] = []

      // Check total count - account for guide tickets when category requires them
      const expectedTickets = categoryGuideRequiresTicket
        ? totalParticipants + guideTicketCount
        : totalParticipants

      if (totalTickets !== expectedTickets) {
        const explanation = categoryGuideRequiresTicket
          ? ` (${totalParticipants} participants + ${guideTicketCount} guide)`
          : ''
        warnings.push(`Total ticket count (${totalTickets}) doesn't match expected count (${expectedTickets})${explanation}`)
      }

      // Check per-type counts using mappings
      for (const [ticketType, ticketCount] of Object.entries(ticketTypeCounts)) {
        const mapping = typeMappings.find(m => m.ticket_type === ticketType)
        if (mapping && mapping.booked_titles.length > 0) {
          // Sum up the participant count for all booked_titles this ticket type maps to
          const matchedParticipantCount = mapping.booked_titles.reduce((sum, title) => {
            return sum + (participantTypeCounts[title] || 0)
          }, 0)

          if (ticketCount !== matchedParticipantCount) {
            warnings.push(`${ticketType}: ${ticketCount} tickets vs ${matchedParticipantCount} participants`)
          }
        }
      }

      // Return a single result with all quantity warnings
      const results: ValidationResult[] = [{
        ticket: { ticket_code: 'QUANTITY_CHECK', holder_name: 'Quantity Validation', ticket_type: 'Summary', price: 0 },
        matchedParticipant: null,
        matchedGuide: null,
        matchedActivityBooking: null,
        nameMatch: warnings.length === 0,
        typeMatch: warnings.length === 0,
        paxMatch: true,
        isGuideTicket: false,
        warnings
      }]

      setValidationResults(warnings.length > 0 ? results : [])
      return
    }

    // Check if this is a booking-level voucher (has pax_count on tickets)
    const isBookingLevelVoucher = combinedExtractedData.tickets.some(t => t.pax_count !== undefined && t.pax_count !== null)

    // Check if this is a per-person-type voucher (Catacombe style with "Name - Adulto N" pattern)
    const perPersonTypePattern = /^(.+?)\s*-\s*(Adulto|Minore|Adult|Child)\s*\d*$/i
    const isPerPersonTypeVoucher = combinedExtractedData.tickets.some(t => perPersonTypePattern.test(t.holder_name))

    if (isPerPersonTypeVoucher) {
      // Per-person-type validation: group tickets by base booking name and match to activity_bookings
      // Extract base name by removing " - Adulto N" or " - Minore N" suffix
      const extractBaseName = (holderName: string): string => {
        const match = holderName.match(perPersonTypePattern)
        return match ? match[1].trim() : holderName
      }

      // Group tickets by base booking name
      const ticketsByBooking = new Map<string, typeof combinedExtractedData.tickets>()
      for (const ticket of combinedExtractedData.tickets) {
        const baseName = extractBaseName(ticket.holder_name)
        const normalizedBaseName = normalizeText(baseName)
        if (!ticketsByBooking.has(normalizedBaseName)) {
          ticketsByBooking.set(normalizedBaseName, [])
        }
        ticketsByBooking.get(normalizedBaseName)!.push(ticket)
      }

      // Create one validation result per booking (not per ticket)
      const results: ValidationResult[] = []

      for (const [normalizedBaseName, tickets] of ticketsByBooking.entries()) {
        const baseName = extractBaseName(tickets[0].holder_name)
        const ticketCount = tickets.length
        const warnings: string[] = []

        // Match against activity bookings by customer name
        const matchedActivityBooking = activityBookings.find(ab => {
          if (!ab.customer_first_name && !ab.customer_last_name) return false
          const customerFullName = normalizeText(`${ab.customer_first_name || ''} ${ab.customer_last_name || ''}`)
          const customerReversed = normalizeText(`${ab.customer_last_name || ''} ${ab.customer_first_name || ''}`)
          return customerFullName === normalizedBaseName || customerReversed === normalizedBaseName
        }) || null

        const nameMatch = !!matchedActivityBooking
        let paxMatch = false

        if (!nameMatch) {
          if (activityBookings.length === 0) {
            warnings.push(`No bookings found for this tour slot`)
          } else {
            const bookingNames = activityBookings
              .map(ab => `${ab.customer_first_name || ''} ${ab.customer_last_name || ''}`.trim())
              .filter(n => n)
              .join(', ')
            warnings.push(`Name "${baseName}" not found in bookings (${bookingNames || 'no names available'})`)
          }
        } else if (matchedActivityBooking) {
          // Compare ticket count to booking pax count
          paxMatch = ticketCount === matchedActivityBooking.total_participants
          if (!paxMatch) {
            warnings.push(`Pax mismatch: ${ticketCount} tickets vs ${matchedActivityBooking.total_participants} booked participants`)
          }
        }

        // Create a summary ticket for this booking
        const summaryTicket: ExtractedTicket = {
          ticket_code: tickets.map(t => t.ticket_code).join(', '),
          holder_name: baseName,
          ticket_type: `${ticketCount} tickets (${tickets.filter(t => t.ticket_type === 'Adulto').length} Adulto, ${tickets.filter(t => t.ticket_type === 'Minore').length} Minore)`,
          price: tickets.reduce((sum, t) => sum + (t.price || 0), 0)
        }

        results.push({
          ticket: summaryTicket,
          matchedParticipant: null,
          matchedGuide: null,
          matchedActivityBooking,
          nameMatch,
          typeMatch: true,
          paxMatch,
          isGuideTicket: false,
          warnings
        })
      }

      setValidationResults(results)
      return
    }

    if (isBookingLevelVoucher) {
      // Booking-level validation: match by holder name to activity_bookings
      const results: ValidationResult[] = combinedExtractedData.tickets.map(ticket => {
        const warnings: string[] = []
        const ticketNameNormalized = normalizeText(ticket.holder_name)

        // Match against activity bookings by customer name
        let matchedActivityBooking: ActivityBookingInfo | null = null
        matchedActivityBooking = activityBookings.find(ab => {
          if (!ab.customer_first_name && !ab.customer_last_name) return false
          const customerFullName = normalizeText(`${ab.customer_first_name || ''} ${ab.customer_last_name || ''}`)
          const customerReversed = normalizeText(`${ab.customer_last_name || ''} ${ab.customer_first_name || ''}`)
          return customerFullName === ticketNameNormalized || customerReversed === ticketNameNormalized
        }) || null

        const nameMatch = !!matchedActivityBooking
        let paxMatch = false

        if (!nameMatch) {
          if (activityBookings.length === 0) {
            warnings.push(`No bookings found for this tour slot`)
          } else {
            const bookingNames = activityBookings
              .map(ab => `${ab.customer_first_name || ''} ${ab.customer_last_name || ''}`.trim())
              .filter(n => n)
              .join(', ')
            warnings.push(`Name "${ticket.holder_name}" not found in bookings (${bookingNames || 'no names available'})`)
          }
        } else if (ticket.pax_count !== undefined && matchedActivityBooking) {
          // Compare pax counts
          paxMatch = ticket.pax_count === matchedActivityBooking.total_participants
          if (!paxMatch) {
            warnings.push(`Pax mismatch: voucher has ${ticket.pax_count} pax, booking has ${matchedActivityBooking.total_participants} pax`)
          }
        }

        return {
          ticket,
          matchedParticipant: null,
          matchedGuide: null,
          matchedActivityBooking,
          nameMatch,
          typeMatch: true, // Not applicable for booking-level
          paxMatch,
          isGuideTicket: false,
          warnings
        }
      })

      setValidationResults(results)
      return
    }

    // Standard name-based validation (for per-ticket vouchers)
    const results: ValidationResult[] = combinedExtractedData.tickets.map(ticket => {
      const warnings: string[] = []
      const ticketNameNormalized = normalizeText(ticket.holder_name)

      // Check if this is a guide ticket (ticket type contains "guide" or similar patterns)
      const isGuideTicket = ticket.ticket_type.toLowerCase().includes('guide') ||
                           ticket.ticket_type.toLowerCase().includes('guia') ||
                           ticket.ticket_type.toLowerCase().includes('guías')

      let matchedParticipant: PricingCategoryBooking | null = null
      let matchedGuide: AssignedGuide | null = null
      let nameMatch = false
      let typeMatch = false

      if (isGuideTicket && categoryGuideRequiresTicket) {
        // For guide tickets, match against assigned guides
        // Try both "First Last" and "Last First" orders since PDFs may vary
        matchedGuide = assignedGuides.find(g => {
          const guideFullName = normalizeText(`${g.first_name} ${g.last_name}`)
          const guideReversed = normalizeText(`${g.last_name} ${g.first_name}`)
          return guideFullName === ticketNameNormalized || guideReversed === ticketNameNormalized
        }) || null

        nameMatch = !!matchedGuide
        typeMatch = nameMatch // For guide tickets, type match is same as name match

        if (!nameMatch) {
          if (assignedGuides.length === 0) {
            warnings.push(`No guides assigned to this tour slot`)
          } else {
            const guideNames = assignedGuides.map(g => `${g.first_name} ${g.last_name}`).join(', ')
            warnings.push(`Guide "${ticket.holder_name}" not found in assigned guides (${guideNames})`)
          }
        }
      } else {
        // For regular tickets, match against participants
        matchedParticipant = participants.find(p => {
          const fullName = normalizeText(`${p.passenger_first_name} ${p.passenger_last_name}`)
          return fullName === ticketNameNormalized
        }) || null

        nameMatch = !!matchedParticipant

        if (!nameMatch) {
          warnings.push(`Name "${ticket.holder_name}" not found in booking participants`)
        }

        // Check ticket type mapping for non-guide tickets
        if (matchedParticipant) {
          const mapping = typeMappings.find(m => m.ticket_type === ticket.ticket_type)
          if (mapping) {
            typeMatch = mapping.booked_titles.includes(matchedParticipant.booked_title)
            if (!typeMatch) {
              warnings.push(`Ticket type "${ticket.ticket_type}" doesn't match participant category "${matchedParticipant.booked_title}"`)
            }
          } else {
            warnings.push(`No mapping found for ticket type "${ticket.ticket_type}"`)
          }
        }
      }

      return {
        ticket,
        matchedParticipant,
        matchedGuide,
        matchedActivityBooking: null,
        nameMatch,
        typeMatch,
        paxMatch: true, // Not applicable for per-ticket vouchers
        isGuideTicket,
        warnings
      }
    })

    setValidationResults(results)
  }, [combinedExtractedData?.tickets, participants, assignedGuides, activityBookings, typeMappings, categoryGuideRequiresTicket, categorySkipNameCheck])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf')

    if (pdfFiles.length === 0) {
      setError('Please select PDF files')
      return
    }

    if (pdfFiles.length > 5) {
      setError('Maximum 5 PDFs allowed at once')
      return
    }

    setFiles(pdfFiles)
    setExtractedPDFs([])
    setMismatchWarning(null)
    setError(null)
    setSuccess(false)
  }

  const addMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf')

    if (files.length + pdfFiles.length > 5) {
      setError('Maximum 5 PDFs allowed at once')
      return
    }

    setFiles([...files, ...pdfFiles])
    setExtractedPDFs([])
    setMismatchWarning(null)
    setError(null)
  }

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index)
    setFiles(newFiles)
    setExtractedPDFs([])
    setMismatchWarning(null)
  }

  const handleExtract = async () => {
    if (files.length === 0) return

    setExtracting(true)
    setError(null)
    setMismatchWarning(null)

    try {
      const extractedResults: ExtractedPDF[] = []

      // Extract data from each PDF
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/tickets/extract', {
          method: 'POST',
          body: formData
        })

        const result = await response.json()

        if (!response.ok) {
          // Check for rate limit error
          if (response.status === 429 || result.code === 'RATE_LIMIT') {
            throw new Error(`⏳ Rate limit reached. Please wait 1 minute and try again.`)
          }
          throw new Error(`Failed to extract from ${file.name}: ${result.error || 'Unknown error'}`)
        }

        extractedResults.push({
          file,
          data: result.data,
          warning: result.warning || null,
          pdfType: result.pdfType || 'unknown',
          isB2B: result.isB2B || false,
          b2bPriceAdjustment: result.b2bPriceAdjustment || 0
        })
      }

      // Validate that all PDFs have matching product, date, and time
      if (extractedResults.length > 1) {
        const first = extractedResults[0].data
        const firstProductNormalized = normalizeProductName(first.product_name)
        const mismatches: string[] = []

        for (let i = 1; i < extractedResults.length; i++) {
          const current = extractedResults[i].data
          const fileName = extractedResults[i].file.name

          // Compare normalized product names (e.g., "FULL EXPERIENCE - ARENA - GRUPPI" matches "FULL EXPERIENCE - ARENA")
          const currentProductNormalized = normalizeProductName(current.product_name)
          if (currentProductNormalized !== firstProductNormalized) {
            mismatches.push(`${fileName}: Product "${current.product_name}" doesn't match "${first.product_name}"`)
          }
          if (current.visit_date !== first.visit_date) {
            mismatches.push(`${fileName}: Date "${current.visit_date}" doesn't match "${first.visit_date}"`)
          }
          if (current.entry_time !== first.entry_time) {
            mismatches.push(`${fileName}: Entry time "${current.entry_time}" doesn't match "${first.entry_time}"`)
          }
        }

        if (mismatches.length > 0) {
          setMismatchWarning('BIGLIETTI, DATA O ORARIO NON IDENTICI')
        }
      }

      setExtractedPDFs(extractedResults)

      // Auto-detect category based on product name from first PDF
      const productName = extractedResults[0]?.data.product_name || ''
      const normalizedProductName = normalizeProductName(productName)

      if (productName) {
        // Try exact match first, then normalized match
        let { data: mappings } = await supabase
          .from('product_activity_mappings')
          .select('category_id')
          .eq('product_name', productName)
          .limit(1)

        // If no exact match, try with normalized product name (without - GRUPPI suffix)
        if ((!mappings || mappings.length === 0) && normalizedProductName !== productName.toUpperCase().trim()) {
          const { data: normalizedMappings } = await supabase
            .from('product_activity_mappings')
            .select('category_id')
            .ilike('product_name', normalizedProductName)
            .limit(1)
          mappings = normalizedMappings
        }

        const mapping = mappings?.[0]
        if (mapping?.category_id) {
          setSelectedCategoryId(mapping.category_id)
        } else {
          const { data: categoriesWithProducts } = await supabase
            .from('ticket_categories')
            .select('id, product_names')

          if (categoriesWithProducts) {
            const matchingCategory = categoriesWithProducts.find(cat =>
              cat.product_names?.includes(productName) ||
              cat.product_names?.some((p: string) => normalizeProductName(p) === normalizedProductName)
            )
            if (matchingCategory) {
              setSelectedCategoryId(matchingCategory.id)
            }
          }
        }
      }
    } catch (err) {
      console.error('Extraction error:', err)
      setError(err instanceof Error ? err.message : 'Failed to extract data from PDFs')
    } finally {
      setExtracting(false)
    }
  }

  // Helper to map PDF type to ticket class
  const getTicketClass = (pdfType: string): 'entrance' | 'transport' | 'other' => {
    if (['italo', 'trenitalia'].includes(pdfType)) return 'transport'
    if (['vatican', 'colosseum', 'pompei'].includes(pdfType)) return 'entrance'
    return 'other'
  }

  const handleSave = async () => {
    if (extractedPDFs.length === 0 || !selectedCategoryId) return

    setSaving(true)
    setError(null)

    try {
      // Save each PDF as a separate voucher
      for (const extracted of extractedPDFs) {
        // Map tickets with matched participant IDs or activity_booking IDs from validation results
        const ticketsWithParticipants = extracted.data.tickets.map(ticket => {
          // Find the validation result for this ticket
          const validation = validationResults.find(v =>
            v.ticket.ticket_code === ticket.ticket_code &&
            v.ticket.holder_name === ticket.holder_name
          )
          return {
            ...ticket,
            pricing_category_booking_id: validation?.matchedParticipant?.pricing_category_booking_id || null,
            activity_booking_id: validation?.matchedActivityBooking?.activity_booking_id || null,
            pax_count: ticket.pax_count || null
          }
        })

        const formData = new FormData()
        formData.append('file', extracted.file)
        formData.append('voucherData', JSON.stringify({
          booking_number: extracted.data.booking_number,
          booking_date: extracted.data.booking_date,
          category_id: selectedCategoryId,
          visit_date: extracted.data.visit_date,
          entry_time: extracted.data.entry_time,
          product_name: extracted.data.product_name,
          activity_availability_id: selectedAvailabilityId,
          ticket_class: getTicketClass(extracted.pdfType),
          tickets: ticketsWithParticipants
        }))

        const result = await vouchersApi.create(formData)

        if (result.error) throw new Error(result.error)
      }

      setSuccess(true)
      // Reset form
      setFiles([])
      setExtractedPDFs([])
      setSelectedCategoryId('')
      setSelectedAvailabilityId(null)
      setMismatchWarning(null)
    } catch (err) {
      console.error('Save error:', err)
      setError(err instanceof Error ? err.message : 'Failed to save vouchers')
    } finally {
      setSaving(false)
    }
  }

  // Calculate deadline date for manual placeholder vouchers
  const calculateDeadline = (visitDate: string, deadlineDays: number): string => {
    const date = new Date(visitDate)
    date.setDate(date.getDate() - deadlineDays)
    date.setHours(23, 59, 59, 999)
    return date.toISOString()
  }

  // Get selected category for manual mode
  const selectedManualCategory = categoriesWithDeadline.find(c => c.id === manualFormData.categoryId)
  const manualDeadlineDays = manualFormData.voucherSource === 'b2b'
    ? selectedManualCategory?.name_deadline_days_b2b
    : selectedManualCategory?.name_deadline_days_b2c
  // Show deadline for the earliest date
  const earliestDate = calculatedDates.length > 0
    ? [...calculatedDates].sort()[0]
    : null
  const manualDeadlineDate = earliestDate && manualDeadlineDays
    ? calculateDeadline(earliestDate, manualDeadlineDays)
    : null

  // Get product names for selected category
  const categoryProductNames = selectedManualCategory?.product_names || []

  // Handle saving manual placeholder voucher(s)
  const handleSaveManual = async () => {
    if (!manualFormData.categoryId || calculatedDates.length === 0 || !combinedEntryTime || manualFormData.ticketCount <= 0) {
      setError('Please fill in all required fields')
      return
    }

    if (!manualFormData.productName) {
      setError('Please select a product name')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const category = categoriesWithDeadline.find(c => c.id === manualFormData.categoryId)
      const shortCode = category?.short_code || 'MAN'

      let createdCount = 0
      const errors: string[] = []

      // Create a voucher for each calculated date
      for (const visitDate of calculatedDates) {
        try {
          const dateStr = visitDate.replace(/-/g, '')
          const random = Math.random().toString(36).substring(2, 6).toUpperCase()
          const bookingNumber = `MANUAL-${shortCode}-${dateStr}-${random}`

          // Determine activity_availability_id based on mode
          let activityAvailabilityId: number | null = null
          let isTourUnlinked = false

          if (dateMode === 'single') {
            activityAvailabilityId = selectedAvailabilityId
          } else if (dateMode === 'multiple' && selectedMultiDateActivityId && selectedMultiDateTime) {
            // For multiple dates, check if this date has a matching slot
            const dateStatus = multiDateAvailabilityStatus.find(s => s.date === visitDate)
            if (dateStatus?.hasSlot && dateStatus.availabilityId) {
              activityAvailabilityId = dateStatus.availabilityId
            } else {
              // No slot for this date - mark as unlinked
              isTourUnlinked = true
            }
          }

          const formData = new FormData()
          if (manualFile) {
            formData.append('file', manualFile)
          }
          formData.append('voucherData', JSON.stringify({
            booking_number: bookingNumber,
            booking_date: new Date().toISOString(),
            category_id: manualFormData.categoryId,
            visit_date: visitDate,
            entry_time: combinedEntryTime,
            product_name: manualFormData.productName,
            activity_availability_id: activityAvailabilityId,
            ticket_class: 'entrance',
            // Placeholder-specific fields
            manual_entry: true,
            is_placeholder: true,
            placeholder_ticket_count: manualFormData.ticketCount,
            voucher_source: manualFormData.voucherSource,
            notes: isTourUnlinked ? `[UNLINKED] Tour slot not found for this date. ${manualFormData.notes || ''}`.trim() : manualFormData.notes,
            tickets: [] // No individual tickets for placeholder
          }))

          const result = await vouchersApi.create(formData)

          if (result.error) {
            errors.push(`${visitDate}: ${result.error}`)
          } else {
            createdCount++
          }
        } catch (err) {
          errors.push(`${visitDate}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }

      if (createdCount > 0) {
        setSuccess(true)
        // Reset form
        setManualFormData({
          categoryId: '',
          visitDates: [],
          entryTime: '',
          productName: '',
          ticketCount: 0,
          notes: '',
          voucherSource: 'b2b'
        })
        setDateMode('single')
        setSingleDate('')
        setDateRange({ startDate: '', endDate: '' })
        setSelectedDays([1, 2, 3, 4, 5, 6, 0])
        setEntryHour('')
        setEntryMinute('')
        setManualFile(null)
        setSelectedAvailabilityId(null)
        // Reset multi-date tour selection
        setSelectedMultiDateActivityId('')
        setSelectedMultiDateTime('')
        setMultiDateAvailabilityStatus([])
      }

      if (errors.length > 0) {
        setError(`Created ${createdCount} vouchers. Errors: ${errors.join('; ')}`)
      }
    } catch (err) {
      console.error('Save error:', err)
      setError(err instanceof Error ? err.message : 'Failed to save placeholder vouchers')
    } finally {
      setSaving(false)
    }
  }

  // Fetch availabilities for manual mode - only for single date mode
  const fetchManualAvailabilities = useCallback(async () => {
    // Only fetch availabilities for single date mode
    if (dateMode !== 'single' || !singleDate || !manualFormData.categoryId) {
      setAvailabilities([])
      return
    }

    // Get activities mapped to this category
    const { data: mappings } = await supabase
      .from('product_activity_mappings')
      .select('activity_id')
      .eq('category_id', manualFormData.categoryId)

    if (!mappings || mappings.length === 0) {
      setAvailabilities([])
      return
    }

    const activityIds = [...new Set(mappings.map(m => m.activity_id))]

    // Get availabilities for those activities on the visit date
    const { data } = await supabase
      .from('activity_availability')
      .select(`
        id,
        activity_id,
        local_date,
        local_time,
        activities (title)
      `)
      .in('activity_id', activityIds)
      .eq('local_date', singleDate)
      .order('local_time')

    // Transform data
    const transformed: ActivityAvailability[] = (data || []).map(item => ({
      id: item.id,
      activity_id: item.activity_id,
      local_date: item.local_date,
      local_time: item.local_time,
      activities: Array.isArray(item.activities) ? item.activities[0] : item.activities
    }))

    setAvailabilities(transformed)
  }, [dateMode, singleDate, manualFormData.categoryId])

  useEffect(() => {
    if (uploadMode === 'manual') {
      fetchManualAvailabilities()
    }
  }, [uploadMode, fetchManualAvailabilities])

  // Fetch activities for multi-date mode
  const fetchMultiDateActivities = useCallback(async () => {
    if (dateMode !== 'multiple' || !manualFormData.categoryId) {
      setMultiDateActivities([])
      setSelectedMultiDateActivityId('')
      setSelectedMultiDateTime('')
      setMultiDateAvailabilityStatus([])
      return
    }

    // Get activity IDs mapped to this category
    const { data: mappings } = await supabase
      .from('product_activity_mappings')
      .select('activity_id')
      .eq('category_id', manualFormData.categoryId)

    if (!mappings || mappings.length === 0) {
      setMultiDateActivities([])
      return
    }

    // Get unique activity IDs
    const activityIds = [...new Set(mappings.map(m => m.activity_id).filter(Boolean))]

    if (activityIds.length === 0) {
      setMultiDateActivities([])
      return
    }

    // Fetch activity details
    const { data: activities } = await supabase
      .from('activities')
      .select('activity_id, title')
      .in('activity_id', activityIds)

    if (activities && activities.length > 0) {
      setMultiDateActivities(activities.map(a => ({ id: a.activity_id, title: a.title })))
    } else {
      setMultiDateActivities([])
    }
  }, [dateMode, manualFormData.categoryId])

  useEffect(() => {
    if (uploadMode === 'manual') {
      fetchMultiDateActivities()
    }
  }, [uploadMode, fetchMultiDateActivities])

  // Check availability for all selected dates when activity and time are selected
  const checkMultiDateAvailability = useCallback(async () => {
    const dates = calculatedDatesKey ? calculatedDatesKey.split(',').filter(Boolean) : []
    if (!selectedMultiDateActivityId || !selectedMultiDateTime || dates.length === 0) {
      setMultiDateAvailabilityStatus([])
      return
    }

    setCheckingAvailability(true)
    try {
      // Fetch all availabilities for this activity and time across all dates
      const { data: availabilities } = await supabase
        .from('activity_availability')
        .select('id, local_date, local_time')
        .eq('activity_id', selectedMultiDateActivityId)
        .eq('local_time', selectedMultiDateTime)
        .in('local_date', dates)

      // Create a map of date to availability_id
      const availabilityMap = new Map<string, number>()
      availabilities?.forEach(a => {
        availabilityMap.set(a.local_date, a.id)
      })

      // Build status for each date
      const status: MultiDateAvailabilityStatus[] = dates.map(date => ({
        date,
        availabilityId: availabilityMap.get(date) || null,
        hasSlot: availabilityMap.has(date)
      }))

      setMultiDateAvailabilityStatus(status)
    } finally {
      setCheckingAvailability(false)
    }
  }, [selectedMultiDateActivityId, selectedMultiDateTime, calculatedDatesKey])

  useEffect(() => {
    if (dateMode === 'multiple' && selectedMultiDateActivityId && selectedMultiDateTime) {
      checkMultiDateAvailability()
    }
  }, [dateMode, selectedMultiDateActivityId, selectedMultiDateTime, checkMultiDateAvailability])

  // Get unique times available for the selected activity (fetched from any date in range)
  const [availableTimesForActivity, setAvailableTimesForActivity] = useState<string[]>([])

  const fetchAvailableTimesForActivity = useCallback(async () => {
    const dates = calculatedDatesKey ? calculatedDatesKey.split(',').filter(Boolean) : []
    if (!selectedMultiDateActivityId || dates.length === 0) {
      setAvailableTimesForActivity([])
      return
    }

    console.log('[fetchAvailableTimesForActivity] Activity:', selectedMultiDateActivityId, 'Dates count:', dates.length)

    // Get all unique times for this activity across any dates from activity_availability
    const { data: realTimes, error: realError } = await supabase
      .from('activity_availability')
      .select('local_time')
      .eq('activity_id', selectedMultiDateActivityId)
      .in('local_date', dates)

    console.log('[fetchAvailableTimesForActivity] Real times:', realTimes?.length || 0, realError || '')

    // Also get times from planned_availabilities (planned slots)
    const { data: plannedTimes, error: plannedError } = await supabase
      .from('planned_availabilities')
      .select('local_time')
      .eq('activity_id', selectedMultiDateActivityId)
      .in('local_date', dates)

    console.log('[fetchAvailableTimesForActivity] Planned times:', plannedTimes?.length || 0, plannedError || '')

    // Merge and dedupe times from both sources
    const allTimes = [
      ...(realTimes || []).map(d => d.local_time),
      ...(plannedTimes || []).map(d => d.local_time)
    ]
    const uniqueTimes = [...new Set(allTimes)].sort()
    console.log('[fetchAvailableTimesForActivity] Unique times:', uniqueTimes)
    setAvailableTimesForActivity(uniqueTimes)
  }, [selectedMultiDateActivityId, calculatedDatesKey])

  useEffect(() => {
    fetchAvailableTimesForActivity()
  }, [fetchAvailableTimesForActivity])

  // Reset multi-date tour selection when switching modes or changing category
  useEffect(() => {
    setSelectedMultiDateActivityId('')
    setSelectedMultiDateTime('')
    setMultiDateAvailabilityStatus([])
  }, [dateMode, manualFormData.categoryId])

  // Calculate multi-date availability stats
  const multiDateStats = useMemo(() => {
    const linkedCount = multiDateAvailabilityStatus.filter(s => s.hasSlot).length
    const missingCount = multiDateAvailabilityStatus.filter(s => !s.hasSlot).length
    const missingDates = multiDateAvailabilityStatus.filter(s => !s.hasSlot).map(s => s.date)
    return { linkedCount, missingCount, missingDates, total: multiDateAvailabilityStatus.length }
  }, [multiDateAvailabilityStatus])

  const warningCount = validationResults.filter(r => r.warnings.length > 0).length
  const filteredAvailabilities = availabilities.filter(a =>
    a.activities?.title?.toLowerCase().includes(searchAvailability.toLowerCase()) ||
    a.local_time.includes(searchAvailability)
  )

  // Check if any PDF has extraction warnings
  const hasExtractionWarnings = extractedPDFs.some(p => p.warning)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Upload Ticket Voucher</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload one or more PDFs with tickets to extract and assign to a tour
        </p>
      </div>

      {/* Upload Mode Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setUploadMode('pdf')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            uploadMode === 'pdf'
              ? 'bg-orange-100 border-orange-300 text-orange-700'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Upload className="w-4 h-4" />
          Upload PDF
        </button>
        <button
          onClick={() => setUploadMode('manual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            uploadMode === 'manual'
              ? 'bg-orange-100 border-orange-300 text-orange-700'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <FileEdit className="w-4 h-4" />
          Manual Entry (Placeholder)
        </button>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-medium text-green-800">
              {uploadMode === 'manual' ? 'Placeholder voucher' : `Voucher${extractedPDFs.length > 1 ? 's' : ''}`} saved successfully!
            </p>
            <p className="text-sm text-green-600">
              {uploadMode === 'manual'
                ? 'Remember to upload the final voucher with names before the deadline.'
                : `The voucher${extractedPDFs.length > 1 ? 's' : ''} and tickets have been created.`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setSuccess(false)}
          >
            Upload More
          </Button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* MANUAL ENTRY MODE */}
      {!success && uploadMode === 'manual' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileEdit className="w-5 h-5 text-orange-600" />
              Create Placeholder Voucher
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Create a placeholder voucher for tickets without names. You&apos;ll need to upload the final voucher with customer names before the deadline.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category */}
              <div>
                <Label className="text-sm font-medium mb-1">Ticket Category *</Label>
                <select
                  value={manualFormData.categoryId}
                  onChange={(e) => {
                    setManualFormData({...manualFormData, categoryId: e.target.value})
                    setSelectedAvailabilityId(null)
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select category...</option>
                  {categoriesWithDeadline.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Voucher Source */}
              <div>
                <Label className="text-sm font-medium mb-1">Voucher Source *</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setManualFormData({...manualFormData, voucherSource: 'b2b'})}
                    className={`flex-1 px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                      manualFormData.voucherSource === 'b2b'
                        ? 'bg-purple-100 border-purple-300 text-purple-700'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    B2B
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualFormData({...manualFormData, voucherSource: 'b2c'})}
                    className={`flex-1 px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                      manualFormData.voucherSource === 'b2c'
                        ? 'bg-green-100 border-green-300 text-green-700'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    B2C
                  </button>
                </div>
              </div>

              {/* Entry Time - Hour and Minute */}
              <div>
                <Label className="text-sm font-medium mb-1">Entry Time *</Label>
                <div className="flex gap-2 items-center">
                  <select
                    value={entryHour}
                    onChange={(e) => setEntryHour(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Hour</option>
                    {hourOptions.map(hour => (
                      <option key={hour} value={hour}>{hour}</option>
                    ))}
                  </select>
                  <span className="text-gray-500 font-medium">:</span>
                  <select
                    value={entryMinute}
                    onChange={(e) => setEntryMinute(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Min</option>
                    {minuteOptions.map(min => (
                      <option key={min} value={min}>{min}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date Mode Selector */}
              <div className="md:col-span-2">
                <Label className="text-sm font-medium mb-1">Date Selection</Label>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setDateMode('single')}
                    className={`flex-1 px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                      dateMode === 'single'
                        ? 'bg-orange-100 border-orange-300 text-orange-700'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Single Date
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateMode('multiple')}
                    className={`flex-1 px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                      dateMode === 'multiple'
                        ? 'bg-orange-100 border-orange-300 text-orange-700'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Multiple Dates
                  </button>
                </div>

                {/* Single Date */}
                {dateMode === 'single' && (
                  <div>
                    <Label className="text-sm font-medium mb-1">Visit Date *</Label>
                    <input
                      type="date"
                      value={singleDate}
                      onChange={(e) => setSingleDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                )}

                {/* Multiple Dates - Date Range */}
                {dateMode === 'multiple' && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium mb-1">Date Range *</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">From</span>
                        <input
                          type="date"
                          value={dateRange.startDate}
                          onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <span className="text-sm text-gray-500">to</span>
                        <input
                          type="date"
                          value={dateRange.endDate}
                          onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium mb-2 block">Affected Days</Label>
                      <p className="text-xs text-gray-500 mb-2">Select which days this applies to</p>
                      <div className="flex gap-1">
                        {dayNames.map((day, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              if (selectedDays.includes(day.key)) {
                                setSelectedDays(selectedDays.filter(d => d !== day.key))
                              } else {
                                setSelectedDays([...selectedDays, day.key])
                              }
                            }}
                            className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                              selectedDays.includes(day.key)
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {calculatedDates.length > 0 && (
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-700">
                          <span className="font-semibold">{calculatedDates.length}</span> dates selected
                          {calculatedDates.length <= 5 && (
                            <span className="ml-1 text-blue-600">
                              ({calculatedDates.join(', ')})
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Ticket Count */}
              <div>
                <Label className="text-sm font-medium mb-1">Total Tickets *</Label>
                <input
                  type="number"
                  min={1}
                  value={manualFormData.ticketCount || ''}
                  onChange={(e) => setManualFormData({...manualFormData, ticketCount: parseInt(e.target.value) || 0})}
                  placeholder="e.g., 25"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* Product Name - Select from category */}
              <div>
                <Label className="text-sm font-medium mb-1">Product Name *</Label>
                {categoryProductNames.length > 0 ? (
                  <select
                    value={manualFormData.productName}
                    onChange={(e) => setManualFormData({...manualFormData, productName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Select product...</option>
                    {categoryProductNames.map(product => (
                      <option key={product} value={product}>{product}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={manualFormData.productName}
                    onChange={(e) => setManualFormData({...manualFormData, productName: e.target.value})}
                    placeholder="e.g., COLOSSEO-FORO ROMANO PALATINO 24H - B2B"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                )}
                {!manualFormData.categoryId && (
                  <p className="text-xs text-gray-500 mt-1">Select a category first to see available products</p>
                )}
              </div>

            </div>

            {/* Tour Assignment (optional) - only for single date mode */}
            {dateMode === 'single' && availabilities.length > 0 && singleDate && (
              <div className="mt-4">
                <Label className="text-sm font-medium mb-2 block">Link to Tour (optional)</Label>
                <div className="space-y-2 max-h-80 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  <label
                    className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-50 ${
                      selectedAvailabilityId === null ? 'bg-gray-50 border border-gray-200' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="availability"
                      checked={selectedAvailabilityId === null}
                      onChange={() => setSelectedAvailabilityId(null)}
                      className="text-orange-600"
                    />
                    <div>
                      <p className="text-sm text-gray-500">No tour assignment</p>
                    </div>
                  </label>
                  {availabilities.map(avail => (
                    <label
                      key={avail.id}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-50 ${
                        selectedAvailabilityId === avail.id ? 'bg-orange-50 border border-orange-200' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="availability"
                        checked={selectedAvailabilityId === avail.id}
                        onChange={() => setSelectedAvailabilityId(avail.id)}
                        className="text-orange-600"
                      />
                      <div>
                        <p className="font-medium text-sm">{avail.activities?.title || avail.activity_id}</p>
                        <p className="text-xs text-gray-500">{avail.local_time}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Tour Assignment - Multiple dates mode */}
            {dateMode === 'multiple' && multiDateActivities.length > 0 && calculatedDates.length > 0 && (
              <div className="mt-4 p-4 border border-gray-200 rounded-lg">
                <Label className="text-sm font-medium mb-3 block">Link to Tour (optional)</Label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Activity Select */}
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Tour/Activity</Label>
                    <select
                      value={selectedMultiDateActivityId}
                      onChange={(e) => {
                        setSelectedMultiDateActivityId(e.target.value)
                        setSelectedMultiDateTime('')
                        setMultiDateAvailabilityStatus([])
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">No tour assignment</option>
                      {multiDateActivities.map(activity => (
                        <option key={activity.id} value={activity.id}>{activity.title}</option>
                      ))}
                    </select>
                  </div>

                  {/* Time Select */}
                  {selectedMultiDateActivityId && (
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">Tour Start Time</Label>
                      <select
                        value={selectedMultiDateTime}
                        onChange={(e) => setSelectedMultiDateTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">Select time...</option>
                        {availableTimesForActivity.map(time => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Status indicator */}
                {checkingAvailability && (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Checking availability...</span>
                  </div>
                )}

                {!checkingAvailability && selectedMultiDateActivityId && selectedMultiDateTime && multiDateAvailabilityStatus.length > 0 && (
                  <div className="space-y-2">
                    {/* All dates have slots */}
                    {multiDateStats.missingCount === 0 && (
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <Check className="w-5 h-5 text-green-600" />
                        <span className="text-sm text-green-800 font-medium">
                          All {multiDateStats.total} dates have matching tour slots
                        </span>
                      </div>
                    )}

                    {/* Some dates missing */}
                    {multiDateStats.missingCount > 0 && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-amber-600" />
                          <span className="text-sm text-amber-800 font-medium">
                            {multiDateStats.linkedCount} of {multiDateStats.total} dates have matching tour slots
                          </span>
                        </div>
                        <p className="text-xs text-amber-600 mt-2">
                          Missing slots for: {multiDateStats.missingDates.map(d =>
                            new Date(d).toLocaleDateString('it-IT', { weekday: 'short', month: 'short', day: 'numeric' })
                          ).join(', ')}
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Vouchers for missing dates will be created without tour link and marked with an alert.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Deadline Warning */}
            {manualDeadlineDate && calculatedDates.length > 0 && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 text-amber-800">
                  <Clock className="w-5 h-5" />
                  <span className="font-medium">
                    {calculatedDates.length > 1 ? 'Earliest Deadline:' : 'Deadline:'}
                  </span>
                  <span>{new Date(manualDeadlineDate).toLocaleDateString('it-IT', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</span>
                </div>
                <p className="text-sm text-amber-600 mt-1">
                  {calculatedDates.length > 1
                    ? `Each voucher will have its own deadline based on its visit date. This shows the earliest one (for ${earliestDate}).`
                    : 'Final voucher with customer names must be uploaded before this date.'}
                </p>
              </div>
            )}

            {/* Save Button */}
            <div className="mt-6 flex justify-end">
              <Button
                onClick={handleSaveManual}
                disabled={saving || !manualFormData.categoryId || calculatedDates.length === 0 || !combinedEntryTime || manualFormData.ticketCount <= 0 || !manualFormData.productName}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating {calculatedDates.length} voucher{calculatedDates.length !== 1 ? 's' : ''}...
                  </>
                ) : (
                  `Create ${calculatedDates.length || ''} Placeholder Voucher${calculatedDates.length !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF UPLOAD MODE */}
      {!success && uploadMode === 'pdf' && (
        <div className="space-y-6">
          {/* Step 1: Upload PDFs */}
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold">1</span>
              Upload PDFs
            </h2>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
              {files.length > 0 ? (
                <div className="space-y-3">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                      <FileText className="w-6 h-6 text-orange-600" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{file.name}</p>
                        <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      {extractedPDFs.length === 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {files.length < 5 && extractedPDFs.length === 0 && (
                    <label className="flex items-center gap-2 text-sm text-blue-600 cursor-pointer hover:text-blue-800">
                      <Plus className="w-4 h-4" />
                      Add more PDFs
                      <input
                        type="file"
                        accept="application/pdf"
                        multiple
                        onChange={addMoreFiles}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              ) : (
                <label className="cursor-pointer text-center block">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 mb-1">Click to upload or drag and drop</p>
                  <p className="text-sm text-gray-400">PDF files only (max 5 files, 10MB each)</p>
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {files.length > 0 && extractedPDFs.length === 0 && (
              <div className="mt-4 flex justify-end">
                <Button onClick={handleExtract} disabled={extracting}>
                  {extracting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    `Extract Data from ${files.length} PDF${files.length > 1 ? 's' : ''}`
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Step 2: Review Extracted Data */}
          {extractedPDFs.length > 0 && combinedExtractedData && (
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold">2</span>
                Review Extracted Data
                {extractedPDFs.length > 1 && (
                  <span className="text-sm font-normal text-gray-500">({extractedPDFs.length} PDFs combined)</span>
                )}
              </h2>

              {/* Mismatch Warning */}
              {mismatchWarning && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-red-800 font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {mismatchWarning}
                  </p>
                </div>
              )}

              {/* Extraction Warnings */}
              {hasExtractionWarnings && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-800 font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Some PDFs had extraction warnings
                  </p>
                  {extractedPDFs.filter(p => p.warning).map((p, i) => (
                    <p key={i} className="text-xs text-yellow-600 mt-1">
                      {p.file.name}: {p.warning}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Booking Number{extractedPDFs.length > 1 ? 's' : ''}</p>
                  <p className="font-semibold text-sm">{combinedExtractedData.booking_number}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Visit Date</p>
                  <p className="font-semibold">{combinedExtractedData.visit_date}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Entry Time</p>
                  <p className="font-semibold">{combinedExtractedData.entry_time}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Total Tickets</p>
                  <p className="font-semibold">{combinedExtractedData.tickets.length}</p>
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-blue-500">Product Name</p>
                    <p className="font-medium text-blue-800">{combinedExtractedData.product_name}</p>
                  </div>
                  {extractedPDFs[0]?.isB2B !== undefined && (
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                      extractedPDFs[0].isB2B
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {extractedPDFs[0].isB2B ? 'B2B' : 'B2C'}
                      {extractedPDFs[0].isB2B && extractedPDFs[0].b2bPriceAdjustment ? (
                        <span className="ml-1 text-xs">(+€{extractedPDFs[0].b2bPriceAdjustment}/ticket)</span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              {/* Category Selection */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Ticket Category *</Label>
                <div className="relative">
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => {
                      setSelectedCategoryId(e.target.value)
                      setSelectedAvailabilityId(null)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                  >
                    <option value="">Select a category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Tickets Table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {combinedExtractedData.tickets.map((ticket, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 text-sm">{ticket.holder_name}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            ticket.ticket_type.toLowerCase().includes('gratuito')
                              ? 'bg-green-100 text-green-700'
                              : ticket.ticket_type.toLowerCase().includes('ridotto')
                                ? 'bg-blue-100 text-blue-700'
                                : ticket.ticket_type.toLowerCase().includes('guide')
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-gray-100 text-gray-700'
                          }`}>
                            {ticket.ticket_type}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm">{ticket.price.toFixed(2)}€</td>
                        <td className="px-4 py-2 text-sm font-mono text-xs text-gray-500">{ticket.ticket_code}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3: Assign to Tour */}
          {extractedPDFs.length > 0 && combinedExtractedData && selectedCategoryId && (
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold">3</span>
                Assign to Tour (Optional)
              </h2>

              {availabilities.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <p>No tours found for {combinedExtractedData.visit_date} with this category.</p>
                  <p className="text-sm mt-1">You can still save the voucher{extractedPDFs.length > 1 ? 's' : ''} without assigning to a tour.</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchAvailability}
                        onChange={(e) => setSearchAvailability(e.target.value)}
                        placeholder="Search tours..."
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={showOnlyWithBookings}
                        onChange={(e) => setShowOnlyWithBookings(e.target.checked)}
                        className="w-4 h-4 text-orange-600 rounded"
                      />
                      <span className="text-sm text-gray-600">Only with bookings</span>
                    </label>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredAvailabilities
                      .filter(avail => !showOnlyWithBookings || (availabilityBookingCounts.get(avail.id) || 0) > 0)
                      .map(avail => {
                        const bookingCount = availabilityBookingCounts.get(avail.id) || 0
                        return (
                          <label
                            key={avail.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              selectedAvailabilityId === avail.id
                                ? 'border-orange-500 bg-orange-50'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="availability"
                              checked={selectedAvailabilityId === avail.id}
                              onChange={() => setSelectedAvailabilityId(avail.id)}
                              className="w-4 h-4 text-orange-600"
                            />
                            <div className="flex-1">
                              <p className="font-medium">{avail.activities?.title}</p>
                              <p className="text-sm text-gray-500">{avail.local_time}</p>
                            </div>
                            {bookingCount > 0 && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                {bookingCount} booking{bookingCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </label>
                        )
                      })}
                    {filteredAvailabilities.filter(avail => !showOnlyWithBookings || (availabilityBookingCounts.get(avail.id) || 0) > 0).length === 0 && (
                      <div className="text-center py-4 text-gray-500 text-sm">
                        No tours with bookings found. Uncheck the filter to see all tours.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4: Validation Results */}
          {selectedAvailabilityId && validationResults.length > 0 && (
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold">4</span>
                Validation Results
                {warningCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                    {warningCount} warning{warningCount !== 1 ? 's' : ''}
                  </span>
                )}
              </h2>

              {warningCount === 0 ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check className="w-5 h-5" />
                  <p>All tickets validated successfully!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {validationResults.filter(r => r.warnings.length > 0).map((result, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-yellow-800">{result.ticket.holder_name}</p>
                        <ul className="text-sm text-yellow-700 mt-1">
                          {result.warnings.map((w, i) => (
                            <li key={i}>• {w}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Save Button */}
          {extractedPDFs.length > 0 && selectedCategoryId && (
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setFiles([])
                  setExtractedPDFs([])
                  setSelectedCategoryId('')
                  setSelectedAvailabilityId(null)
                  setMismatchWarning(null)
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Save {extractedPDFs.length} Voucher{extractedPDFs.length > 1 ? 's' : ''} {warningCount > 0 ? '(with warnings)' : ''}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
