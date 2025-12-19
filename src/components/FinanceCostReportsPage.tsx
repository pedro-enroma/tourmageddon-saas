'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { costReportsApi, CostReportResponse, ProfitabilityReportResponse, guidesApi } from '@/lib/api-client'
import { Loader2, Download, TrendingUp, Users, DollarSign, PieChart, BarChart3, FileText, Search, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import * as XLSX from 'xlsx'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell
} from 'recharts'

type ReportType = 'staff-costs' | 'profitability' | 'staff-details'
type GroupBy = 'staff' | 'date' | 'activity'

interface Guide {
  guide_id: string
  first_name: string
  last_name: string
  active: boolean
}

interface StaffDetailItem {
  date: string
  time: string
  activity: string
  cost: number
}

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#06b6d4', '#84cc16', '#f43f5e']

export default function FinanceCostReportsPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Report type
  const [reportType, setReportType] = useState<ReportType>('staff-costs')

  // Filters
  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setDate(1) // First day of current month
    return date.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => {
    const date = new Date()
    date.setMonth(date.getMonth() + 1)
    date.setDate(0) // Last day of current month
    return date.toISOString().split('T')[0]
  })
  const [groupBy, setGroupBy] = useState<GroupBy>('staff')
  const [resourceTypes, setResourceTypes] = useState<string[]>(['guide', 'escort', 'headphone', 'printing'])

  // Staff details specific state
  const [guides, setGuides] = useState<Guide[]>([])
  const [selectedGuideId, setSelectedGuideId] = useState<string>('')
  const [staffDetails, setStaffDetails] = useState<StaffDetailItem[]>([])
  const [guideSearch, setGuideSearch] = useState('')
  const [showGuideDropdown, setShowGuideDropdown] = useState(false)
  const guideDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (guideDropdownRef.current && !guideDropdownRef.current.contains(event.target as Node)) {
        setShowGuideDropdown(false)
        setGuideSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Data
  const [costReport, setCostReport] = useState<CostReportResponse | null>(null)
  const [profitabilityReport, setProfitabilityReport] = useState<ProfitabilityReportResponse | null>(null)

  // Fetch guides on mount
  useEffect(() => {
    const fetchGuides = async () => {
      const result = await guidesApi.list()
      if (result.data) {
        setGuides(result.data.filter(g => g.active).sort((a, b) =>
          `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
        ))
      }
    }
    fetchGuides()
  }, [])

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      if (reportType === 'staff-costs') {
        const result = await costReportsApi.resourceCosts({
          start_date: startDate,
          end_date: endDate,
          resource_types: resourceTypes,
          group_by: groupBy
        })
        if (result.error) throw new Error(result.error)
        setCostReport(result.data || null)
        setProfitabilityReport(null)
        setStaffDetails([])
      } else if (reportType === 'profitability') {
        const result = await costReportsApi.profitability({
          start_date: startDate,
          end_date: endDate,
          group_by: groupBy === 'staff' ? 'activity' : groupBy
        })
        if (result.error) throw new Error(result.error)
        setProfitabilityReport(result.data || null)
        setCostReport(null)
        setStaffDetails([])
      } else if (reportType === 'staff-details') {
        if (!selectedGuideId) {
          setError('Please select a staff member')
          setLoading(false)
          return
        }
        // Fetch detailed costs for the selected guide
        const result = await costReportsApi.resourceCosts({
          start_date: startDate,
          end_date: endDate,
          resource_types: ['guide'],
          group_by: 'date'
        })
        if (result.error) throw new Error(result.error)

        // Filter items for the selected guide
        const guideItems = (result.data?.items || [])
          .filter(item => item.resource_id === selectedGuideId)
          .map(item => ({
            date: item.date,
            time: item.activity_title?.includes(':') ? item.activity_title.split(' ')[0] : '-',
            activity: item.activity_title || '-',
            cost: item.cost_amount
          }))
          .sort((a, b) => a.date.localeCompare(b.date))

        setStaffDetails(guideItems)
        setCostReport(null)
        setProfitabilityReport(null)
      }
    } catch (err) {
      console.error('Error fetching report:', err)
      setError(err instanceof Error ? err.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [reportType, startDate, endDate, resourceTypes, groupBy, selectedGuideId])

  const toggleResourceType = (type: string) => {
    setResourceTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  // Export detailed sheets per staff member
  const exportDetailsPerStaff = () => {
    if (!costReport) return

    const wb = XLSX.utils.book_new()

    // Group items by staff member
    const itemsByStaff = new Map<string, typeof costReport.items>()
    costReport.items.forEach(item => {
      const key = `${item.resource_type}:${item.resource_id}`
      if (!itemsByStaff.has(key)) {
        itemsByStaff.set(key, [])
      }
      itemsByStaff.get(key)!.push(item)
    })

    // Create a sheet for each staff member
    costReport.summaries.forEach(summary => {
      const items = itemsByStaff.get(summary.key) || []
      if (items.length === 0) return

      const sheetData = items
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(item => ({
          'Date': item.date,
          'Activity': item.activity_title || '-',
          'Cost (EUR)': item.cost_amount.toFixed(2)
        }))

      // Add total row
      sheetData.push({
        'Date': 'TOTAL',
        'Activity': `${items.length} services`,
        'Cost (EUR)': summary.total_cost.toFixed(2)
      })

      const sheet = XLSX.utils.json_to_sheet(sheetData)

      // Clean sheet name (max 31 chars, no special chars)
      const sheetName = summary.label
        .replace(/[\\/*?:[\]]/g, '')
        .substring(0, 31)

      XLSX.utils.book_append_sheet(wb, sheet, sheetName)
    })

    const filename = `staff-details-${startDate}-to-${endDate}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new()

    if (reportType === 'staff-costs' && costReport) {
      // Summary sheet
      const summaryData = costReport.summaries.map(s => ({
        'Name': s.label,
        'Services': s.count,
        'Total Cost (EUR)': s.total_cost.toFixed(2)
      }))
      summaryData.push({
        'Name': 'TOTAL',
        'Services': costReport.summaries.reduce((sum, s) => sum + s.count, 0),
        'Total Cost (EUR)': costReport.total_cost.toFixed(2)
      })
      const summarySheet = XLSX.utils.json_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

      // Detail sheet
      const detailData = costReport.items.map(item => ({
        'Date': item.date,
        'Resource Type': item.resource_type,
        'Resource Name': item.resource_name,
        'Activity': item.activity_title || '-',
        'Pax': item.pax_count || '-',
        'Cost (EUR)': item.cost_amount.toFixed(2),
        'Grouped': item.is_grouped ? 'Yes' : 'No'
      }))
      const detailSheet = XLSX.utils.json_to_sheet(detailData)
      XLSX.utils.book_append_sheet(wb, detailSheet, 'Details')
    } else if (reportType === 'profitability' && profitabilityReport) {
      const data = profitabilityReport.items.map(item => ({
        'Name': item.label,
        'Revenue (EUR)': item.revenue.toFixed(2),
        'Guide Costs (EUR)': item.guide_costs.toFixed(2),
        'Escort Costs (EUR)': item.escort_costs.toFixed(2),
        'Headphone Costs (EUR)': item.headphone_costs.toFixed(2),
        'Printing Costs (EUR)': item.printing_costs.toFixed(2),
        'Total Costs (EUR)': item.total_costs.toFixed(2),
        'Profit (EUR)': item.profit.toFixed(2),
        'Margin (%)': item.margin.toFixed(1),
        'Bookings': item.booking_count,
        'Pax': item.pax_count
      }))
      data.push({
        'Name': 'TOTAL',
        'Revenue (EUR)': profitabilityReport.totals.revenue.toFixed(2),
        'Guide Costs (EUR)': profitabilityReport.totals.guide_costs.toFixed(2),
        'Escort Costs (EUR)': profitabilityReport.totals.escort_costs.toFixed(2),
        'Headphone Costs (EUR)': profitabilityReport.totals.headphone_costs.toFixed(2),
        'Printing Costs (EUR)': profitabilityReport.totals.printing_costs.toFixed(2),
        'Total Costs (EUR)': profitabilityReport.totals.total_costs.toFixed(2),
        'Profit (EUR)': profitabilityReport.totals.profit.toFixed(2),
        'Margin (%)': profitabilityReport.totals.margin.toFixed(1),
        'Bookings': profitabilityReport.totals.booking_count,
        'Pax': profitabilityReport.totals.pax_count
      })
      const sheet = XLSX.utils.json_to_sheet(data)
      XLSX.utils.book_append_sheet(wb, sheet, 'Profitability')
    } else if (reportType === 'staff-details' && staffDetails.length > 0) {
      const selectedGuide = guides.find(g => g.guide_id === selectedGuideId)
      const guideName = selectedGuide ? `${selectedGuide.first_name} ${selectedGuide.last_name}` : 'Staff'

      const data = staffDetails.map(item => ({
        'Date': item.date,
        'Activity': item.activity,
        'Cost (EUR)': item.cost.toFixed(2)
      }))
      data.push({
        'Date': 'TOTAL',
        'Activity': `${staffDetails.length} services`,
        'Cost (EUR)': staffDetails.reduce((sum, item) => sum + item.cost, 0).toFixed(2)
      })
      const sheet = XLSX.utils.json_to_sheet(data)
      XLSX.utils.book_append_sheet(wb, sheet, guideName.substring(0, 31))
    }

    const filename = `${reportType}-report-${startDate}-to-${endDate}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // Chart data for staff costs
  const costChartData = useMemo(() => {
    if (!costReport) return []
    return costReport.summaries.slice(0, 10).map(s => ({
      name: s.label.length > 20 ? s.label.substring(0, 20) + '...' : s.label,
      cost: s.total_cost
    }))
  }, [costReport])

  // Chart data for profitability
  const profitChartData = useMemo(() => {
    if (!profitabilityReport) return []
    return profitabilityReport.items.slice(0, 10).map(item => ({
      name: item.label.length > 20 ? item.label.substring(0, 20) + '...' : item.label,
      revenue: item.revenue,
      costs: item.total_costs,
      profit: item.profit
    }))
  }, [profitabilityReport])

  // Pie chart data for cost breakdown
  const costBreakdownData = useMemo(() => {
    if (!profitabilityReport) return []
    const { totals } = profitabilityReport
    return [
      { name: 'Guides', value: totals.guide_costs },
      { name: 'Escorts', value: totals.escort_costs },
      { name: 'Headphones', value: totals.headphone_costs },
      { name: 'Printing', value: totals.printing_costs }
    ].filter(d => d.value > 0)
  }, [profitabilityReport])

  // Staff details totals
  const staffDetailsTotals = useMemo(() => {
    return {
      services: staffDetails.length,
      totalCost: staffDetails.reduce((sum, item) => sum + item.cost, 0)
    }
  }, [staffDetails])

  // Filtered guides based on search
  const filteredGuides = useMemo(() => {
    if (!guideSearch.trim()) return guides
    const search = guideSearch.toLowerCase()
    return guides.filter(g =>
      `${g.first_name} ${g.last_name}`.toLowerCase().includes(search)
    )
  }, [guides, guideSearch])

  // Get selected guide name
  const selectedGuideName = useMemo(() => {
    const guide = guides.find(g => g.guide_id === selectedGuideId)
    return guide ? `${guide.first_name} ${guide.last_name}` : ''
  }, [guides, selectedGuideId])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cost Reports</h1>
          <p className="text-gray-600 mt-1">Analyze resource costs and profitability</p>
        </div>
        {(costReport || profitabilityReport || staffDetails.length > 0) && (
          <Button onClick={exportToExcel} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export to Excel
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Report Type Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setReportType('staff-costs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            reportType === 'staff-costs'
              ? 'bg-brand-orange text-white border-brand-orange'
              : 'bg-white text-gray-700 border-gray-200 hover:border-brand-orange'
          }`}
        >
          <Users className="h-4 w-4" />
          Staff Costs
        </button>
        <button
          onClick={() => setReportType('profitability')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            reportType === 'profitability'
              ? 'bg-brand-orange text-white border-brand-orange'
              : 'bg-white text-gray-700 border-gray-200 hover:border-brand-orange'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Profitability
        </button>
        <button
          onClick={() => setReportType('staff-details')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            reportType === 'staff-details'
              ? 'bg-brand-orange text-white border-brand-orange'
              : 'bg-white text-gray-700 border-gray-200 hover:border-brand-orange'
          }`}
        >
          <FileText className="h-4 w-4" />
          Staff Details
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date Range */}
          <div>
            <Label htmlFor="start-date" className="text-sm font-medium text-gray-700">From</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="end-date" className="text-sm font-medium text-gray-700">To</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Staff Details: Guide Selector with Search */}
          {reportType === 'staff-details' && (
            <div className="md:col-span-2 relative" ref={guideDropdownRef}>
              <Label className="text-sm font-medium text-gray-700">Staff Member</Label>
              <div className="mt-1 relative">
                <button
                  type="button"
                  onClick={() => setShowGuideDropdown(!showGuideDropdown)}
                  className="w-full flex items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
                >
                  <span className={selectedGuideId ? 'text-gray-900' : 'text-gray-500'}>
                    {selectedGuideName || 'Select a guide...'}
                  </span>
                  <div className="flex items-center gap-1">
                    {selectedGuideId && (
                      <X
                        className="h-4 w-4 text-gray-400 hover:text-gray-600"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedGuideId('')
                        }}
                      />
                    )}
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showGuideDropdown ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Dropdown */}
                {showGuideDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
                    {/* Search Input */}
                    <div className="p-2 border-b border-gray-100">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search guides..."
                          value={guideSearch}
                          onChange={(e) => setGuideSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
                          autoFocus
                        />
                      </div>
                    </div>

                    {/* Options List */}
                    <div className="max-h-60 overflow-y-auto">
                      {filteredGuides.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-gray-500 text-center">
                          No guides found
                        </div>
                      ) : (
                        filteredGuides.map(guide => (
                          <button
                            key={guide.guide_id}
                            type="button"
                            onClick={() => {
                              setSelectedGuideId(guide.guide_id)
                              setShowGuideDropdown(false)
                              setGuideSearch('')
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-orange-50 ${
                              selectedGuideId === guide.guide_id ? 'bg-orange-50 text-brand-orange font-medium' : 'text-gray-700'
                            }`}
                          >
                            {guide.first_name} {guide.last_name}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Staff Costs: Group By */}
          {reportType === 'staff-costs' && (
            <div>
              <Label htmlFor="group-by" className="text-sm font-medium text-gray-700">Group By</Label>
              <select
                id="group-by"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
              >
                <option value="staff">Staff Member</option>
                <option value="date">Date</option>
                <option value="activity">Activity</option>
              </select>
            </div>
          )}

          {/* Profitability: Group By */}
          {reportType === 'profitability' && (
            <div>
              <Label htmlFor="group-by" className="text-sm font-medium text-gray-700">Group By</Label>
              <select
                id="group-by"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
              >
                <option value="date">Date</option>
                <option value="activity">Activity</option>
              </select>
            </div>
          )}
        </div>

        {/* Resource Types for Staff Costs */}
        {reportType === 'staff-costs' && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <Label className="text-sm font-medium text-gray-700 mb-2 block">Resource Types</Label>
            <div className="flex flex-wrap gap-3">
              <label
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                  resourceTypes.includes('guide')
                    ? 'bg-orange-50 border-orange-300 text-orange-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                <Checkbox
                  checked={resourceTypes.includes('guide')}
                  onCheckedChange={() => toggleResourceType('guide')}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">Guides</span>
              </label>
              <label
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                  resourceTypes.includes('escort')
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                <Checkbox
                  checked={resourceTypes.includes('escort')}
                  onCheckedChange={() => toggleResourceType('escort')}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">Escorts</span>
              </label>
              <label
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                  resourceTypes.includes('headphone')
                    ? 'bg-purple-50 border-purple-300 text-purple-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                <Checkbox
                  checked={resourceTypes.includes('headphone')}
                  onCheckedChange={() => toggleResourceType('headphone')}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">Headphones</span>
              </label>
              <label
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                  resourceTypes.includes('printing')
                    ? 'bg-cyan-50 border-cyan-300 text-cyan-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                <Checkbox
                  checked={resourceTypes.includes('printing')}
                  onCheckedChange={() => toggleResourceType('printing')}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">Printing</span>
              </label>
            </div>
          </div>
        )}

        {/* Generate Button */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <Button
            onClick={fetchReport}
            disabled={loading}
            className="bg-brand-orange hover:bg-orange-600 text-white"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <BarChart3 className="h-4 w-4 mr-2" />
            )}
            Generate Report
          </Button>
        </div>
      </div>

      {/* Staff Costs Report */}
      {reportType === 'staff-costs' && costReport && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-brand-orange" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Total Cost</div>
                  <div className="text-2xl font-bold text-gray-900">
                    €{costReport.total_cost.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Resources</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {costReport.summaries.length}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Total Services</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {costReport.items.length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chart */}
          {costChartData.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 mb-4">Cost Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={costChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={12} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `€${value.toFixed(2)}`} />
                  <Bar dataKey="cost" fill="#f97316" name="Cost (EUR)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Summary Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Cost Summary</h3>
              <Button
                onClick={exportDetailsPerStaff}
                variant="outline"
                size="sm"
                className="text-sm"
              >
                <FileText className="h-4 w-4 mr-2" />
                Export Details
              </Button>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Services
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Cost (EUR)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {costReport.summaries.map(summary => (
                  <tr key={summary.key} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {summary.label}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      {summary.count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                      €{summary.total_cost.toFixed(2)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    TOTAL
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {costReport.summaries.reduce((sum, s) => sum + s.count, 0)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-brand-orange text-right">
                    €{costReport.total_cost.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Profitability Report */}
      {reportType === 'profitability' && profitabilityReport && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Revenue</div>
                  <div className="text-2xl font-bold text-gray-900">
                    €{profitabilityReport.totals.revenue.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Total Costs</div>
                  <div className="text-2xl font-bold text-gray-900">
                    €{profitabilityReport.totals.total_costs.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Profit</div>
                  <div className={`text-2xl font-bold ${
                    profitabilityReport.totals.profit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    €{profitabilityReport.totals.profit.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <PieChart className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Margin</div>
                  <div className={`text-2xl font-bold ${
                    profitabilityReport.totals.margin >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {profitabilityReport.totals.margin.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue vs Costs Chart */}
            {profitChartData.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="font-medium text-gray-900 mb-4">Revenue vs Costs</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={profitChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={12} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `€${value.toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" />
                    <Bar dataKey="costs" fill="#ef4444" name="Costs" />
                    <Bar dataKey="profit" fill="#22c55e" name="Profit" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Cost Breakdown Pie Chart */}
            {costBreakdownData.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="font-medium text-gray-900 mb-4">Cost Breakdown by Resource Type</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={costBreakdownData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={((props: unknown) => {
                        const { name, percent } = props as { name: string; percent: number }
                        return `${name} ${(percent * 100).toFixed(0)}%`
                      }) as React.ComponentProps<typeof Pie>['label']}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {costBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `€${value.toFixed(2)}`} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Profitability Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="font-medium text-gray-900">Profitability by {groupBy === 'date' ? 'Date' : 'Activity'}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Revenue
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Guide
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Escort
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      HP
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Print
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Cost
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Profit
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Margin
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {profitabilityReport.items.map(item => (
                    <tr key={item.key} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {item.label}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                        €{item.revenue.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                        €{item.guide_costs.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                        €{item.escort_costs.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                        €{item.headphone_costs.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                        €{item.printing_costs.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-red-600 text-right">
                        €{item.total_costs.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium text-right ${
                        item.profit >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        €{item.profit.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium text-right ${
                        item.margin >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {item.margin.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      TOTAL
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                      €{profitabilityReport.totals.revenue.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                      €{profitabilityReport.totals.guide_costs.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                      €{profitabilityReport.totals.escort_costs.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                      €{profitabilityReport.totals.headphone_costs.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                      €{profitabilityReport.totals.printing_costs.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-red-600 text-right">
                      €{profitabilityReport.totals.total_costs.toFixed(2)}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm font-bold text-right ${
                      profitabilityReport.totals.profit >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      €{profitabilityReport.totals.profit.toFixed(2)}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm font-bold text-right ${
                      profitabilityReport.totals.margin >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {profitabilityReport.totals.margin.toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Staff Details Report */}
      {reportType === 'staff-details' && staffDetails.length > 0 && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Total Services</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {staffDetailsTotals.services}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-brand-orange" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">Total Cost</div>
                  <div className="text-2xl font-bold text-gray-900">
                    €{staffDetailsTotals.totalCost.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Details Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="font-medium text-gray-900">
                Service Details - {guides.find(g => g.guide_id === selectedGuideId)?.first_name} {guides.find(g => g.guide_id === selectedGuideId)?.last_name}
              </h3>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Activity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost (EUR)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {staffDetails.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.activity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                      €{item.cost.toFixed(2)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    TOTAL
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {staffDetailsTotals.services} services
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-brand-orange text-right">
                    €{staffDetailsTotals.totalCost.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !costReport && !profitabilityReport && staffDetails.length === 0 && (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
          <BarChart3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p>Select filters and click &quot;Generate Report&quot; to view cost data</p>
        </div>
      )}
    </div>
  )
}
