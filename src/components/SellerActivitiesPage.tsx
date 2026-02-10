'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Pencil, Trash2, Plus, Building2, Loader2, Search, FolderPlus, Layers } from 'lucide-react'

interface SellerActivity {
  id: string
  seller_name: string
  activity_id: string
  created_at: string
}

interface Activity {
  activity_id: string
  title: string
}

interface SellerSummary {
  seller_name: string
  activity_count: number
  activities: string[]
}

interface ActivityGroup {
  id: string
  name: string
  activity_ids: string[]
  created_at: string
}

export default function SellerActivitiesPage() {
  const [sellerActivities, setSellerActivities] = useState<SellerActivity[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [sellers, setSellers] = useState<string[]>([])
  const [sellerSummaries, setSellerSummaries] = useState<SellerSummary[]>([])
  const [activityGroups, setActivityGroups] = useState<ActivityGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [selectedSeller, setSelectedSeller] = useState<string>('')
  const [selectedActivities, setSelectedActivities] = useState<string[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [savingGroup, setSavingGroup] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ActivityGroup | null>(null)

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load seller activities
      const activitiesRes = await fetch('/api/seller-commissions/activities')
      const activitiesData = await activitiesRes.json()
      if (activitiesRes.ok) {
        setSellerActivities(activitiesData.data || [])
      }

      // Load all activities
      const { data: allActivities, error: activitiesError } = await supabase
        .from('activities')
        .select('activity_id, title')
        .order('title')

      if (!activitiesError) {
        setActivities(allActivities || [])
      }

      // Load sellers
      const sellersRes = await fetch('/api/seller-commissions/sellers')
      const sellersData = await sellersRes.json()
      if (sellersRes.ok) {
        setSellers(sellersData.sellers || [])
      }

      // Load activity groups
      const groupsRes = await fetch('/api/seller-commissions/activity-groups')
      const groupsData = await groupsRes.json()
      if (groupsRes.ok) {
        setActivityGroups(groupsData.data || [])
      }

      // Build seller summaries
      const summaryMap = new Map<string, { activities: string[] }>()
      ;(activitiesData.data || []).forEach((sa: SellerActivity) => {
        const existing = summaryMap.get(sa.seller_name) || { activities: [] }
        existing.activities.push(sa.activity_id)
        summaryMap.set(sa.seller_name, existing)
      })

      const summaries: SellerSummary[] = Array.from(summaryMap.entries()).map(([seller_name, data]) => ({
        seller_name,
        activity_count: data.activities.length,
        activities: data.activities
      })).sort((a, b) => a.seller_name.localeCompare(b.seller_name))

      setSellerSummaries(summaries)
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to load data',
      })
    } finally {
      setLoading(false)
    }
  }

  // Filter activities based on search query
  const filteredActivities = useMemo(() => {
    if (!searchQuery.trim()) return activities
    const query = searchQuery.toLowerCase()
    return activities.filter(a =>
      a.title.toLowerCase().includes(query) ||
      a.activity_id.toLowerCase().includes(query)
    )
  }, [activities, searchQuery])

  const openDialog = (sellerName?: string) => {
    if (sellerName) {
      setIsEditing(true)
      setSelectedSeller(sellerName)
      const sellerData = sellerSummaries.find(s => s.seller_name === sellerName)
      setSelectedActivities(sellerData?.activities || [])
    } else {
      setIsEditing(false)
      setSelectedSeller('')
      setSelectedActivities([])
    }
    setSearchQuery('')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!selectedSeller) {
      toast.error('Error', {
        description: 'Please select a seller',
      })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/seller-commissions/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_name: selectedSeller,
          activity_ids: selectedActivities
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save')
      }

      toast.success(`Activities ${isEditing ? 'updated' : 'assigned'} for ${selectedSeller}`)

      setDialogOpen(false)
      loadData()
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to save',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (sellerName: string) => {
    if (!confirm(`Remove all activity assignments for ${sellerName}?`)) return

    try {
      const res = await fetch(`/api/seller-commissions/activities?seller_name=${encodeURIComponent(sellerName)}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete')
      }

      toast.success(`Removed all assignments for ${sellerName}`)

      loadData()
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to delete',
      })
    }
  }

  const toggleActivity = (activityId: string) => {
    setSelectedActivities(prev =>
      prev.includes(activityId)
        ? prev.filter(id => id !== activityId)
        : [...prev, activityId]
    )
  }

  const selectAll = () => {
    setSelectedActivities(filteredActivities.map(a => a.activity_id))
  }

  const clearAll = () => {
    setSelectedActivities([])
  }

  const applyGroup = (group: ActivityGroup) => {
    // Filter to only include activity_ids that exist in the activities list
    const validActivityIds = group.activity_ids.filter(id =>
      activities.some(a => a.activity_id === id)
    )

    // Merge group activities with current selection
    const newSelection = new Set([...selectedActivities, ...validActivityIds])
    setSelectedActivities(Array.from(newSelection))

    if (validActivityIds.length === 0) {
      toast.error('No Activities Added', {
        description: `The activities in "${group.name}" could not be found. The group may need to be updated.`,
      })
    } else {
      toast.success('Group Applied', {
        description: `Added ${validActivityIds.length} activities from "${group.name}"`,
      })
    }
  }

  const openGroupDialog = (group?: ActivityGroup) => {
    if (group) {
      setEditingGroup(group)
      setNewGroupName(group.name)
      setSelectedActivities(group.activity_ids)
    } else {
      setEditingGroup(null)
      setNewGroupName('')
      setSelectedActivities([])
    }
    setSearchQuery('')
    setGroupDialogOpen(true)
  }

  const handleSaveGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error('Error', {
        description: 'Please enter a group name',
      })
      return
    }

    if (selectedActivities.length === 0) {
      toast.error('Error', {
        description: 'Please select at least one activity for the group',
      })
      return
    }

    setSavingGroup(true)
    try {
      const isEditing = !!editingGroup
      const res = await fetch('/api/seller-commissions/activity-groups', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingGroup?.id,
          name: newGroupName.trim(),
          activity_ids: selectedActivities
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || `Failed to ${isEditing ? 'update' : 'create'} group`)
      }

      toast.success(`Group "${newGroupName}" ${isEditing ? 'updated' : 'created'} with ${selectedActivities.length} activities`)

      setGroupDialogOpen(false)
      setNewGroupName('')
      setEditingGroup(null)
      loadData()
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to save group',
      })
    } finally {
      setSavingGroup(false)
    }
  }

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!confirm(`Delete the group "${groupName}"?`)) return

    try {
      const res = await fetch(`/api/seller-commissions/activity-groups?id=${groupId}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete')
      }

      toast.success(`Group "${groupName}" deleted`)

      loadData()
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to delete',
      })
    }
  }

  const getActivityTitle = (activityId: string) => {
    return activities.find(a => a.activity_id === activityId)?.title || activityId
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Seller Activities</h1>
          <p className="text-muted-foreground">Manage which activities each seller can sell</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={groupDialogOpen} onOpenChange={(open) => {
            setGroupDialogOpen(open)
            if (!open) {
              setEditingGroup(null)
              setNewGroupName('')
              setSearchQuery('')
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={() => openGroupDialog()}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Create Group
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingGroup ? 'Edit' : 'Create'} Activity Group</DialogTitle>
                <DialogDescription>
                  {editingGroup ? 'Update the group name and activities' : 'Create a reusable group of activities that can be assigned to sellers quickly'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="groupName">Group Name</Label>
                  <Input
                    id="groupName"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g., Popular Tours, Vatican Package..."
                  />
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search activities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="flex justify-between items-center">
                  <Label>Activities ({selectedActivities.length} selected)</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                      Select All
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="border rounded-md max-h-64 overflow-y-auto p-2 space-y-1">
                  {filteredActivities.map((activity) => (
                    <div
                      key={activity.activity_id}
                      className="flex items-center space-x-2 p-2 hover:bg-muted rounded"
                    >
                      <Checkbox
                        id={`group-${activity.activity_id}`}
                        checked={selectedActivities.includes(activity.activity_id)}
                        onCheckedChange={() => toggleActivity(activity.activity_id)}
                      />
                      <label
                        htmlFor={`group-${activity.activity_id}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {activity.title}
                      </label>
                    </div>
                  ))}
                  {filteredActivities.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground">
                      No activities found
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => {
                  setGroupDialogOpen(false)
                  setNewGroupName('')
                  setEditingGroup(null)
                  setSearchQuery('')
                }}>
                  Cancel
                </Button>
                <Button onClick={handleSaveGroup} disabled={savingGroup}>
                  {savingGroup && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingGroup ? 'Update' : 'Create'} Group
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Assign Activities
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{isEditing ? 'Edit' : 'Assign'} Activities</DialogTitle>
                <DialogDescription>
                  Select which activities this seller can sell
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="seller">Seller</Label>
                  <Select
                    value={selectedSeller}
                    onValueChange={setSelectedSeller}
                    disabled={isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select seller..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sellers.map((seller) => (
                        <SelectItem key={seller} value={seller}>
                          {seller}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Activity Groups */}
                {activityGroups.length > 0 && (
                  <div className="space-y-2">
                    <Label>Quick Add from Groups</Label>
                    <div className="flex flex-wrap gap-2">
                      {activityGroups.map((group) => (
                        <Button
                          key={group.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => applyGroup(group)}
                          className="flex items-center gap-1"
                        >
                          <Layers className="h-3 w-3" />
                          {group.name} ({group.activity_ids.length})
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search activities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="flex justify-between items-center">
                  <Label>Activities ({selectedActivities.length} selected)</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                      Select All
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="border rounded-md max-h-64 overflow-y-auto p-2 space-y-1">
                  {filteredActivities.map((activity) => (
                    <div
                      key={activity.activity_id}
                      className="flex items-center space-x-2 p-2 hover:bg-muted rounded"
                    >
                      <Checkbox
                        id={activity.activity_id}
                        checked={selectedActivities.includes(activity.activity_id)}
                        onCheckedChange={() => toggleActivity(activity.activity_id)}
                      />
                      <label
                        htmlFor={activity.activity_id}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {activity.title}
                      </label>
                    </div>
                  ))}
                  {filteredActivities.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground">
                      No activities found
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditing ? 'Update' : 'Assign'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sellers</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sellerSummaries.length}</div>
            <p className="text-xs text-muted-foreground">with activity assignments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assignments</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sellerActivities.length}</div>
            <p className="text-xs text-muted-foreground">seller-activity pairs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Activities</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activities.length}</div>
            <p className="text-xs text-muted-foreground">total activities</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activity Groups</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activityGroups.length}</div>
            <p className="text-xs text-muted-foreground">reusable groups</p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Groups Section */}
      {activityGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Activity Groups</CardTitle>
            <CardDescription>
              Predefined groups of activities for quick assignment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {activityGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2"
                >
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{group.name}</span>
                  <span className="text-sm text-muted-foreground">
                    ({group.activity_ids.length} activities)
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 ml-1"
                    onClick={() => openGroupDialog(group)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => handleDeleteGroup(group.id, group.name)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sellers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Seller Activity Assignments</CardTitle>
          <CardDescription>
            Each seller can be assigned to specific activities they are allowed to sell
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seller</TableHead>
                <TableHead>Activities Count</TableHead>
                <TableHead>Assigned Activities</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellerSummaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No seller activity assignments configured. Click &quot;Assign Activities&quot; to add one.
                  </TableCell>
                </TableRow>
              ) : (
                sellerSummaries.map((summary) => (
                  <TableRow key={summary.seller_name}>
                    <TableCell className="font-medium">{summary.seller_name}</TableCell>
                    <TableCell>{summary.activity_count}</TableCell>
                    <TableCell className="max-w-md">
                      <div className="text-sm text-muted-foreground truncate">
                        {summary.activities.slice(0, 3).map(id => getActivityTitle(id)).join(', ')}
                        {summary.activities.length > 3 && ` +${summary.activities.length - 3} more`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog(summary.seller_name)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(summary.seller_name)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
