'use client'

import { useState, useEffect } from 'react'
import { printingApi, Printing } from '@/lib/api-client'
import { Plus, Edit, Trash2, Search, X, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

export default function PrintingListPage() {
  const [printing, setPrinting] = useState<Printing[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingPrinting, setEditingPrinting] = useState<Printing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone_number: '',
    active: true
  })

  useEffect(() => {
    fetchPrinting()
  }, [])

  const fetchPrinting = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await printingApi.list()
      if (result.error) throw new Error(result.error)
      setPrinting(result.data || [])
    } catch (err) {
      console.error('Error fetching printing:', err)
      setError('Failed to load printing contacts')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (printingContact?: Printing) => {
    if (printingContact) {
      setEditingPrinting(printingContact)
      setFormData({
        name: printingContact.name,
        email: printingContact.email || '',
        phone_number: printingContact.phone_number || '',
        active: printingContact.active
      })
    } else {
      setEditingPrinting(null)
      setFormData({
        name: '',
        email: '',
        phone_number: '',
        active: true
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingPrinting(null)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      if (editingPrinting) {
        // Update existing printing contact via API
        const result = await printingApi.update({
          printing_id: editingPrinting.printing_id,
          name: formData.name,
          email: formData.email || undefined,
          phone_number: formData.phone_number || undefined,
          active: formData.active
        })

        if (result.error) throw new Error(result.error)
      } else {
        // Create new printing contact via API
        const result = await printingApi.create({
          name: formData.name,
          email: formData.email || undefined,
          phone_number: formData.phone_number || undefined,
          active: formData.active
        })

        if (result.error) throw new Error(result.error)
      }

      handleCloseModal()
      fetchPrinting()
    } catch (err) {
      console.error('Error saving printing:', err)
      setError(err instanceof Error ? err.message : 'Failed to save printing contact')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (printingId: string) => {
    if (!confirm('Are you sure you want to delete this printing contact?')) return

    try {
      // Delete via API
      const result = await printingApi.delete(printingId)
      if (result.error) throw new Error(result.error)
      fetchPrinting()
    } catch (err) {
      console.error('Error deleting printing:', err)
      setError('Failed to delete printing contact')
    }
  }

  const filteredPrinting = printing.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Printer className="w-8 h-8 text-cyan-600" />
          <h1 className="text-2xl font-bold">Printing</h1>
        </div>
        <Button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Printing
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
            placeholder="Search printing contacts..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      {/* Error Display */}
      {error && !showModal && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Printing Table */}
      {loading ? (
        <div className="text-center py-8">Loading printing contacts...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPrinting.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No printing contacts found
                  </td>
                </tr>
              ) : (
                filteredPrinting.map((p) => (
                  <tr key={p.printing_id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Printer className="w-4 h-4 text-cyan-500" />
                        <span className="text-sm font-medium text-gray-900">
                          {p.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{p.email || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{p.phone_number || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        p.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {p.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenModal(p)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.printing_id)}
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
                {editingPrinting ? 'Edit Printing Contact' : 'Add New Printing Contact'}
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
                    placeholder="e.g., Print Shop Naples"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1">Email</Label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="contact@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1">Phone Number</Label>
                  <input
                    type="tel"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                    placeholder="+39 xxx xxx xxxx"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
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
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  {saving ? 'Saving...' : (editingPrinting ? 'Update Printing' : 'Create Printing')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
