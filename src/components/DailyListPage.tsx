/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Download, ChevronDown, Search, X, Edit, GripVertical, ChevronRight } from 'lucide-react'
import * as XLSX from 'xlsx-js-style'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

interface PaxData {
  activity_id: string
  activity_title: string
  booking_date: string
  start_time: string
  booking_id: number
  activity_booking_id: number
  total_participants: number
  participants_detail: string
  passengers: {
    booked_title: string
    first_name: string | null
    last_name: string | null
    date_of_birth: string | null
    quantity: number
  }[]
  customer?: {
    first_name: string | null
    last_name: string | null
    phone_number: string | null
  }
}

interface ParticipantEdit {
  pricing_category_booking_id: number
  booked_title: string
  passenger_first_name: string | null
  passenger_last_name: string | null
  passenger_date_of_birth: string | null
}

interface TimeSlotGroup {
  time: string
  bookings: PaxData[]
  totalParticipants: number
}

interface TourGroup {
  tourTitle: string
  timeSlots: TimeSlotGroup[]
  totalParticipants: number
  isExpanded: boolean
}

export default function DailyListPage() {
  const [data, setData] = useState<PaxData[]>([])
  const [groupedTours, setGroupedTours] = useState<TourGroup[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [selectedActivities, setSelectedActivities] = useState<string[]>([])
  const [tempSelectedActivities, setTempSelectedActivities] = useState<string[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })

  // Update modal states
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [selectedActivityBookingId, setSelectedActivityBookingId] = useState<number | null>(null)
  const [participantsToEdit, setParticipantsToEdit] = useState<ParticipantEdit[]>([])
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const [saving, setSaving] = useState(false)

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    loadActivitiesAndFetchData()
  }, [])

  const loadActivitiesAndFetchData = async () => {
    const { data: allActivities, error } = await supabase
      .from('activities')
      .select('activity_id, title')
      .order('title')

    if (!error && allActivities) {
      setActivities(allActivities)
      // Pre-select all activities
      const allActivityIds = allActivities.map(a => a.activity_id)
      setSelectedActivities(allActivityIds)
      setTempSelectedActivities(allActivityIds)

      // Fetch data with all activities pre-selected
      await fetchDataWithActivities(allActivityIds)
    }
  }

  const fetchData = async () => {
    await fetchDataWithActivities(selectedActivities, dateRange)
  }

  const fetchDataWithActivities = async (activityIds: string[], customDateRange?: { start: string; end: string }) => {

    // Use custom date range if provided, otherwise use state
    const queryDateRange = customDateRange || dateRange

    try {
      // Prima ottieni tutte le attività per creare una mappa
      const { data: activitiesData } = await supabase
        .from('activities')
        .select('activity_id, title')

      const activitiesMap = new Map()
      activitiesData?.forEach(activity => {
        activitiesMap.set(activity.activity_id, activity.title)
      })

      // Query principale per ottenere i dati con i nomi dei passeggeri
      let query = supabase
        .from('activity_bookings')
        .select(`
          activity_booking_id,
          booking_id,
          start_date_time,
          start_time,
          status,
          activity_id,
          bookings!inner (
            booking_id,
            status
          ),
          pricing_category_bookings (
            booked_title,
            passenger_first_name,
            passenger_last_name,
            passenger_date_of_birth,
            quantity
          )
        `)
        .not('status', 'in', '(CANCELLED)')  // Filter only activity_bookings.status
        .gte('start_date_time', `${queryDateRange.start}T00:00:00`)
        .lte('start_date_time', `${queryDateRange.end}T23:59:59`)
        .limit(10000) // Increase limit to handle more bookings

      // Applica filtro attività se selezionate
      if (activityIds.length > 0) {
        query = query.in('activity_id', activityIds)
      }

      const { data: bookings, error } = await query

      if (error) {
        console.error('Errore nel caricamento dati:', error)
        console.error('Error details:', error.message, error.details, error.hint)
        return
      }

      // Continue with the rest of the data processing...
      // (copying the rest from the original fetchData function)
      const customerDataMap = new Map()
      if (bookings && bookings.length > 0) {
        const bookingIds = bookings.map(b => Number(b.booking_id))

        const { data: bookingCustomers, error: bcError } = await supabase
          .from('booking_customers')
          .select('booking_id, customer_id')
          .in('booking_id', bookingIds)

        if (bcError) {
          console.error('Error fetching booking_customers:', bcError)
        } else if (bookingCustomers && bookingCustomers.length > 0) {
          const customerIds = bookingCustomers.map(bc => String(bc.customer_id))

          const { data: customers, error: custError } = await supabase
            .from('customers')
            .select('customer_id, first_name, last_name, phone_number, email')
            .in('customer_id', customerIds)

          if (custError) {
            console.error('Error fetching customers:', custError)
          } else if (customers) {
            const customerMap = new Map()
            customers.forEach(c => {
              customerMap.set(String(c.customer_id), c)
            })

            bookingCustomers.forEach(bc => {
              const customer = customerMap.get(String(bc.customer_id))
              if (customer) {
                customerDataMap.set(String(bc.booking_id), customer)
              }
            })
          }
        }
      }

      const transformedData: PaxData[] = []

      bookings?.forEach((booking: any) => {
        const bookingDate = new Date(booking.start_date_time)
        const dateStr = bookingDate.toISOString().split('T')[0]

        let totalParticipants = 0
        const passengers: any[] = []
        const participantTypes: { [key: string]: number } = {}

        booking.pricing_category_bookings?.forEach((pax: any) => {
          const quantity = pax.quantity || 1
          totalParticipants += quantity

          if (participantTypes[pax.booked_title]) {
            participantTypes[pax.booked_title] += quantity
          } else {
            participantTypes[pax.booked_title] = quantity
          }

          passengers.push({
            booked_title: pax.booked_title,
            first_name: pax.passenger_first_name,
            last_name: pax.passenger_last_name,
            date_of_birth: pax.passenger_date_of_birth,
            quantity: quantity
          })
        })

        let participantsDetail = `${totalParticipants}`
        if (Object.keys(participantTypes).length > 0) {
          const details = Object.entries(participantTypes)
            .map(([type, count]) => {
              return `(${count} ${type})`
            })
            .join(', ')
          participantsDetail += ` - ${details}`
        }

        const activityTitle = activitiesMap.get(booking.activity_id) || 'N/A'
        const customerData = customerDataMap.get(String(booking.booking_id))

        transformedData.push({
          activity_id: booking.activity_id,
          activity_title: activityTitle,
          booking_date: dateStr,
          start_time: booking.start_time || '',
          booking_id: booking.booking_id,
          activity_booking_id: booking.activity_booking_id,
          total_participants: totalParticipants,
          participants_detail: participantsDetail,
          passengers: passengers,
          customer: customerData ? {
            first_name: customerData.first_name,
            last_name: customerData.last_name,
            phone_number: customerData.phone_number
          } : undefined
        })
      })

      transformedData.sort((a, b) => {
        if (a.booking_date !== b.booking_date) {
          return a.booking_date.localeCompare(b.booking_date)
        }
        if (a.start_time !== b.start_time) {
          return a.start_time.localeCompare(b.start_time)
        }
        return a.activity_title.localeCompare(b.activity_title)
      })

      setData(transformedData)
      groupDataByTour(transformedData)
    } catch (error) {
      console.error('Errore:', error)
    }
  }

  // Auto-refresh data every hour
  useEffect(() => {
    const intervalId = setInterval(() => {
      console.log('Auto-refreshing Pax Names data...')
      fetchData()
    }, 60 * 60 * 1000) // 60 minutes

    return () => clearInterval(intervalId)
  }, [dateRange, selectedActivities])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isDropdownOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [isDropdownOpen])

  // Chiudi il dropdown quando si clicca fuori
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.dropdown-container')) {
        setIsDropdownOpen(false)
        setSearchTerm('') // Reset search when closing
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  // Handle date change - auto refresh
  const handleDateChange = (date: string) => {
    setSelectedDate(date)
    const newDateRange = {
      start: date,
      end: date
    }
    setDateRange(newDateRange)
    // Auto-refresh data with new date range
    fetchDataWithActivities(selectedActivities, newDateRange)
  }

  // Group data by tour and time slot
  const groupDataByTour = (bookings: PaxData[]) => {
    // Group by tour
    const tourMap = new Map<string, PaxData[]>()

    bookings.forEach(booking => {
      const tourTitle = booking.activity_title
      if (!tourMap.has(tourTitle)) {
        tourMap.set(tourTitle, [])
      }
      tourMap.get(tourTitle)!.push(booking)
    })

    // Create tour groups with time slots
    const tours: TourGroup[] = []

    tourMap.forEach((tourBookings, tourTitle) => {
      // Group by time slot within tour
      const timeSlotMap = new Map<string, PaxData[]>()

      tourBookings.forEach(booking => {
        const time = booking.start_time
        if (!timeSlotMap.has(time)) {
          timeSlotMap.set(time, [])
        }
        timeSlotMap.get(time)!.push(booking)
      })

      // Create time slot groups
      const timeSlots: TimeSlotGroup[] = []
      let tourTotalParticipants = 0

      timeSlotMap.forEach((slotBookings, time) => {
        const slotTotal = slotBookings.reduce((sum, b) => sum + b.total_participants, 0)
        tourTotalParticipants += slotTotal

        timeSlots.push({
          time,
          bookings: slotBookings,
          totalParticipants: slotTotal
        })
      })

      // Sort time slots by time
      timeSlots.sort((a, b) => a.time.localeCompare(b.time))

      tours.push({
        tourTitle,
        timeSlots,
        totalParticipants: tourTotalParticipants,
        isExpanded: false // Collapsed by default
      })
    })

    // Sort tours by total participants (descending)
    tours.sort((a, b) => b.totalParticipants - a.totalParticipants)

    setGroupedTours(tours)
  }

  // Toggle tour expansion
  const toggleTourExpansion = (tourTitle: string) => {
    setGroupedTours(prev =>
      prev.map(tour =>
        tour.tourTitle === tourTitle
          ? { ...tour, isExpanded: !tour.isExpanded }
          : tour
      )
    )
  }

  // Handle drag end for reordering bookings within a time slot
  const handleDragEnd = (event: DragEndEvent, tourTitle: string, timeSlot: string) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    setGroupedTours(prev => {
      const newTours = [...prev]
      const tourIndex = newTours.findIndex(t => t.tourTitle === tourTitle)
      if (tourIndex === -1) return prev

      const tour = newTours[tourIndex]
      const slotIndex = tour.timeSlots.findIndex(s => s.time === timeSlot)
      if (slotIndex === -1) return prev

      const bookings = [...tour.timeSlots[slotIndex].bookings]
      const oldIndex = bookings.findIndex(b => b.activity_booking_id === active.id)
      const newIndex = bookings.findIndex(b => b.activity_booking_id === over.id)

      if (oldIndex === -1 || newIndex === -1) return prev

      const reorderedBookings = arrayMove(bookings, oldIndex, newIndex)

      newTours[tourIndex] = {
        ...tour,
        timeSlots: tour.timeSlots.map((slot, idx) =>
          idx === slotIndex
            ? { ...slot, bookings: reorderedBookings }
            : slot
        )
      }

      return newTours
    })
  }

  const handleActivityChange = (activityId: string, checked: boolean) => {
    if (checked) {
      setTempSelectedActivities([...tempSelectedActivities, activityId])
    } else {
      setTempSelectedActivities(tempSelectedActivities.filter(id => id !== activityId))
    }
  }

  const applyTourFilter = () => {
    setSelectedActivities(tempSelectedActivities)
    setIsDropdownOpen(false)
    // Fetch data with new selections
    fetchDataWithActivities(tempSelectedActivities, dateRange)
  }

  // Get ALL participant categories for an activity (including historical data)
  // This matches the logic from PivotTable to ensure we get all 6 participant types
  const getAllParticipantCategoriesForActivity = async (activityId: string): Promise<string[]> => {
    const allCategories = new Set<string>()

    // Query ALL historical bookings for this activity to get all possible participant types
    const { data: historicalBookings } = await supabase
      .from('activity_bookings')
      .select(`
        pricing_category_bookings (
          booked_title
        )
      `)
      .eq('activity_id', activityId)
      .not('pricing_category_bookings.booked_title', 'is', null)

    // Extract all unique categories from historical bookings
    historicalBookings?.forEach(booking => {
      booking.pricing_category_bookings?.forEach((pcb: any) => {
        if (pcb.booked_title) {
          allCategories.add(pcb.booked_title)
        }
      })
    })

    // Sort categories (Adult first, then by age descending)
    const sortedCategories = Array.from(allCategories).sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()

      // First, adults
      if (aLower.includes('adult')) return -1
      if (bLower.includes('adult')) return 1

      // Then sort by age (extract numbers from category names)
      const extractAge = (category: string) => {
        const match = category.match(/\d+/)
        return match ? parseInt(match[0]) : 0
      }

      const ageA = extractAge(a)
      const ageB = extractAge(b)

      // Sort from oldest to youngest
      if (ageA !== ageB) {
        return ageB - ageA
      }

      // If no ages, sort alphabetically
      return a.localeCompare(b)
    })

    return sortedCategories
  }

  // Get participant counts by category for a booking
  const getParticipantCounts = (booking: PaxData): { [category: string]: number } => {
    const counts: { [category: string]: number } = {}

    booking.passengers.forEach(passenger => {
      const category = passenger.booked_title || 'Unknown'
      counts[category] = (counts[category] || 0) + passenger.quantity
    })

    return counts
  }

  const exportToExcel = async () => {
    let fileCount = 0

    // Export one file per time slot
    for (const tour of groupedTours) {
      // Get the activity_id from the first booking in the tour
      const firstBooking = tour.timeSlots[0]?.bookings[0]
      if (!firstBooking) continue

      // Get ALL historical participant categories for this activity
      // This ensures we show all 6 participant types even if current bookings don't have all of them
      const participantCategories = await getAllParticipantCategoriesForActivity(firstBooking.activity_id)

      for (const timeSlot of tour.timeSlots) {
        // Get the date from first booking
        const firstBooking = timeSlot.bookings[0]
        if (!firstBooking) continue

        const bookingDate = new Date(firstBooking.booking_date).toLocaleDateString('it-IT')

        // Build Excel data manually with proper structure
        const excelData: any[][] = []

        // Row 1: Tour Title (merged)
        const titleHeader = `${tour.tourTitle} - ${bookingDate} - ${timeSlot.time}`
        excelData.push([titleHeader])

        // Row 2: Column Headers
        const headers = ['Data', 'Ora', ...participantCategories, 'Nome e Cognome', 'Telefono']
        excelData.push(headers)

        // Initialize totals
        const totals: { [key: string]: number } = {}
        participantCategories.forEach(cat => totals[cat] = 0)

        // Rows 3-N: Data rows
        timeSlot.bookings.forEach(booking => {
          const fullName = `${booking.customer?.first_name || ''} ${booking.customer?.last_name || ''}`.trim()
          const participantCounts = getParticipantCounts(booking)

          const row: any[] = [
            new Date(booking.booking_date).toLocaleDateString('it-IT'),
            booking.start_time
          ]

          // Add participant counts and accumulate totals
          participantCategories.forEach(category => {
            const count = participantCounts[category] || 0
            row.push(count)
            totals[category] += count
          })

          row.push(fullName)
          row.push(booking.customer?.phone_number || '')

          excelData.push(row)
        })

        // First Total Row: Participants - Show breakdown by category
        const participantsRow = ['', 'Participants']
        participantCategories.forEach(category => {
          participantsRow.push(totals[category])
        })
        participantsRow.push('', '') // Empty cells for Name and Phone
        excelData.push(participantsRow)

        // Second Total Row: TOTAL PAX - Show single sum
        const totalParticipants = participantCategories.reduce((sum, cat) => sum + totals[cat], 0)
        const totalPaxRow = ['', 'TOTAL PAX', totalParticipants]
        // Fill remaining cells with empty values
        for (let i = 0; i < participantCategories.length - 1 + 2; i++) {
          totalPaxRow.push('')
        }
        excelData.push(totalPaxRow)

        // Create workbook from array
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(excelData)

        // Merge title cells
        if (!ws['!merges']) ws['!merges'] = []
        ws['!merges'].push({
          s: { r: 0, c: 0 },
          e: { r: 0, c: participantCategories.length + 3 }
        })

        // Style the title cell (Row 1) - bigger font and different background
        const totalCols = participantCategories.length + 4 // Data, Ora, categories, Nome, Telefono

        // Apply style to title row (merged cell)
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
          if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }
          ws[cellAddress].s = {
            font: { bold: true, sz: 18, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4472C4" } },
            alignment: { horizontal: "center", vertical: "center" }
          }
        }

        // Style header row (Row 2) - bold and light gray background
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: 1, c: col })
          const cell = ws[cellAddress]
          if (cell) {
            cell.s = {
              font: { bold: true, sz: 13 },
              fill: { fgColor: { rgb: "D9D9D9" } },
              alignment: { horizontal: "center", vertical: "center" }
            }
          }
        }

        // Style the Participants and TOTAL PAX rows
        const participantsRowIndex = 2 + timeSlot.bookings.length // After headers and booking rows
        const totalPaxRowIndex = participantsRowIndex + 1

        // Style Participants row - same as Header Row (light gray background, bold)
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: participantsRowIndex, c: col })
          const cell = ws[cellAddress]
          if (cell) {
            cell.s = {
              font: { bold: true, sz: 13 },
              fill: { fgColor: { rgb: "D9D9D9" } },
              alignment: { horizontal: "center", vertical: "center" }
            }
          }
        }

        // Style TOTAL PAX row - same as Title Row (blue background, white text)
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: totalPaxRowIndex, c: col })
          if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }
          ws[cellAddress].s = {
            font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4472C4" } },
            alignment: { horizontal: "center", vertical: "center" }
          }
        }

        // Style data rows (booking rows) with font size 13
        for (let row = 2; row < 2 + timeSlot.bookings.length; row++) {
          for (let col = 0; col < totalCols; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
            const cell = ws[cellAddress]
            if (cell) {
              cell.s = {
                font: { sz: 13 },
                alignment: { horizontal: "center", vertical: "center" }
              }
            }
          }
        }

        // Set row heights
        if (!ws['!rows']) ws['!rows'] = []
        ws['!rows'][0] = { hpt: 30 } // Title row height (bigger)
        ws['!rows'][1] = { hpt: 20 } // Header row height

        // Set column widths
        const colWidths = [
          { wch: 12 }, // Data
          { wch: 8 },  // Ora
          ...participantCategories.map(() => ({ wch: 15 })), // Participant columns
          { wch: 25 }, // Nome e Cognome
          { wch: 20 }, // Telefono
        ]
        ws['!cols'] = colWidths

        // Add sheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Lista')

        // Generate filename: "Tour Title + Date + Time Slot.xlsx"
        const cleanTourTitle = tour.tourTitle.replace(/[/\\?%*:|"<>]/g, '-')
        const cleanTime = timeSlot.time.replace(/:/g, '.')
        const fileName = `${cleanTourTitle} + ${bookingDate} + ${cleanTime}.xlsx`

        // Write file
        XLSX.writeFile(wb, fileName)
        fileCount++

        // Small delay between downloads
        if (fileCount < groupedTours.reduce((sum, t) => sum + t.timeSlots.length, 0)) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    }

    console.log(`Exported ${fileCount} file(s)`)
  }

  // Load participants for editing
  const loadParticipantsForEdit = async (activityBookingId: number) => {
    setLoadingParticipants(true)
    setSelectedActivityBookingId(activityBookingId)
    setUpdateModalOpen(true)

    try {
      const { data: participants, error } = await supabase
        .from('pricing_category_bookings')
        .select('pricing_category_booking_id, booked_title, passenger_first_name, passenger_last_name, passenger_date_of_birth')
        .eq('activity_booking_id', activityBookingId)
        .order('pricing_category_booking_id')

      if (error) throw error

      setParticipantsToEdit(participants || [])
    } catch (error) {
      console.error('Error loading participants:', error)
      alert('Error loading participants')
    } finally {
      setLoadingParticipants(false)
    }
  }

  // Update participant field
  const updateParticipantField = (index: number, field: keyof ParticipantEdit, value: string) => {
    const updated = [...participantsToEdit]
    updated[index] = { ...updated[index], [field]: value || null }
    setParticipantsToEdit(updated)
  }

  // Save all participants
  const saveParticipants = async () => {
    if (!selectedActivityBookingId) return

    setSaving(true)
    try {
      // Update each participant
      for (const participant of participantsToEdit) {
        const { error } = await supabase
          .from('pricing_category_bookings')
          .update({
            passenger_first_name: participant.passenger_first_name,
            passenger_last_name: participant.passenger_last_name,
            passenger_date_of_birth: participant.passenger_date_of_birth
          })
          .eq('pricing_category_booking_id', participant.pricing_category_booking_id)

        if (error) throw error

        // Log the manual update
        await supabase
          .from('manual_participant_updates')
          .insert({
            activity_booking_id: selectedActivityBookingId,
            pricing_category_booking_id: participant.pricing_category_booking_id,
            booked_title: participant.booked_title,
            passenger_first_name: participant.passenger_first_name,
            passenger_last_name: participant.passenger_last_name,
            passenger_date_of_birth: participant.passenger_date_of_birth,
            updated_by: 'dashboard_user',
            updated_at: new Date().toISOString()
          })
      }

      alert('Participants updated successfully!')
      setUpdateModalOpen(false)
      fetchData() // Refresh the main data
    } catch (error) {
      console.error('Error saving participants:', error)
      alert('Error saving participants')
    } finally {
      setSaving(false)
    }
  }

  // Sortable row component for drag & drop
  const SortableBookingRow = ({ booking }: { booking: PaxData }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: booking.activity_booking_id })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    return (
      <TableRow ref={setNodeRef} style={style} className={isDragging ? 'bg-gray-100' : ''}>
        <TableCell>
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-gray-400" />
          </div>
        </TableCell>
        <TableCell className="font-medium">{booking.activity_title}</TableCell>
        <TableCell>{new Date(booking.booking_date).toLocaleDateString('it-IT')}</TableCell>
        <TableCell>{booking.start_time}</TableCell>
        <TableCell>{booking.participants_detail}</TableCell>
        <TableCell>
          <Button
            onClick={() => loadParticipantsForEdit(booking.activity_booking_id)}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
          >
            <Edit className="h-4 w-4" />
          </Button>
        </TableCell>
        <TableCell>{booking.customer?.first_name || '-'}</TableCell>
        <TableCell>{booking.customer?.last_name || '-'}</TableCell>
        <TableCell>{booking.customer?.phone_number || '-'}</TableCell>
        <TableCell>{booking.booking_id}</TableCell>
        <TableCell>{booking.activity_booking_id}</TableCell>
      </TableRow>
    )
  }

  return (
    <div className="p-4">
      {/* Sezione Filtri */}
      <div className="mb-6 p-4 border rounded-lg bg-gray-50">
        <h3 className="text-lg font-semibold mb-4">Filtri</h3>

        {/* Row 1: Tour + Periodo (50%-50%) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Selezione Tour - Dropdown */}
          <div className="dropdown-container">
            <Label>Seleziona Tour</Label>
            <div className="mt-2 relative">
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(!isDropdownOpen)
                  if (!isDropdownOpen) {
                    setSearchTerm('') // Reset search when opening
                  }
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className="truncate flex-1 text-left">
                  {selectedActivities.length === 0
                    ? 'Seleziona tour...'
                    : selectedActivities.length === 1
                    ? activities.find(a => a.activity_id === selectedActivities[0])?.title || '1 tour selezionato'
                    : selectedActivities.length <= 2
                    ? selectedActivities.map(id =>
                        activities.find(a => a.activity_id === id)?.title
                      ).filter(Boolean).join(', ')
                    : `${selectedActivities.length} tour selezionati`
                  }
                </span>
                {selectedActivities.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                    {selectedActivities.length}
                  </span>
                )}
                <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg max-h-96 overflow-hidden flex flex-col">
                  <div className="p-2 border-b">
                    {/* Search input */}
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Cerca tour..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-8 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                      {searchTerm && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSearchTerm('')
                            searchInputRef.current?.focus()
                          }}
                          className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-y-auto max-h-80 flex-1">
                    {searchTerm && (
                      <div className="px-3 py-1 text-xs text-gray-500 bg-gray-50">
                        {activities.filter(a => a.title.toLowerCase().includes(searchTerm.toLowerCase())).length} risultati
                      </div>
                    )}
                    <div className="p-2">
                      <button
                        onClick={() => {
                          const filteredActivities = activities.filter(a =>
                            a.title.toLowerCase().includes(searchTerm.toLowerCase())
                          )
                          const filteredIds = filteredActivities.map(a => a.activity_id)
                          const allFilteredSelected = filteredIds.every(id => tempSelectedActivities.includes(id))

                          if (allFilteredSelected) {
                            setTempSelectedActivities(tempSelectedActivities.filter(id => !filteredIds.includes(id)))
                          } else {
                            setTempSelectedActivities([...new Set([...tempSelectedActivities, ...filteredIds])])
                          }
                        }}
                        className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
                      >
                        {(() => {
                          const filteredActivities = activities.filter(a =>
                            a.title.toLowerCase().includes(searchTerm.toLowerCase())
                          )
                          const filteredIds = filteredActivities.map(a => a.activity_id)
                          const allFilteredSelected = filteredIds.every(id => tempSelectedActivities.includes(id))
                          return allFilteredSelected ? 'Deseleziona tutti (filtrati)' : 'Seleziona tutti (filtrati)'
                        })()}
                      </button>
                    </div>
                    <div className="border-t">
                      {activities
                        .filter(activity =>
                          activity.title.toLowerCase().includes(searchTerm.toLowerCase())
                        )
                        .map(activity => (
                          <div
                            key={activity.activity_id}
                            className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                            onClick={() => handleActivityChange(activity.activity_id, !tempSelectedActivities.includes(activity.activity_id))}
                          >
                            <input
                              type="checkbox"
                              id={activity.activity_id}
                              checked={tempSelectedActivities.includes(activity.activity_id)}
                              onChange={(e) => {
                                e.stopPropagation()
                                handleActivityChange(activity.activity_id, e.target.checked)
                              }}
                              className="w-4 h-4 mr-2"
                            />
                            <label
                              htmlFor={activity.activity_id}
                              className="text-sm cursor-pointer flex-1"
                            >
                              {searchTerm ? (
                                (() => {
                                  const parts = activity.title.split(new RegExp(`(${searchTerm})`, 'gi'))
                                  return parts.map((part: string, index: number) =>
                                    part.toLowerCase() === searchTerm.toLowerCase() ? (
                                      <span key={index} className="bg-yellow-200">{part}</span>
                                    ) : (
                                      <span key={index}>{part}</span>
                                    )
                                  )
                                })()
                              ) : (
                                activity.title
                              )}
                            </label>
                          </div>
                        ))}
                      {activities.filter(activity =>
                        activity.title.toLowerCase().includes(searchTerm.toLowerCase())
                      ).length === 0 && (
                        <div className="px-3 py-4 text-sm text-gray-500 text-center">
                          Nessun tour trovato
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Apply Button */}
                  <div className="p-3 border-t bg-gray-50">
                    <Button
                      onClick={applyTourFilter}
                      className="w-full"
                    >
                      Applica
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Date Picker */}
          <div>
            <Label>Data</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="mt-2"
            />
          </div>
        </div>

        {/* Pulsanti Azione */}
        <div className="mt-4 flex gap-2">
          <Button
            onClick={exportToExcel}
            variant="outline"
            disabled={data.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Grouped Tours */}
      <div className="space-y-4">
        {groupedTours.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Nessun dato trovato per i filtri selezionati
          </div>
        ) : (
          groupedTours.map((tour) => (
            <div key={tour.tourTitle} className="border rounded-lg bg-white shadow-sm">
              {/* Tour Header */}
              <div
                className="p-4 bg-blue-50 border-b cursor-pointer hover:bg-blue-100 transition-colors"
                onClick={() => toggleTourExpansion(tour.tourTitle)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ChevronRight
                      className={`h-5 w-5 transition-transform ${
                        tour.isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                    <h3 className="text-lg font-bold">{tour.tourTitle}</h3>
                  </div>
                  <div className="text-sm font-semibold text-blue-700">
                    Orari: {tour.timeSlots.length} | Total: {tour.totalParticipants} participants
                  </div>
                </div>
              </div>

              {/* Time Slots */}
              {tour.isExpanded && (
                <div className="p-4 space-y-4">
                  {tour.timeSlots.map((timeSlot) => (
                    <div key={timeSlot.time} className="border rounded-lg p-3 bg-gray-50">
                      {/* Time Slot Header */}
                      <div className="mb-3 pb-2 border-b flex items-center justify-between">
                        <h4 className="font-semibold text-md">
                          Time: {timeSlot.time}
                        </h4>
                        <span className="text-sm text-gray-600">
                          {timeSlot.totalParticipants} participants
                        </span>
                      </div>

                      {/* Draggable Bookings Table */}
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleDragEnd(event, tour.tourTitle, timeSlot.time)}
                      >
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12"></TableHead>
                              <TableHead>Tour</TableHead>
                              <TableHead>Data</TableHead>
                              <TableHead>Ora</TableHead>
                              <TableHead>Totale Partecipanti</TableHead>
                              <TableHead></TableHead>
                              <TableHead>Nome</TableHead>
                              <TableHead>Cognome</TableHead>
                              <TableHead>Telefono</TableHead>
                              <TableHead>Booking ID</TableHead>
                              <TableHead>Activity Booking ID</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <SortableContext
                              items={timeSlot.bookings.map((b) => b.activity_booking_id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {timeSlot.bookings.map((booking) => (
                                <SortableBookingRow
                                  key={booking.activity_booking_id}
                                  booking={booking}
                                />
                              ))}
                            </SortableContext>
                          </TableBody>
                        </Table>
                      </DndContext>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Update Participants Modal */}
      <Dialog open={updateModalOpen} onOpenChange={setUpdateModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Participants - Activity Booking ID: {selectedActivityBookingId}</DialogTitle>
            <DialogDescription>
              Edit participant details below and click Save to update the database.
            </DialogDescription>
          </DialogHeader>

          {loadingParticipants ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading participants...</span>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {participantsToEdit.map((participant, index) => (
                <div key={participant.pricing_category_booking_id} className="p-4 border rounded-lg bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Category</Label>
                      <Input value={participant.booked_title} disabled className="bg-gray-100" />
                    </div>
                    <div>
                      <Label>Booking ID</Label>
                      <Input value={participant.pricing_category_booking_id} disabled className="bg-gray-100" />
                    </div>
                    <div>
                      <Label>First Name</Label>
                      <Input
                        value={participant.passenger_first_name || ''}
                        onChange={(e) => updateParticipantField(index, 'passenger_first_name', e.target.value)}
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <Label>Last Name</Label>
                      <Input
                        value={participant.passenger_last_name || ''}
                        onChange={(e) => updateParticipantField(index, 'passenger_last_name', e.target.value)}
                        placeholder="Last name"
                      />
                    </div>
                    <div>
                      <Label>Date of Birth</Label>
                      <Input
                        type="date"
                        value={participant.passenger_date_of_birth || ''}
                        onChange={(e) => updateParticipantField(index, 'passenger_date_of_birth', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveParticipants} disabled={saving || loadingParticipants}>
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}