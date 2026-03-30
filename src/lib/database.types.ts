export type UserRole = 'manager' | 'coordinator' | 'finance' | 'admin'

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
  created_at: string
}
