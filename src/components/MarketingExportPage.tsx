/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Download, ChevronDown, ChevronUp, Search } from 'lucide-react'
import * as XLSX from 'xlsx'

// Componente Dropdown Custom
const CustomDropdown = ({ 
  label, 
  options, 
  selected, 
  onChange,
  placeholder = "Seleziona..."
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Chiudi dropdown quando clicchi fuori
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleToggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(s => s !== option))
    } else {
      onChange([...selected, option])
    }
  }

  const selectAll = () => {
    onChange(filteredOptions)
    setSearchTerm('')
  }

  const clearAll = () => {
    onChange([])
    setSearchTerm('')
  }

  const getDisplayText = () => {
    if (selected.length === 0) return placeholder
    if (selected.length === 1) return selected[0]
    if (selected.length === options.length) return `Tutti (${selected.length})`
    return `${selected.length} selezionati`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className="text-left truncate">{getDisplayText()}</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg">
          {/* Barra di ricerca */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Cerca ${label.toLowerCase()}...`}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Pulsante Seleziona tutti */}
          <div className="p-2 border-b bg-gray-50">
            <button
              type="button"
              onClick={selectAll}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Seleziona tutti ({filteredOptions.length})
            </button>
            {selected.length > 0 && (
              <>
                <span className="mx-2 text-gray-400">|</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Deseleziona tutti
                </button>
              </>
            )}
          </div>

          {/* Lista opzioni */}
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-sm text-gray-500 text-center">
                Nessun risultato trovato
              </div>
            ) : (
              filteredOptions.map(option => (
                <label
                  key={option}
                  className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => handleToggle(option)}
                    className="mr-3 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 flex-1 truncate">{option}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function MarketingExport() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  
  // Liste di opzioni disponibili
  const [allTours, setAllTours] = useState<string[]>([])
  const [allSellers, setAllSellers] = useState<string[]>([])
  const [allParticipantTypes, setAllParticipantTypes] = useState<string[]>([])
  
  // Stati per i filtri
  const [selectedTours, setSelectedTours] = useState<string[]>([])
  const [excludedTours, setExcludedTours] = useState<string[]>([])
  const [selectedParticipantTypes, setSelectedParticipantTypes] = useState<string[]>([])
  const [selectedSellers, setSelectedSellers] = useState<string[]>([])
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  })

  useEffect(() => {
    loadFilterOptions()
  }, [])

  const loadFilterOptions = async () => {
    console.log('Loading filter options...')
    
    // Carica tutti i tour unici da activity_bookings
    const { data: bookingsData, error: toursError } = await supabase
      .from('activity_bookings')
      .select('product_title')
      .not('product_title', 'is', null)
      .order('product_title')
    
    if (toursError) {
      console.error('Error loading tours:', toursError)
    } else if (bookingsData) {
      const uniqueTours = [...new Set(bookingsData.map(b => b.product_title))].filter(Boolean)
      setAllTours(uniqueTours)
      console.log('Loaded tours:', uniqueTours.length)
    }

    // Carica tutti i sellers unici
    const { data: sellersData, error: sellersError } = await supabase
      .from('activity_bookings')
      .select('activity_seller')
      .not('activity_seller', 'is', null)
      .order('activity_seller')
      
    if (sellersError) {
      console.error('Error loading sellers:', sellersError)
    } else if (sellersData) {
      const uniqueSellers = [...new Set(sellersData.map(b => b.activity_seller))].filter(Boolean)
      setAllSellers(uniqueSellers)
      console.log('Loaded sellers:', uniqueSellers.length)
    }

    // Carica tutti i tipi di partecipanti
    const { data: categoriesData, error: categoriesError } = await supabase
      .from('pricing_category_bookings')
      .select('booked_title')
      .not('booked_title', 'is', null)
      .order('booked_title')
    
    if (categoriesError) {
      console.error('Error loading categories:', categoriesError)
    } else if (categoriesData) {
      const uniqueTypes = [...new Set(categoriesData.map(p => p.booked_title))].filter(Boolean)
      setAllParticipantTypes(uniqueTypes)
      console.log('Loaded participant types:', uniqueTypes.length)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    setHasSearched(true)
    
    try {
      // Query semplice senza cercare campi che non esistono
      let query = supabase
        .from('activity_bookings')
        .select(`
          activity_booking_id,
          booking_id,
          product_title,
          start_date_time,
          total_price,
          activity_seller,
          status,
          pricing_category_bookings (
            booked_title,
            quantity,
            passenger_first_name,
            passenger_last_name,
            passenger_date_of_birth
          )
        `)
        .neq('status', 'CANCELLED')
        .gte('start_date_time', `${dateRange.start}T00:00:00`)
        .lte('start_date_time', `${dateRange.end}T23:59:59`)

      // Applica filtro tour inclusi
      if (selectedTours.length > 0) {
        query = query.in('product_title', selectedTours)
      }

      // Applica filtro tour esclusi
      if (excludedTours.length > 0) {
        query = query.not('product_title', 'in', `(${excludedTours.join(',')})`)
      }

      // Applica filtro sellers
      if (selectedSellers.length > 0) {
        query = query.in('activity_seller', selectedSellers)
      }

      const { data: activities, error } = await query

      if (error) {
        console.error('Error fetching data:', error)
        setData([])
        setLoading(false)
        return
      }

      console.log('Sample activity data:', activities?.[0])
      console.log('Sample pricing_category_bookings:', activities?.[0]?.pricing_category_bookings)

      if (!activities || activities.length === 0) {
        setData([])
        setLoading(false)
        return
      }

      // Filtra per tipi partecipanti se necessario
      let filteredActivities = activities
      
      if (selectedParticipantTypes.length > 0) {
        filteredActivities = filteredActivities.filter(activity => {
          const activityParticipantTypes = activity.pricing_category_bookings?.map((p: any) => p.booked_title) || []
          return activityParticipantTypes.some((type: string) => selectedParticipantTypes.includes(type))
        })
      }

      // Raggruppa per booking_id
      const bookingMap = new Map()

      filteredActivities.forEach(activity => {
        const bookingId = activity.booking_id
        
        if (!bookingId) {
          console.log('No booking_id for activity:', activity)
          return
        }
        
        const bookingKey = `booking_${bookingId}`
        
        if (!bookingMap.has(bookingKey)) {
          // Inizializza con dati di default
          bookingMap.set(bookingKey, {
            booking_id: bookingId,
            first_name: null,
            last_name: null,
            email: null,
            phone_number: null,
            activities: []
          })
        }
        
        const bookingData = bookingMap.get(bookingKey)
        
        // Se non abbiamo ancora un nome, prova con i partecipanti
        if (!bookingData.first_name && activity.pricing_category_bookings && activity.pricing_category_bookings.length > 0) {
          for (const passenger of activity.pricing_category_bookings) {
            if (passenger.passenger_first_name && passenger.passenger_first_name.trim() !== '') {
              bookingData.first_name = bookingData.first_name || passenger.passenger_first_name
              bookingData.last_name = bookingData.last_name || passenger.passenger_last_name || ''
              break
            }
          }
        }
        
        // Se ancora non abbiamo nomi, usa il booking ID
        if (!bookingData.first_name) {
          bookingData.first_name = `Booking`
          bookingData.last_name = `#${bookingId}`
        }

        // Calcola totale partecipanti
        const totalParticipants = activity.pricing_category_bookings?.reduce((sum: number, p: any) => 
          sum + (p.quantity || 1), 0
        ) || 0

        bookingData.activities.push({
          ...activity,
          total_participants: totalParticipants
        })
      })

      // Converti in array e ordina
      const formattedData = Array.from(bookingMap.values())
        .map(booking => ({
          ...booking,
          activities: booking.activities.sort((a: any, b: any) => 
            new Date(a.start_date_time).getTime() - new Date(b.start_date_time).getTime()
          )
        }))
        .sort((a, b) => {
          const nameA = `${a.last_name} ${a.first_name}`.toLowerCase()
          const nameB = `${b.last_name} ${b.first_name}`.toLowerCase()
          return nameA.localeCompare(nameB)
        })

      console.log('Final bookings with customers:', formattedData.length)
      setData(formattedData)
    } catch (error) {
      console.error('Unexpected error:', error)
      setData([])
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('it-IT', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const exportToExcel = () => {
    const exportData: any[] = []
    
    data.forEach(record => {
      record.activities.forEach((activity: any) => {
        // Riga principale per l'attività
        const baseRow = {
          'Nome Cliente': record.first_name || '',
          'Cognome Cliente': record.last_name || '',
          'Email': record.email || '',
          'Telefono': record.phone_number || '',
          'Tour': activity.product_title,
          'Data e Ora': formatDate(activity.start_date_time),
          'Totale Partecipanti': activity.total_participants,
          'Seller': activity.activity_seller || '',
          'Booking ID': activity.booking_id,
          'Activity Booking ID': activity.activity_booking_id
        }

        // Se ci sono dettagli partecipanti, crea una riga per ognuno
        if (activity.pricing_category_bookings && activity.pricing_category_bookings.length > 0) {
          activity.pricing_category_bookings.forEach((pax: any) => {
            exportData.push({
              ...baseRow,
              'Tipo Partecipante': pax.booked_title,
              'Quantità': pax.quantity,
              'Nome Passeggero': pax.passenger_first_name || '',
              'Cognome Passeggero': pax.passenger_last_name || '',
              'Data Nascita': pax.passenger_date_of_birth || ''
            })
          })
        } else {
          exportData.push(baseRow)
        }
      })
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(exportData)
    XLSX.utils.book_append_sheet(wb, ws, 'Marketing Export')
    const fileName = `marketing_export_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  const handleRefresh = () => {
    fetchData()
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Sezione Filtri */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-6">Filtri</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Seleziona Tour */}
          <CustomDropdown
            label="Seleziona Tour"
            options={allTours}
            selected={selectedTours}
            onChange={setSelectedTours}
            placeholder="Seleziona tour..."
          />

          {/* Escludi Tour */}
          <CustomDropdown
            label="Escludi Tour"
            options={allTours}
            selected={excludedTours}
            onChange={setExcludedTours}
            placeholder="Escludi tour..."
          />

          {/* Tipo Partecipanti */}
          <CustomDropdown
            label="Tipo Partecipanti"
            options={allParticipantTypes}
            selected={selectedParticipantTypes}
            onChange={setSelectedParticipantTypes}
            placeholder="Tipo partecipanti..."
          />

          {/* Sellers */}
          <CustomDropdown
            label="Sellers"
            options={allSellers}
            selected={selectedSellers}
            onChange={setSelectedSellers}
            placeholder="Seleziona sellers..."
          />

          {/* Data Inizio */}
          <div>
            <label className="block text-sm font-medium mb-1">Data Inizio</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Data Fine */}
          <div>
            <label className="block text-sm font-medium mb-1">Data Fine</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Pulsanti Azioni */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Aggiorna
          </button>
          
          <button
            onClick={exportToExcel}
            disabled={!hasSearched || data.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Sezione Risultati */}
      {!hasSearched ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center text-gray-500">
            <p className="text-lg">Nessun dato trovato per i filtri selezionati</p>
            <p className="text-sm mt-2">Seleziona i filtri e clicca &quot;Aggiorna&quot; per visualizzare i dati</p>
          </div>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Caricamento in corso...</p>
          </div>
        </div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center text-gray-500">
            <p className="text-lg">Nessun risultato trovato</p>
            <p className="text-sm mt-2">Prova a modificare i filtri di ricerca</p>
          </div>
        </div>
      ) : (
        <>
          {/* Tabella Risultati */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <p className="text-sm text-gray-600">
                Trovate <span className="font-semibold text-gray-900">{data.length}</span> prenotazioni con{' '}
                <span className="font-semibold text-gray-900">
                  {data.reduce((sum, r) => sum + r.activities.length, 0)}
                </span>{' '}
                attività totali
              </p>
            </div>

            {/* Header Tabella */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contatti
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tour
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data/Ora
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Partecipanti
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Seller
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((record, recordIdx) => (
                    record.activities.map((activity: any, actIdx: number) => (
                      <tr key={`${recordIdx}-${actIdx}`} className="hover:bg-gray-50">
                        {actIdx === 0 && (
                          <>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900" rowSpan={record.activities.length}>
                              {record.first_name} {record.last_name}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500" rowSpan={record.activities.length}>
                              <div>{record.email || 'N/A'}</div>
                              <div className="text-xs">{record.phone_number || 'N/A'}</div>
                            </td>
                          </>
                        )}
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {activity.product_title}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(activity.start_date_time)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {activity.total_participants}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {activity.activity_seller || '-'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-400">
                          <div>Booking ID: {activity.booking_id}</div>
                          <div>Activity: {activity.activity_booking_id}</div>
                        </td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}