// src/components/NewRecapPage.tsx
'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, ChevronLeft, RefreshCw, Download, Search, ExternalLink, X, MessageSquare, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import NotesDrawer from '@/components/NotesDrawer'
import { Switch } from "@/components/ui/switch"
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import * as XLSX from 'xlsx'
import { sanitizeDataForExcel } from '@/lib/security/sanitize'
import VoucherRequestDialog from '@/components/VoucherRequestDialog'
import { TicketCategory, Partner } from '@/lib/api-client'

// Excluded pricing categories for specific activities
const EXCLUDED_PRICING_CATEGORIES: Record<string, string[]> = {
  '217949': ['6 a 12 años', '13 a 17 años'],
  '216954': ['6 a 12 años', '13 a 17 años'],
  '220107': ['6 a 12 años', '13 a 17 años']
}

// Activities where ONLY specific pricing category IDs are allowed (by pricing_category_id)
const ALLOWED_ONLY_PRICING_CATEGORY_IDS: Record<string, string[]> = {
  '901961': ['780302', '815525', '281494']
}

// Helper function to check if a pricing category should be excluded
const shouldExcludePricingCategory = (activityId: string, categoryTitle: string, pricingCategoryId?: string): boolean => {
  // First check if this activity has an "allowed only" list by pricing_category_id
  const allowedOnlyIds = ALLOWED_ONLY_PRICING_CATEGORY_IDS[activityId]
  if (allowedOnlyIds && pricingCategoryId) {
    return !allowedOnlyIds.includes(pricingCategoryId)
  }

  // Then check the exclusion list by category title
  const excludedCategories = EXCLUDED_PRICING_CATEGORIES[activityId]
  return excludedCategories ? excludedCategories.includes(categoryTitle) : false
}

// Helper function to shorten category display names
const shortenCategoryName = (category: string): string => {
  if (category === '18 - 24 años - sólo UE') return 'UE'
  return category
}

// Interface for activity-partner mapping
interface ActivityPartnerMapping {
  id: string
  activity_id: string
  partner_id: string
  ticket_category_id: string | null
  partners?: {
    partner_id: string
    name: string
    email: string
  }
  ticket_categories?: {
    id: string
    name: string
  }
}

// Helper function to check if an activity has a linked partner
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _getActivityPartnerMapping = (
  activityId: string,
  activityPartnerMappings: ActivityPartnerMapping[]
): ActivityPartnerMapping | null => {
  if (!activityPartnerMappings.length) return null
  return activityPartnerMappings.find(m => m.activity_id === activityId) || null
}

// Helper to group vouchers by category for display
interface VoucherCategoryGroup {
  categoryName: string
  ticketCount: number
  entryTime: string | null
  // New: separate B2B and B2C counts
  b2bCount: number
  b2cCount: number
  b2bEntryTime: string | null
  b2cEntryTime: string | null
}

const groupVouchersByCategory = (vouchers: VoucherInfo[]): VoucherCategoryGroup[] => {
  if (!vouchers || vouchers.length === 0) return []

  const categoryMap = new Map<string, {
    ticketCount: number
    entryTime: string | null
    b2bCount: number
    b2cCount: number
    b2bEntryTime: string | null
    b2cEntryTime: string | null
  }>()

  vouchers.forEach(voucher => {
    const categoryName = voucher.category_name || 'Sconosciuto'
    const existing = categoryMap.get(categoryName)
    // Use non_guide_tickets for counting (excludes guide tickets from diff calculation)
    const ticketCount = voucher.non_guide_tickets ?? voucher.total_tickets ?? 0
    const isB2B = voucher.voucher_source === 'b2b'

    if (existing) {
      existing.ticketCount += ticketCount
      if (isB2B) {
        existing.b2bCount += ticketCount
        if (!existing.b2bEntryTime && voucher.entry_time) {
          existing.b2bEntryTime = voucher.entry_time
        }
      } else {
        existing.b2cCount += ticketCount
        if (!existing.b2cEntryTime && voucher.entry_time) {
          existing.b2cEntryTime = voucher.entry_time
        }
      }
      // Keep the first entry_time found for this category (legacy)
      if (!existing.entryTime && voucher.entry_time) {
        existing.entryTime = voucher.entry_time
      }
    } else {
      categoryMap.set(categoryName, {
        ticketCount,
        entryTime: voucher.entry_time || null,
        b2bCount: isB2B ? ticketCount : 0,
        b2cCount: isB2B ? 0 : ticketCount,
        b2bEntryTime: isB2B ? (voucher.entry_time || null) : null,
        b2cEntryTime: isB2B ? null : (voucher.entry_time || null)
      })
    }
  })

  return Array.from(categoryMap.entries()).map(([categoryName, data]) => ({
    categoryName,
    ticketCount: data.ticketCount,
    entryTime: data.entryTime,
    b2bCount: data.b2bCount,
    b2cCount: data.b2cCount,
    b2bEntryTime: data.b2bEntryTime,
    b2cEntryTime: data.b2cEntryTime
  }))
}

// Definizione dei tipi
interface Tour {
  activity_id: string
  title: string
}

interface Participant {
  pricing_category_id?: string | number
  booked_title?: string
  quantity?: number
  age?: number
  passenger_first_name?: string
  passenger_last_name?: string
}

interface Booking {
  activity_booking_id: string
  activity_id: string
  start_date_time: string
  created_at: string
  total_price?: number
  net_price?: number
  product_title?: string
  status?: string
  activities?: {
    activity_id: string
    title: string
  }
  bookings?: {
    booking_id: string
    status: string
    total_price: number
    currency: string
    confirmation_code: string
    creation_date: string
  }
  pricing_category_bookings?: Participant[]
}

interface Availability {
  id: number
  activity_id: string
  local_date: string
  local_time: string
  local_date_time: string
  vacancy_available?: number
  vacancy_opening?: number
  vacancy?: number
  status: string
  activities: {
    activity_id: string
    title: string
  }
}

interface GuideInfo {
  id: string
  name: string
}

interface EscortInfo {
  id: string
  name: string
}

interface SlotData {
  id: string
  tourId: string
  tourTitle: string
  date: string
  time: string
  totalAmount: number
  bookingCount: number
  participants: Record<string, number>
  totalParticipants: number
  availabilityLeft: number
  status: string
  bookings: Booking[]
  availabilityId?: string
  guidesAssigned?: number
  guideNames?: string[]
  guideData?: GuideInfo[]
  escortData?: EscortInfo[]
  ticketCount?: number
  vouchers?: VoucherInfo[]
  lastReservation: {
    date: string
    bookingId: string
  } | null
  firstReservation: {
    date: string
    bookingId: string
  } | null
  // Cost fields
  guideCost: number
  escortCost: number
  headphoneCost: number
  printingCost: number
  voucherCost: number
  totalCost: number
  netProfit: number
  // Per raggruppamenti
  isDateGroup?: boolean
  slots?: SlotData[]
  // Planned availability flag
  isPlanned?: boolean
  plannedId?: string
}

interface PlannedAvailability {
  id: string
  activity_id: string
  local_date: string
  local_time: string
  status: 'pending' | 'matched'
  matched_availability_id: number | null
  notes: string | null
  created_by: string | null
  created_at: string
}

interface AvailableGuide {
  guide_id: string
  first_name: string
  last_name: string
  languages?: string[]
}

interface BusyGuideInfo {
  guide_id: string
  conflicting_service: string
  conflicting_time: string
}

interface Ticket {
  id: string
  ticket_code: string
  holder_name: string
  ticket_type: string
  price: number
}

interface VoucherInfo {
  id: string
  booking_number: string
  total_tickets: number
  non_guide_tickets: number  // Tickets excluding guide tickets (for diff calculation)
  product_name: string | null
  category_name: string | null
  pdf_path: string | null
  entry_time?: string | null
  visit_date?: string | null
  is_placeholder?: boolean
  placeholder_ticket_count?: number | null
  voucher_source?: 'b2b' | 'b2c' | null
}

interface VoucherDetail extends VoucherInfo {
  tickets: Ticket[]
  activity_availability?: {
    local_time: string
    activities?: { title: string }
  } | null
}

// Language to flag emoji mapping
const languageFlags: Record<string, string> = {
  'italian': '🇮🇹',
  'italiano': '🇮🇹',
  'it': '🇮🇹',
  'english': '🇬🇧',
  'inglese': '🇬🇧',
  'en': '🇬🇧',
  'spanish': '🇪🇸',
  'spagnolo': '🇪🇸',
  'es': '🇪🇸',
  'french': '🇫🇷',
  'francese': '🇫🇷',
  'fr': '🇫🇷',
  'german': '🇩🇪',
  'tedesco': '🇩🇪',
  'de': '🇩🇪',
  'portuguese': '🇵🇹',
  'portoghese': '🇵🇹',
  'pt': '🇵🇹',
  'chinese': '🇨🇳',
  'cinese': '🇨🇳',
  'zh': '🇨🇳',
  'japanese': '🇯🇵',
  'giapponese': '🇯🇵',
  'ja': '🇯🇵',
  'russian': '🇷🇺',
  'russo': '🇷🇺',
  'ru': '🇷🇺',
  'arabic': '🇸🇦',
  'arabo': '🇸🇦',
  'ar': '🇸🇦',
  'dutch': '🇳🇱',
  'olandese': '🇳🇱',
  'nl': '🇳🇱',
  'polish': '🇵🇱',
  'polacco': '🇵🇱',
  'pl': '🇵🇱',
  'korean': '🇰🇷',
  'coreano': '🇰🇷',
  'ko': '🇰🇷',
}

const getLanguageFlag = (language: string): string => {
  const normalized = language.toLowerCase().trim()
  return languageFlags[normalized] || '🏳️'
}

export default function NewRecapPage() {
  // Stati principali
  const [tours, setTours] = useState<Tour[]>([])
  const [selectedFilter, setSelectedFilter] = useState('')
  const [tourSearch, setTourSearch] = useState('')
  const [showTourDropdown, setShowTourDropdown] = useState(false)
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  })
  const [data, setData] = useState<SlotData[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedRows, setExpandedRows] = useState(new Set<string>())
  const [participantCategories, setParticipantCategories] = useState<string[]>([])
  const [ticketCategories, setTicketCategories] = useState<{ name: string; short_code: string; display_order: number; guide_requires_ticket: boolean }[]>([])
  const [showOnlyWithBookings, setShowOnlyWithBookings] = useState(false)

  // Guide change dialog state
  const [guideDialogOpen, setGuideDialogOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<SlotData | null>(null)
  const [selectedGuideToChange, setSelectedGuideToChange] = useState<GuideInfo | null>(null)
  const [availableGuides, setAvailableGuides] = useState<AvailableGuide[]>([])
  const [newGuideId, setNewGuideId] = useState<string>('')
  const [changingGuide, setChangingGuide] = useState(false)
  const [guideSearchTerm, setGuideSearchTerm] = useState('')
  const [busyGuides, setBusyGuides] = useState<BusyGuideInfo[]>([])

  // Escort change dialog state
  const [escortDialogOpen, setEscortDialogOpen] = useState(false)
  const [selectedSlotForEscort, setSelectedSlotForEscort] = useState<SlotData | null>(null)
  const [selectedEscortToChange, setSelectedEscortToChange] = useState<EscortInfo | null>(null)
  const [availableEscorts, setAvailableEscorts] = useState<{ escort_id: string; first_name: string; last_name: string }[]>([])
  const [newEscortId, setNewEscortId] = useState<string>('')
  const [changingEscort, setChangingEscort] = useState(false)
  const [escortSearchTerm, setEscortSearchTerm] = useState('')
  const [escortDialogDate, setEscortDialogDate] = useState<string>('')
  const [selectedSlotsForEscort, setSelectedSlotsForEscort] = useState<Set<string>>(new Set())
  const [allSlotsForDate, setAllSlotsForDate] = useState<{ availabilityId: string; time: string; tourTitle: string; bookingCount: number; escortNames: string[] }[]>([])

  // Voucher dialog state
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false)
  const [selectedSlotForVouchers, setSelectedSlotForVouchers] = useState<SlotData | null>(null)

  // Voucher detail dialog state
  const [voucherDetailOpen, setVoucherDetailOpen] = useState(false)
  const [selectedVoucherDetail, setSelectedVoucherDetail] = useState<VoucherDetail | null>(null)
  const [loadingVoucherDetail, setLoadingVoucherDetail] = useState(false)

  // Voucher request dialog state
  const [voucherRequestDialogOpen, setVoucherRequestDialogOpen] = useState(false)
  const [selectedSlotForRequest, setSelectedSlotForRequest] = useState<SlotData | null>(null)
  const [selectedCategoryForRequest, setSelectedCategoryForRequest] = useState<(TicketCategory & { partners?: Partner }) | null>(null)
  const [ticketCategoriesWithPartners, setTicketCategoriesWithPartners] = useState<(TicketCategory & { partners?: Partner })[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activityPartnerMappings, setActivityPartnerMappings] = useState<ActivityPartnerMapping[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [voucherRequests, setVoucherRequests] = useState<Map<number, { count: number; totalPax: number; status: string }>>(new Map())

  // Notes drawer state
  interface OperationNote {
    id: string
    local_date: string | null
    activity_availability_id: number | null
    guide_id: string | null
    escort_id: string | null
    voucher_id: string | null
    content: string
    note_type: 'general' | 'urgent' | 'warning' | 'info'
    created_by: string
    created_by_email: string | null
    created_at: string
    replies: {
      id: string
      content: string
      created_by: string
      created_by_email: string | null
      created_at: string
    }[]
  }

  interface NoteContext {
    type: 'date' | 'slot' | 'guide' | 'escort' | 'voucher'
    id?: string | number
    label: string
    local_date?: string
    activity_availability_id?: number
    guide_id?: string
    escort_id?: string
    voucher_id?: string
    slotData?: SlotData  // For passing slot-specific entities
  }

  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false)
  const [notesContext, setNotesContext] = useState<NoteContext | null>(null)
  const [notes, setNotes] = useState<OperationNote[]>([])
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [notesCountByDate, setNotesCountByDate] = useState<Map<string, number>>(new Map())
  const [notesCountByGuide, setNotesCountByGuide] = useState<Map<string, number>>(new Map())
  const [notesCountByEscort, setNotesCountByEscort] = useState<Map<string, number>>(new Map())
  const [notesCountBySlot, setNotesCountBySlot] = useState<Map<number, number>>(new Map())
  const [notesCountByVoucher, setNotesCountByVoucher] = useState<Map<string, number>>(new Map())
  const [notesByDate, setNotesByDate] = useState<Map<string, OperationNote[]>>(new Map())
  const [notesBySlot, setNotesBySlot] = useState<Map<number, OperationNote[]>>(new Map())

  // Planned availability state
  const [, setPlannedAvailabilities] = useState<PlannedAvailability[]>([])
  const [showAddPlannedDialog, setShowAddPlannedDialog] = useState(false)
  const [addPlannedDate, setAddPlannedDate] = useState('')
  const [addPlannedTime, setAddPlannedTime] = useState('')
  const [creatingPlanned, setCreatingPlanned] = useState(false)

  // Filtered tours for search
  const filteredTours = tours.filter(tour =>
    tour.title.toLowerCase().includes(tourSearch.toLowerCase())
  )

  // Filtered guides for search in dialog
  const filteredGuides = availableGuides.filter(guide =>
    `${guide.first_name} ${guide.last_name}`.toLowerCase().includes(guideSearchTerm.toLowerCase())
  )

  // Filtered escorts for search in dialog
  const filteredEscorts = availableEscorts.filter(escort =>
    `${escort.first_name} ${escort.last_name}`.toLowerCase().includes(escortSearchTerm.toLowerCase())
  )

  // Get selected tour title
  const selectedTourTitle = tours.find(t => t.activity_id === selectedFilter)?.title || ''

  // Definisci loadData con useCallback per evitare warning di dipendenze
  const loadData = useCallback(async () => {
    if (!selectedFilter) {
      setData([])
      setLoading(false)
      return
    }

    setLoading(true)

    const tourIds = [selectedFilter]

    // Query per le prenotazioni - Filter both activity_bookings and parent bookings status
    let bookingsQuery = supabase
      .from('activity_bookings')
      .select(`
        *,
        activities!inner (
          activity_id,
          title
        ),
        bookings!inner (
          booking_id,
          status,
          total_price,
          currency,
          confirmation_code,
          creation_date
        ),
        pricing_category_bookings (
          pricing_category_id,
          booked_title,
          quantity,
          age,
          passenger_first_name,
          passenger_last_name
        )
      `)
      .not('status', 'in', '(CANCELLED)')  // Filter only activity_bookings.status
      .gte('start_date_time', `${dateRange.start}T00:00:00`)
      .lte('start_date_time', `${dateRange.end}T23:59:59`)

    bookingsQuery = bookingsQuery.in('activity_id', tourIds)

    const { data: bookings } = await bookingsQuery

    // Query per le disponibilità
    const availabilityQuery = supabase
      .from('activity_availability')
      .select(`
        *,
        activities!inner (
          activity_id,
          title
        )
      `)
      .gte('local_date', dateRange.start)
      .lte('local_date', dateRange.end)
      .in('activity_id', tourIds)
      .order('local_date_time', { ascending: true })

    const { data: availabilitiesRaw } = await availabilityQuery

    // Transform the data to match our interface (Supabase returns activities as array)
    const availabilities = availabilitiesRaw?.map((avail) => ({
      ...avail,
      activities: Array.isArray(avail.activities) ? avail.activities[0] : avail.activities
    })) as Availability[]

    // Query per le assegnazioni delle guide con nomi (includes planned_availability_id)
    const { data: guideAssignments } = await supabase
      .from('guide_assignments')
      .select(`
        assignment_id,
        activity_availability_id,
        planned_availability_id,
        guide_id,
        guide:guides (
          guide_id,
          first_name,
          last_name
        )
      `)

    // Crea mappe per contare e memorizzare i nomi delle guide per activity_availability_id
    // Also create separate maps for planned_availability_id
    const guideCountMap = new Map<string, number>()
    const guideNamesMap = new Map<string, string[]>()
    const guideDataMap = new Map<string, GuideInfo[]>()
    // Maps for planned availabilities (using "planned_" prefix)
    const plannedGuideCountMap = new Map<string, number>()
    const plannedGuideNamesMap = new Map<string, string[]>()
    const plannedGuideDataMap = new Map<string, GuideInfo[]>()

    guideAssignments?.forEach((assignment) => {
      // Supabase returns guide as an array
      const guide = Array.isArray(assignment.guide) ? assignment.guide[0] : assignment.guide
      const guideName = guide ? `${guide.first_name} ${guide.last_name}` : null

      // Handle real availability assignments
      if (assignment.activity_availability_id) {
        const availId = String(assignment.activity_availability_id)
        guideCountMap.set(availId, (guideCountMap.get(availId) || 0) + 1)

        if (guide && guideName) {
          const existingNames = guideNamesMap.get(availId) || []
          guideNamesMap.set(availId, [...existingNames, guideName])

          // Store guide data with ID
          const existingData = guideDataMap.get(availId) || []
          guideDataMap.set(availId, [...existingData, { id: assignment.guide_id, name: guideName }])
        }
      }

      // Handle planned availability assignments
      if (assignment.planned_availability_id) {
        const plannedId = String(assignment.planned_availability_id)
        plannedGuideCountMap.set(plannedId, (plannedGuideCountMap.get(plannedId) || 0) + 1)

        if (guide && guideName) {
          const existingNames = plannedGuideNamesMap.get(plannedId) || []
          plannedGuideNamesMap.set(plannedId, [...existingNames, guideName])

          // Store guide data with ID
          const existingData = plannedGuideDataMap.get(plannedId) || []
          plannedGuideDataMap.set(plannedId, [...existingData, { id: assignment.guide_id, name: guideName }])
        }
      }
    })

    // Query per i voucher (biglietti) - fetch tickets for the date range with prices
    // Include vouchers linked via activity_availability_id OR planned_availability_id
    const { data: vouchers } = await supabase
      .from('vouchers')
      .select(`
        id,
        activity_availability_id,
        planned_availability_id,
        booking_number,
        total_tickets,
        product_name,
        pdf_path,
        entry_time,
        is_placeholder,
        placeholder_ticket_count,
        voucher_source,
        ticket_categories (id, name),
        tickets (id, price, ticket_type, pax_count)
      `)
      .gte('visit_date', dateRange.start)
      .lte('visit_date', dateRange.end)
      .or('activity_availability_id.not.is.null,planned_availability_id.not.is.null')

    // Fetch product_activity_mappings to get ticket_source for products
    // This determines B2B vs B2C for non-placeholder (PDF-uploaded) vouchers
    const productNames = [...new Set(vouchers?.map(v => v.product_name).filter(Boolean) || [])]
    const { data: productMappings } = productNames.length > 0
      ? await supabase
          .from('product_activity_mappings')
          .select('product_name, ticket_source')
          .in('product_name', productNames)
          .not('ticket_source', 'is', null)
      : { data: [] }

    // Create map of product_name to ticket_source
    const productSourceMap = new Map<string, 'b2b' | 'b2c'>()
    productMappings?.forEach(mapping => {
      if (mapping.ticket_source) {
        productSourceMap.set(mapping.product_name, mapping.ticket_source as 'b2b' | 'b2c')
      }
    })

    // Crea mappa per i voucher per activity_availability_id
    // Also create maps for planned_availability_id (keyed with "planned:" prefix)
    const ticketCountMap = new Map<string, number>()
    const voucherMap = new Map<string, VoucherInfo[]>()
    const voucherCostMap = new Map<string, number>()
    // Planned voucher maps - keyed by planned_availability_id
    const plannedTicketCountMap = new Map<string, number>()
    const plannedVoucherMap = new Map<string, VoucherInfo[]>()
    const plannedVoucherCostMap = new Map<string, number>()

    vouchers?.forEach((voucher) => {
      // For placeholder vouchers, use placeholder_ticket_count directly
      // For regular vouchers, count non-guide tickets from tickets table
      let nonGuideTicketCount = 0
      let voucherTicketCost = 0

      if (voucher.is_placeholder && voucher.placeholder_ticket_count) {
        // Placeholder vouchers: use the placeholder_ticket_count
        nonGuideTicketCount = voucher.placeholder_ticket_count
        voucherTicketCost = 0 // No cost info for placeholders
      } else {
        // Regular vouchers: count from tickets table
        const tickets = voucher.tickets as { id: string; price: number; ticket_type?: string; pax_count?: number }[] | undefined
        nonGuideTicketCount = tickets?.filter(t =>
          !t.ticket_type?.toLowerCase().includes('guide')
        ).reduce((sum, t) => sum + (t.pax_count || 1), 0) || 0
        voucherTicketCost = tickets?.reduce((sum, t) => sum + (t.price || 0), 0) || 0
      }

      // Determine voucher source:
      // - For placeholder vouchers (manual entry): use explicitly set voucher_source
      // - For non-placeholder vouchers (PDF uploads): use ticket_source from product_activity_mappings
      let effectiveSource: 'b2b' | 'b2c' | null = voucher.voucher_source as 'b2b' | 'b2c' | null
      if (!voucher.is_placeholder && voucher.product_name) {
        const mappedSource = productSourceMap.get(voucher.product_name)
        if (mappedSource) {
          effectiveSource = mappedSource
        }
      }

      // Build voucher info
      const voucherInfo: VoucherInfo = {
        id: voucher.id,
        booking_number: voucher.booking_number,
        total_tickets: voucher.total_tickets,
        non_guide_tickets: nonGuideTicketCount,  // Exclude guide tickets for diff
        product_name: voucher.product_name,
        category_name: Array.isArray(voucher.ticket_categories)
          ? (voucher.ticket_categories[0] as { id: string; name: string } | undefined)?.name || null
          : (voucher.ticket_categories as { id: string; name: string } | null)?.name || null,
        pdf_path: voucher.pdf_path,
        entry_time: voucher.entry_time,
        is_placeholder: voucher.is_placeholder || false,
        placeholder_ticket_count: voucher.placeholder_ticket_count,
        voucher_source: effectiveSource
      }

      // Map to real availability
      if (voucher.activity_availability_id) {
        const availId = String(voucher.activity_availability_id)
        ticketCountMap.set(availId, (ticketCountMap.get(availId) || 0) + nonGuideTicketCount)
        voucherCostMap.set(availId, (voucherCostMap.get(availId) || 0) + voucherTicketCost)
        const existingVouchers = voucherMap.get(availId) || []
        voucherMap.set(availId, [...existingVouchers, voucherInfo])
      }
      // Map to planned availability (when no real availability)
      else if (voucher.planned_availability_id) {
        const plannedId = String(voucher.planned_availability_id)
        plannedTicketCountMap.set(plannedId, (plannedTicketCountMap.get(plannedId) || 0) + nonGuideTicketCount)
        plannedVoucherCostMap.set(plannedId, (plannedVoucherCostMap.get(plannedId) || 0) + voucherTicketCost)
        const existingVouchers = plannedVoucherMap.get(plannedId) || []
        plannedVoucherMap.set(plannedId, [...existingVouchers, voucherInfo])
      }
    })

    // === COST QUERIES ===
    // Fetch escort assignments with escort details
    const { data: escortAssignments } = await supabase
      .from('escort_assignments')
      .select('assignment_id, escort_id, activity_availability_id, escort:escorts(first_name, last_name)')

    // Fetch headphone assignments
    const { data: headphoneAssignments } = await supabase
      .from('headphone_assignments')
      .select('assignment_id, headphone_id, activity_availability_id')

    // Fetch printing assignments
    const { data: printingAssignments } = await supabase
      .from('printing_assignments')
      .select('assignment_id, printing_id, activity_availability_id')

    // Fetch resource rates (for escort, headphone, printing)
    const { data: resourceRates } = await supabase
      .from('resource_rates')
      .select('resource_type, resource_id, rate_amount, rate_type')

    // Fetch guide activity costs (legacy fallback)
    const { data: guideActivityCosts } = await supabase
      .from('guide_activity_costs')
      .select('activity_id, guide_id, cost_amount')

    // Fetch seasonal pricing data
    const { data: costSeasons } = await supabase
      .from('cost_seasons')
      .select('id, year, name, start_date, end_date')

    const { data: guideSeasonalCosts } = await supabase
      .from('guide_seasonal_costs')
      .select('activity_id, season_id, cost_amount')

    const { data: specialCostDates } = await supabase
      .from('special_cost_dates')
      .select('id, date')

    const { data: guideSpecialDateCosts } = await supabase
      .from('guide_special_date_costs')
      .select('activity_id, special_date_id, cost_amount')

    // Fetch assignment cost overrides
    const { data: costOverrides } = await supabase
      .from('assignment_cost_overrides')
      .select('assignment_type, assignment_id, override_amount')

    // Fetch service groups for guide cost sharing
    const { data: serviceGroups } = await supabase
      .from('guide_service_groups')
      .select('id, primary_assignment_id, guide_service_group_members(guide_assignment_id)')

    // Build cost lookup maps
    const resourceRatesMap = new Map<string, { rate_amount: number; rate_type: string }>()
    resourceRates?.forEach(r => {
      resourceRatesMap.set(`${r.resource_type}:${r.resource_id}`, {
        rate_amount: r.rate_amount,
        rate_type: r.rate_type
      })
    })

    const costOverridesMap = new Map<string, number>()
    costOverrides?.forEach(o => {
      costOverridesMap.set(`${o.assignment_type}:${o.assignment_id}`, o.override_amount)
    })

    // Build guide cost maps (global and guide-specific)
    const globalGuideCostsMap = new Map<string, number>()
    const guideSpecificCostsMap = new Map<string, number>()
    guideActivityCosts?.forEach(c => {
      if (!c.guide_id) {
        globalGuideCostsMap.set(c.activity_id, c.cost_amount)
      } else {
        guideSpecificCostsMap.set(`${c.guide_id}:${c.activity_id}`, c.cost_amount)
      }
    })

    // Build seasonal cost maps
    const seasonalCostMap = new Map<string, number>()
    guideSeasonalCosts?.forEach(sc => {
      seasonalCostMap.set(`${sc.activity_id}:${sc.season_id}`, sc.cost_amount)
    })

    const specialDateMap = new Map<string, string>()
    specialCostDates?.forEach(sd => {
      specialDateMap.set(sd.date, sd.id)
    })

    const specialDateCostMap = new Map<string, number>()
    guideSpecialDateCosts?.forEach(sdc => {
      specialDateCostMap.set(`${sdc.activity_id}:${sdc.special_date_id}`, sdc.cost_amount)
    })

    // Map guide assignment to service group (for cost sharing)
    const assignmentToGroupMap = new Map<string, { group_id: string; is_primary: boolean }>()
    serviceGroups?.forEach(g => {
      const members = g.guide_service_group_members as { guide_assignment_id: string }[] | undefined
      members?.forEach(m => {
        assignmentToGroupMap.set(m.guide_assignment_id, {
          group_id: g.id,
          is_primary: g.primary_assignment_id === m.guide_assignment_id
        })
      })
    })

    // Helper to get guide cost for a specific activity and date
    const getGuideCostForDate = (activityId: string, date: string, guideId?: string): number => {
      // 1. Check special date cost first
      const specialDateId = specialDateMap.get(date)
      if (specialDateId) {
        const specialCost = specialDateCostMap.get(`${activityId}:${specialDateId}`)
        if (specialCost !== undefined) return specialCost
      }

      // 2. Check seasonal cost
      const dateObj = new Date(date)
      for (const season of (costSeasons || [])) {
        const seasonStart = new Date(season.start_date)
        const seasonEnd = new Date(season.end_date)
        const isInRange = dateObj >= seasonStart && dateObj <= seasonEnd
        const lookupKey = `${activityId}:${season.id}`
        const seasonalCost = seasonalCostMap.get(lookupKey)
        if (isInRange && seasonalCost !== undefined) {
          return seasonalCost
        }
      }

      // 3. Fall back to legacy global cost
      const globalCost = globalGuideCostsMap.get(activityId)
      if (globalCost !== undefined) return globalCost

      // 4. Guide-specific cost (backward compatibility)
      if (guideId) {
        const guideSpecificCost = guideSpecificCostsMap.get(`${guideId}:${activityId}`)
        if (guideSpecificCost !== undefined) return guideSpecificCost
      }

      return 0
    }

    // Build cost maps per activity_availability_id
    const guideCostMap = new Map<string, number>()
    const escortCostMap = new Map<string, number>()
    const headphoneCostMap = new Map<string, number>()
    const printingCostMap = new Map<string, number>()

    // Build availability lookup for date/activity info
    const availabilityLookup = new Map<string, { activity_id: string; local_date: string; local_time: string; vacancy_sold?: number }>()
    // Also build a reverse lookup: activity_id + date + time -> availability_id
    const bookingKeyToAvailIdMap = new Map<string, string>()

    const normalizeTimeForCost = (timeStr: string) => {
      if (!timeStr) return '00:00'
      return timeStr.substring(0, 5)
    }

    availabilities?.forEach(a => {
      const availIdStr = String(a.id)
      availabilityLookup.set(availIdStr, {
        activity_id: a.activity_id,
        local_date: a.local_date,
        local_time: a.local_time,
        vacancy_sold: (a as { vacancy_sold?: number }).vacancy_sold
      })
      // Key: activity_id-date-time
      const bookingKey = `${a.activity_id}-${a.local_date}-${normalizeTimeForCost(a.local_time)}`
      bookingKeyToAvailIdMap.set(bookingKey, availIdStr)
    })

    // Build actual pax count per availability from bookings
    // Match bookings to availability by activity_id + date + time
    const actualPaxPerAvailability = new Map<string, number>()
    bookings?.forEach(booking => {
      const date = booking.start_date_time.split('T')[0]
      const timeFromBooking = booking.start_date_time.split('T')[1]
      const normalizedTime = normalizeTimeForCost(timeFromBooking)
      const bookingKey = `${booking.activity_id}-${date}-${normalizedTime}`

      const availIdStr = bookingKeyToAvailIdMap.get(bookingKey)
      if (!availIdStr) return

      // Count actual pax from pricing_category_bookings
      let paxCount = 0
      booking.pricing_category_bookings?.forEach((pcb: { quantity?: number }) => {
        paxCount += pcb.quantity || 1
      })

      actualPaxPerAvailability.set(availIdStr, (actualPaxPerAvailability.get(availIdStr) || 0) + paxCount)
    })

    // Build escort data map per availability (for display)
    // Track unique escorts per day for deduplication in day-grouped rows
    const escortDataMap = new Map<string, EscortInfo[]>()
    const escortsPerDay = new Map<string, Set<string>>() // key: date, value: set of escort_ids

    escortAssignments?.forEach(assignment => {
      const availId = String(assignment.activity_availability_id)
      const avail = availabilityLookup.get(availId)
      if (!avail) return

      // Get escort name from the join
      const escort = Array.isArray(assignment.escort) ? assignment.escort[0] : assignment.escort
      if (escort) {
        const escortName = `${escort.first_name} ${escort.last_name}`
        const escortInfo: EscortInfo = { id: assignment.escort_id, name: escortName }

        // Add to per-slot map
        const existingData = escortDataMap.get(availId) || []
        // Avoid duplicates per slot (same escort assigned twice to same slot)
        if (!existingData.some(e => e.id === assignment.escort_id)) {
          escortDataMap.set(availId, [...existingData, escortInfo])
        }

        // Track unique escorts per day
        const dateEscorts = escortsPerDay.get(avail.local_date) || new Set()
        dateEscorts.add(assignment.escort_id)
        escortsPerDay.set(avail.local_date, dateEscorts)
      }
    })

    // Calculate guide costs per slot
    guideAssignments?.forEach(assignment => {
      const availId = String(assignment.activity_availability_id)
      const avail = availabilityLookup.get(availId)
      if (!avail) return

      const groupInfo = assignmentToGroupMap.get(assignment.assignment_id)
      // Skip non-primary grouped assignments (cost is shared)
      if (groupInfo && !groupInfo.is_primary) return

      // Check for override first
      let cost = costOverridesMap.get(`guide:${assignment.assignment_id}`)
      if (cost === undefined) {
        cost = getGuideCostForDate(avail.activity_id, avail.local_date, assignment.guide_id)
      }

      guideCostMap.set(availId, (guideCostMap.get(availId) || 0) + cost)
    })

    // Calculate escort costs per slot (daily rate divided by number of services WITH BOOKINGS that day)
    // First pass: count how many services each escort works per date (ONLY slots with actual pax)
    const escortServiceCounts = new Map<string, number>() // key: escort_id:date, value: count
    escortAssignments?.forEach(assignment => {
      const availId = String(assignment.activity_availability_id)
      const avail = availabilityLookup.get(availId)
      if (!avail) return

      // Only count slots that have actual bookings/pax
      const actualPax = actualPaxPerAvailability.get(availId) || 0
      if (actualPax === 0) return

      const dailyKey = `${assignment.escort_id}:${avail.local_date}`
      escortServiceCounts.set(dailyKey, (escortServiceCounts.get(dailyKey) || 0) + 1)
    })

    // Second pass: calculate escort costs per slot with division by services (ONLY for slots with pax)
    escortAssignments?.forEach(assignment => {
      const availId = String(assignment.activity_availability_id)
      const avail = availabilityLookup.get(availId)
      if (!avail) return

      // Only assign cost to slots that have actual bookings/pax
      const actualPax = actualPaxPerAvailability.get(availId) || 0
      if (actualPax === 0) return

      let cost = costOverridesMap.get(`escort:${assignment.assignment_id}`)
      if (cost === undefined) {
        const rate = resourceRatesMap.get(`escort:${assignment.escort_id}`)
        cost = rate?.rate_amount || 0
      }

      // Divide cost by number of services the escort works that day (with bookings)
      const dailyKey = `${assignment.escort_id}:${avail.local_date}`
      const serviceCount = escortServiceCounts.get(dailyKey) || 1
      const dividedCost = cost / serviceCount

      escortCostMap.set(availId, (escortCostMap.get(availId) || 0) + dividedCost)
    })

    // Calculate headphone costs per slot (per-pax rate - using actual pax from bookings)
    headphoneAssignments?.forEach(assignment => {
      const availId = String(assignment.activity_availability_id)
      const avail = availabilityLookup.get(availId)
      if (!avail) return

      // Use actual pax from bookings, not vacancy_sold
      const paxCount = actualPaxPerAvailability.get(availId) || 0
      if (paxCount === 0) return // No cost if no actual pax

      let cost = costOverridesMap.get(`headphone:${assignment.assignment_id}`)
      if (cost === undefined) {
        const rate = resourceRatesMap.get(`headphone:${assignment.headphone_id}`)
        cost = (rate?.rate_amount || 0) * paxCount
      }

      headphoneCostMap.set(availId, (headphoneCostMap.get(availId) || 0) + cost)
    })

    // Calculate printing costs per slot (per-pax rate - using actual pax from bookings)
    printingAssignments?.forEach(assignment => {
      const availId = String(assignment.activity_availability_id)
      const avail = availabilityLookup.get(availId)
      if (!avail) return

      // Use actual pax from bookings, not vacancy_sold
      const paxCount = actualPaxPerAvailability.get(availId) || 0
      if (paxCount === 0) return // No cost if no actual pax

      let cost = costOverridesMap.get(`printing:${assignment.assignment_id}`)
      if (cost === undefined) {
        const rate = resourceRatesMap.get(`printing:${assignment.printing_id}`)
        cost = (rate?.rate_amount || 0) * paxCount
      }

      printingCostMap.set(availId, (printingCostMap.get(availId) || 0) + cost)
    })

    // Query per categorie storiche del prodotto selezionato
    let historicalCategories: string[] = []

    if (tourIds.length === 1) {
      const { data: historicalBookings } = await supabase
        .from('activity_bookings')
        .select(`
          pricing_category_bookings (
            pricing_category_id,
            booked_title
          )
        `)
        .eq('activity_id', tourIds[0])
        .not('pricing_category_bookings.booked_title', 'is', null)

      const historicalCategoriesSet = new Set<string>()
      historicalBookings?.forEach(booking => {
        if ('pricing_category_bookings' in booking && Array.isArray(booking.pricing_category_bookings)) {
          booking.pricing_category_bookings.forEach((pcb: { pricing_category_id?: string | number; booked_title?: string }) => {
            const pricingCategoryId = pcb.pricing_category_id?.toString()
            if (pcb.booked_title && !shouldExcludePricingCategory(tourIds[0], pcb.booked_title, pricingCategoryId)) {
              historicalCategoriesSet.add(pcb.booked_title)
            }
          })
        }
      })

      historicalCategories = Array.from(historicalCategoriesSet)
    }

    // Processa i dati
    const processedData = processDataForDisplay(
      (bookings as Booking[]) || [],
      (availabilities as Availability[]) || [],
      historicalCategories,
      guideCountMap,
      guideNamesMap,
      guideDataMap,
      escortDataMap,
      ticketCountMap,
      voucherMap,
      guideCostMap,
      escortCostMap,
      headphoneCostMap,
      printingCostMap,
      voucherCostMap
    )

    // Filtra per prenotazioni se toggle attivo
    const filteredData = showOnlyWithBookings
      ? processedData.filter(slot => slot.bookingCount > 0)
      : processedData

    // Always group by date
    const finalData = groupDataByDate(filteredData)

    // Fetch and merge planned availabilities
    try {
      const plannedRes = await fetch(
        `/api/planned-availabilities?activityId=${selectedFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}&status=pending`
      )
      if (plannedRes.ok) {
        const { data: plannedData } = await plannedRes.json()
        setPlannedAvailabilities(plannedData || [])

        // Add planned slots to the data
        if (plannedData && plannedData.length > 0) {
          const tourTitle = tours.find(t => t.activity_id === selectedFilter)?.title || 'Unknown'

          plannedData.forEach((planned: PlannedAvailability) => {
            const normalizedTime = planned.local_time.substring(0, 5)

            // Check if this slot already exists (shouldn't happen but safeguard)
            const existingDateGroup = finalData.find(row => row.date === planned.local_date)

            // Get guide data for this planned availability
            const plannedIdStr = String(planned.id)
            const plannedGuidesAssigned = plannedGuideCountMap.get(plannedIdStr) || 0
            const plannedGuideNames = plannedGuideNamesMap.get(plannedIdStr) || []
            const plannedGuideData = plannedGuideDataMap.get(plannedIdStr) || []

            // Get voucher data for this planned availability
            const plannedTicketCount = plannedTicketCountMap.get(plannedIdStr) || 0
            const plannedVouchers = plannedVoucherMap.get(plannedIdStr) || []
            const plannedVoucherCost = plannedVoucherCostMap.get(plannedIdStr) || 0

            const plannedSlot: SlotData = {
              id: `planned-${planned.id}`,
              tourId: planned.activity_id,
              tourTitle,
              date: planned.local_date,
              time: normalizedTime,
              totalAmount: 0,
              bookingCount: 0,
              participants: {},
              totalParticipants: 0,
              availabilityLeft: 0,
              status: 'PLANNED',
              bookings: [],
              guidesAssigned: plannedGuidesAssigned,
              guideNames: plannedGuideNames,
              guideData: plannedGuideData,
              escortData: [],
              ticketCount: plannedTicketCount,
              vouchers: plannedVouchers,
              lastReservation: null,
              firstReservation: null,
              guideCost: 0,
              escortCost: 0,
              headphoneCost: 0,
              printingCost: 0,
              voucherCost: plannedVoucherCost,
              totalCost: 0,
              netProfit: 0,
              isPlanned: true,
              plannedId: planned.id
            }

            if (existingDateGroup) {
              // Check if there's already a slot with this time
              const existingSlot = existingDateGroup.slots?.find(
                s => s.time === normalizedTime && !s.isPlanned
              )
              if (!existingSlot) {
                // Add to existing date group's slots
                existingDateGroup.slots = existingDateGroup.slots || []
                existingDateGroup.slots.push(plannedSlot)
                // Sort slots by time
                existingDateGroup.slots.sort((a, b) => a.time.localeCompare(b.time))
              }
            } else {
              // Create new date group for this planned slot
              const newDateGroup: SlotData = {
                id: planned.local_date,
                tourId: planned.activity_id,
                tourTitle,
                date: planned.local_date,
                time: '',
                totalAmount: 0,
                bookingCount: 0,
                participants: {},
                totalParticipants: 0,
                availabilityLeft: 0,
                status: '',
                bookings: [],
                lastReservation: null,
                firstReservation: null,
                guideCost: 0,
                escortCost: 0,
                headphoneCost: 0,
                printingCost: 0,
                voucherCost: 0,
                totalCost: 0,
                netProfit: 0,
                isDateGroup: true,
                slots: [plannedSlot]
              }
              finalData.push(newDateGroup)
              // Sort by date
              finalData.sort((a, b) => a.date.localeCompare(b.date))
            }
          })
        }
      }
    } catch (err) {
      console.error('Error fetching planned availabilities:', err)
    }

    setData(finalData)

    // Extract unique ticket categories from all vouchers
    const allCategoryNames = new Set<string>()
    finalData.forEach(row => {
      row.vouchers?.forEach(v => {
        if (v.category_name) allCategoryNames.add(v.category_name)
      })
      row.slots?.forEach(slot => {
        slot.vouchers?.forEach(v => {
          if (v.category_name) allCategoryNames.add(v.category_name)
        })
      })
    })

    // Fetch category details (short_code, display_order, guide_requires_ticket) from database
    if (allCategoryNames.size > 0) {
      const { data: categoryDetails } = await supabase
        .from('ticket_categories')
        .select('name, short_code, display_order, guide_requires_ticket')
        .in('name', Array.from(allCategoryNames))

      const categoryMap = new Map(
        categoryDetails?.map(c => [c.name, {
          short_code: c.short_code,
          display_order: c.display_order,
          guide_requires_ticket: c.guide_requires_ticket
        }]) || []
      )

      // Build array with details, sorted by display_order
      const categoriesWithDetails = Array.from(allCategoryNames).map(name => ({
        name,
        short_code: categoryMap.get(name)?.short_code || name.substring(0, 3).toUpperCase(),
        display_order: categoryMap.get(name)?.display_order ?? 999,
        guide_requires_ticket: categoryMap.get(name)?.guide_requires_ticket ?? false
      })).sort((a, b) => a.display_order - b.display_order)

      setTicketCategories(categoriesWithDetails)
    } else {
      setTicketCategories([])
    }

    // Auto-expand all date groups
    const allIds = new Set(finalData.filter(row => row.isDateGroup).map(row => row.id))
    setExpandedRows(allIds)
    setLoading(false)
  }, [selectedFilter, dateRange, tours, showOnlyWithBookings])

  // Carica i tour al mount
  useEffect(() => {
    loadTours()

    const savedFilter = localStorage.getItem('selectedFilter')
    if (savedFilter) {
      setSelectedFilter(savedFilter)
    }

    const savedDateRange = localStorage.getItem('dateRange')
    if (savedDateRange) {
      try {
        setDateRange(JSON.parse(savedDateRange))
      } catch (e) {
        console.error('Error parsing saved date range:', e)
      }
    }

    const savedShowOnlyWithBookings = localStorage.getItem('showOnlyWithBookings')
    if (savedShowOnlyWithBookings) {
      setShowOnlyWithBookings(savedShowOnlyWithBookings === 'true')
    }
  }, [])

  // Salva le preferenze quando cambiano
  useEffect(() => {
    localStorage.setItem('selectedFilter', selectedFilter)
  }, [selectedFilter])

  useEffect(() => {
    localStorage.setItem('dateRange', JSON.stringify(dateRange))
  }, [dateRange])

  useEffect(() => {
    localStorage.setItem('showOnlyWithBookings', showOnlyWithBookings.toString())
  }, [showOnlyWithBookings])

  // Carica i dati quando cambiano i filtri
  useEffect(() => {
    if (tours.length > 0) {
      loadData()
    }
  }, [selectedFilter, dateRange, tours, loadData])

  // Fetch ticket categories with partners for voucher requests
  useEffect(() => {
    const fetchTicketCategoriesWithPartners = async () => {
      try {
        const { data, error } = await supabase
          .from('ticket_categories')
          .select(`
            *,
            partners (
              partner_id,
              name,
              email,
              phone_number,
              active,
              available_times
            )
          `)
          .not('partner_id', 'is', null)

        if (error) throw error
        setTicketCategoriesWithPartners(data || [])
      } catch (err) {
        console.error('Error fetching ticket categories with partners:', err)
      }
    }
    fetchTicketCategoriesWithPartners()
  }, [])

  // Fetch activity-partner mappings for Richiedi button
  useEffect(() => {
    const fetchActivityPartnerMappings = async () => {
      try {
        const { data, error } = await supabase
          .from('activity_partner_mappings')
          .select(`
            *,
            partners (
              partner_id,
              name,
              email
            ),
            ticket_categories (
              id,
              name
            )
          `)

        if (error) throw error
        setActivityPartnerMappings(data || [])
      } catch (err) {
        console.error('Error fetching activity-partner mappings:', err)
      }
    }
    fetchActivityPartnerMappings()
  }, [])

  // Fetch voucher requests for the date range to track sent requests
  useEffect(() => {
    const fetchVoucherRequests = async () => {
      if (!dateRange.start || !dateRange.end) return

      try {
        const { data, error } = await supabase
          .from('voucher_requests')
          .select('id, activity_availability_id, total_pax, status')
          .gte('visit_date', dateRange.start)
          .lte('visit_date', dateRange.end)
          .in('status', ['sent', 'fulfilled'])

        if (error) throw error

        // Group by activity_availability_id and sum total_pax
        const requestsMap = new Map<number, { count: number; totalPax: number; status: string }>()
        data?.forEach(req => {
          if (req.activity_availability_id) {
            const existing = requestsMap.get(req.activity_availability_id)
            if (existing) {
              requestsMap.set(req.activity_availability_id, {
                count: existing.count + 1,
                totalPax: existing.totalPax + (req.total_pax || 0),
                status: req.status === 'fulfilled' ? 'fulfilled' : existing.status
              })
            } else {
              requestsMap.set(req.activity_availability_id, {
                count: 1,
                totalPax: req.total_pax || 0,
                status: req.status
              })
            }
          }
        })

        setVoucherRequests(requestsMap)
      } catch (err) {
        console.error('Error fetching voucher requests:', err)
      }
    }

    fetchVoucherRequests()
  }, [dateRange])

  // Handler to open voucher request dialog
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleOpenVoucherRequest = (slot: SlotData) => {
    // Find a matching ticket category with a partner linked
    // For now, we'll try to find one based on the activity title or just use the first available
    const matchingCategory = ticketCategoriesWithPartners.find(cat => {
      // Try to match based on product_names in the category
      if (cat.product_names && cat.product_names.length > 0) {
        return cat.product_names.some((name: string) =>
          slot.tourTitle.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(slot.tourTitle.toLowerCase())
        )
      }
      return false
    }) || ticketCategoriesWithPartners[0]

    if (!matchingCategory) {
      alert('Nessuna categoria con partner collegato trovata. Configura prima un partner nelle categorie biglietti.')
      return
    }

    setSelectedSlotForRequest(slot)
    setSelectedCategoryForRequest(matchingCategory as (TicketCategory & { partners?: Partner }))
    setVoucherRequestDialogOpen(true)
  }

  // Function to refresh voucher requests
  const refreshVoucherRequests = useCallback(async () => {
    if (!dateRange.start || !dateRange.end) return

    try {
      const { data, error } = await supabase
        .from('voucher_requests')
        .select('id, activity_availability_id, total_pax, status')
        .gte('visit_date', dateRange.start)
        .lte('visit_date', dateRange.end)
        .in('status', ['sent', 'fulfilled'])

      if (error) throw error

      const requestsMap = new Map<number, { count: number; totalPax: number; status: string }>()
      data?.forEach(req => {
        if (req.activity_availability_id) {
          const existing = requestsMap.get(req.activity_availability_id)
          if (existing) {
            requestsMap.set(req.activity_availability_id, {
              count: existing.count + 1,
              totalPax: existing.totalPax + (req.total_pax || 0),
              status: req.status === 'fulfilled' ? 'fulfilled' : existing.status
            })
          } else {
            requestsMap.set(req.activity_availability_id, {
              count: 1,
              totalPax: req.total_pax || 0,
              status: req.status
            })
          }
        }
      })

      setVoucherRequests(requestsMap)
    } catch (err) {
      console.error('Error fetching voucher requests:', err)
    }
  }, [dateRange])

  // Real-time subscription for instant updates
  const { status: realtimeStatus } = useRealtimeRefresh({
    tables: [
      'activity_availability',
      'activity_bookings',
      'guide_assignments',
      'vouchers',
      'voucher_requests',
    ],
    onRefresh: () => {
      loadData()
      refreshVoucherRequests()
    },
    enabled: !!selectedFilter && tours.length > 0,
    debounceMs: 1000,
  })

  // Fetch notes count for date range - organized by context type
  const fetchNotesCount = useCallback(async () => {
    if (!dateRange.start || !dateRange.end) return

    try {
      const res = await fetch(`/api/operation-notes?startDate=${dateRange.start}&endDate=${dateRange.end}`)
      if (res.ok) {
        const { data } = await res.json()

        // Count notes by different contexts
        const dateMap = new Map<string, number>()
        const guideMap = new Map<string, number>()
        const escortMap = new Map<string, number>()
        const slotMap = new Map<number, number>()
        const voucherMap = new Map<string, number>()
        const notesByDateMap = new Map<string, OperationNote[]>()
        const notesBySlotMap = new Map<number, OperationNote[]>()

        data?.forEach((note: OperationNote) => {
          // Count ALL notes for a date (regardless of what entity they're linked to)
          if (note.local_date) {
            dateMap.set(note.local_date, (dateMap.get(note.local_date) || 0) + 1)
            // Store actual notes by date
            const existingNotes = notesByDateMap.get(note.local_date) || []
            notesByDateMap.set(note.local_date, [...existingNotes, note])
          }
          // Guide-specific notes
          if (note.guide_id) {
            guideMap.set(note.guide_id, (guideMap.get(note.guide_id) || 0) + 1)
          }
          // Escort-specific notes
          if (note.escort_id) {
            escortMap.set(note.escort_id, (escortMap.get(note.escort_id) || 0) + 1)
          }
          // Slot-specific notes
          if (note.activity_availability_id) {
            slotMap.set(note.activity_availability_id, (slotMap.get(note.activity_availability_id) || 0) + 1)
            // Store actual notes by slot
            const existingSlotNotes = notesBySlotMap.get(note.activity_availability_id) || []
            notesBySlotMap.set(note.activity_availability_id, [...existingSlotNotes, note])
          }
          // Voucher-specific notes
          if (note.voucher_id) {
            voucherMap.set(note.voucher_id, (voucherMap.get(note.voucher_id) || 0) + 1)
          }
        })

        setNotesCountByDate(dateMap)
        setNotesCountByGuide(guideMap)
        setNotesCountByEscort(escortMap)
        setNotesCountBySlot(slotMap)
        setNotesCountByVoucher(voucherMap)
        setNotesByDate(notesByDateMap)
        setNotesBySlot(notesBySlotMap)
      }
    } catch (err) {
      console.error('Error fetching notes count:', err)
    }
  }, [dateRange.start, dateRange.end])

  // Fetch notes for specific context
  const fetchNotesForContext = useCallback(async (context: NoteContext) => {
    setLoadingNotes(true)
    try {
      const params = new URLSearchParams()

      // For slot context with slotData, fetch all notes for the date and filter locally
      if (context.type === 'slot' && context.slotData && context.local_date) {
        params.set('localDate', context.local_date)

        const res = await fetch(`/api/operation-notes?${params.toString()}`)
        if (res.ok) {
          const { data } = await res.json()

          // Filter to only notes related to this slot's entities
          const slot = context.slotData
          const slotGuideIds = new Set(slot.guideData?.map(g => g.id) || [])
          const slotEscortIds = new Set(slot.escortData?.map(e => e.id) || [])
          const slotVoucherIds = new Set(slot.vouchers?.map(v => v.id) || [])
          const slotAvailabilityId = slot.availabilityId ? Number(slot.availabilityId) : null

          const filteredNotes = (data || []).filter((note: OperationNote) => {
            // Note is linked to this slot directly
            if (slotAvailabilityId && note.activity_availability_id === slotAvailabilityId) return true
            // Note is linked to a guide in this slot
            if (note.guide_id && slotGuideIds.has(note.guide_id)) return true
            // Note is linked to an escort in this slot
            if (note.escort_id && slotEscortIds.has(note.escort_id)) return true
            // Note is linked to a voucher in this slot
            if (note.voucher_id && slotVoucherIds.has(note.voucher_id)) return true
            return false
          })

          setNotes(filteredNotes)
        }
      } else {
        // Standard fetch for other contexts
        if (context.local_date) params.set('localDate', context.local_date)
        if (context.activity_availability_id) params.set('activityAvailabilityId', String(context.activity_availability_id))
        if (context.guide_id) params.set('guideId', context.guide_id)
        if (context.escort_id) params.set('escortId', context.escort_id)
        if (context.voucher_id) params.set('voucherId', context.voucher_id)

        const res = await fetch(`/api/operation-notes?${params.toString()}`)
        if (res.ok) {
          const { data } = await res.json()
          setNotes(data || [])
        }
      }
    } catch (err) {
      console.error('Error fetching notes:', err)
    } finally {
      setLoadingNotes(false)
    }
  }, [])

  // Open notes drawer for a specific context
  const openNotesDrawer = (context: NoteContext) => {
    setNotesContext(context)
    setNotesDrawerOpen(true)
    fetchNotesForContext(context)
  }

  // Add a new note
  const handleAddNote = async (content: string, noteType: string, linkTo?: { type: string; id?: string | number }) => {
    if (!notesContext) return

    const body: Record<string, unknown> = {
      content,
      note_type: noteType,
    }

    // Always include the local_date from context
    if (notesContext.local_date) body.local_date = notesContext.local_date

    // Use linkTo to determine what entity to link to (overrides context)
    if (linkTo) {
      if (linkTo.type === 'slot' && linkTo.id) {
        body.activity_availability_id = Number(linkTo.id)
      } else if (linkTo.type === 'guide' && linkTo.id) {
        body.guide_id = linkTo.id
      } else if (linkTo.type === 'escort' && linkTo.id) {
        body.escort_id = linkTo.id
      } else if (linkTo.type === 'voucher' && linkTo.id) {
        body.voucher_id = linkTo.id
      }
      // 'date' type means no entity link, just date
    } else {
      // Fallback to context values if no linkTo provided
      if (notesContext.activity_availability_id) body.activity_availability_id = notesContext.activity_availability_id
      if (notesContext.guide_id) body.guide_id = notesContext.guide_id
      if (notesContext.escort_id) body.escort_id = notesContext.escort_id
      if (notesContext.voucher_id) body.voucher_id = notesContext.voucher_id
    }

    const res = await fetch('/api/operation-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      fetchNotesForContext(notesContext)
      fetchNotesCount()
    }
  }

  // Add a reply to a note
  const handleAddReply = async (noteId: string, content: string) => {
    const res = await fetch('/api/operation-notes/replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note_id: noteId, content }),
    })

    if (res.ok && notesContext) {
      fetchNotesForContext(notesContext)
    }
  }

  // Delete a note
  const handleDeleteNote = async (noteId: string) => {
    const res = await fetch(`/api/operation-notes?id=${noteId}`, {
      method: 'DELETE',
    })

    if (res.ok && notesContext) {
      fetchNotesForContext(notesContext)
      fetchNotesCount()
    }
  }

  // Delete a reply
  const handleDeleteReply = async (replyId: string) => {
    const res = await fetch(`/api/operation-notes/replies?id=${replyId}`, {
      method: 'DELETE',
    })

    if (res.ok && notesContext) {
      fetchNotesForContext(notesContext)
    }
  }

  // Create a planned availability
  const handleCreatePlannedAvailability = async () => {
    if (!selectedFilter || !addPlannedDate || !addPlannedTime) return

    setCreatingPlanned(true)
    try {
      const res = await fetch('/api/planned-availabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_id: selectedFilter,
          local_date: addPlannedDate,
          local_time: addPlannedTime + ':00', // Add seconds
        }),
      })

      if (res.ok) {
        setShowAddPlannedDialog(false)
        setAddPlannedDate('')
        setAddPlannedTime('')
        // Reload data to show the new planned slot
        loadData()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to create planned availability')
      }
    } catch (err) {
      console.error('Error creating planned availability:', err)
      alert('Failed to create planned availability')
    } finally {
      setCreatingPlanned(false)
    }
  }

  // Delete a planned availability
  const handleDeletePlannedAvailability = async (plannedId: string) => {
    if (!confirm('Are you sure you want to delete this planned slot?')) return

    try {
      const res = await fetch(`/api/planned-availabilities?id=${plannedId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        loadData()
      } else {
        alert('Failed to delete planned availability')
      }
    } catch (err) {
      console.error('Error deleting planned availability:', err)
    }
  }

  // Fetch notes count when date range changes
  useEffect(() => {
    fetchNotesCount()
  }, [fetchNotesCount])

  // Helper function to calculate total notes for a slot (including its entities)
  const getSlotNotesCount = useCallback((slot: SlotData): number => {
    let count = 0

    // Notes linked directly to this slot
    if (slot.availabilityId) {
      count += notesCountBySlot.get(Number(slot.availabilityId)) || 0
    }

    // Notes linked to guides in this slot
    slot.guideData?.forEach(guide => {
      count += notesCountByGuide.get(guide.id) || 0
    })

    // Notes linked to escorts in this slot
    slot.escortData?.forEach(escort => {
      count += notesCountByEscort.get(escort.id) || 0
    })

    // Notes linked to vouchers in this slot
    slot.vouchers?.forEach(voucher => {
      count += notesCountByVoucher.get(voucher.id) || 0
    })

    return count
  }, [notesCountBySlot, notesCountByGuide, notesCountByEscort, notesCountByVoucher])

  const loadTours = async () => {
    try {
      const { data: activities, error } = await supabase
        .from('activities')
        .select('activity_id, title')
        .order('title')

      if (activities && !error) {
        setTours(activities as Tour[])
      }
    } catch (error) {
      console.error('Error loading tours:', error)
    }
  }

  const loadAvailableGuides = async () => {
    try {
      const res = await fetch('/api/guides')
      if (res.ok) {
        const { data } = await res.json()
        // Filter only active guides and sort by first name
        const activeGuides = (data || [])
          .filter((g: { active: boolean }) => g.active !== false)
          .sort((a: AvailableGuide, b: AvailableGuide) =>
            a.first_name.localeCompare(b.first_name)
          )
        setAvailableGuides(activeGuides)
      }
    } catch (error) {
      console.error('Error loading guides:', error)
    }
  }

  // Fetch guides that are busy within 3-hour window of the selected slot
  const fetchBusyGuides = async (slot: SlotData) => {
    try {
      if (!slot.availabilityId || !slot.date || !slot.time) {
        setBusyGuides([])
        return
      }

      // Parse the selected slot time
      const slotTimeParts = slot.time.split(':')
      const slotHour = parseInt(slotTimeParts[0], 10)
      const slotMinute = parseInt(slotTimeParts[1], 10)
      const slotTotalMinutes = slotHour * 60 + slotMinute

      // Calculate 3-hour window (±3 hours = 180 minutes)
      const windowMinutes = 180

      // Get all availabilities for the same date (excluding current slot)
      const { data: dayAvails, error: availError } = await supabase
        .from('activity_availability')
        .select('id, activity_id, local_time')
        .eq('local_date', slot.date)
        .neq('id', Number(slot.availabilityId))

      if (availError) throw availError

      if (!dayAvails || dayAvails.length === 0) {
        setBusyGuides([])
        return
      }

      // Filter availabilities within 3-hour window
      const availsInWindow = dayAvails.filter(avail => {
        const timeParts = avail.local_time.split(':')
        const hour = parseInt(timeParts[0], 10)
        const minute = parseInt(timeParts[1], 10)
        const totalMinutes = hour * 60 + minute
        const diff = Math.abs(totalMinutes - slotTotalMinutes)
        return diff < windowMinutes
      })

      if (availsInWindow.length === 0) {
        setBusyGuides([])
        return
      }

      const availIds = availsInWindow.map(a => a.id)

      // Check if current slot is part of a service group
      const { data: currentGroupMember } = await supabase
        .from('guide_service_group_members')
        .select('group_id')
        .eq('activity_availability_id', Number(slot.availabilityId))
        .single()

      let serviceGroupAvailIds: number[] = []
      if (currentGroupMember) {
        // Get all availability IDs in the same service group
        const { data: groupMembers } = await supabase
          .from('guide_service_group_members')
          .select('activity_availability_id')
          .eq('group_id', currentGroupMember.group_id)

        if (groupMembers) {
          serviceGroupAvailIds = groupMembers.map(m => m.activity_availability_id)
        }
      }

      // Get guide assignments for availabilities in window (excluding service group members)
      const availsToCheck = availIds.filter(id => !serviceGroupAvailIds.includes(id))

      if (availsToCheck.length === 0) {
        setBusyGuides([])
        return
      }

      const { data: assignments, error: assignError } = await supabase
        .from('guide_assignments')
        .select('guide_id, activity_availability_id')
        .in('activity_availability_id', availsToCheck)

      if (assignError) throw assignError

      if (!assignments || assignments.length === 0) {
        setBusyGuides([])
        return
      }

      // Get activity titles for the conflicting services
      const activityIds = [...new Set(availsInWindow.map(a => a.activity_id))]
      const { data: activities } = await supabase
        .from('activities')
        .select('activity_id, title')
        .in('activity_id', activityIds)

      const activitiesMap = (activities || []).reduce((acc: Record<string, string>, a) => {
        acc[a.activity_id] = a.title
        return acc
      }, {})

      // Build busy guides info
      const busyInfo: BusyGuideInfo[] = assignments.map(assignment => {
        const conflictAvail = availsInWindow.find(a => a.id === assignment.activity_availability_id)
        return {
          guide_id: assignment.guide_id,
          conflicting_service: conflictAvail ? (activitiesMap[conflictAvail.activity_id] || 'Unknown') : 'Unknown',
          conflicting_time: conflictAvail ? conflictAvail.local_time.substring(0, 5) : ''
        }
      })

      setBusyGuides(busyInfo)
    } catch (err) {
      console.error('Error fetching busy guides:', err)
      setBusyGuides([])
    }
  }

  // Check if a guide is busy (has another assignment within 3-hour window)
  const isGuideBusy = (guideId: string): BusyGuideInfo | undefined => {
    return busyGuides.find(bg => bg.guide_id === guideId)
  }

  const openGuideDialog = async (slot: SlotData, guide: GuideInfo | null) => {
    setSelectedSlot(slot)
    setSelectedGuideToChange(guide)
    setNewGuideId('')
    setGuideSearchTerm('')
    setBusyGuides([])
    loadAvailableGuides()
    await fetchBusyGuides(slot)
    setGuideDialogOpen(true)
  }

  const handleGuideChange = async () => {
    if (!newGuideId) return

    // Check if it's a planned slot or a real availability
    const isPlanned = selectedSlot?.isPlanned && selectedSlot?.plannedId
    const hasRealAvailability = selectedSlot?.availabilityId

    if (!isPlanned && !hasRealAvailability) {
      console.error('No availability ID or planned ID')
      return
    }

    setChangingGuide(true)
    try {
      // If there's an existing guide, delete the old assignment first
      if (selectedGuideToChange) {
        const deleteParams = isPlanned
          ? `planned_availability_id=${selectedSlot.plannedId}&guide_ids=${selectedGuideToChange.id}`
          : `activity_availability_id=${selectedSlot.availabilityId}&guide_ids=${selectedGuideToChange.id}`

        const deleteRes = await fetch(
          `/api/assignments/availability?${deleteParams}`,
          { method: 'DELETE' }
        )

        if (!deleteRes.ok) {
          const errorText = await deleteRes.text()
          console.error('Failed to remove old guide:', errorText)
          return
        }
      }

      // Create new guide assignment
      const createBody = isPlanned
        ? { planned_availability_id: selectedSlot.plannedId, guide_ids: [newGuideId] }
        : { activity_availability_id: Number(selectedSlot.availabilityId), guide_ids: [newGuideId] }

      const createRes = await fetch('/api/assignments/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createBody)
      })

      if (!createRes.ok) {
        const errorText = await createRes.text()
        console.error('Failed to assign new guide:', errorText)
        return
      }

      // Refresh data
      setGuideDialogOpen(false)
      loadData()
    } catch (error) {
      console.error('Error changing guide:', error)
    } finally {
      setChangingGuide(false)
    }
  }

  const handleRemoveGuide = async () => {
    if (!selectedGuideToChange) return

    const isPlanned = selectedSlot?.isPlanned && selectedSlot?.plannedId
    const hasRealAvailability = selectedSlot?.availabilityId

    if (!isPlanned && !hasRealAvailability) {
      console.error('No availability ID or planned ID for removal')
      return
    }

    setChangingGuide(true)
    try {
      const deleteParams = isPlanned
        ? `planned_availability_id=${selectedSlot.plannedId}&guide_ids=${selectedGuideToChange.id}`
        : `activity_availability_id=${selectedSlot.availabilityId}&guide_ids=${selectedGuideToChange.id}`

      const deleteRes = await fetch(
        `/api/assignments/availability?${deleteParams}`,
        { method: 'DELETE' }
      )

      if (!deleteRes.ok) {
        const errorText = await deleteRes.text()
        console.error('Failed to remove guide:', errorText)
        return
      }

      // Refresh data
      setGuideDialogOpen(false)
      loadData()
    } catch (error) {
      console.error('Error removing guide:', error)
    } finally {
      setChangingGuide(false)
    }
  }

  // Load available escorts for the dialog
  const loadAvailableEscorts = async () => {
    const { data, error } = await supabase
      .from('escorts')
      .select('escort_id, first_name, last_name')
      .eq('active', true)
      .order('first_name')

    if (!error && data) {
      setAvailableEscorts(data)
    }
  }

  // Load all slots with bookings for a specific date (all activities)
  const loadAllSlotsForDate = async (date: string) => {
    // Fetch availability for this date with activity info
    const { data: availabilities, error: availError } = await supabase
      .from('activity_availability')
      .select(`
        id,
        activity_id,
        local_time,
        activities!inner (
          title
        )
      `)
      .eq('local_date', date)
      .order('local_time')

    if (availError || !availabilities) {
      console.error('Error loading availabilities:', availError)
      setAllSlotsForDate([])
      return
    }

    // Fetch bookings for this date to count per activity+time
    // Note: activity_bookings doesn't have activity_availability_id, so we match by activity_id + time
    const { data: bookings } = await supabase
      .from('activity_bookings')
      .select('activity_id, start_date_time')
      .gte('start_date_time', `${date}T00:00:00`)
      .lte('start_date_time', `${date}T23:59:59`)
      .not('status', 'eq', 'CANCELLED')

    // Build a map of activity_id:time -> booking count
    const bookingCountMap = new Map<string, number>()
    bookings?.forEach(b => {
      const time = b.start_date_time.split('T')[1]?.substring(0, 5) || '00:00'
      const key = `${b.activity_id}:${time}`
      bookingCountMap.set(key, (bookingCountMap.get(key) || 0) + 1)
    })

    // Fetch escort assignments for these availabilities
    const availIds = availabilities.map(a => a.id)
    const { data: escortAssignments } = await supabase
      .from('escort_assignments')
      .select('activity_availability_id, escort:escorts(first_name, last_name)')
      .in('activity_availability_id', availIds)

    // Map escort names per availability
    const escortNamesMap = new Map<number, string[]>()
    escortAssignments?.forEach(ea => {
      const escort = Array.isArray(ea.escort) ? ea.escort[0] : ea.escort
      if (escort) {
        const names = escortNamesMap.get(ea.activity_availability_id) || []
        names.push(`${escort.first_name} ${escort.last_name}`)
        escortNamesMap.set(ea.activity_availability_id, names)
      }
    })

    // Build slots array - only include slots with bookings
    const slots = availabilities
      .map(a => {
        const activity = Array.isArray(a.activities) ? a.activities[0] : a.activities
        const time = a.local_time?.substring(0, 5) || '00:00'
        const bookingKey = `${a.activity_id}:${time}`
        const bookingCount = bookingCountMap.get(bookingKey) || 0
        return {
          availabilityId: String(a.id),
          time,
          tourTitle: activity?.title || 'Unknown',
          bookingCount,
          escortNames: escortNamesMap.get(a.id) || []
        }
      })
      .filter(s => s.bookingCount > 0)
      .sort((a, b) => a.time.localeCompare(b.time))

    setAllSlotsForDate(slots)
  }

  const openEscortDialog = async (slot: SlotData, escort: EscortInfo | null) => {
    setSelectedSlotForEscort(slot)
    setSelectedEscortToChange(escort)
    setNewEscortId('')
    setEscortSearchTerm('')
    setEscortDialogDate(slot.date)
    setAllSlotsForDate([]) // Clear while loading
    // Pre-select the clicked slot if adding new escort (not changing existing)
    if (!escort && slot.availabilityId) {
      setSelectedSlotsForEscort(new Set([slot.availabilityId]))
    } else {
      setSelectedSlotsForEscort(new Set())
    }
    await Promise.all([
      loadAvailableEscorts(),
      !escort ? loadAllSlotsForDate(slot.date) : Promise.resolve() // Only load all slots when adding new
    ])
    setEscortDialogOpen(true)
  }

  const handleEscortChange = async () => {
    if (!newEscortId) return

    setChangingEscort(true)
    try {
      // If changing an existing escort (single slot mode)
      if (selectedEscortToChange && selectedSlotForEscort?.availabilityId) {
        const availabilityIdNum = Number(selectedSlotForEscort.availabilityId)
        if (isNaN(availabilityIdNum)) {
          console.error('Invalid availability ID')
          return
        }

        // Delete the old assignment
        const { error: deleteError } = await supabase
          .from('escort_assignments')
          .delete()
          .eq('activity_availability_id', availabilityIdNum)
          .eq('escort_id', selectedEscortToChange.id)

        if (deleteError) {
          console.error('Failed to remove old escort:', deleteError)
          return
        }

        // Create new escort assignment for the single slot
        const { error: insertError } = await supabase
          .from('escort_assignments')
          .insert({
            activity_availability_id: availabilityIdNum,
            escort_id: newEscortId
          })

        if (insertError) {
          console.error('Failed to assign new escort:', insertError)
          return
        }
      } else {
        // Adding new escort to multiple slots
        if (selectedSlotsForEscort.size === 0) {
          console.error('No slots selected')
          return
        }

        // Create assignments for all selected slots
        const assignments = Array.from(selectedSlotsForEscort).map(availId => ({
          activity_availability_id: Number(availId),
          escort_id: newEscortId
        }))

        const { error: insertError } = await supabase
          .from('escort_assignments')
          .insert(assignments)

        if (insertError) {
          console.error('Failed to assign escort to slots:', insertError)
          return
        }
      }

      // Refresh data
      setEscortDialogOpen(false)
      loadData()
    } catch (error) {
      console.error('Error changing escort:', error)
    } finally {
      setChangingEscort(false)
    }
  }

  const handleRemoveEscort = async () => {
    if (!selectedSlotForEscort?.availabilityId || !selectedEscortToChange) return

    const availabilityIdNum = Number(selectedSlotForEscort.availabilityId)
    if (isNaN(availabilityIdNum)) {
      console.error('Invalid availability ID for removal')
      return
    }

    setChangingEscort(true)
    try {
      const { error } = await supabase
        .from('escort_assignments')
        .delete()
        .eq('activity_availability_id', availabilityIdNum)
        .eq('escort_id', selectedEscortToChange.id)

      if (error) {
        console.error('Failed to remove escort:', error)
        return
      }

      // Refresh data
      setEscortDialogOpen(false)
      loadData()
    } catch (error) {
      console.error('Error removing escort:', error)
    } finally {
      setChangingEscort(false)
    }
  }

  const openVoucherDialog = (slot: SlotData) => {
    setSelectedSlotForVouchers(slot)
    setVoucherDialogOpen(true)
  }

  const openVoucherDetail = async (voucherId: string) => {
    setLoadingVoucherDetail(true)
    try {
      const { data, error } = await supabase
        .from('vouchers')
        .select(`
          id,
          booking_number,
          total_tickets,
          product_name,
          pdf_path,
          entry_time,
          visit_date,
          ticket_categories (id, name),
          activity_availability (
            local_time,
            activities (title)
          ),
          tickets (
            id,
            ticket_code,
            holder_name,
            ticket_type,
            price
          )
        `)
        .eq('id', voucherId)
        .single()

      if (error) throw error

      if (data) {
        // Handle activity_availability which can be object, array, or null from Supabase
        const activityAvail = Array.isArray(data.activity_availability)
          ? data.activity_availability[0]
          : data.activity_availability

        // Calculate non-guide ticket count
        const tickets = data.tickets || []
        const nonGuideTicketCount = tickets.filter((t: Ticket) =>
          !t.ticket_type?.toLowerCase().includes('guide')
        ).length

        const voucherDetail: VoucherDetail = {
          id: data.id,
          booking_number: data.booking_number,
          total_tickets: data.total_tickets,
          non_guide_tickets: nonGuideTicketCount,
          product_name: data.product_name,
          category_name: Array.isArray(data.ticket_categories)
            ? (data.ticket_categories[0] as { id: string; name: string } | undefined)?.name || null
            : (data.ticket_categories as { id: string; name: string } | null)?.name || null,
          pdf_path: data.pdf_path,
          entry_time: data.entry_time,
          visit_date: data.visit_date,
          tickets,
          activity_availability: activityAvail ? {
            local_time: activityAvail.local_time,
            activities: Array.isArray(activityAvail.activities)
              ? activityAvail.activities[0]
              : activityAvail.activities
          } : null
        }
        setSelectedVoucherDetail(voucherDetail)
        setVoucherDetailOpen(true)
      }
    } catch (err) {
      console.error('Error fetching voucher details:', err)
    } finally {
      setLoadingVoucherDetail(false)
    }
  }

  const getPdfUrl = (pdfPath: string) => {
    const { data } = supabase.storage
      .from('ticket-vouchers')
      .getPublicUrl(pdfPath)
    return data.publicUrl
  }

  const processDataForDisplay = (
    bookings: Booking[],
    availabilities: Availability[],
    historicalCategories: string[] = [],
    guideCountMap: Map<string, number> = new Map(),
    guideNamesMap: Map<string, string[]> = new Map(),
    guideDataMap: Map<string, GuideInfo[]> = new Map(),
    escortDataMap: Map<string, EscortInfo[]> = new Map(),
    ticketCountMap: Map<string, number> = new Map(),
    voucherMap: Map<string, VoucherInfo[]> = new Map(),
    guideCostMap: Map<string, number> = new Map(),
    escortCostMap: Map<string, number> = new Map(),
    headphoneCostMap: Map<string, number> = new Map(),
    printingCostMap: Map<string, number> = new Map(),
    voucherCostMap: Map<string, number> = new Map()
  ): SlotData[] => {
    // Funzione helper per normalizzare l'orario in formato HH:MM
    const normalizeTime = (timeStr: string) => {
      if (!timeStr) return '00:00'
      return timeStr.substring(0, 5)
    }

    // Deduplica le prenotazioni (come in PivotTable)
    const bookingsByActivityId = new Map<string, Booking>()

    bookings.forEach(booking => {
      const activityBookingId = booking.activity_booking_id
      const existingBooking = bookingsByActivityId.get(activityBookingId)

      if (!existingBooking || new Date(booking.created_at) > new Date(existingBooking.created_at)) {
        bookingsByActivityId.set(activityBookingId, booking)
      }
    })

    const filteredBookings = Array.from(bookingsByActivityId.values())

    // Crea mappa delle disponibilità
    const allSlots = new Map<string, SlotData>()

    // Aggiungi tutti gli slot dalle disponibilità (come in PivotTable)
    availabilities?.forEach(avail => {
      const normalizedTime = normalizeTime(avail.local_time)
      const key = `${avail.activity_id}-${avail.local_date}-${normalizedTime}`

      const availIdStr = String(avail.id)
      const guideCost = guideCostMap.get(availIdStr) || 0
      const escortCost = escortCostMap.get(availIdStr) || 0
      const headphoneCost = headphoneCostMap.get(availIdStr) || 0
      const printingCost = printingCostMap.get(availIdStr) || 0
      const voucherCost = voucherCostMap.get(availIdStr) || 0
      const totalCost = guideCost + escortCost + headphoneCost + printingCost + voucherCost

      allSlots.set(key, {
        id: key,
        tourId: avail.activity_id,
        tourTitle: avail.activities.title,
        date: avail.local_date,
        time: normalizedTime,
        totalAmount: 0,
        bookingCount: 0,
        participants: {},
        totalParticipants: 0,
        availabilityLeft: avail.vacancy_available || 0,
        status: avail.status,
        bookings: [],
        availabilityId: availIdStr,
        guidesAssigned: guideCountMap.get(availIdStr) || 0,
        guideNames: guideNamesMap.get(availIdStr) || [],
        guideData: guideDataMap.get(availIdStr) || [],
        escortData: escortDataMap.get(availIdStr) || [],
        ticketCount: ticketCountMap.get(availIdStr) || 0,
        vouchers: voucherMap.get(availIdStr) || [],
        lastReservation: null,
        firstReservation: null,
        guideCost,
        escortCost,
        headphoneCost,
        printingCost,
        voucherCost,
        totalCost,
        netProfit: 0 // Will be calculated after totalAmount is set
      })
    })

    // Aggiungi i dati delle prenotazioni
    filteredBookings.forEach(booking => {
      const date = booking.start_date_time.split('T')[0]
      const timeFromBooking = booking.start_date_time.split('T')[1]
      const normalizedTime = normalizeTime(timeFromBooking)
      const key = `${booking.activity_id}-${date}-${normalizedTime}`

      if (!allSlots.has(key)) {
        // Se non c'è disponibilità, crea lo slot (no costs without availability)
        allSlots.set(key, {
          id: key,
          tourId: booking.activity_id,
          tourTitle: booking.activities?.title || booking.product_title || 'N/A',
          date: date,
          time: normalizedTime,
          totalAmount: 0,
          bookingCount: 0,
          participants: {},
          totalParticipants: 0,
          availabilityLeft: 0,
          status: 'SOLD_OUT',
          bookings: [],
          guidesAssigned: 0,
          ticketCount: 0,
          vouchers: [],
          lastReservation: null,
          firstReservation: null,
          guideCost: 0,
          escortCost: 0,
          headphoneCost: 0,
          printingCost: 0,
          voucherCost: 0,
          totalCost: 0,
          netProfit: 0
        })
      }

      const slot = allSlots.get(key)!
      slot.bookings.push(booking)
      slot.bookingCount++
      slot.totalAmount += booking.net_price || booking.total_price || 0

      // Conta i partecipanti per categoria E calcola il totale
      let bookingParticipants = 0
      booking.pricing_category_bookings?.forEach((pcb: Participant) => {
        const category = pcb.booked_title || 'Unknown'
        const quantity = pcb.quantity || 1
        const pricingCategoryId = pcb.pricing_category_id?.toString()

        // Skip excluded pricing categories for specific activities
        if (shouldExcludePricingCategory(booking.activity_id, category, pricingCategoryId)) {
          return
        }

        if (!slot.participants[category]) {
          slot.participants[category] = 0
        }
        slot.participants[category] += quantity
        bookingParticipants += quantity
      })

      // Aggiungi al totale partecipanti dello slot
      slot.totalParticipants += bookingParticipants

      // Traccia prima e ultima prenotazione
      const bookingDate = new Date(booking.bookings?.creation_date || booking.created_at)
      if (!slot.firstReservation || bookingDate < new Date(slot.firstReservation.date)) {
        slot.firstReservation = {
          date: bookingDate.toISOString(),
          bookingId: booking.bookings?.booking_id || booking.activity_booking_id || ''
        }
      }
      if (!slot.lastReservation || bookingDate > new Date(slot.lastReservation.date)) {
        slot.lastReservation = {
          date: bookingDate.toISOString(),
          bookingId: booking.bookings?.booking_id || booking.activity_booking_id || ''
        }
      }
    })

    // Estrai TUTTE le categorie partecipanti uniche dinamicamente
    const allCategories = new Set<string>()

    // Prima aggiungi le categorie storiche passate come parametro (already filtered)
    historicalCategories.forEach(cat => allCategories.add(cat))

    // Poi aggiungi tutte le categorie trovate nei dati correnti (already filtered during processing)
    Array.from(allSlots.values()).forEach(row => {
      Object.keys(row.participants).forEach(cat => allCategories.add(cat))
    })

    // Se non ci sono categorie e abbiamo un prodotto specifico, usa le standard
    if (allCategories.size === 0 && historicalCategories.length === 0) {
      ['Adult', 'Child', 'Infant'].forEach(cat => allCategories.add(cat))
    }

    // Assicurati che ogni slot abbia tutte le categorie (anche con valore 0)
    Array.from(allSlots.values()).forEach(slot => {
      allCategories.forEach(cat => {
        if (!slot.participants[cat]) {
          slot.participants[cat] = 0
        }
      })
    })

    // ORDINAMENTO MIGLIORATO PER ETÀ (come in PivotTable)
    const sortedCategories = Array.from(allCategories).sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()

      // Prima gli adulti
      if (aLower.includes('adult')) return -1
      if (bLower.includes('adult')) return 1

      // Estrai i numeri dalle categorie per ordinare per età
      const extractAge = (category: string) => {
        const match = category.match(/\d+/)
        return match ? parseInt(match[0]) : 0
      }

      const ageA = extractAge(a)
      const ageB = extractAge(b)

      // Ordina dal più vecchio al più giovane
      if (ageA !== ageB) {
        return ageB - ageA
      }

      // Se non ci sono età, ordina alfabeticamente
      return a.localeCompare(b)
    })

    setParticipantCategories(sortedCategories)

    // Calculate netProfit for each slot (totalAmount - totalCost)
    Array.from(allSlots.values()).forEach(slot => {
      slot.netProfit = slot.totalAmount - slot.totalCost
    })

    return Array.from(allSlots.values()).sort((a, b) => {
      if (a.date !== b.date) {
        return new Date(a.date).getTime() - new Date(b.date).getTime()
      }
      if (a.time !== b.time) {
        return a.time.localeCompare(b.time)
      }
      return a.tourTitle.localeCompare(b.tourTitle)
    })
  }

  const groupDataByDate = (rawData: SlotData[]): SlotData[] => {
    const grouped: Record<string, SlotData> = {}

    rawData.forEach(row => {
      const key = row.date
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          date: row.date,
          isDateGroup: true,
          slots: [],
          totalAmount: 0,
          bookingCount: 0,
          participants: {},
          totalParticipants: 0,
          availabilityLeft: 0,
          ticketCount: 0,
          vouchers: [],
          tourId: '',
          tourTitle: '',
          time: '',
          status: '',
          bookings: [],
          lastReservation: null,
          firstReservation: null,
          guideCost: 0,
          escortCost: 0,
          headphoneCost: 0,
          printingCost: 0,
          voucherCost: 0,
          totalCost: 0,
          netProfit: 0
        }
      }

      grouped[key].slots!.push(row)
      grouped[key].totalAmount += row.totalAmount
      grouped[key].bookingCount += row.bookingCount
      grouped[key].totalParticipants += row.totalParticipants || 0
      grouped[key].availabilityLeft += row.availabilityLeft
      grouped[key].ticketCount = (grouped[key].ticketCount || 0) + (row.ticketCount || 0)
      // Set tourTitle, tourId, and availabilityId from the first slot (all slots are same tour)
      if (!grouped[key].tourTitle && row.tourTitle) {
        grouped[key].tourTitle = row.tourTitle
        grouped[key].tourId = row.tourId
        grouped[key].availabilityId = row.availabilityId || row.id
      }
      // Aggregate bookings from all slots
      if (row.bookings && row.bookings.length > 0) {
        grouped[key].bookings = [...grouped[key].bookings, ...row.bookings]
      }
      // Aggregate vouchers for the date group
      if (row.vouchers && row.vouchers.length > 0) {
        grouped[key].vouchers = [...(grouped[key].vouchers || []), ...row.vouchers]
      }

      // Aggregate guide count (count unique guides across slots)
      if (row.guideData && row.guideData.length > 0) {
        const existingGuideIds = new Set(grouped[key].guideData?.map(g => g.id) || [])
        row.guideData.forEach(guide => {
          if (!existingGuideIds.has(guide.id)) {
            grouped[key].guideData = [...(grouped[key].guideData || []), guide]
          }
        })
        grouped[key].guidesAssigned = grouped[key].guideData?.length || 0
      }

      // Aggregate costs
      grouped[key].guideCost += row.guideCost
      grouped[key].escortCost += row.escortCost
      grouped[key].headphoneCost += row.headphoneCost
      grouped[key].printingCost += row.printingCost
      grouped[key].voucherCost += row.voucherCost
      grouped[key].totalCost += row.totalCost
      grouped[key].netProfit += row.netProfit

      // Aggrega partecipanti
      Object.keys(row.participants).forEach(cat => {
        if (!grouped[key].participants[cat]) {
          grouped[key].participants[cat] = 0
        }
        grouped[key].participants[cat] += row.participants[cat]
      })
    })

    return Object.values(grouped).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )
  }

  const toggleRow = (rowId: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(rowId)) {
      newExpanded.delete(rowId)
    } else {
      newExpanded.add(rowId)
    }
    setExpandedRows(newExpanded)
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const days = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
    return `${days[date.getDay()]} ${date.toLocaleDateString('it-IT')}`
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'AVAILABLE': 'text-green-600',
      'LIMITED': 'text-orange-500',
      'SOLD_OUT': 'text-red-600',
      'SOLDOUT': 'text-red-600',
      'CLOSED': 'text-red-700'
    }
    return colors[status?.toUpperCase()] || 'text-gray-500'
  }

  const exportToExcel = () => {
    const exportData = data.map(row => {
      const date = new Date(row.date)
      const days = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']

      const rowData: Record<string, string | number> = {
        'Week Day': days[date.getDay()],
        'Date': date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        'Start Time': row.time || '',
        'Total Amount': row.totalAmount > 0 ? row.totalAmount : 0,
        'Booking Count': row.bookingCount,
        'Pax': row.totalParticipants || 0
      }

      // Aggiungi colonne partecipanti dinamiche
      participantCategories.forEach(category => {
        rowData[shortenCategoryName(category)] = row.participants?.[category] || 0
      })

      rowData['Dispo'] = row.availabilityLeft
      rowData['Status'] = row.status
      rowData['Guide'] = row.isDateGroup
        ? [...new Set(row.slots?.flatMap(s => s.guideNames || []) || [])].length
        : row.guideNames?.join(', ') || ''
      rowData['Biglietti'] = row.ticketCount || 0
      rowData['Last Reservation'] = row.lastReservation?.bookingId || ''
      rowData['First Reservation Date'] = row.firstReservation ?
        new Date(row.firstReservation.date).toLocaleDateString('it-IT') : ''

      return rowData
    })

    // Sanitize data to prevent formula injection attacks
    const sanitizedData = sanitizeDataForExcel(exportData)

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(sanitizedData)
    XLSX.utils.book_append_sheet(wb, ws, 'SuperSantos')

    // Create filename with tour name (sanitized)
    const tourName = selectedTourTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)
    const fileName = `supersantos_${tourName}_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  return (
    <div className="max-w-full">
      {/* Filter Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        {/* Header with title and status */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-gray-900">SuperSantos</h1>
          {/* Real-time status indicator */}
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              realtimeStatus.isConnected
                ? 'bg-green-500'
                : realtimeStatus.usingFallback
                  ? 'bg-blue-500'
                  : 'bg-amber-500 animate-pulse'
            }`}
            title={
              realtimeStatus.isConnected
                ? 'Live updates attivi'
                : realtimeStatus.usingFallback
                  ? 'Polling ogni 5 min'
                  : 'Connessione...'
            }
          />
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-12 gap-4 items-end">
          {/* Tour Selector - 5 cols */}
          <div className="col-span-12 lg:col-span-5 relative">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Tour
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={showTourDropdown ? tourSearch : selectedTourTitle}
                onChange={(e) => {
                  setTourSearch(e.target.value)
                  setShowTourDropdown(true)
                }}
                onFocus={() => {
                  setShowTourDropdown(true)
                  setTourSearch('')
                }}
                placeholder="Cerca un tour..."
                className="w-full pl-10 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange transition-colors"
              />
              {selectedFilter && !showTourDropdown && (
                <button
                  onClick={() => {
                    setSelectedFilter('')
                    setTourSearch('')
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {showTourDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredTours.length === 0 ? (
                  <div className="px-4 py-3 text-gray-500 text-sm">
                    Nessun tour trovato
                  </div>
                ) : (
                  filteredTours.map(tour => (
                    <button
                      key={tour.activity_id}
                      onClick={() => {
                        setSelectedFilter(tour.activity_id)
                        setTourSearch('')
                        setShowTourDropdown(false)
                      }}
                      className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm transition-colors ${
                        selectedFilter === tour.activity_id ? 'bg-brand-orange/10 text-brand-orange font-medium' : 'text-gray-700'
                      }`}
                    >
                      {tour.title}
                    </button>
                  ))
                )}
              </div>
            )}
            {showTourDropdown && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowTourDropdown(false)}
              />
            )}
          </div>

          {/* Date Range - 3 cols */}
          <div className="col-span-6 lg:col-span-2">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Da
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange transition-colors"
            />
          </div>

          <div className="col-span-6 lg:col-span-2">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              A
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange transition-colors"
            />
          </div>

          {/* Actions - 3 cols */}
          <div className="col-span-12 lg:col-span-3 flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Aggiorna
            </button>
            <button
              onClick={exportToExcel}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              title="Esporta in Excel"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bottom row with toggle */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <Switch
              id="bookings-toggle"
              checked={showOnlyWithBookings}
              onCheckedChange={setShowOnlyWithBookings}
              className="data-[state=checked]:bg-green-500"
            />
            <label htmlFor="bookings-toggle" className="text-sm text-gray-600 cursor-pointer">
              Mostra solo slot con prenotazioni
            </label>
          </div>
          {/* Results count */}
          {data.length > 0 && (
            <span className="text-sm text-gray-500">
              {data.length} {data.length === 1 ? 'slot' : 'slot'}
            </span>
          )}
        </div>
      </div>

      {/* Empty state or loading */}
      {!selectedFilter && (
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200 p-8 text-center">
          <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Seleziona un tour per visualizzare i dati</p>
        </div>
      )}

      {selectedFilter && loading && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
          <RefreshCw className="w-8 h-8 text-gray-400 mx-auto mb-3 animate-spin" />
          <p className="text-gray-500">Caricamento...</p>
        </div>
      )}

      {/* Tabella */}
      {selectedFilter && !loading && (
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3 text-center w-16">Note</th>
                <th className="px-4 py-3 text-right">Totale €</th>
                <th className="px-4 py-3 text-center">Prenotazioni</th>
                <th className="px-4 py-3 text-center">Pax</th>
                {participantCategories.map(category => (
                  <th key={category} className="px-4 py-3 text-center">
                    {shortenCategoryName(category)}
                  </th>
                ))}
                <th className="px-4 py-3 text-center">Dispo</th>
                <th className="px-4 py-3 text-center">Stato</th>
                <th className="px-4 py-3 text-center">Guide</th>
                <th className="px-4 py-3 text-center">Escort</th>
                {ticketCategories.length > 0 ? (
                  ticketCategories.map((cat, catIdx) => (
                    <React.Fragment key={cat.name}>
                      {/* B2B columns */}
                      <th className={`px-4 py-3 text-center bg-purple-50 ${catIdx === 0 ? 'border-l-2 border-gray-300' : 'border-l border-purple-200'}`}>
                        <span className="text-purple-700">{cat.short_code} B2B</span>
                      </th>
                      <th className="px-4 py-3 text-center bg-purple-50">
                        <span className="text-purple-600 text-xs">Orario</span>
                      </th>
                      <th className="px-4 py-3 text-center bg-purple-50">
                        <span className="text-purple-600 text-xs">Diff</span>
                      </th>
                      {/* B2C columns */}
                      <th className="px-4 py-3 text-center bg-green-50 border-l border-green-200">
                        <span className="text-green-700">{cat.short_code} B2C</span>
                      </th>
                      <th className="px-4 py-3 text-center bg-green-50">
                        <span className="text-green-600 text-xs">Orario</span>
                      </th>
                      <th className="px-4 py-3 text-center bg-green-50">
                        <span className="text-green-600 text-xs">Diff</span>
                      </th>
                    </React.Fragment>
                  ))
                ) : (
                  <>
                    <th className="px-4 py-3 text-center border-l-2 border-gray-300 bg-blue-50">Biglietti</th>
                    <th className="px-4 py-3 text-center bg-blue-50">Orario</th>
                    <th className="px-4 py-3 text-center bg-blue-50">Diff</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <React.Fragment key={row.id}>
                  <tr className={`border-t hover:bg-gray-50 ${
                    row.isDateGroup
                      ? 'bg-white font-semibold'
                      : row.status === 'CLOSED' && !row.bookingCount
                        ? 'bg-red-50 text-gray-400'
                        : ''
                  }`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.isDateGroup && (
                          <button
                            onClick={() => toggleRow(row.id)}
                            className="p-1 hover:bg-gray-200 rounded"
                          >
                            {expandedRows.has(row.id) ?
                              <ChevronDown className="w-4 h-4" /> :
                              <ChevronRight className="w-4 h-4" />
                            }
                          </button>
                        )}
                        <span className={row.isDateGroup ? 'font-bold' : ''}>
                          {formatDate(row.date)}
                        </span>
                        {row.isDateGroup && (
                          <>
                            <span className="text-xs text-gray-500">({row.slots?.length || 0} slot)</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setAddPlannedDate(row.date)
                                setAddPlannedTime('')
                                setShowAddPlannedDialog(true)
                              }}
                              className="ml-2 w-5 h-5 flex items-center justify-center bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-bold transition-colors"
                              title="Add planned slot"
                            >
                              +
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    {/* Notes cell */}
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const dateNotes = notesByDate.get(row.date) || []
                        if (dateNotes.length > 0) {
                          // Count by type
                          const counts = { urgent: 0, warning: 0, info: 0, general: 0 }
                          dateNotes.forEach(n => { counts[n.note_type] = (counts[n.note_type] || 0) + 1 })

                          // Determine most urgent type for background color
                          const mostUrgent = counts.urgent > 0 ? 'urgent' : counts.warning > 0 ? 'warning' : counts.info > 0 ? 'info' : 'general'
                          const bgColor = mostUrgent === 'urgent' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                                         mostUrgent === 'warning' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' :
                                         mostUrgent === 'info' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                                         'bg-gray-100 text-gray-700 hover:bg-gray-200'

                          // Sort notes for hover display
                          const sortedNotes = [...dateNotes].sort((a, b) => {
                            const priority = { urgent: 0, warning: 1, info: 2, general: 3 }
                            return (priority[a.note_type] || 3) - (priority[b.note_type] || 3)
                          })

                          // Build display string showing counts per type
                          const parts = []
                          if (counts.urgent > 0) parts.push(<span key="u" className="text-red-600">{counts.urgent}U</span>)
                          if (counts.warning > 0) parts.push(<span key="w" className="text-amber-600">{counts.warning}W</span>)
                          if (counts.info > 0) parts.push(<span key="i" className="text-blue-600">{counts.info}I</span>)
                          if (counts.general > 0) parts.push(<span key="g" className="text-gray-600">{counts.general}G</span>)

                          return (
                            <HoverCard>
                              <HoverCardTrigger asChild>
                                <button
                                  onClick={() => openNotesDrawer({
                                    type: 'date',
                                    label: formatDate(row.date),
                                    local_date: row.date
                                  })}
                                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${bgColor}`}
                                >
                                  {parts.map((part, idx) => (
                                    <span key={idx}>{part}</span>
                                  ))}
                                </button>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-72" side="left">
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {sortedNotes.map((note, idx) => (
                                    <div key={note.id} className={`text-sm ${idx > 0 ? 'border-t pt-2' : ''}`}>
                                      <div className={`text-xs font-medium mb-1 ${
                                        note.note_type === 'urgent' ? 'text-red-600' :
                                        note.note_type === 'warning' ? 'text-amber-600' :
                                        note.note_type === 'info' ? 'text-blue-600' : 'text-gray-600'
                                      }`}>
                                        {note.note_type.toUpperCase()}
                                      </div>
                                      <div className="text-gray-700">{note.content}</div>
                                      <div className="text-[10px] text-gray-400 mt-1">
                                        {note.created_by_email?.split('@')[0]} - {new Date(note.created_at).toLocaleDateString('it-IT')}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                          )
                        }
                        return (
                          <button
                            onClick={() => openNotesDrawer({
                              type: 'date',
                              label: formatDate(row.date),
                              local_date: row.date
                            })}
                            className="text-gray-300 hover:text-amber-500 transition-colors"
                            title="Add note"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <span className={`cursor-help ${row.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            €{row.netProfit?.toFixed(2) || '0.00'}
                          </span>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-64" side="left">
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Net Price:</span>
                              <span className="font-medium">€{row.totalAmount?.toFixed(2) || '0.00'}</span>
                            </div>
                            <div className="border-t pt-2 space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">- Guide:</span>
                                <span className="text-red-500">€{row.guideCost?.toFixed(2) || '0.00'}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">- Escort:</span>
                                <span className="text-red-500">€{row.escortCost?.toFixed(2) || '0.00'}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">- Headphones:</span>
                                <span className="text-red-500">€{row.headphoneCost?.toFixed(2) || '0.00'}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">- Printing:</span>
                                <span className="text-red-500">€{row.printingCost?.toFixed(2) || '0.00'}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">- Vouchers:</span>
                                <span className="text-red-500">€{row.voucherCost?.toFixed(2) || '0.00'}</span>
                              </div>
                            </div>
                            <div className="border-t pt-2 flex justify-between text-sm font-medium">
                              <span>Net Profit:</span>
                              <span className={row.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                                €{row.netProfit?.toFixed(2) || '0.00'}
                              </span>
                            </div>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                        {row.bookingCount || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold">
                        {row.totalParticipants || 0}
                      </span>
                    </td>
                    {participantCategories.map(category => (
                      <td key={category} className="px-4 py-3 text-center">
                        {row.participants?.[category] || 0}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <span className={`font-medium ${row.availabilityLeft < 5 ? 'text-red-600' : ''}`}>
                        {row.availabilityLeft || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!row.isDateGroup && row.status && (
                        (row.status === 'CLOSED' || row.status === 'SOLD_OUT' || row.status === 'SOLDOUT') && row.lastReservation ? (
                          <HoverCard>
                            <HoverCardTrigger asChild>
                              <span className={`text-xs font-semibold cursor-help ${getStatusColor(row.status)}`}>
                                {row.status}
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-48" side="left">
                              <div className="text-sm">
                                <div className="font-medium text-gray-700">Ultima prenotazione</div>
                                <div className="text-gray-600 mt-1">
                                  {new Date(row.lastReservation.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div className="text-gray-500 text-xs mt-0.5">#{row.lastReservation.bookingId}</div>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        ) : (
                          <span className={`text-xs font-semibold ${getStatusColor(row.status)}`}>
                            {row.status}
                          </span>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-medium">
                        {row.isDateGroup
                          ? [...new Set(row.slots?.flatMap(s => s.guideNames || []) || [])].length || 0
                          : row.guideNames?.join(', ') || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const uniqueEscorts = row.isDateGroup
                          ? [...new Map(row.slots?.flatMap(s => s.escortData || []).map(e => [e.id, e]) || []).values()]
                          : row.escortData || []
                        const escortCount = uniqueEscorts.length

                        if (escortCount === 0) {
                          return <span className="font-medium text-gray-400">0</span>
                        }

                        return (
                          <HoverCard>
                            <HoverCardTrigger asChild>
                              <span className="font-medium cursor-help text-purple-600 hover:text-purple-800">
                                {escortCount}
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-48" side="left">
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-gray-500 mb-2">Escort assegnati:</div>
                                {uniqueEscorts.map((escort, idx) => (
                                  <div key={idx} className="text-sm">
                                    {escort.name}
                                  </div>
                                ))}
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        )
                      })()}
                    </td>
                    {/* Dynamic columns for each ticket category - B2B and B2C */}
                    {ticketCategories.length > 0 ? (
                      ticketCategories.map((cat, catIdx) => {
                        const categoryGroups = groupVouchersByCategory(row.vouchers || [])
                        const group = categoryGroups.find(g => g.categoryName === cat.name)
                        const b2bCount = group?.b2bCount || 0
                        const b2cCount = group?.b2cCount || 0
                        const b2bEntryTime = group?.b2bEntryTime
                        const b2cEntryTime = group?.b2cEntryTime
                        // Separate diffs for B2B and B2C
                        const b2bDiff = b2bCount - (row.totalParticipants || 0)
                        const b2cDiff = b2cCount - (row.totalParticipants || 0)
                        const b2bDiffColorClass = b2bCount === 0
                          ? 'text-gray-400'
                          : b2bDiff === 0
                            ? 'bg-green-100 text-green-800'
                            : b2bDiff < 0
                              ? 'bg-red-100 text-red-800'
                              : 'bg-orange-100 text-orange-800'
                        const b2cDiffColorClass = b2cCount === 0
                          ? 'text-gray-400'
                          : b2cDiff === 0
                            ? 'bg-green-100 text-green-800'
                            : b2cDiff < 0
                              ? 'bg-red-100 text-red-800'
                              : 'bg-orange-100 text-orange-800'

                        return (
                          <React.Fragment key={`${row.id}-cat-${catIdx}`}>
                            {/* B2B Count */}
                            <td className={`px-4 py-3 text-center bg-purple-50/30 ${catIdx === 0 ? 'border-l-2 border-gray-200' : 'border-l border-purple-100'}`}>
                              {b2bCount > 0 ? (
                                <button
                                  onClick={() => openVoucherDialog(row)}
                                  className="px-2 py-0.5 rounded text-sm font-medium cursor-pointer transition-colors bg-purple-100 hover:bg-purple-200 text-purple-800"
                                >
                                  {b2bCount}
                                </button>
                              ) : (
                                <span className="text-gray-400">0</span>
                              )}
                            </td>
                            {/* B2B Entry Time */}
                            <td className="px-4 py-3 text-center bg-purple-50/30">
                              <span className="text-sm text-purple-600">{b2bEntryTime?.substring(0, 5) || '-'}</span>
                            </td>
                            {/* B2B Diff */}
                            <td className="px-4 py-3 text-center bg-purple-50/30">
                              {b2bCount > 0 ? (
                                <span className={`px-2 py-0.5 rounded text-sm font-medium ${b2bDiffColorClass}`}>
                                  {b2bDiff > 0 ? `+${b2bDiff}` : b2bDiff}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            {/* B2C Count */}
                            <td className="px-4 py-3 text-center bg-green-50/30 border-l border-green-100">
                              {b2cCount > 0 ? (
                                <button
                                  onClick={() => openVoucherDialog(row)}
                                  className="px-2 py-0.5 rounded text-sm font-medium cursor-pointer transition-colors bg-green-100 hover:bg-green-200 text-green-800"
                                >
                                  {b2cCount}
                                </button>
                              ) : (
                                <span className="text-gray-400">0</span>
                              )}
                            </td>
                            {/* B2C Entry Time */}
                            <td className="px-4 py-3 text-center bg-green-50/30">
                              <span className="text-sm text-green-600">{b2cEntryTime?.substring(0, 5) || '-'}</span>
                            </td>
                            {/* B2C Diff */}
                            <td className="px-4 py-3 text-center bg-green-50/30">
                              {b2cCount > 0 ? (
                                <span className={`px-2 py-0.5 rounded text-sm font-medium ${b2cDiffColorClass}`}>
                                  {b2cDiff > 0 ? `+${b2cDiff}` : b2cDiff}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </React.Fragment>
                        )
                      })
                    ) : (
                      <>
                        <td className="px-4 py-3 text-center border-l-2 border-gray-200">
                          {row.vouchers && row.vouchers.length > 0 ? (
                            <button
                              onClick={() => openVoucherDialog(row)}
                              className="px-2 py-0.5 rounded text-sm font-medium cursor-pointer transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700"
                            >
                              {row.ticketCount || 0}
                            </button>
                          ) : (
                            <span className="font-medium text-gray-400">{row.ticketCount || 0}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-gray-400">-</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-gray-400">-</span>
                        </td>
                      </>
                    )}
                  </tr>

                  {/* Righe espanse per le date */}
                  {row.isDateGroup && expandedRows.has(row.id) && row.slots?.map((slot, idx) => (
                    <React.Fragment key={`${row.id}-slot-${idx}`}>
                    <tr className={`border-t ${
                      slot.isPlanned
                        ? 'bg-blue-50 border-l-4 border-l-blue-400'
                        : slot.status === 'CLOSED' && !slot.bookingCount
                          ? 'bg-red-50 text-gray-400'
                          : 'bg-gray-50'
                    }`}>
                      <td className="px-4 py-2 pl-12">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{slot.time}</span>
                          {slot.isPlanned && (
                            <button
                              onClick={() => slot.plannedId && handleDeletePlannedAvailability(slot.plannedId)}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete planned slot"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      {/* Note cell for slot rows */}
                      <td className="px-4 py-2 text-center">
                        {(() => {
                          const slotId = slot.availabilityId ? Number(slot.availabilityId) : null
                          const slotNotes = slotId ? (notesBySlot.get(slotId) || []) : []

                          if (slotNotes.length > 0) {
                            // Determine most urgent type for background color
                            const hasUrgent = slotNotes.some(n => n.note_type === 'urgent')
                            const hasWarning = slotNotes.some(n => n.note_type === 'warning')
                            const hasInfo = slotNotes.some(n => n.note_type === 'info')
                            const mostUrgent = hasUrgent ? 'urgent' : hasWarning ? 'warning' : hasInfo ? 'info' : 'general'

                            const bgColor = mostUrgent === 'urgent' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                                           mostUrgent === 'warning' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' :
                                           mostUrgent === 'info' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                                           'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            const badgeColor = mostUrgent === 'urgent' ? 'bg-red-200 text-red-800' :
                                              mostUrgent === 'warning' ? 'bg-amber-200 text-amber-800' :
                                              mostUrgent === 'info' ? 'bg-blue-200 text-blue-800' :
                                              'bg-gray-200 text-gray-800'

                            // Sort notes for display
                            const sortedNotes = [...slotNotes].sort((a, b) => {
                              const priority = { urgent: 0, warning: 1, info: 2, general: 3 }
                              return (priority[a.note_type] || 3) - (priority[b.note_type] || 3)
                            })
                            const firstNote = sortedNotes[0]

                            return (
                              <HoverCard>
                                <HoverCardTrigger asChild>
                                  <button
                                    onClick={() => openNotesDrawer({
                                      type: 'slot',
                                      id: slot.availabilityId,
                                      label: `${row.id} ${slot.time}`,
                                      local_date: row.id,
                                      activity_availability_id: Number(slot.availabilityId),
                                      slotData: slot
                                    })}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer transition-colors max-w-[100px] text-left ${bgColor}`}
                                  >
                                    <span className="truncate">
                                      {firstNote.content.substring(0, 12)}{firstNote.content.length > 12 ? '...' : ''}
                                    </span>
                                    {sortedNotes.length > 1 && (
                                      <span className={`flex-shrink-0 px-1 rounded text-[10px] ${badgeColor}`}>
                                        +{sortedNotes.length - 1}
                                      </span>
                                    )}
                                  </button>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-72" side="left">
                                  <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {sortedNotes.map((note, idx) => (
                                      <div key={note.id} className={`text-sm ${idx > 0 ? 'border-t pt-2' : ''}`}>
                                        <div className={`text-xs font-medium mb-1 ${
                                          note.note_type === 'urgent' ? 'text-red-600' :
                                          note.note_type === 'warning' ? 'text-amber-600' :
                                          note.note_type === 'info' ? 'text-blue-600' : 'text-gray-600'
                                        }`}>
                                          {note.note_type.toUpperCase()}
                                        </div>
                                        <div className="text-gray-700">{note.content}</div>
                                        <div className="text-[10px] text-gray-400 mt-1">
                                          {note.created_by_email?.split('@')[0]} - {new Date(note.created_at).toLocaleDateString('it-IT')}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            )
                          }

                          return (
                            <button
                              onClick={() => slot.availabilityId && openNotesDrawer({
                                type: 'slot',
                                id: slot.availabilityId,
                                label: `${row.id} ${slot.time}`,
                                local_date: row.id,
                                activity_availability_id: Number(slot.availabilityId),
                                slotData: slot
                              })}
                              className="text-gray-300 hover:text-amber-500 transition-colors"
                              title="Add note"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-2 text-right text-sm">
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <span className={`cursor-help ${slot.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              €{slot.netProfit?.toFixed(2) || '0.00'}
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-64" side="left">
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Net Price:</span>
                                <span className="font-medium">€{slot.totalAmount?.toFixed(2) || '0.00'}</span>
                              </div>
                              <div className="border-t pt-2 space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-500">- Guide:</span>
                                  <span className="text-red-500">€{slot.guideCost?.toFixed(2) || '0.00'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-500">- Escort:</span>
                                  <span className="text-red-500">€{slot.escortCost?.toFixed(2) || '0.00'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-500">- Headphones:</span>
                                  <span className="text-red-500">€{slot.headphoneCost?.toFixed(2) || '0.00'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-500">- Printing:</span>
                                  <span className="text-red-500">€{slot.printingCost?.toFixed(2) || '0.00'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-500">- Vouchers:</span>
                                  <span className="text-red-500">€{slot.voucherCost?.toFixed(2) || '0.00'}</span>
                                </div>
                              </div>
                              <div className="border-t pt-2 flex justify-between text-sm font-medium">
                                <span>Net Profit:</span>
                                <span className={slot.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  €{slot.netProfit?.toFixed(2) || '0.00'}
                                </span>
                              </div>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      </td>
                      <td className="px-4 py-2 text-center text-sm">{slot.bookingCount || 0}</td>
                      <td className="px-4 py-2 text-center text-sm">{slot.totalParticipants || 0}</td>
                      {participantCategories.map(category => (
                        <td key={category} className="px-4 py-2 text-center text-sm">
                          {slot.participants?.[category] || 0}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-center text-sm">{slot.availabilityLeft || 0}</td>
                      <td className="px-4 py-2 text-center">
                        {slot.status && (
                          (slot.status === 'CLOSED' || slot.status === 'SOLD_OUT' || slot.status === 'SOLDOUT') && slot.lastReservation ? (
                            <HoverCard>
                              <HoverCardTrigger asChild>
                                <span className={`text-xs font-semibold cursor-help ${getStatusColor(slot.status)}`}>
                                  {slot.status}
                                </span>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-48" side="left">
                                <div className="text-sm">
                                  <div className="font-medium text-gray-700">Ultima prenotazione</div>
                                  <div className="text-gray-600 mt-1">
                                    {new Date(slot.lastReservation.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                  <div className="text-gray-500 text-xs mt-0.5">#{slot.lastReservation.bookingId}</div>
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                          ) : (
                            <span className={`text-xs font-semibold ${getStatusColor(slot.status)}`}>
                              {slot.status}
                            </span>
                          )
                        )}
                      </td>
                      <td className="px-4 py-2 text-center text-sm">
                        <div className="flex flex-wrap gap-1 justify-center items-center">
                          {slot.guideData && slot.guideData.length > 0 && slot.guideData.map((guide, gIdx) => (
                            <button
                              key={gIdx}
                              onClick={() => openGuideDialog(slot, guide)}
                              className="px-2 py-0.5 bg-green-100 hover:bg-green-200 text-green-800 rounded text-xs cursor-pointer transition-colors"
                              title={guide.name}
                            >
                              {guide.name.split(' ')[0]}
                            </button>
                          ))}
                          <button
                            onClick={() => openGuideDialog(slot, null)}
                            className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs cursor-pointer transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center text-sm">
                        {slot.escortData && slot.escortData.length > 0 ? (
                          <HoverCard>
                            <HoverCardTrigger asChild>
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs cursor-help">
                                {slot.escortData.length}
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-56" side="left">
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-gray-500">Clicca per modificare:</div>
                                <div className="flex flex-col gap-1">
                                  {slot.escortData.map((escort, eIdx) => (
                                    <button
                                      key={eIdx}
                                      onClick={() => openEscortDialog(slot, escort)}
                                      className="inline-block w-fit px-2 py-1 text-xs bg-purple-100 hover:bg-purple-200 text-purple-800 rounded transition-colors text-left"
                                    >
                                      {escort.name}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  onClick={() => openEscortDialog(slot, null)}
                                  className="text-xs text-purple-600 hover:text-purple-800 transition-colors"
                                >
                                  + Aggiungi escort
                                </button>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        ) : (
                          <button
                            onClick={() => openEscortDialog(slot, null)}
                            className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs cursor-pointer transition-colors"
                          >
                            +
                          </button>
                        )}
                      </td>
                      {/* Dynamic columns for each ticket category - slot rows - B2B and B2C */}
                      {ticketCategories.length > 0 ? (
                        ticketCategories.map((cat, catIdx) => {
                          const categoryGroups = groupVouchersByCategory(slot.vouchers || [])
                          const group = categoryGroups.find(g => g.categoryName === cat.name)
                          const b2bCount = group?.b2bCount || 0
                          const b2cCount = group?.b2cCount || 0
                          const b2bEntryTime = group?.b2bEntryTime
                          const b2cEntryTime = group?.b2cEntryTime
                          // Separate diffs for B2B and B2C
                          const b2bDiff = b2bCount - (slot.totalParticipants || 0)
                          const b2cDiff = b2cCount - (slot.totalParticipants || 0)
                          const b2bDiffColorClass = b2bCount === 0
                            ? 'text-gray-400'
                            : b2bDiff === 0
                              ? 'bg-green-100 text-green-800'
                              : b2bDiff < 0
                                ? 'bg-red-100 text-red-800'
                                : 'bg-orange-100 text-orange-800'
                          const b2cDiffColorClass = b2cCount === 0
                            ? 'text-gray-400'
                            : b2cDiff === 0
                              ? 'bg-green-100 text-green-800'
                              : b2cDiff < 0
                                ? 'bg-red-100 text-red-800'
                                : 'bg-orange-100 text-orange-800'

                          return (
                            <React.Fragment key={`${row.id}-${idx}-cat-${catIdx}`}>
                              {/* B2B Count */}
                              <td className={`px-4 py-2 text-center text-sm bg-purple-50/30 ${catIdx === 0 ? 'border-l-2 border-gray-200' : 'border-l border-purple-100'}`}>
                                {b2bCount > 0 ? (
                                  <button
                                    onClick={() => openVoucherDialog(slot)}
                                    className="px-2 py-0.5 rounded text-xs cursor-pointer transition-colors bg-purple-100 hover:bg-purple-200 text-purple-800"
                                  >
                                    {b2bCount}
                                  </button>
                                ) : (
                                  <span className="text-gray-400">0</span>
                                )}
                              </td>
                              {/* B2B Entry Time */}
                              <td className="px-4 py-2 text-center text-sm bg-purple-50/30">
                                <span className="text-purple-600">{b2bEntryTime?.substring(0, 5) || '-'}</span>
                              </td>
                              {/* B2B Diff */}
                              <td className="px-4 py-2 text-center text-sm bg-purple-50/30">
                                {b2bCount > 0 ? (
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${b2bDiffColorClass}`}>
                                    {b2bDiff > 0 ? `+${b2bDiff}` : b2bDiff}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              {/* B2C Count */}
                              <td className="px-4 py-2 text-center text-sm bg-green-50/30 border-l border-green-100">
                                {b2cCount > 0 ? (
                                  <button
                                    onClick={() => openVoucherDialog(slot)}
                                    className="px-2 py-0.5 rounded text-xs cursor-pointer transition-colors bg-green-100 hover:bg-green-200 text-green-800"
                                  >
                                    {b2cCount}
                                  </button>
                                ) : (
                                  <span className="text-gray-400">0</span>
                                )}
                              </td>
                              {/* B2C Entry Time */}
                              <td className="px-4 py-2 text-center text-sm bg-green-50/30">
                                <span className="text-green-600">{b2cEntryTime?.substring(0, 5) || '-'}</span>
                              </td>
                              {/* B2C Diff */}
                              <td className="px-4 py-2 text-center text-sm bg-green-50/30">
                                {b2cCount > 0 ? (
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${b2cDiffColorClass}`}>
                                    {b2cDiff > 0 ? `+${b2cDiff}` : b2cDiff}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </React.Fragment>
                          )
                        })
                      ) : (
                        <>
                          <td className="px-4 py-2 text-center text-sm border-l-2 border-gray-200">
                            {slot.vouchers && slot.vouchers.length > 0 ? (
                              <button
                                onClick={() => openVoucherDialog(slot)}
                                className="px-2 py-0.5 rounded text-xs cursor-pointer transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700"
                              >
                                {slot.ticketCount || 0}
                              </button>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center text-sm">
                            <span className="text-gray-400">-</span>
                          </td>
                          <td className="px-4 py-2 text-center text-sm">
                            <span className="text-gray-400">-</span>
                          </td>
                        </>
                      )}
                    </tr>
                  </React.Fragment>
                  ))}

                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Guide Change Dialog */}
      <Dialog open={guideDialogOpen} onOpenChange={setGuideDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{selectedGuideToChange ? 'Cambia Guida' : 'Aggiungi Guida'}</DialogTitle>
            <DialogDescription>
              {selectedSlot && (
                <>
                  Slot: {formatDate(selectedSlot.date)} alle {selectedSlot.time}
                  {selectedGuideToChange && (
                    <>
                      <br />
                      Guida attuale: <strong>{selectedGuideToChange.name}</strong>
                    </>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cerca guida
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={guideSearchTerm}
                  onChange={(e) => setGuideSearchTerm(e.target.value)}
                  placeholder="Cerca per nome..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {selectedGuideToChange ? 'Seleziona nuova guida' : 'Seleziona guida'}
              </label>
              <div className="border border-gray-300 rounded-md max-h-64 overflow-y-auto">
                {filteredGuides
                  .filter(g => g.guide_id !== selectedGuideToChange?.id)
                  .length === 0 ? (
                    <div className="px-3 py-4 text-center text-gray-500 text-sm">
                      Nessuna guida trovata
                    </div>
                  ) : (
                    filteredGuides
                      .filter(g => g.guide_id !== selectedGuideToChange?.id)
                      .map(guide => {
                        const busyInfo = isGuideBusy(guide.guide_id)
                        const isBusy = !!busyInfo

                        return (
                          <button
                            key={guide.guide_id}
                            type="button"
                            onClick={() => !isBusy && setNewGuideId(guide.guide_id)}
                            disabled={isBusy}
                            className={`w-full px-3 py-2 text-left border-b border-gray-100 last:border-b-0 transition-colors ${
                              isBusy
                                ? 'bg-gray-50 cursor-not-allowed opacity-70'
                                : newGuideId === guide.guide_id
                                  ? 'bg-brand-orange-light'
                                  : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className={`font-medium text-sm ${isBusy ? 'text-gray-500' : ''}`}>
                                {guide.first_name} {guide.last_name}
                              </span>
                              <span className="text-base">
                                {guide.languages?.map(lang => getLanguageFlag(lang)).join(' ') || ''}
                              </span>
                            </div>
                            {isBusy && busyInfo && (
                              <div className="text-xs text-red-600 mt-1">
                                Occupato alle {busyInfo.conflicting_time} - {busyInfo.conflicting_service}
                              </div>
                            )}
                          </button>
                        )
                      })
                  )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <div>
              {selectedGuideToChange && (
                <button
                  onClick={handleRemoveGuide}
                  disabled={changingGuide}
                  className="px-4 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md disabled:text-gray-400"
                >
                  {changingGuide ? 'Rimuovendo...' : 'Rimuovi guida'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setGuideDialogOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Annulla
              </button>
              <button
                onClick={handleGuideChange}
                disabled={!newGuideId || changingGuide}
                className="px-4 py-2 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {changingGuide ? 'Salvando...' : 'Conferma'}
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escort Change Dialog */}
      <Dialog open={escortDialogOpen} onOpenChange={setEscortDialogOpen}>
        <DialogContent className={selectedEscortToChange ? "sm:max-w-[425px]" : "sm:max-w-[700px]"}>
          <DialogHeader>
            <DialogTitle>{selectedEscortToChange ? 'Cambia Escort' : 'Aggiungi Escort'}</DialogTitle>
            <DialogDescription>
              {selectedEscortToChange ? (
                // Changing existing escort - single slot mode
                selectedSlotForEscort && (
                  <>
                    Slot: {formatDate(selectedSlotForEscort.date)} alle {selectedSlotForEscort.time}
                    <br />
                    Escort attuale: <strong>{selectedEscortToChange.name}</strong>
                  </>
                )
              ) : (
                // Adding new escort - multi-slot mode
                <>
                  {formatDate(escortDialogDate)} - Seleziona escort e servizi
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedEscortToChange ? (
            // Single slot mode (changing existing escort)
            <div className="py-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cerca escort
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={escortSearchTerm}
                    onChange={(e) => setEscortSearchTerm(e.target.value)}
                    placeholder="Cerca per nome..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seleziona nuovo escort
                </label>
                <div className="border border-gray-300 rounded-md max-h-64 overflow-y-auto">
                  {filteredEscorts
                    .filter(e => e.escort_id !== selectedEscortToChange?.id)
                    .length === 0 ? (
                      <div className="px-3 py-4 text-center text-gray-500 text-sm">
                        Nessun escort trovato
                      </div>
                    ) : (
                      filteredEscorts
                        .filter(e => e.escort_id !== selectedEscortToChange?.id)
                        .map(escort => (
                          <button
                            key={escort.escort_id}
                            type="button"
                            onClick={() => setNewEscortId(escort.escort_id)}
                            className={`w-full px-3 py-2 text-left border-b border-gray-100 last:border-b-0 transition-colors ${
                              newEscortId === escort.escort_id
                                ? 'bg-purple-100'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <span className="font-medium text-sm">
                              {escort.first_name} {escort.last_name}
                            </span>
                          </button>
                        ))
                    )}
                </div>
              </div>
            </div>
          ) : (
            // Multi-slot mode (adding new escort)
            <div className="py-4 grid grid-cols-2 gap-4">
              {/* Left panel - Escort selection */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cerca escort
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={escortSearchTerm}
                      onChange={(e) => setEscortSearchTerm(e.target.value)}
                      placeholder="Cerca per nome..."
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Seleziona escort
                  </label>
                  <div className="border border-gray-300 rounded-md max-h-72 overflow-y-auto">
                    {filteredEscorts.length === 0 ? (
                      <div className="px-3 py-4 text-center text-gray-500 text-sm">
                        Nessun escort trovato
                      </div>
                    ) : (
                      filteredEscorts.map(escort => (
                        <button
                          key={escort.escort_id}
                          type="button"
                          onClick={() => setNewEscortId(escort.escort_id)}
                          className={`w-full px-3 py-2 text-left border-b border-gray-100 last:border-b-0 transition-colors ${
                            newEscortId === escort.escort_id
                              ? 'bg-purple-100'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <span className="font-medium text-sm">
                            {escort.first_name} {escort.last_name}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right panel - Slot selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Assegna a servizi
                  </label>
                  {newEscortId && (
                    <span className="text-xs text-purple-600">
                      {selectedSlotsForEscort.size} selezionati
                    </span>
                  )}
                </div>
                <div className="border border-gray-300 rounded-md max-h-80 overflow-y-auto">
                  {allSlotsForDate.length === 0 ? (
                    <div className="px-3 py-4 text-center text-gray-500 text-sm">
                      Caricamento...
                    </div>
                  ) : (
                    allSlotsForDate.map(slot => {
                      const isSelected = selectedSlotsForEscort.has(slot.availabilityId)
                      const alreadyHasEscort = slot.escortNames.length > 0
                      return (
                        <label
                          key={slot.availabilityId}
                          className={`flex items-start gap-3 px-3 py-2 border-b border-gray-100 last:border-b-0 cursor-pointer transition-colors ${
                            isSelected ? 'bg-purple-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const newSet = new Set(selectedSlotsForEscort)
                              if (e.target.checked) {
                                newSet.add(slot.availabilityId)
                              } else {
                                newSet.delete(slot.availabilityId)
                              }
                              setSelectedSlotsForEscort(newSet)
                            }}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-purple-600">{slot.time}</span>
                              <span className="text-sm text-gray-900 truncate">{slot.tourTitle}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>{slot.bookingCount} prenotazioni</span>
                              {alreadyHasEscort && (
                                <span className="text-purple-600">
                                  • {slot.escortNames.join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between sm:justify-between">
            <div>
              {selectedEscortToChange && (
                <button
                  onClick={handleRemoveEscort}
                  disabled={changingEscort}
                  className="px-4 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md disabled:text-gray-400"
                >
                  {changingEscort ? 'Rimuovendo...' : 'Rimuovi escort'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEscortDialogOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Annulla
              </button>
              <button
                onClick={handleEscortChange}
                disabled={!newEscortId || changingEscort || (!selectedEscortToChange && selectedSlotsForEscort.size === 0)}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {changingEscort ? 'Salvando...' : 'Conferma'}
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voucher Details Dialog */}
      <Dialog open={voucherDialogOpen} onOpenChange={setVoucherDialogOpen}>
        <DialogContent className="sm:max-w-[550px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Dettagli Biglietti</DialogTitle>
            <DialogDescription>
              {selectedSlotForVouchers && (
                <>
                  Slot: {formatDate(selectedSlotForVouchers.date)} alle {selectedSlotForVouchers.time}
                  <br />
                  Totale biglietti: <strong>{selectedSlotForVouchers.ticketCount}</strong> / {selectedSlotForVouchers.totalParticipants} partecipanti
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex-1 overflow-hidden">
            {selectedSlotForVouchers?.vouchers && selectedSlotForVouchers.vouchers.length > 0 ? (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                {selectedSlotForVouchers.vouchers.map((voucher) => (
                  <button
                    key={voucher.id}
                    onClick={() => openVoucherDetail(voucher.id)}
                    disabled={loadingVoucherDetail}
                    className="w-full flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200 hover:bg-orange-100 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{voucher.booking_number}</span>
                        {voucher.entry_time && (
                          <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {voucher.entry_time.substring(0, 5)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600">
                        {voucher.category_name || voucher.product_name || 'N/A'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="bg-orange-200 text-orange-800 px-2 py-1 rounded text-sm font-medium">
                        {voucher.total_tickets} ticket{voucher.total_tickets !== 1 ? 's' : ''}
                      </span>
                      <span className="text-gray-400 text-xs">
                        Clicca per dettagli
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                Nessun biglietto caricato per questo slot
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setVoucherDialogOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border rounded-md"
            >
              Chiudi
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voucher Detail Modal */}
      {voucherDetailOpen && selectedVoucherDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white">
              <div>
                <h2 className="text-xl font-semibold">{selectedVoucherDetail.booking_number}</h2>
                <p className="text-sm text-gray-500">{selectedVoucherDetail.product_name}</p>
              </div>
              <button
                onClick={() => setVoucherDetailOpen(false)}
                className="text-gray-500 hover:text-gray-700 p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Category</p>
                  <p className="font-semibold">{selectedVoucherDetail.category_name || '-'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Visit Date</p>
                  <p className="font-semibold">{selectedVoucherDetail.visit_date || '-'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Entry Time</p>
                  <p className="font-semibold">{selectedVoucherDetail.entry_time || '-'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Total Tickets</p>
                  <p className="font-semibold">{selectedVoucherDetail.total_tickets}</p>
                </div>
              </div>

              {/* Assignment */}
              {selectedVoucherDetail.activity_availability && (
                <div className="bg-green-50 p-4 rounded-lg mb-6">
                  <p className="text-xs text-green-600 mb-1">Assigned to</p>
                  <p className="font-semibold text-green-800">
                    {selectedVoucherDetail.activity_availability.activities?.title || 'N/A'}
                  </p>
                  <p className="text-sm text-green-700">
                    at {selectedVoucherDetail.activity_availability.local_time}
                  </p>
                </div>
              )}

              {/* Tickets Table */}
              <h3 className="font-semibold mb-3">Tickets ({selectedVoucherDetail.tickets?.length || 0})</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {selectedVoucherDetail.tickets?.map((ticket, idx) => (
                      <tr key={ticket.id}>
                        <td className="px-4 py-2 text-sm text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-2 text-sm font-medium">{ticket.holder_name}</td>
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

              {/* Price Summary */}
              <div className="mt-4 flex justify-end">
                <div className="bg-gray-50 px-4 py-2 rounded-lg">
                  <span className="text-sm text-gray-500">Total:</span>
                  <span className="ml-2 font-semibold">
                    {selectedVoucherDetail.tickets?.reduce((sum, t) => sum + t.price, 0).toFixed(2)}€
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t flex justify-between">
              <button
                onClick={() => setVoucherDetailOpen(false)}
                className="px-4 py-2 border rounded-md hover:bg-gray-50 flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Torna alla lista
              </button>
              <div className="flex gap-3">
                {selectedVoucherDetail.pdf_path && (
                  <button
                    onClick={() => window.open(getPdfUrl(selectedVoucherDetail.pdf_path!), '_blank')}
                    className="px-4 py-2 border rounded-md hover:bg-gray-50 flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open PDF
                  </button>
                )}
                <button
                  onClick={() => setVoucherDetailOpen(false)}
                  className="px-4 py-2 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Voucher Request Dialog */}
      {voucherRequestDialogOpen && selectedSlotForRequest && selectedCategoryForRequest && (
        <VoucherRequestDialog
          slot={{
            activityAvailabilityId: parseInt(selectedSlotForRequest.availabilityId || selectedSlotForRequest.id),
            activityId: selectedSlotForRequest.tourId,
            activityTitle: selectedSlotForRequest.tourTitle,
            visitDate: selectedSlotForRequest.date,
            startTime: selectedSlotForRequest.time,
            diff: (selectedSlotForRequest.ticketCount || 0) - selectedSlotForRequest.totalParticipants,
            bookings: selectedSlotForRequest.bookings.map(booking => ({
              firstName: booking.pricing_category_bookings?.[0]?.passenger_first_name ||
                         booking.bookings?.confirmation_code || 'N/A',
              lastName: booking.pricing_category_bookings?.[0]?.passenger_last_name || '',
              paxCount: booking.pricing_category_bookings?.reduce((sum, p) => sum + (p.quantity || 0), 0) || 1
            }))
          }}
          ticketCategory={selectedCategoryForRequest}
          onClose={() => {
            setVoucherRequestDialogOpen(false)
            setSelectedSlotForRequest(null)
            setSelectedCategoryForRequest(null)
          }}
          onSuccess={() => {
            loadData()
            refreshVoucherRequests()
          }}
        />
      )}

      {/* Add Planned Availability Dialog */}
      <Dialog open={showAddPlannedDialog} onOpenChange={setShowAddPlannedDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Planned Slot</DialogTitle>
            <DialogDescription>
              Create a planned availability slot for {addPlannedDate ? new Date(addPlannedDate + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}. This slot will have a blue background until the real availability is created in Bokun.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Time</label>
              <input
                type="time"
                value={addPlannedTime}
                onChange={(e) => setAddPlannedTime(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowAddPlannedDialog(false)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleCreatePlannedAvailability}
              disabled={!addPlannedTime || creatingPlanned}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creatingPlanned ? 'Creating...' : 'Create Planned Slot'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Drawer */}
      {notesContext && (() => {
        // Find the date row for the current context
        const contextDate = notesContext.local_date
        const dateRow = data.find(row => row.date === contextDate || row.id === contextDate)

        // Collect all unique guides, escorts, vouchers, and slots for this date
        const guidesMap = new Map<string, { id: string; name: string; time?: string }>()
        const escortsSet = new Map<string, string>()
        const vouchersMap = new Map<string, { id: string; name: string; totalTickets?: number; entryTime?: string }>()
        const slotsSet = new Map<number, string>()

        // If context has slotData (opened from a slot row), only show that slot's entities
        if (notesContext.slotData) {
          const slot = notesContext.slotData
          if (slot.availabilityId) {
            slotsSet.set(Number(slot.availabilityId), slot.time)
          }
          slot.guideData?.forEach(g => {
            guidesMap.set(g.id, { id: g.id, name: g.name, time: slot.time })
          })
          slot.escortData?.forEach(e => escortsSet.set(e.id, e.name))
          slot.vouchers?.forEach(v => {
            vouchersMap.set(v.id, {
              id: v.id,
              name: v.booking_number,
              totalTickets: v.total_tickets,
              entryTime: v.entry_time || undefined
            })
          })
        } else if (dateRow) {
          // From all slots of the date (to get the time for each guide)
          dateRow.slots?.forEach(slot => {
            if (slot.availabilityId) {
              slotsSet.set(Number(slot.availabilityId), slot.time)
            }
            slot.guideData?.forEach(g => {
              // Store guide with slot time
              if (!guidesMap.has(g.id)) {
                guidesMap.set(g.id, { id: g.id, name: g.name, time: slot.time })
              }
            })
            slot.escortData?.forEach(e => escortsSet.set(e.id, e.name))
            slot.vouchers?.forEach(v => {
              if (!vouchersMap.has(v.id)) {
                vouchersMap.set(v.id, {
                  id: v.id,
                  name: v.booking_number,
                  totalTickets: v.total_tickets,
                  entryTime: v.entry_time || undefined
                })
              }
            })
          })

          // Also check date row level data
          dateRow.guideData?.forEach(g => {
            if (!guidesMap.has(g.id)) {
              guidesMap.set(g.id, { id: g.id, name: g.name })
            }
          })
          dateRow.escortData?.forEach(e => escortsSet.set(e.id, e.name))
          dateRow.vouchers?.forEach(v => {
            if (!vouchersMap.has(v.id)) {
              vouchersMap.set(v.id, {
                id: v.id,
                name: v.booking_number,
                totalTickets: v.total_tickets,
                entryTime: v.entry_time || undefined
              })
            }
          })
        }

        const availableGuides = Array.from(guidesMap.values())
        const availableEscorts = Array.from(escortsSet.entries()).map(([id, name]) => ({ id, name }))
        const availableVouchers = Array.from(vouchersMap.values())
        const availableSlots = Array.from(slotsSet.entries()).map(([id, time]) => ({ id, time }))

        return (
          <NotesDrawer
            isOpen={notesDrawerOpen}
            onClose={() => {
              setNotesDrawerOpen(false)
              setNotesContext(null)
            }}
            context={notesContext}
            notes={notes}
            onAddNote={handleAddNote}
            onAddReply={handleAddReply}
            onDeleteNote={handleDeleteNote}
            onDeleteReply={handleDeleteReply}
            loading={loadingNotes}
            availableGuides={availableGuides}
            availableEscorts={availableEscorts}
            availableVouchers={availableVouchers}
            availableSlots={availableSlots}
          />
        )
      })()}
    </div>
  )
}
