/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Download, ChevronDown, Search, X, Check } from 'lucide-react'
import * as XLSX from 'xlsx'
import { sanitizeDataForExcel } from '@/lib/security/sanitize'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Excluded pricing categories for specific activities
const EXCLUDED_PRICING_CATEGORIES: Record<string, string[]> = {
  '217949': ['6 a 12 años', '13 a 17 años'],
  '216954': ['6 a 12 años', '13 a 17 años'],
  '220107': ['6 a 12 años', '13 a 17 años']
}

// Helper function to check if a pricing category should be excluded
const shouldExcludePricingCategory = (activityId: string, categoryTitle: string): boolean => {
  const excludedCategories = EXCLUDED_PRICING_CATEGORIES[activityId]
  return excludedCategories ? excludedCategories.includes(categoryTitle) : false
}

export default function PivotTable() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<any[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  })
  const [participantCategories, setParticipantCategories] = useState<string[]>([])

  useEffect(() => {
    loadAllProducts()
  }, [])

  useEffect(() => {
    fetchData()
  }, [selectedProduct, dateRange])

  // Auto-refresh data every hour
  useEffect(() => {
    const intervalId = setInterval(() => {
      console.log('Auto-refreshing Consumed page data...')
      fetchData()
    }, 60 * 60 * 1000) // 60 minutes

    return () => clearInterval(intervalId)
  }, [selectedProduct, dateRange])

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

  const loadAllProducts = async () => {
    const { data: allActivities, error } = await supabase
      .from('activities')
      .select('activity_id, title')
      .order('title')

    if (!error && allActivities) {
      setProducts(allActivities)
    }
  }

  const handleProductSelect = (productId: string) => {
    setSelectedProduct(productId)
    setIsDropdownOpen(false)
    setSearchTerm('')
  }

  const fetchData = async () => {
    setLoading(true)
    
    // Prendi le prenotazioni - FILTRO SOLO su activity_bookings.status
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
      .not('status', 'in', '(CANCELLED)')  // Filter only activity_bookings.status
      .gte('start_date_time', `${dateRange.start}T00:00:00`)
      .lte('start_date_time', `${dateRange.end}T23:59:59`)
      .limit(10000) // Increase limit to handle large date ranges

    if (selectedProduct && selectedProduct !== '') {
      bookingsQuery = bookingsQuery.eq('activity_id', selectedProduct)
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery
    
    // Prendi le disponibilità
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
      .limit(10000) // Increase limit to handle large date ranges

    if (selectedProduct && selectedProduct !== '') {
      availabilityQuery = availabilityQuery.eq('activity_id', selectedProduct)
    }

    const { data: availabilities, error: availError } = await availabilityQuery

    // Per gestire gli UPDATE, raggruppa le prenotazioni per activity_booking_id
    // e prendi solo l'ultima versione (quella con la data più recente)
    const bookingsByActivityId = new Map()
    
    bookings?.forEach(booking => {
      const activityBookingId = booking.activity_booking_id
      const existingBooking = bookingsByActivityId.get(activityBookingId)
      
      // Se non esiste o questo booking è più recente, usa questo
      if (!existingBooking || new Date(booking.created_at) > new Date(existingBooking.created_at)) {
        bookingsByActivityId.set(activityBookingId, booking)
      }
    })
    
    // Converti la mappa in array con solo le versioni più recenti
    const filteredBookings = Array.from(bookingsByActivityId.values())

    // Crea una mappa di tutti gli slot USANDO SOLO DATA E ORA
    const allSlots = new Map()

    // Prima aggiungi tutti gli slot dalle disponibilità
    availabilities?.forEach(avail => {
      // Normalizza l'ora per essere sicuri del formato
      const time = avail.local_time.substring(0, 5)
      const key = `${avail.activity_id}_${avail.local_date}_${time}`
      
      allSlots.set(key, {
        product_title: avail.activities.title,
        activity_id: avail.activity_id,
        date: avail.local_date,
        time: time,
        date_time: avail.local_date_time,
        vacancy_available: avail.vacancy_available || 0,
        vacancy_opening: avail.vacancy_opening || 0,
        status: avail.status,
        bookings: [],
        total_amount: 0,
        participants: {},
        totalParticipants: 0,  // AGGIUNTO
        last_reservation: null,
        first_reservation: null
      })
    })

    // Ora aggiungi le prenotazioni filtrate agli slot esistenti
    filteredBookings.forEach(booking => {
      // Estrai data e ora dalla prenotazione
      const bookingDateTime = new Date(booking.start_date_time)
      const bookingDate = bookingDateTime.toISOString().split('T')[0]
      const bookingTime = bookingDateTime.toTimeString().substring(0, 5)
      
      const key = `${booking.activity_id}_${bookingDate}_${bookingTime}`
      
      // Trova lo slot esistente o creane uno nuovo se non esiste
      let slot = allSlots.get(key)
      
      if (!slot) {
        console.warn(`⚠️ Prenotazione senza disponibilità: ${key}`)
        // Se non c'è disponibilità, crea comunque lo slot per mostrare la prenotazione
        slot = {
          product_title: booking.activities?.title || booking.product_title || 'N/A',
          activity_id: booking.activity_id,
          date: bookingDate,
          time: bookingTime,
          date_time: booking.start_date_time,
          vacancy_available: 0,
          vacancy_opening: 0,
          status: 'SOLD_OUT',
          bookings: [],
          total_amount: 0,
          participants: {},
          totalParticipants: 0,  // AGGIUNTO
          last_reservation: null,
          first_reservation: null
        }
        allSlots.set(key, slot)
      }

      // Aggiungi la prenotazione allo slot
      slot.bookings.push(booking)
      slot.total_amount += booking.total_price || 0

      // Conta i partecipanti
      let totalParticipants = 0
      booking.pricing_category_bookings?.forEach((pax: any) => {
        const category = pax.booked_title || 'Unknown'

        // Skip excluded pricing categories for specific activities
        if (shouldExcludePricingCategory(booking.activity_id, category)) {
          return
        }

        if (!slot.participants[category]) {
          slot.participants[category] = 0
        }
        slot.participants[category] += pax.quantity || 1
        totalParticipants += pax.quantity || 1
      })

      // Aggiungi al totale partecipanti dello slot
      slot.totalParticipants = (slot.totalParticipants || 0) + totalParticipants

      // Traccia prima e ultima prenotazione
      const bookingCreationDate = new Date(booking.bookings.creation_date)
      if (!slot.first_reservation || bookingCreationDate < new Date(slot.first_reservation.date)) {
        slot.first_reservation = {
          date: booking.bookings.creation_date,
          id: booking.bookings.confirmation_code
        }
      }
      if (!slot.last_reservation || bookingCreationDate > new Date(slot.last_reservation.date)) {
        slot.last_reservation = {
          date: booking.bookings.creation_date,
          id: booking.bookings.confirmation_code,
          name: (booking.pricing_category_bookings?.[0]?.passenger_first_name || '') + ' ' + 
                (booking.pricing_category_bookings?.[0]?.passenger_last_name || '')
        }
      }
    })

    // Converti in array e ordina
    const finalData = Array.from(allSlots.values())
      .sort((a, b) => {
        if (a.date !== b.date) {
          return new Date(a.date).getTime() - new Date(b.date).getTime()
        }
        if (a.time !== b.time) {
          return a.time.localeCompare(b.time)
        }
        return a.product_title.localeCompare(b.product_title)
      })

    // Estrai categorie partecipanti
    const allCategories = new Set<string>()
    
    // Se è selezionato un prodotto specifico, recupera TUTTE le categorie storiche per quel prodotto
    if (selectedProduct && selectedProduct !== '') {
      // Query separata per ottenere tutte le categorie storiche di questo prodotto
      const { data: historicalBookings } = await supabase
        .from('activity_bookings')
        .select(`
          pricing_category_bookings (
            booked_title
          )
        `)
        .eq('activity_id', selectedProduct)
        .not('pricing_category_bookings.booked_title', 'is', null)
      
      // Estrai tutte le categorie uniche dalle prenotazioni storiche
      historicalBookings?.forEach(booking => {
        booking.pricing_category_bookings?.forEach((pcb: any) => {
          if (pcb.booked_title && !shouldExcludePricingCategory(selectedProduct, pcb.booked_title)) {
            allCategories.add(pcb.booked_title)
          }
        })
      })
    }
    
    // Aggiungi anche le categorie dai dati correnti
    finalData.forEach(row => {
      Object.keys(row.participants).forEach(cat => allCategories.add(cat))
    })
    
    // Se non ci sono categorie per un prodotto specifico, usa quelle disponibili
    if (allCategories.size === 0 && selectedProduct) {
      // Fallback: usa categorie standard se non ci sono dati storici
      ['Adult', 'Child', 'Senior', 'Student'].forEach(cat => allCategories.add(cat))
    }

    // ORDINAMENTO MIGLIORATO PER ETÀ
    const sortedCategories = Array.from(allCategories).sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()
      
      // Prima gli adulti
      if (aLower.includes('adult')) return -1
      if (bLower.includes('adult')) return 1
      
      // Poi ordina per età (assumendo che l'età sia nel nome, es: "Child (6-12)")
      // Estrai i numeri dalle categorie
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
    setData(finalData)
    setLoading(false)

    // Debug
    console.log('Prenotazioni totali (prima del filtro):', bookings?.length)
    console.log('Prenotazioni filtrate (dopo deduplica):', filteredBookings.length)
    console.log('Slot totali:', finalData.length)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const days = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
    return `${days[date.getDay()]} ${date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
  }

  const formatTime = (timeStr: string) => {
    if (!timeStr) return ''
    return timeStr.substring(0, 5)
  }

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'AVAILABLE':
        return 'bg-green-100 text-green-800'
      case 'LIMITED':
        return 'bg-orange-100 text-orange-800'
      case 'SOLD_OUT':
      case 'SOLDOUT':
        return 'bg-red-100 text-red-800'
      case 'CLOSED':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-blue-100 text-blue-800'
    }
  }

  // Funzione per esportare in Excel
  const exportToExcel = () => {
    // Prepara i dati per l'export
    const exportData = data.map(row => {
      const date = new Date(row.date)
      const days = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
      
      const rowData: any = {
        'Product Title': row.product_title,
        'Week Day': days[date.getDay()], // Solo giorno della settimana
        'Date': date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }), // Solo data
        'Start Time': row.time,
        'Total Amount': row.total_amount > 0 ? row.total_amount.toFixed(2).replace('.', ',') : '0',
        'Booking Count': row.bookings.length,
        'Total Participants': row.totalParticipants || 0  // AGGIUNTO
      }

      // Aggiungi colonne dinamiche partecipanti
      participantCategories.forEach(category => {
        rowData[category] = row.participants[category] || 0
      })

      // Aggiungi le altre colonne
      rowData['Availability Left'] = row.vacancy_available
      rowData['Status'] = row.status
      rowData['Last Reservation Name'] = row.last_reservation?.name || ''
      rowData['Last Reservation ID'] = row.last_reservation?.id || ''
      rowData['Last Reservation Date'] = row.last_reservation ? new Date(row.last_reservation.date).toLocaleDateString('it-IT') : ''
      rowData['First Reservation Date'] = row.first_reservation ? new Date(row.first_reservation.date).toLocaleDateString('it-IT') : ''

      return rowData
    })

    // Sanitize data to prevent formula injection attacks
    const sanitizedData = sanitizeDataForExcel(exportData)

    // Crea un nuovo workbook
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(sanitizedData)

    // Aggiungi il foglio al workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Prenotazioni')

    // Genera il nome del file
    const fileName = `tourmageddon_export_${new Date().toISOString().split('T')[0]}.xlsx`

    // Scarica il file
    XLSX.writeFile(wb, fileName)
  }

  // Funzione per aggiornare i dati
  const handleRefresh = () => {
    fetchData()
  }

  if (loading) return <div className="p-4">Caricamento...</div>

  return (
    <div className="p-4">
      {/* Sezione Filtri */}
      <div className="mb-6 p-4 border rounded-lg bg-gray-50">
        <h3 className="text-lg font-semibold mb-4">Filtri</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Selezione Tour - Dropdown Single Select */}
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
                  {!selectedProduct || selectedProduct === ''
                    ? 'Tutti i tour' 
                    : products.find(p => p.activity_id === selectedProduct)?.title || 'Tour selezionato'
                  }
                </span>
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
                        {products.filter(p => p.title.toLowerCase().includes(searchTerm.toLowerCase())).length} risultati
                      </div>
                    )}
                    <div>
                      {/* Opzione per vedere tutti i tour */}
                      {(!searchTerm || 'tutti i tour'.includes(searchTerm.toLowerCase())) && (
                        <div 
                          className={`flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer border-b ${!selectedProduct ? 'bg-blue-50' : ''}`}
                          onClick={() => handleProductSelect('')}
                        >
                          <span className="text-sm font-medium">Tutti i tour</span>
                          {!selectedProduct && <Check className="h-4 w-4 text-blue-600" />}
                        </div>
                      )}
                      {/* Lista tour filtrati */}
                      {products
                        .filter(product => 
                          product.title.toLowerCase().includes(searchTerm.toLowerCase())
                        )
                        .map(product => (
                          <div 
                            key={product.activity_id} 
                            className={`flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer ${selectedProduct === product.activity_id ? 'bg-blue-50' : ''}`}
                            onClick={() => handleProductSelect(product.activity_id)}
                          >
                            <label className="text-sm cursor-pointer flex-1">
                              {searchTerm ? (
                                (() => {
                                  const parts = product.title.split(new RegExp(`(${searchTerm})`, 'gi'))
                                  return parts.map((part: string, index: number) => 
                                    part.toLowerCase() === searchTerm.toLowerCase() ? (
                                      <span key={index} className="bg-yellow-200">{part}</span>
                                    ) : (
                                      <span key={index}>{part}</span>
                                    )
                                  )
                                })()
                              ) : (
                                product.title
                              )}
                            </label>
                            {selectedProduct === product.activity_id && <Check className="h-4 w-4 text-blue-600" />}
                          </div>
                        ))}
                      {products.filter(product => 
                        product.title.toLowerCase().includes(searchTerm.toLowerCase())
                      ).length === 0 && searchTerm && !('tutti i tour'.includes(searchTerm.toLowerCase())) && (
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

        {/* Pulsanti Azione */}
        <div className="mt-4 flex gap-2">
          <Button 
            onClick={handleRefresh}
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

      {/* Info su risultati */}
      <div className="mb-2 text-sm text-gray-600">
        Mostrando {data.length} slot
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto shadow-lg">
        <table className="min-w-full bg-white border">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 border text-left">Product Title</th>
              <th className="px-4 py-2 border text-left">Date</th>
              <th className="px-4 py-2 border text-left">Start Time</th>
              <th className="px-4 py-2 border text-right">Total Amount</th>
              <th className="px-4 py-2 border text-center">Booking Count</th>
              <th className="px-4 py-2 border text-center bg-yellow-50">Total Participants</th>
              {/* Colonne dinamiche partecipanti */}
              {participantCategories.map(category => (
                <th key={category} className="px-4 py-2 border text-center bg-blue-50">
                  {category}
                </th>
              ))}
              <th className="px-4 py-2 border text-center">Availability Left</th>
              <th className="px-4 py-2 border text-center">Status</th>
              <th className="px-4 py-2 border text-left">Last Reservation</th>
              <th className="px-4 py-2 border text-left">First Reservation</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx} className={`hover:bg-gray-50 ${row.bookings.length === 0 ? 'bg-gray-50' : ''}`}>
                <td className="px-4 py-2 border">{row.product_title}</td>
                <td className="px-4 py-2 border">{formatDate(row.date)}</td>
                <td className="px-4 py-2 border">{formatTime(row.time)}</td>
                <td className="px-4 py-2 border text-right">
                  {row.total_amount > 0 ? `€${row.total_amount.toFixed(2)}` : '-'}
                </td>
                <td className="px-4 py-2 border text-center font-bold">
                  {row.bookings.length || 0}
                </td>
                <td className="px-4 py-2 border text-center font-bold bg-yellow-50">
                  {row.totalParticipants || 0}
                </td>
                {/* Valori partecipanti */}
                {participantCategories.map(category => (
                  <td key={category} className="px-4 py-2 border text-center bg-blue-50">
                    {row.participants[category] || 0}
                  </td>
                ))}
                <td className={`px-4 py-2 border text-center font-bold ${
                  row.vacancy_available === 0 ? 'text-red-600' :
                  row.vacancy_available <= 5 ? 'text-orange-600' : 
                  'text-green-600'
                }`}>
                  {row.vacancy_available}
                </td>
                <td className="px-4 py-2 border text-center">
                  <span className={`px-2 py-1 rounded text-xs ${getStatusColor(row.status)}`}>
                    {row.status || 'N/A'}
                  </span>
                </td>
                <td className="px-4 py-2 border text-sm">
                  {row.last_reservation ? (
                    <>
                      <div className="font-semibold">{row.last_reservation.name || 'N/A'}</div>
                      <div className="text-gray-500">{row.last_reservation.id}</div>
                      <div className="text-gray-400">{new Date(row.last_reservation.date).toLocaleDateString('it-IT')}</div>
                    </>
                  ) : '-'}
                </td>
                <td className="px-4 py-2 border text-sm text-gray-500">
                  {row.first_reservation ? new Date(row.first_reservation.date).toLocaleDateString('it-IT') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {data.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            Nessuna disponibilità trovata per i filtri selezionati
          </div>
        )}
      </div>
    </div>
  )
}