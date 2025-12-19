'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { format, subDays } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import {
  Send,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
  Calendar,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Plus,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

interface MonthlyPratica {
  id: string
  year_month: string
  partner_pratica_id: string | null
  partner_pratica_number: string | null
  ps_status: 'WP' | 'INS'
  total_amount: number
  booking_count: number
  created_at: string
  finalized_at: string | null
}

interface Invoice {
  id: string
  booking_id: number
  confirmation_code: string
  invoice_type: 'INVOICE' | 'CREDIT_NOTE'
  status: string
  total_amount: number
  currency: string
  customer_name: string | null
  customer_email: string | null
  seller_name: string | null
  booking_creation_date: string | null
  created_at: string
  sent_at: string | null
  error_message: string | null
}

interface BookingForInvoicing {
  booking_id: number
  confirmation_code: string
  total_price: number
  currency: string
  creation_date: string
  customer_name: string | null
  activity_seller: string | null
  payment_type: string | null
}

interface Config {
  auto_invoice_enabled: boolean
  auto_credit_note_enabled: boolean
  auto_invoice_sellers: string[]
  default_regime: string
  default_sales_type: string
  invoice_start_date: string | null
}

interface Stats {
  totalInvoices: number
  pending: number
  sent: number
  failed: number
  totalAmount: number
  monthlyPraticas: {
    total: number
    open: number
    finalized: number
  }
}

interface ManualInvoiceForm {
  confirmation_code: string
  customer_name: string
  customer_email: string
  customer_phone: string
  description: string
  service_date: string
  amount: string
  supplier_code: string
  supplier_name: string
  regime: string
  sales_type: string
}

const WEBHOOK_API_URL = process.env.NEXT_PUBLIC_WEBHOOK_API_URL || ''
const INVOICE_API_KEY = process.env.NEXT_PUBLIC_INVOICE_API_KEY || ''

export default function InvoicingPage() {
  // State
  const [monthlyPraticas, setMonthlyPraticas] = useState<MonthlyPratica[]>([])
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const [monthInvoices, setMonthInvoices] = useState<Invoice[]>([])
  const [uninvoicedBookings, setUninvoicedBookings] = useState<BookingForInvoicing[]>([])
  const [selectedBookings, setSelectedBookings] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [sending, setSending] = useState(false)
  const [finalizing, setFinalizing] = useState<string | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)

  // Filters
  const [dateFrom, setDateFrom] = useState<string>(format(subDays(new Date(), 90), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sellerFilter, setSellerFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'monthly' | 'pending' | 'credit-notes'>('monthly')
  const [creditNotes, setCreditNotes] = useState<Invoice[]>([])
  const [loadingCreditNotes, setLoadingCreditNotes] = useState(false)

  // Stats
  const [stats, setStats] = useState<Stats>({
    totalInvoices: 0,
    pending: 0,
    sent: 0,
    failed: 0,
    totalAmount: 0,
    monthlyPraticas: {
      total: 0,
      open: 0,
      finalized: 0,
    },
  })

  // Available sellers for filter
  const [availableSellers, setAvailableSellers] = useState<string[]>([])

  // Manual invoice dialog
  const [showManualInvoiceDialog, setShowManualInvoiceDialog] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [manualInvoice, setManualInvoice] = useState<ManualInvoiceForm>({
    confirmation_code: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    description: '',
    service_date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    supplier_code: 'ENROMA',
    supplier_name: 'EnRoma Tours',
    regime: '74T',
    sales_type: 'ORG',
  })

  // Fetch monthly praticas from database
  const fetchMonthlyPraticas = useCallback(async () => {
    setLoading(true)
    try {
      const startMonth = dateFrom.substring(0, 7)
      const endMonth = dateTo.substring(0, 7)

      let query = supabase
        .from('monthly_praticas')
        .select('*')
        .gte('year_month', startMonth)
        .lte('year_month', endMonth)
        .order('year_month', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('ps_status', statusFilter)
      }

      const { data, error } = await query

      if (error) throw error
      setMonthlyPraticas(data || [])

      // Calculate stats
      const praticas = data || []
      const newStats: Stats = {
        totalInvoices: praticas.reduce((sum, p) => sum + p.booking_count, 0),
        pending: 0,
        sent: praticas.reduce((sum, p) => sum + p.booking_count, 0),
        failed: 0,
        totalAmount: praticas.reduce((sum, p) => sum + Number(p.total_amount), 0),
        monthlyPraticas: {
          total: praticas.length,
          open: praticas.filter((p) => p.ps_status === 'WP').length,
          finalized: praticas.filter((p) => p.ps_status === 'INS').length,
        },
      }
      setStats(newStats)
    } catch (error) {
      console.error('Error fetching monthly praticas:', error)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, statusFilter])

  // Fetch invoices for a specific month
  const fetchMonthInvoices = async (yearMonth: string) => {
    setLoadingInvoices(true)
    try {
      const { data: pratica } = await supabase
        .from('monthly_praticas')
        .select('id')
        .eq('year_month', yearMonth)
        .single()

      if (pratica) {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('*')
          .eq('monthly_pratica_id', pratica.id)
          .order('created_at', { ascending: false })

        setMonthInvoices(invoices || [])
      }
    } catch (error) {
      console.error('Error fetching month invoices:', error)
    } finally {
      setLoadingInvoices(false)
    }
  }

  // Fetch bookings without invoices
  const fetchUninvoicedBookings = useCallback(async () => {
    try {
      // Use invoice_start_date from config if set, otherwise use dateFrom
      const effectiveStartDate = config?.invoice_start_date || dateFrom

      // Get bookings with their invoice status
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(
          `
          booking_id,
          confirmation_code,
          total_price,
          currency,
          creation_date,
          payment_type,
          booking_customers(
            customers(first_name, last_name)
          ),
          activity_bookings(activity_seller)
        `
        )
        .gte('creation_date', effectiveStartDate)
        .lte('creation_date', dateTo + 'T23:59:59')
        .eq('status', 'CONFIRMED')
        .order('creation_date', { ascending: false })

      if (bookingsError) throw bookingsError

      // Get existing invoice booking IDs
      const { data: existingInvoices } = await supabase
        .from('invoices')
        .select('booking_id')
        .eq('invoice_type', 'INVOICE')

      const invoicedBookingIds = new Set(existingInvoices?.map((i) => i.booking_id) || [])

      // Filter to only uninvoiced bookings
      const uninvoiced = (bookings || [])
        .filter((b) => !invoicedBookingIds.has(b.booking_id))
        .filter((b) => sellerFilter === 'all' || b.activity_bookings?.some((a: { activity_seller: string }) => a.activity_seller === sellerFilter))
        .map((b) => ({
          booking_id: b.booking_id,
          confirmation_code: b.confirmation_code,
          total_price: b.total_price,
          currency: b.currency,
          creation_date: b.creation_date,
          payment_type: b.payment_type,
          customer_name: (() => {
            const cust = b.booking_customers?.[0]?.customers as unknown
            if (Array.isArray(cust) && cust[0]) {
              return `${cust[0].first_name || ''} ${cust[0].last_name || ''}`.trim() || null
            }
            if (cust && typeof cust === 'object' && 'first_name' in cust) {
              const c = cust as { first_name: string; last_name: string }
              return `${c.first_name || ''} ${c.last_name || ''}`.trim() || null
            }
            return null
          })(),
          activity_seller: b.activity_bookings?.[0]?.activity_seller || null,
        }))

      setUninvoicedBookings(uninvoiced)
    } catch (error) {
      console.error('Error fetching uninvoiced bookings:', error)
    }
  }, [dateFrom, dateTo, sellerFilter, config?.invoice_start_date])

  // Fetch available sellers
  const fetchAvailableSellers = async () => {
    try {
      const { data } = await supabase
        .from('sellers')
        .select('title')
        .not('title', 'is', null)
        .order('title')

      setAvailableSellers(data?.map((s) => s.title) || [])
    } catch (error) {
      console.error('Error fetching sellers:', error)
    }
  }

  // Fetch credit notes
  const fetchCreditNotes = async () => {
    setLoadingCreditNotes(true)
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('invoice_type', 'CREDIT_NOTE')
        .order('created_at', { ascending: false })

      if (error) throw error
      setCreditNotes(data || [])
    } catch (error) {
      console.error('Error fetching credit notes:', error)
    } finally {
      setLoadingCreditNotes(false)
    }
  }

  // Fetch config
  const fetchConfig = async () => {
    try {
      const { data } = await supabase.from('partner_solution_config').select('*').single()

      if (data) {
        setConfig({
          auto_invoice_enabled: data.auto_invoice_enabled,
          auto_credit_note_enabled: data.auto_credit_note_enabled,
          auto_invoice_sellers: data.auto_invoice_sellers || [],
          default_regime: data.default_regime,
          default_sales_type: data.default_sales_type,
          invoice_start_date: data.invoice_start_date || null,
        })
      }
    } catch (error) {
      console.error('Error fetching config:', error)
    }
  }

  // Save config
  const saveConfig = async () => {
    if (!config) return

    setSavingConfig(true)
    try {
      // First get the config id
      const { data: currentConfig } = await supabase
        .from('partner_solution_config')
        .select('id')
        .single()

      if (!currentConfig?.id) {
        throw new Error('Config not found')
      }

      const { error } = await supabase
        .from('partner_solution_config')
        .update({
          auto_invoice_enabled: config.auto_invoice_enabled,
          auto_credit_note_enabled: config.auto_credit_note_enabled,
          auto_invoice_sellers: config.auto_invoice_sellers,
          default_regime: config.default_regime,
          default_sales_type: config.default_sales_type,
          invoice_start_date: config.invoice_start_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentConfig.id)

      if (error) {
        console.error('Supabase error:', error.message, error.details, error.hint)
        throw error
      }
      setShowConfigDialog(false)
      // Refetch config and uninvoiced bookings
      fetchConfig()
      fetchUninvoicedBookings()
    } catch (error: unknown) {
      const err = error as Error
      console.error('Error saving config:', err.message || error)
      alert('Error saving: ' + (err.message || 'Unknown error'))
    } finally {
      setSavingConfig(false)
    }
  }

  useEffect(() => {
    fetchMonthlyPraticas()
    fetchAvailableSellers()
    fetchConfig()
    fetchCreditNotes()
  }, [fetchMonthlyPraticas])

  // Refetch uninvoiced bookings when config loads or changes
  useEffect(() => {
    if (config !== null) {
      fetchUninvoicedBookings()
    }
  }, [config, fetchUninvoicedBookings])

  // Toggle month expansion
  const toggleMonthExpansion = async (yearMonth: string) => {
    if (expandedMonth === yearMonth) {
      setExpandedMonth(null)
      setMonthInvoices([])
    } else {
      setExpandedMonth(yearMonth)
      await fetchMonthInvoices(yearMonth)
    }
  }

  // Finalize a monthly pratica
  const finalizePratica = async (yearMonth: string) => {
    if (!confirm(`Are you sure you want to finalize the invoice for ${yearMonth}? This cannot be undone.`)) {
      return
    }

    setFinalizing(yearMonth)
    try {
      const response = await fetch(`${WEBHOOK_API_URL}/api/invoices/monthly-praticas/${yearMonth}/finalize`, {
        method: 'POST',
        headers: {
          'x-api-key': INVOICE_API_KEY,
        },
      })

      const result = await response.json()

      if (result.success) {
        alert(`Monthly invoice for ${yearMonth} has been finalized.`)
        fetchMonthlyPraticas()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error('Error finalizing pratica:', error)
      alert('Error finalizing invoice. Check console for details.')
    } finally {
      setFinalizing(null)
    }
  }

  // Create invoices for selected bookings via API
  const createInvoices = async () => {
    if (selectedBookings.length === 0) return

    setSending(true)
    try {
      const response = await fetch(`${WEBHOOK_API_URL}/api/invoices/create-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': INVOICE_API_KEY,
        },
        body: JSON.stringify({
          bookingIds: selectedBookings,
          triggeredBy: 'manual',
        }),
      })

      const result = await response.json()

      if (result.results) {
        alert(
          `Added to monthly invoices: ${result.results.success.length}, Failed: ${result.results.failed.length}`
        )
      }

      // Refresh data
      setSelectedBookings([])
      fetchMonthlyPraticas()
      fetchUninvoicedBookings()
    } catch (error) {
      console.error('Error creating invoices:', error)
      alert('Error creating invoices. Check console for details.')
    } finally {
      setSending(false)
    }
  }

  // Retry failed invoices
  const retryFailed = async () => {
    setSending(true)
    try {
      await fetch(`${WEBHOOK_API_URL}/api/invoices/retry-failed`, {
        method: 'POST',
        headers: {
          'x-api-key': INVOICE_API_KEY,
        },
      })

      fetchMonthlyPraticas()
    } catch (error) {
      console.error('Error retrying invoices:', error)
    } finally {
      setSending(false)
    }
  }

  // Create manual invoice
  const createManualInvoice = async () => {
    if (!manualInvoice.confirmation_code || !manualInvoice.amount) {
      alert('Please fill in confirmation code and amount')
      return
    }

    setCreatingInvoice(true)
    try {
      const response = await fetch(`${WEBHOOK_API_URL}/api/invoices/send-to-partner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': INVOICE_API_KEY,
        },
        body: JSON.stringify({
          confirmation_code: manualInvoice.confirmation_code,
          year_month: manualInvoice.service_date.substring(0, 7),
          customer: {
            name: manualInvoice.customer_name,
            email: manualInvoice.customer_email,
            phone: manualInvoice.customer_phone,
          },
          activities: [
            {
              description: manualInvoice.description || manualInvoice.confirmation_code,
              amount: parseFloat(manualInvoice.amount),
              service_date: manualInvoice.service_date,
              supplier_code: manualInvoice.supplier_code,
              supplier_name: manualInvoice.supplier_name,
            },
          ],
          regime: manualInvoice.regime,
          sales_type: manualInvoice.sales_type,
        }),
      })

      const result = await response.json()

      if (result.success) {
        alert('Invoice created successfully!')
        setShowManualInvoiceDialog(false)
        // Reset form
        setManualInvoice({
          confirmation_code: '',
          customer_name: '',
          customer_email: '',
          customer_phone: '',
          description: '',
          service_date: format(new Date(), 'yyyy-MM-dd'),
          amount: '',
          supplier_code: 'ENROMA',
          supplier_name: 'EnRoma Tours',
          regime: '74T',
          sales_type: 'ORG',
        })
        fetchMonthlyPraticas()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      console.error('Error creating manual invoice:', error)
      alert('Error creating invoice. Check console for details.')
    } finally {
      setCreatingInvoice(false)
    }
  }

  // Toggle booking selection
  const toggleBookingSelection = (bookingId: number) => {
    setSelectedBookings((prev) =>
      prev.includes(bookingId)
        ? prev.filter((id) => id !== bookingId)
        : [...prev, bookingId]
    )
  }

  // Select all visible bookings
  const selectAllBookings = () => {
    if (selectedBookings.length === uninvoicedBookings.length) {
      setSelectedBookings([])
    } else {
      setSelectedBookings(uninvoicedBookings.map((b) => b.booking_id))
    }
  }

  // Get status badge for PS status
  const getPSStatusBadge = (status: 'WP' | 'INS') => {
    if (status === 'INS') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <Lock className="h-3 w-3" />
          Finalized
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
        <Unlock className="h-3 w-3" />
        Open
      </span>
    )
  }

  // Get status badge for invoice status
  const getInvoiceStatusBadge = (status: string) => {
    const badges: Record<string, { icon: React.ElementType; color: string; label: string }> = {
      pending: { icon: Clock, color: 'text-yellow-600 bg-yellow-100', label: 'Pending' },
      sent: { icon: Send, color: 'text-blue-600 bg-blue-100', label: 'Sent' },
      failed: { icon: XCircle, color: 'text-red-600 bg-red-100', label: 'Failed' },
    }

    const badge = badges[status] || badges.pending
    const Icon = badge.icon

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}
      >
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    )
  }

  // Format month display
  const formatMonth = (yearMonth: string) => {
    const [year, month] = yearMonth.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return format(date, 'MMMM yyyy')
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Invoicing</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowManualInvoiceDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </Button>
          <Button variant="outline" onClick={() => setShowConfigDialog(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          {stats.failed > 0 && (
            <Button variant="outline" onClick={retryFailed} disabled={sending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${sending ? 'animate-spin' : ''}`} />
              Retry Failed ({stats.failed})
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 border shadow-sm">
          <p className="text-sm text-gray-500">Monthly Invoices</p>
          <p className="text-2xl font-bold text-gray-900">{stats.monthlyPraticas.total}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border shadow-sm">
          <p className="text-sm text-yellow-600">Open (WP)</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.monthlyPraticas.open}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border shadow-sm">
          <p className="text-sm text-green-600">Finalized (INS)</p>
          <p className="text-2xl font-bold text-green-600">{stats.monthlyPraticas.finalized}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border shadow-sm">
          <p className="text-sm text-blue-600">Total Bookings</p>
          <p className="text-2xl font-bold text-blue-600">{stats.totalInvoices}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border shadow-sm">
          <p className="text-sm text-purple-600">Total Amount</p>
          <p className="text-2xl font-bold text-purple-600">EUR {stats.totalAmount.toFixed(2)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg p-4 border shadow-sm">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <Label className="text-sm font-medium">From Date</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">To Date</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="WP">Open (WP)</SelectItem>
                <SelectItem value="INS">Finalized (INS)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm font-medium">Seller</Label>
            <Select value={sellerFilter} onValueChange={setSellerFilter}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sellers</SelectItem>
                {availableSellers.map((seller) => (
                  <SelectItem key={seller} value={seller}>
                    {seller}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'monthly'
              ? 'border-b-2 border-orange-500 text-orange-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('monthly')}
        >
          <Calendar className="h-4 w-4 inline mr-2" />
          Monthly Invoices ({monthlyPraticas.length})
        </button>
        <button
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'pending'
              ? 'border-b-2 border-orange-500 text-orange-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('pending')}
        >
          Pending Invoicing ({uninvoicedBookings.length})
        </button>
        <button
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'credit-notes'
              ? 'border-b-2 border-orange-500 text-orange-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('credit-notes')}
        >
          <XCircle className="h-4 w-4 inline mr-2" />
          Credit Notes ({creditNotes.length})
        </button>
      </div>

      {/* Monthly Invoices Tab */}
      {activeTab === 'monthly' && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-12"></TableHead>
                <TableHead className="font-semibold">Month</TableHead>
                <TableHead className="font-semibold">PS Number</TableHead>
                <TableHead className="font-semibold">Bookings</TableHead>
                <TableHead className="font-semibold">Total Amount</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                    <p className="mt-2 text-gray-500">Loading...</p>
                  </TableCell>
                </TableRow>
              ) : monthlyPraticas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                    No monthly invoices found
                  </TableCell>
                </TableRow>
              ) : (
                monthlyPraticas.map((pratica) => (
                  <>
                    <TableRow
                      key={pratica.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleMonthExpansion(pratica.year_month)}
                    >
                      <TableCell>
                        {expandedMonth === pratica.year_month ? (
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatMonth(pratica.year_month)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {pratica.partner_pratica_number || '-'}
                      </TableCell>
                      <TableCell>{pratica.booking_count}</TableCell>
                      <TableCell className="font-medium">
                        EUR {Number(pratica.total_amount).toFixed(2)}
                      </TableCell>
                      <TableCell>{getPSStatusBadge(pratica.ps_status)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {pratica.ps_status === 'WP' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => finalizePratica(pratica.year_month)}
                            disabled={finalizing === pratica.year_month}
                          >
                            {finalizing === pratica.year_month ? (
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Lock className="h-3 w-3 mr-1" />
                            )}
                            Finalize
                          </Button>
                        )}
                        {pratica.ps_status === 'INS' && pratica.finalized_at && (
                          <span className="text-xs text-gray-500">
                            Finalized {format(new Date(pratica.finalized_at), 'dd/MM/yyyy')}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                    {expandedMonth === pratica.year_month && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-gray-50 p-0">
                          <div className="p-4">
                            <h4 className="font-medium text-gray-700 mb-3">
                              Bookings in {formatMonth(pratica.year_month)}
                            </h4>
                            {loadingInvoices ? (
                              <div className="text-center py-4">
                                <RefreshCw className="h-5 w-5 animate-spin mx-auto text-gray-400" />
                              </div>
                            ) : monthInvoices.length === 0 ? (
                              <p className="text-gray-500 text-sm">No bookings found</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Booking</TableHead>
                                    <TableHead className="text-xs">Customer</TableHead>
                                    <TableHead className="text-xs">Seller</TableHead>
                                    <TableHead className="text-xs">Amount</TableHead>
                                    <TableHead className="text-xs">Status</TableHead>
                                    <TableHead className="text-xs">Added</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {monthInvoices.map((invoice) => (
                                    <TableRow key={invoice.id}>
                                      <TableCell className="font-medium text-sm">
                                        {invoice.confirmation_code}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {invoice.customer_name || '-'}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {invoice.seller_name || '-'}
                                      </TableCell>
                                      <TableCell className="text-sm font-medium">
                                        {invoice.currency} {invoice.total_amount.toFixed(2)}
                                      </TableCell>
                                      <TableCell>{getInvoiceStatusBadge(invoice.status)}</TableCell>
                                      <TableCell className="text-sm text-gray-500">
                                        {format(new Date(invoice.created_at), 'dd/MM/yyyy HH:mm')}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pending Invoicing Tab */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {selectedBookings.length > 0 && (
            <div className="flex justify-between items-center bg-orange-50 p-4 rounded-lg border border-orange-200">
              <span className="text-orange-800 font-medium">
                {selectedBookings.length} booking(s) selected
              </span>
              <Button
                onClick={createInvoices}
                disabled={sending}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {sending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Add to Monthly Invoice
              </Button>
            </div>
          )}

          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        selectedBookings.length === uninvoicedBookings.length &&
                        uninvoicedBookings.length > 0
                      }
                      onCheckedChange={selectAllBookings}
                    />
                  </TableHead>
                  <TableHead className="font-semibold">Booking</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Amount</TableHead>
                  <TableHead className="font-semibold">Payment</TableHead>
                  <TableHead className="font-semibold">Seller</TableHead>
                  <TableHead className="font-semibold">Date (→ Month)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uninvoicedBookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      <CheckCircle className="h-12 w-12 mx-auto text-green-300 mb-2" />
                      All bookings have been added to monthly invoices
                    </TableCell>
                  </TableRow>
                ) : (
                  uninvoicedBookings.map((booking) => (
                    <TableRow key={booking.booking_id} className="hover:bg-gray-50">
                      <TableCell>
                        <Checkbox
                          checked={selectedBookings.includes(booking.booking_id)}
                          onCheckedChange={() => toggleBookingSelection(booking.booking_id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {booking.confirmation_code}
                      </TableCell>
                      <TableCell>{booking.customer_name || '-'}</TableCell>
                      <TableCell className="font-medium">
                        {booking.currency} {booking.total_price.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            booking.payment_type === 'PAID'
                              ? 'bg-green-100 text-green-700'
                              : booking.payment_type === 'PARTIAL'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {booking.payment_type || 'Unknown'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{booking.activity_seller || '-'}</TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {format(new Date(booking.creation_date), 'dd/MM/yyyy')}
                        <span className="text-orange-500 ml-1">
                          → {booking.creation_date.substring(0, 7)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Credit Notes Tab */}
      {activeTab === 'credit-notes' && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold">Booking</TableHead>
                <TableHead className="font-semibold">Customer</TableHead>
                <TableHead className="font-semibold">Amount</TableHead>
                <TableHead className="font-semibold">Seller</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingCreditNotes ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                    <p className="mt-2 text-gray-500">Loading...</p>
                  </TableCell>
                </TableRow>
              ) : creditNotes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    <XCircle className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                    No credit notes found
                  </TableCell>
                </TableRow>
              ) : (
                creditNotes.map((creditNote) => (
                  <TableRow key={creditNote.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">
                      {creditNote.confirmation_code}
                    </TableCell>
                    <TableCell>{creditNote.customer_name || '-'}</TableCell>
                    <TableCell className="font-medium text-red-600">
                      {creditNote.currency} {creditNote.total_amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm">{creditNote.seller_name || '-'}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          creditNote.status === 'sent'
                            ? 'bg-green-100 text-green-700'
                            : creditNote.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {creditNote.status === 'sent' ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : creditNote.status === 'pending' ? (
                          <Clock className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {creditNote.status.charAt(0).toUpperCase() + creditNote.status.slice(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {format(new Date(creditNote.created_at), 'dd/MM/yyyy HH:mm')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Config Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Invoicing Settings</DialogTitle>
            <DialogDescription>
              Configure automatic invoicing behavior and Partner Solution defaults
            </DialogDescription>
          </DialogHeader>

          {config && (
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Auto-add to monthly invoice</Label>
                  <p className="text-sm text-gray-500">
                    Automatically add bookings to monthly invoice on confirmation
                  </p>
                </div>
                <Switch
                  checked={config.auto_invoice_enabled}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, auto_invoice_enabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Auto credit note on cancellation</Label>
                  <p className="text-sm text-gray-500">
                    Automatically create credit notes when bookings are cancelled
                  </p>
                </div>
                <Switch
                  checked={config.auto_credit_note_enabled}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, auto_credit_note_enabled: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Invoice Start Date</Label>
                <p className="text-xs text-gray-500">
                  Only bookings from this date onwards will appear in pending invoicing
                </p>
                <Input
                  type="date"
                  value={config.invoice_start_date || ''}
                  onChange={(e) =>
                    setConfig({ ...config, invoice_start_date: e.target.value || null })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Default Regime</Label>
                <Select
                  value={config.default_regime}
                  onValueChange={(value) => setConfig({ ...config, default_regime: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="74T">74T (Tourism)</SelectItem>
                    <SelectItem value="ORD">ORD (Ordinary)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Default Sales Type</Label>
                <Select
                  value={config.default_sales_type}
                  onValueChange={(value) => setConfig({ ...config, default_sales_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ORG">ORG (Organized)</SelectItem>
                    <SelectItem value="INT">INT (Intermediary)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Auto-invoice sellers</Label>
                <p className="text-xs text-gray-500 mb-2">
                  Only bookings from selected sellers will be auto-added to monthly invoices
                </p>
                <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2">
                  {availableSellers.length === 0 ? (
                    <p className="text-sm text-gray-400">No sellers available</p>
                  ) : (
                    availableSellers.map((seller) => (
                      <div key={seller} className="flex items-center space-x-2">
                        <Checkbox
                          id={`auto-${seller}`}
                          checked={config.auto_invoice_sellers.includes(seller)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setConfig({
                                ...config,
                                auto_invoice_sellers: [...config.auto_invoice_sellers, seller],
                              })
                            } else {
                              setConfig({
                                ...config,
                                auto_invoice_sellers: config.auto_invoice_sellers.filter(
                                  (s) => s !== seller
                                ),
                              })
                            }
                          }}
                        />
                        <label
                          htmlFor={`auto-${seller}`}
                          className="text-sm cursor-pointer"
                        >
                          {seller}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={saveConfig} disabled={savingConfig}>
                  {savingConfig ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manual Invoice Dialog */}
      <Dialog open={showManualInvoiceDialog} onOpenChange={setShowManualInvoiceDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Manual Invoice</DialogTitle>
            <DialogDescription>
              Create an invoice entry to send to Partner Solution
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Confirmation Code *</Label>
                <Input
                  placeholder="e.g. ENRO-12345678"
                  value={manualInvoice.confirmation_code}
                  onChange={(e) =>
                    setManualInvoice({ ...manualInvoice, confirmation_code: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Amount (EUR) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={manualInvoice.amount}
                  onChange={(e) =>
                    setManualInvoice({ ...manualInvoice, amount: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Service Date</Label>
              <Input
                type="date"
                value={manualInvoice.service_date}
                onChange={(e) =>
                  setManualInvoice({ ...manualInvoice, service_date: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Service description..."
                value={manualInvoice.description}
                onChange={(e) =>
                  setManualInvoice({ ...manualInvoice, description: e.target.value })
                }
              />
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Customer (Optional)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="Customer name"
                    value={manualInvoice.customer_name}
                    onChange={(e) =>
                      setManualInvoice({ ...manualInvoice, customer_name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="customer@email.com"
                    value={manualInvoice.customer_email}
                    onChange={(e) =>
                      setManualInvoice({ ...manualInvoice, customer_email: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label>Phone</Label>
                <Input
                  placeholder="+34..."
                  value={manualInvoice.customer_phone}
                  onChange={(e) =>
                    setManualInvoice({ ...manualInvoice, customer_phone: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Supplier</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Supplier Code</Label>
                  <Input
                    placeholder="ENROMA"
                    value={manualInvoice.supplier_code}
                    onChange={(e) =>
                      setManualInvoice({ ...manualInvoice, supplier_code: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Supplier Name</Label>
                  <Input
                    placeholder="EnRoma Tours"
                    value={manualInvoice.supplier_name}
                    onChange={(e) =>
                      setManualInvoice({ ...manualInvoice, supplier_name: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Partner Solution Settings</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Regime</Label>
                  <Select
                    value={manualInvoice.regime}
                    onValueChange={(value) =>
                      setManualInvoice({ ...manualInvoice, regime: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="74T">74T (Tourism)</SelectItem>
                      <SelectItem value="ORD">ORD (Ordinary)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sales Type</Label>
                  <Select
                    value={manualInvoice.sales_type}
                    onValueChange={(value) =>
                      setManualInvoice({ ...manualInvoice, sales_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ORG">ORG (Organized)</SelectItem>
                      <SelectItem value="INT">INT (Intermediary)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowManualInvoiceDialog(false)}>
                Cancel
              </Button>
              <Button onClick={createManualInvoice} disabled={creatingInvoice}>
                {creatingInvoice ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Create Invoice
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
