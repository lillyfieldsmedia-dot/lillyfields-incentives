import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Staff } from '@/lib/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { UserPlus, Pencil } from 'lucide-react'

export function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [editStaff, setEditStaff] = useState<Staff | null>(null)
  const [editPhone, setEditPhone] = useState('')

  useEffect(() => {
    fetchStaff()
  }, [])

  const fetchStaff = async () => {
    const { data } = await supabase.from('staff').select('*').order('name')
    if (data) setStaff(data)
    setLoading(false)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return

    setAdding(true)
    setError('')

    const { error: insertError } = await supabase.from('staff').insert({
      name: trimmed,
      phone_number: newPhone.trim() || null,
    })
    if (insertError) {
      setError(insertError.message.includes('unique') ? 'A staff member with this name already exists' : insertError.message)
    } else {
      setNewName('')
      setNewPhone('')
      fetchStaff()
    }
    setAdding(false)
  }

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from('staff').update({ active: !active }).eq('id', id)
    setStaff((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !active } : s))
    )
  }

  const handleSaveEdit = async () => {
    if (!editStaff) return
    const phone = editPhone.trim() || null
    await supabase.from('staff').update({ phone_number: phone }).eq('id', editStaff.id)
    setStaff((prev) => prev.map((s) => (s.id === editStaff.id ? { ...s, phone_number: phone } : s)))
    setEditStaff(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Staff Management</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Add new staff member</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-name">Name</Label>
                <Input
                  id="new-name"
                  placeholder="Staff member name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-phone">Phone (optional)</Label>
                <Input
                  id="new-phone"
                  type="tel"
                  placeholder="+447xxxxxxxxx"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={adding || !newName.trim()}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All staff ({staff.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {s.phone_number || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.active ? 'default' : 'secondary'}>
                      {s.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={s.active}
                      onCheckedChange={() => toggleActive(s.id, s.active)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditStaff(s)
                        setEditPhone(s.phone_number ?? '')
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit phone dialog */}
      <Dialog open={!!editStaff} onOpenChange={() => setEditStaff(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editStaff?.name}</DialogTitle>
            <DialogDescription>
              Update the phone number for SMS confirmations. Use international format (e.g. +447xxxxxxxxx).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-phone">Phone number</Label>
            <Input
              id="edit-phone"
              type="tel"
              placeholder="+447xxxxxxxxx"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStaff(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
