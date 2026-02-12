'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  RefreshCw, AlertCircle, X, Search, DollarSign,
  CheckCircle2, Clock, ChevronDown, ChevronUp, ChevronLeft,
  ChevronRight, CreditCard, Send, AlertTriangle, Loader2, RotateCcw,
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

interface StripeRefund {
  id: number
  stripe_event_id: string
  stripe_charge_id: string | null
  stripe_payment_intent_id: string | null
  booking_id: string | null
  confirmation_code: string | null
  refund_amount: number
  total_amount_refunded: number | null
  currency: string
  metadata: Record<string, unknown> | null
  status: 'RECEIVED' | 'PROCESSED'
  credit_note_id: string | null
  ps_movimento_iri: string | null
  error_message: string | null
  created_at: string
  processed_at: string | null
  customer_name: string | null
}

type ActiveTab = 'payments' | 'refunds'
type PaymentStatusFilter = 'all' | 'MATCHED' | 'RECEIVED' | 'PENDING_REVIEW' | 'INVOICED'
type SourceFilter = 'all' | 'bokun' | 'other'
type PaymentSortField = 'created_at' | 'payment_amount' | 'customer_name' | 'bokun_travel_date'
type RefundStatusFilter = 'all' | 'PROCESSED' | 'RECEIVED'
type RefundSortField = 'created_at' | 'refund_amount' | 'customer_name'
type SortDir = 'asc' | 'desc'

const AUTO_REFRESH_INTERVAL = 60_000
const PAGE_SIZE_OPTIONS = [25, 50, 100]

// ── Shared helpers ──

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

// ── Component ──

export default function StripePaymentsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('payments')

  // ════════════════════════════════════════════
  // ═══ PAYMENTS TAB STATE ═════════════════════
  // ════════════════════════════════════════════

  const [payments, setPayments] = useState<StripePayment[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(true)
  const [paymentsError, setPaymentsError] = useState<string | null>(null)
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentExpandedRow, setPaymentExpandedRow] = useState<string | null>(null)
  const [paymentSortField, setPaymentSortField] = useState<PaymentSortField>('created_at')
  const [paymentSortDir, setPaymentSortDir] = useState<SortDir>('desc')
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [paymentPage, setPaymentPage] = useState(1)
  const [paymentPageSize, setPaymentPageSize] = useState(25)
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null)

  // ── Fetch payments ──

  const fetchPayments = useCallback(async () => {
    setPaymentsLoading(true)
    setPaymentsError(null)
    try {
      const params = new URLSearchParams()
      params.append('limit', '500')
      if (paymentStatusFilter !== 'all') params.append('status', paymentStatusFilter)
      if (sourceFilter === 'bokun') params.append('is_bokun', 'true')
      else if (sourceFilter === 'other') params.append('is_bokun', 'false')

      const response = await fetch(`/api/stripe-payments?${params.toString()}`)
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setPayments(data.payments || [])
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Error fetching stripe payments:', err)
      setPaymentsError(err instanceof Error ? err.message : 'Failed to fetch payments')
    } finally {
      setPaymentsLoading(false)
    }
  }, [paymentStatusFilter, sourceFilter])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  useEffect(() => {
    autoRefreshRef.current = setInterval(() => {
      if (activeTab === 'payments') fetchPayments()
      else fetchRefunds()
    }, AUTO_REFRESH_INTERVAL)
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current) }
  }, [fetchPayments, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Payment status badge ──

  const getPaymentStatusBadge = (status: string) => {
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

  // ── Payment filtering ──

  const filteredPayments = useMemo(() => {
    const searchValue = paymentSearch.trim().toLowerCase()
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
  }, [payments, paymentSearch])

  // ── Payment sorting ──

  const sortedPayments = useMemo(() => {
    const sorted = [...filteredPayments]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (paymentSortField) {
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
      return paymentSortDir === 'desc' ? -cmp : cmp
    })
    return sorted
  }, [filteredPayments, paymentSortField, paymentSortDir])

  // ── Payment stats ──

  const paymentStats = useMemo(() => {
    const total = payments.length
    const sentToPS = payments.filter(p => p.invoice !== null).length
    const matched = payments.filter(p => p.status === 'MATCHED' || p.status === 'INVOICED' || p.invoice !== null).length
    const received = payments.filter(p => p.status === 'RECEIVED').length
    const needsReview = payments.filter(p => p.status === 'PENDING_REVIEW').length
    return { total, sentToPS, matched, received, needsReview }
  }, [payments])

  // ── Payment pagination ──

  const paymentTotalPages = Math.max(1, Math.ceil(sortedPayments.length / paymentPageSize))
  const paymentSafeCurrentPage = Math.min(paymentPage, paymentTotalPages)
  const paginatedPayments = useMemo(() => {
    const start = (paymentSafeCurrentPage - 1) * paymentPageSize
    return sortedPayments.slice(start, start + paymentPageSize)
  }, [sortedPayments, paymentSafeCurrentPage, paymentPageSize])

  useEffect(() => { setPaymentPage(1) }, [paymentSortField, paymentSortDir, paymentSearch, paymentStatusFilter, sourceFilter])

  // ── Payment sort toggle ──

  const togglePaymentSort = (field: PaymentSortField) => {
    if (paymentSortField === field) {
      setPaymentSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setPaymentSortField(field)
      setPaymentSortDir('desc')
    }
  }

  const PaymentSortIcon = ({ field }: { field: PaymentSortField }) => {
    if (paymentSortField !== field) return null
    return paymentSortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 inline ml-0.5" />
      : <ChevronDown className="h-3 w-3 inline ml-0.5" />
  }

  // ════════════════════════════════════════════
  // ═══ REFUNDS TAB STATE ══════════════════════
  // ════════════════════════════════════════════

  const [refunds, setRefunds] = useState<StripeRefund[]>([])
  const [refundsLoading, setRefundsLoading] = useState(false)
  const [refundsError, setRefundsError] = useState<string | null>(null)
  const [refundStatusFilter, setRefundStatusFilter] = useState<RefundStatusFilter>('all')
  const [refundSearch, setRefundSearch] = useState('')
  const [refundExpandedRow, setRefundExpandedRow] = useState<string | null>(null)
  const [refundSortField, setRefundSortField] = useState<RefundSortField>('created_at')
  const [refundSortDir, setRefundSortDir] = useState<SortDir>('desc')
  const [refundPage, setRefundPage] = useState(1)
  const [refundPageSize, setRefundPageSize] = useState(25)
  const refundsFetchedRef = useRef(false)

  // ── Fetch refunds ──

  const fetchRefunds = useCallback(async () => {
    setRefundsLoading(true)
    setRefundsError(null)
    try {
      const response = await fetch('/api/stripe-refunds')
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setRefunds(data.refunds || [])
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Error fetching stripe refunds:', err)
      setRefundsError(err instanceof Error ? err.message : 'Failed to fetch refunds')
    } finally {
      setRefundsLoading(false)
    }
  }, [])

  // Fetch refunds on first visit to that tab
  useEffect(() => {
    if (activeTab === 'refunds' && !refundsFetchedRef.current) {
      refundsFetchedRef.current = true
      fetchRefunds()
    }
  }, [activeTab, fetchRefunds])

  // ── Refund status badge ──

  const getRefundStatusBadge = (status: string) => {
    switch (status) {
      case 'PROCESSED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle2 className="h-3 w-3" /> Processed
          </span>
        )
      case 'RECEIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <Clock className="h-3 w-3" /> Received
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

  // ── Refund filtering ──

  const filteredRefunds = useMemo(() => {
    const searchValue = refundSearch.trim().toLowerCase()
    return refunds.filter(r => {
      if (refundStatusFilter !== 'all' && r.status !== refundStatusFilter) return false
      if (!searchValue) return true
      return [
        r.booking_id,
        r.confirmation_code,
        r.stripe_event_id,
        r.customer_name,
      ].some(v => v?.toString().toLowerCase().includes(searchValue))
    })
  }, [refunds, refundStatusFilter, refundSearch])

  // ── Refund sorting ──

  const sortedRefunds = useMemo(() => {
    const sorted = [...filteredRefunds]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (refundSortField) {
        case 'refund_amount':
          cmp = (a.refund_amount || 0) - (b.refund_amount || 0)
          break
        case 'customer_name':
          cmp = (a.customer_name || '').localeCompare(b.customer_name || '')
          break
        case 'created_at':
        default: {
          const aTime = new Date(a.created_at).getTime()
          const bTime = new Date(b.created_at).getTime()
          cmp = aTime - bTime
          break
        }
      }
      return refundSortDir === 'desc' ? -cmp : cmp
    })
    return sorted
  }, [filteredRefunds, refundSortField, refundSortDir])

  // ── Refund stats ──

  const refundStats = useMemo(() => {
    const total = refunds.length
    const processed = refunds.filter(r => r.status === 'PROCESSED').length
    const received = refunds.filter(r => r.status === 'RECEIVED').length
    return { total, processed, received }
  }, [refunds])

  // ── Refund pagination ──

  const refundTotalPages = Math.max(1, Math.ceil(sortedRefunds.length / refundPageSize))
  const refundSafeCurrentPage = Math.min(refundPage, refundTotalPages)
  const paginatedRefunds = useMemo(() => {
    const start = (refundSafeCurrentPage - 1) * refundPageSize
    return sortedRefunds.slice(start, start + refundPageSize)
  }, [sortedRefunds, refundSafeCurrentPage, refundPageSize])

  useEffect(() => { setRefundPage(1) }, [refundSortField, refundSortDir, refundSearch, refundStatusFilter])

  // ── Refund sort toggle ──

  const toggleRefundSort = (field: RefundSortField) => {
    if (refundSortField === field) {
      setRefundSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setRefundSortField(field)
      setRefundSortDir('desc')
    }
  }

  const RefundSortIcon = ({ field }: { field: RefundSortField }) => {
    if (refundSortField !== field) return null
    return refundSortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 inline ml-0.5" />
      : <ChevronDown className="h-3 w-3 inline ml-0.5" />
  }

  // ── Refresh handler ──

  const handleRefresh = () => {
    if (activeTab === 'payments') fetchPayments()
    else fetchRefunds()
  }

  const isLoading = activeTab === 'payments' ? paymentsLoading : refundsLoading
  const currentError = activeTab === 'payments' ? paymentsError : refundsError
  const clearError = () => {
    if (activeTab === 'payments') setPaymentsError(null)
    else setRefundsError(null)
  }

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stripe</h1>
          <p className="text-sm text-gray-500 mt-1">
            Incoming Stripe payment and refund events
            <span className="ml-2 text-gray-400">
              Updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Tab Selector */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('payments')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'payments'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <CreditCard className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Payments
            {paymentStats.needsReview > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                {paymentStats.needsReview}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('refunds')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'refunds'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <RotateCcw className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            Refunds
            {refundStats.received > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                {refundStats.received}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Error Banner */}
      {currentError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{currentError}</p>
          <button onClick={clearError} className="ml-auto">
            <X className="h-4 w-4 text-red-500" />
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* ═══ PAYMENTS TAB ══════════════════════ */}
      {/* ════════════════════════════════════════ */}

      {activeTab === 'payments' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-gray-900">{paymentStats.total}</div>
              <div className="text-sm text-gray-500">Total Payments</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-indigo-600">{paymentStats.sentToPS}</div>
              <div className="text-sm text-gray-500">Sent to PS</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-green-600">{paymentStats.matched}</div>
              <div className="text-sm text-gray-500">Matched</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-amber-600">{paymentStats.received}</div>
              <div className="text-sm text-gray-500">Received</div>
            </div>
            <div className="bg-white rounded-lg border border-red-200 p-4">
              <div className="text-2xl font-bold text-red-600">{paymentStats.needsReview}</div>
              <div className="text-sm text-red-600 font-medium">Needs Review</div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg border px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-gray-600">
                Status
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value as PaymentStatusFilter)}
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
                  value={paymentSearch}
                  onChange={(e) => setPaymentSearch(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>

              <div className="text-xs text-gray-500">
                {sortedPayments.length} of {payments.length}
              </div>
            </div>
          </div>

          {/* Content */}
          {paymentsLoading ? (
            <TableSkeleton cols={7} />
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
                          onClick={() => togglePaymentSort('created_at')}
                        >
                          Date <PaymentSortIcon field="created_at" />
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                          onClick={() => togglePaymentSort('customer_name')}
                        >
                          Customer <PaymentSortIcon field="customer_name" />
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                          onClick={() => togglePaymentSort('payment_amount')}
                        >
                          Amount <PaymentSortIcon field="payment_amount" />
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
                          onClick={() => togglePaymentSort('bokun_travel_date')}
                        >
                          Travel Date <PaymentSortIcon field="bokun_travel_date" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedPayments.map((payment) => (
                        <React.Fragment key={payment.id || payment.stripe_event_id}>
                          <tr
                            className={`hover:bg-gray-50 cursor-pointer ${paymentExpandedRow === (payment.id || payment.stripe_event_id) ? 'bg-blue-50' : ''}`}
                            onClick={() => setPaymentExpandedRow(
                              paymentExpandedRow === (payment.id || payment.stripe_event_id) ? null : (payment.id || payment.stripe_event_id)
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
                                {getPaymentStatusBadge(payment.status)}
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
                          {paymentExpandedRow === (payment.id || payment.stripe_event_id) && (
                            <tr>
                              <td colSpan={8} className="px-4 py-4 bg-gray-50 border-t-0">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
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
              <Pagination
                currentPage={paymentSafeCurrentPage}
                totalPages={paymentTotalPages}
                totalItems={sortedPayments.length}
                pageSize={paymentPageSize}
                onPageChange={setPaymentPage}
                onPageSizeChange={(size) => { setPaymentPageSize(size); setPaymentPage(1) }}
              />
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════════ */}
      {/* ═══ REFUNDS TAB ═══════════════════════ */}
      {/* ════════════════════════════════════════ */}

      {activeTab === 'refunds' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-gray-900">{refundStats.total}</div>
              <div className="text-sm text-gray-500">Total Refunds</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-green-600">{refundStats.processed}</div>
              <div className="text-sm text-gray-500">Processed</div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-amber-600">{refundStats.received}</div>
              <div className="text-sm text-gray-500">Received</div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg border px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-gray-600">
                Status
                <select
                  value={refundStatusFilter}
                  onChange={(e) => setRefundStatusFilter(e.target.value as RefundStatusFilter)}
                  className="ml-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All</option>
                  <option value="PROCESSED">Processed</option>
                  <option value="RECEIVED">Received</option>
                </select>
              </label>

              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search booking ID, confirmation code, event ID..."
                  value={refundSearch}
                  onChange={(e) => setRefundSearch(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>

              <div className="text-xs text-gray-500">
                {sortedRefunds.length} of {refunds.length}
              </div>
            </div>
          </div>

          {/* Content */}
          {refundsLoading ? (
            <TableSkeleton cols={7} />
          ) : sortedRefunds.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
              <RotateCcw className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {refunds.length === 0 ? 'No refunds yet' : 'No refunds match your filters'}
              </h3>
              <p className="text-gray-500">
                {refunds.length === 0
                  ? 'Stripe refund events will appear here when received'
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
                          onClick={() => toggleRefundSort('created_at')}
                        >
                          Date <RefundSortIcon field="created_at" />
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                          onClick={() => toggleRefundSort('customer_name')}
                        >
                          Customer <RefundSortIcon field="customer_name" />
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                          onClick={() => toggleRefundSort('refund_amount')}
                        >
                          Amount <RefundSortIcon field="refund_amount" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Confirmation
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          PS Credit Note
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Processed At
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedRefunds.map((refund) => {
                        const rowKey = String(refund.id || refund.stripe_event_id)
                        return (
                          <React.Fragment key={rowKey}>
                            <tr
                              className={`hover:bg-gray-50 cursor-pointer ${refundExpandedRow === rowKey ? 'bg-blue-50' : ''}`}
                              onClick={() => setRefundExpandedRow(refundExpandedRow === rowKey ? null : rowKey)}
                            >
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{formatDateTime(refund.created_at)}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-sm text-gray-900">{refund.customer_name || '-'}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                                  <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                                  {formatCurrency(refund.refund_amount, refund.currency)}
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {refund.confirmation_code ? (
                                  <span className="font-mono text-sm text-gray-900">{refund.confirmation_code}</span>
                                ) : (
                                  <span className="text-sm text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {getRefundStatusBadge(refund.status)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {refund.ps_movimento_iri ? (
                                  <span className="font-mono text-sm text-blue-600">{refund.ps_movimento_iri}</span>
                                ) : (
                                  <span className="text-sm text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm text-gray-600">{formatDateTime(refund.processed_at)}</div>
                              </td>
                            </tr>

                            {/* Expanded Detail Row */}
                            {refundExpandedRow === rowKey && (
                              <tr>
                                <td colSpan={7} className="px-4 py-4 bg-gray-50 border-t-0">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div className="space-y-2">
                                      <DetailItem label="Stripe Event ID" value={refund.stripe_event_id} mono />
                                      <DetailItem label="Stripe Charge ID" value={refund.stripe_charge_id} mono />
                                      <DetailItem label="Payment Intent" value={refund.stripe_payment_intent_id} mono />
                                      <DetailItem label="Booking ID" value={refund.booking_id} />
                                      <DetailItem label="Refund Amount" value={formatCurrency(refund.refund_amount, refund.currency)} />
                                      <DetailItem label="Total Refunded" value={refund.total_amount_refunded != null ? formatCurrency(refund.total_amount_refunded, refund.currency) : null} />
                                      <DetailItem label="Currency" value={refund.currency} />
                                      <DetailItem label="Processed At" value={formatDateTime(refund.processed_at)} />
                                    </div>
                                    <div className="space-y-2">
                                      {refund.error_message && (
                                        <div className="bg-red-50 border border-red-200 rounded p-2">
                                          <span className="text-xs font-medium text-red-800">Error:</span>
                                          <p className="text-sm text-red-700 mt-1">{refund.error_message}</p>
                                        </div>
                                      )}
                                      {refund.ps_movimento_iri && (
                                        <DetailItem label="PS Movimento IRI" value={refund.ps_movimento_iri} mono />
                                      )}
                                      {refund.credit_note_id && (
                                        <DetailItem label="Credit Note ID" value={refund.credit_note_id} mono />
                                      )}
                                      {refund.metadata && Object.keys(refund.metadata).length > 0 && (
                                        <div>
                                          <span className="text-gray-500">Metadata:</span>
                                          <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto max-h-48">
                                            {JSON.stringify(refund.metadata, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              <Pagination
                currentPage={refundSafeCurrentPage}
                totalPages={refundTotalPages}
                totalItems={sortedRefunds.length}
                pageSize={refundPageSize}
                onPageChange={setRefundPage}
                onPageSizeChange={(size) => { setRefundPageSize(size); setRefundPage(1) }}
              />
            </>
          )}
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

// ── Shared sub-components ──

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

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
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
  )
}

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <span>
          {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalItems)} of {totalItems}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
