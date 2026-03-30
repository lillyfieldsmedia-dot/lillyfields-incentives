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
import { formatCurrency, formatDate, getPayrollPeriod, getDaysUntilCutoff } from '@/lib/utils'
import { Pencil, Trash2, PoundSterling, Hash, Users, Clock } from 'lucide-react'

interface IncentiveRow {
  id: string
  amount: number
  date: string
  notes: string | null
  created_at: string
  staff: { id: string; name: string }
  profiles: { full_name: string }
}

export function DashboardPage() {
  const { role, user } = useAuth()
  const [incentives, setIncentives] = useState<IncentiveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStaff, setFilterStaff] = useState('')
  const [filterManager, setFilterManager] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [editItem, setEditItem] = useState<IncentiveRow | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [deleteItem, setDeleteItem] = useState<IncentiveRow | null>(null)

  const payroll = getPayrollPeriod()
  const daysUntilCutoff = getDaysUntilCutoff()
  const isFullAccess = role === 'finance' || role === 'admin'

  useEffect(() => {
    fetchIncentives()
  }, [role, user])

  const fetchIncentives = async () => {
    let query = supabase
      .from('incentives')
      .select('id, amount, date, notes, created_at, staff(id, name), profiles:given_by_user_id(full_name)')
      .gte('date', payroll.start)
      .lte('date', payroll.end)
      .order('date', { ascending: false })

    if (!isFullAccess && user) {
      query = query.eq('given_by_user_id', user.id)
    }

    const { data } = await query
    if (data) setIncentives(data as unknown as IncentiveRow[])
    setLoading(false)
  }

  const totalAmount = incentives.reduce((sum, i) => sum + i.amount, 0)
  const uniqueStaff = new Set(incentives.map((i) => i.staff?.id)).size

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
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-2xl font-bold">{payroll.label}</h1>
        <span className="text-sm text-muted-foreground">
          Cutoff: {formatDate(payroll.end)}
        </span>
      </div>
      <p className="mb-2 text-4xl font-bold text-primary">{formatCurrency(totalAmount)}</p>
      {daysUntilCutoff <= 5 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            <strong>{daysUntilCutoff} day{daysUntilCutoff !== 1 ? 's' : ''}</strong> until payroll cutoff (27th).
            Incentives logged after the 27th will go into next month's payroll.
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PoundSterling className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
              <p className="text-xs text-muted-foreground">This period total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Hash className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{incentives.length}</p>
              <p className="text-xs text-muted-foreground">Incentives this period</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{uniqueStaff}</p>
              <p className="text-xs text-muted-foreground">Staff received</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters for finance/admin */}
      {isFullAccess && (
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
      )}

      {/* Entries table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isFullAccess ? 'All entries' : 'Your entries'} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">No incentives recorded this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Amount</TableHead>
                  {isFullAccess && <TableHead className="hidden sm:table-cell">Given by</TableHead>}
                  <TableHead className="hidden md:table-cell">Notes</TableHead>
                  {canEdit && <TableHead className="w-20"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(item.date)}</TableCell>
                    <TableCell>{item.staff?.name}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(item.amount)}</TableCell>
                    {isFullAccess && (
                      <TableCell className="hidden sm:table-cell">{item.profiles?.full_name}</TableCell>
                    )}
                    <TableCell className="hidden max-w-[200px] truncate md:table-cell">
                      {item.notes || '—'}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          {(role === 'admin' || item.staff) && (
                            <>
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
                            </>
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
