'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Loader2, Receipt, AlertCircle, X, Send, Calendar, User, DollarSign, CheckCircle2, XCircle, Filter, Plane } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PendingBooking {
  booking_id: number
  confirmation_code: string
  total_price: number
  currency: string
  creation_date: string
  customer_name: string | null
  customer_email: string | null
  activity_seller: string | null
  travel_date?: string
  rule_name?: string
  rule_type?: 'travel_date' | 'creation_date' | 'stripe_payment'
}

interface InvoiceRule {
  id: string
  name: string
  invoice_date_type: 'travel_date' | 'creation_date' | 'stripe_payment'
  sellers: string[]
  invoice_start_date: string
  is_active: boolean
}

export default function InvoicePendingPage() {
  const [bookings, setBookings] = useState<PendingBooking[]>([])
  const [rules, setRules] = useState<InvoiceRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSeller, setSelectedSeller] = useState<string>('all')
  const [sendingBookingId, setSendingBookingId] = useState<number | null>(null)
  const [sendResults, setSendResults] = useState<Record<number, 'success' | 'error'>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch both pending bookings and rules in parallel
      const [bookingsRes, rulesRes] = await Promise.all([
        fetch('/api/invoice-pending'),
        fetch('/api/invoice-rules'),
      ])

      const bookingsData = await bookingsRes.json()
      const rulesData = await rulesRes.json()

      if (bookingsData.error) throw new Error(bookingsData.error)
      if (rulesData.error) throw new Error(rulesData.error)

      setBookings(bookingsData.data || [])
      setRules(rulesData.data || [])
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Match bookings to rules
  const getMatchingRule = (booking: PendingBooking): InvoiceRule | null => {
    if (!booking.activity_seller) return null
    return rules.find(rule => rule.sellers.includes(booking.activity_seller!)) || null
  }

  // Get unique sellers from bookings
  const uniqueSellers = [...new Set(bookings.map(b => b.activity_seller).filter(Boolean))] as string[]

  // Filter bookings
  const filteredBookings = bookings.filter(b => {
    if (selectedSeller === 'all') return true
    return b.activity_seller === selectedSeller
  })

  // Group by rule type
  const creationDateBookings = filteredBookings.filter(b => {
    const rule = getMatchingRule(b)
    return rule?.invoice_date_type === 'creation_date'
  })

  const travelDateBookings = filteredBookings.filter(b => {
    const rule = getMatchingRule(b)
    return rule?.invoice_date_type === 'travel_date'
  })

  const noRuleBookings = filteredBookings.filter(b => !getMatchingRule(b))

  const sendToPartnerSolution = async (bookingId: number) => {
    setSendingBookingId(bookingId)
    try {
      const response = await fetch(`/api/invoice-pending/${bookingId}/send`, {
        method: 'POST',
      })
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setSendResults(prev => ({ ...prev, [bookingId]: 'success' }))
      // Remove from list after success
      setTimeout(() => {
        setBookings(prev => prev.filter(b => b.booking_id !== bookingId))
        setSendResults(prev => {
          const newResults = { ...prev }
          delete newResults[bookingId]
          return newResults
        })
      }, 2000)
    } catch (err) {
      console.error('Error sending to Partner Solution:', err)
      setSendResults(prev => ({ ...prev, [bookingId]: 'error' }))
    } finally {
      setSendingBookingId(null)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(amount)
  }

  const BookingCard = ({ booking }: { booking: PendingBooking }) => {
    const rule = getMatchingRule(booking)
    const isSending = sendingBookingId === booking.booking_id
    const result = sendResults[booking.booking_id]

    return (
      <div className={`bg-white border rounded-lg p-4 hover:shadow-md transition-shadow ${
        result === 'success' ? 'border-green-300 bg-green-50' :
        result === 'error' ? 'border-red-300 bg-red-50' : ''
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-medium text-gray-900">
                {booking.confirmation_code}
              </span>
              {rule && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  rule.invoice_date_type === 'creation_date'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {rule.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600 mt-2">
              {booking.customer_name && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {booking.customer_name}
                </span>
              )}
              <span className="flex items-center gap-1" title="Travel Date">
                <Plane className="h-3.5 w-3.5 text-blue-500" />
                {booking.travel_date ? formatDate(booking.travel_date) : '-'}
              </span>
              <span className="flex items-center gap-1 text-gray-400" title="Creation Date">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(booking.creation_date)}
              </span>
              <span className="flex items-center gap-1 font-medium text-gray-900">
                <DollarSign className="h-3.5 w-3.5" />
                {formatCurrency(booking.total_price, booking.currency)}
              </span>
            </div>
            {booking.activity_seller && (
              <div className="mt-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">
                  {booking.activity_seller}
                </span>
              </div>
            )}
          </div>
          <div className="flex-shrink-0">
            {result === 'success' ? (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Sent</span>
              </div>
            ) : result === 'error' ? (
              <div className="flex items-center gap-1 text-red-600">
                <XCircle className="h-5 w-5" />
                <span className="text-sm font-medium">Failed</span>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => sendToPartnerSolution(booking.booking_id)}
                disabled={isSending}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    Send
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const BookingSection = ({
    title,
    icon: Icon,
    bookings,
    emptyMessage,
    bgColor
  }: {
    title: string
    icon: React.ElementType
    bookings: PendingBooking[]
    emptyMessage: string
    bgColor: string
  }) => (
    <div className="mb-8">
      <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-lg ${bgColor}`}>
        <Icon className="h-5 w-5" />
        <h2 className="font-semibold">{title}</h2>
        <span className="ml-auto bg-white/50 px-2 py-0.5 rounded text-sm font-medium">
          {bookings.length}
        </span>
      </div>
      {bookings.length === 0 ? (
        <p className="text-gray-500 text-sm px-3">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {bookings.map(booking => (
            <BookingCard key={booking.booking_id} booking={booking} />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pending Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bookings waiting to be sent to Partner Solution
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4 text-red-500" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-600">Seller:</span>
        </div>
        <select
          value={selectedSeller}
          onChange={(e) => setSelectedSeller(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="all">All Sellers</option>
          {uniqueSellers.map(seller => (
            <option key={seller} value={seller}>{seller}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500">
          {filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''} total
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
          <Receipt className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No pending invoices</h3>
          <p className="text-gray-500">All bookings have been invoiced</p>
        </div>
      ) : (
        <>
          {/* Creation Date (Instant) Rules */}
          <BookingSection
            title="Instant Invoice"
            icon={Receipt}
            bookings={creationDateBookings}
            emptyMessage="No bookings pending for instant invoice rules"
            bgColor="bg-purple-100 text-purple-800"
          />

          {/* Travel Date Rules */}
          <BookingSection
            title="Travel Date Invoice"
            icon={Calendar}
            bookings={travelDateBookings}
            emptyMessage="No bookings pending for travel date rules"
            bgColor="bg-blue-100 text-blue-800"
          />

          {/* No Rule Match */}
          {noRuleBookings.length > 0 && (
            <BookingSection
              title="No Rule Match"
              icon={AlertCircle}
              bookings={noRuleBookings}
              emptyMessage=""
              bgColor="bg-gray-100 text-gray-800"
            />
          )}
        </>
      )}
    </div>
  )
}
