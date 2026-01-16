'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ticketCategoriesApi, partnersApi, Partner } from '@/lib/api-client'
import { Plus, Edit, Trash2, Search, X, Tag, UserCheck, UserX, Hash, Landmark, Train, Handshake } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface TicketCategory {
  id: string
  name: string
  description: string | null
  product_names: string[]
  guide_requires_ticket: boolean
  skip_name_check: boolean
  extraction_mode: 'per_ticket' | 'booking_level' | 'per_person_type'
  ticket_class: 'entrance' | 'transport' | 'other'
  default_source: 'b2c' | 'b2b' | 'auto' | null
  b2b_indicator_text: string | null
  b2b_price_adjustment: number | null
  partner_id: string | null
  created_at: string
  updated_at: string
}

const getTicketClassIcon = (ticketClass: string) => {
  switch (ticketClass) {
    case 'transport':
      return { Icon: Train, bgColor: 'bg-blue-100', iconColor: 'text-blue-600' }
    case 'other':
      return { Icon: Tag, bgColor: 'bg-gray-100', iconColor: 'text-gray-600' }
    case 'entrance':
    default:
      return { Icon: Landmark, bgColor: 'bg-orange-100', iconColor: 'text-orange-600' }
  }
}

export default function TicketCategoriesPage() {
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<TicketCategory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    product_names: [] as string[],
    guide_requires_ticket: true,
    skip_name_check: false,
    extraction_mode: 'per_ticket' as 'per_ticket' | 'booking_level' | 'per_person_type',
    ticket_class: 'entrance' as 'entrance' | 'transport' | 'other',
    default_source: 'auto' as 'b2c' | 'b2b' | 'auto',
    b2b_indicator_text: '',
    b2b_price_adjustment: 0,
    partner_id: ''
  })
  const [newProductName, setNewProductName] = useState('')

  useEffect(() => {
    fetchCategories()
    fetchPartners()
  }, [])

  const fetchPartners = async () => {
    try {
      const result = await partnersApi.list()
      if (result.data) {
        setPartners(result.data.filter(p => p.active))
      }
    } catch (err) {
      console.error('Error fetching partners:', err)
    }
  }

  const fetchCategories = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('ticket_categories')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      setCategories(data || [])
    } catch (err) {
      console.error('Error fetching categories:', err)
      setError('Failed to load ticket categories')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (category?: TicketCategory) => {
    if (category) {
      setEditingCategory(category)
      setFormData({
        name: category.name,
        description: category.description || '',
        product_names: category.product_names || [],
        guide_requires_ticket: category.guide_requires_ticket ?? true,
        skip_name_check: category.skip_name_check ?? false,
        extraction_mode: category.extraction_mode || 'per_ticket',
        ticket_class: category.ticket_class || 'entrance',
        default_source: category.default_source || 'auto',
        b2b_indicator_text: category.b2b_indicator_text || '',
        b2b_price_adjustment: category.b2b_price_adjustment || 0,
        partner_id: category.partner_id || ''
      })
    } else {
      setEditingCategory(null)
      setFormData({
        name: '',
        description: '',
        product_names: [],
        guide_requires_ticket: true,
        skip_name_check: false,
        extraction_mode: 'per_ticket',
        ticket_class: 'entrance',
        default_source: 'auto',
        b2b_indicator_text: '',
        b2b_price_adjustment: 0,
        partner_id: ''
      })
    }
    setNewProductName('')
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingCategory(null)
    setError(null)
  }

  const handleAddProductName = () => {
    if (newProductName.trim() && !formData.product_names.includes(newProductName.trim())) {
      setFormData({
        ...formData,
        product_names: [...formData.product_names, newProductName.trim()]
      })
      setNewProductName('')
    }
  }

  const handleRemoveProductName = (productName: string) => {
    setFormData({
      ...formData,
      product_names: formData.product_names.filter(p => p !== productName)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      if (editingCategory) {
        // Update via API
        const result = await ticketCategoriesApi.update({
          id: editingCategory.id,
          name: formData.name,
          description: formData.description || undefined,
          product_names: formData.product_names,
          guide_requires_ticket: formData.guide_requires_ticket,
          skip_name_check: formData.skip_name_check,
          extraction_mode: formData.extraction_mode,
          ticket_class: formData.ticket_class,
          default_source: formData.default_source,
          b2b_indicator_text: formData.b2b_indicator_text || undefined,
          b2b_price_adjustment: formData.b2b_price_adjustment || undefined,
          partner_id: formData.partner_id || undefined
        })

        if (result.error) throw new Error(result.error)
      } else {
        // Create via API
        const result = await ticketCategoriesApi.create({
          name: formData.name,
          description: formData.description || undefined,
          product_names: formData.product_names,
          guide_requires_ticket: formData.guide_requires_ticket,
          skip_name_check: formData.skip_name_check,
          extraction_mode: formData.extraction_mode,
          ticket_class: formData.ticket_class,
          default_source: formData.default_source,
          b2b_indicator_text: formData.b2b_indicator_text || undefined,
          b2b_price_adjustment: formData.b2b_price_adjustment || undefined,
          partner_id: formData.partner_id || undefined
        })

        if (result.error) throw new Error(result.error)
      }

      handleCloseModal()
      fetchCategories()
    } catch (err) {
      console.error('Error saving category:', err)
      setError(err instanceof Error ? err.message : 'Failed to save category')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category? This may affect linked vouchers.')) return

    try {
      // Delete via API
      const result = await ticketCategoriesApi.delete(categoryId)
      if (result.error) throw new Error(result.error)
      fetchCategories()
    } catch (err) {
      console.error('Error deleting category:', err)
      setError('Failed to delete category')
    }
  }

  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (category.description && category.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (category.product_names && category.product_names.some(p => p.toLowerCase().includes(searchTerm.toLowerCase())))
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ticket Categories</h1>
          <p className="text-gray-500 text-sm mt-1">Manage ticket categories like Colosseo 24H, Musei Vaticani, etc.</p>
        </div>
        <Button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Category
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
            placeholder="Search categories or product names..."
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

      {/* Categories Grid */}
      {loading ? (
        <div className="text-center py-8">Loading categories...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.length === 0 ? (
            <div className="col-span-full text-center py-8 text-gray-500">
              No categories found. Create your first category to get started.
            </div>
          ) : (
            filteredCategories.map((category) => {
              const { Icon, bgColor, iconColor } = getTicketClassIcon(category.ticket_class)
              return (
              <div
                key={category.id}
                className="bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${iconColor}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{category.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {category.description || 'No description'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenModal(category)}
                      className="text-blue-600 hover:text-blue-800 p-1"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(category.id)}
                      className="text-red-600 hover:text-red-800 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Category settings badges */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {category.guide_requires_ticket ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      <UserCheck className="w-3 h-3" />
                      Guide needs ticket
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      <UserX className="w-3 h-3" />
                      Guide no ticket
                    </span>
                  )}
                  {category.skip_name_check && (
                    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      <Hash className="w-3 h-3" />
                      Quantity only
                    </span>
                  )}
                  {category.partner_id && (
                    <span className="inline-flex items-center gap-1 text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
                      <Handshake className="w-3 h-3" />
                      {partners.find(p => p.partner_id === category.partner_id)?.name || 'Partner'}
                    </span>
                  )}
                </div>

                {/* Product names */}
                {category.product_names && category.product_names.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400 mb-1">Auto-detect products:</p>
                    <div className="flex flex-wrap gap-1">
                      {category.product_names.map((productName, idx) => (
                        <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded truncate max-w-full" title={productName}>
                          {productName.length > 30 ? productName.substring(0, 30) + '...' : productName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              )
            })
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-semibold">
                {editingCategory ? 'Edit Category' : 'Add New Category'}
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

              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Category Name *</Label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g., Colosseo 24H"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Description</Label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Optional description..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Extraction Mode selector */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Extraction Mode *</Label>
                <select
                  value={formData.extraction_mode}
                  onChange={(e) => setFormData({...formData, extraction_mode: e.target.value as 'per_ticket' | 'booking_level' | 'per_person_type'})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="per_ticket">Per Ticket (each ticket in PDF is one record)</option>
                  <option value="booking_level">Booking Level (booking entries with pax count)</option>
                  <option value="per_person_type">Per Person Type (separate adults/children records)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {formData.extraction_mode === 'per_ticket' && 'Standard extraction - each ticket becomes one record'}
                  {formData.extraction_mode === 'booking_level' && 'For vouchers with booking entries and pax counts (no individual names)'}
                  {formData.extraction_mode === 'per_person_type' && 'Parse "X adulti + Y minori" into separate person records with types'}
                </p>
              </div>

              {/* Ticket Class selector */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Ticket Class *</Label>
                <select
                  value={formData.ticket_class}
                  onChange={(e) => setFormData({...formData, ticket_class: e.target.value as 'entrance' | 'transport' | 'other'})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="entrance">Entrance (Colosseum, Vatican, etc.)</option>
                  <option value="transport">Transport (Italo, Trenitalia, etc.)</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Partner selector */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Partner (for voucher requests)</Label>
                <select
                  value={formData.partner_id}
                  onChange={(e) => setFormData({...formData, partner_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">No partner linked</option>
                  {partners.map((partner) => (
                    <option key={partner.partner_id} value={partner.partner_id}>
                      {partner.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Link a partner to enable voucher requests from SuperSantos page
                </p>
              </div>

              {/* Guide requires ticket toggle */}
              <div className="mb-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.guide_requires_ticket}
                    onChange={(e) => setFormData({...formData, guide_requires_ticket: e.target.checked})}
                    className="w-4 h-4 text-orange-600 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium">Guide requires ticket</span>
                    <p className="text-xs text-gray-500">Enable if guides need a named ticket for this venue (e.g., Colosseum)</p>
                  </div>
                </label>
              </div>

              {/* Skip name check toggle */}
              <div className="mb-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.skip_name_check}
                    onChange={(e) => setFormData({...formData, skip_name_check: e.target.checked})}
                    className="w-4 h-4 text-orange-600 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium">Skip name check</span>
                    <p className="text-xs text-gray-500">Enable for generic tickets (e.g., Vatican Museums) - only quantity validation will be performed</p>
                  </div>
                </label>
              </div>

              {/* Product Names */}
              <div className="mb-4">
                <Label className="text-sm font-medium mb-1">Product Names (for auto-detection)</Label>
                <p className="text-xs text-gray-500 mb-2">Add the exact product names from PDF tickets that should auto-select this category</p>

                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddProductName())}
                    placeholder="e.g., COLOSSEO-FORO ROMANO PALATINO 24H - GRUPPI"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <Button type="button" onClick={handleAddProductName} variant="outline" size="sm">
                    Add
                  </Button>
                </div>

                {formData.product_names.length > 0 && (
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {formData.product_names.map((productName, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md">
                        <span className="text-sm text-gray-700 truncate flex-1" title={productName}>{productName}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveProductName(productName)}
                          className="text-red-500 hover:text-red-700 ml-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Source Settings - only for entrance tickets */}
              {formData.ticket_class === 'entrance' && (
                <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <h3 className="text-sm font-semibold text-purple-800 mb-3">Source Settings</h3>

                  <div className="mb-3">
                    <Label className="text-sm font-medium mb-1 text-purple-700">Default Source</Label>
                    <select
                      value={formData.default_source}
                      onChange={(e) => setFormData({...formData, default_source: e.target.value as 'b2c' | 'b2b' | 'auto'})}
                      className="w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    >
                      <option value="b2c">Always B2C</option>
                      <option value="b2b">Always B2B</option>
                      <option value="auto">Auto-detect from PDF</option>
                    </select>
                  </div>

                  {/* B2B Detection Rules - only when auto-detect is selected */}
                  {formData.default_source === 'auto' && (
                    <>
                      <p className="text-xs text-purple-600 mb-3">Configure automatic B2B detection based on PDF content</p>

                      <div className="mb-3">
                        <Label className="text-sm font-medium mb-1 text-purple-700">B2B Indicator Text</Label>
                        <input
                          type="text"
                          value={formData.b2b_indicator_text}
                          onChange={(e) => setFormData({...formData, b2b_indicator_text: e.target.value})}
                          placeholder="e.g., ACCORDI SPECIALI"
                          className="w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                        />
                        <p className="text-xs text-purple-500 mt-1">If this text is found in the PDF, the voucher will be marked as B2B</p>
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-1 text-purple-700">B2B Price Adjustment (€)</Label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.b2b_price_adjustment}
                          onChange={(e) => setFormData({...formData, b2b_price_adjustment: parseFloat(e.target.value) || 0})}
                          placeholder="0.00"
                          className="w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                        />
                        <p className="text-xs text-purple-500 mt-1">Extra cost per ticket when B2B is detected (added to PDF price)</p>
                      </div>
                    </>
                  )}

                  {formData.default_source === 'b2b' && (
                    <div>
                      <Label className="text-sm font-medium mb-1 text-purple-700">B2B Price Adjustment (€)</Label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.b2b_price_adjustment}
                        onChange={(e) => setFormData({...formData, b2b_price_adjustment: parseFloat(e.target.value) || 0})}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                      <p className="text-xs text-purple-500 mt-1">Extra cost per ticket (added to PDF price)</p>
                    </div>
                  )}
                </div>
              )}

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
                  disabled={saving}
                >
                  {saving ? 'Saving...' : (editingCategory ? 'Update Category' : 'Create Category')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
