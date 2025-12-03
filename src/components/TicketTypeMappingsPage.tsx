'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { mappingsApi } from '@/lib/api-client'
import { Plus, Edit, Trash2, Search, X, ChevronDown, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface TicketCategory {
  id: string
  name: string
}

interface Activity {
  activity_id: string
  title: string
}

interface TicketTypeMapping {
  id: string
  category_id: string
  activity_id: string
  ticket_type: string
  booked_titles: string[]
  created_at: string
  ticket_categories?: TicketCategory
}

export default function TicketTypeMappingsPage() {
  const [mappings, setMappings] = useState<TicketTypeMapping[]>([])
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [bookedTitles, setBookedTitles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingMapping, setEditingMapping] = useState<TicketTypeMapping | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    category_id: '',
    activity_id: '',
    ticket_type: '',
    booked_titles: [] as string[]
  })

  // Common ticket types from Colosseum PDFs
  const COMMON_TICKET_TYPES = [
    'Intero',
    'Ridotto',
    'Gratuito - Under 18',
    'Guide turistiche con tesserino Gruppi e Scuole'
  ]

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [mappingsRes, categoriesRes, activitiesRes, titlesRes] = await Promise.all([
        supabase
          .from('ticket_type_mappings')
          .select(`
            *,
            ticket_categories (id, name)
          `)
          .order('ticket_type', { ascending: true }),
        supabase
          .from('ticket_categories')
          .select('id, name')
          .order('name', { ascending: true }),
        supabase
          .from('activities')
          .select('activity_id, title')
          .order('title', { ascending: true }),
        // Get distinct booked_titles from pricing_category_bookings
        supabase
          .from('pricing_category_bookings')
          .select('booked_title')
      ])

      if (mappingsRes.error) throw mappingsRes.error
      if (categoriesRes.error) throw categoriesRes.error
      if (activitiesRes.error) throw activitiesRes.error

      setMappings(mappingsRes.data || [])
      setCategories(categoriesRes.data || [])
      setActivities(activitiesRes.data || [])

      // Extract unique booked_titles
      if (titlesRes.data) {
        const uniqueTitles = [...new Set(titlesRes.data.map(r => r.booked_title).filter(Boolean))]
        setBookedTitles(uniqueTitles.sort())
      }
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (mapping?: TicketTypeMapping) => {
    if (mapping) {
      setEditingMapping(mapping)
      setFormData({
        category_id: mapping.category_id,
        activity_id: mapping.activity_id,
        ticket_type: mapping.ticket_type,
        booked_titles: mapping.booked_titles || []
      })
    } else {
      setEditingMapping(null)
      setFormData({
        category_id: categories[0]?.id || '',
        activity_id: '',
        ticket_type: '',
        booked_titles: []
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingMapping(null)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (formData.booked_titles.length === 0) {
      setError('Please select at least one booked title')
      return
    }

    setSaving(true)

    try {
      if (editingMapping) {
        // Update via API
        const result = await mappingsApi.ticketType.update({
          id: editingMapping.id,
          category_id: formData.category_id,
          activity_id: formData.activity_id,
          ticket_type: formData.ticket_type,
          booked_titles: formData.booked_titles
        })

        if (result.error) throw new Error(result.error)
      } else {
        // Create via API
        const result = await mappingsApi.ticketType.create({
          category_id: formData.category_id,
          activity_id: formData.activity_id,
          ticket_type: formData.ticket_type,
          booked_titles: formData.booked_titles
        })

        if (result.error) throw new Error(result.error)
      }

      handleCloseModal()
      fetchData()
    } catch (err) {
      console.error('Error saving mapping:', err)
      setError(err instanceof Error ? err.message : 'Failed to save mapping')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (mappingId: string) => {
    if (!confirm('Are you sure you want to delete this mapping?')) return

    try {
      // Delete via API
      const result = await mappingsApi.ticketType.delete(mappingId)
      if (result.error) throw new Error(result.error)
      fetchData()
    } catch (err) {
      console.error('Error deleting mapping:', err)
      setError('Failed to delete mapping')
    }
  }

  const toggleBookedTitle = (title: string) => {
    setFormData(prev => ({
      ...prev,
      booked_titles: prev.booked_titles.includes(title)
        ? prev.booked_titles.filter(t => t !== title)
        : [...prev.booked_titles, title]
    }))
  }

  const getActivityName = (activityId: string) => {
    return activities.find(a => a.activity_id === activityId)?.title || activityId
  }

  // Group mappings by category and activity
  const groupedMappings = mappings.reduce((acc, mapping) => {
    const key = `${mapping.category_id}-${mapping.activity_id}`
    if (!acc[key]) {
      acc[key] = {
        category: mapping.ticket_categories,
        activity_id: mapping.activity_id,
        mappings: []
      }
    }
    acc[key].mappings.push(mapping)
    return acc
  }, {} as Record<string, { category?: TicketCategory; activity_id: string; mappings: TicketTypeMapping[] }>)

  const filteredGroups = Object.entries(groupedMappings).filter(([, group]) => {
    const activityName = getActivityName(group.activity_id)
    return activityName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           group.category?.name.toLowerCase().includes(searchTerm.toLowerCase())
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ticket Type Mappings</h1>
          <p className="text-gray-500 text-sm mt-1">
            Map ticket types (Intero, Ridotto, etc.) to booking participant categories
          </p>
        </div>
        <Button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Mapping
        </Button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by activity or category..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-blue-700">
          <strong>How it works:</strong> When validating tickets, the system checks if the ticket type
          (e.g., &quot;Intero&quot;) matches the participant&apos;s booked_title (e.g., &quot;Adulto&quot;, &quot;Adult&quot;).
          Create mappings for each activity to enable automatic validation.
        </p>
      </div>

      {/* Error Display */}
      {error && !showModal && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Mappings List */}
      {loading ? (
        <div className="text-center py-8">Loading mappings...</div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-white rounded-lg shadow">
              No mappings found. Create mappings to enable ticket validation.
            </div>
          ) : (
            filteredGroups.map(([key, group]) => (
              <div
                key={key}
                className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden"
              >
                <div className="p-4 bg-gray-50 border-b">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                      {group.category?.name || 'No category'}
                    </span>
                    <span className="text-gray-400">|</span>
                    <span className="font-medium text-gray-900">
                      {getActivityName(group.activity_id)}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="space-y-3">
                    {group.mappings.map((mapping) => (
                      <div
                        key={mapping.id}
                        className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className="font-medium text-gray-900 min-w-[150px]">
                            {mapping.ticket_type}
                          </div>
                          <ArrowRight className="w-4 h-4 text-gray-400" />
                          <div className="flex flex-wrap gap-1">
                            {mapping.booked_titles.map(title => (
                              <span
                                key={title}
                                className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full"
                              >
                                {title}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenModal(mapping)}
                            className="text-blue-600 hover:text-blue-800 p-1"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(mapping.id)}
                            className="text-red-600 hover:text-red-800 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold">
                {editingMapping ? 'Edit Ticket Type Mapping' : 'Add Ticket Type Mapping'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Category */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Ticket Category *</Label>
                <div className="relative">
                  <select
                    required
                    value={formData.category_id}
                    onChange={(e) => setFormData({...formData, category_id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                  >
                    <option value="">Select a category</option>
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Activity */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Activity *</Label>
                <div className="relative">
                  <select
                    required
                    value={formData.activity_id}
                    onChange={(e) => setFormData({...formData, activity_id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                  >
                    <option value="">Select an activity</option>
                    {activities.map(activity => (
                      <option key={activity.activity_id} value={activity.activity_id}>
                        {activity.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Ticket Type */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Ticket Type (from PDF) *</Label>
                <input
                  type="text"
                  required
                  value={formData.ticket_type}
                  onChange={(e) => setFormData({...formData, ticket_type: e.target.value})}
                  placeholder="e.g., Intero"
                  list="ticket-type-suggestions"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="ticket-type-suggestions">
                  {COMMON_TICKET_TYPES.map(type => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
                <p className="text-xs text-gray-500 mt-1">
                  This should match exactly what appears in the PDF ticket
                </p>
              </div>

              {/* Booked Titles */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-2">
                  Maps to Booked Titles *
                </Label>
                <p className="text-xs text-gray-500 mb-2">
                  Select all participant categories that should match this ticket type
                </p>
                <div className="border border-gray-300 rounded-md max-h-48 overflow-y-auto">
                  {bookedTitles.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500">
                      No booked titles found in the database
                    </div>
                  ) : (
                    bookedTitles.map(title => (
                      <label
                        key={title}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={formData.booked_titles.includes(title)}
                          onChange={() => toggleBookedTitle(title)}
                          className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                        />
                        <span className="text-sm">{title}</span>
                      </label>
                    ))
                  )}
                </div>
                {formData.booked_titles.length > 0 && (
                  <p className="text-xs text-orange-600 mt-1">
                    {formData.booked_titles.length} title{formData.booked_titles.length === 1 ? '' : 's'} selected
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseModal}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving || formData.booked_titles.length === 0}
                >
                  {saving ? 'Saving...' : (editingMapping ? 'Update Mapping' : 'Create Mapping')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
