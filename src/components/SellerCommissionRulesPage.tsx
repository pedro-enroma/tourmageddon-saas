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
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { Pencil, Trash2, Plus, Percent, Loader2, Search, Calendar, CalendarPlus } from 'lucide-react'

type CommissionRuleType = 'always' | 'year' | 'date_range'
type DateBasis = 'travel_date' | 'creation_date'

interface CommissionRule {
  id: string
  seller_id: number
  seller_name: string
  activity_ids: number[]
  activity_details: { id: number; activity_id: string; title: string }[]
  commission_percentage: number
  rule_type: CommissionRuleType
  date_basis: DateBasis
  year: number | null
  start_date: string | null
  end_date: string | null
  priority: number
  notes: string | null
  created_at: string
  updated_at: string
}

interface Activity {
  id: number
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
  const [activitySearch, setActivitySearch] = useState('')
  const [formData, setFormData] = useState({
    seller_name: '',
    activity_ids: [] as number[],
    all_activities: true,
    commission_percentage: '',
    rule_type: 'always' as CommissionRuleType,
    date_basis: 'travel_date' as DateBasis,
    year: new Date().getFullYear().toString(),
    start_date: '',
    end_date: '',
    priority: '0',
    notes: ''
  })

  const sellerActivityMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    sellerActivities.forEach(sa => {
      const set = map.get(sa.seller_name) || new Set<string>()
      set.add(sa.activity_id)
      map.set(sa.seller_name, set)
    })
    return map
  }, [sellerActivities])

  const availableActivities = useMemo(() => {
    let filtered = activities
    if (formData.seller_name) {
      const allowed = sellerActivityMap.get(formData.seller_name) || new Set<string>()
      filtered = activities.filter(a => allowed.has(a.activity_id))
    }
    if (activitySearch) {
      const search = activitySearch.toLowerCase()
      filtered = filtered.filter(a =>
        a.title.toLowerCase().includes(search) || a.activity_id.includes(search)
      )
    }
    return filtered
  }, [activities, formData.seller_name, sellerActivityMap, activitySearch])

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const rulesRes = await fetch('/api/seller-commissions/rules')
      const rulesData = await rulesRes.json()
      if (rulesRes.ok) {
        setRules(rulesData.data || [])
      }

      const { data: activitiesData } = await supabase
        .from('activities')
        .select('id, activity_id, title')
        .order('title')

      setActivities(activitiesData || [])

      const sellersRes = await fetch('/api/seller-commissions/sellers')
      const sellersData = await sellersRes.json()
      if (sellersRes.ok) {
        setSellers(sellersData.sellers || [])
      }

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
    setActivitySearch('')
    if (rule) {
      setEditingId(rule.id)
      setFormData({
        seller_name: rule.seller_name,
        activity_ids: rule.activity_ids,
        all_activities: rule.activity_ids.length === 0,
        commission_percentage: rule.commission_percentage.toString(),
        rule_type: rule.rule_type,
        date_basis: rule.date_basis || 'travel_date',
        year: rule.year?.toString() || new Date().getFullYear().toString(),
        start_date: rule.start_date || '',
        end_date: rule.end_date || '',
        priority: (rule.priority ?? 0).toString(),
        notes: rule.notes || ''
      })
    } else {
      setEditingId(null)
      setFormData({
        seller_name: '',
        activity_ids: [],
        all_activities: true,
        commission_percentage: '',
        rule_type: 'always',
        date_basis: 'travel_date',
        year: new Date().getFullYear().toString(),
        start_date: '',
        end_date: '',
        priority: '0',
        notes: ''
      })
    }
    setDialogOpen(true)
  }

  const toggleActivity = (activityId: number) => {
    setFormData(prev => {
      const ids = prev.activity_ids.includes(activityId)
        ? prev.activity_ids.filter(id => id !== activityId)
        : [...prev.activity_ids, activityId]
      return { ...prev, activity_ids: ids }
    })
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
      toast.error('Error', { description: 'Please select a seller' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        id: editingId,
        seller_name: formData.seller_name,
        activity_ids: formData.all_activities ? [] : formData.activity_ids,
        commission_percentage: percentage,
        rule_type: formData.rule_type,
        date_basis: formData.date_basis,
        year: formData.rule_type === 'year' ? parseInt(formData.year) : null,
        start_date: formData.rule_type === 'date_range' ? formData.start_date : null,
        end_date: formData.rule_type === 'date_range' ? formData.end_date : null,
        priority: parseInt(formData.priority) || 0,
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

  const renderActivityCell = (rule: CommissionRule) => {
    if (rule.activity_ids.length === 0) {
      return (
        <span className="text-muted-foreground">All activities</span>
      )
    }

    const titles = rule.activity_details.map(a => a.title).sort()
    const displayLabel = titles.length === 1 ? titles[0] : `${titles.length} activities`

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{displayLabel}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs whitespace-pre-line">
          {titles.join('\n')}
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

  const getDateBasisBadge = (rule: CommissionRule) => {
    const baseClass = "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
    if (rule.date_basis === 'creation_date') {
      return (
        <span className={`${baseClass} bg-blue-50 text-blue-700`}>
          <CalendarPlus className="h-3 w-3" />
          Booking Date
        </span>
      )
    }
    return (
      <span className={`${baseClass} bg-purple-50 text-purple-700`}>
        <Calendar className="h-3 w-3" />
        Travel Date
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit' : 'Create'} Commission Rule</DialogTitle>
                <DialogDescription>
                  Set commission percentage for a seller
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Seller */}
                <div className="space-y-2">
                  <Label htmlFor="seller">Seller</Label>
                  <Select
                    value={formData.seller_name}
                    onValueChange={(value) => setFormData({ ...formData, seller_name: value, activity_ids: [], all_activities: true })}
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

                {/* Activities Multi-Select */}
                <div className="space-y-2">
                  <Label>Activities</Label>
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox
                      id="all-activities"
                      checked={formData.all_activities}
                      onCheckedChange={(checked) => {
                        setFormData({
                          ...formData,
                          all_activities: !!checked,
                          activity_ids: checked ? [] : formData.activity_ids
                        })
                      }}
                    />
                    <label htmlFor="all-activities" className="text-sm font-medium cursor-pointer">
                      All activities
                    </label>
                  </div>
                  {!formData.all_activities && (
                    <div className="border rounded-md overflow-hidden">
                      <div className="p-2 border-b">
                        <div className="relative">
                          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search activities..."
                            value={activitySearch}
                            onChange={(e) => setActivitySearch(e.target.value)}
                            className="pl-8 h-9"
                          />
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                        {availableActivities.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            {formData.seller_name ? 'No activities found' : 'Select a seller first'}
                          </p>
                        ) : (
                          availableActivities.map((activity) => (
                            <div key={activity.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 min-w-0">
                              <Checkbox
                                id={`activity-${activity.id}`}
                                checked={formData.activity_ids.includes(activity.id)}
                                onCheckedChange={() => toggleActivity(activity.id)}
                                className="shrink-0"
                              />
                              <label
                                htmlFor={`activity-${activity.id}`}
                                className="text-sm cursor-pointer truncate min-w-0"
                              >
                                {activity.title}
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                      {formData.activity_ids.length > 0 && (
                        <div className="p-2 border-t text-xs text-muted-foreground">
                          {formData.activity_ids.length} activit{formData.activity_ids.length === 1 ? 'y' : 'ies'} selected
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Commission Percentage */}
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

                {/* Rule Type */}
                <div className="space-y-2">
                  <Label>Rule Type</Label>
                  <Tabs
                    value={formData.rule_type}
                    onValueChange={(value) => setFormData({ ...formData, rule_type: value as CommissionRuleType })}
                  >
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="always">Always</TabsTrigger>
                      <TabsTrigger value="year">By Year</TabsTrigger>
                      <TabsTrigger value="date_range">Date Range</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* Date Basis */}
                <div className="space-y-2">
                  <Label>Date Basis</Label>
                  <Select
                    value={formData.date_basis}
                    onValueChange={(value) => setFormData({ ...formData, date_basis: value as DateBasis })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="travel_date">Travel Date — when the tour happens</SelectItem>
                      <SelectItem value="creation_date">Booking Date — when the booking was created</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Year input */}
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

                {/* Date range inputs */}
                {formData.rule_type === 'date_range' && (
                  <div className="grid grid-cols-2 gap-2">
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

                {/* Priority */}
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Input
                    id="priority"
                    type="number"
                    min="0"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher number = checked first. Use this to control which rule wins when multiple match.
                  </p>
                </div>

                {/* Notes */}
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

      {/* Rules Table */}
      <Card>
        <CardHeader>
          <CardTitle>Commission Rules</CardTitle>
          <CardDescription>
            Rules are sorted by priority (highest first). When multiple rules match, the first match wins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">P</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Activities</TableHead>
                <TableHead className="w-16">%</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right w-20">Actions</TableHead>
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
                    <TableCell>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                        {rule.priority}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{rule.seller_name}</TableCell>
                    <TableCell>{renderActivityCell(rule)}</TableCell>
                    <TableCell className="font-medium text-green-600">
                      {rule.commission_percentage}%
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {getRuleTypeBadge(rule)}
                        {getDateBasisBadge(rule)}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                      {rule.notes || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openDialog(rule)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDelete(rule.id, rule.seller_name)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
