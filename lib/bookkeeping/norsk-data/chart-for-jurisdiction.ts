/**
 * Which chart a company gets.
 *
 * ## Why this exists rather than a bare import
 *
 * Two artifacts exist and nothing referenced them: the jurisdiction column, and the
 * NS 4102 chart. That is the smell flagged elsewhere, dead code that reads like
 * progress, so this module is what joins them, and it is what makes the join *safe*
 * rather than merely mechanical.
 *
 * What the join actually decides, for a Norwegian company, is not only which country
 * it answers to but which *legal form* it is. NS 4102 publishes two charts, and the
 * difference is not decoration: an aksjeselskap has aksjekapital, overkursfond and
 * tantieme and no owner's drawings, and an enkeltpersonforetak is the other way
 * round. Seeding the wrong one gives a sole trader an equity account that can never
 * balance and a limited company nowhere to put a withdrawal.
 *
 * The jurisdiction selector routes the country. `norwegianLegalForm` routes the form
 * inside it, using the same `byEntityType` discipline, so a new legal form is a
 * compiler error here instead of a Norwegian company silently seeded from the wrong
 * chart. That matters more for Norway than it looks: `ideell_forening` is deliberately
 * null, because NS 4102 excludes stiftelser and samvirkeforetak from its scope, and
 * inventing a mapping for it would be inventing a chart.
 *
 * ## What is left open
 *
 * The chart is complete and seeds now, but it is NS 4102:2005 numbering (see
 * `NS4102_EDITION`). Nothing in this file refuses that; the edition is stated where a
 * reader will find it, and moving to the 2023 edition is a table swap, not a design
 * change.
 */
import { EntityType, Jurisdiction } from '@/types'
import { byJurisdiction } from '@/lib/company/jurisdiction'
import { byEntityType } from '@/lib/company/entity-type'
import { BAS_REFERENCE, BASReferenceAccount } from '@/lib/bookkeeping/bas-reference'
import {
  NS4102_AKSJESELSKAP,
  NS4102_EDITION,
  NorwegianAccountReference,
  NorwegianLegalForm,
  ns4102ChartFor,
} from './ns4102'

/**
 * Which NS 4102 chart a legal form uses, or null when the standard does not cover
 * that form at all. The `Record<EntityType, ...>` is what forces every form added to
 * `ENTITY_TYPES` to answer this question here.
 */
function norwegianLegalForm(entityType: EntityType): NorwegianLegalForm | null {
  return byEntityType(entityType, {
    enskild_firma: 'enk',
    aktiebolag: 'as',
    // NS 4102's own scope: stiftelser and samvirkeforetak are excluded.
    ideell_forening: null,
  })
}

/**
 * The chart for a company, or null when the jurisdiction has no chart or the legal
 * form is outside the standard's scope. Callers that only *display* a chart can use
 * null; a caller about to seed must use {@link chartForJurisdictionOrThrow}.
 *
 * `entityType` is required even though the Swedish arm ignores it: making it
 * mandatory is what stops a Norwegian call site from defaulting its way into the
 * wrong chart.
 */
export function chartForJurisdiction(
  jurisdiction: Jurisdiction,
  entityType: EntityType,
): (BASReferenceAccount | NorwegianAccountReference)[] | null {
  return byJurisdiction(jurisdiction, {
    se: BAS_REFERENCE,
    no: (function pick(form: NorwegianLegalForm | null) {
      return form === null ? null : ns4102ChartFor(form)
    })(norwegianLegalForm(entityType)),
  })
}

/**
 * The chart or a throw. This is the one for seeding, onboarding and any path about to
 * write accounts into a company's books.
 */
export function chartForJurisdictionOrThrow(
  jurisdiction: Jurisdiction,
  entityType: EntityType,
): (BASReferenceAccount | NorwegianAccountReference)[] {
  const chart = chartForJurisdiction(jurisdiction, entityType)
  if (chart === null) {
    if (jurisdiction === 'no') {
      throw new Error(
        `Cannot seed a Norwegian chart for an '${entityType}' company: NS 4102 does not cover that form. ` +
          'NS 4102 publishes one chart for aksjeselskap and one for enkeltpersonforetak, and it ' +
          'excludes stiftelser and samvirkeforetak from its scope. Choose the legal form that the ' +
          'company is actually registered as, or seed that company manually.',
      )
    }
    throw new Error(`No chart available for jurisdiction '${jurisdiction}'.`)
  }
  return chart
}

/** For diagnostics and the onboarding screen: which edition is being seeded. */
export const NORWEGIAN_CHART_EDITION = NS4102_EDITION

/** Exposed for tests: the two charts differ by exactly this much. */
export const NORWEGIAN_AKSJESELSKAP_CHART = NS4102_AKSJESELSKAP
