'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  resourceRatesApi,
  ResourceRate,
  Escort,
  Headphone,
  Printing
} from '@/lib/api-client'
import { Save, Loader2, Search, Users, Headphones, Printer, UserCheck, Calendar, Star, Plus, Trash2, Edit2, X, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'

interface Activity {
  activity_id: string
  title: string
}

interface CostSeason {
  id: string
  year: number
  name: string
  start_date: string
  end_date: string
  color: string
}

interface SpecialCostDate {
  id: string
  name: string
  date: string
}

interface SeasonalCost {
  id: string
  activity_id: string
  season_id: string
  cost_amount: number
  cost_seasons?: CostSeason
}

interface SpecialDateCost {
  id: string
  activity_id: string
  special_date_id: string
  cost_amount: number
  special_cost_dates?: SpecialCostDate
}

type TabType = 'seasons' | 'special-dates' | 'guides' | 'escorts' | 'headphones' | 'printing'

export default function ResourceCostsConfigPage() {
  const [activeTab, setActiveTab] = useState<TabType>('seasons')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Year selector for seasons
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)

  // Data
  const [escorts, setEscorts] = useState<Escort[]>([])
  const [headphones, setHeadphones] = useState<Headphone[]>([])
  const [printing, setPrinting] = useState<Printing[]>([])
  const [activities, setActivities] = useState<Activity[]>([])

  // Seasons and special dates
  const [seasons, setSeasons] = useState<CostSeason[]>([])
  const [specialDates, setSpecialDates] = useState<SpecialCostDate[]>([])

  // Resource rates
  const [resourceRates, setResourceRates] = useState<ResourceRate[]>([])

  // UI State
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedActivities, setSelectedActivities] = useState<Set<string>>(() => {
    // Load from localStorage on initial render
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('resourceCosts_selectedActivities')
      if (saved) {
        try {
          return new Set(JSON.parse(saved))
        } catch {
          return new Set()
        }
      }
    }
    return new Set()
  })
  const [showActivityFilter, setShowActivityFilter] = useState(false)

  // Save selected activities to localStorage when they change
  useEffect(() => {
    localStorage.setItem('resourceCosts_selectedActivities', JSON.stringify(Array.from(selectedActivities)))
  }, [selectedActivities])

  // Form state for resource rates
  const [escortRateForm, setEscortRateForm] = useState<Record<string, string>>({})
  const [headphoneRateForm, setHeadphoneRateForm] = useState<Record<string, string>>({})
  const [printingRateForm, setPrintingRateForm] = useState<Record<string, string>>({})

  // Season form state
  const [showSeasonForm, setShowSeasonForm] = useState(false)
  const [editingSeason, setEditingSeason] = useState<CostSeason | null>(null)
  const [seasonForm, setSeasonForm] = useState({ name: '', start_date: '', end_date: '', color: '#3b82f6' })

  // Special date form state
  const [showSpecialDateForm, setShowSpecialDateForm] = useState(false)
  const [editingSpecialDate, setEditingSpecialDate] = useState<SpecialCostDate | null>(null)
  const [specialDateForm, setSpecialDateForm] = useState({ name: '', date: '' })

  // Seasonal cost form
  const [seasonalCostForm, setSeasonalCostForm] = useState<Record<string, Record<string, string>>>({})
  const [specialDateCostForm, setSpecialDateCostForm] = useState<Record<string, Record<string, string>>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [
        escortsRes,
        headphonesRes,
        printingRes,
        activitiesRes,
        resourceRatesRes
      ] = await Promise.all([
        supabase.from('escorts').select('*').eq('active', true).order('first_name'),
        supabase.from('headphones').select('*').eq('active', true).order('name'),
        supabase.from('printing').select('*').eq('active', true).order('name'),
        supabase.from('activities').select('activity_id, title').order('title'),
        resourceRatesApi.list()
      ])

      if (escortsRes.error) throw escortsRes.error
      if (headphonesRes.error) throw headphonesRes.error
      if (printingRes.error) throw printingRes.error
      if (activitiesRes.error) throw activitiesRes.error
      if (resourceRatesRes.error) throw new Error(resourceRatesRes.error)

      setEscorts(escortsRes.data || [])
      setHeadphones(headphonesRes.data || [])
      setPrinting(printingRes.data || [])
      setActivities(activitiesRes.data || [])
      setResourceRates(resourceRatesRes.data || [])

      // Initialize rate forms
      const escortRates: Record<string, string> = {}
      const headphoneRates: Record<string, string> = {}
      const printingRates: Record<string, string> = {}

      resourceRatesRes.data?.forEach(rate => {
        if (rate.resource_type === 'escort') {
          escortRates[rate.resource_id] = String(rate.rate_amount)
        } else if (rate.resource_type === 'headphone') {
          headphoneRates[rate.resource_id] = String(rate.rate_amount)
        } else if (rate.resource_type === 'printing') {
          printingRates[rate.resource_id] = String(rate.rate_amount)
        }
      })

      setEscortRateForm(escortRates)
      setHeadphoneRateForm(headphoneRates)
      setPrintingRateForm(printingRates)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSeasons = useCallback(async () => {
    try {
      const response = await fetch(`/api/costs/seasons?year=${selectedYear}`)
      if (!response.ok) throw new Error('Failed to fetch seasons')
      const result = await response.json()
      setSeasons(result.data || [])
    } catch (err) {
      console.error('Error fetching seasons:', err)
    }
  }, [selectedYear])

  const fetchSpecialDates = useCallback(async () => {
    try {
      // Fetch all special dates (no year filter - they're shared across years)
      const response = await fetch('/api/costs/special-dates')
      if (!response.ok) throw new Error('Failed to fetch special dates')
      const result = await response.json()
      setSpecialDates(result.data || [])
    } catch (err) {
      console.error('Error fetching special dates:', err)
    }
  }, [])

  const fetchSeasonalCosts = useCallback(async () => {
    try {
      const response = await fetch('/api/costs/seasonal-costs')
      if (!response.ok) throw new Error('Failed to fetch seasonal costs')
      const result = await response.json()

      // Initialize cost forms
      const seasonCostMap: Record<string, Record<string, string>> = {}
      const specialCostMap: Record<string, Record<string, string>> = {}

      result.data?.seasonal_costs?.forEach((cost: SeasonalCost) => {
        if (!seasonCostMap[cost.activity_id]) seasonCostMap[cost.activity_id] = {}
        seasonCostMap[cost.activity_id][cost.season_id] = String(cost.cost_amount)
      })

      result.data?.special_date_costs?.forEach((cost: SpecialDateCost) => {
        if (!specialCostMap[cost.activity_id]) specialCostMap[cost.activity_id] = {}
        specialCostMap[cost.activity_id][cost.special_date_id] = String(cost.cost_amount)
      })

      setSeasonalCostForm(seasonCostMap)
      setSpecialDateCostForm(specialCostMap)
    } catch (err) {
      console.error('Error fetching seasonal costs:', err)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchSeasons()
  }, [fetchSeasons, selectedYear])

  useEffect(() => {
    fetchSpecialDates()
  }, [fetchSpecialDates])

  useEffect(() => {
    fetchSeasonalCosts()
  }, [fetchSeasonalCosts])

  // Season CRUD
  const handleSaveSeason = async () => {
    setSaving(true)
    setError(null)
    try {
      const method = editingSeason ? 'PUT' : 'POST'
      const body = editingSeason
        ? { id: editingSeason.id, ...seasonForm, year: selectedYear }
        : { ...seasonForm, year: selectedYear }

      const response = await fetch('/api/costs/seasons', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to save season')
      }

      setSuccess(editingSeason ? 'Season updated' : 'Season created')
      setShowSeasonForm(false)
      setEditingSeason(null)
      setSeasonForm({ name: '', start_date: '', end_date: '', color: '#3b82f6' })
      fetchSeasons()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save season')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSeason = async (id: string) => {
    if (!confirm('Delete this season? All associated costs will be deleted.')) return
    try {
      const response = await fetch(`/api/costs/seasons?id=${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete season')
      setSuccess('Season deleted')
      fetchSeasons()
      fetchSeasonalCosts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete season')
    }
  }

  // Special Date CRUD
  const handleSaveSpecialDate = async () => {
    setSaving(true)
    setError(null)
    try {
      const method = editingSpecialDate ? 'PUT' : 'POST'
      const body = editingSpecialDate
        ? { id: editingSpecialDate.id, ...specialDateForm }
        : specialDateForm

      const response = await fetch('/api/costs/special-dates', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to save special date')
      }

      setSuccess(editingSpecialDate ? 'Special date updated' : 'Special date created')
      setShowSpecialDateForm(false)
      setEditingSpecialDate(null)
      setSpecialDateForm({ name: '', date: '' })
      fetchSpecialDates()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save special date')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSpecialDate = async (id: string) => {
    if (!confirm('Delete this special date? All associated costs will be deleted.')) return
    try {
      const response = await fetch(`/api/costs/special-dates?id=${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete special date')
      setSuccess('Special date deleted')
      fetchSpecialDates()
      fetchSeasonalCosts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete special date')
    }
  }

  // Save seasonal costs for an activity
  const handleSaveSeasonalCosts = async (activityId: string) => {
    setSaving(true)
    setError(null)
    try {
      const activitySeasonCosts = seasonalCostForm[activityId] || {}

      for (const [seasonId, costStr] of Object.entries(activitySeasonCosts)) {
        const costAmount = parseFloat(costStr)
        if (isNaN(costAmount) || costAmount < 0) continue

        await fetch('/api/costs/seasonal-costs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activity_id: activityId,
            season_id: seasonId,
            cost_amount: costAmount
          })
        })
      }

      const activitySpecialCosts = specialDateCostForm[activityId] || {}
      for (const [specialDateId, costStr] of Object.entries(activitySpecialCosts)) {
        const costAmount = parseFloat(costStr)
        if (isNaN(costAmount) || costAmount < 0) continue

        await fetch('/api/costs/seasonal-costs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activity_id: activityId,
            special_date_id: specialDateId,
            cost_amount: costAmount
          })
        })
      }

      setSuccess('Costs saved successfully')
      fetchSeasonalCosts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save costs')
    } finally {
      setSaving(false)
    }
  }

  // Save all seasonal costs for all filtered activities
  const handleSaveAllCosts = async () => {
    setSaving(true)
    setError(null)
    try {
      let savedCount = 0

      for (const activity of filteredActivities) {
        const activitySeasonCosts = seasonalCostForm[activity.activity_id] || {}
        const activitySpecialCosts = specialDateCostForm[activity.activity_id] || {}

        // Save seasonal costs
        for (const [seasonId, costStr] of Object.entries(activitySeasonCosts)) {
          const costAmount = parseFloat(costStr)
          if (isNaN(costAmount) || costAmount < 0) continue

          await fetch('/api/costs/seasonal-costs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              activity_id: activity.activity_id,
              season_id: seasonId,
              cost_amount: costAmount
            })
          })
          savedCount++
        }

        // Save special date costs
        for (const [specialDateId, costStr] of Object.entries(activitySpecialCosts)) {
          const costAmount = parseFloat(costStr)
          if (isNaN(costAmount) || costAmount < 0) continue

          await fetch('/api/costs/seasonal-costs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              activity_id: activity.activity_id,
              special_date_id: specialDateId,
              cost_amount: costAmount
            })
          })
          savedCount++
        }
      }

      setSuccess(`All costs saved successfully (${savedCount} entries)`)
      fetchSeasonalCosts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save costs')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveResourceRates = async (
    resourceType: 'escort' | 'headphone' | 'printing',
    rateForm: Record<string, string>,
    rateType: 'daily' | 'per_pax'
  ) => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const existingRates = resourceRates.filter(r => r.resource_type === resourceType)
      const existingMap = new Map(existingRates.map(r => [r.resource_id, r]))

      for (const [resourceId, rateStr] of Object.entries(rateForm)) {
        const rateAmount = parseFloat(rateStr)
        if (isNaN(rateAmount) || rateAmount < 0) continue

        const existing = existingMap.get(resourceId)

        if (existing) {
          if (existing.rate_amount !== rateAmount) {
            const result = await resourceRatesApi.update({
              id: existing.id,
              rate_amount: rateAmount
            })
            if (result.error) throw new Error(result.error)
          }
        } else if (rateAmount > 0) {
          const result = await resourceRatesApi.create({
            resource_type: resourceType,
            resource_id: resourceId,
            rate_type: rateType,
            rate_amount: rateAmount
          })
          if (result.error) throw new Error(result.error)
        }
      }

      setSuccess(`${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} rates saved successfully`)
      fetchData()
    } catch (err) {
      console.error('Error saving rates:', err)
      setError(err instanceof Error ? err.message : 'Failed to save rates')
    } finally {
      setSaving(false)
    }
  }

  const filteredActivities = activities.filter(a => {
    const matchesSearch = a.title.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesSelection = selectedActivities.size === 0 || selectedActivities.has(a.activity_id)
    return matchesSearch && matchesSelection
  })

  const yearSeasons = seasons.filter(s => s.year === selectedYear)
  const yearSpecialDates = specialDates.filter(sd => {
    const year = new Date(sd.date).getFullYear()
    return year === selectedYear
  })

  const tabs = [
    { id: 'seasons' as TabType, label: 'Seasons', icon: Calendar, description: 'Define seasons' },
    { id: 'special-dates' as TabType, label: 'Special Dates', icon: Star, description: 'Holidays' },
    { id: 'guides' as TabType, label: 'Activity Costs', icon: Users, description: 'Per season' },
    { id: 'escorts' as TabType, label: 'Escorts', icon: UserCheck, description: 'Daily rate' },
    { id: 'headphones' as TabType, label: 'Headphones', icon: Headphones, description: 'Per pax' },
    { id: 'printing' as TabType, label: 'Printing', icon: Printer, description: 'Per pax' }
  ]

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-orange" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resource Costs Configuration</h1>
          <p className="text-gray-600 mt-1">Configure seasonal costs for guides and rates for other resources</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-brand-orange text-brand-orange'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                <span className="text-xs text-gray-400">({tab.description})</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Seasons Tab */}
        {activeTab === 'seasons' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Label>Year</Label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="border rounded-md px-3 py-2"
                >
                  {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <Button
                onClick={() => {
                  setEditingSeason(null)
                  setSeasonForm({ name: '', start_date: '', end_date: '', color: '#3b82f6' })
                  setShowSeasonForm(true)
                }}
                className="bg-brand-orange hover:bg-orange-600 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Season
              </Button>
            </div>

            {/* Season Form Modal */}
            {showSeasonForm && (
              <div className="border rounded-lg p-4 bg-gray-50 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">{editingSeason ? 'Edit Season' : 'New Season'}</h3>
                  <button onClick={() => setShowSeasonForm(false)}>
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Season Name</Label>
                    <Input
                      value={seasonForm.name}
                      onChange={(e) => setSeasonForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., High Season"
                    />
                  </div>
                  <div>
                    <Label>Color</Label>
                    <Input
                      type="color"
                      value={seasonForm.color}
                      onChange={(e) => setSeasonForm(prev => ({ ...prev, color: e.target.value }))}
                      className="h-10 w-20"
                    />
                  </div>
                  <div>
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={seasonForm.start_date}
                      onChange={(e) => setSeasonForm(prev => ({ ...prev, start_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={seasonForm.end_date}
                      onChange={(e) => setSeasonForm(prev => ({ ...prev, end_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowSeasonForm(false)}>Cancel</Button>
                  <Button
                    onClick={handleSaveSeason}
                    disabled={saving || !seasonForm.name || !seasonForm.start_date || !seasonForm.end_date}
                    className="bg-brand-orange hover:bg-orange-600 text-white"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {editingSeason ? 'Update' : 'Create'}
                  </Button>
                </div>
              </div>
            )}

            {/* Seasons List */}
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Color</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">End Date</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {yearSeasons.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        No seasons defined for {selectedYear}. Add seasons to enable seasonal pricing.
                      </td>
                    </tr>
                  ) : (
                    yearSeasons.map(season => (
                      <tr key={season.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div
                            className="w-6 h-6 rounded"
                            style={{ backgroundColor: season.color }}
                          />
                        </td>
                        <td className="px-6 py-4 font-medium">{season.name}</td>
                        <td className="px-6 py-4">{format(new Date(season.start_date), 'dd/MM/yyyy')}</td>
                        <td className="px-6 py-4">{format(new Date(season.end_date), 'dd/MM/yyyy')}</td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              setEditingSeason(season)
                              setSeasonForm({
                                name: season.name,
                                start_date: season.start_date,
                                end_date: season.end_date,
                                color: season.color
                              })
                              setShowSeasonForm(true)
                            }}
                            className="text-blue-600 hover:text-blue-800 mr-3"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteSeason(season.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Special Dates Tab */}
        {activeTab === 'special-dates' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Special dates override seasonal pricing. Define holidays like Christmas, Easter, etc.
              </div>
              <Button
                onClick={() => {
                  setEditingSpecialDate(null)
                  setSpecialDateForm({ name: '', date: '' })
                  setShowSpecialDateForm(true)
                }}
                className="bg-brand-orange hover:bg-orange-600 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Special Date
              </Button>
            </div>

            {/* Special Date Form */}
            {showSpecialDateForm && (
              <div className="border rounded-lg p-4 bg-gray-50 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">{editingSpecialDate ? 'Edit Special Date' : 'New Special Date'}</h3>
                  <button onClick={() => setShowSpecialDateForm(false)}>
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={specialDateForm.name}
                      onChange={(e) => setSpecialDateForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Christmas Day"
                    />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={specialDateForm.date}
                      onChange={(e) => setSpecialDateForm(prev => ({ ...prev, date: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowSpecialDateForm(false)}>Cancel</Button>
                  <Button
                    onClick={handleSaveSpecialDate}
                    disabled={saving || !specialDateForm.name || !specialDateForm.date}
                    className="bg-brand-orange hover:bg-orange-600 text-white"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {editingSpecialDate ? 'Update' : 'Create'}
                  </Button>
                </div>
              </div>
            )}

            {/* Special Dates List */}
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {specialDates.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                        No special dates defined. Add special dates for holidays with unique pricing.
                      </td>
                    </tr>
                  ) : (
                    specialDates.map(sd => (
                      <tr key={sd.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium">{sd.name}</td>
                        <td className="px-6 py-4">{format(new Date(sd.date), 'dd/MM/yyyy')}</td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              setEditingSpecialDate(sd)
                              setSpecialDateForm({ name: sd.name, date: sd.date })
                              setShowSpecialDateForm(true)
                            }}
                            className="text-blue-600 hover:text-blue-800 mr-3"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteSpecialDate(sd.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Activity Costs Tab (Seasonal) */}
        {activeTab === 'guides' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Set costs per activity for each season. Special date costs override seasonal costs.
              </div>
              <div className="flex items-center gap-4">
                <Label>Year</Label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="border rounded-md px-3 py-2"
                >
                  {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Activity Filter Drawer */}
            {showActivityFilter && (
              <div className="fixed inset-0 z-50 overflow-hidden">
                <div className="absolute inset-0 bg-black/50" onClick={() => setShowActivityFilter(false)} />
                <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-xl flex flex-col">
                  <div className="p-4 border-b flex items-center justify-between bg-gray-50">
                    <h3 className="text-lg font-semibold">Filter Activities</h3>
                    <button onClick={() => setShowActivityFilter(false)} className="p-1 hover:bg-gray-200 rounded">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="p-4 border-b">
                    <div className="flex gap-2 mb-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedActivities(new Set(activities.map(a => a.activity_id)))}
                      >
                        Select All
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedActivities(new Set())}
                      >
                        Clear All
                      </Button>
                    </div>
                    <div className="text-sm font-medium text-green-600 mb-1">
                      {selectedActivities.size === 0
                        ? 'Showing all activities'
                        : `${selectedActivities.size} activities selected`}
                    </div>
                    <p className="text-xs text-gray-500">
                      {selectedActivities.size === 0
                        ? 'Select activities to filter the table'
                        : 'Only selected activities will be shown'}
                    </p>
                  </div>
                  <div className="p-3 border-b">
                    <Input
                      type="text"
                      placeholder="Search activities..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="text-xs text-gray-500 px-4 py-2 bg-gray-50 border-b">
                    Activities ({activities.filter(a => a.title.toLowerCase().includes(searchTerm.toLowerCase())).length} of {activities.length})
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {activities
                      .filter(a => a.title.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map(activity => (
                        <label
                          key={activity.activity_id}
                          className={`flex items-start px-4 py-3 hover:bg-gray-50 cursor-pointer border-b ${
                            selectedActivities.has(activity.activity_id) ? 'bg-orange-50' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedActivities.has(activity.activity_id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedActivities)
                              if (e.target.checked) {
                                newSet.add(activity.activity_id)
                              } else {
                                newSet.delete(activity.activity_id)
                              }
                              setSelectedActivities(newSet)
                            }}
                            className="mt-1 mr-3 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm">{activity.title}</div>
                            <div className="text-xs text-gray-400">ID: {activity.activity_id}</div>
                          </div>
                        </label>
                      ))}
                  </div>
                  <div className="p-4 border-t bg-gray-50">
                    <Button
                      onClick={() => setShowActivityFilter(false)}
                      className="w-full bg-brand-orange hover:bg-orange-600 text-white"
                    >
                      Done
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowActivityFilter(true)}
                  className="flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-gray-50"
                >
                  <Settings className="h-4 w-4" />
                  <span className="text-sm">
                    {selectedActivities.size === 0
                      ? 'All activities'
                      : `${selectedActivities.size} selected`}
                  </span>
                </button>
                {selectedActivities.size > 0 && (
                  <button
                    onClick={() => setSelectedActivities(new Set())}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Clear filter
                  </button>
                )}
              </div>
              <Button
                onClick={handleSaveAllCosts}
                disabled={saving || filteredActivities.length === 0}
                className="bg-brand-orange hover:bg-orange-600 text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save All ({filteredActivities.length})
              </Button>
            </div>

            <div>

            {yearSeasons.length === 0 && yearSpecialDates.length === 0 ? (
              <div className="text-center py-8 text-gray-500 border rounded-lg">
                No seasons or special dates defined for {selectedYear}. Please add seasons or special dates first.
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">
                        Activity
                      </th>
                      {yearSeasons.map(season => (
                        <th key={season.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase min-w-[120px]">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-3 h-3 rounded" style={{ backgroundColor: season.color }} />
                            {season.name}
                          </div>
                        </th>
                      ))}
                      {yearSpecialDates.length > 0 && (
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-l-2 min-w-[120px]">
                          Special Dates
                        </th>
                      )}
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-24">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredActivities.map(activity => (
                      <tr key={activity.activity_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 sticky left-0 bg-white">
                          {activity.title}
                        </td>
                        {yearSeasons.map(season => (
                          <td key={season.id} className="px-4 py-3 text-center">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={seasonalCostForm[activity.activity_id]?.[season.id] || ''}
                              onChange={(e) => setSeasonalCostForm(prev => ({
                                ...prev,
                                [activity.activity_id]: {
                                  ...prev[activity.activity_id],
                                  [season.id]: e.target.value
                                }
                              }))}
                              className="w-24 mx-auto"
                            />
                          </td>
                        ))}
                        {yearSpecialDates.length > 0 && (
                          <td className="px-4 py-3 border-l-2 text-center">
                            <div className="flex flex-col gap-1 items-center">
                              {yearSpecialDates.map(sd => (
                                <div key={sd.id} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 w-16 truncate text-right" title={sd.name}>
                                    {sd.name}:
                                  </span>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={specialDateCostForm[activity.activity_id]?.[sd.id] || ''}
                                    onChange={(e) => setSpecialDateCostForm(prev => ({
                                      ...prev,
                                      [activity.activity_id]: {
                                        ...prev[activity.activity_id],
                                        [sd.id]: e.target.value
                                      }
                                    }))}
                                    className="w-20"
                                  />
                                </div>
                              ))}
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-3 text-center">
                          <Button
                            size="sm"
                            onClick={() => handleSaveSeasonalCosts(activity.activity_id)}
                            disabled={saving}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </div>
          </div>
        )}

        {/* Escorts Tab */}
        {activeTab === 'escorts' && (
          <div className="space-y-6">
            <div className="text-sm text-gray-600 mb-4">
              Set the daily flat rate for each escort. This rate applies regardless of the number of services they perform in a day.
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Escort</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-40">Daily Rate (EUR)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {escorts.map(escort => (
                    <tr key={escort.escort_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {escort.first_name} {escort.last_name}
                      </td>
                      <td className="px-6 py-4">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={escortRateForm[escort.escort_id] || ''}
                          onChange={(e) => setEscortRateForm(prev => ({
                            ...prev,
                            [escort.escort_id]: e.target.value
                          }))}
                          className="w-32"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => handleSaveResourceRates('escort', escortRateForm, 'daily')}
                disabled={saving}
                className="bg-brand-orange hover:bg-orange-600 text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Escort Rates
              </Button>
            </div>
          </div>
        )}

        {/* Headphones Tab */}
        {activeTab === 'headphones' && (
          <div className="space-y-6">
            <div className="text-sm text-gray-600 mb-4">
              Set the per-passenger rate for each headphone provider. The total cost will be calculated as: rate × number of passengers.
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Headphone Provider</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-40">Per Pax Rate (EUR)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {headphones.map(hp => (
                    <tr key={hp.headphone_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{hp.name}</td>
                      <td className="px-6 py-4">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={headphoneRateForm[hp.headphone_id] || ''}
                          onChange={(e) => setHeadphoneRateForm(prev => ({
                            ...prev,
                            [hp.headphone_id]: e.target.value
                          }))}
                          className="w-32"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => handleSaveResourceRates('headphone', headphoneRateForm, 'per_pax')}
                disabled={saving}
                className="bg-brand-orange hover:bg-orange-600 text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Headphone Rates
              </Button>
            </div>
          </div>
        )}

        {/* Printing Tab */}
        {activeTab === 'printing' && (
          <div className="space-y-6">
            <div className="text-sm text-gray-600 mb-4">
              Set the per-passenger rate for each printing provider. The total cost will be calculated as: rate × number of passengers.
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Printing Provider</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-40">Per Pax Rate (EUR)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {printing.map(p => (
                    <tr key={p.printing_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{p.name}</td>
                      <td className="px-6 py-4">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={printingRateForm[p.printing_id] || ''}
                          onChange={(e) => setPrintingRateForm(prev => ({
                            ...prev,
                            [p.printing_id]: e.target.value
                          }))}
                          className="w-32"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => handleSaveResourceRates('printing', printingRateForm, 'per_pax')}
                disabled={saving}
                className="bg-brand-orange hover:bg-orange-600 text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Printing Rates
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
