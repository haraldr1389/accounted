/**
 * Which chart a company gets.
 *
 * ## Why this exists rather than a bare import
 *
 * Two artifacts now exist and neither is referenced by anything: the jurisdiction
 * column, and the NS 4102 chart. That is the same smell I flagged elsewhere — dead
 * code that reads like progress — so this module is what joins them, and it is what
 * makes the join *safe* rather than merely mechanical.
 *
 * The safe part is the refusal. A Norwegian company cannot yet be seeded from
 * NS4102, because class 8 (finance, currency results, tax) was not sourced from a
 * statement we can trust. Seeding a partial chart is worse than seeding none: the
 * company gets a chart that looks complete, books everything it can, and then at
 * its first interest payment or year-end discovers the accounts don't exist — with
 * entries already in the ledger that reference a chart that is missing its tail.
 *
 * So Norway throws. That is a deliberate, explicit "not yet", not an accident of
 * incomplete code: the failure is at the moment of choice, where the reason can be
 * told to the operator, rather than three months later inside a voucher.
 *
 * ## What changes when class 8 lands
 *
 * The `byJurisdiction` arm for Norway returns the real chart instead of throwing.
 * `NS4102_IS_COMPLETE` becomes true, and the completeness test flips. Nothing else
 * about the call sites changes — which is the point of routing the choice through
 * here in the first place.
 */
import { Jurisdiction } from '@/types'
import { byJurisdiction } from '@/lib/company/jurisdiction'
import { BAS_REFERENCE, BASReferenceAccount } from '@/lib/bookkeeping/bas-reference'
import { NS4102_IS_COMPLETE, NS4102_REFERENCE, NorwegianAccountReference } from './ns4102'

/**
 * The chart for a jurisdiction, or null when that jurisdiction has no chart to
 * offer. Callers that only need to *display* a chart can use null; a caller about
 * to seed must use {@link chartForJurisdictionOrThrow}.
 */
export function chartForJurisdiction(
  jurisdiction: Jurisdiction,
): (BASReferenceAccount | NorwegianAccountReference)[] | null {
  return byJurisdiction(jurisdiction, {
    se: BAS_REFERENCE,
    no: NS4102_IS_COMPLETE ? NS4102_REFERENCE : null,
  })
}

/**
 * The chart or a throw. This is the one for seeding, onboarding and any path that
 * is about to write accounts into a company's books.
 */
export function chartForJurisdictionOrThrow(
  jurisdiction: Jurisdiction,
): (BASReferenceAccount | NorwegianAccountReference)[] {
  const chart = chartForJurisdiction(jurisdiction)
  if (chart === null) {
    throw new Error(
      `Cannot seed a chart for jurisdiction '${jurisdiction}': NS 4102 is incomplete. ` +
        'Class 8 (finansinntekter, finanskostnader, valutaeffekter og skatt) is absent, ' +
        'so a company seeded from it would be unable to book interest, currency results ' +
        'or tax. Source class 8 and flip NS4102_IS_COMPLETE before enabling Norwegian tenants.',
    )
  }
  return chart
}
