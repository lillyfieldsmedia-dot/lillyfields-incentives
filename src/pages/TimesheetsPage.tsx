import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ChevronLeft, CheckCircle2, Clock, Lock } from 'lucide-react'

interface TimesheetSummary {
  week_start: string
  week_end: string
  total_amount: number
  total_count: number
  unique_staff: number
  status: 'due' | 'paid'
  paid_at: string | null
  paid_by_name: string | null
}

interface StaffBreakdownRow {
  staff_id: string
  staff_name: string
  phone_number: string | null
  total_amount: number
  incentive_count: number
}

export function TimesheetsPage() {
  const { user, profile } = useAuth()
  const [timesheets, setTimesheets] = useState<TimesheetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TimesheetSummary | null>(null)
  const [breakdown, setBreakdown] = useState<StaffBreakdownRow[]>([])
  const [breakdownLoading, setBreakdownLoading] = useState(false)
  const [confirmPay, setConfirmPay] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchTimesheets()
  }, [])

  const fetchTimesheets = async () => {
    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('get_timesheets_summary', { weeks_back: 26 })
    if (rpcError) {
      setError(rpcError.message)
    } else if (data) {
      setTimesheets(data as TimesheetSummary[])
    }
    setLoading(false)
  }

  const openTimesheet = async (ts: TimesheetSummary) => {
    setSelected(ts)
    setBreakdownLoading(true)
    const { data } = await supabase.rpc('get_timesheet_breakdown', { p_week_start: ts.week_start })
    if (data) setBreakdown(data as StaffBreakdownRow[])
    setBreakdownLoading(false)
  }

  const closeDetail = () => {
    setSelected(null)
    setBreakdown([])
    setError('')
  }

  const markPaid = async () => {
    if (!selected || !user) return
    setPaying(true)
    setError('')

    const { error: insertError } = await supabase.from('timesheets').insert({
      week_start: selected.week_start,
      paid_by_user_id: user.id,
    })

    if (insertError) {
      setError(insertError.message)
      setPaying(false)
      return
    }

    // Refresh data
    await fetchTimesheets()
    setConfirmPay(false)
    setPaying(false)
    closeDetail()
  }

  const canMarkPaid = profile?.role === 'admin' || profile?.role === 'finance'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  // ===== Detail view =====
  if (selected) {
    const total = breakdown.reduce((s, r) => s + Number(r.total_amount), 0)
    const isPaid = selected.status === 'paid'

    return (
      <div>
        <button
          onClick={closeDetail}
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          All timesheets
        </button>

        <div className="mb-4">
          <h1 className="text-2xl font-bold">
            Week of {formatDate(selected.week_start)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(selected.week_start)} – {formatDate(selected.week_end)}
          </p>
        </div>

        {/* Status banner */}
        {isPaid ? (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-primary">Paid</p>
              <p className="text-muted-foreground">
                Marked paid by {selected.paid_by_name}
                {selected.paid_at && ` on ${new Date(selected.paid_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </div>
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        ) : (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Clock className="h-5 w-5 shrink-0 text-amber-700" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-amber-900">Due</p>
              <p className="text-amber-800">Not yet paid</p>
            </div>
          </div>
        )}

        {/* Summary card */}
        <Card className="mb-4">
          <CardContent className="grid grid-cols-3 gap-4 p-4 text-center">
            <div>
              <p className="text-2xl font-bold text-primary">{formatCurrency(total)}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{breakdown.length}</p>
              <p className="text-xs text-muted-foreground">Carers</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{breakdown.reduce((s, r) => s + Number(r.incentive_count), 0)}</p>
              <p className="text-xs text-muted-foreground">Incentives</p>
            </div>
          </CardContent>
        </Card>

        {/* Carer breakdown */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Payment breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {breakdownLoading ? (
              <p className="p-6 text-center text-muted-foreground">Loading…</p>
            ) : breakdown.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground">No incentives this week.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Carer</TableHead>
                    <TableHead className="text-center">#</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown.map((r) => (
                    <TableRow key={r.staff_id}>
                      <TableCell className="font-medium">{r.staff_name}</TableCell>
                      <TableCell className="text-center">{r.incentive_count}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(r.total_amount))}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-center">{breakdown.reduce((s, r) => s + Number(r.incentive_count), 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(total)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Mark paid button */}
        {!isPaid && canMarkPaid && breakdown.length > 0 && (
          <Button
            size="lg"
            className="w-full text-base"
            onClick={() => setConfirmPay(true)}
          >
            <CheckCircle2 className="mr-2 h-5 w-5" />
            Mark all paid
          </Button>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {/* Confirmation dialog */}
        <Dialog open={confirmPay} onOpenChange={setConfirmPay}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark week as paid?</DialogTitle>
              <DialogDescription>
                You're about to mark the {formatDate(selected.week_start)} – {formatDate(selected.week_end)} timesheet as paid (total {formatCurrency(total)}).
                <br /><br />
                Once paid, the {breakdown.length} entries become locked — they can't be edited or deleted. This action will be logged against your name.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmPay(false)} disabled={paying}>Cancel</Button>
              <Button onClick={markPaid} disabled={paying}>
                {paying ? 'Saving...' : 'Confirm paid'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ===== List view =====
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Timesheets</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Weekly payments — paid every Monday for the previous Mon–Sun.
      </p>

      {timesheets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No timesheets yet. They'll appear here once incentives are logged.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {timesheets.map((ts) => (
            <button
              key={ts.week_start}
              onClick={() => openTimesheet(ts)}
              className="block w-full rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatDate(ts.week_start)} – {formatDate(ts.week_end)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ts.unique_staff} carer{ts.unique_staff === 1 ? '' : 's'} · {ts.total_count} incentive{ts.total_count === 1 ? '' : 's'}
                    {ts.status === 'paid' && ts.paid_by_name && (
                      <> · paid by {ts.paid_by_name}</>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">{formatCurrency(Number(ts.total_amount))}</p>
                  <Badge variant={ts.status === 'paid' ? 'default' : 'secondary'} className="mt-1 capitalize">
                    {ts.status === 'paid' ? (
                      <><CheckCircle2 className="mr-1 h-3 w-3" />Paid</>
                    ) : (
                      <><Clock className="mr-1 h-3 w-3" />Due</>
                    )}
                  </Badge>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
