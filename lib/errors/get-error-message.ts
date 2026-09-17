/**
 * Maps raw errors to user-friendly localized messages.
 *
 * Priority chain:
 * 1. Zod validation field errors
 * 2. Postgres error code map
 * 3. HTTP status code map
 * 4. Context-specific fallback
 * 5. Generic fallback
 *
 * Callers can pass an explicit `locale` ('sv' | 'en'). Default 'sv' so existing
 * server-side callers (cron, background jobs, logs) keep their current Swedish
 * output. UI callers should pass the active locale from useLocale() / getLocale().
 *
 * Specific domain phrases (locked period, unbalanced voucher, etc.) remain
 * Swedish for now: those refer to statutory accounting concepts and English
 * users will still see them on Skatteverket-bound surfaces.
 */

import { formatCurrency } from '@/lib/utils'
// Pure module (no next/server): safe for the client bundles this file lives in.
import { formatDimensionValidationIssues } from '@/lib/bookkeeping/dimension-errors'
import {
  describeMissingInvoicePaymentAccount,
  isInvoicePaymentAccountCurrency,
} from '@/lib/invoices/payment-accounts'
import { getErrorEntry, hasErrorEntry } from './structured-errors'
import { ACCOUNT_NUMBER_MESSAGE } from '@/lib/invariants/account-number'

type ErrorContext =
  | 'invoice'
  | 'supplier_invoice'
  | 'customer'
  | 'article'
  | 'supplier'
  | 'transaction'
  | 'journal_entry'
  | 'settings'
  | 'auth'
  | 'salary'

export type ErrorLocale = 'sv' | 'en' | 'no'

interface GetErrorMessageOptions {
  context?: ErrorContext
  statusCode?: number
  locale?: ErrorLocale
}

type Bilingual = { sv: string; en: string; no: string }

function pick(b: Bilingual, locale: ErrorLocale): string {
  return b[locale] ?? b.sv
}

/**
 * Compose a runtime message in the active locale. Swedish is the fallback for
 * every locale but 'no'. Used by the dynamic branches below, whose text carries
 * an amount, a date or a lock date and therefore cannot live in the static
 * registry.
 */
function loc(sv: string, no: string, locale: ErrorLocale): string {
  return locale === 'no' ? no : sv
}

/** Swedish/Norwegian pair for the bank-connection copy, which has no English. */
type SvNo = { sv: string; no: string }

function pickSvNo(b: SvNo, locale: ErrorLocale): string {
  return locale === 'no' ? b.no : b.sv
}

// Postgres error codes -> localized messages
const POSTGRES_ERROR_MAP: Record<string, Bilingual> = {
  '23505': { sv: 'En post med samma uppgifter finns redan.', en: 'A record with the same details already exists.', no: 'En post med samme opplysninger finnes allerede.' },
  '23503': { sv: 'Posten kan inte ändras eftersom den refereras av annan data.', en: 'This record cannot be changed because other data refers to it.', no: 'Posten kan ikke endres fordi den refereres til av andre data.' },
  '23502': { sv: 'Ett obligatoriskt fält saknas.', en: 'A required field is missing.', no: 'Et obligatorisk felt mangler.' },
  '42501': { sv: 'Du har inte behörighet att utföra denna åtgärd.', en: 'You do not have permission to perform this action.', no: 'Du har ikke tilgang til å utføre denne handlingen.' },
  '42P01': { sv: 'Resursen kunde inte hittas.', en: 'The resource could not be found.', no: 'Ressursen kunne ikke finnes.' },
  '23514': { sv: 'Värdet uppfyller inte de tillåtna kraven.', en: 'The value does not meet the allowed constraints.', no: 'Verdien oppfyller ikke de tillatte kravene.' },
  '40001': { sv: 'En annan ändring pågick samtidigt. Försök igen.', en: 'A concurrent change was in progress. Please try again.', no: 'En annen endring pågikk samtidig. Prøv igjen.' },
  '40P01': { sv: 'En konflikt uppstod. Försök igen.', en: 'A conflict occurred. Please try again.', no: 'Det oppstod en konflikt. Prøv igjen.' },
  '22P02': { sv: 'Ogiltigt värde angavs.', en: 'Invalid value supplied.', no: 'Ugyldig verdi oppgitt.' },
  '22003': { sv: 'Värdet är utanför tillåtet intervall.', en: 'Value is out of allowed range.', no: 'Verdien er utenfor tillatt intervall.' },
}

// HTTP status codes -> localized messages
const HTTP_STATUS_MAP: Record<number, Bilingual> = {
  400: { sv: 'Förfrågan innehåller ogiltiga uppgifter.', en: 'The request contains invalid data.', no: 'Forespørselen inneholder ugyldige opplysninger.' },
  401: { sv: 'Din session har gått ut. Logga in igen.', en: 'Your session has expired. Please sign in again.', no: 'Økten din har utløpt. Logg inn på nytt.' },
  403: { sv: 'Du har inte behörighet att utföra denna åtgärd.', en: 'You do not have permission to perform this action.', no: 'Du har ikke tilgang til å utføre denne handlingen.' },
  404: { sv: 'Resursen kunde inte hittas.', en: 'The resource could not be found.', no: 'Ressursen kunne ikke finnes.' },
  409: { sv: 'En konflikt uppstod. Ladda om sidan och försök igen.', en: 'A conflict occurred. Reload the page and try again.', no: 'Det oppstod en konflikt. Last inn siden på nytt og prøv igjen.' },
  // 413 is answered by the hosting platform, before any route runs, with a
  // plain-text body: the status is the only thing a caller has to go on.
  413: { sv: 'Filen är för stor för att skickas. Försök igen med en mindre fil.', en: 'The file is too large to send. Try again with a smaller file.', no: 'Filen er for stor til å sendes. Prøv igjen med en mindre fil.' },
  415: { sv: 'Filtypen stöds inte.', en: 'That file type is not supported.', no: 'Filtypen støttes ikke.' },
  422: { sv: 'Uppgifterna kunde inte bearbetas. Kontrollera fälten och försök igen.', en: 'The data could not be processed. Check the fields and try again.', no: 'Opplysningene kunne ikke behandles. Kontroller feltene og prøv igjen.' },
  429: { sv: 'För många förfrågningar. Vänta en stund och försök igen.', en: 'Too many requests. Wait a moment and try again.', no: 'For mange forespørsler. Vent litt og prøv igjen.' },
  500: { sv: 'Ett oväntat serverfel uppstod. Försök igen senare.', en: 'An unexpected server error occurred. Please try again later.', no: 'Det oppstod en uventet serverfeil. Prøv igjen senere.' },
  502: { sv: 'Servern är tillfälligt otillgänglig. Försök igen om en stund.', en: 'The server is temporarily unavailable. Please try again shortly.', no: 'Serveren er midlertidig utilgjengelig. Prøv igjen om litt.' },
  503: { sv: 'Tjänsten är tillfälligt otillgänglig. Försök igen om en stund.', en: 'The service is temporarily unavailable. Please try again shortly.', no: 'Tjenesten er midlertidig utilgjengelig. Prøv igjen om litt.' },
}

// Context-specific fallbacks
const CONTEXT_FALLBACKS: Record<ErrorContext, Bilingual> = {
  invoice: { sv: 'Kunde inte hantera fakturan. Försök igen.', en: 'Could not process the invoice. Please try again.', no: 'Kunne ikke behandle fakturaen. Prøv igjen.' },
  supplier_invoice: { sv: 'Kunde inte hantera leverantörsfakturan. Försök igen.', en: 'Could not process the supplier invoice. Please try again.', no: 'Kunne ikke behandle leverandørfakturaen. Prøv igjen.' },
  customer: { sv: 'Kunde inte hantera kunden. Försök igen.', en: 'Could not process the customer. Please try again.', no: 'Kunne ikke behandle kunden. Prøv igjen.' },
  article: { sv: 'Kunde inte hantera artikeln. Försök igen.', en: 'Could not process the article. Please try again.', no: 'Kunne ikke behandle artikkelen. Prøv igjen.' },
  supplier: { sv: 'Kunde inte hantera leverantören. Försök igen.', en: 'Could not process the supplier. Please try again.', no: 'Kunne ikke behandle leverandøren. Prøv igjen.' },
  transaction: { sv: 'Kunde inte hantera transaktionen. Försök igen.', en: 'Could not process the transaction. Please try again.', no: 'Kunne ikke behandle transaksjonen. Prøv igjen.' },
  journal_entry: { sv: 'Kunde inte hantera verifikationen. Försök igen.', en: 'Could not process the journal entry. Please try again.', no: 'Kunne ikke behandle bilaget. Prøv igjen.' },
  settings: { sv: 'Kunde inte spara inställningarna. Försök igen.', en: 'Could not save settings. Please try again.', no: 'Kunne ikke lagre innstillingene. Prøv igjen.' },
  auth: { sv: 'Ett fel uppstod vid inloggningen. Försök igen.', en: 'An error occurred while signing in. Please try again.', no: 'Det oppstod en feil ved innloggingen. Prøv igjen.' },
  salary: { sv: 'Kunde inte hantera löneuppgifterna. Försök igen.', en: 'Could not process the payroll data. Please try again.', no: 'Kunne ikke behandle lønnsdataene. Prøv igjen.' },
}

const GENERIC_FALLBACK: Bilingual = { sv: 'Något gick fel. Försök igen.', en: 'Something went wrong. Please try again.', no: 'Noe gikk galt. Prøv igjen.' }

// Known error patterns → user-friendly messages, per locale. Swedish stays the
// first key because server-side callers (cron, background jobs, logs) default
// to 'sv'. A `null` entry means the text is extracted from the raw error
// instead: the period-lock DB trigger emits its sentence in Swedish, so no
// static table can hold it (see tryMatchKnownError).
const ERROR_PATTERN_MAP: [RegExp, { sv: string; no: string } | null][] = [
  [
    /reason must be 500 characters or fewer/i,
    { sv: 'Motiveringen får vara högst 500 tecken.', no: 'Begrunnelsen kan være høyst 500 tegn.' },
  ],
  [
    /locked\/closed fiscal period/i,
    {
      sv: 'Perioden är låst. Verifikationen kan inte skapas i en stängd eller låst period.',
      no: 'Perioden er låst. Bilaget kan ikke opprettes i en stengt eller låst periode.',
    },
  ],
  [
    /Bokföringen är låst t\.o\.m\./,
    null, // null = extract the message directly from the raw error text
  ],
  [
    /Period is already closed/i,
    {
      sv: 'Perioden är redan stängd: bokslutet är genomfört och perioden kan inte öppnas igen.',
      no: 'Perioden er allerede stengt: regnskapsavslutningen er gjennomført og perioden kan ikke åpnes igjen.',
    },
  ],
  [
    /Period is already locked/i,
    { sv: 'Perioden är redan låst.', no: 'Perioden er allerede låst.' },
  ],
  [
    /Cannot attach documents to entries in a locked/i,
    {
      sv: 'Kan inte bifoga dokument till verifikationer i en låst period.',
      no: 'Kan ikke legge ved dokumenter til bilag i en låst periode.',
    },
  ],
  [
    /Entry date .+ is outside fiscal period/i,
    {
      sv: 'Datumet ligger utanför det valda räkenskapsåret.',
      no: 'Datoen ligger utenfor det valgte regnskapsåret.',
    },
  ],
  [
    /Only company owners and admins can delete vouchers/i,
    {
      sv: 'Endast ägare och administratörer kan radera verifikationer.',
      no: 'Bare eiere og administratorer kan slette bilag.',
    },
  ],
  [
    /Journal entry not found/i,
    { sv: 'Verifikationen kunde inte hittas.', no: 'Bilaget kunne ikke finnes.' },
  ],
  [
    /Only posted entries can be deleted/i,
    {
      sv: 'Endast bokförda verifikationer kan raderas.',
      no: 'Bare bokførte bilag kan slettes.',
    },
  ],
  [
    /Cannot delete voucher in a closed fiscal period/i,
    {
      sv: 'Verifikationen kan inte raderas: räkenskapsåret är stängt.',
      no: 'Bilaget kan ikke slettes: regnskapsåret er stengt.',
    },
  ],
  [
    /Cannot delete voucher in a locked fiscal period/i,
    {
      sv: 'Verifikationen kan inte raderas: perioden är låst.',
      no: 'Bilaget kan ikke slettes: perioden er låst.',
    },
  ],
  [
    /Cannot delete: other entries reference this voucher/i,
    {
      sv: 'Verifikationen kan inte raderas eftersom andra verifikationer (t.ex. storno eller rättelse) refererar till den.',
      no: 'Bilaget kan ikke slettes fordi andre bilag (for eksempel storno eller rettelse) refererer til det.',
    },
  ],
  [
    /timed out after \d+m?s/i,
    {
      sv: 'Anslutningen mot tjänsten tog för lång tid. Försök igen.',
      no: 'Tilkoblingen til tjenesten tok for lang tid. Prøv igjen.',
    },
  ],
  [
    /already has a journal entry/i,
    {
      sv: 'Transaktionen är redan bokförd. Ångra kategoriseringen om du vill ändra den.',
      no: 'Transaksjonen er allerede bokført. Angre kategoriseringen hvis du vil endre den.',
    },
  ],
  [
    // GoTrue rejects supabase.auth.signUp with this when the installation
    // runs with disable_signup (closed self-hosted instances). The invitee
    // cannot fix it themselves: point them to whoever runs the installation.
    /signups? not allowed/i,
    {
      sv: 'Kontoregistrering är avstängd på den här installationen. Kontakta den som bjöd in dig eller din administratör för att få ett konto.',
      no: 'Kontoregistrering er slått av på denne installasjonen. Kontakt den som inviterte deg, eller administratoren din, for å få en konto.',
    },
  ],
  [
    // GoTrue could not send its own mail (admin invite, confirmation,
    // recovery): almost always missing SMTP configuration on self-hosted.
    /error sending (invite|confirmation|recovery|magic link|email change) email/i,
    {
      sv: 'E-postmeddelandet kunde inte skickas av autentiseringstjänsten. Kontrollera installationens SMTP-inställningar och försök igen.',
      no: 'E-postmeldingen kunne ikke sendes av autentiseringstjenesten. Kontroller installasjonens SMTP-innstillinger og prøv igjen.',
    },
  ],
]

/**
 * Check if a message matches a known error pattern and return the user-facing
 * message in the requested locale. Swedish is the fallback for every locale
 * but 'no', which is exactly the behavior server-side callers rely on.
 * Returns null if no pattern matches.
 */
function tryMatchKnownError(message: string, locale: ErrorLocale = 'sv'): string | null {
  for (const [pattern, translation] of ERROR_PATTERN_MAP) {
    if (pattern.test(message)) {
      if (translation !== null) return translation[locale === 'no' ? 'no' : 'sv']
      // The period-lock DB trigger emits its sentence in Swedish. Reuse the
      // date it carries and wrap it in the requested language rather than
      // shipping Swedish prose into a Norwegian UI.
      const match = message.match(/Bokföringen är låst t\.o\.m\. ([^.]+)\./)
      if (locale === 'no') {
        return match
          ? `Bokføringen er låst t.o.m. ${match[1]}.`
          : 'Bokføringen er låst for denne perioden.'
      }
      return match ? match[0] : 'Bokföringen är låst för denna period.'
    }
  }
  return null
}

/**
 * Swedish tokens that mark a sentence as Swedish. STRONG ones are
 * unambiguous (never English, rare in technical output) and count 2 on their
 * own; WEAK ones are common function words that also exist in English or are
 * too short to be decisive ("till", "den", "det") and count 1 each. Words
 * that are plainly English as well ("under", "men", "om", "en", "vi") are
 * left out on purpose, so an English framework message cannot score on them.
 */
const SWEDISH_STRONG_WORDS = [
  'och', 'att', 'inte', 'är', 'ska', 'finns', 'ingen', 'inget', 'inga', 'redan',
  'bara', 'hos', 'från', 'eller', 'utan', 'också', 'endast', 'ännu', 'igen',
  'kunde', 'gick', 'går', 'måste', 'får', 'saknas', 'lyckades', 'misslyckades',
  'bifogad', 'svarade',
]
const SWEDISH_WEAK_WORDS = [
  'för', 'med', 'till', 'det', 'den', 'ett', 'av', 'på', 'som', 'har', 'kan',
  'när', 'över', 'mot', 'vid', 'efter', 'innan', 'alla', 'sedan', 'här', 'där',
  'din', 'ditt', 'dina', 'denna', 'detta', 'dessa', 'minst', 'högst',
]
// The strong list is probed with .test(), so it must NOT be global: a global
// regex keeps lastIndex between calls and silently fails the next message.
// The weak list is iterated with matchAll(), which requires the g flag and
// clones the regex per call.
const wordListRe = (words: string[], flags: string) =>
  new RegExp(`(^|[^\\p{L}])(${words.join('|')})(?=$|[^\\p{L}])`, flags)
const SWEDISH_STRONG_RE = wordListRe(SWEDISH_STRONG_WORDS, 'iu')
const SWEDISH_WEAK_RE = wordListRe(SWEDISH_WEAK_WORDS, 'giu')

/**
 * Signs that a string is a technical leak rather than a sentence written for
 * the user: stack frames, file:line references, JS/Node error vocabulary,
 * Postgres/PostgREST/SQL fragments, JSON, URLs. A message carrying any of
 * these is never shown raw, whatever language it is in.
 */
const TECHNICAL_LEAK_PATTERNS: RegExp[] = [
  /\bat \S+ \(/, // stack frame: "at fn (file:1:2)"
  /\.(?:ts|tsx|js|mjs|cjs):\d+/, // file:line
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|EvalError)\b/,
  /cannot read propert/i,
  /is not a function\b/i,
  /is not defined\b/i,
  /\bundefined\b/,
  /\bNaN\b/,
  /\bPGRST\d+/,
  /\bSQLSTATE\b/,
  /violates .*constraint/i,
  /duplicate key value/i,
  /relation "/i,
  /column "/i,
  /syntax error at/i,
  /\bE(?:CONN\w+|TIMEDOUT|NOTFOUND|PIPE|HOSTUNREACH)\b/,
  /fetch failed/i,
  /unexpected token/i,
  /\{\s*"/, // JSON object start
  /https?:\/\//,
]

/**
 * Whether a free-text string reads as a Swedish sentence written for the user
 * (issue #2086): it carries å/ä/ö or Swedish words, and shows no sign of
 * being a technical leak (see TECHNICAL_LEAK_PATTERNS). Scoring: å/ä/ö or
 * any STRONG word counts 2, each distinct WEAK word 1, pass at 2. So "Inget
 * skattekonto är registrerat hos Skatteverket." and "Kopplingen misslyckades."
 * pass; "Failed to fetch customer", "Redirect till /login" and
 * "TypeError: x is not a function" do not.
 */
export function looksLikeUserFacingSwedish(message: string): boolean {
  const text = message.trim()
  if (!text) return false
  if (TECHNICAL_LEAK_PATTERNS.some((p) => p.test(text))) return false
  if (/[åäöÅÄÖ]/.test(text)) return true
  if (SWEDISH_STRONG_RE.test(text)) return true
  const weak = new Set<string>()
  for (const m of text.matchAll(SWEDISH_WEAK_RE)) weak.add(m[2].toLowerCase())
  return weak.size >= 2
}

/**
 * Norwegian bokmål counterpart of the Swedish word lists above. STRONG words
 * are unambiguous (Swedish spells them differently: "inte", "blir" -> "ble",
 * "endast" -> "bare"), WEAK ones are shared function words. Deliberately
 * absent: "og", "er", "til", "for", "av", "som", "kan", "har" — Norwegian and
 * Swedish spell them the same, so they carry no signal.
 */
const NORWEGIAN_STRONG_WORDS = [
  'ikke', 'blir', 'ble', 'bare', 'selv', 'noe', 'hva', 'jeg', 'mulig', 'følger',
  'finnes', 'mangler', 'gjelder', 'inneholder', 'kreves', 'kunne', 'prøv', 'igjen',
  'lagre', 'lagret', 'endre', 'endret', 'slette', 'slettet', 'opprette', 'hente',
  'lukke', 'åpne', 'tilgang', 'bilag', 'mva', 'regnskap', 'beløp', 'leverandør',
  'stengt', 'låst', 'ugyldig', 'opplysning', 'opplysninger', 'foretak', 'mislyktes',
  'avvist', 'vennligst', 'kun', 'også', 'allerede', 'aldri', 'flere',
]
const NORWEGIAN_WEAK_WORDS = [
  'til', 'fra', 'ved', 'etter', 'før', 'over', 'mot', 'denne', 'dette', 'disse',
  'samme', 'minst', 'høyst', 'din', 'ditt', 'dine', 'her', 'der', 'kan', 'skal',
  'må', 'vil', 'har', 'er', 'av', 'som', 'for', 'med', 'på', 'om', 'men',
]
const NORWEGIAN_STRONG_RE = wordListRe(NORWEGIAN_STRONG_WORDS, 'iu')
const NORWEGIAN_WEAK_RE = wordListRe(NORWEGIAN_WEAK_WORDS, 'giu')

/**
 * Whether a free-text string reads as a Norwegian bokmål sentence written for
 * the user. Same shape and threshold as looksLikeUserFacingSwedish: ø/æ or any
 * STRONG word counts 2, each distinct WEAK word 1, pass at 2. "Ingen bilag
 * funnet for perioden." and "Kunne ikke lagre bilaget." pass; "Failed to fetch
 * customer" and "TypeError: x is not a function" do not.
 */
export function looksLikeUserFacingNorwegian(message: string): boolean {
  const text = message.trim()
  if (!text) return false
  if (TECHNICAL_LEAK_PATTERNS.some((p) => p.test(text))) return false
  if (/[øæØÆ]/.test(text)) return true
  if (NORWEGIAN_STRONG_RE.test(text)) return true
  const weak = new Set<string>()
  for (const m of text.matchAll(NORWEGIAN_WEAK_RE)) weak.add(m[2].toLowerCase())
  return weak.size >= 2
}

/**
 * Whether a route's free-text `error` / `message` string is a user-facing
 * message that should be shown as-is, in the caller's locale.
 *
 * For Norwegian the Norwegian test is tried first, then the Swedish one: the
 * accounting engine still composes its free text in Swedish (the DB triggers
 * and the domain errors do), and a specific sentence in the wrong language
 * beats the generic fallback it would otherwise be replaced with. Making the
 * engine emit Norwegian is the follow-up; until then this keeps the detail.
 */
function isUserFacingMessage(message: string, locale: ErrorLocale): boolean {
  if (locale === 'no') return isNorwegianUserMessage(message) || isSwedishUserMessage(message)
  return isSwedishUserMessage(message)
}

/**
 * Whether a free-text string is a user-facing Norwegian message. Mirrors
 * isSwedishUserMessage: the keyword list is the original shape, and
 * looksLikeUserFacingNorwegian is the general second way in.
 */
export function isNorwegianUserMessage(message: string): boolean {
  const norwegianPatterns = [
    /kunne ikke/i,
    /kan ikke/i,
    /finnes ikke/i,
    /allerede/i,
    /låst/i,
    /prøv igjen/i,
    /ugyldig/i,
    /mangler/i,
    /kreves/i,
    /må /i,
    /noe gikk galt/i,
    /valideringsfeil/i,
    /korriger/i,
    /bankopplysninger/i,
    /tilgang/i,
    /økten/i,
    /forespørsel/i,
    /obligatorisk/i,
    /er låst/i,
    /felt/i,
    /verdi/i,
    /feilaktig/i,
    /for (lang|kort|stor|liten|mange|få)/i,
    /bankgiro/i,
    /fødselsnummer/i,
    /kontonummer/i,
    /bilag/i,
    /importer|importen/i,
  ]
  return norwegianPatterns.some((p) => p.test(message)) || looksLikeUserFacingNorwegian(message)
}

/**
 * Whether a route's free-text `error` / `message` string is a user-facing
 * Swedish message that should be shown as-is.
 *
 * Two ways in. The keyword list below is the original test; it stays because
 * callers rely on the odd tokens it lets through (e.g. "session"). It was also
 * the ONLY test until issue #2086: a correct sentence without one of the ~30
 * keywords ("Inget skattekonto är registrerat hos Skatteverket.") was dropped
 * and replaced with the generic HTTP-500 text, whose "försök igen senare"
 * advice was wrong for the case. 155 of the 631 message_sv strings in
 * structured-errors.ts failed the keyword test. looksLikeUserFacingSwedish is
 * the second way in, and a registry-wide test pins that every message_sv
 * passes one of the two.
 */
export function isSwedishUserMessage(message: string): boolean {
  const swedishPatterns = [
    /kunde inte/i,
    /kan inte/i,
    /hittades/i,
    /redan/i,
    /låst/i,
    /försök igen/i,
    /ogiltigt?/i,
    /saknas/i,
    /saknar/i,
    /krävs/i,
    /måste/i,
    /redan finns/i,
    /gick fel/i,
    /valideringsfel/i,
    /korrigera/i,
    /bankuppgifter/i,
    /behörighet/i,
    /session/i,
    /förfrågan/i,
    /obligatorisk/i,
    /är låst/i,
    /fält/i,
    /värde/i,
    /felaktig/i,
    /för (lång|kort|stor|liten|många|få)/i,
    /bankgiro/i,
    /personnummer/i,
    /kontonummer/i,
    /clearingnummer/i,
    /nummer är/i,
    /tillgängligt/i,
    /verifikation/i,
    /importera|importen/i,
  ]
  return swedishPatterns.some((p) => p.test(message)) || looksLikeUserFacingSwedish(message)
}

/**
 * Extract a user-friendly message from a Zod validation error shape.
 * Returns null if the error is not a Zod error.
 */
function tryParseZodErrors(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null

  const obj = error as Record<string, unknown>

  // Check for Zod-style field errors: { fieldName: ["message"] } or { issues: [...] }
  if (Array.isArray(obj.issues)) {
    const issues = obj.issues as Array<{ message?: string; path?: string[] }>
    const messages = issues
      .slice(0, 3)
      .map((issue) => {
        const field = issue.path?.join('.') || ''
        const msg = issue.message || 'ogiltigt värde'
        return field ? `${field}: ${msg}` : msg
      })
    if (messages.length > 0) return messages.join('. ')
  }

  // Check for { errors: [{ field, message, code }] } shape from validateBody
  if (Array.isArray(obj.errors)) {
    const items = obj.errors as Array<{ field?: string; message?: string }>
    const messages = items
      .slice(0, 3)
      .map((it) => {
        const field = it.field || ''
        const msg = it.message || 'ogiltigt värde'
        return field ? `${field}: ${msg}` : msg
      })
      .filter(Boolean)
    if (messages.length > 0) return messages.join('. ')
  }

  // Check for { errors: { field: ["msg"] } } shape (legacy)
  if (typeof obj.errors === 'object' && obj.errors !== null) {
    const fieldErrors = obj.errors as Record<string, string[]>
    const messages: string[] = []
    for (const [field, msgs] of Object.entries(fieldErrors)) {
      if (Array.isArray(msgs) && msgs.length > 0) {
        messages.push(`${field}: ${msgs[0]}`)
      }
      if (messages.length >= 3) break
    }
    if (messages.length > 0) return messages.join('. ')
  }

  return null
}

/**
 * Get a user-friendly Swedish error message from a raw error.
 *
 * @param error - The raw error. Can be an API response body (object), Error instance, string, or unknown.
 * @param options - Optional context and HTTP status code.
 */
export function getErrorMessage(
  error: unknown,
  options: GetErrorMessageOptions = {}
): string {
  const { context, statusCode, locale = 'sv' } = options

  // 1. If it's a string, check if it's already Swedish or matches a known pattern
  if (typeof error === 'string' && error.trim()) {
    // Norwegian asks the pattern map first. The engine composes its free text
    // in Swedish, and a sentence that HAS a Norwegian counterpart ("Bokföringen
    // är låst t.o.m. …") would otherwise be recognised as Swedish user-facing
    // text and passed through untranslated. Swedish and English keep the
    // upstream order exactly.
    if (locale === 'no') {
      const knownError = tryMatchKnownError(error, locale)
      if (knownError) return knownError
    }
    if (isUserFacingMessage(error, locale)) return error
    const knownError = tryMatchKnownError(error, locale)
    if (knownError) return knownError
  }

  // 2. If it's an object, try various parsing strategies
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>

    // Bare envelope inner-error shape: { code, message, message_en?, ... }.
    // Happens when a caller forwards `result.error` (the inner object) instead
    // of the whole `result`. Pick the English variant when the UI locale is
    // English; otherwise fall back to the Swedish `message`.
    if (typeof obj.code === 'string' && typeof obj.message === 'string' && obj.message.trim()) {
      // Typed domain exceptions (lib/bookkeeping/errors.ts classes) also match
      // this shape, but their `message` is raw English (often a DB constraint
      // string) and must never reach the user verbatim. Normalize the instance
      // into the structured envelope so the per-code branches below own the
      // translation. Class fields are enumerable own props, so { ...obj }
      // carries exactly the details those branches expect (totalDebit,
      // lockDate, reason, issues, ...), while the non-enumerable Error.message
      // stays out of details. Plain objects (forwarded inner envelopes,
      // PostgrestError-shaped literals) keep the passthrough behavior.
      if (error instanceof Error) {
        // Only recurse when the registry knows the code: the structured
        // branches then own the translation. An unknown code (a Node system
        // error like ECONNREFUSED, a Postgres SQLSTATE on a wrapped Error, a
        // stray third-party code) would fall out of the structured path with
        // its raw English message, so instead fall through to the plain
        // handling below: Postgres map, known patterns, Swedish check, and
        // finally the status/context/generic fallbacks.
        if (hasErrorEntry(obj.code)) {
          return getErrorMessage(
            {
              error: {
                code: obj.code,
                message: obj.message,
                account_numbers: (obj as { accountNumbers?: unknown }).accountNumbers,
                details: { ...obj },
              },
            },
            options
          )
        }
      } else {
        if (locale === 'en' && typeof obj.message_en === 'string' && obj.message_en.trim()) {
          return obj.message_en
        }
        return obj.message
      }
    }

    // Structured application error: { error: { code, message, message_en?, ... } }
    if (typeof obj.error === 'object' && obj.error !== null) {
      const structured = obj.error as {
        code?: unknown
        message?: unknown
        message_en?: unknown
        account_numbers?: unknown
        details?: unknown
      }

      // The canonical envelope keeps Zod issues under error.details. Read
      // them before the generic VALIDATION_ERROR registry message in either locale.
      if (structured.code === 'VALIDATION_ERROR') {
        const details = structured.details as { issues?: unknown } | undefined
        if (Array.isArray(details?.issues)) {
          const messages = details.issues.flatMap((issue: unknown) => {
            if (!issue || typeof issue !== 'object') return []
            const item = issue as { field?: unknown; message?: unknown; sourceAccount?: unknown }
            if (typeof item.message !== 'string' || !item.message.trim()) return []
            const field = typeof item.field === 'string' ? item.field.slice(0, 120) : ''
            const source = typeof item.sourceAccount === 'string' && /^\d{1,40}$/.test(item.sourceAccount)
              ? item.sourceAccount : null
            if (item.message === ACCOUNT_NUMBER_MESSAGE) {
              const label = source
                ? locale === 'en'
                  ? `Source account ${source}`
                  : locale === 'no'
                  ? `Kildekonto ${source}`
                  : `Källkonto ${source}`
                : field
              const message = /^accounts\.\d+\.number$/.test(field)
                ? locale === 'en'
                  ? 'The account could not be created. Select a target account with exactly four digits in the account mapping step.'
                  : locale === 'no'
                  ? 'Kontoen kunne ikke opprettes. Velg en målkonto med nøyaktig fire sifre i kontomappingen.'
                  : 'Kontot kunde inte skapas. Välj ett målkonto med exakt fyra siffror i kontomappningen.'
                : field.endsWith('targetAccount')
                ? locale === 'en'
                  ? 'The target account must have exactly four digits. Select an account in the account mapping step.'
                  : locale === 'no'
                  ? 'Målkontoen må ha nøyaktig fire sifre. Velg en konto i kontomappingen.'
                  : 'Målkontot måste ha exakt fyra siffror. Välj ett konto i kontomappningen.'
                : locale === 'en' ? 'The account number must contain four digits.' : ACCOUNT_NUMBER_MESSAGE
              return [label ? `${label}: ${message}` : message]
            }
            if (TECHNICAL_LEAK_PATTERNS.some(pattern => pattern.test(item.message as string))) return []
            const message = item.message.slice(0, 500)
            return [field ? `${field}: ${message}` : message]
          })
          if (messages.length) {
            const remaining = messages.length - 3
            return messages.slice(0, 3).join(' ') + (remaining > 0
              ? ` (+${remaining} ${locale === 'en' ? 'more' : locale === 'no' ? 'flere' : 'till'})` : '')
          }
        }
      }

      // Say what is missing for THIS invoice's currency: on a SEK invoice the
      // registry's currency-neutral text read as a foreign-currency account
      // when the gap was the company's bankgiro (#2126). Before the English
      // registry shortcut on purpose: both locales get the specific text.
      if (structured.code === 'INVOICE_SEND_PAYMENT_ACCOUNT_MISSING') {
        // Own local name on purpose: the sek-labelled-amount guard keys
        // currency reads by owner path, and `details` is also the owner of
        // the SEK-only journal totals formatted further down.
        const paymentDetails = structured.details as { currency?: unknown } | undefined
        if (isInvoicePaymentAccountCurrency(paymentDetails?.currency)) {
          return pick(describeMissingInvoicePaymentAccount(paymentDetails.currency), locale)
        }
      }

      // For English UI, return the registry's English message for any known
      // code instead of falling through to the Swedish branches below (which
      // ignored locale: English users were shown Swedish prose). The Swedish
      // path is left entirely unchanged; codes absent from the registry still
      // fall through. The dynamic branches (amounts / lock date / reason) keep
      // owning Swedish display.
      if (locale === 'en' && typeof structured.code === 'string') {
        const entry = getErrorEntry(structured.code)
        if (entry?.message_en) return entry.message_en
      }

      if (structured.code === 'ACCOUNTS_NOT_IN_CHART' && Array.isArray(structured.account_numbers)) {
        const numbers = structured.account_numbers as string[]
        return loc(
          `Följande konton behöver aktiveras: ${numbers.join(', ')}`,
          `Følgende kontoer må aktiveres: ${numbers.join(', ')}`,
          locale,
        )
      }

      if (structured.code === 'JOURNAL_ENTRY_NOT_BALANCED') {
        const details = structured.details as { totalDebit?: number; totalCredit?: number } | undefined
        if (details && typeof details.totalDebit === 'number' && typeof details.totalCredit === 'number') {
          return loc(
            `Verifikationen balanserar inte (${formatCurrency(details.totalDebit)} debet vs ${formatCurrency(details.totalCredit)} kredit).`,
            `Bilaget balanserer ikke (${formatCurrency(details.totalDebit)} debet mot ${formatCurrency(details.totalCredit)} kredit).`,
            locale,
          )
        }
        return loc(
          'Verifikationen balanserar inte. Kontrollera att debet och kredit är lika stora.',
          'Bilaget balanserer ikke. Kontroller at debet og kredit er like store.',
          locale,
        )
      }

      if (structured.code === 'JOURNAL_LINE_NEGATIVE_AMOUNT') {
        return loc(
          'En verifikationsrad har ett negativt belopp. Boka beloppet på motsatt sida i stället.',
          'En bilagslinje har et negativt beløp. Bokfør beløpet på motsatt side i stedet.',
          locale,
        )
      }

      if (structured.code === 'JOURNAL_LINE_BOTH_SIDES_NONZERO') {
        return loc(
          'En verifikationsrad kan inte ha både debet och kredit nollskilda.',
          'En bilagslinje kan ikke ha både debet og kredit ulik null.',
          locale,
        )
      }

      if (structured.code === 'FISCAL_PERIOD_NOT_FOUND') {
        return loc('Räkenskapsperioden kunde inte hittas.', 'Regnskapsperioden kunne ikke finnes.', locale)
      }

      if (structured.code === 'ENTRY_DATE_OUTSIDE_FISCAL_PERIOD') {
        return loc('Datumet ligger utanför det valda räkenskapsåret.', 'Datoen ligger utenfor det valgte regnskapsåret.', locale)
      }

      if (structured.code === 'JOURNAL_ENTRY_NOT_FOUND') {
        return loc('Verifikationen kunde inte hittas.', 'Bilaget kunne ikke finnes.', locale)
      }

      if (structured.code === 'CANNOT_REVERSE_NON_POSTED') {
        return loc('Endast bokförda verifikationer kan stornas.', 'Bare bokførte bilag kan stornes.', locale)
      }

      if (structured.code === 'CANNOT_CORRECT_NON_POSTED') {
        return loc('Endast bokförda verifikationer kan rättas.', 'Bare bokførte bilag kan rettes.', locale)
      }

      if (structured.code === 'ENTRY_ALREADY_REVERSED') {
        return loc(
          'Verifikationen har redan stornats av en annan användare. Ladda om sidan och försök igen.',
          'Bilaget er allerede stornert av en annen bruker. Last inn siden på nytt og prøv igjen.',
          locale,
        )
      }

      if (structured.code === 'CURRENCY_REVALUATION_ALREADY_EXISTS') {
        return loc(
          'En valutaomvärdering finns redan för denna period.',
          'En valutaomvurdering finnes allerede for denne perioden.',
          locale,
        )
      }

      if (structured.code === 'FX_CLOSING_RATE_UNAVAILABLE') {
        // Name the currency and the date: the user needs to know exactly which
        // rate is missing to judge whether to wait or pick another closing
        // date. Nothing was posted, so this is never a partial-state message.
        const details = structured.details as { missingRates?: unknown } | undefined
        const missing = Array.isArray(details?.missingRates)
          ? (details.missingRates as { currency?: unknown; date?: unknown }[])
              .filter((m) => typeof m?.currency === 'string' && typeof m?.date === 'string')
              .map((m) => `${m.currency as string} per ${m.date as string}`)
          : []
        const what = missing.length > 0 ? missing.join(', ') : 'balansdagen'
        return loc(
          `Ingen valutakurs från Riksbanken finns för ${what}. Valutaomvärderingen har inte bokförts: en uppskattad kurs får inte bokföras mot 3960/7960. Försök igen när kursen är publicerad.`,
          `Ingen valutakurs fra Norges Bank finnes for ${what}. Valutaomvurderingen er ikke bokført: en anslått kurs kan ikke bokføres mot 3960/7960. Prøv igjen når kursen er publisert.`,
          locale,
        )
      }

      if (structured.code === 'INVALID_MAPPING_RESULT') {
        return loc(
          'Kontering saknas för transaktionen. Kontrollera bokföringsreglerna.',
          'Kontering mangler for transaksjonen. Kontroller bokføringsreglene.',
          locale,
        )
      }

      if (structured.code === 'DIMENSION_VALIDATION_FAILED') {
        // Prefer reconstructing the per-code Swedish sentences from the
        // machine-readable issue list (present on both the dashboard and the
        // v1/registry error envelopes); fall back to the message, which the
        // engine already emits in Swedish naming the offending codes.
        const details = structured.details as { issues?: unknown } | undefined
        const formatted = formatDimensionValidationIssues(details?.issues)
        if (formatted) return formatted
        if (typeof structured.message === 'string' && structured.message.trim()) {
          return structured.message
        }
        return loc(
          'Ett angivet kostnadsställe/projekt finns inte i dimensionsregistret eller är arkiverat. Skapa värdet i registret först.',
          'Et angitt kostnadssted/prosjekt finnes ikke i dimensjonsregisteret eller er arkivert. Opprett verdien i registeret først.',
          locale,
        )
      }

      if (structured.code === 'NO_OPEN_PERIOD_FOR_DATE') {
        return loc(
          'Det finns ingen räkenskapsperiod som täcker det valda datumet. Skapa eller öppna räkenskapsåret först.',
          'Det finnes ingen regnskapsperiode som dekker den valgte datoen. Opprett eller åpne regnskapsåret først.',
          locale,
        )
      }

      if (structured.code === 'TARGET_PERIOD_CLOSED') {
        return loc(
          'Räkenskapsåret för det valda datumet är stängt (bokslut) och kan inte återöppnas. Bokför rättelsen i innevarande period istället.',
          'Regnskapsåret for den valgte datoen er stengt (regnskapsavslutning) og kan ikke gjenåpnes. Bokfør rettelsen i inneværende periode i stedet.',
          locale,
        )
      }

      if (structured.code === 'TARGET_PERIOD_LOCKED') {
        const details = structured.details as { lockDate?: string } | undefined
        return details?.lockDate
          ? loc(
              `Räkenskapsperioden för det valda datumet är låst (t.o.m. ${details.lockDate}). Lås upp perioden för att flytta verifikationen dit.`,
              `Regnskapsperioden for den valgte datoen er låst (t.o.m. ${details.lockDate}). Lås opp perioden for å flytte bilaget dit.`,
              locale,
            )
          : loc(
              'Räkenskapsperioden för det valda datumet är låst. Lås upp perioden för att flytta verifikationen dit.',
              'Regnskapsperioden for den valgte datoen er låst. Lås opp perioden for å flytte bilaget dit.',
              locale,
            )
      }

      if (structured.code === 'OB_COMPANY_LOCK_DATE') {
        const details = structured.details as { lockDate?: string } | undefined
        return details?.lockDate
          ? loc(
              `Bokföringen är låst t.o.m. ${details.lockDate} och ingående balanser kan inte korrigeras. Ta bort eller flytta låsdatumet under Inställningar → Bokföring och försök igen.`,
              `Bokføringen er låst t.o.m. ${details.lockDate} og inngående balanser kan ikke korrigeres. Fjern eller flytt låsedatoen under Innstillinger → Bokføring og prøv igjen.`,
              locale,
            )
          : loc(
              'Bokföringen är låst av företagets låsdatum och ingående balanser kan inte korrigeras. Ta bort eller flytta låsdatumet under Inställningar → Bokföring och försök igen.',
              'Bokføringen er låst av foretakets låsedato og inngående balanser kan ikke korrigeres. Fjern eller flytt låsedatoen under Innstillinger → Bokføring og prøv igjen.',
              locale,
            )
      }

      if (structured.code === 'MEANINGLESS_CORRECTION') {
        const details = structured.details as { reason?: string } | undefined
        if (details?.reason === 'no_date_change') {
          return loc(
            'Det nya datumet är samma som det nuvarande: det finns inget att flytta.',
            'Den nye datoen er den samme som den nåværende: det er ingenting å flytte.',
            locale,
          )
        }
        if (details?.reason === 'identical_to_original') {
          return loc(
            'Rättelsen är identisk med originalverifikationen: inget har ändrats.',
            'Rettelsen er identisk med originalbilaget: ingenting er endret.',
            locale,
          )
        }
        return loc(
          'Rättelsen saknar ekonomisk innebörd: varje konto netto till noll. En rättelse måste beskriva en faktisk affärshändelse (BFL 5 kap. 5 §).',
          'Rettelsen mangler økonomisk innhold: hver konto netto til null. En rettelse må beskrive en faktisk forretningshendelse (regnskapsloven § 5-1).',
          locale,
        )
      }

      if (structured.code === 'CORRECTION_CHAIN_TOO_DEEP') {
        const details = structured.details as
          | { depth?: number; chainRootVoucher?: string | null }
          | undefined
        const depthPart =
          typeof details?.depth === 'number'
            ? loc(
                `Kedjan är redan ${details.depth} nivåer djup`,
                `Kjeden er allerede ${details.depth} nivåer dyp`,
                locale,
              )
            : loc('Rättelsekedjan är redan flera nivåer djup', 'Rettelseskjeden er allerede flere nivåer dyp', locale)
        const rootPart = details?.chainRootVoucher
          ? loc(
              ` (ursprungsverifikat ${details.chainRootVoucher})`,
              ` (opprinnelig bilag ${details.chainRootVoucher})`,
              locale,
            )
          : ''
        return loc(
          `${depthPart}${rootPart}. Räkna ut nettoeffekten av hela kedjan och gör EN rättelse istället, eller skicka allow_deep_chain=true för att rätta ändå.`,
          `${depthPart}${rootPart}. Regn ut nettoeffekten av hele kjeden og gjør ÉN rettelse i stedet, eller send allow_deep_chain=true for å rette likevel.`,
          locale,
        )
      }

      if (structured.code === 'BOOKKEEPING_DATABASE_ERROR') {
        // A DB-layer error may carry a user-relevant cause (e.g. period lock
        // trigger). Try the known-pattern map before falling back to the
        // generic "kunde inte sparas" message.
        if (typeof structured.message === 'string') {
          const matched = tryMatchKnownError(structured.message, locale)
          if (matched) return matched
        }
        return loc('Verifikationen kunde inte sparas. Försök igen.', 'Bilaget kunne ikke lagres. Prøv igjen.', locale)
      }

      // Norwegian UI: a known code resolves to the registry's message_no. This
      // sits after every dynamic branch above, so a lock date or an amount still
      // wins over the static text, and it deliberately ignores thrown_message_sv,
      // whose runtime text is composed in Swedish at the throw site.
      if (locale === 'no' && typeof structured.code === 'string') {
        const entry = getErrorEntry(structured.code)
        if (entry?.message_no) return entry.message_no
      }

      if (locale === 'en' && typeof structured.message_en === 'string' && structured.message_en.trim()) {
        return structured.message_en
      }
      if (typeof structured.message === 'string' && structured.message.trim()) {
        // Known codes without a dynamic branch above (e.g. CANNOT_REVERSE_STORNO)
        // carry raw English engine messages: prefer the registry's Swedish
        // message so no typed code surfaces English in a Swedish UI.
        // A code flagged thrown_message_sv composes its Swedish text at the
        // throw site (a date, an amount): that text wins over the static entry.
        if (locale === 'sv' && typeof structured.code === 'string' && !isSwedishUserMessage(structured.message)) {
          const entry = getErrorEntry(structured.code)
          if (entry?.message_sv && !entry.thrown_message_sv) return entry.message_sv
        }
        return structured.message
      }
    }

    // Accumulated per-item validation list from routes that collect several
    // problems before responding, e.g. the salary approve route:
    //   { error: 'Valideringsfel …', details: ['Tomas Tysén: Bankuppgifter saknas …', …] }
    // Surface the specific reasons: otherwise this shape falls all the way
    // through to the generic HTTP-400 message and the user learns nothing.
    if (
      Array.isArray(obj.details) &&
      obj.details.length > 0 &&
      obj.details.every((d) => typeof d === 'string' && d.trim() !== '')
    ) {
      const items = (obj.details as string[]).map((d) => d.trim())
      const shown = items.slice(0, 5).join(' • ')
      const more = items.length > 5
      ? ` (+${items.length - 5} ${locale === 'no' ? 'flere' : 'till'})`
      : ''
      const lead = typeof obj.error === 'string' && obj.error.trim() ? `${obj.error.trim()}: ` : ''
      return `${lead}${shown}${more}`
    }

    // Try Zod validation errors
    const zodMessage = tryParseZodErrors(obj)
    if (zodMessage) return zodMessage

    // Try Postgres error code
    if (typeof obj.code === 'string' && POSTGRES_ERROR_MAP[obj.code]) {
      return pick(POSTGRES_ERROR_MAP[obj.code], locale)
    }

    // Try known error patterns (e.g. locked period triggers)
    for (const field of ['error', 'message'] as const) {
      if (typeof obj[field] === 'string' && obj[field].trim()) {
        const knownError = tryMatchKnownError(obj[field], locale)
        if (knownError) return knownError
      }
    }

    // Try error.message if it's already a good Swedish message
    if (typeof obj.error === 'string' && obj.error.trim()) {
      if (isUserFacingMessage(obj.error, locale)) return obj.error
    }

    if (typeof obj.message === 'string' && obj.message.trim()) {
      if (isUserFacingMessage(obj.message, locale)) return obj.message
    }
  }

  // 3. Error instance
  if (error instanceof Error && error.message.trim()) {
    const knownError = tryMatchKnownError(error.message, locale)
    if (knownError) return knownError
    if (isUserFacingMessage(error.message, locale)) return error.message
  }

  // 4. HTTP status code map
  if (statusCode && HTTP_STATUS_MAP[statusCode]) {
    return pick(HTTP_STATUS_MAP[statusCode], locale)
  }

  // 5. Context-specific fallback
  if (context && CONTEXT_FALLBACKS[context]) {
    return pick(CONTEXT_FALLBACKS[context], locale)
  }

  // 6. Generic fallback
  return pick(GENERIC_FALLBACK, locale)
}

// PSD2 bank-connection OAuth callback errors. The Enable Banking callback
// route redirects the browser back to /settings/banking with a user-facing
// message. The raw provider code/description used to be passed through
// verbatim ("server_error", "invalid_state"), which left a stuck user with
// nothing to act on and support with nothing to answer (issue #1716: the
// Handelsbanken corporate fullmakt failures). Known codes get a Swedish
// explanation; the raw provider description is appended in parentheses so
// the underlying error still reaches the user (and a screenshot to support).
const BANK_CONNECTION_ERROR_MAP: Record<string, SvNo> = {
  server_error: {
    sv: 'Banken kunde inte slutföra godkännandet på grund av ett fel på bankens sida. Försök igen om en stund. Gäller det företagskonton kan banken kräva en fullmakt innan kopplingen godkänns.',
    no: 'Banken kunne ikke fullføre godkjenningen på grunn av en feil på bankens side. Prøv igjen om litt. Gjelder det foretakskontoer, kan banken kreve en fullmakt før koblingen godkjennes.',
  },
  temporarily_unavailable: {
    sv: 'Bankens anslutningstjänst är tillfälligt otillgänglig. Försök igen om en stund.',
    no: 'Bankens tilkoblingstjeneste er midlertidig utilgjengelig. Prøv igjen om litt.',
  },
  invalid_request: {
    sv: 'Banken avvisade anslutningsförfrågan som ogiltig. Försök igen, och kontakta supporten om felet kvarstår.',
    no: 'Banken avviste tilkoblingsforespørselen som ugyldig. Prøv igjen, og kontakt supporten hvis feilen vedvarer.',
  },
  // Internal callback tokens (not from the bank) that were previously shown raw.
  invalid_state: {
    sv: 'Anslutningsförsöket kunde inte matchas mot ett pågående försök. Det kan hända om försöket tog för lång tid eller om ett nytt försök startades under tiden. Starta bankkopplingen på nytt.',
    no: 'Tilkoblingsforsøket kunne ikke matches mot et pågående forsøk. Det kan skje hvis forsøket tok for lang tid, eller hvis et nytt forsøk ble startet i mellomtiden. Start bankkoblingen på nytt.',
  },
  missing_parameters: {
    sv: 'Banken skickade ett ofullständigt svar tillbaka. Starta bankkopplingen på nytt.',
    no: 'Banken sendte et ufullstendig svar tilbake. Start bankkoblingen på nytt.',
  },
  invalid_code_format: {
    sv: 'Banken skickade ett ogiltigt svar tillbaka. Starta bankkopplingen på nytt.',
    no: 'Banken sendte et ugyldig svar tilbake. Start bankkoblingen på nytt.',
  },
}

const BANK_CONNECTION_CANCELLED_MESSAGE: SvNo = {
  sv: 'Anslutningen avbröts hos banken innan den slutfördes. Ingen bankkoppling skapades. Försök igen och slutför alla steg hos banken.',
  no: 'Tilkoblingen ble avbrutt hos banken før den ble fullført. Ingen bankkobling ble opprettet. Prøv igjen og fullfør alle stegene hos banken.',
}

// The bank refused the login itself. For a company account this is almost
// always a missing or unlinked open banking permission (fullmakt) for the
// person logging in: Handelsbanken reports an unlinked "API Företag" fullmakt
// as access_denied "Invalid credentials" (seen from 2026-09-14), which used
// to read as "you cancelled" and sent people back to retry the same thing.
const BANK_CONNECTION_INVALID_CREDENTIALS_MESSAGE: SvNo = {
  sv: 'Banken godkände inte inloggningen. Gäller det företagskonton behöver personen som loggar in ha bankens fullmakt för öppna API:er (open banking) kopplad till sig innan anslutningen kan godkännas. Kontrollera fullmakten hos banken och försök igen.',
  no: 'Banken godkjente ikke innloggingen. Gjelder det foretakskontoer, må personen som logger inn ha bankens fullmakt for åpne API-er (open banking) knyttet til seg før tilkoblingen kan godkjennes. Kontroller fullmakten hos banken og prøv igjen.',
}

// The login worked but the bank has not opened account information to it:
// SEB answers "You cannot retrieve account information, please ask PSU to
// contact bank". Retrying cannot help; the bank has to enable access.
const BANK_CONNECTION_ACCOUNT_ACCESS_MESSAGE: SvNo = {
  sv: 'Banken har inte gett den här inloggningen tillgång till kontoinformation. Be banken aktivera åtkomst via öppna API:er (open banking) för kontot och försök sedan igen.',
  no: 'Banken har ikke gitt denne innloggingen tilgang til kontoinformasjon. Be banken aktivere tilgang via åpne API-er (open banking) for kontoen, og prøv deretter igjen.',
}

const BANK_CONNECTION_SESSION_EXPIRED_MESSAGE: SvNo = {
  sv: 'Bankens inloggningssession hann gå ut innan anslutningen slutfördes. Starta bankkopplingen på nytt och slutför alla steg hos banken direkt.',
  no: 'Bankens innloggingsøkt utløp før tilkoblingen ble fullført. Start bankkoblingen på nytt og fullfør alle stegene hos banken med en gang.',
}

const BANK_CONNECTION_FALLBACK_MESSAGE: SvNo = {
  sv: 'Banken avvisade anslutningen. Försök igen, och kontakta supporten om felet kvarstår.',
  no: 'Banken avviste tilkoblingen. Prøv igjen, og kontakt supporten hvis feilen vedvarer.',
}

// Same shape the callback route keys its expired-vs-error decision on.
const BANK_SESSION_EXPIRY_PATTERN =
  /session.?expired|expired.?session|closed.?session|session.?closed|invalid.?session|session.?not.?found/i

/**
 * What an `access_denied` (or cancel-worded) callback actually meant, read
 * from the provider description. `null` for every other code.
 *
 *  - `cancelled`: the person stopped at the bank (cancel/abort/denied consent,
 *    or a bare access_denied with no description). Expected outcome.
 *  - `invalid_credentials`: the bank refused the login. On a company account
 *    that is the missing or unlinked open banking fullmakt.
 *  - `account_access`: login accepted, account information not opened to it.
 *  - `other`: access_denied with a description we do not recognise.
 *
 * Shared by the message mapper, the callback's log level and the settings
 * page hints so the three cannot drift apart (the previous split is exactly
 * how a real fullmakt failure got labelled "you cancelled" for a week).
 */
export type BankConnectionDenialReason =
  | 'cancelled'
  | 'invalid_credentials'
  | 'account_access'
  | 'other'

const BANK_DENIAL_CANCEL_PATTERN = /cancel|abort|denied|declin/i
const BANK_DENIAL_CREDENTIALS_PATTERN = /invalid.?credential|wrong.?credential|bad.?credential|authentication.?failed|login.?failed|incorrect.?(password|pin|credential)/i
const BANK_DENIAL_ACCOUNT_ACCESS_PATTERN =
  /cannot.?retrieve.?account|account.?information|contact.?(the.?)?bank|ask.?psu|psu.?(has|must|should|needs)|not.?(been.?)?(authori[sz]ed|entitled|permitted)|no.?(access|permission).?to.?account/i

export function classifyBankConnectionDenial(
  errorCode: string,
  errorDescription?: string | null
): BankConnectionDenialReason | null {
  const code = errorCode.trim()
  const description = errorDescription?.trim() || null

  // A cancel can arrive under any code ("server_error: Cancelled by user").
  // Matched on the description alone: the code access_denied itself contains
  // "denied" and must not turn every denial into a cancel.
  if (description && BANK_DENIAL_CANCEL_PATTERN.test(description)) return 'cancelled'
  if (code !== 'access_denied') return null
  if (!description) return 'cancelled'
  if (BANK_DENIAL_CREDENTIALS_PATTERN.test(description)) return 'invalid_credentials'
  if (BANK_DENIAL_ACCOUNT_ACCESS_PATTERN.test(description)) return 'account_access'
  return 'other'
}

/**
 * Map a PSD2 authorization callback outcome (OAuth error code plus optional
 * provider description) to a user-facing message.
 *
 * Defaults to Swedish because the bank redirect carries no locale, and the
 * server-side callers (logging, the public error catalogue) rely on Swedish.
 * Callers that know the visitor's locale pass it, so a Norwegian session is
 * not handed Swedish prose about the bank connection.
 */
export function getBankConnectionErrorMessage(
  errorCode: string,
  errorDescription?: string | null,
  locale: ErrorLocale = 'sv',
): string {
  const code = errorCode.trim()
  const description = errorDescription?.trim() || null
  const combined = `${code} ${description ?? ''}`

  const denial = classifyBankConnectionDenial(code, description)
  // User cancelled at the bank: an expected outcome, keep it clean without
  // echoing the provider text back.
  if (denial === 'cancelled') {
    return pickSvNo(BANK_CONNECTION_CANCELLED_MESSAGE, locale)
  }
  // The two denial shapes a retry cannot fix get their own explanation. The
  // bank's own sentence still rides along in parentheses (support reads it
  // off the screenshot).
  if (denial === 'invalid_credentials') {
    return `${pickSvNo(BANK_CONNECTION_INVALID_CREDENTIALS_MESSAGE, locale)} (${description})`
  }
  if (denial === 'account_access') {
    return `${pickSvNo(BANK_CONNECTION_ACCOUNT_ACCESS_MESSAGE, locale)} (${description})`
  }

  let base: string
  if (BANK_SESSION_EXPIRY_PATTERN.test(combined)) {
    base = pickSvNo(BANK_CONNECTION_SESSION_EXPIRED_MESSAGE, locale)
  } else {
    const known = BANK_CONNECTION_ERROR_MAP[code]
    base = pickSvNo(known ?? BANK_CONNECTION_FALLBACK_MESSAGE, locale)
  }

  // Surface the underlying provider error: without it the user (and support,
  // via a screenshot) cannot tell one failure from another.
  return description && description !== code ? `${base} (${description})` : base
}

const PROVIDER_REASON_PREFIX: Bilingual = {
  sv: 'Leverantörens svar',
  en: 'Provider response',
  no: 'Leverandørens svar',
}

/**
 * The provider refused ONE register while the grant itself keeps working: a
 * Fortnox account without rights to leverantörsregistret, a Bokio token with a
 * narrower scope. Never say "återanslut" here, the reconnect re-mints the same
 * grant and hits the same 403.
 *
 * The base copy is the registry's PROVIDER_RESOURCE_FORBIDDEN entry, not a
 * second copy of it: the same sentence has to reach the toast, the API
 * envelope and the public error catalogue (lib/docs/content/errors.ts renders
 * the registry verbatim). The entry's existence is locked by
 * lib/errors/__tests__/structured-errors.test.ts.
 *
 * `reason` is the provider's own sentence (e.g. Fortnox'
 * "Saknar behörighet för leverantörsregister."), appended verbatim because it
 * is the only part that names the register. Omitted when the provider sent an
 * opaque body, which Bokio does.
 */
export function getProviderResourceForbiddenMessage(
  reason?: string | null,
  locale: ErrorLocale = 'sv',
): string {
  const entry = getErrorEntry('PROVIDER_RESOURCE_FORBIDDEN')!
  const base = pick(
    { sv: entry.message_sv, en: entry.message_en, no: entry.message_no },
    locale,
  )
  const detail = reason?.trim()
  return detail ? `${base} ${pick(PROVIDER_REASON_PREFIX, locale)}: "${detail}"` : base
}

/**
 * Helper that parses a Response body and returns a user-friendly error message.
 */
export async function getResponseErrorMessage(
  response: Response,
  context?: ErrorContext,
  locale?: ErrorLocale,
): Promise<string> {
  try {
    const body = await response.json()
    return getErrorMessage(body, { context, statusCode: response.status, locale })
  } catch {
    return getErrorMessage(null, { context, statusCode: response.status, locale })
  }
}
