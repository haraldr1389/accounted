/**
 * Norwegian ('no') coverage for the error surface.
 *
 * The fork adds a third locale, so three things have to hold that no upstream
 * test checks: every registry entry carries message_no, a known code resolves
 * to Norwegian instead of Swedish, and a free-text Norwegian sentence is
 * recognised as user-facing rather than replaced by the generic fallback.
 */
import { describe, it, expect } from 'vitest'
import { getErrorMessage, isNorwegianUserMessage, looksLikeUserFacingNorwegian } from '../get-error-message'
import { getErrorEntry, listErrorCodes } from '../structured-errors'
import type { StructuredErrorEntry } from '../structured-errors'

function allEntries(): Array<{ code: string; entry: StructuredErrorEntry }> {
  return listErrorCodes().map((code) => ({ code, entry: getErrorEntry(code)! }))
}

// A sentence that is unmistakably Norwegian bokmål and Swedish at the same time
// is impossible to write, so the assertions below lean on words that differ.
const SWEDISH_ONLY = /\b(och|att|är|för|från|till|dagar|månad|månader|hämta|kunde inte|försök|stängd|ogiltig|belopp|leverantör|räkenskapsår|verifikation|moms)\b/i
const NYNORSK_ONLY = /\b(ikkje|frå|vart|utan|dei|ein|eit|berre|sjølv|noko|kva|eg|mogeleg|følgjer|veke|vekar)\b/i

describe('message_no registry coverage', () => {
  it('every entry carries a non-empty message_no', () => {
    const entries = allEntries()
    expect(entries.length).toBeGreaterThan(700)
    const missing = entries
      .filter((e) => typeof e.entry.message_no !== 'string' || !e.entry.message_no.trim())
      .map((e) => e.code)
    expect(missing).toEqual([])
  })

  it('no message_no is left in Swedish or nynorsk', () => {
    const offenders = allEntries()
      .filter((e) => SWEDISH_ONLY.test(e.entry.message_no) || NYNORSK_ONLY.test(e.entry.message_no))
      .map((e) => `${e.code}: ${e.entry.message_no}`)
    expect(offenders).toEqual([])
  })

  it('message_no differs from message_sv for every entry', () => {
    // Identical text would mean the entry was copied, not translated. Proper
    // nouns and acronym-only messages are the exception, so allow those whose
    // message_sv has no lowercase word at all.
    const copied = allEntries()
      .filter((e) => e.entry.message_no === e.entry.message_sv)
      .filter((e) => /[a-zæøå]{3}/.test(e.entry.message_sv))
      .map((e) => e.code)
    expect(copied).toEqual([])
  })
})

describe('getErrorMessage with locale no', () => {
  it('resolves a known code to Norwegian, not Swedish', () => {
    const message = getErrorMessage({ error: { code: 'NOT_FOUND' } }, { locale: 'no' })
    expect(message).toBe('Ressursen kunne ikke finnes.')
    expect(SWEDISH_ONLY.test(message)).toBe(false)
  })

  it('resolves a different known code to Norwegian as well', () => {
    const message = getErrorMessage({ error: { code: 'RATE_LIMITED' } }, { locale: 'no' })
    expect(message).toBe('For mange forespørsler. Vent litt og prøv igjen.')
  })

  it('still returns Swedish when the active locale is sv', () => {
    // The realistic envelope carries a message. For Swedish the upstream path
    // prefers the registry text over an English engine message, unchanged.
    const message = getErrorMessage(
      { error: { code: 'NOT_FOUND', message: 'Resource not found.' } },
      { locale: 'sv' },
    )
    expect(message).toBe('Resursen kunde inte hittas.')
  })

  it('leaves the upstream default locale untouched', () => {
    // A code-only envelope is degenerate: errorResponse() always carries a
    // message. For sv/en such an input falls through to the generic fallback,
    // and that behavior is deliberately unchanged.
    expect(getErrorMessage({ error: { code: 'NOT_FOUND' } }))
      .toBe('Något gick fel. Försök igen.')
  })

  it('still returns English for locale en', () => {
    const message = getErrorMessage({ error: { code: 'NOT_FOUND' } }, { locale: 'en' })
    expect(message).toBe('Resource not found.')
  })

  it('uses the Norwegian HTTP-status fallback', () => {
    expect(getErrorMessage(null, { statusCode: 403, locale: 'no' }))
      .toBe('Du har ikke tilgang til å utføre denne handlingen.')
    expect(getErrorMessage(null, { statusCode: 403, locale: 'sv' }))
      .toBe('Du har inte behörighet att utföra denna åtgärd.')
  })

  it('uses the Norwegian context fallback', () => {
    expect(getErrorMessage(null, { context: 'journal_entry', locale: 'no' }))
      .toBe('Kunne ikke behandle bilaget. Prøv igjen.')
  })

  it('uses the Norwegian generic fallback', () => {
    expect(getErrorMessage(null, {}, )).toBe('Något gick fel. Försök igen.')
    expect(getErrorMessage(null, { locale: 'no' })).toBe('Noe gikk galt. Prøv igjen.')
  })

  it('translates a known Swedish engine pattern to Norwegian', () => {
    expect(getErrorMessage('Period is already locked', { locale: 'no' }))
      .toBe('Perioden er allerede låst.')
    expect(getErrorMessage('Period is already locked', { locale: 'sv' }))
      .toBe('Perioden är redan låst.')
  })

  it('rewrites the period-lock trigger sentence into Norwegian', () => {
    const message = getErrorMessage('Bokföringen är låst t.o.m. 2026-06-30.', { locale: 'no' })
    expect(message).toBe('Bokføringen er låst t.o.m. 2026-06-30.')
  })
})

describe('Norwegian free-text detection', () => {
  it('accepts a Norwegian sentence from a route', () => {
    expect(getErrorMessage('Ingen bilag funnet for perioden.', { locale: 'no' }))
      .toBe('Ingen bilag funnet for perioden.')
  })

  it('still accepts a Swedish sentence for locale no, rather than falling back', () => {
    // The engine composes its free text in Swedish; a specific sentence in the
    // wrong language beats the generic fallback until the engine emits
    // Norwegian (documented in isUserFacingMessage).
    expect(getErrorMessage('Ingen verifikation hittades i perioden.', { locale: 'no' }))
      .toBe('Ingen verifikation hittades i perioden.')
  })

  it('never passes a technical leak through', () => {
    const leak = 'TypeError: x is not a function at fn (file.ts:1:2)'
    expect(getErrorMessage(leak, { locale: 'no' })).toBe('Noe gikk galt. Prøv igjen.')
  })

  it('isNorwegianUserMessage recognises bokmål and rejects technical noise', () => {
    expect(isNorwegianUserMessage('Kunne ikke lagre bilaget.')).toBe(true)
    expect(isNorwegianUserMessage('Du har ikke tilgang til å utføre denne handlingen.')).toBe(true)
    expect(isNorwegianUserMessage('Fetch failed')).toBe(false)
    expect(isNorwegianUserMessage('PGRST116: 0 rows')).toBe(false)
  })

  it('looksLikeUserFacingNorwegian scores ø/æ and strong words', () => {
    expect(looksLikeUserFacingNorwegian('Ingen økt funnet.')).toBe(true)
    expect(looksLikeUserFacingNorwegian('Kunne ikke hente listen.')).toBe(true)
    expect(looksLikeUserFacingNorwegian('Failed to fetch customer')).toBe(false)
  })
})
