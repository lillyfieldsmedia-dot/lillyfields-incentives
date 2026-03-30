import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Staff } from '@/lib/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { UserPlus } from 'lucide-react'

export function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

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

    const { error: insertError } = await supabase.from('staff').insert({ name: trimmed })
    if (insertError) {
      setError(insertError.message.includes('unique') ? 'A staff member with this name already exists' : insertError.message)
    } else {
      setNewName('')
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
          <form onSubmit={handleAdd} className="flex gap-3">
            <Input
              placeholder="Staff member name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1"
            />
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
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
