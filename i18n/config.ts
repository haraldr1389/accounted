/**
 * Supported UI locales. This fork runs the Norwegian adaptation, so 'no'
 * (bokmål) joins the upstream pair; 'sv' and 'en' stay so existing
 * installations keep working unchanged.
 */
export const SUPPORTED_LOCALES = ['sv', 'en', 'no'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/**
 * Norwegian is the default in this fork: a fresh install, a new user with no
 * stored preference, and every server-side caller that does not pass a locale
 * resolve to bokmål.
 */
export const DEFAULT_LOCALE: Locale = 'no'

export const LOCALE_COOKIE = 'gnubok-locale'

/**
 * Every timestamp in the app is a business event in Norwegian wall-clock time,
 * so it is formatted in that zone in every locale. Without this, formatting
 * falls back to the runtime time zone: UTC on the server, the visitor's own
 * zone in the browser, which renders a 14:05 send as 12:05 and disagrees across
 * the hydration boundary.
 *
 * Europe/Oslo and Europe/Stockholm share the same offset and DST rules, so this
 * change is semantically exact and cannot shift a rendered timestamp. The
 * hardcoded Europe/Stockholm references elsewhere in the tree (cron scheduling,
 * recurring-invoice send hours) are the same wall clock and are migrated in the
 * regulatory phase.
 */
export const APP_TIME_ZONE = 'Europe/Oslo'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}
