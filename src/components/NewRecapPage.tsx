// src/components/NewRecapPage.tsx
'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, ChevronLeft, RefreshCw, Download, Search, ExternalLink, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
import * as XLSX from 'xlsx'
import { sanitizeDataForExcel } from '@/lib/security/sanitize'

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
  id: string
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
  ticketCount?: number
  vouchers?: VoucherInfo[]
  lastReservation: {
    date: string
    name: string
  } | null
  firstReservation: {
    date: string
    name: string
  } | null
  // Per raggruppamenti
  isDateGroup?: boolean
  slots?: SlotData[]
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
  product_name: string | null
  category_name: string | null
  pdf_path: string | null
  entry_time?: string | null
  visit_date?: string | null
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

  // Voucher dialog state
  const [voucherDialogOpen, setVoucherDialogOpen] = useState(false)
  const [selectedSlotForVouchers, setSelectedSlotForVouchers] = useState<SlotData | null>(null)

  // Voucher detail dialog state
  const [voucherDetailOpen, setVoucherDetailOpen] = useState(false)
  const [selectedVoucherDetail, setSelectedVoucherDetail] = useState<VoucherDetail | null>(null)
  const [loadingVoucherDetail, setLoadingVoucherDetail] = useState(false)

  // Filtered tours for search
  const filteredTours = tours.filter(tour =>
    tour.title.toLowerCase().includes(tourSearch.toLowerCase())
  )

  // Filtered guides for search in dialog
  const filteredGuides = availableGuides.filter(guide =>
    `${guide.first_name} ${guide.last_name}`.toLowerCase().includes(guideSearchTerm.toLowerCase())
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

    // Query per le assegnazioni delle guide con nomi
    const { data: guideAssignments } = await supabase
      .from('guide_assignments')
      .select(`
        assignment_id,
        activity_availability_id,
        guide_id,
        guide:guides (
          guide_id,
          first_name,
          last_name
        )
      `)

    // Crea mappe per contare e memorizzare i nomi delle guide per activity_availability_id
    const guideCountMap = new Map<string, number>()
    const guideNamesMap = new Map<string, string[]>()
    const guideDataMap = new Map<string, GuideInfo[]>()

    guideAssignments?.forEach((assignment) => {
      const availId = String(assignment.activity_availability_id)
      guideCountMap.set(availId, (guideCountMap.get(availId) || 0) + 1)

      // Supabase returns guide as an array
      const guide = Array.isArray(assignment.guide) ? assignment.guide[0] : assignment.guide
      if (guide) {
        const guideName = `${guide.first_name} ${guide.last_name}`
        const existingNames = guideNamesMap.get(availId) || []
        guideNamesMap.set(availId, [...existingNames, guideName])

        // Store guide data with ID
        const existingData = guideDataMap.get(availId) || []
        guideDataMap.set(availId, [...existingData, { id: assignment.guide_id, name: guideName }])
      }
    })

    // Query per i voucher (biglietti) - fetch tickets for the date range
    const { data: vouchers } = await supabase
      .from('vouchers')
      .select(`
        id,
        activity_availability_id,
        booking_number,
        total_tickets,
        product_name,
        pdf_path,
        entry_time,
        ticket_categories (id, name)
      `)
      .gte('visit_date', dateRange.start)
      .lte('visit_date', dateRange.end)
      .not('activity_availability_id', 'is', null)

    // Crea mappa per i voucher per activity_availability_id
    const ticketCountMap = new Map<string, number>()
    const voucherMap = new Map<string, VoucherInfo[]>()
    vouchers?.forEach((voucher) => {
      if (voucher.activity_availability_id) {
        const availId = String(voucher.activity_availability_id)
        ticketCountMap.set(availId, (ticketCountMap.get(availId) || 0) + (voucher.total_tickets || 0))

        // Build voucher info
        const voucherInfo: VoucherInfo = {
          id: voucher.id,
          booking_number: voucher.booking_number,
          total_tickets: voucher.total_tickets,
          product_name: voucher.product_name,
          category_name: Array.isArray(voucher.ticket_categories)
            ? (voucher.ticket_categories[0] as { id: string; name: string } | undefined)?.name || null
            : (voucher.ticket_categories as { id: string; name: string } | null)?.name || null,
          pdf_path: voucher.pdf_path,
          entry_time: voucher.entry_time
        }

        const existingVouchers = voucherMap.get(availId) || []
        voucherMap.set(availId, [...existingVouchers, voucherInfo])
      }
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
      ticketCountMap,
      voucherMap
    )

    // Filtra per prenotazioni se toggle attivo
    const filteredData = showOnlyWithBookings
      ? processedData.filter(slot => slot.bookingCount > 0)
      : processedData

    // Always group by date
    const finalData = groupDataByDate(filteredData)

    setData(finalData)
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

  // Real-time subscription for instant updates
  const { status: realtimeStatus } = useRealtimeRefresh({
    tables: [
      'activity_availability',
      'activity_bookings',
      'guide_assignments',
      'vouchers',
    ],
    onRefresh: loadData,
    enabled: !!selectedFilter && tours.length > 0,
    debounceMs: 1000,
  })

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
    if (!selectedSlot?.availabilityId || !newGuideId) return

    const availabilityIdNum = Number(selectedSlot.availabilityId)
    if (isNaN(availabilityIdNum)) {
      console.error('Invalid availability ID')
      return
    }

    setChangingGuide(true)
    try {
      // If there's an existing guide, delete the old assignment first
      if (selectedGuideToChange) {
        const deleteRes = await fetch(
          `/api/assignments/availability?activity_availability_id=${availabilityIdNum}&guide_ids=${selectedGuideToChange.id}`,
          { method: 'DELETE' }
        )

        if (!deleteRes.ok) {
          const errorText = await deleteRes.text()
          console.error('Failed to remove old guide:', errorText)
          return
        }
      }

      // Create new guide assignment
      const createRes = await fetch('/api/assignments/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_availability_id: availabilityIdNum,
          guide_ids: [newGuideId]
        })
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
    if (!selectedSlot?.availabilityId || !selectedGuideToChange) return

    const availabilityIdNum = Number(selectedSlot.availabilityId)
    if (isNaN(availabilityIdNum)) {
      console.error('Invalid availability ID for removal')
      return
    }

    setChangingGuide(true)
    try {
      const deleteRes = await fetch(
        `/api/assignments/availability?activity_availability_id=${availabilityIdNum}&guide_ids=${selectedGuideToChange.id}`,
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
        const voucherDetail: VoucherDetail = {
          id: data.id,
          booking_number: data.booking_number,
          total_tickets: data.total_tickets,
          product_name: data.product_name,
          category_name: Array.isArray(data.ticket_categories)
            ? (data.ticket_categories[0] as { id: string; name: string } | undefined)?.name || null
            : (data.ticket_categories as { id: string; name: string } | null)?.name || null,
          pdf_path: data.pdf_path,
          entry_time: data.entry_time,
          visit_date: data.visit_date,
          tickets: data.tickets || [],
          activity_availability: data.activity_availability
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

  const processDataForDisplay = (bookings: Booking[], availabilities: Availability[], historicalCategories: string[] = [], guideCountMap: Map<string, number> = new Map(), guideNamesMap: Map<string, string[]> = new Map(), guideDataMap: Map<string, GuideInfo[]> = new Map(), ticketCountMap: Map<string, number> = new Map(), voucherMap: Map<string, VoucherInfo[]> = new Map()): SlotData[] => {
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
        ticketCount: ticketCountMap.get(availIdStr) || 0,
        vouchers: voucherMap.get(availIdStr) || [],
        lastReservation: null,
        firstReservation: null
      })
    })

    // Aggiungi i dati delle prenotazioni
    filteredBookings.forEach(booking => {
      const date = booking.start_date_time.split('T')[0]
      const timeFromBooking = booking.start_date_time.split('T')[1]
      const normalizedTime = normalizeTime(timeFromBooking)
      const key = `${booking.activity_id}-${date}-${normalizedTime}`

      if (!allSlots.has(key)) {
        // Se non c'è disponibilità, crea lo slot
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
          firstReservation: null
        })
      }

      const slot = allSlots.get(key)!
      slot.bookings.push(booking)
      slot.bookingCount++
      slot.totalAmount += booking.bookings?.total_price || booking.total_price || 0

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
          name: (booking.pricing_category_bookings?.[0]?.passenger_first_name || '') + ' ' +
                (booking.pricing_category_bookings?.[0]?.passenger_last_name || '')
        }
      }
      if (!slot.lastReservation || bookingDate > new Date(slot.lastReservation.date)) {
        slot.lastReservation = {
          date: bookingDate.toISOString(),
          name: (booking.pricing_category_bookings?.[0]?.passenger_first_name || '') + ' ' +
                (booking.pricing_category_bookings?.[0]?.passenger_last_name || '')
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
          firstReservation: null
        }
      }

      grouped[key].slots!.push(row)
      grouped[key].totalAmount += row.totalAmount
      grouped[key].bookingCount += row.bookingCount
      grouped[key].totalParticipants += row.totalParticipants || 0
      grouped[key].availabilityLeft += row.availabilityLeft
      grouped[key].ticketCount = (grouped[key].ticketCount || 0) + (row.ticketCount || 0)
      // Aggregate vouchers for the date group
      if (row.vouchers && row.vouchers.length > 0) {
        grouped[key].vouchers = [...(grouped[key].vouchers || []), ...row.vouchers]
      }

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

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'AVAILABLE': 'bg-green-100 text-green-800',
      'LIMITED': 'bg-orange-100 text-orange-800',
      'SOLD_OUT': 'bg-red-100 text-red-800',
      'SOLDOUT': 'bg-red-100 text-red-800',
      'CLOSED': 'bg-red-500 text-white'
    }
    return colors[status?.toUpperCase()] || 'bg-gray-100 text-gray-800'
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
      rowData['Last Reservation'] = row.lastReservation?.name || ''
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
                <th className="px-4 py-3 text-center">Biglietti</th>
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
                          <span className="text-xs text-gray-500">({row.slots?.length || 0} slot)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      €{row.totalAmount?.toFixed(2) || '0.00'}
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
                        <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusBadge(row.status)}`}>
                          {row.status}
                        </span>
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
                      {row.vouchers && row.vouchers.length > 0 ? (
                        <button
                          onClick={() => openVoucherDialog(row)}
                          className={`px-2 py-0.5 rounded text-sm font-medium cursor-pointer transition-colors ${
                            row.ticketCount === row.totalParticipants
                              ? 'bg-green-100 hover:bg-green-200 text-green-800'
                              : row.ticketCount! < row.totalParticipants
                                ? 'bg-orange-100 hover:bg-orange-200 text-orange-800'
                                : 'bg-red-100 hover:bg-red-200 text-red-800'
                          }`}
                        >
                          {row.ticketCount || 0}
                        </button>
                      ) : (
                        <span className="font-medium text-gray-400">
                          {row.ticketCount || 0}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Righe espanse per le date */}
                  {row.isDateGroup && expandedRows.has(row.id) && row.slots?.map((slot, idx) => (
                    <tr key={`${row.id}-${idx}`} className={`border-t ${slot.status === 'CLOSED' && !slot.bookingCount ? 'bg-red-50 text-gray-400' : 'bg-gray-50'}`}>
                      <td className="px-4 py-2 pl-12">
                        <span className="text-sm">{slot.time}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-sm">€{slot.totalAmount?.toFixed(2) || '0.00'}</td>
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
                          <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusBadge(slot.status)}`}>
                            {slot.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center text-sm">
                        {slot.guideData && slot.guideData.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-center">
                            {slot.guideData.map((guide, gIdx) => (
                              <button
                                key={gIdx}
                                onClick={() => openGuideDialog(slot, guide)}
                                className="px-2 py-0.5 bg-green-100 hover:bg-green-200 text-green-800 rounded text-xs cursor-pointer transition-colors"
                              >
                                {guide.name}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button
                            onClick={() => openGuideDialog(slot, null)}
                            className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs cursor-pointer transition-colors"
                          >
                            + Aggiungi
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center text-sm">
                        {slot.vouchers && slot.vouchers.length > 0 ? (
                          <button
                            onClick={() => openVoucherDialog(slot)}
                            className={`px-2 py-0.5 rounded text-xs cursor-pointer transition-colors ${
                              slot.ticketCount === slot.totalParticipants
                                ? 'bg-green-100 hover:bg-green-200 text-green-800'
                                : slot.ticketCount! < slot.totalParticipants
                                  ? 'bg-orange-100 hover:bg-orange-200 text-orange-800'
                                  : 'bg-red-100 hover:bg-red-200 text-red-800'
                            }`}
                          >
                            {slot.ticketCount || 0}
                          </button>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                    </tr>
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
    </div>
  )
}
