'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Bell, BellOff, Mail, Smartphone, Search, RefreshCw, X, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConditionTreeBuilder } from '@/components/ConditionTreeBuilder'
import {
  NotificationRule,
  ConditionNode,
  TRIGGER_FIELDS,
} from '@/lib/notification-rules-types'

// Trigger event display names
const TRIGGER_LABELS: Record<string, string> = {
  booking_created: 'Booking Created',
  booking_modified: 'Booking Modified',
  booking_cancelled: 'Booking Cancelled',
  voucher_uploaded: 'Voucher Uploaded',
  voucher_deadline_approaching: 'Voucher Deadline Approaching',
  voucher_deadline_missed: 'Voucher Deadline Missed',
  guide_assigned: 'Guide Assigned',
  escort_assigned: 'Escort Assigned',
  assignment_removed: 'Assignment Removed',
  slot_missing_guide: 'Slot Missing Guide',
  slot_placeholder_guide: 'Slot Has Cercare Guide',
  age_mismatch: 'Age Mismatch',
  sync_failure: 'Sync Failure',
}

// Group triggers by category
const TRIGGER_CATEGORIES = {
  'Bookings': ['booking_created', 'booking_modified', 'booking_cancelled'],
  'Vouchers': ['voucher_uploaded', 'voucher_deadline_approaching', 'voucher_deadline_missed'],
  'Assignments': ['guide_assigned', 'escort_assigned', 'assignment_removed'],
  'Slot Status': ['slot_missing_guide', 'slot_placeholder_guide'],
  'System': ['age_mismatch', 'sync_failure'],
}

interface RuleForm {
  id?: string
  name: string
  description: string
  trigger_event: string
  conditions: ConditionNode
  channels: string[]
  email_recipients: string[]
  recipient_roles: string[]
  notification_title: string
  notification_body: string
  notification_url: string
  is_active: boolean
  priority: number
}

const defaultConditions: ConditionNode = {
  type: 'group',
  operator: 'AND',
  children: [],
}

const defaultForm: RuleForm = {
  name: '',
  description: '',
  trigger_event: '',
  conditions: defaultConditions,
  channels: ['push'],
  email_recipients: [],
  recipient_roles: ['admin'],
  notification_title: '',
  notification_body: '',
  notification_url: '/dashboard',
  is_active: true,
  priority: 0,
}

export default function NotificationRulesPage() {
  const [rules, setRules] = useState<NotificationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterTrigger, setFilterTrigger] = useState<string>('')
  const [filterActive, setFilterActive] = useState<string>('all')

  // Dialog state
  const [showDialog, setShowDialog] = useState(false)
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null)
  const [form, setForm] = useState<RuleForm>(defaultForm)
  const [activeTab, setActiveTab] = useState<'basic' | 'trigger' | 'actions' | 'content'>('basic')

  // Email recipient input
  const [emailInput, setEmailInput] = useState('')

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/notification-rules')
      const data = await response.json()
      if (data.data) {
        setRules(data.data)
      }
    } catch (err) {
      console.error('Error fetching rules:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const openCreateDialog = () => {
    setEditingRule(null)
    setForm(defaultForm)
    setActiveTab('basic')
    setShowDialog(true)
  }

  const openEditDialog = (rule: NotificationRule) => {
    setEditingRule(rule)
    setForm({
      id: rule.id,
      name: rule.name,
      description: rule.description || '',
      trigger_event: rule.trigger_event,
      conditions: rule.conditions || defaultConditions,
      channels: rule.channels || ['push'],
      email_recipients: rule.email_recipients || [],
      recipient_roles: rule.recipient_roles || ['admin'],
      notification_title: rule.notification_title || '',
      notification_body: rule.notification_body || '',
      notification_url: rule.notification_url || '/dashboard',
      is_active: rule.is_active,
      priority: rule.priority || 0,
    })
    setActiveTab('basic')
    setShowDialog(true)
  }

  const closeDialog = () => {
    setShowDialog(false)
    setEditingRule(null)
    setForm(defaultForm)
  }

  const saveRule = async () => {
    if (!form.name || !form.trigger_event) {
      alert('Name and trigger event are required')
      return
    }

    setSaving(true)
    try {
      const method = editingRule ? 'PUT' : 'POST'
      const response = await fetch('/api/notification-rules', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (response.ok) {
        await fetchRules()
        closeDialog()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to save rule')
      }
    } catch (err) {
      console.error('Error saving rule:', err)
      alert('Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  const deleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return

    try {
      const response = await fetch(`/api/notification-rules?id=${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await fetchRules()
      } else {
        alert('Failed to delete rule')
      }
    } catch (err) {
      console.error('Error deleting rule:', err)
      alert('Failed to delete rule')
    }
  }

  const toggleRuleActive = async (rule: NotificationRule) => {
    try {
      const response = await fetch('/api/notification-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
      })

      if (response.ok) {
        await fetchRules()
      }
    } catch (err) {
      console.error('Error toggling rule:', err)
    }
  }

  const addEmailRecipient = () => {
    if (emailInput && emailInput.includes('@')) {
      setForm(prev => ({
        ...prev,
        email_recipients: [...prev.email_recipients, emailInput],
      }))
      setEmailInput('')
    }
  }

  const removeEmailRecipient = (email: string) => {
    setForm(prev => ({
      ...prev,
      email_recipients: prev.email_recipients.filter(e => e !== email),
    }))
  }

  const toggleChannel = (channel: string) => {
    setForm(prev => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter(c => c !== channel)
        : [...prev.channels, channel],
    }))
  }

  // Filter rules
  const filteredRules = rules.filter(rule => {
    if (search && !rule.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterTrigger && rule.trigger_event !== filterTrigger) return false
    if (filterActive === 'active' && !rule.is_active) return false
    if (filterActive === 'inactive' && rule.is_active) return false
    return true
  })

  // Stats
  const activeCount = rules.filter(r => r.is_active).length
  const inactiveCount = rules.filter(r => !r.is_active).length

  const renderConditionSummary = (conditions: ConditionNode): string => {
    if (!conditions) return 'No conditions'
    if (conditions.type === 'group') {
      if (!conditions.children || conditions.children.length === 0) return 'No conditions (always matches)'
      if (conditions.children.length === 1) {
        return renderConditionSummary(conditions.children[0])
      }
      return `${conditions.children.length} conditions (${conditions.operator})`
    }
    const fieldLabel = TRIGGER_FIELDS[form.trigger_event]?.find(f => f.field === conditions.field)?.label || conditions.field
    return `${fieldLabel} ${conditions.operator} ${conditions.value}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notification Rules</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure when and how notifications are sent
          </p>
        </div>
        <Button onClick={openCreateDialog} className="bg-brand-orange hover:bg-orange-600">
          <Plus className="h-4 w-4 mr-2" />
          Create Rule
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-green-600">{activeCount}</div>
          <div className="text-sm text-gray-500">Active Rules</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-gray-400">{inactiveCount}</div>
          <div className="text-sm text-gray-500">Inactive Rules</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-brand-orange">{rules.length}</div>
          <div className="text-sm text-gray-500">Total Rules</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-white rounded-lg border p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterTrigger}
          onChange={(e) => setFilterTrigger(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Triggers</option>
          {Object.entries(TRIGGER_CATEGORIES).map(([category, triggers]) => (
            <optgroup key={category} label={category}>
              {triggers.map(trigger => (
                <option key={trigger} value={trigger}>{TRIGGER_LABELS[trigger]}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
        <Button variant="outline" size="sm" onClick={fetchRules}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading rules...</div>
        ) : filteredRules.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border">
            <Bell className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No notification rules found</p>
            <Button onClick={openCreateDialog} variant="outline" className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Rule
            </Button>
          </div>
        ) : (
          filteredRules.map((rule) => (
            <div
              key={rule.id}
              className={`bg-white rounded-lg border p-4 ${!rule.is_active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleRuleActive(rule)}
                    className={`mt-1 ${rule.is_active ? 'text-green-500' : 'text-gray-300'}`}
                    title={rule.is_active ? 'Active - click to disable' : 'Inactive - click to enable'}
                  >
                    {rule.is_active ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
                  </button>
                  <div>
                    <h3 className="font-semibold text-gray-900">{rule.name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Trigger: <span className="font-medium">{TRIGGER_LABELS[rule.trigger_event] || rule.trigger_event}</span>
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        {rule.channels.includes('push') && <Smartphone className="h-3 w-3" />}
                        {rule.channels.includes('email') && <Mail className="h-3 w-3" />}
                        {rule.channels.join(', ')}
                      </span>
                      <span>|</span>
                      <span>{renderConditionSummary(rule.conditions)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(rule)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => deleteRule(rule.id)} className="text-red-500 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Dialog Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <h2 className="text-lg font-semibold">
                {editingRule ? 'Edit Rule' : 'Create Notification Rule'}
              </h2>
              <button onClick={closeDialog} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="border-b px-6">
              <div className="flex gap-6">
                {(['basic', 'trigger', 'actions', 'content'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-3 border-b-2 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? 'border-brand-orange text-brand-orange'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab === 'basic' && 'Basic Info'}
                    {tab === 'trigger' && 'Trigger & Conditions'}
                    {tab === 'actions' && 'Actions'}
                    {tab === 'content' && 'Notification Content'}
                  </button>
                ))}
              </div>
            </div>

            {/* Dialog Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Basic Info Tab */}
              {activeTab === 'basic' && (
                <div className="space-y-4">
                  <div>
                    <Label>Rule Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Age Mismatch Alert"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Optional description of what this rule does..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Priority</Label>
                      <Input
                        type="number"
                        value={form.priority}
                        onChange={(e) => setForm(prev => ({ ...prev, priority: Number(e.target.value) }))}
                        className="mt-1"
                      />
                      <p className="text-xs text-gray-500 mt-1">Higher priority rules are evaluated first</p>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <div className="mt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(e) => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                            className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                          />
                          <span className="text-sm">Rule is active</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Trigger & Conditions Tab */}
              {activeTab === 'trigger' && (
                <div className="space-y-6">
                  <div>
                    <Label>Trigger Event *</Label>
                    <select
                      value={form.trigger_event}
                      onChange={(e) => setForm(prev => ({
                        ...prev,
                        trigger_event: e.target.value,
                        conditions: defaultConditions,
                      }))}
                      className="mt-1 w-full border rounded-lg px-3 py-2"
                    >
                      <option value="">Select a trigger...</option>
                      {Object.entries(TRIGGER_CATEGORIES).map(([category, triggers]) => (
                        <optgroup key={category} label={category}>
                          {triggers.map(trigger => (
                            <option key={trigger} value={trigger}>{TRIGGER_LABELS[trigger]}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <ConditionTreeBuilder
                    trigger={form.trigger_event}
                    conditions={form.conditions}
                    onChange={(conditions) => setForm(prev => ({ ...prev, conditions }))}
                  />
                </div>
              )}

              {/* Actions Tab */}
              {activeTab === 'actions' && (
                <div className="space-y-6">
                  <div>
                    <Label>Notification Channels</Label>
                    <div className="mt-2 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.channels.includes('push')}
                          onChange={() => toggleChannel('push')}
                          className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                        />
                        <Smartphone className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">Push Notification (browser)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.channels.includes('email')}
                          onChange={() => toggleChannel('email')}
                          className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                        />
                        <Mail className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">Email</span>
                      </label>
                    </div>
                  </div>

                  {form.channels.includes('email') && (
                    <div>
                      <Label>Email Recipients</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          type="email"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="email@example.com"
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmailRecipient())}
                        />
                        <Button type="button" variant="outline" onClick={addEmailRecipient}>
                          Add
                        </Button>
                      </div>
                      {form.email_recipients.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {form.email_recipients.map((email) => (
                            <span
                              key={email}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm"
                            >
                              {email}
                              <button onClick={() => removeEmailRecipient(email)} className="text-gray-400 hover:text-red-500">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <Label>Recipient Roles</Label>
                    <p className="text-xs text-gray-500 mb-2">Who should receive push notifications</p>
                    <div className="space-y-2">
                      {['admin', 'guide', 'escort'].map((role) => (
                        <label key={role} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.recipient_roles.includes(role)}
                            onChange={() => {
                              setForm(prev => ({
                                ...prev,
                                recipient_roles: prev.recipient_roles.includes(role)
                                  ? prev.recipient_roles.filter(r => r !== role)
                                  : [...prev.recipient_roles, role],
                              }))
                            }}
                            className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                          />
                          <span className="text-sm capitalize">{role}s</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Content Tab */}
              {activeTab === 'content' && (
                <div className="space-y-4">
                  <div>
                    <Label>Notification Title</Label>
                    <Input
                      value={form.notification_title}
                      onChange={(e) => setForm(prev => ({ ...prev, notification_title: e.target.value }))}
                      placeholder="e.g., Age Mismatch Alert"
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave empty to use rule name</p>
                  </div>
                  <div>
                    <Label>Notification Body</Label>
                    <Textarea
                      value={form.notification_body}
                      onChange={(e) => setForm(prev => ({ ...prev, notification_body: e.target.value }))}
                      placeholder="e.g., {mismatch_count} age mismatches found in booking #{booking_id}"
                      className="mt-1"
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Use {'{variable}'} to insert dynamic values. Available variables depend on the trigger event.
                    </p>
                  </div>
                  <div>
                    <Label>Click URL</Label>
                    <Input
                      value={form.notification_url}
                      onChange={(e) => setForm(prev => ({ ...prev, notification_url: e.target.value }))}
                      placeholder="/dashboard?view=notifications"
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">Where to navigate when notification is clicked</p>
                  </div>

                  {/* Variable hints */}
                  {form.trigger_event && TRIGGER_FIELDS[form.trigger_event] && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <Label className="text-xs">Available Variables for {TRIGGER_LABELS[form.trigger_event]}</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {TRIGGER_FIELDS[form.trigger_event].map((field) => (
                          <code
                            key={field.field}
                            className="px-2 py-1 bg-gray-200 rounded text-xs cursor-pointer hover:bg-gray-300"
                            onClick={() => {
                              const variable = `{${field.field}}`
                              setForm(prev => ({
                                ...prev,
                                notification_body: prev.notification_body + variable,
                              }))
                            }}
                            title={`Click to insert ${field.field}`}
                          >
                            {'{' + field.field + '}'}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button onClick={saveRule} disabled={saving} className="bg-brand-orange hover:bg-orange-600">
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
