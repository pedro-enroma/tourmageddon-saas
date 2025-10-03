// src/components/MarketingExportPage.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Download, ChevronDown, ChevronUp, Search } from 'lucide-react'
import * as XLSX from 'xlsx'

// Funzione per rilevare la lingua dal titolo
const detectLanguage = (title: string): string => {
  const lowerTitle = title.toLowerCase()

  // Pattern comuni per diverse lingue
  const portuguesePatterns = ['passeio', 'cidade', 'dia', 'noite', 'praia', 'tour em', 'de dia', 'à noite']
  const spanishPatterns = ['paseo', 'ciudad', 'día', 'noche', 'playa', 'tour en', 'de día', 'por la noche']
  const englishPatterns = ['tour', 'city', 'day', 'night', 'beach', 'walking', 'guided', 'visit']

  // Controlla portoghese
  if (portuguesePatterns.some(pattern => lowerTitle.includes(pattern))) {
    return 'Portoghese'
  }

  // Controlla spagnolo
  if (spanishPatterns.some(pattern => lowerTitle.includes(pattern))) {
    return 'Spagnolo'
  }

  // Controlla inglese
  if (englishPatterns.some(pattern => lowerTitle.includes(pattern))) {
    return 'Inglese'
  }

  // Default a inglese se non rilevato
  return 'Inglese'
}

// Componente Dropdown Custom
const CustomDropdown = ({
  label,
  options,
  selected,
  onChange,
  placeholder = "Seleziona...",
  groupByLanguage = false
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  groupByLanguage?: boolean
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])
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

  // Raggruppa opzioni per lingua se necessario
  const groupedOptions = groupByLanguage
    ? options.reduce((acc, option) => {
        const lang = detectLanguage(option)
        if (!acc[lang]) acc[lang] = []
        acc[lang].push(option)
        return acc
      }, {} as Record<string, string[]>)
    : { 'Tutti': options }

  const availableLanguages = Object.keys(groupedOptions).sort()

  // Filtra opzioni per ricerca e lingua
  const filteredOptions = options.filter(option => {
    const matchesSearch = option.toLowerCase().includes(searchTerm.toLowerCase())
    if (!groupByLanguage || selectedLanguages.length === 0) return matchesSearch
    const lang = detectLanguage(option)
    return matchesSearch && selectedLanguages.includes(lang)
  })

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
    setSelectedLanguages([])
  }

  const toggleLanguageFilter = (lang: string) => {
    if (selectedLanguages.includes(lang)) {
      setSelectedLanguages(selectedLanguages.filter(l => l !== lang))
    } else {
      setSelectedLanguages([...selectedLanguages, lang])
    }
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

          {/* Filtri per lingua */}
          {groupByLanguage && availableLanguages.length > 1 && (
            <div className="p-2 border-b bg-gray-50">
              <div className="text-xs text-gray-600 mb-2">Filtra per lingua:</div>
              <div className="flex gap-2 flex-wrap">
                {availableLanguages.map(lang => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguageFilter(lang)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      selectedLanguages.includes(lang)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {lang} ({groupedOptions[lang]?.length || 0})
                  </button>
                ))}
              </div>
            </div>
          )}

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

interface ActivityData {
  activity_booking_id: string
  booking_id: string
  activity_id: string
  start_date_time: string
  total_price?: number
  activity_seller?: string
  status: string
  activities?: {
    title: string
  } | {
    title: string
  }[]
  pricing_category_bookings?: Array<{
    booked_title?: string
    quantity?: number
    passenger_first_name?: string
    passenger_last_name?: string
    passenger_date_of_birth?: string
  }>
  total_participants?: number
}

interface BookingRecord {
  booking_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone_number: string | null
  activities: ActivityData[]
}

export default function MarketingExport() {
  const [data, setData] = useState<BookingRecord[]>([])
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

  // Handler per gestire il conflitto tra selectedTours e excludedTours
  const handleSelectedToursChange = (tours: string[]) => {
    setSelectedTours(tours)
    // Rimuovi i tour selezionati dalla lista di esclusione
    if (tours.length > 0) {
      setExcludedTours(prev => prev.filter(t => !tours.includes(t)))
    }
  }

  const handleExcludedToursChange = (tours: string[]) => {
    setExcludedTours(tours)
    // Rimuovi i tour esclusi dalla lista di selezione
    if (tours.length > 0) {
      setSelectedTours(prev => prev.filter(t => !tours.includes(t)))
    }
  }

  useEffect(() => {
    loadFilterOptions()
  }, [])

  const loadFilterOptions = async () => {
    console.log('Loading filter options...')

    // Carica tutti i tour unici da activities table
    const { data: toursData, error: toursError } = await supabase
      .from('activities')
      .select('title')
      .not('title', 'is', null)
      .order('title')

    if (toursError) {
      console.error('Error loading tours:', toursError)
    } else if (toursData) {
      const uniqueTours = toursData.map((a: { title: string }) => a.title).filter(Boolean)
      setAllTours(uniqueTours)
      console.log('Loaded tours:', uniqueTours.length)
    }

    // Carica tutti i sellers unici
    const { data: sellersData, error: sellersError } = await supabase
      .from('activity_bookings')
      .select('activity_seller')
      .not('activity_seller', 'is', null)

    if (sellersError) {
      console.error('Error loading sellers:', sellersError)
    } else if (sellersData) {
      const uniqueSellers = [...new Set(sellersData.map((b: { activity_seller: string }) => b.activity_seller))].filter(Boolean)
      setAllSellers(uniqueSellers.sort())
      console.log('Loaded sellers:', uniqueSellers.length)
    }

    // Carica tutti i tipi di partecipanti
    const { data: categoriesData, error: categoriesError } = await supabase
      .from('pricing_category_bookings')
      .select('booked_title')
      .not('booked_title', 'is', null)

    if (categoriesError) {
      console.error('Error loading categories:', categoriesError)
    } else if (categoriesData) {
      const uniqueTypes = [...new Set(categoriesData.map((p: { booked_title: string }) => p.booked_title))].filter(Boolean)
      setAllParticipantTypes(uniqueTypes.sort())
      console.log('Loaded participant types:', uniqueTypes.length)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    setHasSearched(true)

    try {
      // 1. Recupera tutte le attività con join sulla tabella activities
      let query = supabase
        .from('activity_bookings')
        .select(`
          activity_booking_id,
          booking_id,
          activity_id,
          start_date_time,
          total_price,
          activity_seller,
          status,
          activities!inner (
            title
          ),
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

      if (selectedTours.length > 0) {
        query = query.in('activities.title', selectedTours)
      }
      if (excludedTours.length > 0) {
        excludedTours.forEach(tour => {
          query = query.neq('activities.title', tour)
        })
      }
      if (selectedSellers.length > 0) {
        query = query.in('activity_seller', selectedSellers)
      }

      const { data: activities, error: activitiesError } = await query
      if (activitiesError) {
        console.error('Error fetching activities:', activitiesError)
        setData([])
        setLoading(false)
        return
      }
      if (!activities || activities.length === 0) {
        setData([])
        setLoading(false)
        return
      }

      // 2. Get unique booking IDs from activities
      const bookingIds = [...new Set(activities.map(a => a.booking_id))]

      // 3. Recupera solo le relazioni booking_customers necessarie
      const { data: bookingCustomers, error: bcError } = await supabase
        .from('booking_customers')
        .select('booking_id, customer_id')
        .in('booking_id', bookingIds)
      if (bcError) {
        console.error('Error fetching booking_customers:', bcError)
        setData([])
        setLoading(false)
        return
      }

      // 4. Get unique customer IDs
      const customerIds = [...new Set(bookingCustomers.map(bc => bc.customer_id))]

      // 5. Recupera solo i customers necessari
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('customer_id, email, first_name, last_name, phone_number')
        .in('customer_id', customerIds)
      if (customersError) {
        console.error('Error fetching customers:', customersError)
        setData([])
        setLoading(false)
        return
      }

      // 6. Crea mappe per lookup veloce
      const bookingToCustomer = new Map();
      bookingCustomers.forEach(bc => {
        bookingToCustomer.set(String(bc.booking_id), bc.customer_id);
      });
      const customerMap = new Map();
      customers.forEach(c => {
        customerMap.set(String(c.customer_id), c);
      });

      // 7. Filtra per tipi partecipanti se necessario
      let filteredActivities = activities as ActivityData[];
      if (selectedParticipantTypes.length > 0) {
        filteredActivities = filteredActivities.filter(activity => {
          const activityParticipantTypes = activity.pricing_category_bookings?.map(p => p.booked_title) || [];
          return activityParticipantTypes.some(type => selectedParticipantTypes.includes(type || ''));
        });
      }

      // 8. Raggruppa per booking_id e collega i dati del cliente
      const bookingMap = new Map<string, BookingRecord>();
      filteredActivities.forEach(activity => {
        const bookingId = String(activity.booking_id);
        if (!bookingId) return;
        const bookingKey = `booking_${bookingId}`;
        if (!bookingMap.has(bookingKey)) {
          // Trova il customer_id tramite la tabella di relazione
          const customerId = bookingToCustomer.get(bookingId);
          // Trova i dati del cliente
          const customer = customerMap.get(String(customerId));
          bookingMap.set(bookingKey, {
            booking_id: bookingId,
            first_name: customer?.first_name || null,
            last_name: customer?.last_name || null,
            email: customer?.email || null,
            phone_number: customer?.phone_number || null,
            activities: []
          });
        }
        const bookingData = bookingMap.get(bookingKey)!;
        // Calcola totale partecipanti
        const totalParticipants = activity.pricing_category_bookings?.reduce((sum, p) => sum + (p.quantity || 1), 0) || 0;
        bookingData.activities.push({
          ...activity,
          total_participants: totalParticipants
        });
      });

      // 9. Converti in array e ordina
      const formattedData = Array.from(bookingMap.values())
        .map(booking => ({
          ...booking,
          activities: booking.activities.sort((a, b) => new Date(a.start_date_time).getTime() - new Date(b.start_date_time).getTime())
        }))
        .sort((a, b) => {
          const nameA = `${a.last_name} ${a.first_name}`.toLowerCase();
          const nameB = `${b.last_name} ${b.first_name}`.toLowerCase();
          return nameA.localeCompare(nameB);
        });
      setData(formattedData);
    } catch (error) {
      console.error('Unexpected error:', error);
      setData([]);
    } finally {
      setLoading(false);
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

  const getActivityTitle = (activity: ActivityData): string => {
    if (!activity.activities) return ''
    if (Array.isArray(activity.activities)) {
      return activity.activities[0]?.title || ''
    }
    return activity.activities.title || ''
  }

  const exportToExcel = () => {
    const exportData: Record<string, string | number>[] = []

    data.forEach(record => {
      record.activities.forEach(activity => {
        // Riga principale per l'attività
        const baseRow = {
          'Nome Cliente': record.first_name || '',
          'Cognome Cliente': record.last_name || '',
          'Email': record.email || '',
          'Telefono': record.phone_number || '',
          'Tour': getActivityTitle(activity),
          'Data e Ora': formatDate(activity.start_date_time),
          'Totale Partecipanti': activity.total_participants || 0,
          'Seller': activity.activity_seller || '',
          'Booking ID': activity.booking_id,
          'Activity Booking ID': activity.activity_booking_id
        }

        // Se ci sono dettagli partecipanti, crea una riga per ognuno
        if (activity.pricing_category_bookings && activity.pricing_category_bookings.length > 0) {
          activity.pricing_category_bookings.forEach(pax => {
            exportData.push({
              ...baseRow,
              'Tipo Partecipante': pax.booked_title || '',
              'Quantità': pax.quantity || 0,
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
            onChange={handleSelectedToursChange}
            placeholder="Seleziona tour..."
            groupByLanguage={true}
          />

          {/* Escludi Tour */}
          <CustomDropdown
            label="Escludi Tour"
            options={allTours}
            selected={excludedTours}
            onChange={handleExcludedToursChange}
            placeholder="Escludi tour..."
            groupByLanguage={true}
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
            <p className="text-lg">Pronto per la ricerca</p>
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
                    record.activities.map((activity, actIdx) => (
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
                          {getActivityTitle(activity)}
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