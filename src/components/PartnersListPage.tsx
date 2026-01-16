'use client'

import { useState, useEffect } from 'react'
import { partnersApi, Partner } from '@/lib/api-client'
import { Plus, Edit, Trash2, Search, X, Handshake, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

export default function PartnersListPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showActiveOnly, setShowActiveOnly] = useState(true)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone_number: '',
    notes: '',
    active: true,
    available_times: ['09:00', '10:00', '11:00', '12:00'] as string[]
  })
  const [newTime, setNewTime] = useState('')

  useEffect(() => {
    fetchPartners()
  }, [])

  const fetchPartners = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await partnersApi.list()
      if (result.error) throw new Error(result.error)
      setPartners(result.data || [])
    } catch (err) {
      console.error('Error fetching partners:', err)
      setError('Failed to load partners')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (partner?: Partner) => {
    if (partner) {
      setEditingPartner(partner)
      setFormData({
        name: partner.name,
        email: partner.email,
        phone_number: partner.phone_number || '',
        notes: partner.notes || '',
        active: partner.active,
        available_times: partner.available_times || ['09:00', '10:00', '11:00', '12:00']
      })
    } else {
      setEditingPartner(null)
      setFormData({
        name: '',
        email: '',
        phone_number: '',
        notes: '',
        active: true,
        available_times: ['09:00', '10:00', '11:00', '12:00']
      })
    }
    setNewTime('')
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingPartner(null)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      if (editingPartner) {
        // Update existing partner via API
        const result = await partnersApi.update({
          partner_id: editingPartner.partner_id,
          name: formData.name,
          email: formData.email,
          phone_number: formData.phone_number || undefined,
          notes: formData.notes || undefined,
          active: formData.active,
          available_times: formData.available_times
        })

        if (result.error) throw new Error(result.error)
      } else {
        // Create new partner via API
        const result = await partnersApi.create({
          name: formData.name,
          email: formData.email,
          phone_number: formData.phone_number || undefined,
          notes: formData.notes || undefined,
          active: formData.active,
          available_times: formData.available_times
        })

        if (result.error) throw new Error(result.error)
      }

      handleCloseModal()
      fetchPartners()
    } catch (err) {
      console.error('Error saving partner:', err)
      setError(err instanceof Error ? err.message : 'Failed to save partner')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (partnerId: string) => {
    if (!confirm('Are you sure you want to delete this partner?')) return

    try {
      // Delete via API
      const result = await partnersApi.delete(partnerId)
      if (result.error) throw new Error(result.error)
      fetchPartners()
    } catch (err) {
      console.error('Error deleting partner:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete partner')
    }
  }

  const filteredPartners = partners.filter(partner => {
    const matchesSearch = partner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      partner.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesActiveFilter = showActiveOnly ? partner.active : true
    return matchesSearch && matchesActiveFilter
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Handshake className="w-8 h-8 text-teal-600" />
          <h1 className="text-2xl font-bold">Partners</h1>
        </div>
        <Button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Partner
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="mb-4 flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search partners..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={showActiveOnly}
            onCheckedChange={(checked) => setShowActiveOnly(checked as boolean)}
          />
          <span className="text-sm">Active only</span>
        </label>
      </div>

      {/* Error Display */}
      {error && !showModal && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Partners Table */}
      {loading ? (
        <div className="text-center py-8">Loading partners...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPartners.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No partners found
                  </td>
                </tr>
              ) : (
                filteredPartners.map((partner) => (
                  <tr key={partner.partner_id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Handshake className="w-4 h-4 text-teal-500" />
                        <span className="text-sm font-medium text-gray-900">
                          {partner.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{partner.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{partner.phone_number || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500 max-w-xs truncate">{partner.notes || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        partner.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {partner.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenModal(partner)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(partner.partner_id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            {/* Header */}
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold">
                {editingPartner ? 'Edit Partner' : 'Add New Partner'}
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

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1">Name *</Label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g., TU Italia SRL"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1">Email *</Label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="booking@partner.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1">Phone Number</Label>
                  <input
                    type="tel"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                    placeholder="+39 xxx xxx xxxx"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1">Notes</Label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="Additional notes about this partner..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Available Times
                  </Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formData.available_times.map((time) => (
                      <span
                        key={time}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-sm border border-teal-200"
                      >
                        {time}
                        <button
                          type="button"
                          onClick={() => setFormData({
                            ...formData,
                            available_times: formData.available_times.filter(t => t !== time)
                          })}
                          className="text-teal-500 hover:text-teal-700"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (newTime && !formData.available_times.includes(newTime)) {
                          setFormData({
                            ...formData,
                            available_times: [...formData.available_times, newTime].sort()
                          })
                          setNewTime('')
                        }
                      }}
                      disabled={!newTime || formData.available_times.includes(newTime)}
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.active}
                      onCheckedChange={(checked) => setFormData({...formData, active: checked as boolean})}
                    />
                    <span className="text-sm">Active</span>
                  </label>
                </div>
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
                  disabled={saving}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  {saving ? 'Saving...' : (editingPartner ? 'Update Partner' : 'Create Partner')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
