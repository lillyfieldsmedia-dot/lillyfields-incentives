import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency, formatDate, getCurrentWeek, getPreviousWeek, getCurrentMonthRange, cn } from '@/lib/utils'
import { AREAS, SHIFTS } from '@/lib/database.types'
import { Pencil, Trash2, PoundSterling, Hash, Users, MapPin, Sun, UserCheck, CheckCircle2, Clock } from 'lucide-react'

interface IncentiveRow {
  id: string
  amount: number
  date: string
  notes: string | null
  area: string | null
  shift: string | null
  given_by_user_id: string
  created_at: string
  staff: { id: string; name: string }
  profiles: { full_name: string }
}

export function DashboardPage() {
  const { role, user } = useAuth()
  const [incentives, setIncentives] = useState<IncentiveRow[]>([])
  const [companyTotals, setCompanyTotals] = useState<{
    total_amount: number; total_count: number; unique_staff: number;
    by_area: Record<string, number>; by_shift: Record<string, number>;
    by_manager: { name: string; total: number; count: number }[];
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterStaff, setFilterStaff] = useState('')
  const [filterManager, setFilterManager] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [editItem, setEditItem] = useState<IncentiveRow | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [deleteItem, setDeleteItem] = useState<IncentiveRow | null>(null)

  const week = getCurrentWeek()
  const prevWeek = getPreviousWeek()
  const month = getCurrentMonthRange()
  const isFullAccess = role === 'finance' || role === 'admin'
  const [prevWeekPaid, setPrevWeekPaid] = useState<{
    status: 'due' | 'partial' | 'paid'
    paid_by_name: string | null
    owed_amount: number
    total_amount: number
  } | null>(null)
  const [monthTotal, setMonthTotal] = useState<number | null>(null)

  useEffect(() => {
    fetchIncentives()
    fetchCompanyTotals()
    fetchPrevWeekStatus()
    fetchMonthTotal()
  }, [role, user])

  const fetchMonthTotal = async () => {
    const { data } = await supabase.rpc('get_period_totals', {
      period_start: month.start,
      period_end: month.end,
    })
    if (data) {
      setMonthTotal((data as { total_amount: number }).total_amount)
    }
  }

  const fetchCompanyTotals = async () => {
    const { data } = await supabase.rpc('get_period_totals', {
      period_start: week.start,
      period_end: week.end,
    })
    if (data) setCompanyTotals(data as {
      total_amount: number; total_count: number; unique_staff: number;
      by_area: Record<string, number>; by_shift: Record<string, number>;
      by_manager: { name: string; total: number; count: number }[];
    })
  }

  const fetchPrevWeekStatus = async () => {
    // Use the timesheets summary RPC and pick out the previous week.
    const { data } = await supabase.rpc('get_timesheets_summary', { weeks_back: 4 })
    if (!data) return
    const summary = (data as {
      week_start: string
      status: 'open' | 'due' | 'partial' | 'paid'
      paid_amount: number
      total_amount: number
      owed_amount: number
      last_paid_by_name: string | null
    }[]).find((t) => t.week_start === prevWeek.start)

    if (!summary || summary.status === 'open') {
      // Either no incentives logged that week, or still in progress (shouldn't happen for prev week)
      setPrevWeekPaid(null)
      return
    }
    setPrevWeekPaid({
      status: summary.status as 'due' | 'partial' | 'paid',
      paid_by_name: summary.last_paid_by_name,
      owed_amount: Number(summary.owed_amount),
      total_amount: Number(summary.total_amount),
    })
  }

  const fetchIncentives = async () => {
    // Everyone now sees the company-wide list of entries for the current week.
    // Edit/delete is still restricted via the existing per-row checks below.
    const { data } = await supabase
      .from('incentives')
      .select('id, amount, date, notes, area, shift, given_by_user_id, created_at, staff(id, name), profiles:given_by_user_id(full_name)')
      .gte('date', week.start)
      .lte('date', week.end)
      .order('date', { ascending: false })

    if (data) setIncentives(data as unknown as IncentiveRow[])
    setLoading(false)
  }

  const myTotalAmount = incentives.reduce((sum, i) => sum + i.amount, 0)
  const companyTotal = companyTotals?.total_amount ?? myTotalAmount
  const companyCount = companyTotals?.total_count ?? incentives.length
  const companyStaff = companyTotals?.unique_staff ?? new Set(incentives.map((i) => i.staff?.id)).size

  const filtered = incentives.filter((i) => {
    if (filterStaff && !i.staff?.name?.toLowerCase().includes(filterStaff.toLowerCase())) return false
    if (filterManager && !i.profiles?.full_name?.toLowerCase().includes(filterManager.toLowerCase())) return false
    if (filterDateFrom && i.date < filterDateFrom) return false
    if (filterDateTo && i.date > filterDateTo) return false
    return true
  })

  const handleEdit = async () => {
    if (!editItem) return
    const numAmount = parseFloat(editAmount)
    if (isNaN(numAmount) || numAmount <= 0) return

    await supabase
      .from('incentives')
      .update({ amount: numAmount, notes: editNotes.trim() || null })
      .eq('id', editItem.id)

    setEditItem(null)
    fetchIncentives()
  }

  const handleDelete = async () => {
    if (!deleteItem) return
    await supabase.from('incentives').delete().eq('id', deleteItem.id)
    setDeleteItem(null)
    fetchIncentives()
  }

  const canEdit = role === 'manager' || role === 'coordinator' || role === 'admin'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      {/* Dual hero: weekly (operational) + monthly (budget) */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-primary/5 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">This week</h2>
            <span className="text-xs text-muted-foreground">{week.label}</span>
          </div>
          <p className="mt-1 text-3xl font-bold text-primary">{formatCurrency(companyTotal)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">This month so far</h2>
            <span className="text-xs text-muted-foreground capitalize">
              {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </span>
          </div>
          <p className="mt-1 text-3xl font-bold">
            {monthTotal == null ? '—' : formatCurrency(monthTotal)}
          </p>
        </div>
      </div>

      {/* Previous week status banner */}
      {isFullAccess && prevWeekPaid && (
        prevWeekPaid.status === 'paid' ? (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Last week fully paid{prevWeekPaid.paid_by_name ? ` (last payment by ${prevWeekPaid.paid_by_name})` : ''}.
            </span>
          </div>
        ) : prevWeekPaid.status === 'partial' ? (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              Last week partially paid — <strong>{formatCurrency(prevWeekPaid.owed_amount)}</strong> still owed.
            </span>
          </div>
        ) : (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              Last week ({prevWeek.label}) not yet paid — <strong>{formatCurrency(prevWeekPaid.total_amount)}</strong> due. Go to Timesheets to pay.
            </span>
          </div>
        )
      )}

      {/* Summary cards (this week) */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Hash className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{companyCount}</p>
              <p className="text-xs text-muted-foreground">Incentives this week</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{companyStaff}</p>
              <p className="text-xs text-muted-foreground">Staff this week</p>
            </div>
          </CardContent>
        </Card>
        {!isFullAccess && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
                <PoundSterling className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(myTotalAmount)}</p>
                <p className="text-xs text-muted-foreground">Your total this week</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Area & Shift breakdown */}
      {companyTotals && (Object.keys(companyTotals.by_area).length > 0 || Object.keys(companyTotals.by_shift).length > 0) && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {Object.keys(companyTotals.by_area).length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  By area
                </div>
                <div className="space-y-2">
                  {AREAS.map((a) => {
                    const val = companyTotals.by_area[a.value] ?? 0
                    if (val === 0) return null
                    const pct = companyTotals.total_amount > 0 ? (val / companyTotals.total_amount) * 100 : 0
                    return (
                      <div key={a.value}>
                        <div className="flex items-center justify-between text-sm">
                          <span>{a.label}</span>
                          <span className="font-medium">{formatCurrency(val)}</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          {Object.keys(companyTotals.by_shift).length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Sun className="h-4 w-4" />
                  By shift
                </div>
                <div className="space-y-2">
                  {SHIFTS.map((s) => {
                    const val = companyTotals.by_shift[s.value] ?? 0
                    if (val === 0) return null
                    const pct = companyTotals.total_amount > 0 ? (val / companyTotals.total_amount) * 100 : 0
                    return (
                      <div key={s.value}>
                        <div className="flex items-center justify-between text-sm">
                          <span>{s.label}</span>
                          <span className="font-medium">{formatCurrency(val)}</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              s.value === 'morning' ? 'bg-amber-400' : s.value === 'evening' ? 'bg-indigo-500' : 'bg-orange-500'
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Manager breakdown — visible to all so coordinators can see who's offering what */}
      {companyTotals && companyTotals.by_manager.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-4 w-4" />
              Incentives paid by manager
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {companyTotals.by_manager.map((m) => {
                const pct = companyTotals.total_amount > 0 ? (m.total / companyTotals.total_amount) * 100 : 0
                return (
                  <div key={m.name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{m.name}</span>
                      <span className="flex items-baseline gap-2">
                        <span className="text-xs text-muted-foreground">{m.count} {m.count === 1 ? 'incentive' : 'incentives'}</span>
                        <span className="font-medium">{formatCurrency(m.total)}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters — visible to everyone now that all roles see all entries */}
      <Card className="mb-4">
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
          <Input
            placeholder="Filter by staff..."
            value={filterStaff}
            onChange={(e) => setFilterStaff(e.target.value)}
          />
          <Input
            placeholder="Filter by manager..."
            value={filterManager}
            onChange={(e) => setFilterManager(e.target.value)}
          />
          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            placeholder="From date"
          />
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            placeholder="To date"
          />
        </CardContent>
      </Card>

      {/* Entries table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            All entries ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">No incentives recorded this week.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden sm:table-cell">Area</TableHead>
                  <TableHead className="hidden sm:table-cell">Shift</TableHead>
                  <TableHead className="hidden md:table-cell">Given by</TableHead>
                  <TableHead className="hidden lg:table-cell">Notes</TableHead>
                  {canEdit && <TableHead className="w-20"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(item.date)}</TableCell>
                    <TableCell>{item.staff?.name}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(item.amount)}</TableCell>
                    <TableCell className="hidden capitalize sm:table-cell">{item.area || '—'}</TableCell>
                    <TableCell className="hidden capitalize sm:table-cell">{item.shift || '—'}</TableCell>
                    <TableCell className="hidden md:table-cell">{item.profiles?.full_name}</TableCell>
                    <TableCell className="hidden max-w-[200px] truncate lg:table-cell">
                      {item.notes || '—'}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          {/* Managers/coordinators can only edit their own entries; admin can edit any */}
                          {(role === 'admin' || item.given_by_user_id === user?.id) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditItem(item)
                                setEditAmount(String(item.amount))
                                setEditNotes(item.notes ?? '')
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {role === 'admin' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setDeleteItem(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit incentive</DialogTitle>
            <DialogDescription>Update the amount or notes for this incentive entry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (£)</Label>
              <Input
                type="number"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={handleEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete incentive</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {formatCurrency(deleteItem?.amount ?? 0)} incentive
              for {deleteItem?.staff?.name}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
