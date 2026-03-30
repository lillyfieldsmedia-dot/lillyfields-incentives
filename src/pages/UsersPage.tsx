import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/lib/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Mail, UserCog } from 'lucide-react'

const ROLES: UserRole[] = ['manager', 'coordinator', 'finance', 'admin']

const roleBadgeVariant = (role: UserRole) => {
  switch (role) {
    case 'admin': return 'destructive' as const
    case 'finance': return 'outline' as const
    default: return 'default' as const
  }
}

export function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('manager')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('manager')
  const [inviteName, setInviteName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [showInvite, setShowInvite] = useState(false)

  useEffect(() => {
    fetchProfiles()
  }, [])

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    if (data) setProfiles(data)
    setLoading(false)
  }

  const handleChangeRole = async () => {
    if (!editUser) return
    await supabase.from('profiles').update({ role: editRole }).eq('id', editUser.id)
    setEditUser(null)
    fetchProfiles()
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    setInviting(true)
    setInviteError('')
    setInviteSuccess('')

    // Use Supabase admin invite (requires service role in production,
    // but the invite function works with anon key if email confirmations are off)
    const { error } = await supabase.auth.admin.inviteUserByEmail(inviteEmail.trim(), {
      data: { full_name: inviteName.trim(), role: inviteRole },
    })

    if (error) {
      // Fallback: create user via signUp if admin invite not available
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: inviteEmail.trim(),
        password: crypto.randomUUID().slice(0, 16),
        options: {
          data: { full_name: inviteName.trim(), role: inviteRole },
        },
      })

      if (signUpError) {
        setInviteError(signUpError.message)
      } else if (data.user) {
        // Create profile
        await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: inviteName.trim(),
          role: inviteRole,
        })
        setInviteSuccess('User created. They will need to reset their password to sign in.')
        setInviteEmail('')
        setInviteName('')
        fetchProfiles()
      }
    } else {
      setInviteSuccess('Invitation email sent!')
      setInviteEmail('')
      setInviteName('')
      fetchProfiles()
    }

    setInviting(false)
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">User Management</h1>
        <Button onClick={() => setShowInvite(true)}>
          <Mail className="mr-2 h-4 w-4" />
          Invite user
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All users ({profiles.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant(p.role)} className="capitalize">
                      {p.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditUser(p)
                        setEditRole(p.role)
                      }}
                    >
                      <UserCog className="mr-1 h-4 w-4" />
                      Change role
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Change role dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role for {editUser?.full_name}</DialogTitle>
            <DialogDescription>Select a new role for this user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={editRole} onValueChange={(v) => setEditRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleChangeRole}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite user dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite new user</DialogTitle>
            <DialogDescription>Send an email invitation to join the system.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Jane Smith"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Email address</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="jane@lillyfields.co.uk"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
            {inviteSuccess && <p className="text-sm text-primary">{inviteSuccess}</p>}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowInvite(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviting}>
                {inviting ? 'Sending...' : 'Send invitation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
