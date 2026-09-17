#!/usr/bin/env python3
"""Add Norwegian user-message detection and wire a locale-aware passthrough gate."""
from pathlib import Path

P = Path('/Users/harald/projects/accounted/lib/errors/get-error-message.ts')
t = P.read_text(encoding='utf-8')

def rep(old, new, label):
    global t
    n = t.count(old)
    if n != 1:
        raise SystemExit(f'FAIL [{label}]: expected 1 occurrence, found {n}')
    t = t.replace(old, new)

# 1. Norwegian detector, right after the Swedish one
rep(
"""export function looksLikeUserFacingSwedish(message: string): boolean {
  const text = message.trim()
  if (!text) return false
  if (TECHNICAL_LEAK_PATTERNS.some((p) => p.test(text))) return false
  if (/[åäöÅÄÖ]/.test(text)) return true
  if (SWEDISH_STRONG_RE.test(text)) return true
  const weak = new Set<string>()
  for (const m of text.matchAll(SWEDISH_WEAK_RE)) weak.add(m[2].toLowerCase())
  return weak.size >= 2
}""",
"""export function looksLikeUserFacingSwedish(message: string): boolean {
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
}""",
'norwegian detector')

# 2. registry lookup for 'no', placed after every dynamic branch
rep(
"""      if (locale === 'en' && typeof structured.message_en === 'string' && structured.message_en.trim()) {
        return structured.message_en
      }""",
"""      // Norwegian UI: a known code resolves to the registry's message_no. This
      // sits after every dynamic branch above, so a lock date or an amount still
      // wins over the static text, and it deliberately ignores thrown_message_sv,
      // whose runtime text is composed in Swedish at the throw site.
      if (locale === 'no' && typeof structured.code === 'string') {
        const entry = getErrorEntry(structured.code)
        if (entry?.message_no) return entry.message_no
      }

      if (locale === 'en' && typeof structured.message_en === 'string' && structured.message_en.trim()) {
        return structured.message_en
      }""",
'registry no lookup')

# 3. route the four raw-string passthroughs through the locale-aware gate
rep(
"""  if (typeof error === 'string' && error.trim()) {
    if (isSwedishUserMessage(error)) return error""",
"""  if (typeof error === 'string' && error.trim()) {
    if (isUserFacingMessage(error, locale)) return error""",
'string passthrough')

rep(
"""    if (typeof obj.error === 'string' && obj.error.trim()) {
      if (isSwedishUserMessage(obj.error)) return obj.error
    }

    if (typeof obj.message === 'string' && obj.message.trim()) {
      if (isSwedishUserMessage(obj.message)) return obj.message
    }""",
"""    if (typeof obj.error === 'string' && obj.error.trim()) {
      if (isUserFacingMessage(obj.error, locale)) return obj.error
    }

    if (typeof obj.message === 'string' && obj.message.trim()) {
      if (isUserFacingMessage(obj.message, locale)) return obj.message
    }""",
'object passthrough')

rep(
"""    const knownError = tryMatchKnownError(error.message, locale)
    if (knownError) return knownError
    if (isSwedishUserMessage(error.message)) return error.message""",
"""    const knownError = tryMatchKnownError(error.message, locale)
    if (knownError) return knownError
    if (isUserFacingMessage(error.message, locale)) return error.message""",
'Error instance passthrough')

P.write_text(t, encoding='utf-8')
print('norwegian detection wired')
