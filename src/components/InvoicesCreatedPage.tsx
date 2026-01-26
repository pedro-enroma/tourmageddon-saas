'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Loader2, Receipt, AlertCircle, X, Search, Calendar, User, DollarSign, CheckCircle2, XCircle, Clock, ExternalLink, Filter, Plane } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  activity_seller: string | null
  travel_date: string | null
  ps_pratica_id: string | null
  ps_status: string | null
  created_at: string
  sent_to_ps_at: string | null
  error_message: string | null
  created_by: string | null
}

export default function InvoicesCreatedPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/invoices-created')
      const data = await response.json()

      if (data.error) throw new Error(data.error)

      setInvoices(data.data || [])
    } catch (err) {
      console.error('Error fetching invoices:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch invoices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(amount)
  }

  const getStatusBadge = (status: string, psStatus: string | null) => {
    if (psStatus === 'INS') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle2 className="h-3 w-3" />
          Sent to PS
        </span>
      )
    }
    if (psStatus === 'ERROR' || status === 'FAILED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <XCircle className="h-3 w-3" />
          Failed
        </span>
      )
    }
    if (psStatus === 'PENDING' || status === 'PENDING') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        {status || 'Unknown'}
      </span>
    )
  }

  // Filter invoices
  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = searchQuery === '' ||
      inv.confirmation_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.ps_pratica_id?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'sent' && inv.ps_status === 'INS') ||
      (statusFilter === 'pending' && (inv.ps_status === 'PENDING' || inv.status === 'PENDING')) ||
      (statusFilter === 'failed' && (inv.ps_status === 'ERROR' || inv.status === 'FAILED'))

    return matchesSearch && matchesStatus
  })

  // Stats
  const stats = {
    total: invoices.length,
    sent: invoices.filter(i => i.ps_status === 'INS').length,
    pending: invoices.filter(i => i.ps_status === 'PENDING' || i.status === 'PENDING').length,
    failed: invoices.filter(i => i.ps_status === 'ERROR' || i.status === 'FAILED').length,
    totalAmount: invoices.reduce((sum, i) => sum + (i.total_amount || 0), 0),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices Created</h1>
          <p className="text-sm text-gray-500 mt-1">
            All invoices sent to Partner Solution
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchInvoices}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
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
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-500">Total Invoices</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-green-600">{stats.sent}</div>
          <div className="text-sm text-gray-500">Sent to PS</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-sm text-gray-500">Pending</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(stats.totalAmount, 'EUR')}
          </div>
          <div className="text-sm text-gray-500">Total Amount</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by confirmation code, customer, or pratica ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">All Status</option>
            <option value="sent">Sent to PS</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <span className="text-sm text-gray-500">
          {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
          <Receipt className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices yet</h3>
          <p className="text-gray-500">Invoices will appear here once they are sent to Partner Solution</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Booking
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Travel Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PS Pratica
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sent At
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-mono text-sm font-medium text-gray-900">
                      {invoice.confirmation_code}
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
                      <Plane className="h-3.5 w-3.5 text-blue-500" />
                      {formatDate(invoice.travel_date)}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                      <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                      {formatCurrency(invoice.total_amount, invoice.currency)}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {invoice.ps_pratica_id ? (
                      <span className="font-mono text-sm text-blue-600">
                        {invoice.ps_pratica_id}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {getStatusBadge(invoice.status, invoice.ps_status)}
                    {invoice.error_message && (
                      <div className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={invoice.error_message}>
                        {invoice.error_message}
                      </div>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
