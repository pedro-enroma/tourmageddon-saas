/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function PivotTable() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<any[]>([])
  const [selectedProduct, setSelectedProduct] = useState('all')
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

  const loadAllProducts = async () => {
    const { data: allActivities, error } = await supabase
      .from('activities')
      .select('activity_id, title')
      .order('title')

    if (!error && allActivities) {
      setProducts(allActivities)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    
    // Prendi le prenotazioni - FILTRO AGGIORNATO per escludere ANCHE activity_bookings.status = CANCELLED
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
      .neq('status', 'CANCELLED')  // AGGIUNGI QUESTO: filtra anche activity_bookings.status
      .gte('start_date_time', `${dateRange.start}T00:00:00`)
      .lte('start_date_time', `${dateRange.end}T23:59:59`)

    if (selectedProduct !== 'all') {
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

    if (selectedProduct !== 'all') {
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
        if (!slot.participants[category]) {
          slot.participants[category] = 0
        }
        slot.participants[category] += pax.quantity || 1
        totalParticipants += pax.quantity || 1
      })

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
    finalData.forEach(row => {
      Object.keys(row.participants).forEach(cat => allCategories.add(cat))
    })

    const sortedCategories = Array.from(allCategories).sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()
      if (aLower.includes('adult')) return -1
      if (bLower.includes('adult')) return 1
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
        'Total Amount': row.total_amount > 0 ? row.total_amount : 0,
        'Booking Count': row.bookings.length
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

    // Crea un nuovo workbook
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(exportData)

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
      {/* Filtri e Azioni */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex gap-4 items-center">
          <label>Tour:</label>
          <select 
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="border rounded px-3 py-1 max-w-md"
          >
            <option value="all">Tutti i tour ({products.length})</option>
            {products.map(product => (
              <option key={product.activity_id} value={product.activity_id}>
                {product.title}
              </option>
            ))}
          </select>
          
          <label className="ml-4">Da:</label>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
            className="border rounded px-3 py-1"
          />
          
          <label>A:</label>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
            className="border rounded px-3 py-1"
          />
        </div>

        {/* Pulsanti azioni */}
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Aggiorna
          </button>
          
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
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