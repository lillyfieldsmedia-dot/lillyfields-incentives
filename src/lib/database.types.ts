export type UserRole = 'manager' | 'coordinator' | 'finance' | 'admin'
export type IncentiveArea = 'waterlooville' | 'petersfield' | 'chichester' | 'farnborough'
export type IncentiveShift = 'morning' | 'evening' | 'weekend'

export const AREAS: { value: IncentiveArea; label: string }[] = [
  { value: 'waterlooville', label: 'Waterlooville' },
  { value: 'petersfield', label: 'Petersfield' },
  { value: 'chichester', label: 'Chichester' },
  { value: 'farnborough', label: 'Farnborough' },
]

export const SHIFTS: { value: IncentiveShift; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'evening', label: 'Evening' },
  { value: 'weekend', label: 'Weekend' },
]

export interface Profile {
  id: string
  full_name: string
  role: UserRole
}

export interface Staff {
  id: string
  name: string
  active: boolean
  created_at: string
}

export interface Incentive {
  id: string
  staff_id: string
  amount: number
  date: string
  given_by_user_id: string
  notes: string | null
  area: IncentiveArea | null
  shift: IncentiveShift | null
  created_at: string
}
