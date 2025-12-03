'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, Shield, ShieldCheck, UserX, UserCheck, UserPlus, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { usersApi, AppUser } from '@/lib/api-client'

type UserRole = 'admin' | 'editor' | 'viewer'

export default function UserManagementPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [initializingAdmin, setInitializingAdmin] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Form state for new user (invitation flow - no password needed)
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'viewer' as UserRole
  })

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await usersApi.list()
      if (result.error) throw new Error(result.error)
      setUsers(result.data || [])
    } catch (err) {
      console.error('Error fetching users:', err)
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = () => {
    setFormData({
      email: '',
      full_name: '',
      role: 'viewer'
    })
    setError(null)
    setSuccessMessage(null)
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate required fields
    if (!formData.email || !formData.full_name) {
      setError('Please fill in all required fields')
      return
    }

    setSaving(true)

    try {
      const result = await usersApi.create({
        email: formData.email,
        full_name: formData.full_name,
        role: formData.role
      })

      if (result.error) throw new Error(result.error)

      // Show success message with invitation info
      setSuccessMessage(`Invitation sent to ${formData.email}. They will receive an email to set their password.`)
      handleCloseModal()
      fetchUsers()
    } catch (err) {
      console.error('Error inviting user:', err)
      setError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (user: AppUser) => {
    try {
      const result = await usersApi.update(user.id, {
        is_active: !user.is_active
      })

      if (result.error) throw new Error(result.error)
      fetchUsers()
    } catch (err) {
      console.error('Error toggling user status:', err)
      setError('Failed to update user status')
    }
  }

  const handleChangeRole = async (user: AppUser, newRole: UserRole) => {
    try {
      const result = await usersApi.update(user.id, {
        role: newRole
      })

      if (result.error) throw new Error(result.error)
      fetchUsers()
    } catch (err) {
      console.error('Error changing user role:', err)
      setError('Failed to update user role')
    }
  }

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-800'
      case 'editor': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const handleInitializeAdmin = async () => {
    setInitializingAdmin(true)
    setError(null)
    try {
      const response = await fetch('/api/users/init-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to initialize admin')
      }

      setSuccessMessage('Admin user created successfully!')
      fetchUsers()
    } catch (err) {
      console.error('Error initializing admin:', err)
      setError(err instanceof Error ? err.message : 'Failed to initialize admin')
    } finally {
      setInitializingAdmin(false)
    }
  }

  // Show setup screen if no users exist
  if (!loading && users.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to User Management</h1>
          <p className="text-gray-600 mb-6">
            No users have been set up yet. Click the button below to create yourself as the first admin user.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-left">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 text-left">
              <p className="text-sm text-green-700">{successMessage}</p>
            </div>
          )}

          <Button
            onClick={handleInitializeAdmin}
            disabled={initializingAdmin}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {initializingAdmin ? 'Creating Admin...' : 'Initialize Me as Admin'}
          </Button>

          <p className="text-xs text-gray-500 mt-4">
            This will use your currently logged-in account to create the first admin user.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-gray-600 text-sm mt-1">Manage users, roles, and access permissions</p>
        </div>
        <Button onClick={handleOpenModal} className="flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Invite User
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
            placeholder="Search users..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <Mail className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="text-sm text-green-700">{successMessage}</p>
              <button
                onClick={() => setSuccessMessage(null)}
                className="text-xs text-green-600 underline mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && !showModal && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Users Table */}
      {loading ? (
        <div className="text-center py-8">Loading users...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MFA</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className={!user.is_active ? 'bg-gray-50 opacity-60' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <span className="text-gray-600 font-medium">
                            {user.full_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{user.full_name}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={user.role}
                        onChange={(e) => handleChangeRole(user, e.target.value as UserRole)}
                        className={`px-2 py-1 text-xs rounded-full border-0 ${getRoleBadgeColor(user.role)}`}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.mfa_enabled ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <ShieldCheck className="w-4 h-4" />
                          <span className="text-xs">Enabled</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-400">
                          <Shield className="w-4 h-4" />
                          <span className="text-xs">Not set</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleToggleActive(user)}
                          className={`p-1 rounded ${user.is_active ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                          title={user.is_active ? 'Disable user' : 'Enable user'}
                        >
                          {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
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

      {/* Add User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Invite New User</h2>
              <p className="text-sm text-gray-500 mt-1">
                An email will be sent to set their password
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1">Full Name *</Label>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="John Doe"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1">Email *</Label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-1">Role *</Label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="viewer">Viewer - Read-only access</option>
                    <option value="editor">Editor - Can modify data</option>
                    <option value="admin">Admin - Full access including user management</option>
                  </select>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                <div className="flex items-start gap-2">
                  <Mail className="w-4 h-4 text-blue-600 mt-0.5" />
                  <p className="text-sm text-blue-700">
                    The user will receive an email with a link to set their password and access the system.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
                <Button type="button" variant="outline" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Sending Invitation...' : 'Send Invitation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
