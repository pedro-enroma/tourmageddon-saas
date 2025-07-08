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
    
    // Query unica ottimizzata
    let query = supabase
      .from('activity_availability')
      .select(`
        *,
        activities!inner (
          activity_id,
          title
        ),
        activity_bookings!left (
          activity_booking_id,
          booking_id,
          total_price,
          bookings!inner (
            status,
            confirmation_code,
            creation_date
          ),
          pricing_category_bookings (
            booked_title,
            quantity,
            passenger_first_name,
            passenger_last_name
          )
        )
      `)
      .gte('local_date', dateRange.start)
      .lte('local_date', dateRange.end)
      .order('local_date_time', { ascending: true })

    // Filtra per prodotto se selezionato
    if (selectedProduct !== 'all') {
      query = query.eq('activity_id', selectedProduct)
    }

    // Aggiungi filtro per escludere le prenotazioni cancellate
    query = query.or('activity_bookings.bookings.status.neq.CANCELLED,activity_bookings.id.is.null')

    const { data: results, error } = await query

    if (error) {
      console.error('Errore query:', error)
      setLoading(false)
      return
    }

    // Processa i risultati
    const processedData = results?.map(slot => {
      // Filtra solo le prenotazioni valide (non cancellate)
      const validBookings = slot.activity_bookings?.filter(
        (booking: any) => booking.bookings?.status !== 'CANCELLED'
      ) || []

      // Calcola totali e partecipanti
      let totalAmount = 0
      const participants: any = {}
      let lastReservation = null
      let firstReservation = null

      validBookings.forEach((booking: any) => {
        totalAmount += booking.total_price || 0

        // Conta partecipanti
        booking.pricing_category_bookings?.forEach((pax: any) => {
          const category = pax.booked_title || 'Unknown'
          participants[category] = (participants[category] || 0) + (pax.quantity || 1)
        })

        // Traccia prima e ultima prenotazione
        if (booking.bookings) {
          const bookingDate = new Date(booking.bookings.creation_date)
          
          if (!firstReservation || bookingDate < new Date(firstReservation.date)) {
            firstReservation = {
              date: booking.bookings.creation_date,
              id: booking.bookings.confirmation_code
            }
          }
          
          if (!lastReservation || bookingDate > new Date(lastReservation.date)) {
            lastReservation = {
              date: booking.bookings.creation_date,
              id: booking.bookings.confirmation_code,
              name: (booking.pricing_category_bookings?.[0]?.passenger_first_name || '') + ' ' + 
                    (booking.pricing_category_bookings?.[0]?.passenger_last_name || '')
            }
          }
        }
      })

      return {
        product_title: slot.activities.title,
        activity_id: slot.activity_id,
        date: slot.local_date,
        time: slot.local_time.substring(0, 5),
        date_time: slot.local_date_time,
        vacancy_available: slot.vacancy_available || 0,
        status: slot.status,
        bookings: validBookings,
        total_amount: totalAmount,
        participants: participants,
        last_reservation: lastReservation,
        first_reservation: firstReservation
      }
    }) || []

    // Estrai categorie partecipanti
    const allCategories = new Set<string>()
    processedData.forEach(row => {
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
    setData(processedData)
    setLoading(false)
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