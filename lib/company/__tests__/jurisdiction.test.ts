import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_JURISDICTION,
  JURISDICTIONS,
  UnknownJurisdictionError,
  byJurisdiction,
  defaultJurisdictionForCreate,
  isJurisdiction,
  isJurisdictionCreatable,
  parseJurisdiction,
  resolveCompanyJurisdiction,
} from '@/lib/company/jurisdiction'

function stubSupabase(
  companyRow: { jurisdiction: string } | null,
  error: { message: string } | null = null,
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: companyRow, error })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { client: { from } as unknown as SupabaseClient, from, eq }
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_NORWAY_ENABLED
})

describe('jurisdiction: the shape it must keep', () => {
  it('lists Sweden and Norway, Sweden first because it is the default', () => {
    expect([...JURISDICTIONS]).toEqual(['se', 'no'])
    expect(DEFAULT_JURISDICTION).toBe('se')
  })

  it('narrows known values and rejects everything else', () => {
    expect(isJurisdiction('no')).toBe(true)
    expect(isJurisdiction('se')).toBe(true)
    expect(isJurisdiction('dk')).toBe(false)
    expect(isJurisdiction(null)).toBe(false)
    expect(isJurisdiction(undefined)).toBe(false)
    expect(isJurisdiction(42)).toBe(false)
    expect(parseJurisdiction('no')).toBe('no')
    expect(() => parseJurisdiction('dk')).toThrow(UnknownJurisdictionError)
    expect(() => parseJurisdiction(undefined)).toThrow(/expected one of/)
  })

  it('byJurisdiction selects the arm for the jurisdiction', () => {
    expect(byJurisdiction('se', { se: 'BAS', no: 'NS4102' })).toBe('BAS')
    expect(byJurisdiction('no', { se: 'BAS', no: 'NS4102' })).toBe('NS4102')
  })

  it('byJurisdiction refuses a corrupt value at runtime', () => {
    expect(() =>
      byJurisdiction('fi' as never, { se: 1, no: 2 }),
    ).toThrow(UnknownJurisdictionError)
  })

  it('names both countries in their own language, not per locale', () => {
    // The label is the country's own name, so it does not change with the UI
    // locale: 'Norge' is what both a Swedish and a Norwegian reader expects.
    expect(byJurisdiction('no', { se: 'Sverige', no: 'Norge' })).toBe('Norge')
  })
})

describe('jurisdiction: resolveCompanyJurisdiction', () => {
  it('uses a valid hint without touching the database', async () => {
    const { client, from } = stubSupabase(null)
    await expect(resolveCompanyJurisdiction(client, 'c1', 'no')).resolves.toBe('no')
    expect(from).not.toHaveBeenCalled()
  })

  it('reads companies.jurisdiction when the hint is missing', async () => {
    const { client, eq } = stubSupabase({ jurisdiction: 'no' })
    await expect(resolveCompanyJurisdiction(client, 'c1', null)).resolves.toBe('no')
    expect(eq).toHaveBeenCalledWith('id', 'c1')
  })

  it('resolves to Sweden for a row that carries the column default', async () => {
    const { client } = stubSupabase({ jurisdiction: 'se' })
    await expect(resolveCompanyJurisdiction(client, 'c1')).resolves.toBe('se')
  })

  it('never defaults: a missing company row throws instead of answering Sweden', async () => {
    // The column is `not null default 'se'`, so null means the row was not
    // found. Silently answering 'se' is the failure mode entity-type.ts exists
    // to prevent, so this is the behaviour that must not regress.
    const { client } = stubSupabase(null)
    await expect(resolveCompanyJurisdiction(client, 'c1')).rejects.toThrow(UnknownJurisdictionError)
  })

  it('surfaces a read error instead of guessing', async () => {
    const { client } = stubSupabase(null, { message: 'connection refused' })
    await expect(resolveCompanyJurisdiction(client, 'c1')).rejects.toThrow(/connection refused/)
  })

  it('rejects a stored value that is not a jurisdiction', async () => {
    const { client } = stubSupabase({ jurisdiction: 'sweden' })
    await expect(resolveCompanyJurisdiction(client, 'c1')).rejects.toThrow(UnknownJurisdictionError)
  })
})

describe('jurisdiction: creation gate', () => {
  it('always allows creating a Swedish company', () => {
    expect(isJurisdictionCreatable('se')).toBe(true)
  })

  it('hides Norway until the flag is on, so the scaffolding can ship inert', () => {
    expect(isJurisdictionCreatable('no')).toBe(false)
    process.env.NEXT_PUBLIC_NORWAY_ENABLED = 'true'
    expect(isJurisdictionCreatable('no')).toBe(true)
  })

  it('treats the flag name, not the value, as untruthy', () => {
    process.env.NEXT_PUBLIC_NORWAY_ENABLED = 'NEXT_PUBLIC_NORWAY_ENABLED'
    expect(isJurisdictionCreatable('no')).toBe(false)
  })

  it('defaults a new company to Sweden regardless of the flag', () => {
    delete process.env.NEXT_PUBLIC_NORWAY_ENABLED
    expect(defaultJurisdictionForCreate()).toBe('se')
    process.env.NEXT_PUBLIC_NORWAY_ENABLED = 'true'
    expect(defaultJurisdictionForCreate()).toBe('se')
  })
})
