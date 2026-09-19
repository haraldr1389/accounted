import { describe, expect, it } from 'vitest'
import {
  NS4102_IS_COMPLETE,
  NS4102_REFERENCE,
  ns4102AccountName,
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

  it('is marked incomplete while class 8 is missing', () => {
    // Not a tidy placeholder: a company seeded from this chart cannot post interest,
    // currency results or tax. If class 8 lands, this flag flips and this test flips.
    expect(NS4102_IS_COMPLETE).toBe(false)
    const class8 = NS4102_REFERENCE.filter((a) => a.account_class === 8)
    expect(class8.length).toBe(0)
  })
})
