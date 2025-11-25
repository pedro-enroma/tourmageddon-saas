// src/components/MarketingExportPage.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Download, ChevronDown, ChevronUp, Search, Tags, X, Plus, Trash2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { sanitizeDataForExcel } from '@/lib/security/sanitize'

// Tipi per le categorie
interface TourCategory {
  name: string
  tours: string[]
}

// Funzione per ottenere la categoria di un tour
const getTourCategory = (tourTitle: string, categories: TourCategory[]): string | null => {
  for (const category of categories) {
    if (category.tours.includes(tourTitle)) {
      return category.name
    }
  }
  return null
}

// Componente Dropdown Custom
const CustomDropdown = ({
  label,
  options,
  selected,
  onChange,
  placeholder = "Seleziona...",
  groupByCategory = false,
  categories = []
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  groupByCategory?: boolean
  categories?: TourCategory[]
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
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

  // Raggruppa opzioni per categoria se necessario
  const groupedOptions = groupByCategory
    ? categories.reduce((acc, category) => {
        acc[category.name] = category.tours.filter(tour => options.includes(tour))
        return acc
      }, {} as Record<string, string[]>)
    : { 'Tutti': options }

  // Aggiungi tours senza categoria
  if (groupByCategory) {
    const uncategorized = options.filter(opt => !getTourCategory(opt, categories))
    if (uncategorized.length > 0) {
      groupedOptions['Senza Categoria'] = uncategorized
    }
  }

  const availableCategories = Object.keys(groupedOptions).sort()

  // Filtra opzioni per ricerca e categoria
  const filteredOptions = options.filter(option => {
    const matchesSearch = option.toLowerCase().includes(searchTerm.toLowerCase())
    if (!groupByCategory || selectedCategories.length === 0) return matchesSearch
    const category = getTourCategory(option, categories)
    return matchesSearch && (
      selectedCategories.includes(category || 'Senza Categoria')
    )
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
    setSelectedCategories([])
  }

  const toggleCategoryFilter = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(c => c !== category))
    } else {
      setSelectedCategories([...selectedCategories, category])
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

          {/* Filtri per categoria */}
          {groupByCategory && availableCategories.length > 1 && (
            <div className="p-2 border-b bg-gray-50">
              <div className="text-xs text-gray-600 mb-2">Filtra per categoria:</div>
              <div className="flex gap-2 flex-wrap">
                {availableCategories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategoryFilter(cat)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      selectedCategories.includes(cat)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {cat} ({groupedOptions[cat]?.length || 0})
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

// Modal per gestire le categorie
const CategoryManagementModal = ({
  allTours,
  categories,
  onSave,
  onClose
}: {
  allTours: string[]
  categories: TourCategory[]
  onSave: (cats: TourCategory[]) => void
  onClose: () => void
}) => {
  const [localCategories, setLocalCategories] = useState<TourCategory[]>([...categories])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategory, setEditingCategory] = useState<string | null>(null)

  const addCategory = () => {
    if (newCategoryName.trim() && !localCategories.find(c => c.name === newCategoryName.trim())) {
      setLocalCategories([...localCategories, { name: newCategoryName.trim(), tours: [] }])
      setNewCategoryName('')
    }
  }

  const deleteCategory = (categoryName: string) => {
    setLocalCategories(localCategories.filter(c => c.name !== categoryName))
    if (editingCategory === categoryName) {
      setEditingCategory(null)
    }
  }

  const toggleTourInCategory = (categoryName: string, tourTitle: string) => {
    setLocalCategories(localCategories.map(cat => {
      if (cat.name === categoryName) {
        if (cat.tours.includes(tourTitle)) {
          return { ...cat, tours: cat.tours.filter(t => t !== tourTitle) }
        } else {
          // Rimuovi il tour da altre categorie e aggiungilo a questa
          return { ...cat, tours: [...cat.tours, tourTitle] }
        }
      }
      // Rimuovi il tour da tutte le altre categorie
      return { ...cat, tours: cat.tours.filter(t => t !== tourTitle) }
    }))
  }

  const handleSave = () => {
    onSave(localCategories)
    onClose()
  }

  const getTourCategory = (tourTitle: string): string | null => {
    for (const cat of localCategories) {
      if (cat.tours.includes(tourTitle)) {
        return cat.name
      }
    }
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-2xl font-semibold">Gestione Categorie Tour</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Colonna Sinistra: Gestione Categorie */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Categorie</h3>

              {/* Aggiungi nuova categoria */}
              <div className="mb-4 flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addCategory()}
                  placeholder="Nome nuova categoria..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={addCategory}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Aggiungi
                </button>
              </div>

              {/* Lista categorie */}
              <div className="space-y-2">
                {localCategories.map(category => (
                  <div
                    key={category.name}
                    className={`p-3 border rounded-md cursor-pointer transition-colors ${
                      editingCategory === category.name
                        ? 'border-purple-600 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-300'
                    }`}
                    onClick={() => {
                      setEditingCategory(category.name)
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{category.name}</div>
                        <div className="text-sm text-gray-500">{category.tours.length} tour</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteCategory(category.name)
                        }}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Colonna Destra: Assegnazione Tour */}
            <div>
              <h3 className="text-lg font-semibold mb-4">
                {editingCategory ? `Assegna tour a "${editingCategory}"` : 'Seleziona una categoria'}
              </h3>

              {editingCategory ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {allTours.map(tour => {
                    const tourCat = getTourCategory(tour)
                    const isInThisCategory = tourCat === editingCategory
                    const isInOtherCategory = tourCat && tourCat !== editingCategory

                    return (
                      <label
                        key={tour}
                        className={`flex items-start p-2 border rounded-md cursor-pointer transition-colors ${
                          isInThisCategory
                            ? 'border-purple-600 bg-purple-50'
                            : isInOtherCategory
                            ? 'border-gray-300 bg-gray-50'
                            : 'border-gray-200 hover:border-purple-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isInThisCategory}
                          onChange={() => toggleTourInCategory(editingCategory, tour)}
                          className="mt-1 mr-3 h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                        <div className="flex-1">
                          <div className="text-sm">{tour}</div>
                          {isInOtherCategory && (
                            <div className="text-xs text-gray-500 mt-1">
                              Attualmente in: {tourCat}
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <div className="text-gray-500 text-center py-8">
                  Seleziona una categoria a sinistra per assegnare i tour
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Salva Modifiche
          </button>
        </div>
      </div>
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

  // Stati per le categorie
  const [tourCategories, setTourCategories] = useState<TourCategory[]>([])
  const [showCategoryModal, setShowCategoryModal] = useState(false)

  // Stati per i filtri
  const [selectedTours, setSelectedTours] = useState<string[]>([])
  const [excludedTours, setExcludedTours] = useState<string[]>([])
  const [selectedParticipantTypes, setSelectedParticipantTypes] = useState<string[]>([])
  const [selectedSellers, setSelectedSellers] = useState<string[]>([])
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  })

  // Carica le categorie da localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tourCategories')
    if (saved) {
      try {
        setTourCategories(JSON.parse(saved))
      } catch (e) {
        console.error('Error loading categories:', e)
      }
    }
  }, [])

  // Salva le categorie in localStorage
  const saveCategories = (cats: TourCategory[]) => {
    setTourCategories(cats)
    localStorage.setItem('tourCategories', JSON.stringify(cats))
  }

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

    // Sanitize data to prevent formula injection attacks
    const sanitizedData = sanitizeDataForExcel(exportData)

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(sanitizedData)
    XLSX.utils.book_append_sheet(wb, ws, 'Marketing Export')
    const fileName = `marketing_export_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  const handleRefresh = () => {
    fetchData()
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Modal Gestione Categorie */}
      {showCategoryModal && (
        <CategoryManagementModal
          allTours={allTours}
          categories={tourCategories}
          onSave={saveCategories}
          onClose={() => setShowCategoryModal(false)}
        />
      )}

      {/* Sezione Filtri */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Filtri</h2>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
          >
            <Tags className="w-4 h-4" />
            Gestisci Categorie
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Seleziona Tour */}
          <CustomDropdown
            label="Seleziona Tour"
            options={allTours}
            selected={selectedTours}
            onChange={handleSelectedToursChange}
            placeholder="Seleziona tour..."
            groupByCategory={tourCategories.length > 0}
            categories={tourCategories}
          />

          {/* Escludi Tour */}
          <CustomDropdown
            label="Escludi Tour"
            options={allTours}
            selected={excludedTours}
            onChange={handleExcludedToursChange}
            placeholder="Escludi tour..."
            groupByCategory={tourCategories.length > 0}
            categories={tourCategories}
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