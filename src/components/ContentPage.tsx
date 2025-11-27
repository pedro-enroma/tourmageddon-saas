'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  FileText, MapPin, Plus, Pencil, Trash2, X, Save,
  ChevronRight, ExternalLink, Search
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Available template variables
const TEMPLATE_VARIABLES = [
  { key: '{{name}}', label: 'Recipient Name', description: 'Guide or escort name (personalized per recipient)' },
  { key: '{{tour_title}}', label: 'Tour Title', description: 'Activity/tour name' },
  { key: '{{date}}', label: 'Date', description: 'Service date (e.g., Wednesday, November 26, 2025)' },
  { key: '{{time}}', label: 'Time', description: 'Service start time (e.g., 10:00)' },
  { key: '{{pax_count}}', label: 'Pax Count', description: 'Number of participants' },
]

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  is_default: boolean
  created_at: string
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

type Tab = 'templates' | 'meeting-points' | 'assignments'

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
  const templateBodyRef = useRef<HTMLTextAreaElement>(null)

  // Meeting point form state
  const [mpName, setMpName] = useState('')
  const [mpDescription, setMpDescription] = useState('')
  const [mpAddress, setMpAddress] = useState('')
  const [mpGoogleMapsUrl, setMpGoogleMapsUrl] = useState('')
  const [mpInstructions, setMpInstructions] = useState('')

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
        fetchActivityMeetingPoints()
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
    setShowTemplateModal(true)
  }

  const openEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template)
    setTemplateName(template.name)
    setTemplateSubject(template.subject)
    setTemplateBody(template.body)
    setTemplateIsDefault(template.is_default)
    setShowTemplateModal(true)
  }

  const saveTemplate = async () => {
    if (!templateName.trim() || !templateSubject.trim() || !templateBody.trim()) {
      setError('Please fill in all template fields')
      return
    }

    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('email_templates')
          .update({
            name: templateName,
            subject: templateSubject,
            body: templateBody,
            is_default: templateIsDefault,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTemplate.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('email_templates')
          .insert({
            name: templateName,
            subject: templateSubject,
            body: templateBody,
            is_default: templateIsDefault
          })

        if (error) throw error
      }

      // If this is set as default, unset other defaults
      if (templateIsDefault) {
        await supabase
          .from('email_templates')
          .update({ is_default: false })
          .neq('id', editingTemplate?.id || '')
      }

      setShowTemplateModal(false)
      await fetchTemplates()
    } catch (err) {
      console.error('Error saving template:', err)
      setError('Failed to save template')
    }
  }

  const deleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return

    try {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id)

      if (error) throw error
      await fetchTemplates()
    } catch (err) {
      console.error('Error deleting template:', err)
      setError('Failed to delete template')
    }
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
        const { error } = await supabase
          .from('meeting_points')
          .update({
            name: mpName,
            description: mpDescription || null,
            address: mpAddress || null,
            google_maps_url: mpGoogleMapsUrl || null,
            instructions: mpInstructions || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingMeetingPoint.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('meeting_points')
          .insert({
            name: mpName,
            description: mpDescription || null,
            address: mpAddress || null,
            google_maps_url: mpGoogleMapsUrl || null,
            instructions: mpInstructions || null
          })

        if (error) throw error
      }

      setShowMeetingPointModal(false)
      await fetchMeetingPoints()
    } catch (err) {
      console.error('Error saving meeting point:', err)
      setError('Failed to save meeting point')
    }
  }

  const deleteMeetingPoint = async (id: string) => {
    if (!confirm('Delete this meeting point? It will be removed from all assigned activities.')) return

    try {
      const { error } = await supabase
        .from('meeting_points')
        .delete()
        .eq('id', id)

      if (error) throw error
      await fetchMeetingPoints()
      await fetchActivityMeetingPoints()
    } catch (err) {
      console.error('Error deleting meeting point:', err)
      setError('Failed to delete meeting point')
    }
  }

  // Activity Meeting Point assignments
  const toggleActivityMeetingPoint = async (activityId: string, meetingPointId: string) => {
    const existing = activityMeetingPoints.find(
      amp => amp.activity_id === activityId && amp.meeting_point_id === meetingPointId
    )

    try {
      if (existing) {
        // Remove assignment
        const { error } = await supabase
          .from('activity_meeting_points')
          .delete()
          .eq('id', existing.id)

        if (error) throw error
      } else {
        // Add assignment
        const { error } = await supabase
          .from('activity_meeting_points')
          .insert({
            activity_id: activityId,
            meeting_point_id: meetingPointId,
            is_default: false
          })

        if (error) throw error
      }

      await fetchActivityMeetingPoints()
    } catch (err) {
      console.error('Error toggling assignment:', err)
      setError('Failed to update assignment')
    }
  }

  const setDefaultMeetingPoint = async (activityId: string, meetingPointId: string) => {
    try {
      // First unset all defaults for this activity
      await supabase
        .from('activity_meeting_points')
        .update({ is_default: false })
        .eq('activity_id', activityId)

      // Then set the new default
      await supabase
        .from('activity_meeting_points')
        .update({ is_default: true })
        .eq('activity_id', activityId)
        .eq('meeting_point_id', meetingPointId)

      await fetchActivityMeetingPoints()
    } catch (err) {
      console.error('Error setting default:', err)
      setError('Failed to set default meeting point')
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
            Assignments
          </div>
        </button>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">Create email templates with dynamic variables</p>
            <Button onClick={openNewTemplate}>
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </div>

          {templates.length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
              No templates yet. Create your first email template.
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(template => (
                <div key={template.id} className="bg-white rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{template.name}</h3>
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
                  <div>
                    <label className="block text-sm font-medium mb-2">Template Name</label>
                    <Input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="e.g., Service Assignment"
                    />
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
    </div>
  )
}
