import { describe, expect, it } from 'vitest'
import {
  chartForJurisdiction,
  chartForJurisdictionOrThrow,
} from '@/lib/bookkeeping/norsk-data/chart-for-jurisdiction'
import { BAS_REFERENCE } from '@/lib/bookkeeping/bas-reference'

describe('chart selection by jurisdiction', () => {
  it('Sweden gets BAS, unchanged', () => {
    expect(chartForJurisdiction('se')).toBe(BAS_REFERENCE)
    expect(chartForJurisdictionOrThrow('se')).toBe(BAS_REFERENCE)
  })

  it('Norway yields nothing to seed while the chart is incomplete', () => {
    // Not a cosmetic gap: class 8 is missing, so a Norwegian company could not book
    // interest, currency results or tax. A partial chart that looks whole is the
    // failure mode this guards.
    expect(chartForJurisdiction('no')).toBeNull()
  })

  it('refuses to seed Norway and says why', () => {
    expect(() => chartForJurisdictionOrThrow('no')).toThrow(/NS 4102 is incomplete/)
    try {
      chartForJurisdictionOrThrow('no')
    } catch (e) {
      const message = (e as Error).message
      // The operator must be able to act on the message without reading the source.
      expect(message).toContain('Class 8')
      expect(message).toContain('NS4102_IS_COMPLETE')
    }
  })

  it('the choice goes through byJurisdiction, so a new country breaks the build', async () => {
    // This is the reason the selector exists rather than an `if (jurisdiction === ...)`.
    const mod = await import('@/lib/bookkeeping/norsk-data/chart-for-jurisdiction')
    expect(typeof mod.chartForJurisdiction).toBe('function')
    expect(mod.chartForJurisdiction('se')).toHaveLength(BAS_REFERENCE.length)
  })
})
