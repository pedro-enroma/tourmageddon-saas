// src/components/RecapPage.tsx
'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Plus, X, Save, RefreshCw, Download, Edit2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

// Definizione dei tipi
interface Tour {
  activity_id: string
  title: string
}

interface TourGroup {
  id: string
  name: string
  tour_ids: string[]
  created_at?: string
  updated_at?: string
}

interface Participant {
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
  lastReservation: {
    date: string
    name: string
  } | null
  firstReservation: {
    date: string
    name: string
  } | null
  // Per raggruppamenti
  isGroup?: boolean
  isDateGroup?: boolean
  isWeekGroup?: boolean
  slots?: SlotData[]
  tours?: SlotData[]
  days?: Record<string, SlotData[]>
  weekStart?: string
  weekEnd?: string
}

export default function RecapPage() {
  // Stati principali
  const [tours, setTours] = useState<Tour[]>([])
  const [tourGroups, setTourGroups] = useState<TourGroup[]>([])
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [viewMode, setViewMode] = useState('orario')
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  })
  const [data, setData] = useState<SlotData[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedRows, setExpandedRows] = useState(new Set<string>())
  const [participantCategories, setParticipantCategories] = useState<string[]>([])
  
  // Stati per il popup
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<TourGroup | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedTours, setSelectedTours] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  // Tour filtrati per la ricerca
  const filteredTours = tours.filter(tour => 
    tour.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Definisci loadData con useCallback per evitare warning di dipendenze
  const loadData = useCallback(async () => {
    setLoading(true)
    
    let tourIds: string[] = []
    
    if (selectedFilter === 'all') {
      tourIds = tours.map(t => t.activity_id)
    } else if (selectedFilter.startsWith('group-')) {
      const groupId = selectedFilter.replace('group-', '')
      const group = tourGroups.find(g => g.id === groupId)
      if (group) {
        tourIds = group.tour_ids || []
      }
    } else {
      tourIds = [selectedFilter]
    }
    
    // Query per le prenotazioni - CORREZIONE: solo activity_bookings.status
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
          booked_title,
          quantity,
          age,
          passenger_first_name,
          passenger_last_name
        )
      `)
      .neq('status', 'CANCELLED')  // SOLO activity_bookings.status
      .gte('start_date_time', `${dateRange.start}T00:00:00`)
      .lte('start_date_time', `${dateRange.end}T23:59:59`)

    if (tourIds.length > 0 && selectedFilter !== 'all') {
      bookingsQuery = bookingsQuery.in('activity_id', tourIds)
    }

    const { data: bookings } = await bookingsQuery
    
    // Query per le disponibilità
    let availabilityQuery = supabase
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
      .order('local_date_time', { ascending: true })

    if (tourIds.length > 0 && selectedFilter !== 'all') {
      availabilityQuery = availabilityQuery.in('activity_id', tourIds)
    }

    const { data: availabilities } = await availabilityQuery
    
    // Query opzionale per categorie storiche se è selezionato un prodotto specifico
    let historicalCategories: string[] = []
    
    if (tourIds.length === 1 && selectedFilter !== 'all') {
      const { data: historicalBookings } = await supabase
        .from('activity_bookings')
        .select(`
          pricing_category_bookings (
            booked_title
          )
        `)
        .eq('activity_id', tourIds[0])
        .not('pricing_category_bookings.booked_title', 'is', null)
      
      const historicalCategoriesSet = new Set<string>()
      historicalBookings?.forEach(booking => {
        if ('pricing_category_bookings' in booking && Array.isArray(booking.pricing_category_bookings)) {
          booking.pricing_category_bookings.forEach((pcb: { booked_title?: string }) => {
            if (pcb.booked_title) {
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
      historicalCategories
    )
    
    // Applica il raggruppamento in base al viewMode
    let finalData = processedData
    
    if (viewMode === 'data') {
      finalData = groupDataByDate(processedData)
    } else if (viewMode === 'settimana') {
      finalData = groupDataByWeek(processedData)
    } else if (selectedFilter.startsWith('group-')) {
      finalData = groupDataByTimeSlot(processedData)
    }
    
    setData(finalData)
    setLoading(false)
  }, [selectedFilter, dateRange, tours, viewMode, tourGroups])

  // Carica i tour e i gruppi salvati al mount
  useEffect(() => {
    loadTours()
    loadTourGroups() // Carica da DB invece che da localStorage
    
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
    
    const savedViewMode = localStorage.getItem('viewMode')
    if (savedViewMode) {
      setViewMode(savedViewMode)
    }
  }, [])

  // Salva le preferenze quando cambiano (NO tourGroups - ora sono nel DB)
  useEffect(() => {
    localStorage.setItem('selectedFilter', selectedFilter)
  }, [selectedFilter])
  
  useEffect(() => {
    localStorage.setItem('dateRange', JSON.stringify(dateRange))
  }, [dateRange])
  
  useEffect(() => {
    localStorage.setItem('viewMode', viewMode)
  }, [viewMode])

  // Carica i dati quando cambiano i filtri
  useEffect(() => {
    if (tours.length > 0) {
      loadData()
    }
  }, [selectedFilter, dateRange, tours, viewMode, loadData])

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

  // Nuova funzione per caricare gruppi dal database
  const loadTourGroups = async () => {
    try {
      const { data: groups, error } = await supabase
        .from('tour_groups')
        .select('*')
        .order('name')
      
      if (error) {
        console.error('Error loading tour groups:', error)
        // Fallback: prova a caricare da localStorage se DB fallisce
        const savedGroups = localStorage.getItem('tourGroups')
        if (savedGroups) {
          try {
            const localGroups = JSON.parse(savedGroups)
            setTourGroups(localGroups)
            // Migra i gruppi locali al database
            migrateLocalGroupsToDb(localGroups)
          } catch (e) {
            console.error('Error parsing saved groups:', e)
          }
        }
      } else if (groups) {
        setTourGroups(groups)
        // Rimuovi da localStorage dopo migrazione riuscita
        localStorage.removeItem('tourGroups')
      }
    } catch (error) {
      console.error('Error loading tour groups:', error)
    }
  }

  // Funzione per migrare gruppi esistenti da localStorage a DB
  const migrateLocalGroupsToDb = async (localGroups: TourGroup[]) => {
    try {
      for (const group of localGroups) {
        const { error } = await supabase
          .from('tour_groups')
          .upsert({
            id: group.id,
            name: group.name,
            tour_ids: group.tour_ids || []
          })
        
        if (error) {
          console.error('Error migrating group to DB:', error)
        }
      }
      console.log('Groups migrated to database successfully')
    } catch (error) {
      console.error('Error during migration:', error)
    }
  }

  const processDataForDisplay = (bookings: Booking[], availabilities: Availability[], historicalCategories: string[] = []): SlotData[] => {
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
      
      allSlots.set(key, {
        id: key,
        tourId: avail.activity_id,
        tourTitle: avail.activities.title,
        date: avail.local_date,
        time: normalizedTime,
        totalAmount: 0,
        bookingCount: 0,
        participants: {},
        totalParticipants: 0,  // AGGIUNTO: totale partecipanti
        availabilityLeft: avail.vacancy_available || 0,  // FIX: usa vacancy_available
        status: avail.status,
        bookings: [],
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
    
    // Prima aggiungi le categorie storiche passate come parametro
    historicalCategories.forEach(cat => allCategories.add(cat))
    
    // Poi aggiungi tutte le categorie trovate nei dati correnti
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
          totalParticipants: 0,  // AGGIUNTO
          availabilityLeft: 0,
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
      grouped[key].totalParticipants += row.totalParticipants || 0  // AGGIUNTO
      grouped[key].availabilityLeft += row.availabilityLeft
      
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

  const groupDataByWeek = (rawData: SlotData[]): SlotData[] => {
    const grouped: Record<string, SlotData> = {}
    
    rawData.forEach(row => {
      const date = new Date(row.date)
      const monday = new Date(date)
      const day = monday.getDay()
      const diff = monday.getDate() - day + (day === 0 ? -6 : 1)
      monday.setDate(diff)
      const weekKey = monday.toISOString().split('T')[0]
      
      if (!grouped[weekKey]) {
        grouped[weekKey] = {
          id: weekKey,
          weekStart: weekKey,
          weekEnd: new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          isWeekGroup: true,
          days: {},
          totalAmount: 0,
          bookingCount: 0,
          participants: {},
          totalParticipants: 0,  // AGGIUNTO
          availabilityLeft: 0,
          tourId: '',
          tourTitle: '',
          date: weekKey,
          time: '',
          status: '',
          bookings: [],
          lastReservation: null,
          firstReservation: null
        }
      }
      
      if (!grouped[weekKey].days![row.date]) {
        grouped[weekKey].days![row.date] = []
      }
      
      grouped[weekKey].days![row.date].push(row)
      grouped[weekKey].totalAmount += row.totalAmount
      grouped[weekKey].bookingCount += row.bookingCount
      grouped[weekKey].totalParticipants += row.totalParticipants || 0  // AGGIUNTO
      grouped[weekKey].availabilityLeft += row.availabilityLeft
      
      // Aggrega partecipanti
      Object.keys(row.participants).forEach(cat => {
        if (!grouped[weekKey].participants[cat]) {
          grouped[weekKey].participants[cat] = 0
        }
        grouped[weekKey].participants[cat] += row.participants[cat]
      })
    })
    
    return Object.values(grouped).sort((a, b) => 
      new Date(a.weekStart!).getTime() - new Date(b.weekStart!).getTime()
    )
  }

  const groupDataByTimeSlot = (rawData: SlotData[]): SlotData[] => {
    const grouped: Record<string, SlotData> = {}
    
    rawData.forEach(row => {
      const key = `${row.date}-${row.time}`
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          date: row.date,
          time: row.time,
          isGroup: true,
          tours: [],
          totalAmount: 0,
          bookingCount: 0,
          participants: {},
          totalParticipants: 0,  // AGGIUNTO
          availabilityLeft: 0,
          tourId: '',
          tourTitle: '',
          status: '',
          bookings: [],
          lastReservation: null,
          firstReservation: null
        }
      }
      
      grouped[key].tours!.push(row)
      grouped[key].totalAmount += row.totalAmount
      grouped[key].bookingCount += row.bookingCount
      grouped[key].totalParticipants += row.totalParticipants || 0  // AGGIUNTO
      grouped[key].availabilityLeft += row.availabilityLeft
      
      // Aggrega partecipanti
      Object.keys(row.participants).forEach(cat => {
        if (!grouped[key].participants[cat]) {
          grouped[key].participants[cat] = 0
        }
        grouped[key].participants[cat] += row.participants[cat]
      })
    })
    
    return Object.values(grouped)
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

  const openGroupModal = (group: TourGroup | null = null) => {
    if (group) {
      setEditingGroup(group)
      setNewGroupName(group.name)
      setSelectedTours(group.tour_ids || [])
    } else {
      setEditingGroup(null)
      setNewGroupName('')
      setSelectedTours([])
    }
    setSearchTerm('')
    setShowGroupModal(true)
  }

  // Funzione aggiornata per salvare gruppi nel database
  const saveGroup = async () => {
    if (!newGroupName.trim() || selectedTours.length === 0) {
      alert('Inserisci un nome e seleziona almeno un tour')
      return
    }
    
    try {
      if (editingGroup) {
        // Aggiorna gruppo esistente
        const { data, error } = await supabase
          .from('tour_groups')
          .update({
            name: newGroupName,
            tour_ids: selectedTours,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingGroup.id)
          .select()
          .single()
        
        if (error) throw error
        
        if (data) {
          setTourGroups(tourGroups.map(g => g.id === editingGroup.id ? data : g))
        }
      } else {
        // Crea nuovo gruppo
        const { data, error } = await supabase
          .from('tour_groups')
          .insert({
            name: newGroupName,
            tour_ids: selectedTours
          })
          .select()
          .single()
        
        if (error) throw error
        
        if (data) {
          setTourGroups([...tourGroups, data])
        }
      }
      
      setShowGroupModal(false)
      setNewGroupName('')
      setSelectedTours([])
      setEditingGroup(null)
      setSearchTerm('')
    } catch (error) {
      console.error('Error saving group:', error)
      alert('Errore nel salvare il gruppo. Riprova.')
    }
  }

  // Funzione aggiornata per eliminare gruppi dal database
  const deleteGroup = async (groupId: string) => {
    if (confirm('Sei sicuro di voler eliminare questo gruppo?')) {
      try {
        const { error } = await supabase
          .from('tour_groups')
          .delete()
          .eq('id', groupId)
        
        if (error) throw error
        
        setTourGroups(tourGroups.filter(g => g.id !== groupId))
        if (selectedFilter === `group-${groupId}`) {
          setSelectedFilter('all')
        }
      } catch (error) {
        console.error('Error deleting group:', error)
        alert('Errore nell\'eliminare il gruppo. Riprova.')
      }
    }
  }

  const toggleTourSelection = (tourId: string) => {
    if (selectedTours.includes(tourId)) {
      setSelectedTours(selectedTours.filter(id => id !== tourId))
    } else {
      setSelectedTours([...selectedTours, tourId])
    }
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
      'CLOSED': 'bg-gray-100 text-gray-800'
    }
    return colors[status?.toUpperCase()] || 'bg-gray-100 text-gray-800'
  }

  const exportToExcel = () => {
    const exportData = data.map(row => {
      const date = new Date(row.date)
      const days = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
      
      const rowData: Record<string, string | number> = {
        'Product Title': row.tourTitle || 'Gruppo',
        'Week Day': days[date.getDay()],
        'Date': date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        'Start Time': row.time || '',
        'Total Amount': row.totalAmount > 0 ? row.totalAmount : 0,
        'Booking Count': row.bookingCount,
        'Total Participants': row.totalParticipants || 0  // AGGIUNTO
      }
      
      // Aggiungi colonne partecipanti dinamiche
      participantCategories.forEach(category => {
        rowData[category] = row.participants?.[category] || 0
      })
      
      rowData['Availability Left'] = row.availabilityLeft
      rowData['Status'] = row.status
      rowData['Last Reservation'] = row.lastReservation?.name || ''
      rowData['First Reservation Date'] = row.firstReservation ? 
        new Date(row.firstReservation.date).toLocaleDateString('it-IT') : ''
      
      return rowData
    })
    
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(exportData)
    XLSX.utils.book_append_sheet(wb, ws, 'Recap')
    
    const fileName = `recap_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  return (
    <div className="max-w-full">
      {/* Sezione Filtri - Struttura riorganizzata */}
      <div className="bg-white border-b pb-6">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Filtri</h2>
          
          {/* Prima riga: 60% Seleziona Tour - 40% Pulsante Crea Gruppo */}
          <div className="grid grid-cols-10 gap-4 items-end">
            {/* Seleziona Tour - 60% */}
            <div className="col-span-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seleziona Tour
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedFilter}
                  onChange={(e) => setSelectedFilter(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Tutti i tour ({tours.length})</option>
                  {tourGroups.length > 0 && (
                    <optgroup label="Gruppi Combinati">
                      {tourGroups.map(group => (
                        <option key={group.id} value={`group-${group.id}`}>
                          📁 {group.name} ({group.tour_ids?.length || 0} tour)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Tour Singoli">
                    {tours.map(tour => (
                      <option key={tour.activity_id} value={tour.activity_id}>
                        {tour.title}
                      </option>
                    ))}
                  </optgroup>
                </select>
                
                {/* Pulsante Modifica se gruppo selezionato */}
                {selectedFilter.startsWith('group-') && (
                  <button
                    onClick={() => {
                      const groupId = selectedFilter.replace('group-', '')
                      const group = tourGroups.find(g => g.id === groupId)
                      if (group) openGroupModal(group)
                    }}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                    title="Modifica gruppo"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
            
            {/* Pulsante Crea Gruppo - 40% */}
            <div className="col-span-4">
              <button
                onClick={() => openGroupModal()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Crea Nuovo Gruppo
              </button>
            </div>
          </div>
          
          {/* Seconda riga: 50% Data Inizio - 50% Data Fine */}
          <div className="grid grid-cols-2 gap-4">
            {/* Data Inizio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data Inizio
              </label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {/* Data Fine */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data Fine
              </label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          {/* Terza riga: 20% Aggiorna - 20% Export - 60% Visualizza */}
          <div className="grid grid-cols-10 gap-4 items-center">
            {/* Pulsante Aggiorna - 20% */}
            <div className="col-span-2">
              <button
                onClick={loadData}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Aggiorna
              </button>
            </div>
            
            {/* Pulsante Export Excel - 20% */}
            <div className="col-span-2">
              <button
                onClick={exportToExcel}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export Excel
              </button>
            </div>
            
            {/* Radio Group Visualizza - 60% */}
            <div className="col-span-6 flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">Visualizza:</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="viewMode"
                  value="orario"
                  checked={viewMode === 'orario'}
                  onChange={(e) => setViewMode(e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">Per orario</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="viewMode"
                  value="data"
                  checked={viewMode === 'data'}
                  onChange={(e) => setViewMode(e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">Per data</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="viewMode"
                  value="settimana"
                  checked={viewMode === 'settimana'}
                  onChange={(e) => setViewMode(e.target.value)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">Per settimana</span>
              </label>
            </div>
          </div>
          
          {/* Lista Gruppi Salvati - più compatta */}
          {tourGroups.length > 0 && (
            <div className="pt-4 border-t">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-700">Gruppi salvati:</span>
                {tourGroups.map(group => (
                  <div key={group.id} className="inline-flex items-center gap-1 bg-purple-50 px-2 py-1 rounded text-sm">
                    <span>{group.name}</span>
                    <span className="text-xs text-gray-500">({group.tour_ids?.length || 0})</span>
                    <button
                      onClick={() => openGroupModal(group)}
                      className="text-blue-600 hover:text-blue-800 p-0.5"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteGroup(group.id)}
                      className="text-red-600 hover:text-red-800 p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Info risultati */}
      <div className="py-3 px-1 text-sm text-gray-600">
        {loading ? 'Caricamento...' : `Mostrando ${data.length} risultati`}
      </div>
      
      {/* Tabella */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">
                  {viewMode === 'settimana' ? 'Settimana' : 
                   selectedFilter.startsWith('group-') ? 'Gruppo/Tour' : 'Tour'}
                </th>
                {viewMode !== 'settimana' && (
                  <th className="px-4 py-3 text-left">Data</th>
                )}
                {viewMode === 'orario' && (
                  <th className="px-4 py-3 text-left">Ora</th>
                )}
                <th className="px-4 py-3 text-right">Totale €</th>
                <th className="px-4 py-3 text-center">Prenotazioni</th>
                <th className="px-4 py-3 text-center bg-yellow-50">Total Participants</th>
                {participantCategories.map(category => (
                  <th key={category} className="px-4 py-3 text-center bg-blue-50">
                    {category}
                  </th>
                ))}
                <th className="px-4 py-3 text-center">Disponibilità</th>
                <th className="px-4 py-3 text-center">Stato</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <React.Fragment key={row.id}>
                  <tr className={`border-t hover:bg-gray-50 ${
                    row.isGroup || row.isDateGroup || row.isWeekGroup ? 'bg-purple-50' : ''
                  }`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(row.isGroup || row.isDateGroup || row.isWeekGroup) && (
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
                        <span className={row.isGroup || row.isDateGroup || row.isWeekGroup ? 'font-bold' : ''}>
                          {row.isWeekGroup ? 
                            `Settimana ${formatDate(row.weekStart!).split(' ')[1]} - ${formatDate(row.weekEnd!).split(' ')[1]}` :
                           row.isDateGroup ?
                            `${formatDate(row.date)}` :
                           row.isGroup ? 
                            `${tourGroups.find(g => g.id === selectedFilter.replace('group-', ''))?.name || 'Gruppo'}` : 
                            row.tourTitle
                          }
                        </span>
                        {row.isGroup && (
                          <span className="text-xs text-gray-500">({row.tours?.length || 0} tour)</span>
                        )}
                        {row.isDateGroup && (
                          <span className="text-xs text-gray-500">({row.slots?.length || 0} slot)</span>
                        )}
                        {row.isWeekGroup && (
                          <span className="text-xs text-gray-500">({Object.keys(row.days || {}).length} giorni)</span>
                        )}
                      </div>
                    </td>
                    {viewMode !== 'settimana' && (
                      <td className="px-4 py-3">
                        {!row.isWeekGroup && !row.isDateGroup && formatDate(row.date)}
                      </td>
                    )}
                    {viewMode === 'orario' && (
                      <td className="px-4 py-3">{row.time}</td>
                    )}
                    <td className="px-4 py-3 text-right font-medium">
                      €{row.totalAmount?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                        {row.bookingCount || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center bg-yellow-50">
                      <span className="font-bold">
                        {row.totalParticipants || 0}
                      </span>
                    </td>
                    {participantCategories.map(category => (
                      <td key={category} className="px-4 py-3 text-center bg-blue-50">
                        {row.participants?.[category] || 0}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <span className={`font-medium ${row.availabilityLeft < 5 ? 'text-red-600' : ''}`}>
                        {row.availabilityLeft || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!row.isGroup && !row.isDateGroup && !row.isWeekGroup && row.status && (
                        <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusBadge(row.status)}`}>
                          {row.status}
                        </span>
                      )}
                    </td>
                  </tr>
                  
                  {/* Righe espanse per i gruppi */}
                  {row.isGroup && expandedRows.has(row.id) && row.tours?.map((tour, idx) => (
                    <tr key={`${row.id}-${idx}`} className="bg-gray-50 border-t">
                      <td className="px-4 py-2 pl-12">
                        <span className="text-sm">{tour.tourTitle}</span>
                      </td>
                      <td className="px-4 py-2 text-sm">{formatDate(tour.date)}</td>
                      <td className="px-4 py-2 text-sm">{tour.time}</td>
                      <td className="px-4 py-2 text-right text-sm">€{tour.totalAmount?.toFixed(2) || '0.00'}</td>
                      <td className="px-4 py-2 text-center text-sm">{tour.bookingCount || 0}</td>
                      <td className="px-4 py-2 text-center text-sm bg-yellow-50">{tour.totalParticipants || 0}</td>
                      {participantCategories.map(category => (
                        <td key={category} className="px-4 py-2 text-center text-sm">
                          {tour.participants?.[category] || 0}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-center text-sm">{tour.availabilityLeft || 0}</td>
                      <td className="px-4 py-2 text-center">
                        {tour.status && (
                          <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusBadge(tour.status)}`}>
                            {tour.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  
                  {/* Righe espanse per le date */}
                  {row.isDateGroup && expandedRows.has(row.id) && row.slots?.map((slot, idx) => (
                    <tr key={`${row.id}-${idx}`} className="bg-gray-50 border-t">
                      <td className="px-4 py-2 pl-12">
                        <span className="text-sm">{slot.tourTitle}</span>
                      </td>
                      <td className="px-4 py-2 text-sm">{slot.time}</td>
                      <td className="px-4 py-2 text-right text-sm">€{slot.totalAmount?.toFixed(2) || '0.00'}</td>
                      <td className="px-4 py-2 text-center text-sm">{slot.bookingCount || 0}</td>
                      <td className="px-4 py-2 text-center text-sm bg-yellow-50">{slot.totalParticipants || 0}</td>
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
                    </tr>
                  ))}
                  
                  {/* Righe espanse per le settimane */}
                  {row.isWeekGroup && expandedRows.has(row.id) && row.days &&
                    Object.entries(row.days).sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime()).map(([date, slots]) => (
                      <React.Fragment key={date}>
                        <tr className="bg-blue-50 border-t">
                          <td colSpan={10} className="px-4 py-2 pl-12 font-medium">
                            {formatDate(date)}
                          </td>
                        </tr>
                        {slots.map((slot, idx) => (
                          <tr key={`${date}-${idx}`} className="bg-gray-50">
                            <td className="px-4 py-2 pl-16 text-sm">{slot.tourTitle}</td>
                            <td className="px-4 py-2 text-sm">{slot.time}</td>
                            <td className="px-4 py-2 text-right text-sm">€{slot.totalAmount?.toFixed(2) || '0.00'}</td>
                            <td className="px-4 py-2 text-center text-sm">{slot.bookingCount || 0}</td>
                            <td className="px-4 py-2 text-center text-sm bg-yellow-50">{slot.totalParticipants || 0}</td>
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
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  }
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Gruppo */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">
                {editingGroup ? 'Modifica Gruppo' : 'Crea Nuovo Gruppo'}
              </h2>
              <button
                onClick={() => {
                  setShowGroupModal(false)
                  setSearchTerm('')
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mb-4">
              <label className="block font-medium mb-2">Nome del gruppo:</label>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="es. Combinato Vaticano"
                className="w-full border rounded px-3 py-2"
              />
            </div>
            
            <div className="mb-4">
              <label className="block font-medium mb-2">
                Seleziona i tour da includere:
              </label>
              
              {/* Barra di ricerca */}
              <div className="mb-3">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="🔍 Cerca tour..."
                  className="w-full border rounded px-3 py-2 bg-gray-50"
                />
              </div>
              
              <div className="border rounded p-3 max-h-60 overflow-y-auto">
                {filteredTours.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    Nessun tour trovato con &quot;{searchTerm}&quot;
                  </p>
                ) : (
                  filteredTours.map(tour => (
                    <label 
                      key={tour.activity_id} 
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTours.includes(tour.activity_id)}
                        onChange={() => toggleTourSelection(tour.activity_id)}
                        className="w-4 h-4"
                      />
                      <span className="flex-1">
                        {tour.title}
                      </span>
                    </label>
                  ))
                )}
              </div>
              
              <div className="mt-2 flex justify-between items-center text-sm text-gray-600">
                <span>Tour selezionati: {selectedTours.length}</span>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Mostra tutti
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowGroupModal(false)
                  setSearchTerm('')
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={saveGroup}
                disabled={selectedTours.length === 0 || !newGroupName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                Salva Gruppo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}