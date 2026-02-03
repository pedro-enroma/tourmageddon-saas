"use client"

import * as React from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { Calendar, ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react"
import { DatePicker } from "@/components/ui/date-picker"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type DateRangeType = 'last7days' | 'last30days' | 'lastMonth' | 'yearToDate' | 'custom'

interface SummaryData {
  total_bookings: number
  total_confirmed: number
  total_cancelled: number
  cancellation_rate: number
  cancelled_pax: number
  confirmed_pax: number
  cancelled_revenue: number
}

interface MonthData {
  month: string
  month_label: string
  confirmed: number
  cancelled: number
  total: number
  cancellation_rate: number
  cancelled_pax: number
  confirmed_pax: number
  cancelled_revenue: number
}

interface TourData {
  activity_id: string
  title: string
  confirmed: number
  cancelled: number
  total: number
  cancellation_rate: number
  cancelled_revenue: number
}

export default function CancellationRatePage() {
  const [summary, setSummary] = React.useState<SummaryData | null>(null)
  const [monthlyData, setMonthlyData] = React.useState<MonthData[]>([])
  const [tourData, setTourData] = React.useState<TourData[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dateRange, setDateRange] = React.useState<DateRangeType>('lastMonth')
  const [customStartDate, setCustomStartDate] = React.useState<Date>()
  const [customEndDate, setCustomEndDate] = React.useState<Date>()
  const [isDateDropdownOpen, setIsDateDropdownOpen] = React.useState(false)
  const [isExportDropdownOpen, setIsExportDropdownOpen] = React.useState(false)

  const getDateRange = React.useCallback(() => {
    const now = new Date()
    let startDate: Date
    let endDate = new Date()

    switch (dateRange) {
      case 'last7days':
        startDate = new Date(now)
        startDate.setDate(startDate.getDate() - 6)
        break
      case 'last30days':
        startDate = new Date(now)
        startDate.setDate(startDate.getDate() - 29)
        break
      case 'lastMonth':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        endDate = new Date(now.getFullYear(), now.getMonth(), 0)
        break
      case 'yearToDate':
        startDate = new Date(now.getFullYear(), 0, 1)
        break
      case 'custom':
        if (!customStartDate || !customEndDate) return null
        startDate = customStartDate
        endDate = customEndDate
        break
      default:
        startDate = new Date(now)
        startDate.setDate(startDate.getDate() - 29)
    }

    const formatDate = (d: Date) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    }
  }, [dateRange, customStartDate, customEndDate])

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true)
      const range = getDateRange()
      if (!range) return

      const response = await fetch(`/api/reports/cancellation-rate?start_date=${range.startDate}&end_date=${range.endDate}`)
      if (!response.ok) throw new Error('Failed to fetch data')

      const data = await response.json()
      setSummary(data.summary)
      setMonthlyData(data.by_month)
      setTourData(data.by_tour)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }, [getDateRange])

  React.useEffect(() => {
    if (dateRange !== 'custom' || (customStartDate && customEndDate)) {
      loadData()
    }
  }, [dateRange, customStartDate, customEndDate, loadData])

  const getDateRangeLabel = () => {
    switch (dateRange) {
      case 'last7days': return 'Ultimi 7 giorni'
      case 'last30days': return 'Ultimi 30 giorni'
      case 'lastMonth': return 'Ultimo mese'
      case 'yearToDate': return 'Anno corrente'
      case 'custom':
        if (customStartDate && customEndDate) {
          return `${customStartDate.toLocaleDateString('it-IT')} - ${customEndDate.toLocaleDateString('it-IT')}`
        }
        return 'Personalizzato'
      default: return 'Seleziona periodo'
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value)
  }

  const exportToCSV = () => {
    const headers = ['Mese', 'Confermate', 'Cancellate', 'Totale', 'Tasso Cancellazione (%)', 'Pax Cancellati', 'Revenue Perso']
    const rows = monthlyData.map(month => [
      month.month_label,
      month.confirmed,
      month.cancelled,
      month.total,
      month.cancellation_rate.toFixed(2),
      month.cancelled_pax,
      month.cancelled_revenue.toFixed(2)
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `cancellation_rate_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setIsExportDropdownOpen(false)
  }

  const exportToExcel = async () => {
    try {
      const XLSX = (await import('xlsx')).default
      const wsData = [
        ['Report Tasso di Cancellazione'],
        ['Periodo: ' + getDateRangeLabel()],
        [],
        ['Mese', 'Confermate', 'Cancellate', 'Totale', 'Tasso Cancellazione (%)', 'Pax Cancellati', 'Revenue Perso'],
        ...monthlyData.map(month => [
          month.month_label,
          month.confirmed,
          month.cancelled,
          month.total,
          month.cancellation_rate.toFixed(2) + '%',
          month.cancelled_pax,
          formatCurrency(month.cancelled_revenue)
        ])
      ]

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      ws['!cols'] = [
        { wch: 20 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 20 },
        { wch: 15 },
        { wch: 15 }
      ]
      XLSX.utils.book_append_sheet(wb, ws, 'Tasso Cancellazione')
      XLSX.writeFile(wb, `cancellation_rate_${new Date().toISOString().split('T')[0]}.xlsx`)
      setIsExportDropdownOpen(false)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Caricamento dati...</div>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Nessun dato disponibile</div>
      </div>
    )
  }

  // Totals for tables
  const monthlyTotals = {
    confirmed: monthlyData.reduce((sum, m) => sum + m.confirmed, 0),
    cancelled: monthlyData.reduce((sum, m) => sum + m.cancelled, 0),
    total: monthlyData.reduce((sum, m) => sum + m.total, 0),
    cancelled_pax: monthlyData.reduce((sum, m) => sum + m.cancelled_pax, 0),
    confirmed_pax: monthlyData.reduce((sum, m) => sum + m.confirmed_pax, 0),
    cancelled_revenue: monthlyData.reduce((sum, m) => sum + m.cancelled_revenue, 0)
  }

  const tourTotals = {
    confirmed: tourData.reduce((sum, t) => sum + t.confirmed, 0),
    cancelled: tourData.reduce((sum, t) => sum + t.cancelled, 0),
    total: tourData.reduce((sum, t) => sum + t.total, 0),
    cancelled_revenue: tourData.reduce((sum, t) => sum + t.cancelled_revenue, 0)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Tasso di Cancellazione</h1>
          <p className="text-gray-600">Analisi delle prenotazioni cancellate vs confermate</p>
        </div>

        <div className="flex gap-2">
          <div className="relative">
            <button
              onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 text-sm border rounded-md bg-white hover:bg-gray-50"
            >
              <Calendar className="h-4 w-4" />
              <span>{getDateRangeLabel()}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isDateDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDateDropdownOpen && (
              <div className="absolute right-0 z-10 mt-1 w-48 bg-white border rounded-md shadow-lg">
                <button onClick={() => { setDateRange('last7days'); setIsDateDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100">Ultimi 7 giorni</button>
                <button onClick={() => { setDateRange('last30days'); setIsDateDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100">Ultimi 30 giorni</button>
                <button onClick={() => { setDateRange('lastMonth'); setIsDateDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100">Ultimo mese</button>
                <button onClick={() => { setDateRange('yearToDate'); setIsDateDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100">Anno corrente</button>
                <button onClick={() => { setDateRange('custom'); setIsDateDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100">Personalizzato</button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 text-sm border rounded-md bg-white hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              <span>Esporta</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isExportDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isExportDropdownOpen && (
              <div className="absolute right-0 z-10 mt-1 w-48 bg-white border rounded-md shadow-lg">
                <button onClick={exportToCSV} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2">
                  <FileText className="h-4 w-4" />Esporta CSV
                </button>
                <button onClick={exportToExcel} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />Esporta Excel
                </button>
              </div>
            )}
          </div>

          {dateRange === 'custom' && (
            <>
              <DatePicker date={customStartDate} onDateChange={setCustomStartDate} placeholder="Data inizio" />
              <DatePicker date={customEndDate} onDateChange={setCustomEndDate} placeholder="Data fine" />
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Tasso Cancellazione</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${summary.cancellation_rate > 15 ? 'text-red-600' : summary.cancellation_rate > 10 ? 'text-yellow-600' : 'text-green-600'}`}>
              {summary.cancellation_rate.toFixed(1)}%
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {summary.total_cancelled} su {summary.total_bookings} prenotazioni
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Confermate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{summary.total_confirmed.toLocaleString('it-IT')}</div>
            <p className="text-xs text-gray-500 mt-1">{summary.confirmed_pax.toLocaleString('it-IT')} pax</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Cancellate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{summary.total_cancelled.toLocaleString('it-IT')}</div>
            <p className="text-xs text-gray-500 mt-1">{summary.cancelled_pax.toLocaleString('it-IT')} pax</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Revenue Perso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{formatCurrency(summary.cancelled_revenue)}</div>
            <p className="text-xs text-gray-500 mt-1">Da cancellazioni</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="monthly" className="space-y-4">
        <TabsList>
          <TabsTrigger value="monthly">Per Mese</TabsTrigger>
          <TabsTrigger value="tours">Per Tour</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-4">
          {/* Monthly Chart */}
          {monthlyData.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Andamento Mensile</CardTitle>
                <CardDescription>Prenotazioni confermate vs cancellate per mese</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month_label" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          value.toLocaleString('it-IT'),
                          name === 'confirmed' ? 'Confermate' : 'Cancellate'
                        ]}
                      />
                      <Legend formatter={(value) => value === 'confirmed' ? 'Confermate' : 'Cancellate'} />
                      <Bar dataKey="confirmed" fill="#22c55e" name="confirmed" />
                      <Bar dataKey="cancelled" fill="#ef4444" name="cancelled" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly Table */}
          <Card>
            <CardHeader>
              <CardTitle>Riepilogo Mensile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Mese</th>
                      <th className="text-right py-2">Confermate</th>
                      <th className="text-right py-2">Cancellate</th>
                      <th className="text-right py-2">Totale</th>
                      <th className="text-right py-2">Tasso</th>
                      <th className="text-right py-2">Pax Persi</th>
                      <th className="text-right py-2">Revenue Perso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((month) => (
                      <tr key={month.month} className="border-b hover:bg-gray-50">
                        <td className="py-2 font-medium">{month.month_label}</td>
                        <td className="text-right py-2 text-green-600">{month.confirmed.toLocaleString('it-IT')}</td>
                        <td className="text-right py-2 text-red-600">{month.cancelled.toLocaleString('it-IT')}</td>
                        <td className="text-right py-2">{month.total.toLocaleString('it-IT')}</td>
                        <td className="text-right py-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            month.cancellation_rate > 15 ? 'bg-red-100 text-red-800' :
                            month.cancellation_rate > 10 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {month.cancellation_rate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="text-right py-2 text-red-600">{month.cancelled_pax.toLocaleString('it-IT')}</td>
                        <td className="text-right py-2 text-red-600">{formatCurrency(month.cancelled_revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold bg-gray-50">
                      <td className="py-2">Totale</td>
                      <td className="text-right py-2 text-green-600">{monthlyTotals.confirmed.toLocaleString('it-IT')}</td>
                      <td className="text-right py-2 text-red-600">{monthlyTotals.cancelled.toLocaleString('it-IT')}</td>
                      <td className="text-right py-2">{monthlyTotals.total.toLocaleString('it-IT')}</td>
                      <td className="text-right py-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          summary.cancellation_rate > 15 ? 'bg-red-100 text-red-800' :
                          summary.cancellation_rate > 10 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {summary.cancellation_rate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-right py-2 text-red-600">{monthlyTotals.cancelled_pax.toLocaleString('it-IT')}</td>
                      <td className="text-right py-2 text-red-600">{formatCurrency(monthlyTotals.cancelled_revenue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tours" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cancellazioni per Tour</CardTitle>
              <CardDescription>Tour con almeno 5 prenotazioni, ordinati per tasso di cancellazione</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Tour</th>
                      <th className="text-right py-2">Confermate</th>
                      <th className="text-right py-2">Cancellate</th>
                      <th className="text-right py-2">Totale</th>
                      <th className="text-right py-2">Tasso</th>
                      <th className="text-right py-2">Revenue Perso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tourData.map((tour) => (
                      <tr key={tour.activity_id} className="border-b hover:bg-gray-50">
                        <td className="py-2 font-medium max-w-xs truncate" title={tour.title}>{tour.title}</td>
                        <td className="text-right py-2 text-green-600">{tour.confirmed.toLocaleString('it-IT')}</td>
                        <td className="text-right py-2 text-red-600">{tour.cancelled.toLocaleString('it-IT')}</td>
                        <td className="text-right py-2">{tour.total.toLocaleString('it-IT')}</td>
                        <td className="text-right py-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            tour.cancellation_rate > 15 ? 'bg-red-100 text-red-800' :
                            tour.cancellation_rate > 10 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {tour.cancellation_rate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="text-right py-2 text-red-600">{formatCurrency(tour.cancelled_revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold bg-gray-50">
                      <td className="py-2">Totale</td>
                      <td className="text-right py-2 text-green-600">{tourTotals.confirmed.toLocaleString('it-IT')}</td>
                      <td className="text-right py-2 text-red-600">{tourTotals.cancelled.toLocaleString('it-IT')}</td>
                      <td className="text-right py-2">{tourTotals.total.toLocaleString('it-IT')}</td>
                      <td className="text-right py-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          (tourTotals.total > 0 ? (tourTotals.cancelled / tourTotals.total) * 100 : 0) > 15 ? 'bg-red-100 text-red-800' :
                          (tourTotals.total > 0 ? (tourTotals.cancelled / tourTotals.total) * 100 : 0) > 10 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {tourTotals.total > 0 ? ((tourTotals.cancelled / tourTotals.total) * 100).toFixed(1) : 0}%
                        </span>
                      </td>
                      <td className="text-right py-2 text-red-600">{formatCurrency(tourTotals.cancelled_revenue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
