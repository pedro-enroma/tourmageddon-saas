'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { contentApi, activityTemplatesApi } from '@/lib/api-client'
import {
  FileText, MapPin, Plus, Pencil, Trash2, X, Save,
  ChevronRight, ExternalLink, Search, Link2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Available template variables for single emails
const TEMPLATE_VARIABLES = [
  { key: '{{name}}', label: 'Recipient Name', description: 'Guide or escort name (personalized per recipient)' },
  { key: '{{tour_title}}', label: 'Tour Title', description: 'Activity/tour name' },
  { key: '{{date}}', label: 'Date', description: 'Service date (e.g., Wednesday, November 26, 2025)' },
  { key: '{{time}}', label: 'Time', description: 'Service start time (e.g., 10:00)' },
  { key: '{{entry_time}}', label: 'Entry Time', description: 'Ticket entry time from voucher (e.g., 12:30)' },
  { key: '{{pax_count}}', label: 'Pax Count', description: 'Number of participants' },
  { key: '{{guide_name}}', label: 'Guide Name', description: 'Assigned guide\'s full name' },
  { key: '{{guide_phone}}', label: 'Guide Phone', description: 'Assigned guide\'s phone number' },
  { key: '{{escort_name}}', label: 'Escort Name', description: 'Assigned escort\'s full name' },
  { key: '{{escort_phone}}', label: 'Escort Phone', description: 'Assigned escort\'s phone number' },
  { key: '{{headphone_name}}', label: 'Headphone Name', description: 'Assigned headphone contact name (only if assigned)' },
  { key: '{{headphone_phone}}', label: 'Headphone Phone', description: 'Assigned headphone contact phone (only if assigned)' },
  { key: '{{#if_headphone}}', label: 'If Headphone', description: 'Start conditional block - content only shows if headphone assigned' },
  { key: '{{/if_headphone}}', label: 'End If Headphone', description: 'End conditional block for headphone' },
  { key: '{{meeting_point}}', label: 'Meeting Point', description: 'Default meeting point for the activity' },
]

// Available template variables for consolidated emails
const CONSOLIDATED_TEMPLATE_VARIABLES = [
  { key: '{{name}}', label: 'Recipient Name', description: 'Escort or headphone contact name' },
  { key: '{{date}}', label: 'Date', description: 'Service date (e.g., Wednesday, November 26, 2025)' },
  { key: '{{services_list}}', label: 'Services List', description: 'List of all services with details (auto-generated)' },
  { key: '{{services_count}}', label: 'Services Count', description: 'Total number of services for the day' },
]

// Template for services_list item
const CONSOLIDATED_SERVICE_VARIABLES = [
  { key: '{{service.title}}', label: 'Tour Title', description: 'Activity/tour name' },
  { key: '{{service.time}}', label: 'Time', description: 'Service start time' },
  { key: '{{service.meeting_point}}', label: 'Meeting Point', description: 'Meeting location' },
  { key: '{{service.pax_count}}', label: 'Pax Count', description: 'Number of participants' },
  { key: '{{service.guide_name}}', label: 'Guide Name', description: 'Assigned guide name' },
  { key: '{{service.guide_phone}}', label: 'Guide Phone', description: 'Guide phone number' },
  { key: '{{service.escort_name}}', label: 'Escort Name', description: 'Assigned escort name (for headphones template)' },
  { key: '{{service.escort_phone}}', label: 'Escort Phone', description: 'Escort phone number (for headphones template)' },
  { key: '{{service.headphone_name}}', label: 'Headphone Name', description: 'Headphone contact name (for escort template)' },
  { key: '{{service.headphone_phone}}', label: 'Headphone Phone', description: 'Headphone phone number (for escort template)' },
]

type TemplateType = 'guide' | 'escort' | 'headphone'
type ConsolidatedTemplateType = 'escort_consolidated' | 'headphone_consolidated'

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  template_type: TemplateType
  is_default: boolean
  created_at: string
}

interface ConsolidatedEmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  service_item_template: string
  template_type: ConsolidatedTemplateType
  is_default: boolean
  created_at: string
}

interface ActivityTemplateAssignment {
  id: string
  activity_id: string
  template_id: string
  template_type: TemplateType
  template?: EmailTemplate
}

interface MeetingPoint {
  id: string
  name: string
  description: string | null
  address: string | null
  google_maps_url: string | null
  instructions: string | null
  created_at: string
}

interface Activity {
  activity_id: string
  title: string
}

interface ActivityMeetingPoint {
  id: string
  activity_id: string
  meeting_point_id: string
  is_default: boolean
}

type Tab = 'templates' | 'meeting-points' | 'assignments' | 'template-defaults' | 'consolidated-templates'

export default function ContentPage() {
  const [activeTab, setActiveTab] = useState<Tab>('templates')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)

  // Meeting points state
  const [meetingPoints, setMeetingPoints] = useState<MeetingPoint[]>([])
  const [editingMeetingPoint, setEditingMeetingPoint] = useState<MeetingPoint | null>(null)
  const [showMeetingPointModal, setShowMeetingPointModal] = useState(false)

  // Assignments state
  const [activities, setActivities] = useState<Activity[]>([])
  const [activityMeetingPoints, setActivityMeetingPoints] = useState<ActivityMeetingPoint[]>([])
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null)
  const [activitySearch, setActivitySearch] = useState('')

  // Template form state
  const [templateName, setTemplateName] = useState('')
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [templateIsDefault, setTemplateIsDefault] = useState(false)
  const [templateType, setTemplateType] = useState<TemplateType>('guide')
  const [templateTypeFilter, setTemplateTypeFilter] = useState<TemplateType | 'all'>('all')
  const templateBodyRef = useRef<HTMLTextAreaElement>(null)

  // Activity Template Defaults state
  const [activityTemplateAssignments, setActivityTemplateAssignments] = useState<ActivityTemplateAssignment[]>([])
  const [selectedActivityForTemplates, setSelectedActivityForTemplates] = useState<string | null>(null)
  const [activityTemplateSearch, setActivityTemplateSearch] = useState('')

  // Meeting point form state
  const [mpName, setMpName] = useState('')
  const [mpDescription, setMpDescription] = useState('')
  const [mpAddress, setMpAddress] = useState('')
  const [mpGoogleMapsUrl, setMpGoogleMapsUrl] = useState('')
  const [mpInstructions, setMpInstructions] = useState('')

  // Consolidated templates state
  const [consolidatedTemplates, setConsolidatedTemplates] = useState<ConsolidatedEmailTemplate[]>([])
  const [editingConsolidatedTemplate, setEditingConsolidatedTemplate] = useState<ConsolidatedEmailTemplate | null>(null)
  const [showConsolidatedTemplateModal, setShowConsolidatedTemplateModal] = useState(false)
  const [consolidatedTemplateName, setConsolidatedTemplateName] = useState('')
  const [consolidatedTemplateSubject, setConsolidatedTemplateSubject] = useState('')
  const [consolidatedTemplateBody, setConsolidatedTemplateBody] = useState('')
  const [consolidatedServiceItemTemplate, setConsolidatedServiceItemTemplate] = useState('')
  const [consolidatedTemplateType, setConsolidatedTemplateType] = useState<ConsolidatedTemplateType>('escort_consolidated')
  const [consolidatedTemplateIsDefault, setConsolidatedTemplateIsDefault] = useState(false)
  const [consolidatedTemplateTypeFilter, setConsolidatedTemplateTypeFilter] = useState<ConsolidatedTemplateType | 'all'>('all')
  const consolidatedBodyRef = useRef<HTMLTextAreaElement>(null)
  const consolidatedServiceRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchTemplates(),
        fetchMeetingPoints(),
        fetchActivities(),
        fetchActivityMeetingPoints(),
        fetchActivityTemplateAssignments(),
        fetchConsolidatedTemplates()
      ])
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    setTemplates(data || [])
  }

  const fetchMeetingPoints = async () => {
    const { data, error } = await supabase
      .from('meeting_points')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    setMeetingPoints(data || [])
  }

  const fetchActivities = async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('activity_id, title')
      .order('title', { ascending: true })

    if (error) throw error
    setActivities(data || [])
  }

  const fetchActivityMeetingPoints = async () => {
    const { data, error } = await supabase
      .from('activity_meeting_points')
      .select('*')

    if (error) throw error
    setActivityMeetingPoints(data || [])
  }

  const fetchActivityTemplateAssignments = async () => {
    try {
      const result = await activityTemplatesApi.list()
      if (result.error) throw new Error(result.error)
      setActivityTemplateAssignments(result.data || [])
    } catch (err) {
      console.error('Error fetching activity template assignments:', err)
    }
  }

  const fetchConsolidatedTemplates = async () => {
    try {
      const response = await fetch('/api/content/consolidated-templates')
      const result = await response.json()

      if (!response.ok) {
        console.error('Error fetching consolidated templates:', result.error)
        return
      }
      setConsolidatedTemplates(result.data || [])
    } catch (err) {
      console.error('Error fetching consolidated templates:', err)
    }
  }

  // Insert variable at cursor position
  const insertVariable = (variableKey: string) => {
    if (!templateBodyRef.current) return

    const textarea = templateBodyRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = templateBody.substring(0, start) + variableKey + templateBody.substring(end)
    setTemplateBody(newValue)

    // Set cursor position after inserted variable
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + variableKey.length, start + variableKey.length)
    }, 0)
  }

  // Template CRUD
  const openNewTemplate = () => {
    setEditingTemplate(null)
    setTemplateName('')
    setTemplateSubject('')
    setTemplateBody('')
    setTemplateIsDefault(false)
    setTemplateType('guide')
    setShowTemplateModal(true)
  }

  const openEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template)
    setTemplateName(template.name)
    setTemplateSubject(template.subject)
    setTemplateBody(template.body)
    setTemplateIsDefault(template.is_default)
    setTemplateType(template.template_type || 'guide')
    setShowTemplateModal(true)
  }

  const saveTemplate = async () => {
    if (!templateName.trim() || !templateSubject.trim() || !templateBody.trim()) {
      setError('Please fill in all template fields')
      return
    }

    try {
      if (editingTemplate) {
        const result = await contentApi.templates.update({
          id: editingTemplate.id,
          name: templateName,
          subject: templateSubject,
          body: templateBody,
          is_default: templateIsDefault,
          template_type: templateType
        })

        if (result.error) throw new Error(result.error)
      } else {
        const result = await contentApi.templates.create({
          name: templateName,
          subject: templateSubject,
          body: templateBody,
          is_default: templateIsDefault,
          template_type: templateType
        })

        if (result.error) throw new Error(result.error)
      }

      setShowTemplateModal(false)
      await fetchTemplates()
    } catch (err) {
      console.error('Error saving template:', err)
      setError(err instanceof Error ? err.message : 'Failed to save template')
    }
  }

  const deleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return

    try {
      const result = await contentApi.templates.delete(id)
      if (result.error) throw new Error(result.error)
      await fetchTemplates()
    } catch (err) {
      console.error('Error deleting template:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete template')
    }
  }

  // Consolidated Template CRUD
  const openNewConsolidatedTemplate = () => {
    setEditingConsolidatedTemplate(null)
    setConsolidatedTemplateName('')
    setConsolidatedTemplateSubject('')
    setConsolidatedTemplateBody('')
    setConsolidatedServiceItemTemplate('')
    setConsolidatedTemplateIsDefault(false)
    setConsolidatedTemplateType('escort_consolidated')
    setShowConsolidatedTemplateModal(true)
  }

  const openEditConsolidatedTemplate = (template: ConsolidatedEmailTemplate) => {
    setEditingConsolidatedTemplate(template)
    setConsolidatedTemplateName(template.name)
    setConsolidatedTemplateSubject(template.subject)
    setConsolidatedTemplateBody(template.body)
    setConsolidatedServiceItemTemplate(template.service_item_template || '')
    setConsolidatedTemplateIsDefault(template.is_default)
    setConsolidatedTemplateType(template.template_type)
    setShowConsolidatedTemplateModal(true)
  }

  const saveConsolidatedTemplate = async () => {
    if (!consolidatedTemplateName.trim() || !consolidatedTemplateSubject.trim() || !consolidatedTemplateBody.trim()) {
      setError('Please fill in all template fields')
      return
    }

    try {
      const payload = {
        name: consolidatedTemplateName,
        subject: consolidatedTemplateSubject,
        body: consolidatedTemplateBody,
        service_item_template: consolidatedServiceItemTemplate,
        is_default: consolidatedTemplateIsDefault,
        template_type: consolidatedTemplateType,
        ...(editingConsolidatedTemplate && { id: editingConsolidatedTemplate.id })
      }

      const response = await fetch('/api/content/consolidated-templates', {
        method: editingConsolidatedTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save template')
      }

      setShowConsolidatedTemplateModal(false)
      await fetchConsolidatedTemplates()
    } catch (err: unknown) {
      console.error('Error saving consolidated template:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to save template'
      setError(errorMessage)
    }
  }

  const deleteConsolidatedTemplate = async (id: string) => {
    if (!confirm('Delete this consolidated template?')) return

    try {
      const response = await fetch(`/api/content/consolidated-templates?id=${id}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete template')
      }

      await fetchConsolidatedTemplates()
    } catch (err) {
      console.error('Error deleting consolidated template:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete template')
    }
  }

  const insertConsolidatedVariable = (variableKey: string, target: 'body' | 'service') => {
    const ref = target === 'body' ? consolidatedBodyRef : consolidatedServiceRef
    const setter = target === 'body' ? setConsolidatedTemplateBody : setConsolidatedServiceItemTemplate
    const currentValue = target === 'body' ? consolidatedTemplateBody : consolidatedServiceItemTemplate

    if (!ref.current) return

    const textarea = ref.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = currentValue.substring(0, start) + variableKey + currentValue.substring(end)
    setter(newValue)

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + variableKey.length, start + variableKey.length)
    }, 0)
  }

  // Meeting Point CRUD
  const openNewMeetingPoint = () => {
    setEditingMeetingPoint(null)
    setMpName('')
    setMpDescription('')
    setMpAddress('')
    setMpGoogleMapsUrl('')
    setMpInstructions('')
    setShowMeetingPointModal(true)
  }

  const openEditMeetingPoint = (mp: MeetingPoint) => {
    setEditingMeetingPoint(mp)
    setMpName(mp.name)
    setMpDescription(mp.description || '')
    setMpAddress(mp.address || '')
    setMpGoogleMapsUrl(mp.google_maps_url || '')
    setMpInstructions(mp.instructions || '')
    setShowMeetingPointModal(true)
  }

  const saveMeetingPoint = async () => {
    if (!mpName.trim()) {
      setError('Please enter a meeting point name')
      return
    }

    try {
      if (editingMeetingPoint) {
        const result = await contentApi.meetingPoints.update({
          id: editingMeetingPoint.id,
          name: mpName,
          description: mpDescription || null,
          address: mpAddress || null,
          google_maps_url: mpGoogleMapsUrl || null,
          instructions: mpInstructions || null
        })

        if (result.error) throw new Error(result.error)
      } else {
        const result = await contentApi.meetingPoints.create({
          name: mpName,
          description: mpDescription || null,
          address: mpAddress || null,
          google_maps_url: mpGoogleMapsUrl || null,
          instructions: mpInstructions || null
        })

        if (result.error) throw new Error(result.error)
      }

      setShowMeetingPointModal(false)
      await fetchMeetingPoints()
    } catch (err) {
      console.error('Error saving meeting point:', err)
      setError(err instanceof Error ? err.message : 'Failed to save meeting point')
    }
  }

  const deleteMeetingPoint = async (id: string) => {
    if (!confirm('Delete this meeting point? It will be removed from all assigned activities.')) return

    try {
      const result = await contentApi.meetingPoints.delete(id)
      if (result.error) throw new Error(result.error)
      await fetchMeetingPoints()
      await fetchActivityMeetingPoints()
    } catch (err) {
      console.error('Error deleting meeting point:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete meeting point')
    }
  }

  // Activity Meeting Point assignments
  const toggleActivityMeetingPoint = async (activityId: string, meetingPointId: string) => {
    const existing = activityMeetingPoints.find(
      amp => amp.activity_id === activityId && amp.meeting_point_id === meetingPointId
    )

    try {
      if (existing) {
        // Remove assignment via API
        const result = await contentApi.activityMeetingPoints.delete(existing.id)
        if (result.error) throw new Error(result.error)
      } else {
        // Add assignment via API
        const result = await contentApi.activityMeetingPoints.create({
          activity_id: activityId,
          meeting_point_id: meetingPointId,
          is_default: false
        })
        if (result.error) {
          // If already exists, just refresh data to sync UI
          if (result.error.includes('already assigned')) {
            await fetchActivityMeetingPoints()
            return
          }
          throw new Error(result.error)
        }
      }

      await fetchActivityMeetingPoints()
    } catch (err) {
      console.error('Error toggling assignment:', err)
      // Refresh data to sync state in case of any error
      await fetchActivityMeetingPoints()
      setError(err instanceof Error ? err.message : 'Failed to update assignment')
    }
  }

  const setDefaultMeetingPoint = async (activityId: string, meetingPointId: string) => {
    try {
      // Use API to update with unset_others flag
      const result = await contentApi.activityMeetingPoints.update({
        activity_id: activityId,
        meeting_point_id: meetingPointId,
        is_default: true,
        unset_others: true
      })
      if (result.error) throw new Error(result.error)

      await fetchActivityMeetingPoints()
    } catch (err) {
      console.error('Error setting default:', err)
      setError(err instanceof Error ? err.message : 'Failed to set default meeting point')
    }
  }

  const getMeetingPointsForActivity = (activityId: string) => {
    return activityMeetingPoints.filter(amp => amp.activity_id === activityId)
  }

  const isAssigned = (activityId: string, meetingPointId: string) => {
    return activityMeetingPoints.some(
      amp => amp.activity_id === activityId && amp.meeting_point_id === meetingPointId
    )
  }

  const isDefault = (activityId: string, meetingPointId: string) => {
    return activityMeetingPoints.some(
      amp => amp.activity_id === activityId && amp.meeting_point_id === meetingPointId && amp.is_default
    )
  }

  const filteredActivities = activities.filter(a =>
    a.title.toLowerCase().includes(activitySearch.toLowerCase())
  )

  const filteredActivitiesForTemplates = activities.filter(a =>
    a.title.toLowerCase().includes(activityTemplateSearch.toLowerCase())
  )

  // Activity Template Defaults functions
  const getActivityTemplateAssignment = (activityId: string, type: TemplateType) => {
    return activityTemplateAssignments.find(
      ata => ata.activity_id === activityId && ata.template_type === type
    )
  }

  const setActivityTemplateDefault = async (activityId: string, templateId: string, type: TemplateType) => {
    try {
      const result = await activityTemplatesApi.create({
        activity_id: activityId,
        template_id: templateId,
        template_type: type
      })
      if (result.error) throw new Error(result.error)
      await fetchActivityTemplateAssignments()
    } catch (err) {
      console.error('Error setting activity template default:', err)
      setError(err instanceof Error ? err.message : 'Failed to set default template')
    }
  }

  const removeActivityTemplateDefault = async (activityId: string, type: TemplateType) => {
    try {
      const result = await activityTemplatesApi.delete(activityId, type)
      if (result.error) throw new Error(result.error)
      await fetchActivityTemplateAssignments()
    } catch (err) {
      console.error('Error removing activity template default:', err)
      setError(err instanceof Error ? err.message : 'Failed to remove default template')
    }
  }

  const getTemplatesForType = (type: TemplateType) => {
    return templates.filter(t => t.template_type === type || (!t.template_type && type === 'guide'))
  }

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="text-center py-12 text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Content Management</h1>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-600 underline mt-1">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'templates'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Email Templates
          </div>
        </button>
        <button
          onClick={() => setActiveTab('meeting-points')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'meeting-points'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Meeting Points
          </div>
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'assignments'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4" />
            Meeting Point Assignments
          </div>
        </button>
        <button
          onClick={() => setActiveTab('template-defaults')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'template-defaults'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Activity Template Defaults
          </div>
        </button>
        <button
          onClick={() => setActiveTab('consolidated-templates')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'consolidated-templates'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Consolidated Templates
          </div>
        </button>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-500">Create email templates with dynamic variables</p>
              <select
                value={templateTypeFilter}
                onChange={(e) => setTemplateTypeFilter(e.target.value as TemplateType | 'all')}
                className="text-sm border rounded-md px-3 py-1.5"
              >
                <option value="all">All Types</option>
                <option value="guide">Guide Templates</option>
                <option value="escort">Escort Templates</option>
                <option value="headphone">Headphone Templates</option>
              </select>
            </div>
            <Button onClick={openNewTemplate}>
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </div>

          {templates.filter(t => templateTypeFilter === 'all' || t.template_type === templateTypeFilter).length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
              No templates yet. Create your first email template.
            </div>
          ) : (
            <div className="space-y-3">
              {templates
                .filter(t => templateTypeFilter === 'all' || t.template_type === templateTypeFilter)
                .map(template => (
                <div key={template.id} className="bg-white rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{template.name}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded capitalize ${
                          template.template_type === 'guide' ? 'bg-blue-100 text-blue-800' :
                          template.template_type === 'escort' ? 'bg-orange-100 text-orange-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {template.template_type || 'guide'}
                        </span>
                        {template.is_default && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">Default</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Subject: {template.subject}</p>
                      <p className="text-xs text-gray-400 mt-2 line-clamp-2">{template.body}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditTemplate(template)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => deleteTemplate(template.id)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Meeting Points Tab */}
      {activeTab === 'meeting-points' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">Define meeting points for your tours</p>
            <Button onClick={openNewMeetingPoint}>
              <Plus className="w-4 h-4 mr-2" />
              New Meeting Point
            </Button>
          </div>

          {meetingPoints.length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
              No meeting points yet. Create your first meeting point.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {meetingPoints.map(mp => (
                <div key={mp.id} className="bg-white rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-red-500" />
                        {mp.name}
                      </h3>
                      {mp.description && (
                        <p className="text-sm text-gray-500 mt-1">{mp.description}</p>
                      )}
                      {mp.address && (
                        <p className="text-xs text-gray-400 mt-2">{mp.address}</p>
                      )}
                      {mp.google_maps_url && (
                        <a
                          href={mp.google_maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View on Google Maps
                        </a>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditMeetingPoint(mp)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => deleteMeetingPoint(mp.id)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Assignments Tab */}
      {activeTab === 'assignments' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">Assign meeting points to activities/tours</p>

          {meetingPoints.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700 text-sm">
              Create meeting points first before assigning them to activities.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Activities List */}
              <div className="bg-white rounded-lg border">
                <div className="p-4 border-b">
                  <h3 className="font-medium mb-2">Activities</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search activities..."
                      value={activitySearch}
                      onChange={(e) => setActivitySearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {filteredActivities.map(activity => {
                    const assignedPoints = getMeetingPointsForActivity(activity.activity_id)
                    return (
                      <div
                        key={activity.activity_id}
                        onClick={() => setSelectedActivity(activity.activity_id)}
                        className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                          selectedActivity === activity.activity_id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="font-medium text-sm">{activity.title}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {assignedPoints.length === 0
                            ? 'No meeting points assigned'
                            : `${assignedPoints.length} meeting point${assignedPoints.length !== 1 ? 's' : ''}`}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Meeting Points Assignment */}
              <div className="bg-white rounded-lg border">
                <div className="p-4 border-b">
                  <h3 className="font-medium">
                    {selectedActivity
                      ? `Meeting Points for: ${activities.find(a => a.activity_id === selectedActivity)?.title}`
                      : 'Select an activity'}
                  </h3>
                </div>
                <div className="p-4">
                  {!selectedActivity ? (
                    <div className="text-center text-gray-500 py-8">
                      Select an activity to manage its meeting points
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {meetingPoints.map(mp => {
                        const assigned = isAssigned(selectedActivity, mp.id)
                        const isDefaultMp = isDefault(selectedActivity, mp.id)
                        return (
                          <div
                            key={mp.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              assigned ? 'bg-green-50 border-green-200' : 'bg-gray-50'
                            }`}
                          >
                            <label className="flex items-center gap-3 cursor-pointer flex-1">
                              <input
                                type="checkbox"
                                checked={assigned}
                                onChange={() => toggleActivityMeetingPoint(selectedActivity, mp.id)}
                                className="rounded"
                              />
                              <div>
                                <div className="font-medium text-sm flex items-center gap-2">
                                  {mp.name}
                                  {isDefaultMp && (
                                    <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">Default</span>
                                  )}
                                </div>
                                {mp.address && (
                                  <div className="text-xs text-gray-500">{mp.address}</div>
                                )}
                              </div>
                            </label>
                            {assigned && !isDefaultMp && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDefaultMeetingPoint(selectedActivity, mp.id)}
                                className="text-xs"
                              >
                                Set as default
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity Template Defaults Tab */}
      {activeTab === 'template-defaults' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">Assign default email templates to activities by recipient type</p>

          {templates.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700 text-sm">
              Create email templates first before assigning them to activities.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Activities List */}
              <div className="bg-white rounded-lg border">
                <div className="p-4 border-b">
                  <h3 className="font-medium mb-2">Activities</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search activities..."
                      value={activityTemplateSearch}
                      onChange={(e) => setActivityTemplateSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {filteredActivitiesForTemplates.map(activity => {
                    const guideTemplate = getActivityTemplateAssignment(activity.activity_id, 'guide')
                    const escortTemplate = getActivityTemplateAssignment(activity.activity_id, 'escort')
                    const headphoneTemplate = getActivityTemplateAssignment(activity.activity_id, 'headphone')
                    const assignedCount = [guideTemplate, escortTemplate, headphoneTemplate].filter(Boolean).length
                    return (
                      <div
                        key={activity.activity_id}
                        onClick={() => setSelectedActivityForTemplates(activity.activity_id)}
                        className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                          selectedActivityForTemplates === activity.activity_id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="font-medium text-sm">{activity.title}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {assignedCount === 0
                            ? 'No default templates'
                            : `${assignedCount} default template${assignedCount !== 1 ? 's' : ''} set`}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Template Assignments */}
              <div className="bg-white rounded-lg border">
                <div className="p-4 border-b">
                  <h3 className="font-medium">
                    {selectedActivityForTemplates
                      ? `Default Templates for: ${activities.find(a => a.activity_id === selectedActivityForTemplates)?.title}`
                      : 'Select an activity'}
                  </h3>
                </div>
                <div className="p-4">
                  {!selectedActivityForTemplates ? (
                    <div className="text-center text-gray-500 py-8">
                      Select an activity to manage its default templates
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {(['guide', 'escort', 'headphone'] as TemplateType[]).map(type => {
                        const currentAssignment = getActivityTemplateAssignment(selectedActivityForTemplates, type)
                        const availableTemplates = getTemplatesForType(type)
                        return (
                          <div key={type} className="border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className={`font-medium capitalize flex items-center gap-2 ${
                                type === 'guide' ? 'text-blue-700' :
                                type === 'escort' ? 'text-orange-700' :
                                'text-purple-700'
                              }`}>
                                <span className={`w-3 h-3 rounded-full ${
                                  type === 'guide' ? 'bg-blue-500' :
                                  type === 'escort' ? 'bg-orange-500' :
                                  'bg-purple-500'
                                }`} />
                                {type} Template
                              </h4>
                              {currentAssignment && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeActivityTemplateDefault(selectedActivityForTemplates, type)}
                                  className="text-red-600 hover:text-red-700 h-7 text-xs"
                                >
                                  <Trash2 className="w-3 h-3 mr-1" />
                                  Remove
                                </Button>
                              )}
                            </div>
                            {availableTemplates.length === 0 ? (
                              <p className="text-xs text-gray-400">No {type} templates available. Create one first.</p>
                            ) : (
                              <select
                                value={currentAssignment?.template_id || ''}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    setActivityTemplateDefault(selectedActivityForTemplates, e.target.value, type)
                                  }
                                }}
                                className="w-full px-3 py-2 border rounded-md text-sm"
                              >
                                <option value="">Select a {type} template...</option>
                                {availableTemplates.map(template => (
                                  <option key={template.id} value={template.id}>
                                    {template.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            {currentAssignment && (
                              <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                                Current: <strong>{templates.find(t => t.id === currentAssignment.template_id)?.name}</strong>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Consolidated Templates Tab */}
      {activeTab === 'consolidated-templates' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-500">Create consolidated email templates for daily summaries</p>
              <select
                value={consolidatedTemplateTypeFilter}
                onChange={(e) => setConsolidatedTemplateTypeFilter(e.target.value as ConsolidatedTemplateType | 'all')}
                className="text-sm border rounded-md px-3 py-1.5"
              >
                <option value="all">All Types</option>
                <option value="escort_consolidated">Escort Consolidated</option>
                <option value="headphone_consolidated">Headphone Consolidated</option>
              </select>
            </div>
            <Button onClick={openNewConsolidatedTemplate}>
              <Plus className="w-4 h-4 mr-2" />
              New Consolidated Template
            </Button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-800">
              <strong>Consolidated templates</strong> are used to send a single daily email containing all services for a staff member.
              The email body uses <code className="bg-blue-100 px-1 rounded">{'{{services_list}}'}</code> which is replaced with the rendered service items.
            </p>
          </div>

          {consolidatedTemplates.filter(t => consolidatedTemplateTypeFilter === 'all' || t.template_type === consolidatedTemplateTypeFilter).length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
              No consolidated templates yet. Create your first template.
            </div>
          ) : (
            <div className="space-y-3">
              {consolidatedTemplates
                .filter(t => consolidatedTemplateTypeFilter === 'all' || t.template_type === consolidatedTemplateTypeFilter)
                .map(template => (
                <div key={template.id} className="bg-white rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{template.name}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          template.template_type === 'escort_consolidated'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {template.template_type === 'escort_consolidated' ? 'Escort' : 'Headphone'}
                        </span>
                        {template.is_default && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">Default</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Subject: {template.subject}</p>
                      <p className="text-xs text-gray-400 mt-2 line-clamp-2">{template.body}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditConsolidatedTemplate(template)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => deleteConsolidatedTemplate(template.id)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-start">
              <h2 className="text-xl font-semibold">
                {editingTemplate ? 'Edit Template' : 'New Template'}
              </h2>
              <button onClick={() => setShowTemplateModal(false)} className="text-gray-500 hover:text-gray-700">
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
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="e.g., Service Assignment"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Template Type</label>
                      <select
                        value={templateType}
                        onChange={(e) => setTemplateType(e.target.value as TemplateType)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                      >
                        <option value="guide">Guide</option>
                        <option value="escort">Escort</option>
                        <option value="headphone">Headphone</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Subject Line</label>
                    <Input
                      value={templateSubject}
                      onChange={(e) => setTemplateSubject(e.target.value)}
                      placeholder="e.g., Your Assignment: {{tour_title}} - {{date}}"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Email Body</label>
                    <textarea
                      ref={templateBodyRef}
                      value={templateBody}
                      onChange={(e) => setTemplateBody(e.target.value)}
                      rows={12}
                      className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                      placeholder="Write your email template here..."
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={templateIsDefault}
                        onChange={(e) => setTemplateIsDefault(e.target.checked)}
                        className="rounded"
                      />
                      Set as default template
                    </label>
                  </div>
                </div>

                {/* Variables Panel */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-sm mb-3">Available Variables</h3>
                  <p className="text-xs text-gray-500 mb-4">Click to insert at cursor position</p>
                  <div className="space-y-2">
                    {TEMPLATE_VARIABLES.map(variable => (
                      <button
                        key={variable.key}
                        onClick={() => insertVariable(variable.key)}
                        className="w-full text-left px-3 py-2 bg-white border rounded hover:bg-brand-orange-light hover:border-orange-300 transition-colors"
                      >
                        <div className="font-mono text-xs text-brand-orange">{variable.key}</div>
                        <div className="text-xs text-gray-500">{variable.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 mt-6 border-t">
                <Button variant="outline" onClick={() => setShowTemplateModal(false)}>
                  Cancel
                </Button>
                <Button onClick={saveTemplate}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Template
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meeting Point Modal */}
      {showMeetingPointModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-start">
              <h2 className="text-xl font-semibold">
                {editingMeetingPoint ? 'Edit Meeting Point' : 'New Meeting Point'}
              </h2>
              <button onClick={() => setShowMeetingPointModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name *</label>
                <Input
                  value={mpName}
                  onChange={(e) => setMpName(e.target.value)}
                  placeholder="e.g., Colosseum Main Entrance"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <Input
                  value={mpDescription}
                  onChange={(e) => setMpDescription(e.target.value)}
                  placeholder="Brief description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Address</label>
                <Input
                  value={mpAddress}
                  onChange={(e) => setMpAddress(e.target.value)}
                  placeholder="Full address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Google Maps URL</label>
                <Input
                  value={mpGoogleMapsUrl}
                  onChange={(e) => setMpGoogleMapsUrl(e.target.value)}
                  placeholder="https://maps.google.com/..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Instructions</label>
                <textarea
                  value={mpInstructions}
                  onChange={(e) => setMpInstructions(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  placeholder="How to find the meeting point, what to look for..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowMeetingPointModal(false)}>
                  Cancel
                </Button>
                <Button onClick={saveMeetingPoint}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Meeting Point
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Consolidated Template Modal */}
      {showConsolidatedTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-start">
              <h2 className="text-xl font-semibold">
                {editingConsolidatedTemplate ? 'Edit Consolidated Template' : 'New Consolidated Template'}
              </h2>
              <button onClick={() => setShowConsolidatedTemplateModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Form */}
                <div className="lg:col-span-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Template Name</label>
                      <Input
                        value={consolidatedTemplateName}
                        onChange={(e) => setConsolidatedTemplateName(e.target.value)}
                        placeholder="e.g., Daily Escort Summary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Template Type</label>
                      <select
                        value={consolidatedTemplateType}
                        onChange={(e) => setConsolidatedTemplateType(e.target.value as ConsolidatedTemplateType)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                      >
                        <option value="escort_consolidated">Escort Consolidated</option>
                        <option value="headphone_consolidated">Headphone Consolidated</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Subject Line</label>
                    <Input
                      value={consolidatedTemplateSubject}
                      onChange={(e) => setConsolidatedTemplateSubject(e.target.value)}
                      placeholder="e.g., Your services for {{date}}"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Email Body
                      <span className="text-gray-400 font-normal ml-2">
                        (Use {'{{services_list}}'} where service items should appear)
                      </span>
                    </label>
                    <textarea
                      ref={consolidatedBodyRef}
                      value={consolidatedTemplateBody}
                      onChange={(e) => setConsolidatedTemplateBody(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                      placeholder="Write your email template here... Use {{services_list}} to insert the list of services."
                    />
                  </div>

                  <div className="border-t pt-4">
                    <label className="block text-sm font-medium mb-2">
                      Service Item Template
                      <span className="text-gray-400 font-normal ml-2">
                        (Template for each service in the list)
                      </span>
                    </label>
                    <textarea
                      ref={consolidatedServiceRef}
                      value={consolidatedServiceItemTemplate}
                      onChange={(e) => setConsolidatedServiceItemTemplate(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                      placeholder="Template for each service item..."
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={consolidatedTemplateIsDefault}
                        onChange={(e) => setConsolidatedTemplateIsDefault(e.target.checked)}
                        className="rounded"
                      />
                      Set as default template for this type
                    </label>
                  </div>
                </div>

                {/* Variables Panel */}
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-sm mb-3">Email Body Variables</h3>
                    <p className="text-xs text-gray-500 mb-3">Click to insert</p>
                    <div className="space-y-2">
                      {CONSOLIDATED_TEMPLATE_VARIABLES.map(variable => (
                        <button
                          key={variable.key}
                          onClick={() => insertConsolidatedVariable(variable.key, 'body')}
                          className="w-full text-left px-2 py-1.5 bg-white border rounded hover:bg-brand-orange-light hover:border-orange-300 transition-colors"
                        >
                          <div className="font-mono text-xs text-brand-orange">{variable.key}</div>
                          <div className="text-xs text-gray-500">{variable.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4">
                    <h3 className="font-medium text-sm mb-3 text-blue-800">Service Item Variables</h3>
                    <p className="text-xs text-blue-600 mb-3">For service item template</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {CONSOLIDATED_SERVICE_VARIABLES.map(variable => (
                        <button
                          key={variable.key}
                          onClick={() => insertConsolidatedVariable(variable.key, 'service')}
                          className="w-full text-left px-2 py-1.5 bg-white border rounded hover:bg-blue-100 hover:border-blue-300 transition-colors"
                        >
                          <div className="font-mono text-xs text-blue-700">{variable.key}</div>
                          <div className="text-xs text-gray-500">{variable.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 mt-6 border-t">
                <Button variant="outline" onClick={() => setShowConsolidatedTemplateModal(false)}>
                  Cancel
                </Button>
                <Button onClick={saveConsolidatedTemplate}>
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
