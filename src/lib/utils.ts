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
 * Payroll cutoff: 28th is payday. The 21st is the last day an incentive can
 * be processed for the current payroll cycle (giving finance a week to process).
 *
 * Payroll period runs from the 22nd of the previous month to the 21st of the current month.
 */
export const PAYROLL_CUTOFF_DAY = 21
export const PAYROLL_PERIOD_START_DAY = 22

export function getPayrollPeriod(refDate: Date = new Date()): { start: string; end: string; label: string } {
  const year = refDate.getFullYear()
  const month = refDate.getMonth()
  const day = refDate.getDate()

  let periodStart: Date
  let periodEnd: Date

  if (day <= PAYROLL_CUTOFF_DAY) {
    // We're in the period that ends on the 21st of this month
    periodStart = new Date(year, month - 1, PAYROLL_PERIOD_START_DAY)
    periodEnd = new Date(year, month, PAYROLL_CUTOFF_DAY)
  } else {
    // We're past the 21st, so we're in the next period
    periodStart = new Date(year, month, PAYROLL_PERIOD_START_DAY)
    periodEnd = new Date(year, month + 1, PAYROLL_CUTOFF_DAY)
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
    // Days until the 21st of next month
    const nextCutoff = new Date(now.getFullYear(), now.getMonth() + 1, PAYROLL_CUTOFF_DAY)
    return Math.ceil((nextCutoff.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }
  return PAYROLL_CUTOFF_DAY - day
}

/**
 * Weekly pay periods: Mon→Sun, paid every Monday for the previous 7 days.
 * Use ISO weekday (1=Mon, 7=Sun).
 */

/** Returns the Monday of the week containing the given date. */
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const isoDay = d.getDay() === 0 ? 7 : d.getDay() // JS: 0=Sun, 1=Mon...; ISO: 1=Mon...7=Sun
  d.setDate(d.getDate() - (isoDay - 1))
  return d
}

/** Returns the Sunday of the week containing the given date. */
export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date)
  start.setDate(start.getDate() + 6)
  return start
}

/** Returns the Mon→Sun range for the week containing the given date. */
export function getWeekRange(date: Date = new Date()): { start: string; end: string; label: string } {
  const start = getWeekStart(date)
  const end = getWeekEnd(date)
  const label = `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  return {
    start: toISODate(start),
    end: toISODate(end),
    label,
  }
}

/** Current Mon→Sun pay week. */
export function getCurrentWeek(): { start: string; end: string; label: string } {
  return getWeekRange(new Date())
}

/** The previous (now-completed) Mon→Sun week. */
export function getPreviousWeek(): { start: string; end: string; label: string } {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return getWeekRange(d)
}
