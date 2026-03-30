import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, PAYROLL_CUTOFF_DAY, toISODate } from '@/lib/utils'
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
} from 'recharts'

interface IncentiveRow {
  id: string
  amount: number
  date: string
  staff: { id: string; name: string }
}

export function ReportsPage() {
  const [incentives, setIncentives] = useState<IncentiveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))

  useEffect(() => {
    fetchAll()
  }, [])

  /** Build a payroll period: 28th of prev month → 27th of given month */
  function payrollPeriodForMonth(yyyy: number, mm: number): { start: string; end: string } {
    const start = new Date(yyyy, mm - 1, 28)       // 28th of previous month
    const end = new Date(yyyy, mm, PAYROLL_CUTOFF_DAY) // 27th of this month
    return { start: toISODate(start), end: toISODate(end) }
  }

  const fetchAll = async () => {
    // Fetch 13 months back to cover 12 full payroll periods
    const from = format(subMonths(new Date(), 13), 'yyyy-MM-28')
    const to = toISODate(new Date())

    const { data } = await supabase
      .from('incentives')
      .select('id, amount, date, staff(id, name)')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })

    if (data) setIncentives(data as unknown as IncentiveRow[])
    setLoading(false)
  }

  // Build last 12 payroll periods for chart
  const chartData = useMemo(() => {
    const periods: { key: string; label: string; start: string; end: string; total: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      const yyyy = d.getFullYear()
      const mm = d.getMonth() // 0-based
      const range = payrollPeriodForMonth(yyyy, mm)
      periods.push({
        key: format(d, 'yyyy-MM'),
        label: format(d, 'MMM yy'),
        ...range,
        total: 0,
      })
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

  // Per-staff breakdown for selected payroll period
  const staffBreakdown = useMemo(() => {
    const d = new Date(selectedMonth + '-15')
    const range = payrollPeriodForMonth(d.getFullYear(), d.getMonth())

    const map: Record<string, { name: string; count: number; total: number }> = {}
    for (const inc of incentives) {
      if (inc.date >= range.start && inc.date <= range.end && inc.staff) {
        if (!map[inc.staff.id]) {
          map[inc.staff.id] = { name: inc.staff.name, count: 0, total: 0 }
        }
        map[inc.staff.id].count++
        map[inc.staff.id].total += inc.amount
      }
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [incentives, selectedMonth])

  const exportCSV = () => {
    const header = 'Staff Name,Number of Incentives,Total Amount\n'
    const rows = staffBreakdown
      .map((s) => `"${s.name}",${s.count},${s.total.toFixed(2)}`)
      .join('\n')
    const csv = header + rows
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `incentives-${selectedMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Generate month options for picker
  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = []
    for (let i = 0; i < 12; i++) {
      const d = subMonths(new Date(), i)
      options.push({
        value: format(d, 'yyyy-MM'),
        label: format(d, 'MMMM yyyy'),
      })
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
      <h1 className="mb-6 text-2xl font-bold">Monthly Reports</h1>

      {/* Bar chart */}
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
                <Tooltip
                  formatter={((value: any) => [formatCurrency(Number(value)), 'Total']) as any}
                />
                <Bar dataKey="total" fill="#1D9E75" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Staff breakdown */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Staff breakdown</CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={staffBreakdown.length === 0}>
              <Download className="mr-1 h-4 w-4" />
              CSV
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
