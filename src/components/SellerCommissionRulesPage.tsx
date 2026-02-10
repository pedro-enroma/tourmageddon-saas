'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { Pencil, Trash2, Plus, Percent, Loader2 } from 'lucide-react'

interface CommissionRule {
  id: string
  seller_id: number
  seller_name: string
  activity_id: string | null
  activity_title: string | null
  commission_percentage: number
  rule_type: 'always' | 'year' | 'date_range'
  year: number | null
  start_date: string | null
  end_date: string | null
  priority: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface Activity {
  activity_id: string
  title: string
}

interface SellerActivity {
  seller_name: string
  activity_id: string
}

export default function SellerCommissionRulesPage() {
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [sellerActivities, setSellerActivities] = useState<SellerActivity[]>([])
  const [sellers, setSellers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    seller_name: '',
    activity_id: '',
    commission_percentage: '',
    rule_type: 'always' as 'always' | 'year' | 'date_range',
    year: new Date().getFullYear().toString(),
    start_date: '',
    end_date: '',
    notes: ''
  })

  const activityTitleMap = useMemo(() => {
    return new Map(activities.map(activity => [activity.activity_id, activity.title]))
  }, [activities])

  const sellerActivityMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    sellerActivities.forEach(sa => {
      const set = map.get(sa.seller_name) || new Set<string>()
      set.add(sa.activity_id)
      map.set(sa.seller_name, set)
    })
    return map
  }, [sellerActivities])

  const getSellerActivityTitles = (sellerName: string) => {
    const ids = sellerActivityMap.get(sellerName)
    if (!ids || ids.size === 0) return []
    const titles = Array.from(ids).map(id => activityTitleMap.get(id) || id)
    return titles.sort((a, b) => a.localeCompare(b))
  }

  const availableActivities = useMemo(() => {
    if (!formData.seller_name) {
      return activities
    }
    const allowed = sellerActivityMap.get(formData.seller_name) || new Set<string>()
    let filtered = activities.filter(a => allowed.has(a.activity_id))

    if (formData.activity_id && !allowed.has(formData.activity_id)) {
      const current = activities.find(a => a.activity_id === formData.activity_id)
      if (current) {
        filtered = [current, ...filtered]
      }
    }

    return filtered
  }, [activities, formData.activity_id, formData.seller_name, sellerActivityMap])

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load commission rules
      const rulesRes = await fetch('/api/seller-commissions/rules')
      const rulesData = await rulesRes.json()
      if (rulesRes.ok) {
        setRules(rulesData.data || [])
      }

      // Load activities
      const { data: activitiesData } = await supabase
        .from('activities')
        .select('activity_id, title')
        .order('title')

      setActivities(activitiesData || [])

      // Load sellers
      const sellersRes = await fetch('/api/seller-commissions/sellers')
      const sellersData = await sellersRes.json()
      if (sellersRes.ok) {
        setSellers(sellersData.sellers || [])
      }

      // Load seller activity assignments
      const sellerActivitiesRes = await fetch('/api/seller-commissions/activities')
      const sellerActivitiesData = await sellerActivitiesRes.json()
      if (sellerActivitiesRes.ok) {
        setSellerActivities(sellerActivitiesData.data || [])
      }
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to load data',
      })
    } finally {
      setLoading(false)
    }
  }

  const openDialog = (rule?: CommissionRule) => {
    if (rule) {
      setEditingId(rule.id)
      setFormData({
        seller_name: rule.seller_name,
        activity_id: rule.activity_id || '',
        commission_percentage: rule.commission_percentage.toString(),
        rule_type: rule.rule_type,
        year: rule.year?.toString() || new Date().getFullYear().toString(),
        start_date: rule.start_date || '',
        end_date: rule.end_date || '',
        notes: rule.notes || ''
      })
    } else {
      setEditingId(null)
      setFormData({
        seller_name: '',
        activity_id: '',
        commission_percentage: '',
        rule_type: 'always',
        year: new Date().getFullYear().toString(),
        start_date: '',
        end_date: '',
        notes: ''
      })
    }
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const percentage = parseFloat(formData.commission_percentage)
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      toast.error('Invalid percentage', {
        description: 'Commission percentage must be between 0 and 100',
      })
      return
    }

    if (!formData.seller_name) {
      toast.error('Error', {
        description: 'Please select a seller',
      })
      return
    }

    setSaving(true)
    try {
      const payload = {
        id: editingId,
        seller_name: formData.seller_name,
        activity_id: formData.activity_id || null,
        commission_percentage: percentage,
        rule_type: formData.rule_type,
        year: formData.rule_type === 'year' ? parseInt(formData.year) : null,
        start_date: formData.rule_type === 'date_range' ? formData.start_date : null,
        end_date: formData.rule_type === 'date_range' ? formData.end_date : null,
        notes: formData.notes || null
      }

      const res = await fetch('/api/seller-commissions/rules', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save')
      }

      toast.success(`Commission rule ${editingId ? 'updated' : 'created'} successfully`)

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

  const handleDelete = async (id: string, sellerName: string) => {
    if (!confirm(`Delete commission rule for ${sellerName}?`)) return

    try {
      const res = await fetch(`/api/seller-commissions/rules?id=${id}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete')
      }

      toast.success('Commission rule deleted successfully')

      loadData()
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to delete',
      })
    }
  }

  const getActivityTitle = (rule: CommissionRule) => {
    if (!rule.activity_id) return 'All Activities'
    return rule.activity_title || rule.activity_id
  }

  const renderActivityCell = (rule: CommissionRule) => {
    if (rule.activity_id) {
      return getActivityTitle(rule)
    }

    const titles = getSellerActivityTitles(rule.seller_name)
    const countLabel = `${titles.length} activities`
    const tooltipContent = titles.length > 0 ? titles.join('\n') : 'No activities assigned'

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help text-muted-foreground">{countLabel}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs whitespace-pre-line">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    )
  }

  const getRuleTypeBadge = (rule: CommissionRule) => {
    const baseClass = "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
    switch (rule.rule_type) {
      case 'always':
        return <span className={`${baseClass} bg-gray-100 text-gray-800`}>Always</span>
      case 'year':
        return <span className={`${baseClass} border border-gray-300 text-gray-700`}>{rule.year}</span>
      case 'date_range':
        return (
          <span className={`${baseClass} border border-gray-300 text-gray-700`}>
            {rule.start_date} - {rule.end_date}
          </span>
        )
    }
  }

  const getPriorityBadge = (rule: CommissionRule) => {
    const hasActivity = rule.activity_id !== null
    let priority: number
    if (rule.rule_type === 'date_range') priority = hasActivity ? 1 : 4
    else if (rule.rule_type === 'year') priority = hasActivity ? 2 : 5
    else priority = hasActivity ? 3 : 6

    const colors: Record<number, string> = {
      1: 'bg-green-100 text-green-800',
      2: 'bg-green-50 text-green-700',
      3: 'bg-yellow-100 text-yellow-800',
      4: 'bg-yellow-50 text-yellow-700',
      5: 'bg-orange-100 text-orange-800',
      6: 'bg-orange-50 text-orange-700'
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[priority]}`}>
        P{priority}
      </span>
    )
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
          <h1 className="text-3xl font-bold">Commission Rules</h1>
          <p className="text-muted-foreground">Configure commission percentages for sellers</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit' : 'Create'} Commission Rule</DialogTitle>
                <DialogDescription>
                  Set commission percentage for a seller
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="seller">Seller</Label>
                  <Select
                    value={formData.seller_name}
                    onValueChange={(value) => setFormData({ ...formData, seller_name: value })}
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

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="activity">Activity (optional)</Label>
                  </div>
                  <Select
                    value={formData.activity_id || '__all__'}
                    onValueChange={(value) => setFormData({ ...formData, activity_id: value === '__all__' ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All activities..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Activities</SelectItem>
                      {availableActivities.map((activity) => (
                        <SelectItem key={activity.activity_id} value={activity.activity_id}>
                          {activity.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formData.seller_name
                      ? `Showing ${availableActivities.length} activities assigned to ${formData.seller_name}`
                      : 'Select a seller to filter activities'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="percentage">Commission Percentage</Label>
                  <Input
                    id="percentage"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.commission_percentage}
                    onChange={(e) => setFormData({ ...formData, commission_percentage: e.target.value })}
                    placeholder="15.00"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Rule Type</Label>
                  <Tabs
                    value={formData.rule_type}
                    onValueChange={(value) => setFormData({ ...formData, rule_type: value as 'always' | 'year' | 'date_range' })}
                  >
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="always">Always</TabsTrigger>
                      <TabsTrigger value="year">By Year</TabsTrigger>
                      <TabsTrigger value="date_range">Date Range</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {formData.rule_type === 'year' && (
                  <div className="space-y-2">
                    <Label htmlFor="year">Year</Label>
                    <Input
                      id="year"
                      type="number"
                      min="2020"
                      max="2030"
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                      required
                    />
                  </div>
                )}

                {formData.rule_type === 'date_range' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="start_date">Start Date</Label>
                      <Input
                        id="start_date"
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end_date">End Date</Label>
                      <Input
                        id="end_date"
                        type="date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Optional notes about this rule"
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? 'Update' : 'Create'} Rule
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Rules</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rules.length}</div>
            <p className="text-xs text-muted-foreground">commission rules configured</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sellers with Rules</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(rules.map(r => r.seller_name)).size}
            </div>
            <p className="text-xs text-muted-foreground">unique sellers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Commission</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {rules.length > 0
                ? (rules.reduce((sum, r) => sum + r.commission_percentage, 0) / rules.length).toFixed(1)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">across all rules</p>
          </CardContent>
        </Card>
      </div>

      {/* Priority Legend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Rule Priority</CardTitle>
          <CardDescription>
            When multiple rules match, the most specific one is applied (lowest priority number wins)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-medium">P1</span>
              <span>Activity + Date Range</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs font-medium">P2</span>
              <span>Activity + Year</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs font-medium">P3</span>
              <span>Activity + Always</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded text-xs font-medium">P4</span>
              <span>All Activities + Date Range</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-xs font-medium">P5</span>
              <span>All Activities + Year</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded text-xs font-medium">P6</span>
              <span>All Activities + Always</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rules Table */}
      <Card>
        <CardHeader>
          <CardTitle>Commission Rules</CardTitle>
          <CardDescription>
            Configure commission percentages. Rules with lower priority numbers take precedence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Rule Type</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No commission rules configured. Click &quot;Add Rule&quot; to create one.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>{getPriorityBadge(rule)}</TableCell>
                    <TableCell className="font-medium">{rule.seller_name}</TableCell>
                    <TableCell>{renderActivityCell(rule)}</TableCell>
                    <TableCell className="font-medium text-green-600">
                      {rule.commission_percentage}%
                    </TableCell>
                    <TableCell>{getRuleTypeBadge(rule)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {rule.notes || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog(rule)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rule.id, rule.seller_name)}
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
