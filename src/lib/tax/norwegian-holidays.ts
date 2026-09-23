/**
 * Norwegian public holidays (helligdager) with Easter calculation.
 *
 * Groundwork for the regulatory phase: the Norwegian deadline rules move a due
 * date that lands on a weekend or a helligdag to the next banking day, the same
 * shape the Swedish deadline code uses. Nothing consumes this module yet —
 * `lib/tax/deadline-config.ts` still carries the Swedish calendar, and the two
 * swap together when the deadline table is replaced.
 *
 * Norwegian law (lov om helligdager og helligdagsfred) lists exactly the days
 * returned by `getNorwegianHolidays`. Julaften, nyttårsaften and påskeaften are
 * NOT helligdager, even though banks and most offices are shut; they are
 * modelled separately by `NORWEGIAN_BANK_CLOSING_DAYS` so that
 * `isNorwegianHoliday` stays a faithful answer to the statutory question.
 */
import { formatDateISO } from '@/lib/calendar/utils'

/**
 * Calculate Easter Sunday using the Anonymous Gregorian algorithm
 * (Meeus/Jones/Butcher algorithm).
 *
 * Local-midnight Date, matching the rest of the calendar helpers, so a caller
 * comparing ISO strings never sees a day shift.
 */
export function calculateEasterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1 // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return new Date(year, month, day)
}

/**
 * Days on which Norwegian banks are closed but which are not helligdager.
 * Kept as MM-DD so the set needs no per-year computation.
 */
export const NORWEGIAN_BANK_CLOSING_DAYS = ['12-24', '12-31'] as const

/**
 * All Norwegian helligdager for a given year, as YYYY-MM-DD.
 *
 * The fixed set is 1 January, 1 May, 17 May, 25 and 26 December; the movable
 * set is skjærtorsdag, langfredag, første og andre påskedag, Kristi
 * himmelfartsdag, og første og andre pinsedag.
 */
export function getNorwegianHolidays(year: number): string[] {
  const fixed: Date[] = [
    new Date(year, 0, 1), // Første nyttårsdag
    new Date(year, 4, 1), // Arbeidernes dag (første mai)
    new Date(year, 4, 17), // Grunnlovsdagen (syttende mai)
    new Date(year, 11, 25), // Første juledag
    new Date(year, 11, 26), // Andre juledag
  ]

  const easter = calculateEasterSunday(year)
  const offset = (days: number) => {
    const d = new Date(easter)
    d.setDate(easter.getDate() + days)
    return d
  }

  const movable: Date[] = [
    offset(-3), // Skjærtorsdag
    offset(-2), // Langfredag
    offset(0), // Første påskedag
    offset(1), // Andre påskedag
    offset(39), // Kristi himmelfartsdag
    offset(49), // Første pinsedag
    offset(50), // Andre pinsedag
  ]

  return [...fixed, ...movable].map((date) => formatDateISO(date))
}

/**
 * Check if a date is a Norwegian helligdag.
 */
export function isNorwegianHoliday(date: Date): boolean {
  return isNorwegianHolidayISO(formatDateISO(date))
}

/**
 * Check if an ISO date string (YYYY-MM-DD) is a Norwegian helligdag.
 * Parses by string only: no Date / timezone math, so callers using UTC
 * boundaries (e.g. the shift-premium engine) get a stable answer.
 */
export function isNorwegianHolidayISO(isoDate: string): boolean {
  const year = parseInt(isoDate.slice(0, 4), 10)
  if (Number.isNaN(year)) return false
  return getNorwegianHolidays(year).includes(isoDate)
}

/**
 * Check if a date is a weekend (Saturday or Sunday).
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6 // Sunday = 0, Saturday = 6
}

/**
 * True when banks are closed: weekend, helligdag, or one of the bank closing
 * days that are not statutory holidays.
 */
export function isBankingDay(date: Date): boolean {
  const iso = formatDateISO(date)
  if (isWeekend(date)) return false
  if (isNorwegianHolidayISO(iso)) return false
  const mmdd = iso.slice(5)
  return !(NORWEGIAN_BANK_CLOSING_DAYS as readonly string[]).includes(mmdd)
}

/**
 * Get the next banking day from a given date.
 * If the date is already a banking day, return it; otherwise advance until one.
 */
export function getNextBankingDay(date: Date): Date {
  const result = new Date(date)

  while (!isBankingDay(result)) {
    result.setDate(result.getDate() + 1)
  }

  return result
}

/**
 * Adjust a deadline date to the next banking day if it falls on a weekend,
 * a helligdag or a bank closing day.
 */
export function adjustDeadlineToNextBankingDay(date: Date): Date {
  return getNextBankingDay(date)
}
