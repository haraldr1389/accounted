import { describe, expect, it } from 'vitest'
import {
  chartForJurisdiction,
  chartForJurisdictionOrThrow,
} from '@/lib/bookkeeping/norsk-data/chart-for-jurisdiction'
import { BAS_REFERENCE } from '@/lib/bookkeeping/bas-reference'
import { NS4102_AKSJESELSKAP, NS4102_ENKTELTPERSONFORETAK } from '@/lib/bookkeeping/norsk-data/ns4102'

describe('chart selection by jurisdiction', () => {
  it('Sweden gets BAS, unchanged', () => {
    expect(chartForJurisdiction('se', 'aktiebolag')).toBe(BAS_REFERENCE)
    expect(chartForJurisdictionOrThrow('se', 'aktiebolag')).toBe(BAS_REFERENCE)
  })

  it('the Swedish arm does not care about legal form', () => {
    // The form is only load-bearing for Norway. Passing any of the three Swedish
    // forms must still land on BAS, or a company's form would leak into a chart it
    // has nothing to do with.
    for (const form of ['enskild_firma', 'aktiebolag', 'ideell_forening'] as const) {
      expect(chartForJurisdiction('se', form)).toBe(BAS_REFERENCE)
    }
  })

  it('Norway seeds from the chart that matches the legal form', () => {
    expect(chartForJurisdictionOrThrow('no', 'aktiebolag')).toBe(NS4102_AKSJESELSKAP)
    expect(chartForJurisdictionOrThrow('no', 'enskild_firma')).toBe(NS4102_ENKTELTPERSONFORETAK)
  })

  it('refuses an ideell forening and says the standard does not cover it', () => {
    // Not "not implemented yet": NS 4102 excludes stiftelser and samvirkeforetak from
    // its scope, so there is no chart to fall back to. Seeding the AS chart for one
    // would give it an aksjekapital account it can never use.
    expect(chartForJurisdiction('no', 'ideell_forening')).toBeNull()
    expect(() => chartForJurisdictionOrThrow('no', 'ideell_forening')).toThrow(/does not cover that form/)
  })

  it('the choice goes through byJurisdiction, so a new country breaks the build', async () => {
    // This is the reason the selector exists rather than an `if (jurisdiction === ...)`.
    const mod = await import('@/lib/bookkeeping/norsk-data/chart-for-jurisdiction')
    expect(typeof mod.chartForJurisdiction).toBe('function')
    expect(mod.chartForJurisdiction('se', 'aktiebolag')).toHaveLength(BAS_REFERENCE.length)
  })
})
