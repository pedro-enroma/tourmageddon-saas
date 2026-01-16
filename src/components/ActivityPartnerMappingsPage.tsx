'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, Search, X, Handshake } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface Partner {
  partner_id: string
  name: string
  email: string
  active: boolean
}

interface TicketCategory {
  id: string
  name: string
}

interface Activity {
  activity_id: string
  title: string
}

interface ActivityPartnerMapping {
  id: string
  activity_id: string
  partner_id: string
  ticket_category_id: string | null
  notes: string | null
  created_at: string
  partners?: Partner
  ticket_categories?: TicketCategory
}

export default function ActivityPartnerMappingsPage() {
  const [mappings, setMappings] = useState<ActivityPartnerMapping[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    activity_ids: [] as string[],
    partner_id: '',
    ticket_category_id: '',
    notes: ''
  })
  const [activitySearchTerm, setActivitySearchTerm] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [mappingsRes, partnersRes, categoriesRes, activitiesRes] = await Promise.all([
        fetch('/api/activity-partner-mappings').then(r => r.json()),
        supabase
          .from('partners')
          .select('partner_id, name, email, active')
          .eq('active', true)
          .order('name', { ascending: true }),
        supabase
          .from('ticket_categories')
          .select('id, name')
          .order('name', { ascending: true }),
        supabase
          .from('activities')
          .select('activity_id, title')
          .order('title', { ascending: true })
      ])

      if (mappingsRes.error) throw new Error(mappingsRes.error)
      if (partnersRes.error) throw partnersRes.error
      if (categoriesRes.error) throw categoriesRes.error
      if (activitiesRes.error) throw activitiesRes.error

      setMappings(mappingsRes.data || [])
      setPartners(partnersRes.data || [])
      setCategories(categoriesRes.data || [])
      setActivities(activitiesRes.data || [])
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = () => {
    setFormData({
      activity_ids: [],
      partner_id: partners[0]?.partner_id || '',
      ticket_category_id: '',
      notes: ''
    })
    setActivitySearchTerm('')
    setError(null)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (formData.activity_ids.length === 0) {
      setError('Please select at least one activity')
      return
    }

    if (!formData.partner_id) {
      setError('Please select a partner')
      return
    }

    setSaving(true)

    try {
      // Create a mapping for each selected activity
      const errors: string[] = []
      for (const activity_id of formData.activity_ids) {
        const response = await fetch('/api/activity-partner-mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activity_id,
            partner_id: formData.partner_id,
            ticket_category_id: formData.ticket_category_id || null,
            notes: formData.notes || null
          })
        })

        if (!response.ok) {
          const result = await response.json()
          const activityTitle = getActivityTitle(activity_id)
          errors.push(`${activityTitle}: ${result.error}`)
        }
      }

      if (errors.length > 0) {
        setError(`Some mappings failed:\n${errors.join('\n')}`)
      } else {
        handleCloseModal()
      }
      fetchData()
    } catch (err) {
      console.error('Error saving mapping:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to save mapping'
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mapping?')) return

    try {
      const response = await fetch(`/api/activity-partner-mappings?id=${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to delete mapping')
      }

      fetchData()
    } catch (err) {
      console.error('Error deleting mapping:', err)
      alert('Failed to delete mapping')
    }
  }

  // Get activity title by id
  const getActivityTitle = (activityId: string) => {
    return activities.find(a => a.activity_id === activityId)?.title || activityId
  }

  // Filter activities for search
  const filteredActivities = activities.filter(a =>
    a.title.toLowerCase().includes(activitySearchTerm.toLowerCase())
  )

  // Filter mappings for search
  const filteredMappings = mappings.filter(m => {
    const activityTitle = getActivityTitle(m.activity_id)
    const partnerName = m.partners?.name || ''
    const search = searchTerm.toLowerCase()
    return activityTitle.toLowerCase().includes(search) || partnerName.toLowerCase().includes(search)
  })

  // Group mappings by activity
  const groupedByActivity = filteredMappings.reduce((acc, mapping) => {
    const title = getActivityTitle(mapping.activity_id)
    if (!acc[mapping.activity_id]) {
      acc[mapping.activity_id] = {
        title,
        mappings: []
      }
    }
    acc[mapping.activity_id].mappings.push(mapping)
    return acc
  }, {} as Record<string, { title: string; mappings: ActivityPartnerMapping[] }>)

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity-Partner Mappings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Link activities to partners for voucher requests
          </p>
        </div>
        <Button onClick={handleOpenModal} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Mapping
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by activity or partner..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Mappings List */}
      {Object.keys(groupedByActivity).length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Handshake className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No mappings found</p>
          <p className="text-sm text-gray-400 mt-1">Add a mapping to link an activity to a partner</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByActivity).map(([activityId, { title, mappings: actMappings }]) => (
            <div key={activityId} className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3">{title}</h3>
              <div className="space-y-2">
                {actMappings.map(mapping => (
                  <div
                    key={mapping.id}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded"
                  >
                    <div className="flex items-center gap-3">
                      <Handshake className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-green-700">{mapping.partners?.name}</span>
                      {mapping.ticket_categories && (
                        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                          {mapping.ticket_categories.name}
                        </span>
                      )}
                      {mapping.notes && (
                        <span className="text-xs text-gray-400 italic">{mapping.notes}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(mapping.id)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Delete mapping"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Add Activity-Partner Mapping</h2>
              <button onClick={handleCloseModal} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Activity Selection - Multi-select */}
              <div>
                <Label>Activities * ({formData.activity_ids.length} selected)</Label>
                <div className="mt-1">
                  <input
                    type="text"
                    placeholder="Search activities..."
                    value={activitySearchTerm}
                    onChange={(e) => setActivitySearchTerm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                  />
                  <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-md">
                    {filteredActivities.map(activity => {
                      const isSelected = formData.activity_ids.includes(activity.activity_id)
                      const isAlreadyMapped = mappings.some(m => m.activity_id === activity.activity_id)
                      return (
                        <label
                          key={activity.activity_id}
                          className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer ${
                            isSelected ? 'bg-blue-50' : ''
                          } ${isAlreadyMapped ? 'opacity-50' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  activity_ids: [...formData.activity_ids, activity.activity_id]
                                })
                              } else {
                                setFormData({
                                  ...formData,
                                  activity_ids: formData.activity_ids.filter(id => id !== activity.activity_id)
                                })
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className={isSelected ? 'text-blue-700 font-medium' : ''}>
                            {activity.title}
                          </span>
                          {isAlreadyMapped && (
                            <span className="text-xs text-gray-400 ml-auto">(already mapped)</span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                  {formData.activity_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {formData.activity_ids.map(id => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                        >
                          {getActivityTitle(id)}
                          <button
                            type="button"
                            onClick={() => setFormData({
                              ...formData,
                              activity_ids: formData.activity_ids.filter(aid => aid !== id)
                            })}
                            className="hover:text-blue-900"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Partner Selection */}
              <div>
                <Label>Partner *</Label>
                <select
                  value={formData.partner_id}
                  onChange={(e) => setFormData({ ...formData, partner_id: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select a partner...</option>
                  {partners.map(partner => (
                    <option key={partner.partner_id} value={partner.partner_id}>
                      {partner.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional: Ticket Category */}
              <div>
                <Label>Ticket Category (optional)</Label>
                <select
                  value={formData.ticket_category_id}
                  onChange={(e) => setFormData({ ...formData, ticket_category_id: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">None</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <Label>Notes (optional)</Label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Any additional notes..."
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Mapping'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
