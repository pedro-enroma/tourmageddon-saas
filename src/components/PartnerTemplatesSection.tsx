'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2, X, Save, Search, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Available template variables for partner emails
const PARTNER_TEMPLATE_VARIABLES = [
  { key: '{{partner_name}}', label: 'Partner Name', description: 'Partner/supplier name' },
  { key: '{{activity_name}}', label: 'Activity Name', description: 'Tour/activity name' },
  { key: '{{activity_language}}', label: 'Activity Language', description: 'Language of the tour (if set)' },
  { key: '{{visit_date}}', label: 'Visit Date', description: 'Date of visit (DD/MM/YYYY)' },
  { key: '{{entry_time}}', label: 'Entry Time', description: 'Entry/start time' },
  { key: '{{requested_quantity}}', label: 'Requested Quantity', description: 'Number of vouchers requested' },
  { key: '{{total_pax}}', label: 'Total Pax', description: 'Total number of participants' },
  { key: '{{notes}}', label: 'Notes', description: 'Additional notes' },
  { key: '{{request_id}}', label: 'Request ID', description: 'Unique request identifier' },
  { key: '{{date}}', label: 'Date', description: 'Same as visit_date' },
  { key: '{{time}}', label: 'Time', description: 'Same as entry_time' },
]

interface Partner {
  partner_id: string
  name: string
  email: string
}

interface Activity {
  activity_id: string
  title: string
}

interface PartnerTemplate {
  id: string
  partner_id: string
  name: string
  activity_ids: string[]
  language: string | null
  subject: string
  body: string
  is_default: boolean
  created_at: string
  partners?: Partner
}

export default function PartnerTemplatesSection() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<PartnerTemplate[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<PartnerTemplate | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [partnerFilter, setPartnerFilter] = useState<string>('all')

  // Form state
  const [formData, setFormData] = useState({
    partner_id: '',
    name: '',
    activity_ids: [] as string[],
    language: '',
    subject: '',
    body: '',
    is_default: false
  })

  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch templates with partner info
      const { data: templatesData, error: templatesError } = await supabase
        .from('partner_templates')
        .select(`
          *,
          partners (partner_id, name, email)
        `)
        .order('created_at', { ascending: false })

      if (templatesError) throw templatesError
      setTemplates(templatesData || [])

      // Fetch partners
      const { data: partnersData } = await supabase
        .from('partners')
        .select('partner_id, name, email')
        .eq('active', true)
        .order('name')

      setPartners(partnersData || [])

      // Fetch activities
      const { data: activitiesData } = await supabase
        .from('activities')
        .select('activity_id, title')
        .order('title')

      setActivities(activitiesData || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const openModal = (template?: PartnerTemplate) => {
    if (template) {
      setEditingTemplate(template)
      setFormData({
        partner_id: template.partner_id,
        name: template.name,
        activity_ids: template.activity_ids || [],
        language: template.language || '',
        subject: template.subject,
        body: template.body,
        is_default: template.is_default
      })
    } else {
      setEditingTemplate(null)
      setFormData({
        partner_id: partners[0]?.partner_id || '',
        name: '',
        activity_ids: [],
        language: '',
        subject: 'Richiesta Voucher - {{activity_name}} - {{visit_date}}',
        body: getDefaultBody(),
        is_default: false
      })
    }
    setShowModal(true)
  }

  const getDefaultBody = () => `Gentile {{partner_name}},

Vi richiediamo cortesemente i seguenti voucher:

Attività: **{{activity_name}}**
Data: **{{visit_date}}**
Orario: **{{entry_time}}**
Quantità richiesta: **{{requested_quantity}}**
Totale partecipanti: **{{total_pax}}**

In allegato il documento PDF con l'elenco dei partecipanti.

{{notes}}

Cordiali saluti,
EnRoma.com`

  const handleSave = async () => {
    if (!formData.partner_id || !formData.name || !formData.subject || !formData.body) {
      setError('Please fill all required fields')
      return
    }

    try {
      const payload = {
        partner_id: formData.partner_id,
        name: formData.name,
        activity_ids: formData.activity_ids,
        language: formData.language || null,
        subject: formData.subject,
        body: formData.body,
        is_default: formData.is_default
      }

      if (editingTemplate) {
        const { error } = await supabase
          .from('partner_templates')
          .update(payload)
          .eq('id', editingTemplate.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('partner_templates')
          .insert(payload)

        if (error) throw error
      }

      setShowModal(false)
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return

    try {
      const { error } = await supabase
        .from('partner_templates')
        .delete()
        .eq('id', id)

      if (error) throw error
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template')
    }
  }

  const insertVariable = (variable: string) => {
    if (bodyRef.current) {
      const start = bodyRef.current.selectionStart
      const end = bodyRef.current.selectionEnd
      const text = formData.body
      const newText = text.substring(0, start) + variable + text.substring(end)
      setFormData({ ...formData, body: newText })
      setTimeout(() => {
        bodyRef.current?.focus()
        bodyRef.current?.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    }
  }

  const toggleActivity = (activityId: string) => {
    setFormData(prev => ({
      ...prev,
      activity_ids: prev.activity_ids.includes(activityId)
        ? prev.activity_ids.filter(id => id !== activityId)
        : [...prev.activity_ids, activityId]
    }))
  }

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.partners?.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesPartner = partnerFilter === 'all' || t.partner_id === partnerFilter
    return matchesSearch && matchesPartner
  })

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-600 underline mt-1">Dismiss</button>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <p className="text-sm text-gray-500">Create email templates for partner voucher requests</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="all">All Partners</option>
            {partners.map(p => (
              <option key={p.partner_id} value={p.partner_id}>{p.name}</option>
            ))}
          </select>
        </div>
        <Button onClick={() => openModal()} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </div>

      {/* Templates List */}
      <div className="space-y-3">
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No partner templates found. Create one to get started.
          </div>
        ) : (
          filteredTemplates.map(template => (
            <div
              key={template.id}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-teal-600" />
                    <span className="font-medium">{template.name}</span>
                    {template.is_default && (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">Default</span>
                    )}
                    {template.language && (
                      <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">{template.language}</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Partner: <span className="font-medium text-teal-700">{template.partners?.name}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    Subject: {template.subject}
                  </div>
                  {template.activity_ids && template.activity_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {template.activity_ids.slice(0, 3).map(actId => {
                        const activity = activities.find(a => a.activity_id === actId)
                        return activity ? (
                          <span key={actId} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">
                            {activity.title.substring(0, 30)}...
                          </span>
                        ) : null
                      })}
                      {template.activity_ids.length > 3 && (
                        <span className="text-xs text-gray-400">+{template.activity_ids.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openModal(template)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(template.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-semibold">
                {editingTemplate ? 'Edit Partner Template' : 'New Partner Template'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Template Name</label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Catacombe Standard"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Partner</label>
                      <select
                        value={formData.partner_id}
                        onChange={(e) => setFormData({ ...formData, partner_id: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                      >
                        <option value="">Select partner...</option>
                        {partners.map(p => (
                          <option key={p.partner_id} value={p.partner_id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Subject Line</label>
                    <Input
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      placeholder="Richiesta Voucher - {{activity_name}} - {{visit_date}}"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Email Body</label>
                    <textarea
                      ref={bodyRef}
                      value={formData.body}
                      onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                      rows={12}
                      className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                      placeholder="Write your email template here..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Activities (leave empty for all)</label>
                    <div className="border rounded-lg p-3 max-h-32 overflow-y-auto space-y-1">
                      {activities.map(activity => (
                        <label key={activity.activity_id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={formData.activity_ids.includes(activity.activity_id)}
                            onChange={() => toggleActivity(activity.activity_id)}
                            className="rounded"
                          />
                          <span className="text-sm">{activity.title}</span>
                        </label>
                      ))}
                    </div>
                    {formData.activity_ids.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">{formData.activity_ids.length} activities selected</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Language (optional)</label>
                      <select
                        value={formData.language}
                        onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                      >
                        <option value="">Any language</option>
                        <option value="italiano">Italiano</option>
                        <option value="english">English</option>
                        <option value="espanol">Español</option>
                        <option value="francais">Français</option>
                        <option value="deutsch">Deutsch</option>
                      </select>
                    </div>
                    <div className="flex items-center">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={formData.is_default}
                          onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                          className="rounded"
                        />
                        Set as default template
                      </label>
                    </div>
                  </div>
                </div>

                {/* Variables Panel */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-sm mb-3">Available Variables</h3>
                  <p className="text-xs text-gray-500 mb-4">Click to insert at cursor position</p>
                  <div className="space-y-2">
                    {PARTNER_TEMPLATE_VARIABLES.map(v => (
                      <button
                        key={v.key}
                        onClick={() => insertVariable(v.key)}
                        className="w-full text-left px-3 py-2 bg-white border rounded hover:bg-brand-orange-light hover:border-orange-300 transition-colors"
                      >
                        <div className="font-mono text-xs text-brand-orange">{v.key}</div>
                        <div className="text-xs text-gray-500">{v.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 mt-6 border-t">
                <Button variant="outline" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Template
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
