import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Payroll cutoff: 28th is payday, so the 27th is the last day
 * an incentive can be processed for the current payroll cycle.
 *
 * Payroll period runs from the 28th of the previous month to the 27th of the current month.
 */
export const PAYROLL_CUTOFF_DAY = 27

export function getPayrollPeriod(refDate: Date = new Date()): { start: string; end: string; label: string } {
  const year = refDate.getFullYear()
  const month = refDate.getMonth()
  const day = refDate.getDate()

  let periodStart: Date
  let periodEnd: Date

  if (day <= PAYROLL_CUTOFF_DAY) {
    // We're in the period that ends on the 27th of this month
    periodStart = new Date(year, month - 1, 28)
    periodEnd = new Date(year, month, 27)
  } else {
    // We're past the 27th, so we're in the next period
    periodStart = new Date(year, month, 28)
    periodEnd = new Date(year, month + 1, 27)
  }

  const label = periodEnd.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return {
    start: toISODate(periodStart),
    end: toISODate(periodEnd),
    label,
  }
}

export function isBeforeCutoff(date: string): boolean {
  const d = new Date(date)
  return d.getDate() <= PAYROLL_CUTOFF_DAY
}

export function getDaysUntilCutoff(): number {
  const now = new Date()
  const day = now.getDate()
  if (day > PAYROLL_CUTOFF_DAY) {
    // Days until the 27th of next month
    const nextCutoff = new Date(now.getFullYear(), now.getMonth() + 1, PAYROLL_CUTOFF_DAY)
    return Math.ceil((nextCutoff.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }
  return PAYROLL_CUTOFF_DAY - day
}
