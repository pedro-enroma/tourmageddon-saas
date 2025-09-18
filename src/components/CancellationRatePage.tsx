"use client"

import * as React from "react"
import { Label, Pie, PieChart } from "recharts"
import { supabase } from '@/lib/supabase'
import { Calendar, ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react"
import { DatePicker } from "@/components/ui/date-picker"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

type DateRangeType = 'last7days' | 'last30days' | 'lastMonth' | 'yearToDate' | 'custom'

interface MonthData {
  month: string
  cancelled: number
  others: number
  total: number
  cancellationRate: number
  fill: string
}

const chartConfig = {
  cancelled: {
    label: "Cancellate",
    color: "hsl(0, 84%, 60%)",  // Red
  },
  others: {
    label: "Altre",
    color: "hsl(142, 76%, 36%)", // Green
  },
} satisfies ChartConfig

export default function CancellationRatePage() {
  const [monthlyData, setMonthlyData] = React.useState<MonthData[]>([])
  const [selectedMonth, setSelectedMonth] = React.useState<string>('')
  const [loading, setLoading] = React.useState(true)
  const [dateRange, setDateRange] = React.useState<DateRangeType>('last30days')
  const [customStartDate, setCustomStartDate] = React.useState<Date>()
  const [customEndDate, setCustomEndDate] = React.useState<Date>()
  const [isDateDropdownOpen, setIsDateDropdownOpen] = React.useState(false)
  const [isExportDropdownOpen, setIsExportDropdownOpen] = React.useState(false)

  const getDateRange = () => {
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

    return {
      startDate: `${startDate.toISOString().split('T')[0]}T00:00:00`,
      endDate: `${endDate.toISOString().split('T')[0]}T23:59:59`
    }
  }

  const loadCancellationData = React.useCallback(async () => {
    try {
      setLoading(true)
      const range = getDateRange()
      if (!range) return

      // Get ALL bookings in the date range using start_date_time for filtering
      const { data, error } = await supabase
        .from('activity_bookings')
        .select('id, start_date_time, status')
        .gte('start_date_time', range.startDate)
        .lte('start_date_time', range.endDate)

      if (error) {
        console.error('Error loading data:', error)
        return
      }

      // Group by month and count unique booking IDs
      const monthlyStats: { [key: string]: { cancelledIds: Set<string>, otherIds: Set<string> } } = {}

      // Process data - count unique booking IDs
      data?.forEach(booking => {
        if (booking.start_date_time && booking.id) {
          const monthKey = booking.start_date_time.substring(0, 7) // YYYY-MM

          if (!monthlyStats[monthKey]) {
            monthlyStats[monthKey] = { cancelledIds: new Set(), otherIds: new Set() }
          }

          // Exclude both CANCELLED and IMPORTED statuses
          if (booking.status === 'CANCELLED' || booking.status === 'IMPORTED') {
            monthlyStats[monthKey].cancelledIds.add(booking.id)
          } else {
            monthlyStats[monthKey].otherIds.add(booking.id)
          }
        }
      })

      // Convert to array format for chart
      const formattedData: MonthData[] = Object.entries(monthlyStats)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([monthKey, stats]) => {
          const cancelled = stats.cancelledIds.size
          const others = stats.otherIds.size
          const total = cancelled + others
          const date = new Date(monthKey + '-01')
          const monthName = date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

          return {
            month: monthName,
            cancelled: cancelled,
            others: others,
            total: total,
            cancellationRate: total > 0 ? (cancelled / total) * 100 : 0,
            fill: `var(--chart-1)`
          }
        })
        .filter(month => month.total > 0) // Only show months with data

      setMonthlyData(formattedData)
      if (formattedData.length > 0) {
        setSelectedMonth(formattedData[formattedData.length - 1].month) // Select last month with data
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (dateRange !== 'custom' || (customStartDate && customEndDate)) {
      loadCancellationData()
    }
  }, [dateRange, customStartDate, customEndDate, loadCancellationData])


  const activeIndex = React.useMemo(
    () => monthlyData.findIndex((item) => item.month === selectedMonth),
    [selectedMonth, monthlyData]
  )

  const selectedData = React.useMemo(() => {
    const month = monthlyData.find(m => m.month === selectedMonth)
    if (!month) return []
    return [
      {
        name: "Altre",
        value: month.others,
        fill: "hsl(142, 76%, 36%)" // Green
      },
      {
        name: "Cancellate",
        value: month.cancelled,
        fill: "hsl(0, 84%, 60%)" // Red
      }
    ]
  }, [selectedMonth, monthlyData])

  const totalBookings = selectedData.reduce((sum, item) => sum + item.value, 0)
  const cancellationRate = monthlyData[activeIndex]?.cancellationRate || 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Caricamento dati...</div>
      </div>
    )
  }

  if (monthlyData.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Nessun dato disponibile</div>
      </div>
    )
  }

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

  const exportToCSV = () => {
    // Prepare CSV data
    const headers = ['Mese', 'Altre', 'Cancellate', 'Totale', 'Tasso Cancellazione (%)']
    const rows = monthlyData.map(month => [
      month.month,
      month.others,
      month.cancelled,
      month.total,
      month.cancellationRate.toFixed(2)
    ])

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    // Download CSV
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
      // Dynamically import xlsx
      const XLSX = (await import('xlsx')).default

      // Prepare Excel data
      const wsData = [
        ['Report Tasso di Cancellazione'],
        ['Periodo: ' + getDateRangeLabel()],
        [],
        ['Mese', 'Altre', 'Cancellate', 'Totale', 'Tasso Cancellazione (%)'],
        ...monthlyData.map(month => [
          month.month,
          month.others,
          month.cancelled,
          month.total,
          month.cancellationRate.toFixed(2) + '%'
        ])
      ]

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(wsData)

      // Auto-size columns
      const colWidths = [
        { wch: 20 }, // Mese
        { wch: 12 }, // Altre
        { wch: 12 }, // Cancellate
        { wch: 12 }, // Totale
        { wch: 20 }  // Tasso Cancellazione
      ]
      ws['!cols'] = colWidths

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Tasso Cancellazione')

      // Write file
      XLSX.writeFile(wb, `cancellation_rate_${new Date().toISOString().split('T')[0]}.xlsx`)
      setIsExportDropdownOpen(false)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      alert('Errore durante l\'esportazione in Excel. Assicurati che xlsx sia installato.')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Tasso di Cancellazione</h1>
          <p className="text-gray-600">Analisi delle prenotazioni cancellate vs tutte le altre</p>
        </div>

        {/* Date Range Filter and Export */}
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
                <button
                  onClick={() => { setDateRange('last7days'); setIsDateDropdownOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                >
                  Ultimi 7 giorni
                </button>
                <button
                  onClick={() => { setDateRange('last30days'); setIsDateDropdownOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                >
                  Ultimi 30 giorni
                </button>
                <button
                  onClick={() => { setDateRange('lastMonth'); setIsDateDropdownOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                >
                  Ultimo mese
                </button>
                <button
                  onClick={() => { setDateRange('yearToDate'); setIsDateDropdownOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                >
                  Anno corrente
                </button>
                <button
                  onClick={() => { setDateRange('custom'); setIsDateDropdownOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                >
                  Personalizzato
                </button>
              </div>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 text-sm border rounded-md bg-white hover:bg-gray-50"
              disabled={monthlyData.length === 0}
            >
              <Download className="h-4 w-4" />
              <span>Esporta</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isExportDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isExportDropdownOpen && (
              <div className="absolute right-0 z-10 mt-1 w-48 bg-white border rounded-md shadow-lg">
                <button
                  onClick={exportToCSV}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Esporta CSV
                </button>
                <button
                  onClick={exportToExcel}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Esporta Excel
                </button>
              </div>
            )}
          </div>

          {dateRange === 'custom' && (
            <>
              <DatePicker
                date={customStartDate}
                onDateChange={setCustomStartDate}
                placeholder="Data inizio"
              />
              <DatePicker
                date={customEndDate}
                onDateChange={setCustomEndDate}
                placeholder="Data fine"
              />
            </>
          )}
        </div>
      </div>

      <Card className="flex flex-col">
        <CardHeader className="pb-0">
          <div className="grid gap-1">
            <CardTitle>Tasso di Cancellazione</CardTitle>
            <CardDescription>Periodo: {getDateRangeLabel()}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 justify-center pb-6">
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square w-full max-w-[400px]"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent />}
              />
              <Pie
                data={selectedData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                strokeWidth={5}
                startAngle={90}
                endAngle={-270}
              >
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-3xl font-bold"
                          >
                            {cancellationRate.toFixed(1)}%
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 24}
                            className="fill-muted-foreground"
                          >
                            Cancellazioni
                          </tspan>
                        </text>
                      )
                    }
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Totale Prenotazioni</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBookings.toLocaleString('it-IT')}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedMonth}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Altre Prenotazioni</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {selectedData[0]?.value.toLocaleString('it-IT') || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {((selectedData[0]?.value || 0) / totalBookings * 100).toFixed(1)}% del totale
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cancellate/Importate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {selectedData[1]?.value.toLocaleString('it-IT') || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {cancellationRate.toFixed(1)}% del totale
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Overview Table */}
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
                  <th className="text-right py-2">Altre</th>
                  <th className="text-right py-2">Cancellate</th>
                  <th className="text-right py-2">Totale</th>
                  <th className="text-right py-2">Tasso Cancellazione</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((month) => (
                  <tr
                    key={month.month}
                    className={`border-b hover:bg-gray-50 cursor-pointer ${
                      month.month === selectedMonth ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => setSelectedMonth(month.month)}
                  >
                    <td className="py-2 font-medium">{month.month}</td>
                    <td className="text-right py-2 text-green-600">
                      {month.others.toLocaleString('it-IT')}
                    </td>
                    <td className="text-right py-2 text-red-600">
                      {month.cancelled.toLocaleString('it-IT')}
                    </td>
                    <td className="text-right py-2 font-semibold">
                      {month.total.toLocaleString('it-IT')}
                    </td>
                    <td className="text-right py-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        month.cancellationRate > 20
                          ? 'bg-red-100 text-red-800'
                          : month.cancellationRate > 10
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {month.cancellationRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}