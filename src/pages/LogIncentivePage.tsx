import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Staff, IncentiveArea, IncentiveShift } from '@/lib/database.types'
import { AREAS, SHIFTS } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, UserPlus, Clock } from 'lucide-react'
import { toISODate, getPayrollPeriod, getDaysUntilCutoff, cn } from '@/lib/utils'

export function LogIncentivePage() {
  const { user, profile } = useAuth()
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [staffQuery, setStaffQuery] = useState('')
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(toISODate(new Date()))
  const [area, setArea] = useState<IncentiveArea | null>(null)
  const [shift, setShift] = useState<IncentiveShift | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchStaff()
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchStaff = async () => {
    const { data } = await supabase
      .from('staff')
      .select('*')
      .eq('active', true)
      .order('name')
    if (data) setStaffList(data)
  }

  const filteredStaff = staffList.filter((s) =>
    s.name.toLowerCase().includes(staffQuery.toLowerCase())
  )

  const exactMatch = staffList.some(
    (s) => s.name.toLowerCase() === staffQuery.toLowerCase()
  )

  const handleSelectStaff = (staff: Staff) => {
    setSelectedStaff(staff)
    setStaffQuery(staff.name)
    setShowDropdown(false)
  }

  const handleAddNewStaff = async () => {
    const trimmed = staffQuery.trim()
    if (!trimmed) return

    const { data, error: err } = await supabase
      .from('staff')
      .insert({ name: trimmed })
      .select()
      .single()

    if (err) {
      setError('Failed to add staff member')
      return
    }

    if (data) {
      setStaffList((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedStaff(data)
      setShowDropdown(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStaff || !user) return

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setSubmitting(true)
    setError('')

    const { error: insertError } = await supabase.from('incentives').insert({
      staff_id: selectedStaff.id,
      amount: numAmount,
      date,
      given_by_user_id: user.id,
      area,
      shift,
      notes: notes.trim() || null,
    })

    if (insertError) {
      setError('Failed to save. Please try again.')
      setSubmitting(false)
      return
    }

    setSuccess(true)
    setSubmitting(false)

    // Reset form after delay
    setTimeout(() => {
      setStaffQuery('')
      setSelectedStaff(null)
      setAmount('')
      setDate(toISODate(new Date()))
      setArea(null)
      setShift(null)
      setNotes('')
      setSuccess(false)
    }, 2000)
  }

  const payroll = getPayrollPeriod()
  const daysUntilCutoff = getDaysUntilCutoff()

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold md:mb-6">Log Incentive</h1>

      {daysUntilCutoff <= 5 && (
        <div className="mx-auto mb-4 flex max-w-lg items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            <strong>{daysUntilCutoff} day{daysUntilCutoff !== 1 ? 's' : ''}</strong> until payroll cutoff (27th)
          </span>
        </div>
      )}

      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg">New incentive payment</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Staff name with typeahead */}
            <div className="relative space-y-2" ref={dropdownRef}>
              <Label htmlFor="staff">Staff member</Label>
              <Input
                id="staff"
                placeholder="Start typing a name..."
                value={staffQuery}
                onChange={(e) => {
                  setStaffQuery(e.target.value)
                  setSelectedStaff(null)
                  setShowDropdown(true)
                }}
                onFocus={() => setShowDropdown(true)}
                autoComplete="off"
              />
              {showDropdown && staffQuery.length > 0 && (
                <div className="absolute top-full z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-white shadow-lg">
                  {filteredStaff.map((staff) => (
                    <button
                      key={staff.id}
                      type="button"
                      className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => handleSelectStaff(staff)}
                    >
                      {staff.name}
                    </button>
                  ))}
                  {!exactMatch && staffQuery.trim().length > 0 && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-primary hover:bg-accent"
                      onClick={handleAddNewStaff}
                    >
                      <UserPlus className="h-4 w-4" />
                      Add "{staffQuery.trim()}" as new staff member
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (£)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  £
                </span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7"
                  required
                  inputMode="decimal"
                />
              </div>
            </div>

            {/* Area */}
            <div className="space-y-2">
              <Label>Area</Label>
              <div className="grid grid-cols-2 gap-2">
                {AREAS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => setArea(area === a.value ? null : a.value)}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                      area === a.value
                        ? 'border-primary bg-primary text-white'
                        : 'border-input bg-background hover:bg-accent'
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Shift */}
            <div className="space-y-2">
              <Label>Shift</Label>
              <div className="grid grid-cols-3 gap-2">
                {SHIFTS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setShift(shift === s.value ? null : s.value)}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                      shift === s.value
                        ? 'border-primary bg-primary text-white'
                        : 'border-input bg-background hover:bg-accent'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                max={payroll.end}
                onChange={(e) => setDate(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Must be on or before the 27th to be included in {payroll.label} payroll.
              </p>
            </div>

            {/* Given by */}
            <div className="space-y-2">
              <Label>Given by</Label>
              <Input value={profile?.full_name ?? ''} disabled className="bg-muted" />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any additional details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {success ? (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-primary/10 py-4 text-primary">
                <Check className="h-5 w-5" />
                <span className="font-medium">Incentive logged successfully!</span>
              </div>
            ) : (
              <Button
                type="submit"
                size="lg"
                className="w-full text-base"
                disabled={submitting || !selectedStaff || !amount}
              >
                {submitting ? 'Saving...' : 'Log Incentive'}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
