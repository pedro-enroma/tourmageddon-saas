'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { vouchersApi } from '@/lib/api-client'
import { Upload, FileText, Check, AlertTriangle, X, ChevronDown, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface ExtractedTicket {
  ticket_code: string
  holder_name: string
  ticket_type: string
  price: number
}

interface ExtractedVoucher {
  booking_number: string
  booking_date: string | null
  visit_date: string
  entry_time: string
  product_name: string
  tickets: ExtractedTicket[]
}

interface TicketCategory {
  id: string
  name: string
  guide_requires_ticket?: boolean
}

interface AssignedGuide {
  guide_id: string
  first_name: string
  last_name: string
}

interface ActivityAvailability {
  id: number
  activity_id: string
  local_date: string
  local_time: string
  activities?: { title: string }
}

interface PricingCategoryBooking {
  pricing_category_booking_id: number
  booked_title: string
  passenger_first_name: string
  passenger_last_name: string
}

interface ValidationResult {
  ticket: ExtractedTicket
  matchedParticipant: PricingCategoryBooking | null
  matchedGuide: AssignedGuide | null
  nameMatch: boolean
  typeMatch: boolean
  isGuideTicket: boolean
  warnings: string[]
}

interface TicketTypeMapping {
  ticket_type: string
  booked_titles: string[]
}

export default function VoucherUploadPage() {
  // State
  const [file, setFile] = useState<File | null>(null)
  // uploading state removed - not currently used
  const [extracting, setExtracting] = useState(false)
  const [extractedData, setExtractedData] = useState<ExtractedVoucher | null>(null)
  const [extractionWarning, setExtractionWarning] = useState<string | null>(null)
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [availabilities, setAvailabilities] = useState<ActivityAvailability[]>([])
  const [selectedAvailabilityId, setSelectedAvailabilityId] = useState<number | null>(null)
  const [participants, setParticipants] = useState<PricingCategoryBooking[]>([])
  const [typeMappings, setTypeMappings] = useState<TicketTypeMapping[]>([])
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [searchAvailability, setSearchAvailability] = useState('')
  const [showOnlyWithBookings, setShowOnlyWithBookings] = useState(true)
  const [availabilityBookingCounts, setAvailabilityBookingCounts] = useState<Map<number, number>>(new Map())
  const [assignedGuides, setAssignedGuides] = useState<AssignedGuide[]>([])
  const [categoryGuideRequiresTicket, setCategoryGuideRequiresTicket] = useState(false)

  // Helper function to normalize names (remove diacritics/accents)
  const normalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .trim()
  }

  // Load categories on mount
  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('ticket_categories')
      .select('id, name, guide_requires_ticket')
      .order('name')
    setCategories(data || [])
  }

  // Fetch availabilities when category and visit date are set
  const fetchAvailabilities = useCallback(async () => {
    if (!extractedData?.visit_date || !selectedCategoryId) return

    // Get activities mapped to this category
    const { data: mappings } = await supabase
      .from('product_activity_mappings')
      .select('activity_id')
      .eq('category_id', selectedCategoryId)

    if (!mappings || mappings.length === 0) {
      setAvailabilities([])
      return
    }

    const activityIds = mappings.map(m => m.activity_id)

    // Get availabilities for those activities on the visit date
    const { data } = await supabase
      .from('activity_availability')
      .select(`
        id,
        activity_id,
        local_date,
        local_time,
        activities (title)
      `)
      .in('activity_id', activityIds)
      .eq('local_date', extractedData.visit_date)
      .order('local_time')

    // Transform data to match interface (activities comes as array from Supabase)
    const transformed: ActivityAvailability[] = (data || []).map(item => ({
      id: item.id,
      activity_id: item.activity_id,
      local_date: item.local_date,
      local_time: item.local_time,
      activities: Array.isArray(item.activities)
        ? (item.activities[0] as { title: string } | undefined)
        : (item.activities as { title: string } | undefined)
    }))
    setAvailabilities(transformed)

    // Fetch booking counts for each availability (per time slot)
    const countsMap = new Map<number, number>()

    for (const avail of transformed) {
      // Parse the time to create a 1-minute window
      const [hours, minutes] = avail.local_time.split(':')
      const startTime = `${avail.local_date}T${hours}:${minutes}:00`
      const endTime = `${avail.local_date}T${hours}:${minutes}:59.999`

      const { count } = await supabase
        .from('activity_bookings')
        .select('activity_booking_id', { count: 'exact', head: true })
        .eq('activity_id', avail.activity_id)
        .gte('start_date_time', startTime)
        .lte('start_date_time', endTime)
        .in('status', ['CONFIRMED', 'COMPLETED'])

      countsMap.set(avail.id, count || 0)
    }

    setAvailabilityBookingCounts(countsMap)
  }, [extractedData?.visit_date, selectedCategoryId])

  useEffect(() => {
    fetchAvailabilities()
  }, [fetchAvailabilities])

  // Fetch participants and assigned guides when availability is selected
  const fetchParticipants = useCallback(async () => {
    if (!selectedAvailabilityId) {
      setParticipants([])
      setAssignedGuides([])
      setValidationResults([])
      return
    }

    // Find the selected availability to get activity_id, date and time
    const selectedAvail = availabilities.find(a => a.id === selectedAvailabilityId)
    if (!selectedAvail) {
      setParticipants([])
      setAssignedGuides([])
      setValidationResults([])
      return
    }

    // Fetch assigned guides for this availability
    const { data: guideAssignments } = await supabase
      .from('guide_assignments')
      .select(`
        guide:guides (guide_id, first_name, last_name)
      `)
      .eq('activity_availability_id', selectedAvailabilityId)

    const guides: AssignedGuide[] = (guideAssignments || [])
      .map(ga => {
        const guide = Array.isArray(ga.guide) ? ga.guide[0] : ga.guide
        return guide ? {
          guide_id: guide.guide_id,
          first_name: guide.first_name,
          last_name: guide.last_name
        } : null
      })
      .filter((g): g is AssignedGuide => g !== null)

    setAssignedGuides(guides)

    // Parse the time to create a 1-minute window
    const [hours, minutes] = selectedAvail.local_time.split(':')
    const startTime = `${selectedAvail.local_date}T${hours}:${minutes}:00`
    const endTime = `${selectedAvail.local_date}T${hours}:${minutes}:59.999`

    // Get activity_bookings for this specific time slot
    const { data: bookings } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id')
      .eq('activity_id', selectedAvail.activity_id)
      .gte('start_date_time', startTime)
      .lte('start_date_time', endTime)
      .in('status', ['CONFIRMED', 'COMPLETED'])

    if (!bookings || bookings.length === 0) {
      setParticipants([])
      setValidationResults([])
      return
    }

    const bookingIds = bookings.map(b => b.activity_booking_id)

    const { data: pricingData } = await supabase
      .from('pricing_category_bookings')
      .select('pricing_category_booking_id, booked_title, passenger_first_name, passenger_last_name')
      .in('activity_booking_id', bookingIds)

    setParticipants(pricingData || [])
  }, [selectedAvailabilityId, availabilities])

  useEffect(() => {
    fetchParticipants()
  }, [fetchParticipants])

  // Fetch type mappings for validation
  const fetchTypeMappings = useCallback(async () => {
    if (!selectedCategoryId || !selectedAvailabilityId) {
      setTypeMappings([])
      return
    }

    // Get activity_id from selected availability
    const { data: availData } = await supabase
      .from('activity_availability')
      .select('activity_id')
      .eq('id', selectedAvailabilityId)
      .single()

    if (!availData) return

    const { data } = await supabase
      .from('ticket_type_mappings')
      .select('ticket_type, booked_titles')
      .eq('category_id', selectedCategoryId)
      .eq('activity_id', availData.activity_id)

    setTypeMappings(data || [])
  }, [selectedCategoryId, selectedAvailabilityId])

  useEffect(() => {
    fetchTypeMappings()
  }, [fetchTypeMappings])

  // Update categoryGuideRequiresTicket when category changes
  useEffect(() => {
    if (selectedCategoryId) {
      const selectedCategory = categories.find(c => c.id === selectedCategoryId)
      setCategoryGuideRequiresTicket(selectedCategory?.guide_requires_ticket ?? false)
    } else {
      setCategoryGuideRequiresTicket(false)
    }
  }, [selectedCategoryId, categories])

  // Validate tickets against participants and guides
  useEffect(() => {
    if (!extractedData?.tickets) {
      setValidationResults([])
      return
    }

    // Can validate even with no participants if we have guides assigned
    if (participants.length === 0 && assignedGuides.length === 0) {
      setValidationResults([])
      return
    }

    const results: ValidationResult[] = extractedData.tickets.map(ticket => {
      const warnings: string[] = []
      const ticketNameNormalized = normalizeText(ticket.holder_name)

      // Check if this is a guide ticket (ticket type contains "guide" or similar patterns)
      const isGuideTicket = ticket.ticket_type.toLowerCase().includes('guide') ||
                           ticket.ticket_type.toLowerCase().includes('guia') ||
                           ticket.ticket_type.toLowerCase().includes('guías')

      let matchedParticipant: PricingCategoryBooking | null = null
      let matchedGuide: AssignedGuide | null = null
      let nameMatch = false
      let typeMatch = false

      if (isGuideTicket && categoryGuideRequiresTicket) {
        // For guide tickets, match against assigned guides
        matchedGuide = assignedGuides.find(g => {
          const guideFullName = normalizeText(`${g.first_name} ${g.last_name}`)
          return guideFullName === ticketNameNormalized
        }) || null

        nameMatch = !!matchedGuide
        typeMatch = nameMatch // For guide tickets, type match is same as name match

        if (!nameMatch) {
          if (assignedGuides.length === 0) {
            warnings.push(`No guides assigned to this tour slot`)
          } else {
            const guideNames = assignedGuides.map(g => `${g.first_name} ${g.last_name}`).join(', ')
            warnings.push(`Guide "${ticket.holder_name}" not found in assigned guides (${guideNames})`)
          }
        }
      } else {
        // For regular tickets, match against participants
        matchedParticipant = participants.find(p => {
          const fullName = normalizeText(`${p.passenger_first_name} ${p.passenger_last_name}`)
          return fullName === ticketNameNormalized
        }) || null

        nameMatch = !!matchedParticipant

        if (!nameMatch) {
          warnings.push(`Name "${ticket.holder_name}" not found in booking participants`)
        }

        // Check ticket type mapping for non-guide tickets
        if (matchedParticipant) {
          const mapping = typeMappings.find(m => m.ticket_type === ticket.ticket_type)
          if (mapping) {
            typeMatch = mapping.booked_titles.includes(matchedParticipant.booked_title)
            if (!typeMatch) {
              warnings.push(`Ticket type "${ticket.ticket_type}" doesn't match participant category "${matchedParticipant.booked_title}"`)
            }
          } else {
            warnings.push(`No mapping found for ticket type "${ticket.ticket_type}"`)
          }
        }
      }

      return {
        ticket,
        matchedParticipant,
        matchedGuide,
        nameMatch,
        typeMatch,
        isGuideTicket,
        warnings
      }
    })

    setValidationResults(results)
  }, [extractedData?.tickets, participants, assignedGuides, typeMappings, categoryGuideRequiresTicket])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile)
      setExtractedData(null)
      setError(null)
      setSuccess(false)
    } else {
      setError('Please select a PDF file')
    }
  }

  const handleExtract = async () => {
    if (!file) return

    setExtracting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/tickets/extract', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to extract data')
      }

      setExtractedData(result.data)
      setExtractionWarning(result.warning || null)

      // Auto-detect category based on product name from mappings
      const productName = result.data.product_name || ''

      if (productName) {
        // First try exact match from product_activity_mappings
        // Use .limit(1) without .single() to avoid errors when multiple rows exist
        const { data: mappings } = await supabase
          .from('product_activity_mappings')
          .select('category_id')
          .eq('product_name', productName)
          .limit(1)

        const mapping = mappings?.[0]
        if (mapping?.category_id) {
          setSelectedCategoryId(mapping.category_id)
        } else {
          // Fallback: check ticket_categories.product_names array
          const { data: categoriesWithProducts } = await supabase
            .from('ticket_categories')
            .select('id, product_names')

          if (categoriesWithProducts) {
            const matchingCategory = categoriesWithProducts.find(cat =>
              cat.product_names?.includes(productName)
            )
            if (matchingCategory) {
              setSelectedCategoryId(matchingCategory.id)
            }
          }
        }
      }
    } catch (err) {
      console.error('Extraction error:', err)
      setError(err instanceof Error ? err.message : 'Failed to extract data from PDF')
    } finally {
      setExtracting(false)
    }
  }

  const handleSave = async () => {
    if (!extractedData || !selectedCategoryId || !file) return

    setSaving(true)
    setError(null)

    try {
      // Create FormData with file and voucher data
      const formData = new FormData()
      formData.append('file', file)
      formData.append('voucherData', JSON.stringify({
        booking_number: extractedData.booking_number,
        booking_date: extractedData.booking_date,
        category_id: selectedCategoryId,
        visit_date: extractedData.visit_date,
        entry_time: extractedData.entry_time,
        product_name: extractedData.product_name,
        activity_availability_id: selectedAvailabilityId,
        tickets: extractedData.tickets
      }))

      // Call API to upload PDF, create voucher and tickets
      const result = await vouchersApi.create(formData)

      if (result.error) throw new Error(result.error)

      setSuccess(true)
      // Reset form
      setFile(null)
      setExtractedData(null)
      setSelectedCategoryId('')
      setSelectedAvailabilityId(null)
    } catch (err) {
      console.error('Save error:', err)
      setError(err instanceof Error ? err.message : 'Failed to save voucher')
    } finally {
      setSaving(false)
    }
  }

  const warningCount = validationResults.filter(r => r.warnings.length > 0).length
  const filteredAvailabilities = availabilities.filter(a =>
    a.activities?.title?.toLowerCase().includes(searchAvailability.toLowerCase()) ||
    a.local_time.includes(searchAvailability)
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Upload Ticket Voucher</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload a PDF with tickets to extract and assign to a tour
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-medium text-green-800">Voucher saved successfully!</p>
            <p className="text-sm text-green-600">The voucher and tickets have been created.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setSuccess(false)}
          >
            Upload Another
          </Button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!success && (
        <div className="space-y-6">
          {/* Step 1: Upload PDF */}
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold">1</span>
              Upload PDF
            </h2>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="w-8 h-8 text-orange-600" />
                  <div className="text-left">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFile(null)
                      setExtractedData(null)
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 mb-1">Click to upload or drag and drop</p>
                  <p className="text-sm text-gray-400">PDF files only (max 10MB)</p>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {file && !extractedData && (
              <div className="mt-4 flex justify-end">
                <Button onClick={handleExtract} disabled={extracting}>
                  {extracting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    'Extract Data with AI'
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Step 2: Review Extracted Data */}
          {extractedData && (
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold">2</span>
                Review Extracted Data
              </h2>

              {extractionWarning && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-800 font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {extractionWarning}
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Try re-uploading the PDF or check if all pages were extracted correctly.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Booking Number</p>
                  <p className="font-semibold">{extractedData.booking_number}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Visit Date</p>
                  <p className="font-semibold">{extractedData.visit_date}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Entry Time</p>
                  <p className="font-semibold">{extractedData.entry_time}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Total Tickets</p>
                  <p className="font-semibold">{extractedData.tickets.length}</p>
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg mb-4">
                <p className="text-xs text-blue-500">Product Name</p>
                <p className="font-medium text-blue-800">{extractedData.product_name}</p>
              </div>

              {/* Category Selection */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Ticket Category *</Label>
                <div className="relative">
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => {
                      setSelectedCategoryId(e.target.value)
                      setSelectedAvailabilityId(null)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                  >
                    <option value="">Select a category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Tickets Table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {extractedData.tickets.map((ticket, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 text-sm">{ticket.holder_name}</td>
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
            </div>
          )}

          {/* Step 3: Assign to Tour */}
          {extractedData && selectedCategoryId && (
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold">3</span>
                Assign to Tour (Optional)
              </h2>

              {availabilities.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <p>No tours found for {extractedData.visit_date} with this category.</p>
                  <p className="text-sm mt-1">You can still save the voucher without assigning it to a tour.</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchAvailability}
                        onChange={(e) => setSearchAvailability(e.target.value)}
                        placeholder="Search tours..."
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={showOnlyWithBookings}
                        onChange={(e) => setShowOnlyWithBookings(e.target.checked)}
                        className="w-4 h-4 text-orange-600 rounded"
                      />
                      <span className="text-sm text-gray-600">Only with bookings</span>
                    </label>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredAvailabilities
                      .filter(avail => !showOnlyWithBookings || (availabilityBookingCounts.get(avail.id) || 0) > 0)
                      .map(avail => {
                        const bookingCount = availabilityBookingCounts.get(avail.id) || 0
                        return (
                          <label
                            key={avail.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              selectedAvailabilityId === avail.id
                                ? 'border-orange-500 bg-orange-50'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="availability"
                              checked={selectedAvailabilityId === avail.id}
                              onChange={() => setSelectedAvailabilityId(avail.id)}
                              className="w-4 h-4 text-orange-600"
                            />
                            <div className="flex-1">
                              <p className="font-medium">{avail.activities?.title}</p>
                              <p className="text-sm text-gray-500">{avail.local_time}</p>
                            </div>
                            {bookingCount > 0 && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                {bookingCount} booking{bookingCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </label>
                        )
                      })}
                    {filteredAvailabilities.filter(avail => !showOnlyWithBookings || (availabilityBookingCounts.get(avail.id) || 0) > 0).length === 0 && (
                      <div className="text-center py-4 text-gray-500 text-sm">
                        No tours with bookings found. Uncheck the filter to see all tours.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4: Validation Results */}
          {selectedAvailabilityId && validationResults.length > 0 && (
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold">4</span>
                Validation Results
                {warningCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                    {warningCount} warning{warningCount !== 1 ? 's' : ''}
                  </span>
                )}
              </h2>

              {warningCount === 0 ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check className="w-5 h-5" />
                  <p>All tickets validated successfully!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {validationResults.filter(r => r.warnings.length > 0).map((result, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-yellow-800">{result.ticket.holder_name}</p>
                        <ul className="text-sm text-yellow-700 mt-1">
                          {result.warnings.map((w, i) => (
                            <li key={i}>• {w}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Save Button */}
          {extractedData && selectedCategoryId && (
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setFile(null)
                  setExtractedData(null)
                  setSelectedCategoryId('')
                  setSelectedAvailabilityId(null)
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Save Voucher {warningCount > 0 ? '(with warnings)' : ''}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
