/**
 * Guards the Norwegian holiday calendar against the two mistakes this file
 * actually shipped with: Easter offsets that drift, and non-statutory days
 * (julaften, nyttårsaften, påskeaften) counted as helligdager.
 *
 * Reference dates are from the Norwegian Church's Easter tables; a wrong
 * Easter propagates into all seven movable holidays at once, so the assertion
 * is on the concrete dates, not on the algorithm's internals.
 */
import { describe, it, expect } from 'vitest'
import {
  calculateEasterSunday,
  getNorwegianHolidays,
  isNorwegianHolidayISO,
  isBankingDay,
  getNextBankingDay,
  adjustDeadlineToNextBankingDay,
  isWeekend,
} from '../norwegian-holidays'
import { formatDateISO } from '@/lib/calendar/utils'

describe('calculateEasterSunday', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2030, '2030-04-21'],
    [2038, '2038-04-25'],
  ])('puts Easter %i on %s', (year, iso) => {
    expect(formatDateISO(calculateEasterSunday(year))).toBe(iso)
  })
})

describe('getNorwegianHolidays', () => {
  it('returns the twelve statutory helligdager for 2026', () => {
    expect(getNorwegianHolidays(2026).sort()).toEqual(
      [
        '2026-01-01', // Første nyttårsdag
        '2026-04-02', // Skjærtorsdag
        '2026-04-03', // Langfredag
        '2026-04-05', // Første påskedag
        '2026-04-06', // Andre påskedag
        '2026-05-01', // Arbeidernes dag
        '2026-05-14', // Kristi himmelfartsdag
        '2026-05-17', // Grunnlovsdagen
        '2026-05-24', // Første pinsedag
        '2026-05-25', // Andre pinsedag
        '2026-12-25', // Første juledag
        '2026-12-26', // Andre juledag
      ].sort(),
    )
  })

  it('derives the movable holidays from Easter, not from hardcoded dates', () => {
    // 2025: Easter is 20 April, so Kristi himmelfartsdag is 29 May.
    const h2025 = getNorwegianHolidays(2025)
    expect(h2025).toContain('2025-05-29')
    expect(h2025).toContain('2025-06-08') // første pinsedag
    expect(h2025).toContain('2025-06-09') // andre pinsedag
  })

  it('never counts julaften, nyttårsaften or påskeaften as helligdager', () => {
    for (const year of [2024, 2025, 2026, 2027]) {
      const holidays = getNorwegianHolidays(year)
      expect(holidays).not.toContain(`${year}-12-24`)
      expect(holidays).not.toContain(`${year}-12-31`)
      // Påskeaften is the Saturday before Easter Sunday.
      const easterSaturday = new Date(calculateEasterSunday(year))
      easterSaturday.setDate(easterSaturday.getDate() - 1)
      expect(holidays).not.toContain(formatDateISO(easterSaturday))
    }
  })

  it('returns well-formed ISO dates', () => {
    for (const iso of getNorwegianHolidays(2026)) {
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('isNorwegianHolidayISO', () => {
  it('accepts holidays and rejects ordinary working days', () => {
    expect(isNorwegianHolidayISO('2026-05-17')).toBe(true)
    expect(isNorwegianHolidayISO('2026-04-03')).toBe(true)
    expect(isNorwegianHolidayISO('2026-04-04')).toBe(false) // påskeaften
    expect(isNorwegianHolidayISO('2026-05-18')).toBe(false)
    expect(isNorwegianHolidayISO('2026-12-24')).toBe(false) // julaften
  })

  it('returns false on unparseable input rather than throwing', () => {
    expect(isNorwegianHolidayISO('')).toBe(false)
    expect(isNorwegianHolidayISO('not-a-date')).toBe(false)
  })
})

describe('banking days', () => {
  it('treats weekends as non-banking days', () => {
    expect(isWeekend(new Date(2026, 4, 16))).toBe(true) // Saturday
    expect(isWeekend(new Date(2026, 4, 17))).toBe(true) // Sunday, getDay() === 0
    expect(isWeekend(new Date(2026, 4, 18))).toBe(false) // Monday
    expect(isBankingDay(new Date(2026, 4, 16))).toBe(false)
  })

  it('closes on helligdager', () => {
    expect(isBankingDay(new Date(2026, 4, 17))).toBe(false) // 17 May, a Sunday
    expect(isBankingDay(new Date(2026, 4, 14))).toBe(false) // Kristi himmelfartsdag
  })

  it('closes on the bank closing days that are not helligdager', () => {
    // 24 and 31 December 2026 are a Thursday; banks are shut anyway.
    expect(isNorwegianHolidayISO('2026-12-24')).toBe(false)
    expect(isBankingDay(new Date(2026, 11, 24))).toBe(false)
    expect(isBankingDay(new Date(2026, 11, 31))).toBe(false)
  })

  it('keeps an ordinary weekday open', () => {
    expect(isBankingDay(new Date(2026, 4, 18))).toBe(true) // Monday
  })
})

describe('deadline adjustment', () => {
  it('leaves a banking day untouched', () => {
    const monday = new Date(2026, 4, 18)
    expect(formatDateISO(getNextBankingDay(monday))).toBe('2026-05-18')
    expect(formatDateISO(adjustDeadlineToNextBankingDay(monday))).toBe('2026-05-18')
  })

  it('rolls a helligdag forward to the next weekday', () => {
    // 17 May 2026 is a Sunday, so it is a non-banking day twice over. The next
    // banking day is Monday 18 May: andre pinsedag falls on 25 May, not the
    // 18th, so the ordinary Monday is open.
    expect(formatDateISO(adjustDeadlineToNextBankingDay(new Date(2026, 4, 17))))
      .toBe('2026-05-18')
  })

  it('rolls across a weekend', () => {
    expect(formatDateISO(adjustDeadlineToNextBankingDay(new Date(2026, 4, 16))))
      .toBe('2026-05-18')
  })

  it('rolls from julaften into the Christmas holidays', () => {
    // 24 Dec 2026 (Thu) → 25 and 26 Dec are helligdager, 27/28 are the weekend,
    // so the next banking day is Monday 28 December? No: 28 Dec 2026 is a
    // Monday, which is a banking day.
    expect(formatDateISO(adjustDeadlineToNextBankingDay(new Date(2026, 11, 24))))
      .toBe('2026-12-28')
  })

  it('does not mutate its argument', () => {
    const date = new Date(2026, 4, 16)
    const before = date.getTime()
    adjustDeadlineToNextBankingDay(date)
    expect(date.getTime()).toBe(before)
  })
})
