'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  RefreshCw, Loader2, Receipt, AlertCircle, X, Search, User, DollarSign,
  CheckCircle2, XCircle, Clock, Filter, Plane, Download, ChevronDown,
  ChevronUp, ChevronLeft, ChevronRight, RotateCcw, Eye, Calendar, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import * as XLSX from 'xlsx'
import { sanitizeDataForExcel } from '@/lib/security/sanitize'

// ── Types ──

interface Invoice {
  id: string
  booking_id: number
  confirmation_code: string
  invoice_type: 'INVOICE' | 'CREDIT_NOTE'
  status: string
  total_amount: number
  refund_amount: number | null
  currency: string
  customer_name: string | null
  customer_email: string | null
  activity_seller: string | null
  booking_creation_date: string | null
  ps_pratica_id: string | null
  ps_status: string | null
  created_at: string
  sent_to_ps_at: string | null
  error_message: string | null
  created_by: string | null
}

interface InvoiceRule {
  id: string
  name: string
  invoice_date_type: 'travel_date' | 'creation_date' | 'stripe_payment'
  sellers: string[]
  is_active: boolean
}

type StatusFilter = 'all' | 'sent' | 'pending' | 'failed' | 'other'
type InvoiceTypeFilter = 'all' | 'INVOICE' | 'CREDIT_NOTE'
type SortOption =
  | 'sent_desc'
  | 'sent_asc'
  | 'date_desc'
  | 'date_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'customer_asc'
  | 'seller_asc'

interface InvoiceFilters {
  search: string
  ruleId: string
  seller: string
  status: StatusFilter
  invoiceType: InvoiceTypeFilter
  currency: string
  dateStart: string
  dateEnd: string
  amountMin: string
  amountMax: string
  onlyWithPratica: boolean
  onlyWithErrors: boolean
}

// ── Helpers ──

const getCurrentMonthRange = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const lastDay = new Date(y, m + 1, 0).getDate()
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

const { start: monthStart, end: monthEnd } = getCurrentMonthRange()

const defaultFilters: InvoiceFilters = {
  search: '',
  ruleId: 'all',
  seller: 'all',
  status: 'all',
  invoiceType: 'all',
  currency: 'all',
  dateStart: monthStart,
  dateEnd: monthEnd,
  amountMin: '',
  amountMax: '',
  onlyWithPratica: false,
  onlyWithErrors: false,
}

const PAGE_SIZE_OPTIONS = [25, 50, 100]
const AUTO_REFRESH_INTERVAL = 60_000

const normalizeStatus = (value: string | null | undefined) => (value || '').toUpperCase()

const getInvoiceStatusBucket = (invoice: Invoice) => {
  const psStatus = normalizeStatus(invoice.ps_status)
  const status = normalizeStatus(invoice.status)

  if (psStatus === 'INS' || status === 'SENT') return 'sent'
  if (psStatus === 'ERROR' || status === 'FAILED') return 'failed'
  if (psStatus === 'PENDING' || status === 'PENDING') return 'pending'
  return 'other'
}

const matchesDateRange = (dateStr: string | null, start: string, end: string) => {
  if (!start && !end) return true
  if (!dateStr) return false

  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return false

  if (start) {
    const startDate = new Date(start)
    startDate.setHours(0, 0, 0, 0)
    if (date < startDate) return false
  }

  if (end) {
    const endDate = new Date(end)
    endDate.setHours(23, 59, 59, 999)
    if (date > endDate) return false
  }

  return true
}

const parseNumber = (value: string) => {
  if (value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

interface Stats {
  total: number
  sent: number
  pending: number
  failed: number
  other: number
  amountByCurrency: Record<string, number>
}

const buildStats = (items: Invoice[]): Stats => {
  return items.reduce(
    (acc, inv) => {
      const bucket = getInvoiceStatusBucket(inv)
      acc.total += 1
      const cur = inv.currency || 'EUR'
      acc.amountByCurrency[cur] = (acc.amountByCurrency[cur] || 0) + (inv.total_amount || 0)
      if (bucket === 'sent') acc.sent += 1
      else if (bucket === 'pending') acc.pending += 1
      else if (bucket === 'failed') acc.failed += 1
      else acc.other += 1
      return acc
    },
    { total: 0, sent: 0, pending: 0, failed: 0, other: 0, amountByCurrency: {} } as Stats
  )
}

// ── Manual Pratica Form ──

interface ManualPraticaForm {
  isCreditNote: boolean
  firstName: string
  lastName: string
  phone: string
  country: string
  totalAmount: string
  travelDate: string
  confirmationCode: string
  productTitle: string
  sellerName: string
  stripePaymentId: string
  isPersonaFisica: boolean
  codiceFiscale: string
  partitaIva: string
  ragioneSociale: string
}

const defaultManualForm: ManualPraticaForm = {
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
}

// ── Component ──

export default function InvoicesCreatedPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [rules, setRules] = useState<InvoiceRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<InvoiceFilters>(defaultFilters)
  const [sortBy, setSortBy] = useState<SortOption>('sent_desc')
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [retryingId, setRetryingId] = useState<number | null>(null)
  const [retryResults, setRetryResults] = useState<Record<number, 'success' | 'error'>>({})
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null)

  // ── Manual Pratica state ──
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualForm, setManualForm] = useState<ManualPraticaForm>(defaultManualForm)
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [manualSuccess, setManualSuccess] = useState(false)

  // ── Fetch data ──

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/invoices-created')
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setInvoices(data.data || [])
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Error fetching invoices:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch invoices')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRules = useCallback(async () => {
    try {
      const response = await fetch('/api/invoice-rules')
      const data = await response.json()
      setRules(data.data || [])
    } catch (err) {
      console.error('Error fetching rules:', err)
    }
  }, [])

  useEffect(() => {
    fetchInvoices()
    fetchRules()
  }, [fetchInvoices, fetchRules])

  useEffect(() => {
    autoRefreshRef.current = setInterval(() => { fetchInvoices() }, AUTO_REFRESH_INTERVAL)
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current) }
  }, [fetchInvoices])

  // ── Selected rule ──

  const selectedRule = useMemo(() => {
    if (filters.ruleId === 'all') return null
    return rules.find(r => r.id === filters.ruleId) || null
  }, [filters.ruleId, rules])

  const ruleDateType = selectedRule?.invoice_date_type || null
  const dateLabel = ruleDateType === 'travel_date' ? 'Travel Date' : ruleDateType === 'creation_date' ? 'Creation Date' : ruleDateType === 'stripe_payment' ? 'Stripe Payment' : 'Date'

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

  const getStatusBadge = (invoice: Invoice) => {
    const bucket = getInvoiceStatusBucket(invoice)
    if (bucket === 'sent') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle2 className="h-3 w-3" /> Sent to PS
        </span>
      )
    }
    if (bucket === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <XCircle className="h-3 w-3" /> Failed
        </span>
      )
    }
    if (bucket === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <Clock className="h-3 w-3" /> Pending
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        {invoice.status || invoice.ps_status || 'Unknown'}
      </span>
    )
  }

  // ── Get the relevant date for an invoice depending on rule type ──

  const getInvoiceDate = useCallback((inv: Invoice) => {
    // travel_date rules: the cron sends ON the travel date, so sent_to_ps_at IS the travel date
    if (ruleDateType === 'travel_date') return inv.sent_to_ps_at
    if (ruleDateType === 'creation_date') return inv.booking_creation_date
    // No rule selected: default to sent date
    return inv.sent_to_ps_at || inv.created_at
  }, [ruleDateType])

  // ── Filter helpers ──

  const updateFilter = <K extends keyof InvoiceFilters>(key: K, value: InvoiceFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const handleRuleChange = (ruleId: string) => {
    setFilters(prev => ({
      ...prev,
      ruleId,
      seller: 'all',
      dateStart: monthStart,
      dateEnd: monthEnd,
    }))
    setPage(1)
  }

  const resetFilters = () => {
    setFilters({ ...defaultFilters })
    setPage(1)
  }

  // ── Derived filter options ──

  const ruleSellers = useMemo(() => {
    if (!selectedRule) return null
    return new Set(selectedRule.sellers.map(s => s.toLowerCase()))
  }, [selectedRule])

  const uniqueSellers = useMemo(() => {
    let source = invoices
    if (ruleSellers) {
      source = invoices.filter(inv => inv.activity_seller && ruleSellers.has(inv.activity_seller.toLowerCase()))
    }
    return [...new Set(source.map(inv => inv.activity_seller).filter(Boolean))].sort((a, b) =>
      (a || '').localeCompare(b || '')
    ) as string[]
  }, [invoices, ruleSellers])

  const uniqueCurrencies = useMemo(() => {
    return [...new Set(invoices.map(inv => inv.currency).filter(Boolean))].sort((a, b) =>
      (a || '').localeCompare(b || '')
    ) as string[]
  }, [invoices])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.search.trim()) count += 1
    if (filters.ruleId !== 'all') count += 1
    if (filters.seller !== 'all') count += 1
    if (filters.status !== 'all') count += 1
    if (filters.invoiceType !== 'all') count += 1
    if (filters.currency !== 'all') count += 1
    if (filters.dateStart !== monthStart) count += 1
    if (filters.dateEnd !== monthEnd) count += 1
    if (filters.amountMin) count += 1
    if (filters.amountMax) count += 1
    if (filters.onlyWithPratica) count += 1
    if (filters.onlyWithErrors) count += 1
    return count
  }, [filters])

  const hasActiveFilters = activeFilterCount > 0

  // ── Filtering ──

  const filteredInvoices = useMemo(() => {
    const searchValue = filters.search.trim().toLowerCase()
    const minAmount = parseNumber(filters.amountMin)
    const maxAmount = parseNumber(filters.amountMax)

    return invoices.filter(inv => {
      // Rule filter: match sellers in rule
      if (ruleSellers) {
        if (!inv.activity_seller || !ruleSellers.has(inv.activity_seller.toLowerCase())) return false
      }

      const matchesSearch = !searchValue || [
        inv.confirmation_code,
        inv.customer_name,
        inv.customer_email,
        inv.ps_pratica_id,
        inv.activity_seller,
        inv.created_by,
      ].some(value => value?.toLowerCase().includes(searchValue))

      const matchesSeller = filters.seller === 'all' || inv.activity_seller === filters.seller
      const matchesStatus = filters.status === 'all' || getInvoiceStatusBucket(inv) === filters.status
      const matchesType = filters.invoiceType === 'all' || inv.invoice_type === filters.invoiceType
      const matchesCurrency = filters.currency === 'all' || inv.currency === filters.currency

      // Date filter based on rule type
      // travel_date rules: cron sends ON the travel date, so sent_to_ps_at IS the travel date
      const dateField = ruleDateType === 'travel_date'
        ? inv.sent_to_ps_at
        : ruleDateType === 'creation_date'
          ? inv.booking_creation_date
          : (inv.sent_to_ps_at || inv.created_at)
      const matchesDate = matchesDateRange(dateField, filters.dateStart, filters.dateEnd)

      const amount = inv.total_amount || 0
      const matchesAmount = (minAmount === null || amount >= minAmount) &&
        (maxAmount === null || amount <= maxAmount)

      const matchesPratica = !filters.onlyWithPratica || !!inv.ps_pratica_id
      const matchesErrors = !filters.onlyWithErrors ||
        !!inv.error_message ||
        getInvoiceStatusBucket(inv) === 'failed'

      return (
        matchesSearch &&
        matchesSeller &&
        matchesStatus &&
        matchesType &&
        matchesCurrency &&
        matchesDate &&
        matchesAmount &&
        matchesPratica &&
        matchesErrors
      )
    })
  }, [filters, invoices, ruleSellers, ruleDateType])

  // ── Sorting ──

  const sortedInvoices = useMemo(() => {
    const sorted = [...filteredInvoices]
    const getDateValue = (value: string | null) => {
      if (!value) return 0
      const time = new Date(value).getTime()
      return Number.isNaN(time) ? 0 : time
    }

    switch (sortBy) {
      case 'sent_asc':
        sorted.sort((a, b) => getDateValue(a.sent_to_ps_at || a.created_at) - getDateValue(b.sent_to_ps_at || b.created_at))
        break
      case 'date_desc':
        sorted.sort((a, b) => getDateValue(getInvoiceDate(b)) - getDateValue(getInvoiceDate(a)))
        break
      case 'date_asc':
        sorted.sort((a, b) => getDateValue(getInvoiceDate(a)) - getDateValue(getInvoiceDate(b)))
        break
      case 'amount_desc':
        sorted.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0))
        break
      case 'amount_asc':
        sorted.sort((a, b) => (a.total_amount || 0) - (b.total_amount || 0))
        break
      case 'customer_asc':
        sorted.sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''))
        break
      case 'seller_asc':
        sorted.sort((a, b) => (a.activity_seller || '').localeCompare(b.activity_seller || ''))
        break
      case 'sent_desc':
      default:
        sorted.sort((a, b) => getDateValue(b.sent_to_ps_at || b.created_at) - getDateValue(a.sent_to_ps_at || a.created_at))
        break
    }

    return sorted
  }, [filteredInvoices, sortBy, getInvoiceDate])

  // ── Pagination ──

  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / pageSize))
  const safeCurrentPage = Math.min(page, totalPages)
  const paginatedInvoices = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize
    return sortedInvoices.slice(start, start + pageSize)
  }, [sortedInvoices, safeCurrentPage, pageSize])

  useEffect(() => { setPage(1) }, [sortBy])

  // ── Stats ──

  const filteredStats = useMemo(() => buildStats(filteredInvoices), [filteredInvoices])

  // ── Retry ──

  const retryInvoice = async (bookingId: number) => {
    setRetryingId(bookingId)
    try {
      const response = await fetch(`/api/invoice-pending/${bookingId}/send`, { method: 'POST' })
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setRetryResults(prev => ({ ...prev, [bookingId]: 'success' }))
      setTimeout(() => {
        setRetryResults(prev => { const next = { ...prev }; delete next[bookingId]; return next })
        fetchInvoices()
      }, 2000)
    } catch {
      setRetryResults(prev => ({ ...prev, [bookingId]: 'error' }))
      setTimeout(() => {
        setRetryResults(prev => { const next = { ...prev }; delete next[bookingId]; return next })
      }, 3000)
    } finally {
      setRetryingId(null)
    }
  }

  // ── Export ──

  const exportToExcel = () => {
    const rows = sortedInvoices.map(inv => ({
      'Confirmation Code': inv.confirmation_code,
      'Booking ID': inv.booking_id,
      'Type': inv.invoice_type,
      'Customer': inv.customer_name || '',
      'Email': inv.customer_email || '',
      'Seller': inv.activity_seller || '',
      'Booking Creation Date': inv.booking_creation_date ? formatDate(inv.booking_creation_date) : '',
      'Amount': inv.total_amount || 0,
      'Refund Amount': inv.refund_amount || '',
      'Currency': inv.currency || '',
      'PS Pratica ID': inv.ps_pratica_id || '',
      'Status': getInvoiceStatusBucket(inv),
      'PS Status': inv.ps_status || '',
      'Sent At': inv.sent_to_ps_at ? formatDateTime(inv.sent_to_ps_at) : '',
      'Created At': formatDateTime(inv.created_at),
      'Created By': inv.created_by || '',
      'Error': inv.error_message || '',
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(sanitizeDataForExcel(rows as unknown as Record<string, unknown>[]))
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
    const date = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `invoices-created-${date}.xlsx`)
  }

  const formatAmountsByCurrency = (amountByCurrency: Record<string, number>) => {
    const entries = Object.entries(amountByCurrency).sort((a, b) => b[1] - a[1])
    if (entries.length === 0) return formatCurrency(0, 'EUR')
    if (entries.length === 1) return formatCurrency(entries[0][1], entries[0][0])
    return entries.map(([cur, amt]) => formatCurrency(amt, cur)).join(' / ')
  }

  // ── Manual Pratica ──

  const openManualForm = () => {
    setManualForm(defaultManualForm)
    setManualError(null)
    setManualSuccess(false)
    setShowManualForm(true)
  }

  const updateManualForm = <K extends keyof ManualPraticaForm>(key: K, value: ManualPraticaForm[K]) => {
    setManualForm(prev => ({ ...prev, [key]: value }))
  }

  const submitManualPratica = async () => {
    // Client-side validation
    if (manualForm.isPersonaFisica) {
      if (!manualForm.firstName.trim() || !manualForm.lastName.trim()) {
        setManualError('First name and last name are required')
        return
      }
    } else {
      if (!manualForm.ragioneSociale.trim()) {
        setManualError('Ragione Sociale is required for persona giuridica')
        return
      }
      if (!manualForm.partitaIva.trim()) {
        setManualError('Partita IVA is required for persona giuridica')
        return
      }
    }
    const amount = parseFloat(manualForm.totalAmount)
    if (!amount || amount <= 0) {
      setManualError('Amount must be greater than 0')
      return
    }

    setManualSubmitting(true)
    setManualError(null)
    try {
      const payload: Record<string, unknown> = {
        totalAmount: amount,
        isPersonaFisica: manualForm.isPersonaFisica,
        isCreditNote: manualForm.isCreditNote,
      }
      if (manualForm.isPersonaFisica) {
        payload.firstName = manualForm.firstName.trim()
        payload.lastName = manualForm.lastName.trim()
        if (manualForm.codiceFiscale.trim()) {
          payload.codiceFiscale = manualForm.codiceFiscale.trim()
        }
      } else {
        payload.ragioneSociale = manualForm.ragioneSociale.trim()
        payload.partitaIva = manualForm.partitaIva.trim()
      }
      if (manualForm.travelDate) payload.travelDate = manualForm.travelDate
      if (manualForm.confirmationCode.trim()) payload.confirmationCode = manualForm.confirmationCode.trim()
      if (manualForm.productTitle.trim()) payload.productTitle = manualForm.productTitle.trim()
      if (manualForm.phone.trim()) payload.phone = manualForm.phone.trim()
      if (manualForm.country.trim()) payload.country = manualForm.country.trim()
      if (manualForm.sellerName.trim()) payload.sellerName = manualForm.sellerName.trim()
      if (manualForm.stripePaymentId.trim()) payload.stripePaymentId = manualForm.stripePaymentId.trim()

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
        fetchInvoices()
      }, 1500)
    } catch (err) {
      setManualError(err instanceof Error ? err.message : manualForm.isCreditNote ? 'Failed to create credit note' : 'Failed to create pratica')
    } finally {
      setManualSubmitting(false)
    }
  }

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices Created</h1>
          <p className="text-sm text-gray-500 mt-1">
            All invoices sent to Partner Solution
            <span className="ml-2 text-gray-400">
              Updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openManualForm}>
            <Plus className="h-4 w-4 mr-2" /> Manual Pratica
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel} disabled={loading || sortedInvoices.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={fetchInvoices} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
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

      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">Summary</div>
        <div className="text-xs text-gray-500">
          {filteredInvoices.length} of {invoices.length} invoices
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-gray-900">{filteredStats.total}</div>
          <div className="text-sm text-gray-500">Invoices</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-green-600">{filteredStats.sent}</div>
          <div className="text-sm text-gray-500">Sent to PS</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-yellow-600">{filteredStats.pending}</div>
          <div className="text-sm text-gray-500">Pending</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-red-600">{filteredStats.failed}</div>
          <div className="text-sm text-gray-500">Failed</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-lg font-bold text-gray-900 truncate" title={formatAmountsByCurrency(filteredStats.amountByCurrency)}>
            {formatAmountsByCurrency(filteredStats.amountByCurrency)}
          </div>
          <div className="text-sm text-gray-500">Total Amount</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                {activeFilterCount} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              Showing {sortedInvoices.length} of {invoices.length}
            </span>
            {filtersOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </div>
        </button>

        {filtersOpen && (
          <div className="px-4 pb-4 space-y-4 border-t">
            <div className="flex justify-end pt-3">
              <Button size="sm" variant="ghost" onClick={resetFilters} disabled={!hasActiveFilters}>
                Clear all
              </Button>
            </div>

            {/* Row 1: Rule + Date range */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-xs font-medium text-gray-600">
                Invoice Rule
                <select
                  value={filters.ruleId}
                  onChange={(e) => handleRuleChange(e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All rules</option>
                  {rules.map(rule => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name} ({rule.invoice_date_type === 'travel_date' ? 'Travel Date' : rule.invoice_date_type === 'stripe_payment' ? 'Stripe Payment' : 'Creation Date'})
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-medium text-gray-600">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {dateLabel} From
                </span>
                <Input
                  type="date"
                  value={filters.dateStart}
                  onChange={(e) => updateFilter('dateStart', e.target.value)}
                  className="mt-1 text-sm"
                />
              </label>

              <label className="text-xs font-medium text-gray-600">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {dateLabel} To
                </span>
                <Input
                  type="date"
                  value={filters.dateEnd}
                  onChange={(e) => updateFilter('dateEnd', e.target.value)}
                  className="mt-1 text-sm"
                />
              </label>
            </div>

            {/* Row 2: Other filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <label className="text-xs font-medium text-gray-600">
                Search
                <div className="mt-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Code, customer, seller, email, pratica..."
                    value={filters.search}
                    onChange={(e) => updateFilter('search', e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </label>

              <label className="text-xs font-medium text-gray-600">
                Seller
                <select
                  value={filters.seller}
                  onChange={(e) => updateFilter('seller', e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All sellers</option>
                  {uniqueSellers.map(seller => (
                    <option key={seller} value={seller}>{seller}</option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-medium text-gray-600">
                Status
                <select
                  value={filters.status}
                  onChange={(e) => updateFilter('status', e.target.value as StatusFilter)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All statuses</option>
                  <option value="sent">Sent to PS</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="text-xs font-medium text-gray-600">
                Invoice Type
                <select
                  value={filters.invoiceType}
                  onChange={(e) => updateFilter('invoiceType', e.target.value as InvoiceTypeFilter)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All types</option>
                  <option value="INVOICE">Invoice</option>
                  <option value="CREDIT_NOTE">Credit Note</option>
                </select>
              </label>

              <label className="text-xs font-medium text-gray-600">
                Currency
                <select
                  value={filters.currency}
                  onChange={(e) => updateFilter('currency', e.target.value)}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All currencies</option>
                  {uniqueCurrencies.map(currency => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-medium text-gray-600">
                Amount Min
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={filters.amountMin}
                  onChange={(e) => updateFilter('amountMin', e.target.value)}
                  className="mt-1 text-sm"
                />
              </label>

              <label className="text-xs font-medium text-gray-600">
                Amount Max
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={filters.amountMax}
                  onChange={(e) => updateFilter('amountMax', e.target.value)}
                  className="mt-1 text-sm"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  checked={filters.onlyWithPratica}
                  onChange={(e) => updateFilter('onlyWithPratica', e.target.checked)}
                />
                Only with pratica ID
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  checked={filters.onlyWithErrors}
                  onChange={(e) => updateFilter('onlyWithErrors', e.target.checked)}
                />
                Only with errors
              </label>

              <div className="flex items-center gap-2 text-sm text-gray-600 ml-auto">
                <span className="text-xs uppercase tracking-wide text-gray-400">Sort</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="sent_desc">Sent date (newest)</option>
                  <option value="sent_asc">Sent date (oldest)</option>
                  <option value="date_desc">{dateLabel} (latest)</option>
                  <option value="date_asc">{dateLabel} (earliest)</option>
                  <option value="amount_desc">Amount (high to low)</option>
                  <option value="amount_asc">Amount (low to high)</option>
                  <option value="customer_asc">Customer (A-Z)</option>
                  <option value="seller_asc">Seller (A-Z)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 flex gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-20" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex gap-4 border-t">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      ) : sortedInvoices.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
          <Receipt className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {invoices.length === 0 ? 'No invoices yet' : 'No invoices match your filters'}
          </h3>
          <p className="text-gray-500">
            {invoices.length === 0
              ? 'Invoices will appear here once they are sent to Partner Solution'
              : 'Try adjusting or clearing filters to see more results.'}
          </p>
          {hasActiveFilters && (
            <Button size="sm" variant="outline" onClick={resetFilters} className="mt-4">
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Booking</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dateLabel}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PS Pratica</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sent At</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedInvoices.map((invoice) => {
                    const bucket = getInvoiceStatusBucket(invoice)
                    const isCreditNote = invoice.invoice_type === 'CREDIT_NOTE'
                    const retryResult = retryResults[invoice.booking_id]
                    const displayDate = getInvoiceDate(invoice)
                    return (
                      <tr
                        key={invoice.id}
                        className={`hover:bg-gray-50 cursor-pointer ${isCreditNote ? 'border-l-4 border-l-red-300' : ''}`}
                        onClick={() => setSelectedInvoice(invoice)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="font-mono text-sm font-medium text-gray-900">
                              {invoice.confirmation_code}
                            </div>
                            {invoice.invoice_type && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                isCreditNote ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                              }`}>
                                {isCreditNote ? 'Credit note' : 'Invoice'}
                              </span>
                            )}
                          </div>
                          {invoice.activity_seller && (
                            <div className="text-xs text-gray-500">{invoice.activity_seller}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm text-gray-900">
                            <User className="h-3.5 w-3.5 text-gray-400" />
                            {invoice.customer_name || '-'}
                          </div>
                          {invoice.customer_email && invoice.customer_email !== 'civitatis@civitatis.com' && (
                            <div className="text-xs text-gray-500 truncate max-w-[200px]">
                              {invoice.customer_email}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            {ruleDateType === 'creation_date'
                              ? <Calendar className="h-3.5 w-3.5 text-gray-400" />
                              : <Plane className="h-3.5 w-3.5 text-blue-500" />}
                            {formatDate(displayDate)}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                            <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                            {isCreditNote
                              ? formatCurrency(Math.abs(invoice.refund_amount ?? invoice.total_amount), invoice.currency)
                              : formatCurrency(invoice.total_amount, invoice.currency)}
                          </div>
                          {isCreditNote && invoice.refund_amount != null && (
                            <div className="text-xs text-gray-400">
                              Invoice: {formatCurrency(Math.abs(invoice.total_amount), invoice.currency)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {invoice.ps_pratica_id ? (
                            <span className="font-mono text-sm text-blue-600">{invoice.ps_pratica_id}</span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {getStatusBadge(invoice)}
                          {invoice.error_message && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="text-xs text-red-500 mt-1 max-w-[200px] truncate cursor-help">
                                  {invoice.error_message}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm whitespace-pre-wrap">
                                {invoice.error_message}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-sm text-gray-500">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDateTime(invoice.sent_to_ps_at || invoice.created_at)}
                          </div>
                          {invoice.created_by && (
                            <div className="text-xs text-gray-400">{invoice.created_by}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost" size="sm" className="h-7 w-7 p-0"
                              onClick={() => setSelectedInvoice(invoice)} title="View details"
                            >
                              <Eye className="h-3.5 w-3.5 text-gray-500" />
                            </Button>
                            {bucket === 'failed' && (
                              <Button
                                variant="ghost" size="sm"
                                className={`h-7 w-7 p-0 ${
                                  retryResult === 'success' ? 'text-green-600' :
                                  retryResult === 'error' ? 'text-red-600' : ''
                                }`}
                                onClick={() => retryInvoice(invoice.booking_id)}
                                disabled={retryingId === invoice.booking_id}
                                title="Retry sending"
                              >
                                {retryingId === invoice.booking_id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : retryResult === 'success' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : retryResult === 'error' ? (
                                  <XCircle className="h-3.5 w-3.5" />
                                ) : (
                                  <RotateCcw className="h-3.5 w-3.5 text-gray-500" />
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
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
                {((safeCurrentPage - 1) * pageSize) + 1}-{Math.min(safeCurrentPage * pageSize, sortedInvoices.length)} of {sortedInvoices.length}
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
            <SheetTitle>Manual Pratica</SheetTitle>
            <SheetDescription>Create and send a pratica to Partner Solution manually</SheetDescription>
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
                    name="docType"
                    checked={!manualForm.isCreditNote}
                    onChange={() => updateManualForm('isCreditNote', false)}
                    disabled={manualSubmitting || manualSuccess}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  Invoice
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="docType"
                    checked={manualForm.isCreditNote}
                    onChange={() => updateManualForm('isCreditNote', true)}
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

              {/* Persona type toggle */}
              <div className="flex items-center gap-4 mb-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="personaType"
                    checked={manualForm.isPersonaFisica}
                    onChange={() => updateManualForm('isPersonaFisica', true)}
                    disabled={manualSubmitting || manualSuccess}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  Persona Fisica
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="personaType"
                    checked={!manualForm.isPersonaFisica}
                    onChange={() => updateManualForm('isPersonaFisica', false)}
                    disabled={manualSubmitting || manualSuccess}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  Persona Giuridica
                </label>
              </div>

              {manualForm.isPersonaFisica ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-medium text-gray-600">
                    First Name *
                    <Input
                      value={manualForm.firstName}
                      onChange={(e) => updateManualForm('firstName', e.target.value)}
                      placeholder="Mario"
                      className="mt-1"
                      disabled={manualSubmitting || manualSuccess}
                    />
                  </label>
                  <label className="text-xs font-medium text-gray-600">
                    Last Name *
                    <Input
                      value={manualForm.lastName}
                      onChange={(e) => updateManualForm('lastName', e.target.value)}
                      placeholder="Rossi"
                      className="mt-1"
                      disabled={manualSubmitting || manualSuccess}
                    />
                  </label>
                </div>
              ) : (
                <label className="text-xs font-medium text-gray-600">
                  Ragione Sociale *
                  <Input
                    value={manualForm.ragioneSociale}
                    onChange={(e) => updateManualForm('ragioneSociale', e.target.value)}
                    placeholder="Azienda S.r.l."
                    className="mt-1"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
              )}

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-gray-600">
                  Phone
                  <Input
                    value={manualForm.phone}
                    onChange={(e) => updateManualForm('phone', e.target.value)}
                    placeholder="+39 333 1234567"
                    className="mt-1"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Country
                  <Input
                    value={manualForm.country}
                    onChange={(e) => updateManualForm('country', e.target.value.toUpperCase())}
                    placeholder="ES"
                    maxLength={2}
                    className="mt-1 font-mono"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
              </div>

              {/* Conditional fields */}
              {manualForm.isPersonaFisica ? (
                <div className="mt-3">
                  <label className="text-xs font-medium text-gray-600">
                    Codice Fiscale
                    <Input
                      value={manualForm.codiceFiscale}
                      onChange={(e) => updateManualForm('codiceFiscale', e.target.value.toUpperCase())}
                      placeholder="RSSMRA80A01H501U"
                      maxLength={16}
                      className="mt-1 font-mono"
                      disabled={manualSubmitting || manualSuccess}
                    />
                  </label>
                </div>
              ) : (
                <div className="mt-3">
                  <label className="text-xs font-medium text-gray-600">
                    Partita IVA *
                    <Input
                      value={manualForm.partitaIva}
                      onChange={(e) => updateManualForm('partitaIva', e.target.value)}
                      placeholder="12345678901"
                      maxLength={11}
                      className="mt-1 font-mono"
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
                    onChange={(e) => updateManualForm('totalAmount', e.target.value)}
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
                    onChange={(e) => updateManualForm('travelDate', e.target.value)}
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
                    onChange={(e) => updateManualForm('productTitle', e.target.value)}
                    placeholder="Tour UE ed Extra UE"
                    className="mt-1"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Seller Name
                  <Input
                    value={manualForm.sellerName}
                    onChange={(e) => updateManualForm('sellerName', e.target.value)}
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
                    onChange={(e) => updateManualForm('confirmationCode', e.target.value)}
                    placeholder="Auto-generated"
                    className="mt-1 font-mono"
                    disabled={manualSubmitting || manualSuccess}
                  />
                </label>
                <label className="text-xs font-medium text-gray-600">
                  Stripe Payment ID
                  <Input
                    value={manualForm.stripePaymentId}
                    onChange={(e) => updateManualForm('stripePaymentId', e.target.value)}
                    placeholder="UUID"
                    className="mt-1 font-mono"
                    disabled={manualSubmitting || manualSuccess}
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

      {/* Detail Sheet */}
      <Sheet open={!!selectedInvoice} onOpenChange={(open) => { if (!open) setSelectedInvoice(null) }}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          {selectedInvoice && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="font-mono">{selectedInvoice.confirmation_code}</span>
                  {selectedInvoice.invoice_type && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedInvoice.invoice_type === 'CREDIT_NOTE' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {selectedInvoice.invoice_type === 'CREDIT_NOTE' ? 'Credit Note' : 'Invoice'}
                    </span>
                  )}
                </SheetTitle>
                <SheetDescription>Booking #{selectedInvoice.booking_id}</SheetDescription>
              </SheetHeader>

              <div className="px-4 space-y-6">
                <div className="flex items-center gap-3">
                  {getStatusBadge(selectedInvoice)}
                  {getInvoiceStatusBucket(selectedInvoice) === 'failed' && (
                    <Button variant="outline" size="sm"
                      onClick={() => retryInvoice(selectedInvoice.booking_id)}
                      disabled={retryingId === selectedInvoice.booking_id}
                    >
                      {retryingId === selectedInvoice.booking_id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
                      Retry
                    </Button>
                  )}
                </div>

                {selectedInvoice.error_message && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="text-xs font-medium text-red-800 mb-1">Error</div>
                    <div className="text-sm text-red-700 whitespace-pre-wrap break-words">
                      {selectedInvoice.error_message}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <DetailRow label="Customer" value={selectedInvoice.customer_name} />
                  <DetailRow label="Email" value={selectedInvoice.customer_email} />
                  <DetailRow label="Seller" value={selectedInvoice.activity_seller} />
                  <DetailRow label="Booking Creation Date" value={formatDate(selectedInvoice.booking_creation_date)} />
                  {selectedInvoice.invoice_type === 'CREDIT_NOTE' ? (
                    <>
                      <DetailRow label="Refund Amount" value={formatCurrency(Math.abs(selectedInvoice.refund_amount ?? selectedInvoice.total_amount), selectedInvoice.currency)} />
                      {selectedInvoice.refund_amount != null && (
                        <DetailRow label="Original Invoice" value={formatCurrency(Math.abs(selectedInvoice.total_amount), selectedInvoice.currency)} />
                      )}
                    </>
                  ) : (
                    <DetailRow label="Amount" value={formatCurrency(selectedInvoice.total_amount, selectedInvoice.currency)} />
                  )}
                  <DetailRow label="Currency" value={selectedInvoice.currency} />
                  <DetailRow label="PS Pratica ID" value={selectedInvoice.ps_pratica_id} mono />
                  <DetailRow label="PS Status" value={selectedInvoice.ps_status} />
                  <DetailRow label="Sent to PS" value={formatDateTime(selectedInvoice.sent_to_ps_at)} />
                  <DetailRow label="Created At" value={formatDateTime(selectedInvoice.created_at)} />
                  <DetailRow label="Created By" value={selectedInvoice.created_by} />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className={`text-sm text-gray-900 text-right break-all ${mono ? 'font-mono' : ''}`}>
        {value || '-'}
      </span>
    </div>
  )
}
