/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Download, ChevronDown, Search, X, Edit } from 'lucide-react'
import * as XLSX from 'xlsx'
import { sanitizeDataForExcel } from '@/lib/security/sanitize'
import { securityLogger } from '@/lib/security/logger'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

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
    pricing_category_id?: string
    booked_title: string
    first_name: string | null
    last_name: string | null
    date_of_birth: string | null
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

export default function PaxNamesPage() {
  const [data, setData] = useState<PaxData[]>([])
  const [loading, setLoading] = useState(false)
  const [activities, setActivities] = useState<any[]>([])
  const [selectedActivities, setSelectedActivities] = useState<string[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showMainContactOnly, setShowMainContactOnly] = useState(false)
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  })

  // Update modal states
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [selectedActivityBookingId, setSelectedActivityBookingId] = useState<number | null>(null)
  const [participantsToEdit, setParticipantsToEdit] = useState<ParticipantEdit[]>([])
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const [saving, setSaving] = useState(false)

  // Current user for audit logging
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null)

  useEffect(() => {
    loadActivities()
    // Get current user for audit logging
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUser({ id: user.id, email: user.email || 'unknown' })
      }
    }
    getUser()
  }, [])

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

  const loadActivities = async () => {
    const { data: allActivities, error } = await supabase
      .from('activities')
      .select('activity_id, title')
      .order('title')

    if (!error && allActivities) {
      setActivities(allActivities)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    
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
            pricing_category_id,
            booked_title,
            passenger_first_name,
            passenger_last_name,
            passenger_date_of_birth,
            quantity
          )
        `)
        .not('status', 'in', '(CANCELLED)')  // Filter only activity_bookings.status
        .gte('start_date_time', `${dateRange.start}T00:00:00`)
        .lte('start_date_time', `${dateRange.end}T23:59:59`)
        .limit(10000) // Increase limit to handle more bookings

      // Applica filtro attività se selezionate
      if (selectedActivities.length > 0) {
        query = query.in('activity_id', selectedActivities)
      }

      const { data: bookings, error } = await query

      if (error) {
        console.error('Errore nel caricamento dati:', error)
        console.error('Error details:', error.message, error.details, error.hint)
        return
      }

      // Recupera separatamente i dati dei clienti
      const customerDataMap = new Map()
      if (bookings && bookings.length > 0) {
        // Ensure booking IDs are numbers for the query
        const bookingIds = bookings.map(b => Number(b.booking_id))
        
        // Recupera le relazioni booking_customers
        const { data: bookingCustomers, error: bcError } = await supabase
          .from('booking_customers')
          .select('booking_id, customer_id')
          .in('booking_id', bookingIds)
        
        if (bcError) {
          console.error('Error fetching booking_customers:', bcError)
        } else if (bookingCustomers && bookingCustomers.length > 0) {
          // Ensure customer_ids are strings
          const customerIds = bookingCustomers.map(bc => String(bc.customer_id))
          
          // Recupera i dati dei clienti usando customer_id come stringa
          const { data: customers, error: custError } = await supabase
            .from('customers')
            .select('customer_id, first_name, last_name, phone_number, email')
            .in('customer_id', customerIds)
          
          if (custError) {
            console.error('Error fetching customers:', custError)
          } else if (customers) {
            // Crea una mappa per lookup veloce - customer_id è sempre stringa
            const customerMap = new Map()
            customers.forEach(c => {
              customerMap.set(String(c.customer_id), c)
            })
            
            // Collega booking_id -> customer data
            bookingCustomers.forEach(bc => {
              const customer = customerMap.get(String(bc.customer_id))
              if (customer) {
                customerDataMap.set(String(bc.booking_id), customer)
              }
            })
          }
        }
      }

      // Trasforma i dati nel formato richiesto
      const transformedData: PaxData[] = []

      bookings?.forEach((booking: any) => {
        const bookingDate = new Date(booking.start_date_time)
        const dateStr = bookingDate.toISOString().split('T')[0]
        const activityId = booking.activity_id

        // Calcola il totale partecipanti e dettagli
        let totalParticipants = 0
        const passengers: any[] = []
        const participantTypes: { [key: string]: number } = {}

        booking.pricing_category_bookings?.forEach((pax: any) => {
          const pricingCategoryId = pax.pricing_category_id?.toString()
          const bookedTitle = pax.booked_title || 'Unknown'

          // Skip excluded pricing categories for specific activities
          if (shouldExcludePricingCategory(activityId, bookedTitle, pricingCategoryId)) {
            return
          }

          const quantity = pax.quantity || 1
          totalParticipants += quantity

          // Conta per tipo di partecipante
          if (participantTypes[bookedTitle]) {
            participantTypes[bookedTitle] += quantity
          } else {
            participantTypes[bookedTitle] = quantity
          }

          // Add one passenger row per pricing_category_booking entry (no duplication)
          passengers.push({
            pricing_category_id: pricingCategoryId,
            booked_title: bookedTitle,
            first_name: pax.passenger_first_name,
            last_name: pax.passenger_last_name,
            date_of_birth: pax.passenger_date_of_birth
          })
        })

        // Costruisci la stringa dei dettagli partecipanti
        let participantsDetail = `${totalParticipants}`
        if (Object.keys(participantTypes).length > 0) {
          const details = Object.entries(participantTypes)
            .map(([type, count]) => {
              return `(${count} ${type})`
            })
            .join(', ')
          participantsDetail += ` - ${details}`
        }

        // Ottieni il titolo dell'attività dalla mappa
        const activityTitle = activitiesMap.get(activityId) || 'N/A'

        // Ottieni i dati del cliente dalla mappa - booking_id come stringa
        const customerData = customerDataMap.get(String(booking.booking_id))

        transformedData.push({
          activity_id: activityId,
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

      // Ordina i dati come richiesto
      transformedData.sort((a, b) => {
        // Prima per data
        if (a.booking_date !== b.booking_date) {
          return a.booking_date.localeCompare(b.booking_date)
        }
        // Poi per ora
        if (a.start_time !== b.start_time) {
          return a.start_time.localeCompare(b.start_time)
        }
        // Infine per titolo attività
        return a.activity_title.localeCompare(b.activity_title)
      })

      setData(transformedData)
    } catch (error) {
      console.error('Errore:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleActivityChange = (activityId: string, checked: boolean) => {
    if (checked) {
      setSelectedActivities([...selectedActivities, activityId])
    } else {
      setSelectedActivities(selectedActivities.filter(id => id !== activityId))
    }
  }

  const exportToExcel = () => {
    const exportData: any[] = []

    if (showMainContactOnly) {
      // Export solo contatti principali
      data.forEach(booking => {
        const fullName = `${booking.customer?.first_name || ''} ${booking.customer?.last_name || ''}`.trim()
        exportData.push({
          'Tour': booking.activity_title,
          'Data': new Date(booking.booking_date).toLocaleDateString('it-IT'),
          'Ora': booking.start_time,
          'Booking ID': booking.booking_id,
          'Activity Booking ID': booking.activity_booking_id,
          'Totale Partecipanti': booking.participants_detail,
          'Nome e Cognome': fullName,
          'Telefono': booking.customer?.phone_number || ''
        })
      })
    } else {
      // Export tutti i partecipanti
      data.forEach(booking => {
        booking.passengers.forEach(pax => {
          exportData.push({
            'Tour': booking.activity_title,
            'Data': new Date(booking.booking_date).toLocaleDateString('it-IT'),
            'Ora': booking.start_time,
            'Booking ID': booking.booking_id,
            'Activity Booking ID': booking.activity_booking_id,
            'Totale Partecipanti': booking.participants_detail,
            'Categoria': pax.booked_title,
            'Nome': pax.first_name || '',
            'Cognome': pax.last_name || '',
            'Data di Nascita': pax.date_of_birth ? new Date(pax.date_of_birth).toLocaleDateString('it-IT') : ''
          })
        })
      })
    }

    // Sanitize data to prevent formula injection attacks
    const sanitizedData = sanitizeDataForExcel(exportData)

    // Crea workbook e worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(sanitizedData)

    // Imposta larghezza colonne basata sul tipo di vista
    const colWidths = showMainContactOnly ? [
      { wch: 30 }, // Tour
      { wch: 12 }, // Data
      { wch: 8 },  // Ora
      { wch: 12 }, // Booking ID
      { wch: 18 }, // Activity Booking ID
      { wch: 18 }, // Totale Partecipanti
      { wch: 25 }, // Nome e Cognome
      { wch: 20 }, // Telefono
    ] : [
      { wch: 30 }, // Tour
      { wch: 12 }, // Data
      { wch: 8 },  // Ora
      { wch: 12 }, // Booking ID
      { wch: 18 }, // Activity Booking ID
      { wch: 18 }, // Totale Partecipanti
      { wch: 20 }, // Categoria
      { wch: 15 }, // Nome
      { wch: 15 }, // Cognome
      { wch: 15 }, // Data di Nascita
    ]
    ws['!cols'] = colWidths

    const sheetName = showMainContactOnly ? 'Contatti Principali' : 'Nominativi Passeggeri'
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    
    const fileName = showMainContactOnly
      ? `main_contacts_${new Date().toISOString().split('T')[0]}.xlsx`
      : `pax_names_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
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

        // Log the manual update with actual user ID
        await supabase
          .from('manual_participant_updates')
          .insert({
            activity_booking_id: selectedActivityBookingId,
            pricing_category_booking_id: participant.pricing_category_booking_id,
            booked_title: participant.booked_title,
            passenger_first_name: participant.passenger_first_name,
            passenger_last_name: participant.passenger_last_name,
            passenger_date_of_birth: participant.passenger_date_of_birth,
            updated_by: currentUser?.email || currentUser?.id || 'unknown',
            updated_at: new Date().toISOString()
          })

        // Security logging
        securityLogger.dataModification(
          currentUser?.id || 'unknown',
          'pricing_category_bookings',
          'update',
          participant.pricing_category_booking_id
        )
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

  return (
    <div className="p-4">
      {/* Sezione Filtri */}
      <div className="mb-6 p-4 border rounded-lg bg-gray-50">
        <h3 className="text-lg font-semibold mb-4">Filtri</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg max-h-60 overflow-hidden">
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
                  
                  <div className="overflow-y-auto max-h-48">
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
                          const allFilteredSelected = filteredIds.every(id => selectedActivities.includes(id))
                          
                          if (allFilteredSelected) {
                            setSelectedActivities(selectedActivities.filter(id => !filteredIds.includes(id)))
                          } else {
                            setSelectedActivities([...new Set([...selectedActivities, ...filteredIds])])
                          }
                        }}
                        className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
                      >
                        {(() => {
                          const filteredActivities = activities.filter(a => 
                            a.title.toLowerCase().includes(searchTerm.toLowerCase())
                          )
                          const filteredIds = filteredActivities.map(a => a.activity_id)
                          const allFilteredSelected = filteredIds.every(id => selectedActivities.includes(id))
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
                            onClick={() => handleActivityChange(activity.activity_id, !selectedActivities.includes(activity.activity_id))}
                          >
                            <input
                              type="checkbox"
                              id={activity.activity_id}
                              checked={selectedActivities.includes(activity.activity_id)}
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
                </div>
              )}
            </div>
          </div>

          {/* Selezione Date */}
          <div>
            <Label>Data Inizio</Label>
            <Input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
              className="mt-2"
            />
          </div>

          <div>
            <Label>Data Fine</Label>
            <Input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
              className="mt-2"
            />
          </div>
        </div>

        {/* Switch per mostrare solo contatti principali */}
        <div className="mt-4 flex items-center space-x-2">
          <Switch
            id="main-contact-mode"
            checked={showMainContactOnly}
            onCheckedChange={setShowMainContactOnly}
          />
          <Label htmlFor="main-contact-mode" className="cursor-pointer">
            Mostra solo contatto principale
          </Label>
        </div>

        {/* Pulsanti Azione */}
        <div className="mt-4 flex gap-2">
          <Button 
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Aggiorna
          </Button>
          
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

      {/* Tabella */}
      <div className="rounded-md border">
        <Table>
          <TableCaption>
            {data.length > 0 
              ? showMainContactOnly 
                ? `Trovati ${data.length} booking`
                : `Trovati ${data.length} booking con ${data.reduce((acc, b) => acc + b.passengers.length, 0)} passeggeri`
              : 'Nessun dato trovato per i filtri selezionati'
            }
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Tour</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Ora</TableHead>
              <TableHead>Booking ID</TableHead>
              <TableHead>Activity Booking ID</TableHead>
              <TableHead>Totale Partecipanti</TableHead>
              <TableHead></TableHead>
              {showMainContactOnly ? (
                <>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cognome</TableHead>
                  <TableHead>Telefono</TableHead>
                </>
              ) : (
                <>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cognome</TableHead>
                  <TableHead>Data di Nascita</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {showMainContactOnly ? (
              // Vista solo contatti principali
              data.map((booking) => (
                <TableRow key={`${booking.activity_booking_id}-main`}>
                  <TableCell className="font-medium">
                    {booking.activity_title}
                  </TableCell>
                  <TableCell>
                    {new Date(booking.booking_date).toLocaleDateString('it-IT')}
                  </TableCell>
                  <TableCell>
                    {booking.start_time}
                  </TableCell>
                  <TableCell>
                    {booking.booking_id}
                  </TableCell>
                  <TableCell>
                    {booking.activity_booking_id}
                  </TableCell>
                  <TableCell>
                    {booking.participants_detail}
                  </TableCell>
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
                </TableRow>
              ))
            ) : (
              // Vista tutti i partecipanti
              data.map((booking) => (
                booking.passengers.map((pax, paxIndex) => (
                  <TableRow key={`${booking.activity_booking_id}-${paxIndex}`}>
                    {paxIndex === 0 ? (
                      <>
                        <TableCell rowSpan={booking.passengers.length} className="font-medium">
                          {booking.activity_title}
                        </TableCell>
                        <TableCell rowSpan={booking.passengers.length}>
                          {new Date(booking.booking_date).toLocaleDateString('it-IT')}
                        </TableCell>
                        <TableCell rowSpan={booking.passengers.length}>
                          {booking.start_time}
                        </TableCell>
                        <TableCell rowSpan={booking.passengers.length}>
                          {booking.booking_id}
                        </TableCell>
                        <TableCell rowSpan={booking.passengers.length}>
                          {booking.activity_booking_id}
                        </TableCell>
                        <TableCell rowSpan={booking.passengers.length}>
                          {booking.participants_detail}
                        </TableCell>
                        <TableCell rowSpan={booking.passengers.length}>
                          <Button
                            onClick={() => loadParticipantsForEdit(booking.activity_booking_id)}
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell>{pax.booked_title}</TableCell>
                    <TableCell>{pax.first_name || '-'}</TableCell>
                    <TableCell>{pax.last_name || '-'}</TableCell>
                    <TableCell>
                      {pax.date_of_birth
                        ? new Date(pax.date_of_birth).toLocaleDateString('it-IT')
                        : '-'
                      }
                    </TableCell>
                  </TableRow>
                ))
              ))
            )}
          </TableBody>
        </Table>
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