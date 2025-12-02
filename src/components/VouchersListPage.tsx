'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, FileText, ExternalLink, Trash2, Eye, Calendar, Clock, Users, X } from 'lucide-react'
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
  total_tickets: number
  created_at: string
  ticket_categories?: { id: string; name: string } | null
  activity_availability?: {
    id: number
    local_time: string
    activities?: { title: string }
  } | null
  tickets?: Ticket[]
}

export default function VouchersListPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
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
      const { data, error } = await supabase
        .from('vouchers')
        .select(`
          *,
          ticket_categories (id, name),
          activity_availability (
            id,
            local_time,
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
        .order('created_at', { ascending: false })

      if (error) throw error
      setVouchers(data || [])
    } catch (err) {
      console.error('Error fetching vouchers:', err)
      setError('Failed to load vouchers')
    } finally {
      setLoading(false)
    }
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
                  {dateVouchers.map(voucher => (
                    <div
                      key={voucher.id}
                      className="bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-gray-900">{voucher.booking_number}</h3>
                            <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                              {voucher.ticket_categories?.name || 'No category'}
                            </span>
                            {voucher.activity_availability && (
                              <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                                Assigned
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
                              {voucher.total_tickets} tickets
                            </span>
                            {voucher.activity_availability && (
                              <span className="text-green-600">
                                → {voucher.activity_availability.activities?.title} at {voucher.activity_availability.local_time}
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
                  ))}
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
