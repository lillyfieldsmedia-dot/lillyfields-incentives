import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, PAYROLL_CUTOFF_DAY, PAYROLL_PERIOD_START_DAY, toISODate, getPayrollPeriod } from '@/lib/utils'
import { AREAS, SHIFTS } from '@/lib/database.types'
import { Download } from 'lucide-react'
import { format, subMonths } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

const COLORS = ['#1D9E75', '#2563eb', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

interface IncentiveRow {
  id: string
  amount: number
  date: string
  area: string | null
  shift: string | null
  notes: string | null
  staff: { id: string; name: string }
  profiles: { full_name: string } | null
}

export function ReportsPage() {
  const [incentives, setIncentives] = useState<IncentiveRow[]>([])
  const [loading, setLoading] = useState(true)
  // Default to the current payroll month (the month the cutoff falls in).
  // e.g. on 29 Apr the current period is 22 Apr → 21 May, which is "May 2026".
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const period = getPayrollPeriod()
    return period.end.substring(0, 7) // YYYY-MM of the period end
  })

  useEffect(() => {
    fetchAll()
  }, [])

  function payrollPeriodForMonth(yyyy: number, mm: number): { start: string; end: string } {
    const start = new Date(yyyy, mm - 1, PAYROLL_PERIOD_START_DAY)
    const end = new Date(yyyy, mm, PAYROLL_CUTOFF_DAY)
    return { start: toISODate(start), end: toISODate(end) }
  }

  const fetchAll = async () => {
    const from = format(subMonths(new Date(), 13), `yyyy-MM-${PAYROLL_PERIOD_START_DAY}`)
    const to = toISODate(new Date())

    const { data } = await supabase
      .from('incentives')
      .select('id, amount, date, area, shift, notes, staff(id, name), profiles:given_by_user_id(full_name)')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })

    if (data) setIncentives(data as unknown as IncentiveRow[])
    setLoading(false)
  }

  // Get incentives for the selected payroll period
  const selectedIncentives = useMemo(() => {
    const d = new Date(selectedMonth + '-15')
    const range = payrollPeriodForMonth(d.getFullYear(), d.getMonth())
    return incentives.filter((inc) => inc.date >= range.start && inc.date <= range.end)
  }, [incentives, selectedMonth])

  // Monthly chart data — anchor on the current payroll period end so labels
  // match the dropdown / dashboard.
  const chartData = useMemo(() => {
    const currentPeriodEnd = new Date(getPayrollPeriod().end)
    const periods: { key: string; label: string; start: string; end: string; total: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(currentPeriodEnd, i)
      const yyyy = d.getFullYear()
      const mm = d.getMonth()
      const range = payrollPeriodForMonth(yyyy, mm)
      periods.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM yy'), ...range, total: 0 })
    }
    for (const inc of incentives) {
      for (const p of periods) {
        if (inc.date >= p.start && inc.date <= p.end) {
          p.total += inc.amount
          break
        }
      }
    }
    return periods.map((p) => ({
      month: p.label,
      monthKey: p.key,
      total: Math.round(p.total * 100) / 100,
    }))
  }, [incentives])

  // Per-staff breakdown
  const staffBreakdown = useMemo(() => {
    const map: Record<string, { name: string; count: number; total: number }> = {}
    for (const inc of selectedIncentives) {
      if (inc.staff) {
        if (!map[inc.staff.id]) {
          map[inc.staff.id] = { name: inc.staff.name, count: 0, total: 0 }
        }
        map[inc.staff.id].count++
        map[inc.staff.id].total += inc.amount
      }
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [selectedIncentives])

  // Area breakdown
  const areaBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    for (const a of AREAS) map[a.value] = 0
    for (const inc of selectedIncentives) {
      if (inc.area && inc.area in map) map[inc.area] += inc.amount
    }
    return AREAS
      .map((a) => ({ name: a.label, value: Math.round(map[a.value] * 100) / 100 }))
      .filter((a) => a.value > 0)
  }, [selectedIncentives])

  // Shift breakdown
  const shiftBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of SHIFTS) map[s.value] = 0
    for (const inc of selectedIncentives) {
      if (inc.shift && inc.shift in map) map[inc.shift] += inc.amount
    }
    return SHIFTS
      .map((s) => ({ name: s.label, value: Math.round(map[s.value] * 100) / 100 }))
      .filter((s) => s.value > 0)
  }, [selectedIncentives])

  const csvEscape = (val: string | number | null | undefined): string => {
    if (val == null) return ''
    const s = String(val)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const downloadCSV = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Row-per-incentive detailed CSV
  const exportDetailedCSV = () => {
    const header = 'Date,Staff Name,Amount,Area,Shift,Manager,Notes'
    const rows = selectedIncentives.map((i) => [
      i.date,
      csvEscape(i.staff?.name),
      i.amount.toFixed(2),
      csvEscape(i.area ? i.area.charAt(0).toUpperCase() + i.area.slice(1) : ''),
      csvEscape(i.shift ? i.shift.charAt(0).toUpperCase() + i.shift.slice(1) : ''),
      csvEscape(i.profiles?.full_name),
      csvEscape(i.notes),
    ].join(','))
    downloadCSV(`incentives-${selectedMonth}-detailed.csv`, [header, ...rows].join('\n'))
  }

  // Per-staff summary CSV
  const exportSummaryCSV = () => {
    const header = 'Staff Name,Number of Incentives,Total Amount'
    const rows = staffBreakdown.map((s) => [csvEscape(s.name), s.count, s.total.toFixed(2)].join(','))
    downloadCSV(`incentives-${selectedMonth}-summary.csv`, [header, ...rows].join('\n'))
  }

  const monthOptions = useMemo(() => {
    // Anchor on the current payroll period end (which IS the payroll month label).
    // Go back 12 months from there.
    const currentPeriodEnd = new Date(getPayrollPeriod().end)
    const options: { value: string; label: string }[] = []
    for (let i = 0; i < 12; i++) {
      const d = subMonths(currentPeriodEnd, i)
      options.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') })
    }
    return options
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Monthly Reports</h1>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Monthly spend chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Incentive spend — last 12 months</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `£${v}`} />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip formatter={((value: any) => [formatCurrency(Number(value)), 'Total']) as any} />
                <Bar dataKey="total" fill="#1D9E75" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Area and Shift breakdowns */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spend by area</CardTitle>
          </CardHeader>
          <CardContent>
            {areaBreakdown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No area data this month</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={areaBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ value }) => `£${value}`}
                    >
                      {areaBreakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={((value: any) => formatCurrency(Number(value))) as any} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spend by shift</CardTitle>
          </CardHeader>
          <CardContent>
            {shiftBreakdown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No shift data this month</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={shiftBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ value }) => `£${value}`}
                    >
                      {shiftBreakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={((value: any) => formatCurrency(Number(value))) as any} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Staff breakdown */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Staff breakdown</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportSummaryCSV}
              disabled={staffBreakdown.length === 0}
            >
              <Download className="mr-1 h-4 w-4" />
              Summary CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportDetailedCSV}
              disabled={selectedIncentives.length === 0}
            >
              <Download className="mr-1 h-4 w-4" />
              Detailed CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {staffBreakdown.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">No data for this month.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff member</TableHead>
                  <TableHead className="text-right">Incentives</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffBreakdown.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell className="text-right">{s.count}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(s.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{staffBreakdown.reduce((s, r) => s + r.count, 0)}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(staffBreakdown.reduce((s, r) => s + r.total, 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
