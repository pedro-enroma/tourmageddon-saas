'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  RefreshCw, AlertCircle, X, Search, DollarSign,
  CheckCircle2, Clock, ChevronDown, ChevronUp, ChevronLeft,
  ChevronRight, CreditCard, Send, AlertTriangle, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'

// ── Types ──

interface StripeInvoice {
  invoice_id: string
  invoice_status: string
  invoice_amount: number
  invoice_currency: string
  ps_pratica_iri: string | null
  invoice_seller: string | null
  invoice_created_by: string | null
  invoice_sent_at: string | null
}

interface StripePayment {
  id: string
  stripe_event_id: string
  stripe_payment_intent_id: string
  booking_id: string | null
  confirmation_code: string | null
  payment_amount: number
  currency: string
  metadata: Record<string, unknown> | null
  bokun_booking_id: string | null
  bokun_payment_id: string | null
  bokun_travel_date: string | null
  bokun_products: string[] | null
  is_bokun_payment: boolean
  customer_name: string | null
  customer_email: string | null
  customer_country: string | null
  creation_date: string | null
  status: 'MATCHED' | 'RECEIVED' | 'PENDING_REVIEW' | 'INVOICED'
  processing_notes: string | null
  error_message?: string | null
  processed_at: string | null
  created_at: string
  invoice: StripeInvoice | null
}

type StatusFilter = 'all' | 'MATCHED' | 'RECEIVED' | 'PENDING_REVIEW' | 'INVOICED'
type SourceFilter = 'all' | 'bokun' | 'other'
type SortField = 'created_at' | 'payment_amount' | 'customer_name' | 'bokun_travel_date'
type SortDir = 'asc' | 'desc'

const AUTO_REFRESH_INTERVAL = 60_000
const PAGE_SIZE_OPTIONS = [25, 50, 100]

// ── Component ──

export default function StripePaymentsPage() {
  const [payments, setPayments] = useState<StripePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [search, setSearch] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null)

  // ── Fetch data ──

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.append('limit', '500')
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (sourceFilter === 'bokun') params.append('is_bokun', 'true')
      else if (sourceFilter === 'other') params.append('is_bokun', 'false')

      const response = await fetch(`/api/stripe-payments?${params.toString()}`)
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setPayments(data.payments || [])
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Error fetching stripe payments:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch payments')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, sourceFilter])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  useEffect(() => {
    autoRefreshRef.current = setInterval(() => { fetchPayments() }, AUTO_REFRESH_INTERVAL)
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current) }
  }, [fetchPayments])

  // ── Manual Pratica state ──
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualForm, setManualForm] = useState({
    isCreditNote: false,
    firstName: '',
    lastName: '',
    phone: '',
    country: '',
    totalAmount: '',
    travelDate: '',
    confirmationCode: '',
    productTitle: '',
    sellerName: '',
    stripePaymentId: '',
    isPersonaFisica: true,
    codiceFiscale: '',
    partitaIva: '',
    ragioneSociale: '',
  })
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [manualSuccess, setManualSuccess] = useState(false)

  const openManualFormForPayment = (payment: StripePayment) => {
    // Split customer_name into first/last
    let firstName = ''
    let lastName = ''
    if (payment.customer_name) {
      const parts = payment.customer_name.trim().split(/\s+/)
      firstName = parts[0] || ''
      lastName = parts.slice(1).join(' ') || ''
    }

    setManualForm({
      isCreditNote: false,
      firstName,
      lastName,
      phone: '',
      country: payment.customer_country || '',
      totalAmount: payment.payment_amount ? String(payment.payment_amount) : '',
      travelDate: '',
      confirmationCode: '',
      productTitle: '',
      sellerName: '',
      stripePaymentId: payment.id,
      isPersonaFisica: true,
      codiceFiscale: '',
      partitaIva: '',
      ragioneSociale: '',
    })
    setManualError(null)
    setManualSuccess(false)
    setShowManualForm(true)
  }

  const updateManualField = (key: string, value: string | boolean) => {
    setManualForm(prev => ({ ...prev, [key]: value }))
  }

  const submitManualPratica = async () => {
    if (!manualForm.firstName.trim() || !manualForm.lastName.trim()) {
      setManualError('First name and last name are required')
      return
    }
    const amount = parseFloat(manualForm.totalAmount)
    if (!amount || amount <= 0) {
      setManualError('Amount must be greater than 0')
      return
    }
    if (!manualForm.isPersonaFisica) {
      if (!manualForm.partitaIva.trim()) {
        setManualError('Partita IVA is required for persona giuridica')
        return
      }
      if (!manualForm.ragioneSociale.trim()) {
        setManualError('Ragione Sociale is required for persona giuridica')
        return
      }
    }

    setManualSubmitting(true)
    setManualError(null)
    try {
      const payload: Record<string, unknown> = {
        firstName: manualForm.firstName.trim(),
        lastName: manualForm.lastName.trim(),
        totalAmount: amount,
        isPersonaFisica: manualForm.isPersonaFisica,
        isCreditNote: manualForm.isCreditNote,
      }
      if (manualForm.travelDate) payload.travelDate = manualForm.travelDate
      if (manualForm.confirmationCode.trim()) payload.confirmationCode = manualForm.confirmationCode.trim()
      if (manualForm.productTitle.trim()) payload.productTitle = manualForm.productTitle.trim()
      if (manualForm.phone.trim()) payload.phone = manualForm.phone.trim()
      if (manualForm.country.trim()) payload.country = manualForm.country.trim()
      if (manualForm.sellerName.trim()) payload.sellerName = manualForm.sellerName.trim()
      if (manualForm.stripePaymentId.trim()) payload.stripePaymentId = manualForm.stripePaymentId.trim()
      if (manualForm.isPersonaFisica && manualForm.codiceFiscale.trim()) {
        payload.codiceFiscale = manualForm.codiceFiscale.trim()
      }
      if (!manualForm.isPersonaFisica) {
        payload.partitaIva = manualForm.partitaIva.trim()
        payload.ragioneSociale = manualForm.ragioneSociale.trim()
      }

      const response = await fetch('/api/invoices-created/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (data.error) throw new Error(data.error)

      setManualSuccess(true)
      setTimeout(() => {
        setShowManualForm(false)
        fetchPayments()
      }, 1500)
    } catch (err) {
      setManualError(err instanceof Error ? err.message : manualForm.isCreditNote ? 'Failed to create credit note' : 'Failed to create pratica')
    } finally {
      setManualSubmitting(false)
    }
  }

  // ── Formatting ──

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'EUR' }).format(amount)
  }

  // ── Status badge ──

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'MATCHED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle2 className="h-3 w-3" /> Matched
          </span>
        )
      case 'RECEIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <Clock className="h-3 w-3" /> Received
          </span>
        )
      case 'PENDING_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <AlertCircle className="h-3 w-3" /> Needs Review
          </span>
        )
      case 'INVOICED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
            <Send className="h-3 w-3" /> Sent to PS
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        )
    }
  }

  // ── Client-side filtering ──

  const filteredPayments = useMemo(() => {
    const searchValue = search.trim().toLowerCase()
    return payments.filter(p => {
      if (!searchValue) return true
      return [
        p.customer_name,
        p.confirmation_code,
        p.stripe_payment_intent_id,
        p.bokun_booking_id,
        p.booking_id,
      ].some(v => v?.toLowerCase().includes(searchValue))
    })
  }, [payments, search])

  // ── Client-side sorting ──

  const sortedPayments = useMemo(() => {
    const sorted = [...filteredPayments]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'payment_amount':
          cmp = (a.payment_amount || 0) - (b.payment_amount || 0)
          break
        case 'customer_name':
          cmp = (a.customer_name || '').localeCompare(b.customer_name || '')
          break
        case 'bokun_travel_date': {
          const aDate = a.bokun_travel_date ? new Date(a.bokun_travel_date).getTime() : 0
          const bDate = b.bokun_travel_date ? new Date(b.bokun_travel_date).getTime() : 0
          cmp = aDate - bDate
          break
        }
        case 'created_at':
        default: {
          const aTime = new Date(a.created_at).getTime()
          const bTime = new Date(b.created_at).getTime()
          cmp = aTime - bTime
          break
        }
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
    return sorted
  }, [filteredPayments, sortField, sortDir])

  // ── Stats ──

  const stats = useMemo(() => {
    const total = payments.length
    const sentToPS = payments.filter(p => p.invoice !== null).length
    const matched = payments.filter(p => p.status === 'MATCHED' || p.status === 'INVOICED' || p.invoice !== null).length
    const received = payments.filter(p => p.status === 'RECEIVED').length
    const needsReview = payments.filter(p => p.status === 'PENDING_REVIEW').length
    return { total, sentToPS, matched, received, needsReview }
  }, [payments])

  // ── Pagination ──

  const totalPages = Math.max(1, Math.ceil(sortedPayments.length / pageSize))
  const safeCurrentPage = Math.min(page, totalPages)
  const paginatedPayments = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return sortedPayments.slice(start, start + pageSize)
  }, [sortedPayments, safeCurrentPage, pageSize])

  useEffect(() => { setPage(1) }, [sortField, sortDir, search, statusFilter, sourceFilter])

  // ── Sort toggle ──

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 inline ml-0.5" />
      : <ChevronDown className="h-3 w-3 inline ml-0.5" />
  }

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stripe Payments</h1>
          <p className="text-sm text-gray-500 mt-1">
            Incoming Stripe payment events
            <span className="ml-2 text-gray-400">
              Updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPayments} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-500">Total Payments</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-indigo-600">{stats.sentToPS}</div>
          <div className="text-sm text-gray-500">Sent to PS</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-green-600">{stats.matched}</div>
          <div className="text-sm text-gray-500">Matched</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-amber-600">{stats.received}</div>
          <div className="text-sm text-gray-500">Received</div>
        </div>
        <div className="bg-white rounded-lg border border-red-200 p-4">
          <div className="text-2xl font-bold text-red-600">{stats.needsReview}</div>
          <div className="text-sm text-red-600 font-medium">Needs Review</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-gray-600">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="ml-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All</option>
              <option value="INVOICED">Sent to PS</option>
              <option value="MATCHED">Matched</option>
              <option value="RECEIVED">Received</option>
              <option value="PENDING_REVIEW">Needs Review</option>
            </select>
          </label>

          <label className="text-xs font-medium text-gray-600">
            Source
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
              className="ml-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All</option>
              <option value="bokun">Bokun</option>
              <option value="other">Other</option>
            </select>
          </label>

          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search customer, confirmation code, payment intent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          <div className="text-xs text-gray-500">
            {sortedPayments.length} of {payments.length}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 flex gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-20" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex gap-4 border-t">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      ) : sortedPayments.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
          <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {payments.length === 0 ? 'No payments yet' : 'No payments match your filters'}
          </h3>
          <p className="text-gray-500">
            {payments.length === 0
              ? 'Stripe payment events will appear here when received'
              : 'Try adjusting or clearing filters to see more results.'}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                      onClick={() => toggleSort('created_at')}
                    >
                      Date <SortIcon field="created_at" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                      onClick={() => toggleSort('customer_name')}
                    >
                      Customer <SortIcon field="customer_name" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                      onClick={() => toggleSort('payment_amount')}
                    >
                      Amount <SortIcon field="payment_amount" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Confirmation
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      PS Invoice
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                      onClick={() => toggleSort('bokun_travel_date')}
                    >
                      Travel Date <SortIcon field="bokun_travel_date" />
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedPayments.map((payment) => (
                    <React.Fragment key={payment.id || payment.stripe_event_id}>
                      <tr
                        className={`hover:bg-gray-50 cursor-pointer ${expandedRow === (payment.id || payment.stripe_event_id) ? 'bg-blue-50' : ''}`}
                        onClick={() => setExpandedRow(
                          expandedRow === (payment.id || payment.stripe_event_id) ? null : (payment.id || payment.stripe_event_id)
                        )}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{formatDateTime(payment.created_at)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">{payment.customer_name || '-'}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                            <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                            {formatCurrency(payment.payment_amount, payment.currency)}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {payment.confirmation_code ? (
                            <span className="font-mono text-sm text-gray-900">{payment.confirmation_code}</span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {getStatusBadge(payment.status)}
                            {payment.status === 'PENDING_REVIEW' && !payment.invoice && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => { e.stopPropagation(); openManualFormForPayment(payment) }}
                              >
                                <Send className="h-3 w-3 mr-1" /> Send to PS
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {payment.invoice ? (
                            <div>
                              <div className="flex items-center gap-1 text-sm text-indigo-700 font-medium">
                                <Send className="h-3 w-3" />
                                {formatCurrency(payment.invoice.invoice_amount, payment.invoice.invoice_currency)}
                              </div>
                              {payment.invoice.invoice_amount !== payment.payment_amount && (
                                <div className="flex items-center gap-1 text-xs text-orange-600 mt-0.5">
                                  <AlertTriangle className="h-3 w-3" />
                                  Mismatch
                                </div>
                              )}
                              {payment.invoice.invoice_sent_at && (
                                <div className="text-xs text-gray-400 mt-0.5">
                                  {formatDate(payment.invoice.invoice_sent_at)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            payment.is_bokun_payment ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {payment.is_bokun_payment ? 'Bokun' : 'Other'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-600">{formatDate(payment.bokun_travel_date)}</div>
                        </td>
                      </tr>

                      {/* Expanded Detail Row */}
                      {expandedRow === (payment.id || payment.stripe_event_id) && (
                        <tr>
                          <td colSpan={8} className="px-4 py-4 bg-gray-50 border-t-0">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                              {/* Column 1: Stripe / Bokun IDs */}
                              <div className="space-y-2">
                                <DetailItem label="Stripe Event ID" value={payment.stripe_event_id} mono />
                                <DetailItem label="Payment Intent" value={payment.stripe_payment_intent_id} mono />
                                <DetailItem label="Customer Email" value={payment.customer_email} />
                                <DetailItem label="Customer Country" value={payment.customer_country} />
                                <DetailItem label="Booking ID" value={payment.booking_id} />
                                <DetailItem label="Bokun Booking ID" value={payment.bokun_booking_id} />
                                <DetailItem label="Bokun Payment ID" value={payment.bokun_payment_id} />
                                <DetailItem label="Creation Date" value={formatDate(payment.creation_date)} />
                                <DetailItem label="Processed At" value={formatDateTime(payment.processed_at)} />
                              </div>

                              {/* Column 2: Invoice / PS details */}
                              <div className="space-y-2">
                                {payment.invoice ? (
                                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
                                    <div className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">Partner Solution Invoice</div>
                                    <DetailItem label="Invoice Amount" value={formatCurrency(payment.invoice.invoice_amount, payment.invoice.invoice_currency)} />
                                    <DetailItem label="Stripe Amount" value={formatCurrency(payment.payment_amount, payment.currency)} />
                                    {payment.invoice.invoice_amount !== payment.payment_amount && (
                                      <div className="flex items-center gap-1 text-orange-700 bg-orange-50 rounded px-2 py-1">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        <span className="text-xs font-medium">
                                          Amount mismatch: {formatCurrency(Math.abs(payment.invoice.invoice_amount - payment.payment_amount), payment.currency)} difference
                                        </span>
                                      </div>
                                    )}
                                    <DetailItem label="Invoice Status" value={payment.invoice.invoice_status} />
                                    <DetailItem label="PS Pratica" value={payment.invoice.ps_pratica_iri} mono />
                                    <DetailItem label="Seller" value={payment.invoice.invoice_seller} />
                                    <DetailItem label="Created By" value={payment.invoice.invoice_created_by} />
                                    <DetailItem label="Sent to PS" value={formatDateTime(payment.invoice.invoice_sent_at)} />
                                  </div>
                                ) : (
                                  <div className="bg-gray-100 border border-gray-200 rounded-lg p-3 text-gray-500 text-center">
                                    No invoice sent to PS yet
                                  </div>
                                )}
                              </div>

                              {/* Column 3: Notes, products, metadata */}
                              <div className="space-y-2">
                                {payment.processing_notes && (
                                  <div>
                                    <span className="text-gray-500">Processing Notes:</span>
                                    <p className="text-gray-700 mt-1">{payment.processing_notes}</p>
                                  </div>
                                )}
                                {payment.error_message && (
                                  <div className="bg-red-50 border border-red-200 rounded p-2">
                                    <span className="text-xs font-medium text-red-800">Error:</span>
                                    <p className="text-sm text-red-700 mt-1">{payment.error_message}</p>
                                  </div>
                                )}
                                {payment.bokun_products && payment.bokun_products.length > 0 && (
                                  <div>
                                    <span className="text-gray-500">Bokun Products:</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {payment.bokun_products.map((product, i) => (
                                        <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded font-mono">
                                          {product}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {payment.metadata && Object.keys(payment.metadata).length > 0 && (
                                  <div>
                                    <span className="text-gray-500">Metadata:</span>
                                    <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto max-h-48">
                                      {JSON.stringify(payment.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {PAGE_SIZE_OPTIONS.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span>
                {((safeCurrentPage - 1) * pageSize) + 1}-{Math.min(safeCurrentPage * pageSize, sortedPayments.length)} of {sortedPayments.length}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                  onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safeCurrentPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safeCurrentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Manual Pratica Sheet */}
      <Sheet open={showManualForm} onOpenChange={(open) => { if (!open) setShowManualForm(false) }}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Send to Partner Solution</SheetTitle>
            <SheetDescription>Review and send this payment as a pratica to PS</SheetDescription>
          </SheetHeader>

          <div className="px-4 space-y-6 pb-6">
            {manualSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                <p className="text-sm text-green-700">
                  {manualForm.isCreditNote ? 'Credit note created successfully!' : 'Pratica created successfully!'}
                </p>
              </div>
            )}

            {manualError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">{manualError}</p>
              </div>
            )}

            {/* Section 1 — Document Type */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Document Type</h3>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="spDocType"
                    checked={!manualForm.isCreditNote}
                    onChange={() => updateManualField('isCreditNote', false)}
                    disabled={manualSubmitting || manualSuccess}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  Invoice
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="spDocType"
                    checked={manualForm.isCreditNote}
                    onChange={() => updateManualField('isCreditNote', true)}
                    disabled={manualSubmitting || manualSuccess}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  Credit Note
                </label>
              </div>
              {manualForm.isCreditNote && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">Amount will be negated server-side</p>
                </div>
              )}
            </div>

            {/* Section 2 — Customer Info */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Customer Info</h3>

              <div className="flex items-center gap-4 mb-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="spPersonaType"
                    checked={manualForm.isPersonaFisica}
                    onChange={() => updateManualField('isPersonaFisica', true)}
                    disabled={manualSubmitting || manualSuccess}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  Persona Fisica
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="spPersonaType"
                    checked={!manualForm.isPersonaFisica}
                    onChange={() => updateManualField('isPersonaFisica', false)}
                    disabled={manualSubmitting || manualSuccess}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  Persona Giuridica
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-gray-600">
                  First Name *
                  <Input
                    value={manualForm.firstName}
                    onChange={(e) => updateManualField('firstName', e.target.value)}
                    placeholder="Mario"
                    className="mt-1"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Last Name *
                  <Input
                    value={manualForm.lastName}
                    onChange={(e) => updateManualField('lastName', e.target.value)}
                    placeholder="Rossi"
                    className="mt-1"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-gray-600">
                  Phone
                  <Input
                    value={manualForm.phone}
                    onChange={(e) => updateManualField('phone', e.target.value)}
                    placeholder="+39 333 1234567"
                    className="mt-1"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Country
                  <Input
                    value={manualForm.country}
                    onChange={(e) => updateManualField('country', e.target.value.toUpperCase())}
                    placeholder="ES"
                    maxLength={2}
                    className="mt-1 font-mono"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
              </div>

              {manualForm.isPersonaFisica ? (
                <div className="mt-3">
                  <label className="text-xs font-medium text-gray-600">
                    Codice Fiscale
                    <Input
                      value={manualForm.codiceFiscale}
                      onChange={(e) => updateManualField('codiceFiscale', e.target.value.toUpperCase())}
                      placeholder="RSSMRA80A01H501U"
                      maxLength={16}
                      className="mt-1 font-mono"
                      disabled={manualSubmitting || manualSuccess}
                    />
                  </label>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <label className="text-xs font-medium text-gray-600">
                    Partita IVA *
                    <Input
                      value={manualForm.partitaIva}
                      onChange={(e) => updateManualField('partitaIva', e.target.value)}
                      placeholder="12345678901"
                      maxLength={11}
                      className="mt-1 font-mono"
                      disabled={manualSubmitting || manualSuccess}
                    />
                  </label>
                  <label className="text-xs font-medium text-gray-600">
                    Ragione Sociale *
                    <Input
                      value={manualForm.ragioneSociale}
                      onChange={(e) => updateManualField('ragioneSociale', e.target.value)}
                      placeholder="Azienda S.r.l."
                      className="mt-1"
                      disabled={manualSubmitting || manualSuccess}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Section 3 — Payment Details */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Payment Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-gray-600">
                  Amount (EUR) *
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={manualForm.totalAmount}
                    onChange={(e) => updateManualField('totalAmount', e.target.value)}
                    placeholder="100.00"
                    className="mt-1"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Travel Date
                  <Input
                    type="date"
                    value={manualForm.travelDate}
                    onChange={(e) => updateManualField('travelDate', e.target.value)}
                    className="mt-1"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <label className="text-xs font-medium text-gray-600">
                  Product Title
                  <Input
                    value={manualForm.productTitle}
                    onChange={(e) => updateManualField('productTitle', e.target.value)}
                    placeholder="Tour UE ed Extra UE"
                    className="mt-1"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Seller Name
                  <Input
                    value={manualForm.sellerName}
                    onChange={(e) => updateManualField('sellerName', e.target.value)}
                    placeholder="Seller name"
                    className="mt-1"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
              </div>
            </div>

            {/* Section 4 — Linking */}
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Linking</h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-gray-600">
                  Confirmation Code
                  <Input
                    value={manualForm.confirmationCode}
                    onChange={(e) => updateManualField('confirmationCode', e.target.value)}
                    placeholder="Auto-generated"
                    className="mt-1 font-mono"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Stripe Payment ID
                  <Input
                    value={manualForm.stripePaymentId}
                    className="mt-1 font-mono text-xs bg-gray-50"
                    disabled
                  />
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowManualForm(false)}
                disabled={manualSubmitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={submitManualPratica}
                disabled={manualSubmitting || manualSuccess}
                className="flex-1"
              >
                {manualSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending...</>
                ) : manualForm.isCreditNote ? (
                  'Send Credit Note to PS'
                ) : (
                  'Send to PS'
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function DetailItem({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-500 shrink-0">{label}:</span>
      <span className={`text-gray-900 break-all ${mono ? 'font-mono text-xs' : ''}`}>
        {value || '-'}
      </span>
    </div>
  )
}
