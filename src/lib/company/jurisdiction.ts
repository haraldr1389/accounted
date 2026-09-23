import type { SupabaseClient } from '@supabase/supabase-js'
import type { Jurisdiction } from '@/types'
import { flagEnabled } from '@/lib/env/public-flags'

/**
 * Which national accounting regime a company is subject to. The counterpart of
 * `entity-type.ts`, and it deliberately borrows that module's shape because the
 * problem it has to solve is the same one.
 *
 * ## Why this module exists
 *
 * Accounted books Swedish law. The engine is not the Swedish part — debit-equals-
 * credit, voucher immutability and period locks hold in any country, and the
 * database triggers enforcing them are not jurisdiction-aware because they do
 * not need to be. The Swedish part is *data*: which chart of accounts a company
 * is seeded with, which VAT declaration a period closes into, which annual-report
 * framework applies, and which identifier formats count as valid.
 *
 * None of those can be chosen until the company states which country it answers
 * to. Without an accessor that single statement would spread as `=== 'no'`
 * ternaries across the tree, which is the exact failure entity-type.ts documents
 * for legal forms: "a third form silently booked as an enskild firma".
 *
 * ## The `Record` discipline
 *
 * `byJurisdiction` takes an arm per jurisdiction, so widening `JURISDICTIONS`
 * makes the compiler refuse every call site that has not decided what Norway
 * means there. A missing arm is a build error, not a production behaviour. That
 * is the whole reason to have this module rather than a boolean on the company.
 */
export const JURISDICTIONS = ['se', 'no'] as const satisfies readonly Jurisdiction[]

// Compile-time proof that JURISDICTIONS lists every member of the union.
type MissingFromList = Exclude<Jurisdiction, (typeof JURISDICTIONS)[number]>
const jurisdictionsAreExhaustive: MissingFromList extends never ? true : never = true
void jurisdictionsAreExhaustive

/**
 * Sweden is the default, not a fallback for missing data. A row written before
 * this column existed, a company created through a path that never set it, and
 * any value the code cannot read all resolve to Swedish, so introducing the
 * column cannot change an existing tenant's books.
 */
export const DEFAULT_JURISDICTION: Jurisdiction = 'se'

/** Statutory labels stay in their own language, same as ENTITY_TYPE_LABELS_SV. */
export const JURISDICTION_LABELS_SV: Record<Jurisdiction, string> = {
  se: 'Sverige',
  no: 'Norge',
}

export const JURISDICTION_LABELS_NO: Record<Jurisdiction, string> = {
  se: 'Sverige',
  no: 'Norge',
}

export class UnknownJurisdictionError extends Error {
  readonly code = 'COMPANY_JURISDICTION_UNKNOWN'
  constructor(value: unknown) {
    super(
      `Unknown company jurisdiction ${JSON.stringify(value)}: expected one of ${JURISDICTIONS.join(', ')}`,
    )
    this.name = 'UnknownJurisdictionError'
  }
}

export function isJurisdiction(value: unknown): value is Jurisdiction {
  return typeof value === 'string' && (JURISDICTIONS as readonly string[]).includes(value)
}

/** Narrow a raw DB/JSON value; throws instead of defaulting. */
export function parseJurisdiction(value: unknown): Jurisdiction {
  if (isJurisdiction(value)) return value
  throw new UnknownJurisdictionError(value)
}

/**
 * Resolve the active company's jurisdiction. Mirrors
 * `resolveCompanyEntityType` exactly: a `hint` wins when it is valid, otherwise
 * the stored column decides, and a lookup failure throws rather than silently
 * booking a Norwegian company against the Swedish chart.
 */
export async function resolveCompanyJurisdiction(
  supabase: SupabaseClient,
  companyId: string,
  hint?: unknown,
): Promise<Jurisdiction> {
  if (isJurisdiction(hint)) return hint
  const { data, error } = await supabase
    .from('companies')
    .select('jurisdiction')
    .eq('id', companyId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load company jurisdiction: ${error.message}`)
  // No silent default. The column is `not null default 'se'`, so a null here can
  // only mean the company row was not found — and answering a lookup that
  // returned nothing with "Sweden" is exactly how a legal form ended up booked
  // as enskild firma. parseJurisdiction throws on null for that reason.
  return parseJurisdiction(data?.jurisdiction)
}

/**
 * Pick `arms`' entry for a jurisdiction. The `Record` parameter is what makes
 * an unhandled jurisdiction a compile error, so do not replace the call with a
 * conditional — the point is that a new country breaks the build.
 */
export function byJurisdiction<T>(jurisdiction: Jurisdiction, arms: Record<Jurisdiction, T>): T {
  // The runtime guard is not redundant with the type: the arms argument makes an
  // unhandled *declared* jurisdiction a compile error, but a value that arrived
  // from the database, a request body or a stale cache can be outside the union
  // while still type-asserted. Indexing alone returns undefined for those and
  // the failure surfaces much later as a wrong account number or a missing VAT
  // form, so an unknown value has to stop here.
  if (!isJurisdiction(jurisdiction)) throw new UnknownJurisdictionError(jurisdiction)
  return arms[jurisdiction]
}

/**
 * Creation gate for a jurisdiction that is not generally available yet. Same
 * pattern as `IDEELL_FORENING_FLAG`: `NEXT_PUBLIC_` so the onboarding picker and
 * the server-side create paths read the same switch, and the DB CHECK accepts
 * the value regardless, so flipping the flag never needs a migration.
 *
 * This is what lets the scaffolding ship before any Norwegian behaviour exists:
 * a tenant can already be stored with jurisdiction='no' while every code path
 * still resolves to Sweden, and turning the flag on is the only visible change.
 */
export const NORWAY_FLAG = 'NEXT_PUBLIC_NORWAY_ENABLED'

export function isJurisdictionCreatable(jurisdiction: Jurisdiction): boolean {
  return byJurisdiction(jurisdiction, {
    se: true,
    // `process.env.NEXT_PUBLIC_NORWAY_ENABLED` spelled literally on purpose:
    // Next.js inlines that exact expression into client bundles, so the computed
    // form `process.env[NORWAY_FLAG]` would read undefined in the browser and
    // make the picker hide Norway while the server still allowed it. NORWAY_FLAG
    // exists so the server-side paths and the docs name the same switch.
    no: flagEnabled(process.env.NEXT_PUBLIC_NORWAY_ENABLED),
  })
}

/** The jurisdiction a newly created company gets when nothing was specified. */
export function defaultJurisdictionForCreate(): Jurisdiction {
  return DEFAULT_JURISDICTION
}
