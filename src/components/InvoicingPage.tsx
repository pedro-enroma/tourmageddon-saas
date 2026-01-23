'use client'

import React, { useState, useEffect, useCallback } from 'react'
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
  Plus,
  List,
  Pencil,
  Trash2,
  AlertCircle,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

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
  all_activities_cancelled: boolean
  travel_date: string | null
  invoice_status: 'created' | 'scheduled' | 'filtered' | 'pending'
}

interface Config {
  auto_invoice_enabled: boolean
  auto_credit_note_enabled: boolean
  auto_invoice_sellers: string[]
  default_regime: string
  default_sales_type: string
  invoice_start_date: string | null
}

interface InvoiceRule {
  id: string
  name: string
  sellers: string[]
  auto_invoice_enabled: boolean
  auto_credit_note_enabled: boolean
  credit_note_trigger: 'cancellation' | 'refund'
  default_regime: '74T' | 'ORD'
  default_sales_type: 'ORG' | 'INT'
  invoice_date_type: 'creation' | 'travel'
  travel_date_delay_days: number
  execution_time: string // HH:MM format, e.g., '08:00'
  invoice_start_date: string | null
  created_at: string
  updated_at: string
}

interface ScheduledInvoice {
  id: string
  booking_id: number
  rule_id: string | null
  scheduled_send_date: string
  scheduled_send_time: string // HH:MM format
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  created_at: string
  sent_at: string | null
  error_message: string | null
  // Joined data
  confirmation_code?: string
  customer_name?: string
  seller_name?: string
  total_amount?: number
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
  const [allBookings, setAllBookings] = useState<BookingForInvoicing[]>([])
  const [selectedBookings, setSelectedBookings] = useState<number[]>([])
  const [sending, setSending] = useState(false)
  const [config, setConfig] = useState<Config | null>(null)
  const [loadingBookings, setLoadingBookings] = useState(false)

  // Rules management state
  const [rules, setRules] = useState<InvoiceRule[]>([])
  const [showRulesDialog, setShowRulesDialog] = useState(false)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [editingRule, setEditingRule] = useState<InvoiceRule | null>(null)
  const [savingRule, setSavingRule] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
  const [ruleForm, setRuleForm] = useState<{
    name: string
    sellers: string[]
    auto_invoice_enabled: boolean
    auto_credit_note_enabled: boolean
    credit_note_trigger: 'cancellation' | 'refund'
    default_regime: '74T' | 'ORD'
    default_sales_type: 'ORG' | 'INT'
    invoice_date_type: 'creation' | 'travel'
    travel_date_delay_days: number
    execution_time: string
    invoice_start_date: string
  }>({
    name: '',
    sellers: [],
    auto_invoice_enabled: true,
    auto_credit_note_enabled: true,
    credit_note_trigger: 'cancellation',
    default_regime: '74T',
    default_sales_type: 'ORG',
    invoice_date_type: 'creation',
    travel_date_delay_days: 1,
    execution_time: '08:00',
    invoice_start_date: '',
  })

  // Filters
  const [dateFrom, setDateFrom] = useState<string>(format(subDays(new Date(), 90), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sellerFilter, setSellerFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'all-reservations' | 'pending-invoicing' | 'invoices-created' | 'credit-notes'>('pending-invoicing')
  const [creditNotes, setCreditNotes] = useState<Invoice[]>([])
  const [loadingCreditNotes, setLoadingCreditNotes] = useState(false)

  // Scheduled invoices (pending API calls)
  const [scheduledInvoices, setScheduledInvoices] = useState<ScheduledInvoice[]>([])
  const [loadingScheduled, setLoadingScheduled] = useState(false)

  // Created invoices (sent via API)
  const [createdInvoices, setCreatedInvoices] = useState<Invoice[]>([])
  const [loadingCreated, setLoadingCreated] = useState(false)

  // Process rules
  const [processingRules, setProcessingRules] = useState(false)


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

  // Fetch all bookings with their invoice status
  const fetchAllBookings = useCallback(async () => {
    setLoadingBookings(true)
    try {
      // Build a map of seller -> rule
      const sellerRuleMap = new Map<string, InvoiceRule>()
      for (const rule of rules) {
        for (const seller of rule.sellers || []) {
          sellerRuleMap.set(seller, rule)
        }
      }

      // Get existing invoice booking IDs
      const { data: existingInvoices } = await supabase
        .from('invoices')
        .select('booking_id')
        .eq('invoice_type', 'INVOICE')

      const invoicedBookingIds = new Set(existingInvoices?.map((i) => i.booking_id) || [])

      // Get scheduled invoice booking IDs
      const { data: scheduledInvoicesData } = await supabase
        .from('scheduled_invoices')
        .select('booking_id')
        .not('status', 'eq', 'cancelled')

      const scheduledBookingIds = new Set(scheduledInvoicesData?.map((s) => s.booking_id) || [])

      // Check if selected seller has a "travel" date type rule
      const selectedSellerRule = sellerFilter !== 'all' ? sellerRuleMap.get(sellerFilter) : null
      const isTravelDateRule = selectedSellerRule?.invoice_date_type === 'travel'

      type BookingData = {
        booking_id: number
        confirmation_code: string
        total_price: number
        currency: string
        creation_date: string
        payment_type: string | null
        booking_customers: { customers: unknown }[] | null
        activity_bookings: { activity_seller: string; status: string; start_date_time: string }[] | null
      }

      let bookings: BookingData[] = []

      if (isTravelDateRule && sellerFilter !== 'all' && selectedSellerRule?.invoice_start_date) {
        // For travel date rules: query activity_bookings first by travel date
        const { data: activities, error: activityError } = await supabase
          .from('activity_bookings')
          .select('booking_id')
          .eq('activity_seller', sellerFilter)
          .gte('start_date_time', selectedSellerRule.invoice_start_date)
          .limit(10000)

        if (activityError) throw activityError

        const bookingIds = [...new Set(activities?.map(a => a.booking_id) || [])]

        if (bookingIds.length > 0) {
          // Fetch bookings by IDs in batches
          const batchSize = 500
          for (let i = 0; i < bookingIds.length; i += batchSize) {
            const batchIds = bookingIds.slice(i, i + batchSize)
            const { data: batchBookings, error: batchError } = await supabase
              .from('bookings')
              .select(`
                booking_id, confirmation_code, total_price, currency, creation_date, payment_type,
                booking_customers(customers(first_name, last_name)),
                activity_bookings(activity_seller, status, start_date_time)
              `)
              .in('booking_id', batchIds)
              .eq('status', 'CONFIRMED')

            if (batchError) throw batchError
            if (batchBookings) bookings.push(...(batchBookings as BookingData[]))
          }
        }
      } else {
        // For creation date rules or all sellers: filter by creation date range
        const { data, error: bookingsError } = await supabase
          .from('bookings')
          .select(`
            booking_id, confirmation_code, total_price, currency, creation_date, payment_type,
            booking_customers(customers(first_name, last_name)),
            activity_bookings(activity_seller, status, start_date_time)
          `)
          .eq('status', 'CONFIRMED')
          .gte('creation_date', dateFrom)
          .lte('creation_date', dateTo + 'T23:59:59')
          .order('creation_date', { ascending: false })
          .limit(5000)

        if (bookingsError) throw bookingsError
        bookings = (data || []) as BookingData[]
      }

      // Process bookings and determine invoice status
      const processed = bookings
        .filter((b) => {
          // Filter by seller if selected
          if (sellerFilter !== 'all') {
            return b.activity_bookings?.some((a) => a.activity_seller === sellerFilter)
          }
          return true
        })
        .map((b) => {
          const activityBookings = b.activity_bookings || []
          const allCancelled = activityBookings.length > 0 && activityBookings.every(a => a.status === 'CANCELLED')
          const matchingActivity = sellerFilter !== 'all'
            ? activityBookings.find(a => a.activity_seller === sellerFilter)
            : activityBookings[0]
          const travelDate = matchingActivity?.start_date_time || null
          const seller = matchingActivity?.activity_seller || null

          // Determine invoice status
          let invoiceStatus: 'created' | 'scheduled' | 'filtered' | 'pending' = 'pending'
          if (invoicedBookingIds.has(b.booking_id)) {
            invoiceStatus = 'created'
          } else if (scheduledBookingIds.has(b.booking_id)) {
            invoiceStatus = 'scheduled'
          } else if (seller && !sellerRuleMap.has(seller)) {
            invoiceStatus = 'filtered'
          }

          return {
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
            activity_seller: seller,
            all_activities_cancelled: allCancelled,
            travel_date: travelDate,
            invoice_status: invoiceStatus,
          }
        })
        .sort((a, b) => {
          // Sort by travel date for travel date rules, otherwise by creation date desc
          if (isTravelDateRule && a.travel_date && b.travel_date) {
            return a.travel_date.localeCompare(b.travel_date)
          }
          return b.creation_date.localeCompare(a.creation_date)
        })

      setAllBookings(processed)
    } catch (error) {
      console.error('Error fetching bookings:', error)
    } finally {
      setLoadingBookings(false)
    }
  }, [dateFrom, dateTo, sellerFilter, rules])

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

  // Fetch scheduled invoices (pending API calls)
  const fetchScheduledInvoices = async () => {
    setLoadingScheduled(true)
    try {
      const { data, error } = await supabase
        .from('scheduled_invoices')
        .select('*')
        .eq('status', 'pending')
        .order('scheduled_send_date', { ascending: true })

      if (error) throw error

      // Enrich with booking data
      if (data && data.length > 0) {
        const bookingIds = data.map((s) => s.booking_id)
        const { data: bookings } = await supabase
          .from('bookings')
          .select(`
            booking_id,
            confirmation_code,
            total_price,
            booking_customers(customers(first_name, last_name)),
            activity_bookings(activity_seller, status)
          `)
          .in('booking_id', bookingIds)

        const bookingMap = new Map(bookings?.map((b) => [b.booking_id, b]) || [])

        const enriched = data
          .map((scheduled) => {
            const booking = bookingMap.get(scheduled.booking_id)
            const customer = booking?.booking_customers?.[0]?.customers as { first_name?: string; last_name?: string } | undefined
            const activityBookings = booking?.activity_bookings as { activity_seller: string; status: string }[] || []
            const allCancelled = activityBookings.length > 0 && activityBookings.every(a => a.status === 'CANCELLED')

            return {
              ...scheduled,
              confirmation_code: booking?.confirmation_code || '',
              customer_name: customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : null,
              seller_name: activityBookings[0]?.activity_seller || null,
              total_amount: booking?.total_price || 0,
              all_activities_cancelled: allCancelled,
            }
          })
          // Filter out bookings where all activities are cancelled
          .filter((s) => !s.all_activities_cancelled)

        setScheduledInvoices(enriched)

        // Also update the scheduled_invoices status to 'cancelled' for those with all activities cancelled
        const cancelledBookingIds = data
          .filter((scheduled) => {
            const booking = bookingMap.get(scheduled.booking_id)
            const activityBookings = booking?.activity_bookings as { status: string }[] || []
            return activityBookings.length > 0 && activityBookings.every(a => a.status === 'CANCELLED')
          })
          .map((s) => s.id)

        if (cancelledBookingIds.length > 0) {
          await supabase
            .from('scheduled_invoices')
            .update({ status: 'cancelled' })
            .in('id', cancelledBookingIds)
        }
      } else {
        setScheduledInvoices([])
      }
    } catch (error) {
      console.error('Error fetching scheduled invoices:', error)
    } finally {
      setLoadingScheduled(false)
    }
  }

  // Fetch created invoices (sent via API)
  const fetchCreatedInvoices = async () => {
    setLoadingCreated(true)
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('invoice_type', 'INVOICE')
        .order('created_at', { ascending: false })

      if (error) throw error
      setCreatedInvoices(data || [])
    } catch (error) {
      console.error('Error fetching created invoices:', error)
    } finally {
      setLoadingCreated(false)
    }
  }

  // Process existing bookings against rules
  const processRules = async (dryRun = false) => {
    setProcessingRules(true)
    try {
      const response = await fetch('/api/invoices/process-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to process rules')
      }

      alert(result.message || `Processed ${result.processed} bookings`)

      // Refresh scheduled invoices
      if (!dryRun) {
        fetchScheduledInvoices()
      }
    } catch (error: unknown) {
      const err = error as Error
      console.error('Error processing rules:', err)
      alert('Error processing rules: ' + (err.message || 'Unknown error'))
    } finally {
      setProcessingRules(false)
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

  // Fetch invoice rules
  const fetchRules = async () => {
    try {
      const { data, error } = await supabase
        .from('invoice_rules')
        .select('*')
        .order('name')

      if (error) throw error
      setRules(data || [])
    } catch (error) {
      console.error('Error fetching rules:', error)
    }
  }

  // Get sellers already assigned to other rules (for validation)
  const getAssignedSellers = (excludeRuleId?: string): Set<string> => {
    const assigned = new Set<string>()
    rules.forEach((rule) => {
      if (excludeRuleId && rule.id === excludeRuleId) return
      rule.sellers.forEach((seller) => assigned.add(seller))
    })
    return assigned
  }

  // Get unassigned sellers
  const getUnassignedSellers = (): string[] => {
    const assigned = getAssignedSellers()
    return availableSellers.filter((seller) => !assigned.has(seller))
  }

  // Reset rule form to defaults
  const resetRuleForm = () => {
    setRuleForm({
      name: '',
      sellers: [],
      auto_invoice_enabled: true,
      auto_credit_note_enabled: true,
      credit_note_trigger: 'cancellation',
      default_regime: '74T',
      default_sales_type: 'ORG',
      invoice_date_type: 'creation',
      travel_date_delay_days: 1,
      execution_time: '08:00',
      invoice_start_date: '',
    })
    setEditingRule(null)
  }

  // Open rule form for creating new rule
  const openNewRuleForm = () => {
    resetRuleForm()
    setShowRuleForm(true)
  }

  // Open rule form for editing existing rule
  const openEditRuleForm = (rule: InvoiceRule) => {
    setEditingRule(rule)
    setRuleForm({
      name: rule.name,
      sellers: rule.sellers,
      auto_invoice_enabled: rule.auto_invoice_enabled,
      auto_credit_note_enabled: rule.auto_credit_note_enabled,
      credit_note_trigger: rule.credit_note_trigger || 'cancellation',
      default_regime: rule.default_regime,
      default_sales_type: rule.default_sales_type,
      invoice_date_type: rule.invoice_date_type,
      travel_date_delay_days: rule.travel_date_delay_days,
      execution_time: rule.execution_time || '08:00',
      invoice_start_date: rule.invoice_start_date || '',
    })
    setShowRuleForm(true)
  }

  // Save rule (create or update)
  const saveRule = async () => {
    if (!ruleForm.name.trim()) {
      alert('Please enter a rule name')
      return
    }

    if (ruleForm.sellers.length === 0) {
      alert('Please select at least one seller')
      return
    }

    setSavingRule(true)
    try {
      const ruleData = {
        name: ruleForm.name.trim(),
        sellers: ruleForm.sellers,
        auto_invoice_enabled: ruleForm.auto_invoice_enabled,
        auto_credit_note_enabled: ruleForm.auto_credit_note_enabled,
        credit_note_trigger: ruleForm.credit_note_trigger,
        default_regime: ruleForm.default_regime,
        default_sales_type: ruleForm.default_sales_type,
        invoice_date_type: ruleForm.invoice_date_type,
        travel_date_delay_days: ruleForm.travel_date_delay_days,
        execution_time: ruleForm.execution_time || '08:00',
        invoice_start_date: ruleForm.invoice_start_date || null,
        updated_at: new Date().toISOString(),
      }

      if (editingRule) {
        // Update existing rule
        const { error } = await supabase
          .from('invoice_rules')
          .update(ruleData)
          .eq('id', editingRule.id)

        if (error) throw error
      } else {
        // Create new rule
        const { error } = await supabase.from('invoice_rules').insert(ruleData)

        if (error) throw error
      }

      // Refresh rules and close form
      await fetchRules()
      setShowRuleForm(false)
      resetRuleForm()
    } catch (error: unknown) {
      const err = error as Error
      console.error('Error saving rule:', err.message || error)
      alert('Error saving rule: ' + (err.message || 'Unknown error'))
    } finally {
      setSavingRule(false)
    }
  }

  // Delete rule
  const deleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule? Sellers will become unassigned.')) {
      return
    }

    setDeletingRuleId(ruleId)
    try {
      const { error } = await supabase.from('invoice_rules').delete().eq('id', ruleId)

      if (error) throw error

      await fetchRules()
    } catch (error: unknown) {
      const err = error as Error
      console.error('Error deleting rule:', err.message || error)
      alert('Error deleting rule: ' + (err.message || 'Unknown error'))
    } finally {
      setDeletingRuleId(null)
    }
  }

  // Toggle seller selection in rule form
  const toggleSellerInRule = (seller: string) => {
    setRuleForm((prev) => ({
      ...prev,
      sellers: prev.sellers.includes(seller)
        ? prev.sellers.filter((s) => s !== seller)
        : [...prev.sellers, seller],
    }))
  }

  useEffect(() => {
    fetchAvailableSellers()
    fetchConfig()
    fetchCreditNotes()
    fetchRules()
    fetchScheduledInvoices()
    fetchCreatedInvoices()
  }, [])

  // Refetch uninvoiced bookings when config or rules load/change
  useEffect(() => {
    if (config !== null || rules.length > 0) {
      fetchAllBookings()
    }
  }, [config, rules, fetchAllBookings])

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
      fetchAllBookings()
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

      fetchCreatedInvoices()
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
        fetchCreatedInvoices()
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

  // Select all pending bookings (only those that can be invoiced)
  const selectAllBookings = () => {
    const pendingBookings = allBookings.filter(b => b.invoice_status === 'pending' && !b.all_activities_cancelled)
    if (selectedBookings.length === pendingBookings.length) {
      setSelectedBookings([])
    } else {
      setSelectedBookings(pendingBookings.map((b) => b.booking_id))
    }
  }

  // Calculate failed invoices count
  const failedCount = createdInvoices.filter(i => i.status === 'failed').length

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
          <Button variant="outline" onClick={() => setShowRulesDialog(true)}>
            <List className="h-4 w-4 mr-2" />
            Rules
          </Button>
          <Button
            variant="outline"
            onClick={() => processRules(false)}
            disabled={processingRules}
          >
            {processingRules ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Apply Rules
          </Button>
          {failedCount > 0 && (
            <Button variant="outline" onClick={retryFailed} disabled={sending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${sending ? 'animate-spin' : ''}`} />
              Retry Failed ({failedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 border shadow-sm">
          <p className="text-sm text-gray-600">All Reservations</p>
          <p className="text-2xl font-bold text-gray-800">{allBookings.length}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border shadow-sm">
          <p className="text-sm text-yellow-600">Pending (Need Rules)</p>
          <p className="text-2xl font-bold text-yellow-600">{allBookings.filter(b => b.invoice_status === 'pending').length}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border shadow-sm">
          <p className="text-sm text-blue-600">Scheduled</p>
          <p className="text-2xl font-bold text-blue-600">{scheduledInvoices.length}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border shadow-sm">
          <p className="text-sm text-green-600">Invoices Created</p>
          <p className="text-2xl font-bold text-green-600">{createdInvoices.length}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border shadow-sm">
          <p className="text-sm text-gray-500">No Rule (Filtered)</p>
          <p className="text-2xl font-bold text-gray-500">{allBookings.filter(b => b.invoice_status === 'filtered').length}</p>
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
      <div className="flex gap-2 border-b overflow-x-auto">
        <button
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'all-reservations'
              ? 'border-b-2 border-orange-500 text-orange-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('all-reservations')}
        >
          All Reservations ({allBookings.length})
        </button>
        <button
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'pending-invoicing'
              ? 'border-b-2 border-orange-500 text-orange-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('pending-invoicing')}
        >
          <Clock className="h-4 w-4 inline mr-2" />
          Pending Invoicing ({scheduledInvoices.length})
        </button>
        <button
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'invoices-created'
              ? 'border-b-2 border-orange-500 text-orange-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('invoices-created')}
        >
          <CheckCircle className="h-4 w-4 inline mr-2" />
          Invoices Created ({createdInvoices.length})
        </button>
        <button
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
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

      {/* All Reservations Tab */}
      {activeTab === 'all-reservations' && (
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
            {loadingBookings ? (
              <div className="text-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                <p className="mt-2 text-gray-500">Loading bookings...</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          selectedBookings.length === allBookings.filter(b => b.invoice_status === 'pending').length &&
                          allBookings.filter(b => b.invoice_status === 'pending').length > 0
                        }
                        onCheckedChange={selectAllBookings}
                      />
                    </TableHead>
                    <TableHead className="font-semibold">Booking</TableHead>
                    <TableHead className="font-semibold">Customer</TableHead>
                    <TableHead className="font-semibold">Amount</TableHead>
                    <TableHead className="font-semibold">Seller</TableHead>
                    <TableHead className="font-semibold">Creation Date</TableHead>
                    <TableHead className="font-semibold">Travel Date</TableHead>
                    <TableHead className="font-semibold">Invoice Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allBookings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                        No bookings found for the selected filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    allBookings.map((booking) => (
                      <TableRow
                        key={booking.booking_id}
                        className={`hover:bg-gray-50 ${booking.all_activities_cancelled ? 'bg-red-50 opacity-70' : ''}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedBookings.includes(booking.booking_id)}
                            onCheckedChange={() => toggleBookingSelection(booking.booking_id)}
                            disabled={booking.all_activities_cancelled || booking.invoice_status !== 'pending'}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {booking.confirmation_code}
                            {booking.all_activities_cancelled && (
                              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                CANCELLED
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{booking.customer_name || '-'}</TableCell>
                        <TableCell className={`font-medium ${booking.all_activities_cancelled ? 'line-through text-gray-400' : ''}`}>
                          {booking.currency} {booking.total_price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm">{booking.activity_seller || '-'}</TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {format(new Date(booking.creation_date), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {booking.travel_date ? format(new Date(booking.travel_date), 'dd/MM/yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                              booking.invoice_status === 'created'
                                ? 'bg-green-100 text-green-700'
                                : booking.invoice_status === 'scheduled'
                                ? 'bg-blue-100 text-blue-700'
                                : booking.invoice_status === 'filtered'
                                ? 'bg-gray-100 text-gray-500'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {booking.invoice_status === 'created' && <CheckCircle className="h-3 w-3" />}
                            {booking.invoice_status === 'scheduled' && <Clock className="h-3 w-3" />}
                            {booking.invoice_status === 'filtered' && <XCircle className="h-3 w-3" />}
                            {booking.invoice_status === 'pending' && <AlertCircle className="h-3 w-3" />}
                            {booking.invoice_status === 'created' ? 'Created' :
                             booking.invoice_status === 'scheduled' ? 'Scheduled' :
                             booking.invoice_status === 'filtered' ? 'No Rule' : 'Pending'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}

      {/* Pending Invoicing Tab (Scheduled API calls) */}
      {activeTab === 'pending-invoicing' && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold">Booking</TableHead>
                <TableHead className="font-semibold">Customer</TableHead>
                <TableHead className="font-semibold">Amount</TableHead>
                <TableHead className="font-semibold">Seller</TableHead>
                <TableHead className="font-semibold">Scheduled Date</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingScheduled ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                    <p className="mt-2 text-gray-500">Loading...</p>
                  </TableCell>
                </TableRow>
              ) : scheduledInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    <Clock className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                    No scheduled invoices pending
                  </TableCell>
                </TableRow>
              ) : (
                scheduledInvoices.map((scheduled) => (
                  <TableRow key={scheduled.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">
                      {scheduled.confirmation_code || scheduled.booking_id}
                    </TableCell>
                    <TableCell>{scheduled.customer_name || '-'}</TableCell>
                    <TableCell className="font-medium">
                      EUR {(scheduled.total_amount || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm">{scheduled.seller_name || '-'}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(scheduled.scheduled_send_date), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                        <Clock className="h-3 w-3" />
                        Scheduled
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Invoices Created Tab */}
      {activeTab === 'invoices-created' && (
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
              {loadingCreated ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                    <p className="mt-2 text-gray-500">Loading...</p>
                  </TableCell>
                </TableRow>
              ) : createdInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    <CheckCircle className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                    No invoices created yet
                  </TableCell>
                </TableRow>
              ) : (
                createdInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">
                      {invoice.confirmation_code}
                    </TableCell>
                    <TableCell>{invoice.customer_name || '-'}</TableCell>
                    <TableCell className="font-medium">
                      {invoice.currency} {invoice.total_amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm">{invoice.seller_name || '-'}</TableCell>
                    <TableCell>
                      {invoice.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle className="h-3 w-3" />
                          Sent
                        </span>
                      ) : invoice.status === 'pending' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                          <Clock className="h-3 w-3" />
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <XCircle className="h-3 w-3" />
                          Failed
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {format(new Date(invoice.created_at), 'dd/MM/yyyy HH:mm')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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

      {/* Rules List Dialog */}
      <Dialog open={showRulesDialog} onOpenChange={setShowRulesDialog}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Rules</DialogTitle>
            <DialogDescription>
              Manage invoicing rules for different sellers. Each seller can only belong to one rule.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Unassigned sellers warning */}
            {getUnassignedSellers().length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">
                    {getUnassignedSellers().length} seller(s) without rules
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Bookings from these sellers will not be auto-invoiced:{' '}
                    {getUnassignedSellers().slice(0, 3).join(', ')}
                    {getUnassignedSellers().length > 3 && ` and ${getUnassignedSellers().length - 3} more`}
                  </p>
                </div>
              </div>
            )}

            {/* Rules table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">Rule Name</TableHead>
                    <TableHead className="font-semibold">Sellers</TableHead>
                    <TableHead className="font-semibold">Regime</TableHead>
                    <TableHead className="font-semibold">Sales Type</TableHead>
                    <TableHead className="font-semibold">Invoice Date</TableHead>
                    <TableHead className="font-semibold">Auto</TableHead>
                    <TableHead className="font-semibold w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        <List className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                        No rules configured yet. Create a rule to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rules.map((rule) => (
                      <TableRow key={rule.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {rule.sellers.length} seller{rule.sellers.length !== 1 ? 's' : ''}
                          </span>
                          {rule.sellers.length > 0 && (
                            <p className="text-xs text-gray-500 truncate max-w-[150px]">
                              {rule.sellers.slice(0, 2).join(', ')}
                              {rule.sellers.length > 2 && ` +${rule.sellers.length - 2}`}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100">
                            {rule.default_regime}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100">
                            {rule.default_sales_type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {rule.invoice_date_type === 'creation' ? 'Creation' : 'Travel'}
                            {rule.invoice_date_type === 'travel' && (
                              <span className="text-xs text-gray-500 ml-1">
                                +{rule.travel_date_delay_days}d @ {rule.execution_time || '08:00'}
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {rule.auto_invoice_enabled && (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
                                Inv
                              </span>
                            )}
                            {rule.auto_credit_note_enabled && (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700" title={`Trigger: ${rule.credit_note_trigger || 'cancellation'}`}>
                                CN {rule.credit_note_trigger === 'refund' ? '(refund)' : ''}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditRuleForm(rule)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteRule(rule.id)}
                              disabled={deletingRuleId === rule.id}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              {deletingRuleId === rule.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button onClick={openNewRuleForm}>
                <Plus className="h-4 w-4 mr-2" />
                New Rule
              </Button>
              <Button variant="outline" onClick={() => setShowRulesDialog(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rule Form Dialog (Create/Edit) */}
      <Dialog open={showRuleForm} onOpenChange={(open) => {
        if (!open) {
          setShowRuleForm(false)
          resetRuleForm()
        }
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Rule' : 'Create New Rule'}</DialogTitle>
            <DialogDescription>
              Configure invoicing settings for selected sellers
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Rule Name */}
            <div className="space-y-2">
              <Label>Rule Name *</Label>
              <Input
                placeholder="e.g., Tourism Sellers, Internal Sales"
                value={ruleForm.name}
                onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
              />
            </div>

            {/* Sellers Selection */}
            <div className="space-y-2">
              <Label>Sellers *</Label>
              <p className="text-xs text-gray-500">
                Select which sellers this rule applies to. Grayed out sellers are assigned to other rules.
              </p>
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2">
                {availableSellers.length === 0 ? (
                  <p className="text-sm text-gray-400">No sellers available</p>
                ) : (
                  availableSellers.map((seller) => {
                    const assignedElsewhere = getAssignedSellers(editingRule?.id).has(seller)
                    const isSelected = ruleForm.sellers.includes(seller)
                    return (
                      <div
                        key={seller}
                        className={`flex items-center space-x-2 ${assignedElsewhere ? 'opacity-50' : ''}`}
                      >
                        <Checkbox
                          id={`rule-seller-${seller}`}
                          checked={isSelected}
                          disabled={assignedElsewhere}
                          onCheckedChange={() => {
                            if (!assignedElsewhere) {
                              toggleSellerInRule(seller)
                            }
                          }}
                        />
                        <label
                          htmlFor={`rule-seller-${seller}`}
                          className={`text-sm cursor-pointer ${assignedElsewhere ? 'cursor-not-allowed' : ''}`}
                        >
                          {seller}
                          {assignedElsewhere && (
                            <span className="text-xs text-gray-400 ml-1">(assigned to another rule)</span>
                          )}
                        </label>
                      </div>
                    )
                  })
                )}
              </div>
              {ruleForm.sellers.length > 0 && (
                <p className="text-xs text-green-600">
                  {ruleForm.sellers.length} seller{ruleForm.sellers.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>

            {/* Auto Toggles */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-md">
                <div>
                  <Label className="text-sm">Auto Invoice</Label>
                  <p className="text-xs text-gray-500">Auto-add on confirmation</p>
                </div>
                <Switch
                  checked={ruleForm.auto_invoice_enabled}
                  onCheckedChange={(checked) =>
                    setRuleForm({ ...ruleForm, auto_invoice_enabled: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-md">
                <div>
                  <Label className="text-sm">Auto Credit Note</Label>
                  <p className="text-xs text-gray-500">Auto-create on cancel/refund</p>
                </div>
                <Switch
                  checked={ruleForm.auto_credit_note_enabled}
                  onCheckedChange={(checked) =>
                    setRuleForm({ ...ruleForm, auto_credit_note_enabled: checked })
                  }
                />
              </div>
            </div>

            {/* Credit Note Trigger (only when Auto Credit Note is enabled) */}
            {ruleForm.auto_credit_note_enabled && (
              <div className="space-y-3">
                <Label>Credit Note Trigger</Label>
                <p className="text-xs text-gray-500">
                  When should the credit note be created?
                </p>
                <div className="space-y-2">
                  <div
                    className={`flex items-center p-3 border rounded-md cursor-pointer ${
                      ruleForm.credit_note_trigger === 'cancellation' ? 'border-orange-500 bg-orange-50' : ''
                    }`}
                    onClick={() => setRuleForm({ ...ruleForm, credit_note_trigger: 'cancellation' })}
                  >
                    <input
                      type="radio"
                      checked={ruleForm.credit_note_trigger === 'cancellation'}
                      onChange={() => setRuleForm({ ...ruleForm, credit_note_trigger: 'cancellation' })}
                      className="mr-3"
                    />
                    <div>
                      <p className="font-medium text-sm">On Cancellation</p>
                      <p className="text-xs text-gray-500">
                        Create credit note when booking is cancelled
                      </p>
                    </div>
                  </div>
                  <div
                    className={`flex items-center p-3 border rounded-md cursor-pointer ${
                      ruleForm.credit_note_trigger === 'refund' ? 'border-orange-500 bg-orange-50' : ''
                    }`}
                    onClick={() => setRuleForm({ ...ruleForm, credit_note_trigger: 'refund' })}
                  >
                    <input
                      type="radio"
                      checked={ruleForm.credit_note_trigger === 'refund'}
                      onChange={() => setRuleForm({ ...ruleForm, credit_note_trigger: 'refund' })}
                      className="mr-3"
                    />
                    <div>
                      <p className="font-medium text-sm">On Refund (Stripe)</p>
                      <p className="text-xs text-gray-500">
                        Create credit note when a Stripe refund is processed
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Regime and Sales Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default Regime</Label>
                <Select
                  value={ruleForm.default_regime}
                  onValueChange={(value: '74T' | 'ORD') =>
                    setRuleForm({ ...ruleForm, default_regime: value })
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
                <Label>Default Sales Type</Label>
                <Select
                  value={ruleForm.default_sales_type}
                  onValueChange={(value: 'ORG' | 'INT') =>
                    setRuleForm({ ...ruleForm, default_sales_type: value })
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

            {/* Invoice Date Type */}
            <div className="space-y-3">
              <Label>Invoice Date</Label>
              <div className="space-y-2">
                <div
                  className={`flex items-center p-3 border rounded-md cursor-pointer ${
                    ruleForm.invoice_date_type === 'creation' ? 'border-orange-500 bg-orange-50' : ''
                  }`}
                  onClick={() => setRuleForm({ ...ruleForm, invoice_date_type: 'creation' })}
                >
                  <input
                    type="radio"
                    checked={ruleForm.invoice_date_type === 'creation'}
                    onChange={() => setRuleForm({ ...ruleForm, invoice_date_type: 'creation' })}
                    className="mr-3"
                  />
                  <div>
                    <p className="font-medium text-sm">Creation Date</p>
                    <p className="text-xs text-gray-500">
                      API call sent immediately when booking is confirmed
                    </p>
                  </div>
                </div>
                <div
                  className={`p-3 border rounded-md cursor-pointer ${
                    ruleForm.invoice_date_type === 'travel' ? 'border-orange-500 bg-orange-50' : ''
                  }`}
                  onClick={() => setRuleForm({ ...ruleForm, invoice_date_type: 'travel' })}
                >
                  <div className="flex items-center">
                    <input
                      type="radio"
                      checked={ruleForm.invoice_date_type === 'travel'}
                      onChange={() => setRuleForm({ ...ruleForm, invoice_date_type: 'travel' })}
                      className="mr-3"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">Travel Date</p>
                      <p className="text-xs text-gray-500">
                        API call scheduled after the travel date
                      </p>
                    </div>
                  </div>
                  {ruleForm.invoice_date_type === 'travel' && (
                    <div className="mt-3 ml-6 space-y-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm whitespace-nowrap">Delay (days):</Label>
                        <Input
                          type="number"
                          min="0"
                          max="30"
                          value={ruleForm.travel_date_delay_days}
                          onChange={(e) =>
                            setRuleForm({
                              ...ruleForm,
                              travel_date_delay_days: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-20"
                        />
                        <span className="text-xs text-gray-500">
                          days after travel date
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm whitespace-nowrap">Execution time:</Label>
                        <Input
                          type="time"
                          value={ruleForm.execution_time}
                          onChange={(e) =>
                            setRuleForm({
                              ...ruleForm,
                              execution_time: e.target.value,
                            })
                          }
                          className="w-28"
                        />
                        <span className="text-xs text-gray-500">
                          time of day to send
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Invoice Start Date */}
            <div className="space-y-2">
              <Label>Invoice Start Date (Optional)</Label>
              <p className="text-xs text-gray-500">
                Only process bookings from this date onwards
              </p>
              <Input
                type="date"
                value={ruleForm.invoice_start_date}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, invoice_start_date: e.target.value })
                }
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRuleForm(false)
                  resetRuleForm()
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveRule} disabled={savingRule}>
                {savingRule ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {editingRule ? 'Update Rule' : 'Create Rule'}
              </Button>
            </div>
          </div>
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
