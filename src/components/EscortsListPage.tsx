'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Edit, Trash2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

const AVAILABLE_LANGUAGES = ['English', 'Spanish', 'Portuguese']

interface Escort {
  escort_id: string
  first_name: string
  last_name: string
  email: string
  phone_number: string | null
  license_number: string | null
  languages: string[]
  active: boolean
  created_at: string
  updated_at: string
}

export default function EscortsListPage() {
  const [escorts, setEscorts] = useState<Escort[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingEscort, setEditingEscort] = useState<Escort | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    license_number: '',
    languages: [] as string[],
    active: true
  })

  useEffect(() => {
    fetchEscorts()
  }, [])

  const fetchEscorts = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('escorts')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setEscorts(data || [])
    } catch (err) {
      console.error('Error fetching escorts:', err)
      setError('Failed to load escorts')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (escort?: Escort) => {
    if (escort) {
      setEditingEscort(escort)
      setFormData({
        first_name: escort.first_name,
        last_name: escort.last_name,
        email: escort.email,
        phone_number: escort.phone_number || '',
        license_number: escort.license_number || '',
        languages: escort.languages,
        active: escort.active
      })
    } else {
      setEditingEscort(null)
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
        license_number: '',
        languages: [],
        active: true
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingEscort(null)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      if (editingEscort) {
        // Update existing escort
        const { error } = await supabase
          .from('escorts')
          .update({
            first_name: formData.first_name,
            last_name: formData.last_name,
            email: formData.email,
            phone_number: formData.phone_number || null,
            license_number: formData.license_number || null,
            languages: formData.languages,
            active: formData.active
          })
          .eq('escort_id', editingEscort.escort_id)

        if (error) throw error
      } else {
        // Create new escort
        const { error } = await supabase
          .from('escorts')
          .insert([{
            first_name: formData.first_name,
            last_name: formData.last_name,
            email: formData.email,
            phone_number: formData.phone_number || null,
            license_number: formData.license_number || null,
            languages: formData.languages,
            active: formData.active
          }])

        if (error) throw error
      }

      handleCloseModal()
      fetchEscorts()
    } catch (err) {
      console.error('Error saving escort:', err)
      setError(err instanceof Error ? err.message : 'Failed to save escort')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (escortId: string) => {
    if (!confirm('Are you sure you want to delete this escort?')) return

    try {
      const { error } = await supabase
        .from('escorts')
        .delete()
        .eq('escort_id', escortId)

      if (error) throw error
      fetchEscorts()
    } catch (err) {
      console.error('Error deleting escort:', err)
      setError('Failed to delete escort')
    }
  }

  const toggleLanguage = (language: string) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.includes(language)
        ? prev.languages.filter(l => l !== language)
        : [...prev.languages, language]
    }))
  }

  const filteredEscorts = escorts.filter(escort =>
    escort.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    escort.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    escort.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Escorts</h1>
        <Button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Escort
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
            placeholder="Search escorts..."
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

      {/* Escorts Table */}
      {loading ? (
        <div className="text-center py-8">Loading escorts...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">License</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Languages</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEscorts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No escorts found
                  </td>
                </tr>
              ) : (
                filteredEscorts.map((escort) => (
                  <tr key={escort.escort_id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {escort.first_name} {escort.last_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{escort.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{escort.phone_number || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{escort.license_number || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-1 flex-wrap">
                        {escort.languages.map(lang => (
                          <span key={lang} className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                            {lang}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        escort.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {escort.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenModal(escort)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(escort.escort_id)}
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
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold">
                {editingEscort ? 'Edit Escort' : 'Add New Escort'}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-1">First Name *</Label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1">Last Name *</Label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="mt-4">
                <Label className="text-sm font-medium mb-1">Email *</Label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <Label className="text-sm font-medium mb-1">Phone Number</Label>
                  <input
                    type="tel"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1">License Number</Label>
                  <input
                    type="text"
                    value={formData.license_number}
                    onChange={(e) => setFormData({...formData, license_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="mt-4">
                <Label className="text-sm font-medium mb-2">Languages *</Label>
                <div className="flex gap-4">
                  {AVAILABLE_LANGUAGES.map(language => (
                    <label key={language} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formData.languages.includes(language)}
                        onCheckedChange={() => toggleLanguage(language)}
                      />
                      <span className="text-sm">{language}</span>
                    </label>
                  ))}
                </div>
                {formData.languages.length === 0 && (
                  <p className="text-xs text-red-600 mt-1">Please select at least one language</p>
                )}
              </div>

              <div className="mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.active}
                    onCheckedChange={(checked) => setFormData({...formData, active: checked as boolean})}
                  />
                  <span className="text-sm">Active</span>
                </label>
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
                  disabled={formData.languages.length === 0 || saving}
                >
                  {saving ? 'Saving...' : (editingEscort ? 'Update Escort' : 'Create Escort')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
