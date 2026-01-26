'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Pencil, Trash2, Calendar, Clock, Users, Search, RefreshCw, X, Save, Loader2, Receipt, AlertCircle, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface InvoiceRule {
  id: string
  name: string
  invoice_date_type: 'travel_date' | 'creation_date'
  sellers: string[]
  invoice_start_date: string
  execution_time: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface RuleForm {
  id?: string
  name: string
  invoice_date_type: 'travel_date' | 'creation_date'
  sellers: string[]
  invoice_start_date: string
  execution_time: string
}

const defaultForm: RuleForm = {
  name: '',
  invoice_date_type: 'creation_date',
  sellers: [],
  invoice_start_date: new Date().toISOString().split('T')[0],
  execution_time: '14:00',
}

export default function InvoiceRulesPage() {
  const [rules, setRules] = useState<InvoiceRule[]>([])
  const [availableSellers, setAvailableSellers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Dialog state
  const [showDialog, setShowDialog] = useState(false)
  const [editingRule, setEditingRule] = useState<InvoiceRule | null>(null)
  const [form, setForm] = useState<RuleForm>(defaultForm)

  // Seller dropdown state
  const [sellerSearchQuery, setSellerSearchQuery] = useState('')
  const [isSellerDropdownOpen, setIsSellerDropdownOpen] = useState(false)
  const sellerDropdownRef = useRef<HTMLDivElement>(null)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/invoice-rules')
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }
      setRules(data.data || [])
    } catch (err) {
      console.error('Error fetching rules:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch rules')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSellers = useCallback(async () => {
    try {
      const response = await fetch('/api/invoice-rules/sellers')
      const data = await response.json()
      if (data.sellers) {
        setAvailableSellers(data.sellers)
      }
    } catch (err) {
      console.error('Error fetching sellers:', err)
    }
  }, [])

  useEffect(() => {
    fetchRules()
    fetchSellers()
  }, [fetchRules, fetchSellers])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sellerDropdownRef.current && !sellerDropdownRef.current.contains(event.target as Node)) {
        setIsSellerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const openCreateDialog = () => {
    setEditingRule(null)
    setForm(defaultForm)
    setShowDialog(true)
  }

  const openEditDialog = (rule: InvoiceRule) => {
    setEditingRule(rule)
    setForm({
      id: rule.id,
      name: rule.name,
      invoice_date_type: rule.invoice_date_type,
      sellers: rule.sellers || [],
      invoice_start_date: rule.invoice_start_date,
      execution_time: rule.execution_time?.substring(0, 5) || '14:00',
    })
    setShowDialog(true)
  }

  const closeDialog = () => {
    setShowDialog(false)
    setEditingRule(null)
    setForm(defaultForm)
    setSellerSearchQuery('')
  }

  const saveRule = async () => {
    if (!form.name || form.sellers.length === 0) {
      setError('Name and at least one seller are required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload = {
        name: form.name,
        invoice_date_type: form.invoice_date_type,
        sellers: form.sellers,
        invoice_start_date: form.invoice_start_date,
        execution_time: form.execution_time + ':00',
      }

      const url = editingRule
        ? `/api/invoice-rules/${editingRule.id}`
        : '/api/invoice-rules'

      const response = await fetch(url, {
        method: editingRule ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }

      closeDialog()
      fetchRules()
    } catch (err) {
      console.error('Error saving rule:', err)
      setError(err instanceof Error ? err.message : 'Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  const deleteRule = async (ruleId: string) => {
    try {
      const response = await fetch(`/api/invoice-rules/${ruleId}`, {
        method: 'DELETE',
      })

      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }

      setDeleteConfirm(null)
      fetchRules()
    } catch (err) {
      console.error('Error deleting rule:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete rule')
    }
  }

  const toggleSeller = (seller: string) => {
    if (form.sellers.includes(seller)) {
      setForm({ ...form, sellers: form.sellers.filter(s => s !== seller) })
    } else {
      setForm({ ...form, sellers: [...form.sellers, seller] })
    }
  }

  const filteredSellers = availableSellers.filter(seller =>
    seller.toLowerCase().includes(sellerSearchQuery.toLowerCase())
  )

  const filteredRules = rules.filter(rule =>
    rule.name.toLowerCase().includes(search.toLowerCase()) ||
    rule.sellers.some(s => s.toLowerCase().includes(search.toLowerCase()))
  )

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoice Rules</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure automatic invoicing rules for different sellers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRules}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
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

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search rules or sellers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Rules List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : filteredRules.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
          <Receipt className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No invoice rules</h3>
          <p className="text-gray-500 mb-4">Create your first rule to start automatic invoicing</p>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rule Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sellers
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Start Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{rule.name}</div>
                    {rule.invoice_date_type === 'travel_date' && (
                      <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        Runs at {rule.execution_time?.substring(0, 5) || '14:00'}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      rule.invoice_date_type === 'travel_date'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {rule.invoice_date_type === 'travel_date' ? (
                        <>
                          <Calendar className="h-3 w-3 mr-1" />
                          Travel Date
                        </>
                      ) : (
                        <>
                          <Receipt className="h-3 w-3 mr-1" />
                          Creation Date
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {rule.sellers.slice(0, 3).map((seller, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700"
                        >
                          {seller}
                        </span>
                      ))}
                      {rule.sellers.length > 3 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                          +{rule.sellers.length - 3} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(rule.invoice_start_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      rule.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditDialog(rule)}
                        className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                        title="Edit rule"
                      >
                        <Pencil className="h-4 w-4 text-gray-500" />
                      </button>
                      {deleteConfirm === rule.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteRule(rule.id)}
                            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(rule.id)}
                          className="p-1.5 hover:bg-red-50 rounded transition-colors"
                          title="Delete rule"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeDialog}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingRule ? 'Edit Rule' : 'Create Invoice Rule'}
              </h2>
              <button onClick={closeDialog} className="p-1 hover:bg-gray-200 rounded">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Dialog Content */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Rule Name */}
              <div>
                <Label htmlFor="name">Rule Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Civitatis Travel Date Rule"
                  className="mt-1"
                />
              </div>

              {/* Invoice Date Type */}
              <div>
                <Label>Invoice Date Type</Label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, invoice_date_type: 'creation_date' })}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      form.invoice_date_type === 'creation_date'
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Receipt className={`h-5 w-5 ${form.invoice_date_type === 'creation_date' ? 'text-purple-600' : 'text-gray-400'}`} />
                      <span className="font-medium">Creation Date</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Invoice immediately when booking is confirmed
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, invoice_date_type: 'travel_date' })}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      form.invoice_date_type === 'travel_date'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className={`h-5 w-5 ${form.invoice_date_type === 'travel_date' ? 'text-blue-600' : 'text-gray-400'}`} />
                      <span className="font-medium">Travel Date</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Invoice on the day of travel via cron job
                    </p>
                  </button>
                </div>
              </div>

              {/* Sellers Multi-select */}
              <div className="relative">
                <Label>Sellers</Label>
                <div className="mt-1" ref={sellerDropdownRef}>
                  <div
                    onClick={() => setIsSellerDropdownOpen(!isSellerDropdownOpen)}
                    className={`min-h-[44px] px-3 py-2 border rounded-lg cursor-pointer transition-colors bg-white flex items-center justify-between gap-2 ${
                      isSellerDropdownOpen ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex-1">
                      {form.sellers.length === 0 ? (
                        <span className="text-gray-400">Select sellers...</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {form.sellers.map((seller, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-100 text-orange-800 text-sm font-medium"
                            >
                              {seller}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleSeller(seller)
                                }}
                                className="hover:bg-orange-200 rounded-full p-0.5"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ChevronDown className={`h-5 w-5 text-gray-400 flex-shrink-0 transition-transform ${isSellerDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {isSellerDropdownOpen && (
                    <div className="absolute z-[100] mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl">
                      <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input
                            type="text"
                            value={sellerSearchQuery}
                            onChange={(e) => setSellerSearchQuery(e.target.value)}
                            placeholder="Search sellers..."
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="max-h-72 overflow-y-auto py-1">
                        {filteredSellers.map((seller) => {
                          const isSelected = form.sellers.includes(seller)
                          return (
                            <button
                              key={seller}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleSeller(seller)
                              }}
                              className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-3 transition-colors ${
                                isSelected
                                  ? 'bg-orange-50 text-orange-900'
                                  : 'hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                isSelected
                                  ? 'bg-orange-500 border-orange-500'
                                  : 'border-gray-300'
                              }`}>
                                {isSelected && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <span className="font-medium">{seller}</span>
                            </button>
                          )
                        })}
                        {filteredSellers.length === 0 && (
                          <div className="px-3 py-6 text-center text-sm text-gray-400">
                            No sellers found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  <Users className="inline h-3 w-3 mr-1" />
                  {form.sellers.length} seller{form.sellers.length !== 1 ? 's' : ''} selected
                </p>
              </div>

              {/* Invoice Start Date */}
              <div>
                <Label htmlFor="invoice_start_date">Invoice Start Date</Label>
                <Input
                  id="invoice_start_date"
                  type="date"
                  value={form.invoice_start_date}
                  onChange={(e) => setForm({ ...form, invoice_start_date: e.target.value })}
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {form.invoice_date_type === 'travel_date'
                    ? 'Only bookings with travel date >= this date will be invoiced'
                    : 'Only bookings created >= this date will be invoiced'}
                </p>
              </div>

              {/* Execution Time (only for travel_date) */}
              {form.invoice_date_type === 'travel_date' && (
                <div>
                  <Label htmlFor="execution_time">Cron Execution Time</Label>
                  <Input
                    id="execution_time"
                    type="time"
                    value={form.execution_time}
                    onChange={(e) => setForm({ ...form, execution_time: e.target.value })}
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    <Clock className="inline h-3 w-3 mr-1" />
                    Time of day when the cron job runs to send invoices
                  </p>
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button onClick={saveRule} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {editingRule ? 'Update Rule' : 'Create Rule'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
