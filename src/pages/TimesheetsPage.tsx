import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { ChevronLeft, CheckCircle2, Clock, Lock, Hourglass, CircleSlash } from 'lucide-react'

type TimesheetStatus = 'due' | 'partial' | 'paid' | 'open'

interface TimesheetSummary {
  week_start: string
  week_end: string
  total_amount: number
  total_count: number
  unique_staff: number
  paid_amount: number
  owed_amount: number
  paid_carer_count: number
  status: TimesheetStatus
  last_paid_at: string | null
  last_paid_by_name: string | null
}

interface StaffBreakdownRow {
  staff_id: string
  staff_name: string
  phone_number: string | null
  total_amount: number
  incentive_count: number
  is_paid: boolean
  paid_at: string | null
  paid_by_name: string | null
}

export function TimesheetsPage() {
  const { user, profile } = useAuth()
  const [timesheets, setTimesheets] = useState<TimesheetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TimesheetSummary | null>(null)
  const [breakdown, setBreakdown] = useState<StaffBreakdownRow[]>([])
  const [breakdownLoading, setBreakdownLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'bulk-pay' }
    | { kind: 'pay-one'; row: StaffBreakdownRow }
    | { kind: 'unpay-one'; row: StaffBreakdownRow }
    | null
  >(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const canMarkPaid = profile?.role === 'admin' || profile?.role === 'finance'

  useEffect(() => { fetchTimesheets() }, [])

  const fetchTimesheets = async () => {
    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('get_timesheets_summary', { weeks_back: 26 })
    if (rpcError) setError(rpcError.message)
    else if (data) setTimesheets(data as TimesheetSummary[])
    setLoading(false)
  }

  const openTimesheet = async (ts: TimesheetSummary) => {
    setSelected(ts)
    setBreakdownLoading(true)
    setError('')
    const { data } = await supabase.rpc('get_timesheet_breakdown', { p_week_start: ts.week_start })
    if (data) setBreakdown(data as StaffBreakdownRow[])
    setBreakdownLoading(false)
  }

  const refreshAll = async () => {
    if (selected) {
      const { data } = await supabase.rpc('get_timesheet_breakdown', { p_week_start: selected.week_start })
      if (data) setBreakdown(data as StaffBreakdownRow[])
    }
    await fetchTimesheets()
    // Re-read the selected timesheet's fresh summary so the in-view status is current
    if (selected) {
      const { data: updated } = await supabase.rpc('get_timesheets_summary', { weeks_back: 26 })
      if (updated) {
        const fresh = (updated as TimesheetSummary[]).find((t) => t.week_start === selected.week_start)
        if (fresh) setSelected(fresh)
      }
    }
  }

  const payOne = async (row: StaffBreakdownRow) => {
    if (!selected || !user) return
    setSubmitting(true)
    setError('')
    const { error: insertError } = await supabase.from('carer_payments').insert({
      week_start: selected.week_start,
      staff_id: row.staff_id,
      amount: Number(row.total_amount),
      paid_by_user_id: user.id,
    })
    if (insertError) setError(insertError.message)
    else await refreshAll()
    setSubmitting(false)
    setConfirmAction(null)
  }

  const unpayOne = async (row: StaffBreakdownRow) => {
    if (!selected) return
    setSubmitting(true)
    setError('')
    const { error: deleteError } = await supabase
      .from('carer_payments')
      .delete()
      .eq('week_start', selected.week_start)
      .eq('staff_id', row.staff_id)
    if (deleteError) setError(deleteError.message)
    else await refreshAll()
    setSubmitting(false)
    setConfirmAction(null)
  }

  const payAllUnpaid = async () => {
    if (!selected || !user) return
    const unpaid = breakdown.filter((r) => !r.is_paid)
    if (unpaid.length === 0) return
    setSubmitting(true)
    setError('')
    const rows = unpaid.map((r) => ({
      week_start: selected.week_start,
      staff_id: r.staff_id,
      amount: Number(r.total_amount),
      paid_by_user_id: user.id,
    }))
    const { error: insertError } = await supabase.from('carer_payments').insert(rows)
    if (insertError) setError(insertError.message)
    else await refreshAll()
    setSubmitting(false)
    setConfirmAction(null)
  }

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
    const paidTotal = breakdown.filter((r) => r.is_paid).reduce((s, r) => s + Number(r.total_amount), 0)
    const owedTotal = total - paidTotal
    const unpaidCount = breakdown.filter((r) => !r.is_paid).length
    const isPaid = selected.status === 'paid'
    const isPartial = selected.status === 'partial'
    const isOpen = selected.status === 'open'
    const dueDate = new Date(selected.week_end)
    dueDate.setDate(dueDate.getDate() + 1)

    return (
      <div>
        <button
          onClick={() => { setSelected(null); setBreakdown([]); setError('') }}
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          All timesheets
        </button>

        <div className="mb-4">
          <h1 className="text-2xl font-bold">Week of {formatDate(selected.week_start)}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(selected.week_start)} – {formatDate(selected.week_end)}
          </p>
        </div>

        {/* Status banner */}
        {isPaid ? (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-primary">Fully paid</p>
              {selected.last_paid_by_name && (
                <p className="text-muted-foreground">
                  Last payment by {selected.last_paid_by_name}
                  {selected.last_paid_at && ` on ${new Date(selected.last_paid_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                </p>
              )}
            </div>
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        ) : isPartial ? (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <Hourglass className="h-5 w-5 shrink-0 text-amber-700" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-amber-900">Partially paid</p>
              <p className="text-amber-800">
                {formatCurrency(paidTotal)} paid · <strong>{formatCurrency(owedTotal)}</strong> owed to {unpaidCount} carer{unpaidCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        ) : isOpen ? (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <Clock className="h-5 w-5 shrink-0 text-slate-600" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-slate-900">Open — week still in progress</p>
              <p className="text-slate-600">
                Becomes due on {dueDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}. Early payment is available below for emergencies.
              </p>
            </div>
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
              <p className="text-2xl font-bold text-primary">{formatCurrency(paidTotal)}</p>
              <p className="text-xs text-muted-foreground">Paid</p>
            </div>
            <div>
              <p className={cn('text-2xl font-bold', owedTotal > 0 ? 'text-amber-700' : 'text-muted-foreground')}>
                {formatCurrency(owedTotal)}
              </p>
              <p className="text-xs text-muted-foreground">Owed</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(total)}</p>
              <p className="text-xs text-muted-foreground">Total</p>
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
                    {canMarkPaid && <TableHead className="text-right w-24">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown.map((r) => (
                    <TableRow key={r.staff_id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {r.is_paid && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                          <span>{r.staff_name}</span>
                          {r.is_paid && r.paid_by_name && (
                            <span className="hidden text-xs text-muted-foreground sm:inline">
                              · paid by {r.paid_by_name.split(' ')[0]}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{r.incentive_count}</TableCell>
                      <TableCell className={cn('text-right font-medium', r.is_paid && 'text-muted-foreground line-through')}>
                        {formatCurrency(Number(r.total_amount))}
                      </TableCell>
                      {canMarkPaid && (
                        <TableCell className="text-right">
                          {r.is_paid ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmAction({ kind: 'unpay-one', row: r })}
                            >
                              <CircleSlash className="mr-1 h-3 w-3" />
                              Unpay
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => setConfirmAction({ kind: 'pay-one', row: r })}
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Mark paid
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  <TableRow className="font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-center">
                      {breakdown.reduce((s, r) => s + Number(r.incentive_count), 0)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(total)}</TableCell>
                    {canMarkPaid && <TableCell />}
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Mark all paid button */}
        {!isPaid && canMarkPaid && unpaidCount > 0 && (
          <Button
            size="lg"
            className="w-full text-base"
            onClick={() => setConfirmAction({ kind: 'bulk-pay' })}
            disabled={submitting}
          >
            <CheckCircle2 className="mr-2 h-5 w-5" />
            Mark all {unpaidCount} carer{unpaidCount !== 1 ? 's' : ''} paid
          </Button>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {/* Confirmation dialogs */}
        <Dialog open={!!confirmAction} onOpenChange={() => !submitting && setConfirmAction(null)}>
          <DialogContent>
            {confirmAction?.kind === 'bulk-pay' && (
              <>
                <DialogHeader>
                  <DialogTitle>Mark {unpaidCount} carer{unpaidCount !== 1 ? 's' : ''} paid?</DialogTitle>
                  <DialogDescription>
                    Total: {formatCurrency(owedTotal)}. Once paid, these carers' incentives become locked. This action will be logged against your name.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={submitting}>Cancel</Button>
                  <Button onClick={payAllUnpaid} disabled={submitting}>
                    {submitting ? 'Saving…' : 'Confirm'}
                  </Button>
                </DialogFooter>
              </>
            )}
            {confirmAction?.kind === 'pay-one' && (
              <>
                <DialogHeader>
                  <DialogTitle>Mark {confirmAction.row.staff_name} paid?</DialogTitle>
                  <DialogDescription>
                    {formatCurrency(Number(confirmAction.row.total_amount))}. Their incentives for this week will be locked.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={submitting}>Cancel</Button>
                  <Button onClick={() => payOne(confirmAction.row)} disabled={submitting}>
                    {submitting ? 'Saving…' : 'Confirm'}
                  </Button>
                </DialogFooter>
              </>
            )}
            {confirmAction?.kind === 'unpay-one' && (
              <>
                <DialogHeader>
                  <DialogTitle>Unpay {confirmAction.row.staff_name}?</DialogTitle>
                  <DialogDescription>
                    Reverses the {formatCurrency(Number(confirmAction.row.total_amount))} payment for this week. Their incentives become editable again.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={submitting}>Cancel</Button>
                  <Button variant="destructive" onClick={() => unpayOne(confirmAction.row)} disabled={submitting}>
                    {submitting ? 'Saving…' : 'Unpay'}
                  </Button>
                </DialogFooter>
              </>
            )}
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
        Weekly payments — paid every Monday for the previous Mon–Sun. Tap a week to pay carers individually or all at once.
      </p>

      {timesheets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No timesheets yet. They'll appear here once incentives are logged.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {timesheets.map((ts) => {
            const owed = Number(ts.owed_amount)
            const paid = Number(ts.paid_amount)
            const total = Number(ts.total_amount)
            return (
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
                      {ts.status === 'partial' && (
                        <> · <strong>{formatCurrency(owed)}</strong> owed</>
                      )}
                      {ts.status === 'paid' && ts.last_paid_by_name && (
                        <> · paid by {ts.last_paid_by_name}</>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">{formatCurrency(total)}</p>
                    <Badge
                      variant={
                        ts.status === 'paid' ? 'default'
                        : ts.status === 'partial' ? 'destructive'
                        : 'secondary'
                      }
                      className={cn(
                        'mt-1 capitalize',
                        ts.status === 'partial' && 'bg-amber-500 hover:bg-amber-500/80',
                      )}
                    >
                      {ts.status === 'paid' && <><CheckCircle2 className="mr-1 h-3 w-3" />Paid</>}
                      {ts.status === 'partial' && <><Hourglass className="mr-1 h-3 w-3" />{formatCurrency(paid)}/{formatCurrency(total)}</>}
                      {ts.status === 'due' && <><Clock className="mr-1 h-3 w-3" />Due</>}
                      {ts.status === 'open' && <><Clock className="mr-1 h-3 w-3" />Open</>}
                    </Badge>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
