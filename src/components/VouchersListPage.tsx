'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, FileText, ExternalLink, Trash2, Eye, Calendar, Clock, Users, X, Landmark, Train, Tag, AlertCircle, FileEdit } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Ticket {
  id: string
  ticket_code: string
  holder_name: string
  ticket_type: string
  price: number
}

interface Voucher {
  id: string
  booking_number: string
  booking_date: string | null
  visit_date: string
  entry_time: string
  product_name: string
  pdf_path: string | null
  activity_availability_id: number | null
  planned_availability_id: string | null
  total_tickets: number
  ticket_class?: 'entrance' | 'transport' | 'other' | null
  created_at: string
  // Placeholder fields
  is_placeholder?: boolean
  placeholder_ticket_count?: number | null
  name_deadline_at?: string | null
  deadline_status?: 'not_applicable' | 'pending' | 'escalated' | 'resolved' | null
  manual_entry?: boolean
  voucher_source?: 'b2b' | 'b2c' | null
  notes?: string | null
  ticket_categories?: { id: string; name: string; ticket_class?: 'entrance' | 'transport' | 'other' } | null
  activity_availability?: {
    id: number
    local_time: string
    activities?: { title: string }
  } | null
  planned_availabilities?: {
    id: string
    local_time: string
    local_date: string
    activities?: { title: string }
  } | null
  tickets?: Ticket[]
}

interface ProductMapping {
  product_name: string
  ticket_source: 'b2c' | 'b2b' | null
}

const getTicketClassIcon = (ticketClass?: string | null) => {
  switch (ticketClass) {
    case 'transport':
      return { Icon: Train, color: 'text-blue-600' }
    case 'other':
      return { Icon: Tag, color: 'text-gray-600' }
    case 'entrance':
    default:
      return { Icon: Landmark, color: 'text-orange-600' }
  }
}

export default function VouchersListPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [productMappings, setProductMappings] = useState<ProductMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    fetchVouchers()
  }, [])

  const fetchVouchers = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch vouchers and product mappings in parallel
      const [vouchersRes, mappingsRes] = await Promise.all([
        supabase
          .from('vouchers')
          .select(`
            *,
            ticket_categories (id, name, ticket_class),
            activity_availability (
              id,
              local_time,
              activities (title)
            ),
            planned_availabilities (
              id,
              local_time,
              local_date,
              activities (title)
            ),
            tickets (
              id,
              ticket_code,
              holder_name,
              ticket_type,
              price
            )
          `)
          .order('visit_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('product_activity_mappings')
          .select('product_name, ticket_source')
      ])

      if (vouchersRes.error) throw vouchersRes.error
      setVouchers(vouchersRes.data || [])

      // Create unique mapping by product_name, preferring ones with ticket_source set
      if (mappingsRes.data) {
        const uniqueMappings = mappingsRes.data.reduce((acc, m) => {
          const existing = acc.find(x => x.product_name === m.product_name)
          if (!existing) {
            acc.push({ product_name: m.product_name, ticket_source: m.ticket_source })
          } else if (!existing.ticket_source && m.ticket_source) {
            // Prefer mappings with ticket_source set
            existing.ticket_source = m.ticket_source
          }
          return acc
        }, [] as ProductMapping[])
        setProductMappings(uniqueMappings)
      }
    } catch (err) {
      console.error('Error fetching vouchers:', err)
      setError('Failed to load vouchers')
    } finally {
      setLoading(false)
    }
  }

  // Helper to get ticket source for a product name (flexible matching)
  const getTicketSource = (productName: string): 'b2c' | 'b2b' | null => {
    const normalizedProduct = productName.toUpperCase().trim()

    // First try exact match
    let mapping = productMappings.find(m => m.product_name.toUpperCase() === normalizedProduct)

    // Then try if voucher product is contained in mapping product name
    if (!mapping) {
      mapping = productMappings.find(m =>
        m.product_name.toUpperCase().includes(normalizedProduct) ||
        normalizedProduct.includes(m.product_name.toUpperCase())
      )
    }

    return mapping?.ticket_source || null
  }

  const handleDelete = async (voucherId: string) => {
    if (!confirm('Are you sure you want to delete this voucher and all its tickets?')) return

    try {
      const { error } = await supabase
        .from('vouchers')
        .delete()
        .eq('id', voucherId)

      if (error) throw error
      fetchVouchers()
      if (selectedVoucher?.id === voucherId) {
        setShowModal(false)
        setSelectedVoucher(null)
      }
    } catch (err) {
      console.error('Error deleting voucher:', err)
      setError('Failed to delete voucher')
    }
  }

  const handleViewDetails = (voucher: Voucher) => {
    setSelectedVoucher(voucher)
    setShowModal(true)
  }

  const getPdfUrl = (pdfPath: string) => {
    const { data } = supabase.storage
      .from('ticket-vouchers')
      .getPublicUrl(pdfPath)
    return data.publicUrl
  }

  const filteredVouchers = vouchers.filter(voucher => {
    const matchesSearch =
      voucher.booking_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      voucher.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      voucher.ticket_categories?.name.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesDate = !dateFilter || voucher.visit_date === dateFilter

    return matchesSearch && matchesDate
  })

  // Group by date
  const groupedVouchers = filteredVouchers.reduce((acc, voucher) => {
    const date = voucher.visit_date
    if (!acc[date]) acc[date] = []
    acc[date].push(voucher)
    return acc
  }, {} as Record<string, Voucher[]>)

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  // Helper to calculate deadline status
  const getDeadlineInfo = (voucher: Voucher) => {
    if (!voucher.is_placeholder || !voucher.name_deadline_at) {
      return null
    }

    const now = new Date()
    const deadline = new Date(voucher.name_deadline_at)
    const diff = deadline.getTime() - now.getTime()
    const daysUntil = Math.ceil(diff / (1000 * 60 * 60 * 24))

    if (voucher.deadline_status === 'escalated' || daysUntil < 0) {
      return {
        label: 'OVERDUE',
        color: 'bg-red-100 text-red-700 border-red-200',
        urgent: true
      }
    } else if (daysUntil <= 1) {
      return {
        label: 'Due today',
        color: 'bg-orange-100 text-orange-700 border-orange-200',
        urgent: true
      }
    } else if (daysUntil <= 3) {
      return {
        label: `${daysUntil} days left`,
        color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        urgent: false
      }
    } else {
      return {
        label: `${daysUntil} days left`,
        color: 'bg-blue-100 text-blue-700 border-blue-200',
        urgent: false
      }
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Vouchers</h1>
          <p className="text-gray-500 text-sm mt-1">
            View and manage all uploaded ticket vouchers
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by booking number, product, or category..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="relative">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Vouchers List */}
      {loading ? (
        <div className="text-center py-8">Loading vouchers...</div>
      ) : Object.keys(groupedVouchers).length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No vouchers found</p>
          <p className="text-sm text-gray-400 mt-1">Upload your first voucher to get started</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedVouchers)
            .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
            .map(([date, dateVouchers]) => (
              <div key={date}>
                <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  {formatDate(date)}
                  <span className="text-sm font-normal text-gray-400">
                    ({dateVouchers.length} voucher{dateVouchers.length !== 1 ? 's' : ''})
                  </span>
                </h2>
                <div className="space-y-3">
                  {dateVouchers.map(voucher => {
                    const ticketClass = voucher.ticket_categories?.ticket_class || voucher.ticket_class
                    const { Icon: ClassIcon, color: classColor } = getTicketClassIcon(ticketClass)
                    const ticketSource = getTicketSource(voucher.product_name)
                    const deadlineInfo = getDeadlineInfo(voucher)

                    return (
                    <div
                      key={voucher.id}
                      className={`bg-white rounded-lg shadow border p-4 hover:shadow-md transition-shadow ${
                        deadlineInfo?.urgent ? 'border-red-300' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h3 className="font-semibold text-gray-900">{voucher.booking_number}</h3>
                            <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full flex items-center gap-1">
                              <ClassIcon className={`w-3 h-3 ${classColor}`} />
                              {voucher.ticket_categories?.name || 'No category'}
                            </span>
                            {/* Placeholder badge */}
                            {voucher.is_placeholder && (
                              <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full flex items-center gap-1 border border-amber-200">
                                <FileEdit className="w-3 h-3" />
                                Placeholder
                              </span>
                            )}
                            {/* Deadline badge */}
                            {deadlineInfo && (
                              <span className={`px-2 py-0.5 text-xs rounded-full flex items-center gap-1 border ${deadlineInfo.color}`}>
                                {deadlineInfo.urgent && <AlertCircle className="w-3 h-3" />}
                                <Clock className="w-3 h-3" />
                                {deadlineInfo.label}
                              </span>
                            )}
                            {ticketClass === 'entrance' && (
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                (voucher.voucher_source || ticketSource) === 'b2b'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {(voucher.voucher_source || ticketSource) === 'b2b' ? 'B2B' : 'B2C'}
                              </span>
                            )}
                            {voucher.activity_availability && (
                              <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                                Assigned
                              </span>
                            )}
                            {!voucher.activity_availability && voucher.planned_availabilities && (
                              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                                Assigned (Planned)
                              </span>
                            )}
                            {/* Unlinked tour alert - for vouchers that couldn't be linked due to missing slot */}
                            {voucher.notes?.includes('[UNLINKED]') && (
                              <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full flex items-center gap-1 border border-red-200">
                                <AlertCircle className="w-3 h-3" />
                                Tour Not Linked
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{voucher.product_name}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {voucher.entry_time}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {voucher.is_placeholder
                                ? `${voucher.placeholder_ticket_count || voucher.total_tickets} tickets (placeholder)`
                                : `${voucher.total_tickets} tickets`}
                            </span>
                            {voucher.activity_availability && (
                              <span className="text-green-600">
                                → {voucher.activity_availability.activities?.title} at {voucher.activity_availability.local_time}
                              </span>
                            )}
                            {!voucher.activity_availability && voucher.planned_availabilities && (
                              <span className="text-blue-600">
                                → {voucher.planned_availabilities.activities?.title} at {voucher.planned_availabilities.local_time} (Planned)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(voucher)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {voucher.pdf_path && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(getPdfUrl(voucher.pdf_path!), '_blank')}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(voucher.id)}
                            className="text-red-600 hover:text-red-700 hover:border-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Detail Modal */}
      {showModal && selectedVoucher && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white">
              <div>
                <h2 className="text-xl font-semibold">{selectedVoucher.booking_number}</h2>
                <p className="text-sm text-gray-500">{selectedVoucher.product_name}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Category</p>
                  <p className="font-semibold">{selectedVoucher.ticket_categories?.name || '-'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Visit Date</p>
                  <p className="font-semibold">{selectedVoucher.visit_date}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Entry Time</p>
                  <p className="font-semibold">{selectedVoucher.entry_time}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Total Tickets</p>
                  <p className="font-semibold">{selectedVoucher.total_tickets}</p>
                </div>
              </div>

              {/* Assignment */}
              {selectedVoucher.activity_availability && (
                <div className="bg-green-50 p-4 rounded-lg mb-6">
                  <p className="text-xs text-green-600 mb-1">Assigned to</p>
                  <p className="font-semibold text-green-800">
                    {selectedVoucher.activity_availability.activities?.title}
                  </p>
                  <p className="text-sm text-green-700">
                    at {selectedVoucher.activity_availability.local_time}
                  </p>
                </div>
              )}
              {!selectedVoucher.activity_availability && selectedVoucher.planned_availabilities && (
                <div className="bg-blue-50 p-4 rounded-lg mb-6">
                  <p className="text-xs text-blue-600 mb-1">Assigned to (Planned Slot)</p>
                  <p className="font-semibold text-blue-800">
                    {selectedVoucher.planned_availabilities.activities?.title}
                  </p>
                  <p className="text-sm text-blue-700">
                    at {selectedVoucher.planned_availabilities.local_time}
                  </p>
                </div>
              )}

              {/* Tickets Table */}
              <h3 className="font-semibold mb-3">Tickets ({selectedVoucher.tickets?.length || 0})</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {selectedVoucher.tickets?.map((ticket, idx) => (
                      <tr key={ticket.id}>
                        <td className="px-4 py-2 text-sm text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-2 text-sm font-medium">{ticket.holder_name}</td>
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

              {/* Price Summary */}
              <div className="mt-4 flex justify-end">
                <div className="bg-gray-50 px-4 py-2 rounded-lg">
                  <span className="text-sm text-gray-500">Total:</span>
                  <span className="ml-2 font-semibold">
                    {selectedVoucher.tickets?.reduce((sum, t) => sum + t.price, 0).toFixed(2)}€
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t flex justify-end gap-3">
              {selectedVoucher.pdf_path && (
                <Button
                  variant="outline"
                  onClick={() => window.open(getPdfUrl(selectedVoucher.pdf_path!), '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open PDF
                </Button>
              )}
              <Button onClick={() => setShowModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
