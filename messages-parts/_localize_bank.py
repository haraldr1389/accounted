#!/usr/bin/env python3
"""Make the bank-connection copy locale-aware (Swedish/Norwegian pair)."""
from pathlib import Path

P = Path('/Users/harald/projects/accounted/lib/errors/get-error-message.ts')
t = P.read_text(encoding='utf-8')

def rep(old, new, label):
    global t
    n = t.count(old)
    if n != 1:
        raise SystemExit(f'FAIL [{label}]: expected 1 occurrence, found {n}')
    t = t.replace(old, new)

# ---------- the code→message map ----------
rep(
"""const BANK_CONNECTION_ERROR_MAP: Record<string, string> = {
  server_error:
    'Banken kunde inte slutföra godkännandet på grund av ett fel på bankens sida. Försök igen om en stund. Gäller det företagskonton kan banken kräva en fullmakt innan kopplingen godkänns.',
  temporarily_unavailable:
    'Bankens anslutningstjänst är tillfälligt otillgänglig. Försök igen om en stund.',
  invalid_request:
    'Banken avvisade anslutningsförfrågan som ogiltig. Försök igen, och kontakta supporten om felet kvarstår.',
  // Internal callback tokens (not from the bank) that were previously shown raw.
  invalid_state:
    'Anslutningsförsöket kunde inte matchas mot ett pågående försök. Det kan hända om försöket tog för lång tid eller om ett nytt försök startades under tiden. Starta bankkopplingen på nytt.',
  missing_parameters:
    'Banken skickade ett ofullständigt svar tillbaka. Starta bankkopplingen på nytt.',
  invalid_code_format:
    'Banken skickade ett ogiltigt svar tillbaka. Starta bankkopplingen på nytt.',
}""",
"""const BANK_CONNECTION_ERROR_MAP: Record<string, SvNo> = {
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
}""",
'map')

# ---------- the single-sentence constants ----------
rep(
"""const BANK_CONNECTION_CANCELLED_MESSAGE =
  'Anslutningen avbröts hos banken innan den slutfördes. Ingen bankkoppling skapades. Försök igen och slutför alla steg hos banken.'""",
"""const BANK_CONNECTION_CANCELLED_MESSAGE: SvNo = {
  sv: 'Anslutningen avbröts hos banken innan den slutfördes. Ingen bankkoppling skapades. Försök igen och slutför alla steg hos banken.',
  no: 'Tilkoblingen ble avbrutt hos banken før den ble fullført. Ingen bankkobling ble opprettet. Prøv igjen og fullfør alle stegene hos banken.',
}""",
'cancelled')

rep(
"""const BANK_CONNECTION_INVALID_CREDENTIALS_MESSAGE =
  'Banken godkände inte inloggningen. Gäller det företagskonton behöver personen som loggar in ha bankens fullmakt för öppna API:er (open banking) kopplad till sig innan anslutningen kan godkännas. Kontrollera fullmakten hos banken och försök igen.'""",
"""const BANK_CONNECTION_INVALID_CREDENTIALS_MESSAGE: SvNo = {
  sv: 'Banken godkände inte inloggningen. Gäller det företagskonton behöver personen som loggar in ha bankens fullmakt för öppna API:er (open banking) kopplad till sig innan anslutningen kan godkännas. Kontrollera fullmakten hos banken och försök igen.',
  no: 'Banken godkjente ikke innloggingen. Gjelder det foretakskontoer, må personen som logger inn ha bankens fullmakt for åpne API-er (open banking) knyttet til seg før tilkoblingen kan godkjennes. Kontroller fullmakten hos banken og prøv igjen.',
}""",
'invalid_credentials')

rep(
"""const BANK_CONNECTION_ACCOUNT_ACCESS_MESSAGE =
  'Banken har inte gett den här inloggningen tillgång till kontoinformation. Be banken aktivera åtkomst via öppna API:er (open banking) för kontot och försök sedan igen.'""",
"""const BANK_CONNECTION_ACCOUNT_ACCESS_MESSAGE: SvNo = {
  sv: 'Banken har inte gett den här inloggningen tillgång till kontoinformation. Be banken aktivera åtkomst via öppna API:er (open banking) för kontot och försök sedan igen.',
  no: 'Banken har ikke gitt denne innloggingen tilgang til kontoinformasjon. Be banken aktivere tilgang via åpne API-er (open banking) for kontoen, og prøv deretter igjen.',
}""",
'account_access')

rep(
"""const BANK_CONNECTION_SESSION_EXPIRED_MESSAGE =
  'Bankens inloggningssession hann gå ut innan anslutningen slutfördes. Starta bankkopplingen på nytt och slutför alla steg hos banken direkt.'""",
"""const BANK_CONNECTION_SESSION_EXPIRED_MESSAGE: SvNo = {
  sv: 'Bankens inloggningssession hann gå ut innan anslutningen slutfördes. Starta bankkopplingen på nytt och slutför alla steg hos banken direkt.',
  no: 'Bankens innloggingsøkt utløp før tilkoblingen ble fullført. Start bankkoblingen på nytt og fullfør alle stegene hos banken med en gang.',
}""",
'session_expired')

rep(
"""const BANK_CONNECTION_FALLBACK_MESSAGE =
  'Banken avvisade anslutningen. Försök igen, och kontakta supporten om felet kvarstår.'""",
"""const BANK_CONNECTION_FALLBACK_MESSAGE: SvNo = {
  sv: 'Banken avvisade anslutningen. Försök igen, och kontakta supporten om felet kvarstår.',
  no: 'Banken avviste tilkoblingen. Prøv igjen, og kontakt supporten hvis feilen vedvarer.',
}""",
'fallback')

# ---------- doc comment ----------
rep(
"""/**
 * Map a PSD2 authorization callback outcome (OAuth error code plus optional
 * provider description) to a Swedish user message. Always Swedish: the bank
 * redirect carries no locale, and bank-connection surfaces follow the
 * user-facing-errors-are-Swedish rule.
 */
export function getBankConnectionErrorMessage(
  errorCode: string,
  errorDescription?: string | null
): string {""",
"""/**
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
): string {""",
'doc comment')

# ---------- the function body ----------
rep(
"""  if (denial === 'cancelled') {
    return BANK_CONNECTION_CANCELLED_MESSAGE
  }""",
"""  if (denial === 'cancelled') {
    return pickSvNo(BANK_CONNECTION_CANCELLED_MESSAGE, locale)
  }""",
'cancelled return')

rep(
"""  if (denial === 'invalid_credentials') {
    return `${BANK_CONNECTION_INVALID_CREDENTIALS_MESSAGE} (${description})`
  }
  if (denial === 'account_access') {
    return `${BANK_CONNECTION_ACCOUNT_ACCESS_MESSAGE} (${description})`
  }""",
"""  if (denial === 'invalid_credentials') {
    return `${pickSvNo(BANK_CONNECTION_INVALID_CREDENTIALS_MESSAGE, locale)} (${description})`
  }
  if (denial === 'account_access') {
    return `${pickSvNo(BANK_CONNECTION_ACCOUNT_ACCESS_MESSAGE, locale)} (${description})`
  }""",
'denial returns')

rep(
"""  let base: string
  if (BANK_SESSION_EXPIRY_PATTERN.test(combined)) {
    base = BANK_CONNECTION_SESSION_EXPIRED_MESSAGE
  } else {
    base = BANK_CONNECTION_ERROR_MAP[code] ?? BANK_CONNECTION_FALLBACK_MESSAGE
  }""",
"""  let base: string
  if (BANK_SESSION_EXPIRY_PATTERN.test(combined)) {
    base = pickSvNo(BANK_CONNECTION_SESSION_EXPIRED_MESSAGE, locale)
  } else {
    const known = BANK_CONNECTION_ERROR_MAP[code]
    base = pickSvNo(known ?? BANK_CONNECTION_FALLBACK_MESSAGE, locale)
  }""",
'base selection')

P.write_text(t, encoding='utf-8')
print('bank block localized')
