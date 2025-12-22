'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, Search, X, Link2, ChevronDown } from 'lucide-react'
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

interface ProductActivityMapping {
  id: string
  product_name: string
  category_id: string
  activity_id: string
  created_at: string
  ticket_categories?: TicketCategory
  activities?: Activity
}

export default function ProductActivityMappingsPage() {
  const [mappings, setMappings] = useState<ProductActivityMapping[]>([])
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    product_name: '',
    category_id: '',
    activity_ids: [] as string[]
  })

  // Common product names from Colosseum tickets
  const COMMON_PRODUCTS = [
    'COLOSSEO-FORO ROMANO PALATINO 24H - GRUPPI',
    'COLOSSEO FULL EXPERIENCE - GRUPPI',
    'COLOSSEO FULL EXPERIENCE SOTTERRANEI - GRUPPI',
    'MUSEI VATICANI E CAPPELLA SISTINA - GRUPPI'
  ]

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch all data in parallel
      const [mappingsRes, categoriesRes, activitiesRes] = await Promise.all([
        supabase
          .from('product_activity_mappings')
          .select(`
            *,
            ticket_categories (id, name)
          `)
          .order('product_name', { ascending: true }),
        supabase
          .from('ticket_categories')
          .select('id, name')
          .order('name', { ascending: true }),
        supabase
          .from('activities')
          .select('activity_id, title')
          .order('title', { ascending: true })
      ])

      if (mappingsRes.error) throw mappingsRes.error
      if (categoriesRes.error) throw categoriesRes.error
      if (activitiesRes.error) throw activitiesRes.error

      setMappings(mappingsRes.data || [])
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
      product_name: '',
      category_id: categories[0]?.id || '',
      activity_ids: []
    })
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

    setSaving(true)

    try {
      // Create mappings for each selected activity
      const insertData = formData.activity_ids.map(activity_id => ({
        product_name: formData.product_name,
        category_id: formData.category_id,
        activity_id
      }))

      const { error } = await supabase
        .from('product_activity_mappings')
        .insert(insertData)

      if (error) throw error

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
      const { error } = await supabase
        .from('product_activity_mappings')
        .delete()
        .eq('id', mappingId)

      if (error) throw error
      fetchData()
    } catch (err) {
      console.error('Error deleting mapping:', err)
      setError('Failed to delete mapping')
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

  // Group mappings by product name
  const groupedMappings = mappings.reduce((acc, mapping) => {
    if (!acc[mapping.product_name]) {
      acc[mapping.product_name] = {
        category: mapping.ticket_categories,
        activities: []
      }
    }
    acc[mapping.product_name].activities.push(mapping)
    return acc
  }, {} as Record<string, { category?: TicketCategory; activities: ProductActivityMapping[] }>)

  const filteredGroups = Object.entries(groupedMappings).filter(([productName]) =>
    productName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Product-Activity Mappings</h1>
          <p className="text-gray-500 text-sm mt-1">
            Map ticket products (from PDFs) to your tour activities
          </p>
        </div>
        <Button
          onClick={handleOpenModal}
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
            placeholder="Search product names..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
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
              No mappings found. Create your first mapping to link ticket products to activities.
            </div>
          ) : (
            filteredGroups.map(([productName, group]) => (
              <div
                key={productName}
                className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden"
              >
                <div className="p-4 bg-gray-50 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{productName}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                          {group.category?.name || 'No category'}
                        </span>
                        <span className="text-sm text-gray-500">
                          {group.activities.length} activit{group.activities.length === 1 ? 'y' : 'ies'} linked
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <div className="space-y-2">
                    {group.activities.map((mapping) => {
                      const activity = activities.find(a => a.activity_id === mapping.activity_id)
                      return (
                        <div
                          key={mapping.id}
                          className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <Link2 className="w-4 h-4 text-gray-400" />
                            <span className="text-sm">{activity?.title || mapping.activity_id}</span>
                          </div>
                          <button
                            onClick={() => handleDelete(mapping.id)}
                            className="text-red-600 hover:text-red-800 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    })}
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
              <h2 className="text-xl font-semibold">Add Product Mapping</h2>
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

              {/* Product Name */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Product Name *</Label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formData.product_name}
                    onChange={(e) => setFormData({...formData, product_name: e.target.value})}
                    placeholder="e.g., COLOSSEO-FORO ROMANO PALATINO 24H - GRUPPI"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    list="product-suggestions"
                  />
                  <datalist id="product-suggestions">
                    {COMMON_PRODUCTS.map(product => (
                      <option key={product} value={product} />
                    ))}
                  </datalist>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  This should match exactly what appears in the PDF ticket
                </p>
              </div>

              {/* Category */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Category *</Label>
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

              {/* Activities */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-2">
                  Activities that can use this product *
                </Label>
                <p className="text-xs text-gray-500 mb-2">
                  Select all tours that can be assigned tickets from this product
                </p>
                <div className="border border-gray-300 rounded-md max-h-60 overflow-y-auto">
                  {activities.map(activity => (
                    <label
                      key={activity.activity_id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={formData.activity_ids.includes(activity.activity_id)}
                        onChange={() => toggleActivity(activity.activity_id)}
                        className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                      />
                      <span className="text-sm">{activity.title}</span>
                    </label>
                  ))}
                </div>
                {formData.activity_ids.length > 0 && (
                  <p className="text-xs text-orange-600 mt-1">
                    {formData.activity_ids.length} activit{formData.activity_ids.length === 1 ? 'y' : 'ies'} selected
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
                  disabled={saving || formData.activity_ids.length === 0}
                >
                  {saving ? 'Saving...' : 'Create Mapping'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
