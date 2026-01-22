'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { guidesApi } from '@/lib/api-client'
import { Plus, Edit, Trash2, Search, X, Smartphone, Key, UserPlus, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

const AVAILABLE_LANGUAGES = ['English', 'Spanish', 'Portuguese']

interface Guide {
  guide_id: string
  first_name: string
  last_name: string
  email: string
  phone_number: string | null
  license_number: string | null
  languages: string[]
  active: boolean
  paid_in_cash: boolean
  uses_app: boolean
  user_id: string | null
  created_at: string
  updated_at: string
}

export default function GuidesListPage() {
  const [guides, setGuides] = useState<Guide[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingGuide, setEditingGuide] = useState<Guide | null>(null)
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
    active: true,
    paid_in_cash: false,
    uses_app: false
  })

  // User account modal state
  const [showUserModal, setShowUserModal] = useState(false)
  const [userModalGuide, setUserModalGuide] = useState<Guide | null>(null)
  const [userPassword, setUserPassword] = useState('')
  const [userModalMode, setUserModalMode] = useState<'create' | 'reset'>('create')
  const [userModalSaving, setUserModalSaving] = useState(false)
  const [userModalError, setUserModalError] = useState<string | null>(null)

  useEffect(() => {
    fetchGuides()
  }, [])

  const fetchGuides = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('guides')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setGuides(data || [])
    } catch (err) {
      console.error('Error fetching guides:', err)
      setError('Failed to load guides')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (guide?: Guide) => {
    if (guide) {
      setEditingGuide(guide)
      setFormData({
        first_name: guide.first_name,
        last_name: guide.last_name,
        email: guide.email,
        phone_number: guide.phone_number || '',
        license_number: guide.license_number || '',
        languages: guide.languages,
        active: guide.active,
        paid_in_cash: guide.paid_in_cash || false,
        uses_app: guide.uses_app || false
      })
    } else {
      setEditingGuide(null)
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
        license_number: '',
        languages: [],
        active: true,
        paid_in_cash: false,
        uses_app: false
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingGuide(null)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      if (editingGuide) {
        // Update existing guide via API
        const result = await guidesApi.update({
          guide_id: editingGuide.guide_id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone_number: formData.phone_number || undefined,
          license_number: formData.license_number || undefined,
          languages: formData.languages,
          active: formData.active,
          paid_in_cash: formData.paid_in_cash,
          uses_app: formData.uses_app
        })

        if (result.error) throw new Error(result.error)
      } else {
        // Create new guide via API
        const result = await guidesApi.create({
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone_number: formData.phone_number || undefined,
          license_number: formData.license_number || undefined,
          languages: formData.languages,
          active: formData.active,
          paid_in_cash: formData.paid_in_cash
        })

        if (result.error) throw new Error(result.error)
      }

      handleCloseModal()
      fetchGuides()
    } catch (err) {
      console.error('Error saving guide:', err)
      setError(err instanceof Error ? err.message : 'Failed to save guide')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (guideId: string) => {
    if (!confirm('Are you sure you want to delete this guide?')) return

    try {
      // Delete via API
      const result = await guidesApi.delete(guideId)
      if (result.error) throw new Error(result.error)
      fetchGuides()
    } catch (err) {
      console.error('Error deleting guide:', err)
      setError('Failed to delete guide')
    }
  }

  // User account management
  const handleOpenUserModal = (guide: Guide, mode: 'create' | 'reset') => {
    setUserModalGuide(guide)
    setUserModalMode(mode)
    setUserPassword('')
    setUserModalError(null)
    setShowUserModal(true)
  }

  const handleCloseUserModal = () => {
    setShowUserModal(false)
    setUserModalGuide(null)
    setUserPassword('')
    setUserModalError(null)
  }

  const handleUserModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userModalGuide || !userPassword) return

    setUserModalSaving(true)
    setUserModalError(null)

    try {
      const endpoint = '/api/guides/user'
      const method = userModalMode === 'create' ? 'POST' : 'PUT'
      const body = userModalMode === 'create'
        ? { guide_id: userModalGuide.guide_id, password: userPassword }
        : { guide_id: userModalGuide.guide_id, new_password: userPassword }

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process request')
      }

      handleCloseUserModal()
      fetchGuides()
    } catch (err) {
      setUserModalError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setUserModalSaving(false)
    }
  }

  const handleRemoveUserAccount = async (guide: Guide) => {
    if (!confirm(`Are you sure you want to remove the app account for ${guide.first_name} ${guide.last_name}? This will delete their login credentials.`)) return

    try {
      const response = await fetch(`/api/guides/user?guide_id=${guide.guide_id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove user account')
      }

      fetchGuides()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove user account')
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

  const filteredGuides = guides.filter(guide =>
    guide.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    guide.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    guide.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Guides</h1>
        <Button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Guide
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
            placeholder="Search guides..."
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

      {/* Guides Table */}
      {loading ? (
        <div className="text-center py-8">Loading guides...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Languages</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">App</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredGuides.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-gray-500">
                    No guides found
                  </td>
                </tr>
              ) : (
                filteredGuides.map((guide) => (
                  <tr key={guide.guide_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {guide.first_name} {guide.last_name}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{guide.email}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{guide.phone_number || '-'}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-1 flex-wrap">
                        {guide.languages.map(lang => (
                          <span key={lang} className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                            {lang.substring(0, 2).toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-1">
                        <span className={`px-1.5 py-0.5 text-xs rounded ${
                          guide.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {guide.active ? 'Active' : 'Inactive'}
                        </span>
                        {guide.paid_in_cash && (
                          <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800">
                            Cash
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {guide.uses_app ? (
                        <div className="flex items-center gap-1">
                          {guide.user_id ? (
                            <>
                              <span className="px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-800 flex items-center gap-1">
                                <Smartphone className="w-3 h-3" />
                                OK
                              </span>
                              <button
                                onClick={() => handleOpenUserModal(guide, 'reset')}
                                className="p-1 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded"
                                title="Reset Password"
                              >
                                <Key className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveUserAccount(guide)}
                                className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                                title="Remove App Account"
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="px-1.5 py-0.5 text-xs rounded bg-amber-100 text-amber-800">
                                No user
                              </span>
                              <button
                                onClick={() => handleOpenUserModal(guide, 'create')}
                                className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded"
                                title="Create App Account"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleOpenModal(guide)}
                          className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(guide.guide_id)}
                          className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                          title="Delete"
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
                {editingGuide ? 'Edit Guide' : 'Add New Guide'}
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

              <div className="mt-4 flex gap-6 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.active}
                    onCheckedChange={(checked) => setFormData({...formData, active: checked as boolean})}
                  />
                  <span className="text-sm">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.paid_in_cash}
                    onCheckedChange={(checked) => setFormData({...formData, paid_in_cash: checked as boolean})}
                  />
                  <span className="text-sm">Paid in Cash</span>
                  <span className="text-xs text-gray-500">(excluded from cost reports)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.uses_app}
                    onCheckedChange={(checked) => setFormData({...formData, uses_app: checked as boolean})}
                  />
                  <span className="text-sm">Uses App</span>
                  <span className="text-xs text-gray-500">(can access guide app)</span>
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
                  {saving ? 'Saving...' : (editingGuide ? 'Update Guide' : 'Create Guide')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Account Modal */}
      {showUserModal && userModalGuide && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            {/* Header */}
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold">
                {userModalMode === 'create' ? 'Create App Account' : 'Reset Password'}
              </h2>
              <button onClick={handleCloseUserModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleUserModalSubmit} className="p-6">
              {userModalError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-red-700">{userModalError}</p>
                </div>
              )}

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  Guide: <span className="font-medium">{userModalGuide.first_name} {userModalGuide.last_name}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Email: <span className="font-medium">{userModalGuide.email}</span>
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium mb-1">
                  {userModalMode === 'create' ? 'Password' : 'New Password'} *
                </Label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseUserModal}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={userPassword.length < 6 || userModalSaving}
                >
                  {userModalSaving ? 'Processing...' : (userModalMode === 'create' ? 'Create Account' : 'Reset Password')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
