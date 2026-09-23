import { describe, expect, it } from 'vitest'
import {
  NS4102_AKSJESELSKAP,
  NS4102_ENKTELTPERSONFORETAK,
  NS4102_IS_COMPLETE,
  NS4102_NON_POSTABLE_ACCOUNTS,
  NS4102_REFERENCE,
  NS4102_UNRESOLVED_NAMES,
  ns4102AccountName,
  ns4102ChartFor,
} from '@/lib/bookkeeping/norsk-data/ns4102'

describe('NS 4102 chart', () => {
  it('parses every row into a typed account', () => {
    expect(NS4102_REFERENCE.length).toBeGreaterThan(300)
    for (const a of NS4102_REFERENCE) {
      expect(a.account_number).toMatch(/^\d{4}$/)
      expect(a.account_name.length).toBeGreaterThan(1)
      expect(a.account_number[0]).toBe(String(a.account_class))
      expect(a.account_group).toBe(a.account_number.slice(0, 2))
      // Norwegian standard accounts never carry Swedish-specific metadata.
      expect(a.sru_code).toBeNull()
      expect(a.k2_excluded).toBe(false)
    }
  })

  it('has no duplicate account numbers', () => {
    const seen = new Set<string>()
    for (const a of NS4102_REFERENCE) {
      expect(seen.has(a.account_number)).toBe(false)
      seen.add(a.account_number)
    }
  })

  it('balances in the classes the standard assigns them to', () => {
    for (const a of NS4102_REFERENCE) {
      if (a.account_class <= 2) {
        expect(['asset', 'liability', 'equity']).toContain(a.account_type)
      } else {
        expect(['revenue', 'expense']).toContain(a.account_type)
      }
    }
  })

  it('derives equity from the numbering, not from a declared field', () => {
    // 2000 aksjekapital is equity; 2400 leverandørgjeld is debt. Both are class 2,
    // and the chart must tell them apart from the number alone.
    expect(NS4102_REFERENCE.find((a) => a.account_number === '2000')?.account_type).toBe('equity')
    expect(NS4102_REFERENCE.find((a) => a.account_number === '2400')?.account_type).toBe('liability')
    expect(NS4102_REFERENCE.find((a) => a.account_number === '2120')?.account_type).toBe('equity')
  })

  it('assets debit, revenue credits', () => {
    expect(NS4102_REFERENCE.find((a) => a.account_number === '1920')?.normal_balance).toBe('debit')
    expect(NS4102_REFERENCE.find((a) => a.account_number === '3000')?.normal_balance).toBe('credit')
    expect(NS4102_REFERENCE.find((a) => a.account_number === '7770')?.normal_balance).toBe('debit')
  })

  it('carries the VAT accounts the mva scheme will need', () => {
    // Inngående and utgående MVA appear in both 16xx (as an asset/settlement) and
    // 27xx (as a duty to the state); a Norwegian company uses both depending on
    // whether the amount is reclaimable or owed.
    const vat = NS4102_REFERENCE.filter((a) => a.account_name.includes('erverdiavgift'))
    expect(vat.length).toBeGreaterThan(10)
    expect(ns4102AccountName('1601')).toBe('Utgående merverdiavgift høy sats')
    expect(ns4102AccountName('2711')).toBe('Inngående merverdiavgift høy sats')
  })

  it('names an account exactly as the standard does', () => {
    // These two are the ones most likely to be wrong from memory, so pin them:
    // 2010 is the company's own shares, not any kind of capital account.
    expect(ns4102AccountName('2010')).toBe('Egne aksjer')
    expect(ns4102AccountName('1950')).toBe('Bankinnskudd for skattetrekk')
    expect(ns4102AccountName('7770')).toBe('Bank- og kortgebyrer')
  })

  it('returns null for an unknown number rather than guessing', () => {
    expect(ns4102AccountName('8888')).toBeNull()
    expect(ns4102AccountName('1234567')).toBeNull()
  })

  it('seeds class 8 so interest, currency results and tax have an account', () => {
    // The flag and the chart have to agree. A chart that seeds while a whole class is
    // missing is the failure this test used to protect, and the same discipline now
    // requires class 8 to actually be present.
    expect(NS4102_IS_COMPLETE).toBe(true)
    const class8 = NS4102_REFERENCE.filter((a) => a.account_class === 8)
    expect(class8.length).toBeGreaterThan(20)
    for (const number of ['8050', '8150', '8160', '8300', '8320']) {
      expect(NS4102_REFERENCE.some((a) => a.account_number === number)).toBe(true)
    }
  })

  it('books finance income as income and finance costs as costs', () => {
    // Class 8 is a mixed class: 80xx is revenue, 81xx and 83xx are costs. Reading the
    // class instead of the group would book a bank's interest as an expense.
    for (const number of ['8000', '8030', '8050', '8060', '8400']) {
      const account = NS4102_REFERENCE.find((a) => a.account_number === number)
      expect(account?.account_type).toBe('revenue')
      expect(account?.normal_balance).toBe('credit')
    }
    for (const number of ['8100', '8150', '8160', '8300', '8320']) {
      const account = NS4102_REFERENCE.find((a) => a.account_number === number)
      expect(account?.account_type).toBe('expense')
      expect(account?.normal_balance).toBe('debit')
    }
  })

  it('keeps the accounts that close a year out of the chart', () => {
    // The engine closes a period, it does not post a balancing entry to an account
    // that must then equal a computed total. They are listed in the source and must
    // not be seeded under any legal form.
    for (const number of NS4102_NON_POSTABLE_ACCOUNTS) {
      expect(ns4102AccountName(number)).toBeNull()
      expect(NS4102_AKSJESELSKAP.some((a) => a.account_number === number)).toBe(false)
      expect(NS4102_ENKTELTPERSONFORETAK.some((a) => a.account_number === number)).toBe(false)
    }
  })

  it('puts the exceptions on the side double entry says, not the side the class says', () => {
    // An allowance for bad debt sits in the asset class and carries a credit balance.
    expect(NS4102_AKSJESELSKAP.find((a) => a.account_number === '1580')?.normal_balance).toBe('credit')
    // A company's own shares reduce equity, so they sit on the debit side.
    expect(NS4102_AKSJESELSKAP.find((a) => a.account_number === '2010')?.normal_balance).toBe('debit')
    // Owner's drawings: debit. The owner's deposit, next to it, raises equity.
    expect(ns4102AccountName('2061')).toBe('Uttak kontanter')
    expect(NS4102_ENKTELTPERSONFORETAK.find((a) => a.account_number === '2061')?.normal_balance).toBe(
      'debit',
    )
    expect(NS4102_ENKTELTPERSONFORETAK.find((a) => a.account_number === '2062')?.normal_balance).toBe(
      'credit',
    )
  })

  it('gives the two legal forms the accounts that only they have', () => {
    const as = new Set(NS4102_AKSJESELSKAP.map((a) => a.account_number))
    const enk = new Set(NS4102_ENKTELTPERSONFORETAK.map((a) => a.account_number))
    // A sole trader has no share capital, no treasury shares, no dividend and no
    // general meeting; a limited company has no private drawings.
    for (const number of ['2000', '2010', '2020', '5300', '5330', '7730']) {
      expect(as.has(number)).toBe(true)
      expect(enk.has(number)).toBe(false)
    }
    for (const number of ['2061', '2064', '2075', '5950', '7080']) {
      expect(enk.has(number)).toBe(true)
      expect(as.has(number)).toBe(false)
    }
    // Everything else is shared, which is the point of expressing the difference as a
    // delta instead of maintaining two lists that can drift.
    expect(enk.size).toBeGreaterThan(300)
    expect(as.size).toBeGreaterThan(300)
  })

  it('renames only the account the two charts disagree about by number', () => {
    expect(NS4102_AKSJESELSKAP.find((a) => a.account_number === '1900')?.account_name).toBe('Kontanter')
    expect(NS4102_ENKTELTPERSONFORETAK.find((a) => a.account_number === '1900')?.account_name).toBe(
      'Kasse/kontanter',
    )
    expect(ns4102ChartFor('as')).not.toBe(ns4102ChartFor('enk'))
  })

  it('states the edition and does not hide the names it could not settle', () => {
    // The chart is complete; its numbering is one edition behind. A reader finding
    // this is being told the difference between wrong data and old data.
    expect(NS4102_UNRESOLVED_NAMES.map((n) => n.account_number)).toContain('2320')
    for (const entry of NS4102_UNRESOLVED_NAMES) {
      expect(entry.note.length).toBeGreaterThan(5)
    }
  })
})
