/**
 * Canonical registry of structured error codes used by both REST routes and
 * the MCP server.
 *
 * Each entry defines:
 *   - httpStatus: status returned by errorResponse() for this code
 *   - message_sv: Swedish user-facing message (consumed by toast)
 *   - message_en: English message for agents and developer logs
 *   - remediation: optional pointer to a fix (tool/resource/description)
 *
 * Adding a new code = add a row here.
 *
 * Codes follow `<DOMAIN>_<OPERATION>_<CAUSE>` naming. Stable forever once
 * shipped: agents pattern-match on them.
 */

export interface StructuredErrorRemediation {
  description: string
  tool?: string
  args?: Record<string, unknown>
  resource?: string
}

export interface StructuredErrorEntry {
  httpStatus: number
  message_sv: string
  /**
   * Norwegian bokmål counterpart of message_sv, shown when the active UI
   * locale is 'no'. Required like message_en: the registry-wide test pins
   * that every entry carries all three, so a new code cannot ship with a
   * locale hole.
   */
  message_no: string
  message_en: string
  remediation?: StructuredErrorRemediation
  /**
   * When true, agents and clients may retry the same request after a short
   * backoff. Set only on truly transient failures (DB blip, external API
   * timeout, rate limit). Permanent failures (validation, not found, period
   * locked) MUST stay false: retrying won't change the outcome.
   */
  retryable?: boolean
  /**
   * When true, the thrower composes the Swedish message at runtime (a date,
   * an amount) and getErrorMessage() passes that message through verbatim;
   * message_sv is only the static fallback for an envelope that carries no
   * message. Without this flag a registered code always resolves to
   * message_sv, which would drop the runtime detail.
   */
  thrown_message_sv?: boolean
}

// ─────────────────────────────────────────────────────────────────
// Generic / cross-cutting codes
// ─────────────────────────────────────────────────────────────────

const GENERIC: Record<string, StructuredErrorEntry> = {
  UNKNOWN_ERROR: {
    httpStatus: 500,
    message_sv: 'Något gick fel. Försök igen.',
    message_no: 'Noe gikk galt. Prøv igjen.',
    message_en: 'An unexpected error occurred.',
  },
  // Unclassified-but-transient failures (DB deadlock/timeout, connection
  // drop, upstream 5xx/429) inferred by isTransientFailure() when no
  // specific code applies. Stable code so agents can dispatch on it.
  TRANSIENT_ERROR: {
    httpStatus: 503,
    message_sv: 'Tillfälligt fel: försök igen om en stund.',
    message_no: 'Midlertidig feil: prøv igjen om litt.',
    message_en: 'Transient failure: retry the same request after a short backoff.',
    retryable: true,
  },
  INTERNAL_ERROR: {
    httpStatus: 500,
    message_sv: 'Ett oväntat serverfel uppstod. Försök igen senare.',
    message_no: 'Det oppstod en uventet serverfeil. Prøv igjen senere.',
    message_en: 'Internal server error.',
  },
  VALIDATION_ERROR: {
    httpStatus: 400,
    message_sv: 'Förfrågan innehåller ogiltiga uppgifter.',
    message_no: 'Forespørselen inneholder ugyldige opplysninger.',
    message_en: 'Validation error.',
  },
  UNAUTHORIZED: {
    httpStatus: 401,
    message_sv: 'Din session har gått ut. Logga in igen.',
    message_no: 'Økten din er utløpt. Logg inn på nytt.',
    message_en: 'Authentication required.',
  },
  MFA_REQUIRED: {
    httpStatus: 403,
    message_sv: 'Tvåstegsverifiering krävs för att utföra åtgärden.',
    message_no: 'Tofaktorautentisering er påkrevd for å utføre handlingen.',
    message_en: 'MFA verification required.',
  },
  FORBIDDEN: {
    httpStatus: 403,
    message_sv: 'Du har inte behörighet att utföra denna åtgärd.',
    message_no: 'Du har ikke tilgang til å utføre denne handlingen.',
    message_en: 'Insufficient permissions.',
  },
  // A Postgres privilege/RLS denial (42501) on a write the application
  // expected to succeed: a server-side configuration bug (e.g. a SECURITY
  // INVOKER trigger writing to a policy-less RLS table), not a user-permission
  // problem. Kept distinct from FORBIDDEN (which blames the user) and from
  // INTERNAL_ERROR (which hides the failure mode from diagnostics).
  DB_PERMISSION_DENIED: {
    httpStatus: 500,
    message_sv: 'Ett behörighetsfel i databasen stoppade åtgärden. Kontakta supporten om felet kvarstår.',
    message_no: 'En tilgangsfeil i databasen stoppet handlingen. Kontakt supporten hvis feilen vedvarer.',
    message_en: 'A database permission (RLS) denial blocked the write. This indicates a server-side misconfiguration.',
  },
  NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Resursen kunde inte hittas.',
    message_no: 'Ressursen kunne ikke finnes.',
    message_en: 'Resource not found.',
  },
  CONFLICT: {
    httpStatus: 409,
    message_sv: 'En konflikt uppstod. Ladda om sidan och försök igen.',
    message_no: 'Det oppstod en konflikt. Last inn siden på nytt og prøv igjen.',
    message_en: 'Conflict.',
  },
  RATE_LIMITED: {
    httpStatus: 429,
    message_sv: 'För många förfrågningar. Vänta en stund och försök igen.',
    message_no: 'For mange forespørsler. Vent litt og prøv igjen.',
    message_en: 'Rate limit exceeded.',
    retryable: true,
  },
  NOT_IMPLEMENTED: {
    httpStatus: 501,
    message_sv: 'Funktionen är inte implementerad ännu.',
    message_no: 'Funksjonen er ikke implementert ennå.',
    message_en: 'This feature is accepted by the schema but not yet implemented.',
  },
  COMPANY_CONTEXT_MISSING: {
    httpStatus: 400,
    message_sv: 'Ingen aktiv företagskontext. Välj ett företag och försök igen.',
    message_no: 'Ingen aktiv selskapskontekst. Velg et selskap og prøv igjen.',
    message_en: 'No active company context resolved for the request.',
  },
  IDEMPOTENCY_KEY_REUSE: {
    httpStatus: 409,
    message_sv: 'Idempotensnyckeln har redan använts med en annan begäran.',
    message_no: 'Idempotensnøkkelen er allerede brukt med en annen forespørsel.',
    message_en: 'Idempotency key was previously used with a different request body.',
    remediation: {
      description:
        'Use a fresh UUID for a new operation, or send the original request body to replay.',
    },
  },
  INSUFFICIENT_SCOPE: {
    httpStatus: 403,
    message_sv: 'API-nyckeln saknar behörighet för denna åtgärd.',
    message_no: 'API-nøkkelen mangler tilgang for denne handlingen.',
    message_en: 'The current API key does not have the required scope.',
    remediation: {
      description:
        'Mint a new key with the missing scope or grant it through the API key settings.',
      resource: 'Accounted://capabilities',
    },
  },
  TEST_KEY_WRITE_BLOCKED: {
    httpStatus: 403,
    message_sv:
      'Den här åtgärden kan inte simuleras och är därför inte tillgänglig med en testnyckel. Använd en live-nyckel.',
    message_no: 'Denne handlingen kan ikke simuleres og er derfor ikke tilgjengelig med en testnøkkel. Bruk en live-nøkkel.',
    message_en:
      'This endpoint cannot be simulated, so it is not available with a test key. Test keys force dry-run on every write; use a live key for endpoints that do not support dry-run.',
    remediation: {
      description: 'Use a live key for this endpoint, or pick an endpoint that supports dry-run.',
    },
  },
}

// ─────────────────────────────────────────────────────────────────
// Bookkeeping engine codes (already used by lib/bookkeeping/errors.ts)
// ─────────────────────────────────────────────────────────────────

const BOOKKEEPING: Record<string, StructuredErrorEntry> = {
  // An approval-authority refusal, NOT a write failure: the operation is still
  // staged and a human can approve it in /pending. retryable is set FALSE
  // explicitly because getStructuredError falls back to isTransientFailure(),
  // and the message must never contain the words "rate limit": that phrase is
  // in TRANSIENT_MESSAGE_PATTERNS and would flip a permanent refusal into a
  // retryable one, which is how agents end up in retry storms.
  UNATTENDED_COMMIT_LIMIT_EXCEEDED: {
    httpStatus: 403,
    message_sv:
      'Beloppet överstiger vad den här API-nyckeln får bokföra utan mänskligt godkännande. Underlaget ligger kvar och kan godkännas i Accounted.',
    message_no: 'Beløpet overstiger det denne API-nøkkelen kan bokføre uten menneskelig godkjenning. Underlaget ligger fortsatt og kan godkjennes i Accounted.',
    message_en:
      'Amount exceeds what this API key may post without human approval. The operation is preserved and can be approved in the app.',
    retryable: false,
    remediation: {
      description:
        'Do not retry, and do not split the entry into smaller ones: one affärshändelse is one verifikat (BFL 5 kap. 6 §). Ask a human to approve the staged operation in Accounted, or have the key owner raise the limit in API key settings. details.attempted and details.limit carry the numbers.',
    },
  },
  ACCOUNTS_NOT_IN_CHART: {
    httpStatus: 400,
    message_sv: 'Konton saknas i kontoplanen.',
    message_no: 'Kontoer mangler i kontoplanen.',
    message_en: 'One or more BAS accounts are not active in the chart of accounts.',
    remediation: {
      description:
        'Activate the missing accounts via bookkeeping settings, or use a different category.',
      resource: 'Accounted://chart-of-accounts',
    },
  },
  // Distinct from a plain duplicate: the account number is taken by a row the
  // company deactivated. Creating it again can never succeed (the unique
  // constraint counts inactive rows), so the only way forward is reactivation.
  // Callers key on this code to offer that instead of a dead-end 409.
  ACCOUNT_EXISTS_INACTIVE: {
    httpStatus: 409,
    message_sv: 'Kontot finns redan i din kontoplan men är inaktiverat.',
    message_no: 'Kontoen finnes allerede i kontoplanen din, men er inaktiv.',
    message_en:
      'The account number already exists in this company chart of accounts but is deactivated.',
    remediation: {
      description:
        'Reactivate the existing account instead of creating it: POST /api/bookkeeping/accounts/activate with { account_numbers: [number] }.',
      resource: 'Accounted://chart-of-accounts',
    },
  },
  JOURNAL_ENTRY_NOT_BALANCED: {
    httpStatus: 400,
    message_sv: 'Verifikationen balanserar inte.',
    message_no: 'Bilaget balanserer ikke.',
    message_en: 'Debits and credits do not match.',
    remediation: {
      description: 'Recalculate the lines so totals are equal before retrying.',
    },
  },
  JOURNAL_LINE_NEGATIVE_AMOUNT: {
    httpStatus: 400,
    message_sv: 'En verifikationsrad har ett negativt belopp. Boka beloppet på motsatt sida i stället.',
    message_no: 'En bilagslinje har et negativt beløp. Bokfør beløpet på motsatt side i stedet.',
    message_en: 'A journal line has a negative amount. Book it on the opposite side instead.',
    remediation: {
      description:
        'Every line carries one non-negative side: move a negative debit to credit_amount (and vice versa) before retrying.',
    },
  },
  JOURNAL_LINE_BOTH_SIDES_NONZERO: {
    httpStatus: 400,
    message_sv: 'En verifikationsrad kan inte ha både debet och kredit nollskilda.',
    message_no: 'En bilagslinje kan ikke ha både debet og kredit ulik null.',
    message_en: 'A journal entry line cannot have both debit and credit non-zero.',
    remediation: {
      description:
        'Every line carries one side: net the two amounts onto the larger side, or split the line in two, before retrying.',
    },
  },
  FISCAL_PERIOD_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Räkenskapsperioden kunde inte hittas.',
    message_no: 'Regnskapsperioden ble ikke funnet.',
    message_en: 'No fiscal period covers the entry date.',
    remediation: {
      description: 'Create or extend the relevant fiscal period before retrying.',
      resource: 'Accounted://period/active',
    },
  },
  ENTRY_DATE_OUTSIDE_FISCAL_PERIOD: {
    httpStatus: 400,
    message_sv: 'Datumet ligger utanför det valda räkenskapsåret.',
    message_no: 'Datoen ligger utenfor det valgte regnskapsåret.',
    message_en: 'Entry date is outside the active fiscal period.',
    remediation: {
      description: 'Use a date inside an open period or create one that covers it.',
      resource: 'Accounted://period/active',
    },
  },
  JOURNAL_ENTRY_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Verifikationen kunde inte hittas.',
    message_no: 'Bilaget ble ikke funnet.',
    message_en: 'Journal entry not found.',
  },
  CANNOT_REVERSE_NON_POSTED: {
    httpStatus: 400,
    message_sv: 'Endast bokförda verifikationer kan stornas.',
    message_no: 'Bare bokførte bilag kan stornes.',
    message_en: 'Only posted entries can be reversed.',
  },
  CANNOT_REVERSE_STORNO: {
    httpStatus: 400,
    message_sv:
      'En stornering kan inte stornas. Om verifikationen makulerades av misstag, bokför den på nytt (kopiera originalet).',
    message_no: 'En storno kan ikke stornes. Hvis bilaget ble makulert ved en feil, bokfør det på nytt (kopier originalen).',
    message_en:
      'A storno entry cannot be reversed. If the entry was cancelled by mistake, re-book it (copy the original).',
  },
  CANNOT_CORRECT_NON_POSTED: {
    httpStatus: 400,
    message_sv: 'Endast bokförda verifikationer kan rättas.',
    message_no: 'Bare bokførte bilag kan rettes.',
    message_en: 'Only posted entries can be corrected.',
  },
  CANNOT_EDIT_NON_DRAFT: {
    httpStatus: 409,
    message_sv: 'Endast utkast kan redigeras. Bokförda verifikationer rättas med storno.',
    message_no: 'Bare utkast kan redigeres. Bokførte bilag rettes med storno.',
    message_en: 'Only draft entries can be edited; posted entries are immutable and are corrected with storno.',
    remediation: {
      description: 'Use the correction (storno) flow to change a posted entry instead of editing it.',
    },
  },
  CANNOT_CANCEL_NON_DRAFT: {
    httpStatus: 409,
    message_sv:
      'Endast utkast kan makuleras. En bokförd verifikation måste stornas i stället.',
    message_no: 'Bare utkast kan makuleres. Et bokført bilag må stornes i stedet.',
    message_en:
      'Only draft entries can be cancelled; a posted entry must be reversed (storno) instead.',
    remediation: {
      description:
        'Storno the posted entry with POST /api/v1/companies/{companyId}/journal-entries/{id}/reverse. Cancelling a draft that is already cancelled succeeds: the endpoint is idempotent.',
    },
  },
  ENTRY_ALREADY_REVERSED: {
    httpStatus: 409,
    message_sv:
      'Verifikationen har redan stornats av en annan användare. Ladda om sidan och försök igen.',
    message_no: 'Bilaget er allerede stornert av en annen bruker. Last inn siden på nytt og prøv igjen.',
    message_en: 'Entry was already reversed by a concurrent operation.',
  },
  CURRENCY_REVALUATION_ALREADY_EXISTS: {
    httpStatus: 409,
    message_sv: 'En valutaomvärdering finns redan för denna period.',
    message_no: 'Det finnes allerede en valutaomvurdering for denne perioden.',
    message_en: 'Currency revaluation already exists for this period.',
  },
  INVALID_MAPPING_RESULT: {
    httpStatus: 400,
    message_sv: 'Kontering saknas för transaktionen. Kontrollera bokföringsreglerna.',
    message_no: 'Kontering mangler for transaksjonen. Kontroller bokføringsreglene.',
    message_en: 'Mapping rules produced an invalid debit/credit account pair.',
  },
  DIMENSION_VALIDATION_FAILED: {
    httpStatus: 400,
    message_sv:
      'Ett angivet kostnadsställe/projekt finns inte i dimensionsregistret eller är arkiverat. Skapa värdet i registret först.',
    message_no: 'Et angitt kostnadssted eller prosjekt finnes ikke i dimensjonsregisteret eller er arkivert. Opprett verdien i registeret først.',
    message_en:
      'One or more dimension codes on the entry lines are missing from the dimension registry or archived. details.issues lists each offending sie_dim_no/code.',
    remediation: {
      description:
        'Create the missing dimension value in the register (or re-activate the archived value), then retry. Only companies with dimensions enabled are validated; each issue in details.issues carries sie_dim_no, code and reason (unknown_dimension | unknown_value | archived_value).',
    },
  },
  MANDATORY_DIMENSION_MISSING: {
    httpStatus: 400,
    message_sv:
      'Ett eller flera konton kräver en dimension (t.ex. projekt eller kostnadsställe). Välj värden innan bokföring.',
    message_no: 'En eller flere kontoer krever en dimensjon (f.eks. prosjekt eller kostnadssted). Velg verdier før bokføring.',
    message_en:
      'One or more accounts require a dimension value. details.violations lists each account_number, sie_dim_no and dimension_name.',
    remediation: {
      description:
        'Tag every listed line with the required dimension value, then retry the commit.',
    },
  },
  BOOKKEEPING_DATABASE_ERROR: {
    httpStatus: 500,
    message_sv: 'Verifikationen kunde inte sparas. Försök igen.',
    message_no: 'Bilaget kunne ikke lagres. Prøv igjen.',
    message_en: 'Bookkeeping database operation failed.',
    retryable: true,
  },
  MEANINGLESS_CORRECTION: {
    httpStatus: 400,
    message_sv: 'Rättelsen motsvarar ingen ekonomisk händelse: det finns inget att rätta.',
    message_no: 'Rettelsen tilsvarer ingen økonomisk hendelse: det er ingenting å rette.',
    message_en: 'The correction represents no economic event: nothing to correct.',
  },
  CORRECTION_CHAIN_TOO_DEEP: {
    httpStatus: 409,
    message_sv:
      'Rättelsekedjan är redan flera nivåer djup. Räkna ut nettoeffekten av hela kedjan och gör EN rättelse istället, eller skicka allow_deep_chain=true för att rätta ändå.',
    message_no: 'Rettelseskjeden er allerede flere nivåer dyp. Beregn nettoeffekten av hele kjeden og gjør ÉN rettelse i stedet, eller send allow_deep_chain=true for å rette likevel.',
    message_en:
      'The correction chain is already several levels deep. Compute the net effect of the whole chain and book ONE correction instead, or pass allow_deep_chain=true to override.',
    remediation: {
      description:
        'Read the full chain with gnubok_query_journal (follow correction_of_id/reverses_id to the chain root), compute the net effect across all entries, and stage ONE correction on the live entry that expresses it. Only pass allow_deep_chain=true if stacking another correction is genuinely intended.',
      tool: 'gnubok_query_journal',
    },
  },
  NO_OPEN_PERIOD_FOR_DATE: {
    httpStatus: 400,
    message_sv:
      'Det finns ingen räkenskapsperiod som täcker det valda datumet. Skapa eller öppna räkenskapsåret först.',
    message_no: 'Det finnes ingen regnskapsperiode som dekker den valgte datoen. Opprett eller åpne regnskapsåret først.',
    message_en: 'No fiscal period covers the selected date.',
    remediation: {
      description: 'Create or open the fiscal year that covers the date before retrying.',
      resource: 'Accounted://period/active',
    },
  },
  TARGET_PERIOD_CLOSED: {
    httpStatus: 409,
    message_sv:
      'Räkenskapsåret som täcker datumet är stängt (bokslut) och kan inte öppnas. Bokför i en öppen period i stället.',
    message_no: 'Regnskapsåret som dekker datoen er stengt (regnskapsavslutning) og kan ikke åpnes. Bokfør i en åpen periode i stedet.',
    message_en: 'The fiscal year covering the date is closed and cannot be reopened.',
  },
  TARGET_PERIOD_LOCKED: {
    httpStatus: 409,
    message_sv: 'Räkenskapsperioden som täcker datumet är låst.',
    message_no: 'Regnskapsperioden som dekker datoen er låst.',
    message_en: 'The fiscal period covering the date is locked.',
    remediation: {
      description:
        'Unlock the period (if status is "locked", not "closed") or use a date inside an open period.',
      tool: 'gnubok_unlock_period',
    },
  },
  PERIOD_LOCKED: {
    httpStatus: 400,
    message_sv: 'Bokföringen är låst för denna period.',
    message_no: 'Bokføringen er låst for denne perioden.',
    message_en: 'Period is locked or closed; entries cannot be added.',
    remediation: {
      description:
        'Either unlock the period via gnubok_unlock_period (if status is "locked", not "closed") or change the entry date to fall inside an open period. A bank transaction that is not a business event (duplicate, never executed) needs no verifikat: ignore it instead (POST /transactions/{id}/ignore, gnubok_ignore_transaction).',
      tool: 'gnubok_unlock_period',
    },
  },
  PERIOD_NOT_LOCKED: {
    httpStatus: 400,
    message_sv: 'Perioden måste först låsas innan den kan stängas.',
    message_no: 'Perioden må først låses før den kan stenges.',
    message_en: 'Period must be locked before it can be closed.',
    remediation: {
      description: 'Call gnubok_lock_period before closing.',
      tool: 'gnubok_lock_period',
    },
  },
  PERIOD_HAS_UNBOOKED_TRANSACTIONS: {
    httpStatus: 400,
    message_sv:
      'Perioden innehåller okategoriserade affärstransaktioner. Bokför eller markera dem som privata innan låsning.',
    message_no: 'Perioden inneholder ukategoriserte forretningstransaksjoner. Bokfør dem eller merk dem som private før låsing.',
    message_en: 'The period contains uncategorized business transactions.',
    remediation: {
      description: 'Categorize or mark uncategorized transactions before locking.',
      tool: 'gnubok_list_uncategorized_transactions',
    },
  },
  YEAR_END_NOT_RUN: {
    httpStatus: 400,
    message_sv: 'Bokslutsåtgärder måste utföras innan perioden kan stängas.',
    message_no: 'Tiltak for regnskapsavslutning må utføres før perioden kan stenges.',
    message_en: 'Year-end closing must be executed before the period can be closed.',
  },
  // Bokslutsdispositioner: the schablonintäkt on periodiseringsfonder
  // (IL 30 kap 6a §) needs the SLR for the closing year, kept in a table in
  // lib/bokslut/reserves/periodiseringsfond-service.ts that is extended each
  // December. Only raised when the company actually holds fonder at the start
  // of the year (no fonder: no rate needed). 500 on purpose: it is a
  // server-side configuration gap, not a user error, and it must show up in
  // runtime-error clustering so the annual update is not missed.
  SCHABLONINTAKT_RATE_NOT_CONFIGURED: {
    httpStatus: 500,
    message_sv:
      'Statslåneräntan för det här räkenskapsåret saknas i systemet, så schablonintäkten på periodiseringsfonderna kan inte beräknas ännu. Kontakta supporten så lägger vi in den.',
    message_no: 'Statslånsrenten for dette regnskapsåret mangler i systemet, så sjablonginntekten på periodiseringsfondene kan ennå ikke beregnes. Kontakt supporten, så legger vi den inn.',
    message_en:
      'The statslåneränta (SLR) for this closing year is not configured, so the schablonintäkt on periodiseringsfonder cannot be calculated yet. Contact support to have it added.',
    remediation: {
      description:
        'Wait for the SLR table update, or pass schablonintaktRate explicitly on periodiseringsfond_avsattning / periodiseringsfond_ateforing items when posting dispositions.',
    },
  },
  TRANSACTION_ALREADY_CATEGORIZED: {
    httpStatus: 409,
    message_sv:
      'Transaktionen är redan bokförd. Ångra kategoriseringen om du vill ändra den.',
    message_no: 'Transaksjonen er allerede bokført. Angre kategoriseringen hvis du vil endre den.',
    message_en: 'The transaction already has a journal entry.',
    remediation: {
      description:
        'Use gnubok_uncategorize_transaction first if you need to recategorize.',
      tool: 'gnubok_uncategorize_transaction',
    },
  },
  INVOICE_ALREADY_SENT: {
    httpStatus: 409,
    message_sv: 'Fakturan har redan skickats eller betalats.',
    message_no: 'Fakturaen er allerede sendt eller betalt.',
    message_en: 'The invoice is already sent or paid.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Wave 1: invoicing & transactions
// ─────────────────────────────────────────────────────────────────

const TRANSACTIONS: Record<string, StructuredErrorEntry> = {
  TRANSACTION_BOOK_POSSIBLE_DUPLICATE: {
    httpStatus: 409,
    message_sv:
      'Den här affärshändelsen ser redan ut att vara bokförd: antingen en annan transaktion på samma datum och belopp, eller en verifikation som redan bokar samma belopp på bankkontot (t.ex. en betald faktura eller en lönekörning). Bokför inte samma affärshändelse två gånger. Granska den befintliga verifikationen och länka transaktionen till den, eller bokför ändå om de inte hör ihop.',
    message_no: 'Denne forretningstransaksjonen ser allerede ut til å være bokført: enten en annen transaksjon på samme dato og med samme beløp, eller et bilag som allerede bokfører det samme beløpet på bankkontoen (for eksempel en betalt faktura eller en lønnskjøring). Ikke bokfør samme forretningstransaksjon to ganger. Gå gjennom det eksisterende bilaget og koble transaksjonen til det, eller bokfør likevel hvis de ikke hører sammen.',
    message_en:
      'This business event already appears to be booked: either another transaction with the same date and amount, or a voucher that already books the same amount on the bank account (e.g. a paid invoice or a salary run). Do not book the same business event twice. Review the existing voucher and link this transaction to it, or pass force=true to book it anyway if they are genuinely unrelated.',
  },
  TRANSACTION_BOOK_FORCE_CANDIDATE_MISMATCH: {
    httpStatus: 409,
    message_sv:
      'Den möjliga dubbletten som visades matchar inte längre. Ladda om och försök igen så att rätt kandidat visas.',
    message_no: 'Den mulige duplikaten som ble vist samsvarer ikke lenger. Last inn på nytt og prøv igjen, slik at riktig kandidat vises.',
    message_en:
      'The duplicate candidate echoed in expected_duplicate_transaction_id / expected_duplicate_journal_entry_id no longer matches the one detected at request time. Re-run the booking pre-flight to obtain the current candidate, then retry.',
  },
  TX_CATEGORIZE_TX_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Transaktionen kunde inte hittas.',
    message_no: 'Transaksjonen kunne ikke finnes.',
    message_en: 'Transaction not found.',
  },
  TX_CATEGORIZE_INVALID_VAT_AMOUNT: {
    httpStatus: 400,
    message_sv:
      'Underlagets moms kunde inte användas för den här bokföringen. Kontrollera beloppet och momssatsen.',
    message_no: 'Mva-en i underlaget kunne ikke brukes for denne bokføringen. Kontroller beløpet og mva-satsen.',
    message_en: "The document's VAT amount cannot be used for this booking. Check the amount and the VAT treatment.",
  },
  TRANSACTION_TITLE_LOCKED: {
    httpStatus: 409,
    message_sv:
      'Det går inte att ändra titeln på en bokförd eller matchad transaktion. Bokförda verifikat rättas med storno.',
    message_no: 'Det går ikke å endre tittelen på en bokført eller avstemt transaksjon. Bokførte bilag rettes med storno.',
    message_en:
      'Cannot edit the title of a booked or matched transaction. Posted vouchers are corrected with storno.',
  },
  TRANSACTION_MOVE_BOOKED: {
    httpStatus: 409,
    message_sv:
      'Transaktionen är bokförd eller kopplad till en verifikation och kan inte flyttas till ett annat konto. Koppla bort den under Rapporter → Bankavstämning, eller storna verifikationen först.',
    message_no: 'Transaksjonen er bokført eller koblet til et bilag og kan ikke flyttes til en annen konto. Koble den fra under Rapporter → Bankavstemming, eller gjør storno på bilaget først.',
    message_en:
      'The transaction is booked or linked to a voucher and cannot be moved to another account. Unlink it under Reports → Bank reconciliation, or reverse (storno) the voucher first.',
  },
  TRANSACTION_MOVE_UNKNOWN_ACCOUNT: {
    httpStatus: 404,
    message_sv: 'Kontot finns inte bland företagets registrerade bankkonton.',
    message_no: 'Kontoen finnes ikke blant foretakets registrerte bankkonti.',
    message_en: "The account is not one of the company's registered cash accounts.",
  },
  TRANSACTION_MOVE_CURRENCY_MISMATCH: {
    httpStatus: 400,
    message_sv:
      'Transaktionens valuta stämmer inte med kontots valuta. En transaktion kan bara flyttas till ett konto i samma valuta.',
    message_no: 'Transaksjonens valuta samsvarer ikke med kontoens valuta. En transaksjon kan bare flyttes til en konto i samme valuta.',
    message_en:
      'The transaction currency does not match the target account currency. A transaction can only be moved to an account in the same currency.',
  },
  TX_CATEGORIZE_INVALID_ACCOUNT: {
    httpStatus: 400,
    message_sv: 'Det valda kontot finns inte i kontoplanen.',
    message_no: 'Den valgte kontoen finnes ikke i kontoplanen.',
    message_en: 'The supplied account does not exist in the chart of accounts.',
    remediation: {
      description: 'Activate the account in the chart of accounts or pick a different one.',
      resource: 'Accounted://chart-of-accounts',
    },
  },
  TX_CATEGORIZE_INVALID_TEMPLATE: {
    httpStatus: 400,
    message_sv: 'Bokföringsmallen är ogiltig eller passar inte din bolagsform.',
    message_no: 'Bokføringsmalen er ugyldig eller passer ikke din selskapsform.',
    message_en: 'The supplied booking template is invalid or does not match the entity type.',
  },
  TX_CATEGORIZE_ORPHANED_COUNTER_ACCOUNT: {
    httpStatus: 400,
    message_sv:
      'Motkontot är ett bankkonto som hör till transaktionens eget konto eller till en frånkopplad bankanslutning och kan inte användas. Välj ett intäkts- eller kostnadskonto i stället.',
    message_no: 'Motkontoen er en bankkonto som hører til transaksjonens egen konto eller til en frakoblet bankforbindelse, og kan ikke brukes. Velg en inntekts- eller kostnadskonto i stedet.',
    message_en:
      'The counter-account is a bank ledger of the transaction\'s own account or of a disconnected bank connection and cannot be used. Pick a revenue or expense account instead.',
    remediation: {
      description: 'Choose a revenue or expense account as the counter-account; a twin or orphaned bank ledger must not receive new postings.',
      resource: 'Accounted://chart-of-accounts',
    },
  },
  TX_CATEGORIZE_INVALID_MAPPING: {
    httpStatus: 400,
    message_sv: 'Konteringen saknar debet- eller kreditkonto.',
    message_no: 'Konteringen mangler debet- eller kreditkonto.',
    message_en: 'Mapping result is missing a debit or credit account.',
  },
  TX_CATEGORIZE_RACE: {
    httpStatus: 409,
    message_sv: 'Transaktionen kategoriserades av en annan förfrågan. Ladda om och försök igen.',
    message_no: 'Transaksjonen ble kategorisert av en annen forespørsel. Last inn på nytt og prøv igjen.',
    message_en: 'Transaction was already categorized by another request.',
  },
  TX_CATEGORIZE_JOURNAL_ENTRY_FAILED: {
    httpStatus: 409,
    message_sv:
      'Verifikationen kunde inte skapas, så transaktionen är inte bokförd. Den ligger kvar under Att bokföra.',
    message_no: 'Bilaget kunne ikke opprettes, så transaksjonen er ikke bokført. Den ligger fortsatt under Å bokføre.',
    message_en:
      'The journal entry could not be created, so the transaction was not booked and stays in the unbooked list.',
    remediation: {
      description:
        'Fix the cause in details.cause (PERIOD_LOCKED / BOOKKEEPING_DATABASE_ERROR with a locked-period message: unlock the period or use gnubok_unlock_period; NO_OPEN_PERIOD_FOR_DATE: create or open the fiscal year) and retry the same request. Nothing was written.',
    },
  },
  TX_CATEGORIZE_IGNORED_CONFLICT: {
    httpStatus: 409,
    message_sv:
      'Transaktionen är fortfarande markerad som ignorerad och kan därför inte kopplas till en verifikation.',
    message_no: 'Transaksjonen er fortsatt markert som ignorert og kan derfor ikke kobles til et bilag.',
    message_en:
      'The transaction is still marked as ignored and cannot be linked to a journal entry.',
    remediation: {
      description: 'Reload and retry categorization. Report the conflict if it persists.',
    },
  },
  // Issue #1661: a private (is_business=false) marking is a real booking
  // (eget uttag/insättning on 2013/2018, or 2893 for an AB), so a locked or
  // closed period blocks it exactly like any other verifikat. The row the
  // caller usually wants to clear (a PSD2 ghost row, a duplicate, a never
  // executed transfer) is not an affärshändelse at all: ignoring it writes no
  // verifikat and is therefore allowed in a locked period. Returned instead
  // of PERIOD_LOCKED so the remediation names that path. The wording must not
  // contain "Bokföringen är låst" (inferCode maps that phrase to PERIOD_LOCKED).
  TX_CATEGORIZE_PRIVATE_PERIOD_LOCKED: {
    httpStatus: 400,
    message_sv:
      'Perioden är låst. En privat markering bokförs som eget uttag eller insättning i perioden. Är raden ingen affärshändelse (dubblett, aldrig genomförd)? Ignorera den i stället. Annars: lås upp perioden.',
    message_no: 'Perioden er låst. En privat markering bokføres som eget uttak eller innskudd i perioden. Er linjen ingen forretningshendelse (duplikat, aldri gjennomført)? Ignorer den i stedet. Ellers: lås opp perioden.',
    message_en:
      'The period is locked. A private marking is booked as an owner withdrawal or deposit inside the period. If the row is not a business event (a duplicate, never executed), ignore it instead; otherwise unlock the period.',
    remediation: {
      description:
        'If the row is not a business event, ignore it: POST /api/v1/companies/{companyId}/transactions/{id}/ignore, the Ignorera action on the Transaktioner page, or gnubok_ignore_transaction. Ignoring writes no verifikat, so it is allowed in a locked or closed period. Otherwise unlock the period via gnubok_unlock_period (status "locked", not "closed") and categorize again.',
      tool: 'gnubok_ignore_transaction',
    },
  },
  TX_IGNORE_ALREADY_BOOKED: {
    httpStatus: 409,
    message_sv:
      'Transaktionen är redan bokförd: använd Avmatcha eller backa verifikationen för att ändra status.',
    message_no: 'Transaksjonen er allerede bokført: bruk Avstem eller reverser bilaget for å endre status.',
    message_en:
      'The transaction is already booked (directly, via a payment allocation, or via a voucher link). Unlink it or reverse the verifikat (storno) before ignoring it.',
    remediation: {
      description:
        'A booked bank row cannot be ignored: the booking IS its status. Reverse it with gnubok_uncategorize_transaction (storno) or unlink the payment/voucher first, then ignore.',
      tool: 'gnubok_uncategorize_transaction',
    },
  },
  TX_CATEGORIZE_SUGGEST_SI_MATCH: {
    httpStatus: 409,
    message_sv:
      'Det finns en öppen leverantörsfaktura från samma leverantör med samma belopp. Matcha mot fakturan istället för att bokföra direkt på leverantörsskuldskontot: annars skapas en dubblerad verifikation som måste stornas (BFL 5 kap 5 §).',
    message_no: 'Det finnes en åpen leverandørfaktura fra samme leverandør med samme beløp. Avstem mot fakturaen i stedet for å bokføre direkte på leverandørgjeldskontoen: ellers opprettes et duplikatbilag som må reverseres (BFL 5 kap 5 §).',
    message_en:
      'An open supplier invoice from the same supplier matches this amount. Suggest matching to the invoice instead of a plain 244x categorization to avoid producing a duplicate verifikation (BFL 5 kap 5 §).',
    remediation: {
      description:
        'Match the transaction via POST /api/transactions/{id}/match-supplier-invoice, or resend with confirm_no_match: true to keep the plain 244x categorization.',
    },
  },
  TX_CATEGORIZE_SUGGEST_CI_MATCH: {
    httpStatus: 409,
    message_sv:
      'Det finns en obetald kundfaktura från samma kund med samma belopp. Matcha mot fakturan istället för att bokföra direkt mot kundfordringskontot: annars skapas en dubblerad verifikation som måste stornas (BFL 5 kap 5 §).',
    message_no: 'Det finnes en ubetalt kundefaktura fra samme kunde med samme beløp. Avstem mot fakturaen i stedet for å bokføre direkte mot kundefordringskontoen: ellers opprettes et duplikatbilag som må reverseres (BFL 5 kap 5 §).',
    message_en:
      'An unpaid customer invoice from the same customer matches this amount. Suggest matching to the invoice instead of a plain 151x categorization to avoid producing a duplicate verifikation (BFL 5 kap 5 §).',
    remediation: {
      description:
        'Match the transaction via POST /api/transactions/{id}/match-invoice, or resend with confirm_no_match: true to keep the plain 151x categorization.',
    },
  },
  TX_UNCATEGORIZE_NO_LINKED_ENTRY: {
    httpStatus: 400,
    message_sv: 'Transaktionen har ingen kopplad verifikation att stornera.',
    message_no: 'Transaksjonen har ingen tilknyttet bilag å reversere.',
    message_en: 'Transaction has no linked journal entry to reverse.',
  },
  TX_EXCHANGE_RATE_UNAVAILABLE: {
    httpStatus: 502,
    message_sv:
      'Kunde inte hämta växelkursen från Riksbanken. Försök igen om en stund: verifikationen måste bokföras i SEK.',
    message_no: 'Kunne ikke hente vekslingskursen fra Riksbanken. Prøv igjen om en stund: bilaget må bokføres i SEK.',
    message_en:
      'Could not fetch the exchange rate from Riksbanken. The verifikation must be posted in SEK.',
    retryable: true,
  },
}

const MATCH_INVOICE: Record<string, StructuredErrorEntry> = {
  MATCH_INVOICE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Fakturan kunde inte hittas.',
    message_no: 'Fakturaen kunne ikke finnes.',
    message_en: 'Invoice not found.',
  },
  MATCH_INVOICE_NOT_INCOME: {
    httpStatus: 400,
    message_sv: 'Endast intäktstransaktioner kan matchas mot kundfakturor.',
    message_no: 'Bare inntektstransaksjoner kan avstemmes mot kundefakturaer.',
    message_en: 'Only income transactions can be matched to customer invoices.',
  },
  MATCH_INVOICE_TX_ALREADY_LINKED: {
    httpStatus: 400,
    message_sv: 'Transaktionen är redan kopplad till en faktura.',
    message_no: 'Transaksjonen er allerede koblet til en faktura.',
    message_en: 'Transaction is already linked to an invoice.',
  },
  MATCH_INVOICE_NOT_OPEN: {
    httpStatus: 400,
    message_sv: 'Fakturan är inte i ett obetalt läge och kan inte matchas.',
    message_no: 'Fakturaen er ikke i en ubetalt status og kan ikke avstemmes.',
    message_en: 'Invoice is not in an unpaid state.',
  },
  MATCH_INVOICE_CREDIT_NOTE: {
    httpStatus: 400,
    message_sv: 'Kreditfakturor kan inte registreras som betalda.',
    message_no: 'Kreditnotaer kan ikke registreres som betalt.',
    message_en: 'Credit notes cannot be recorded as paid.',
  },
  MATCH_INVOICE_NOT_INVOICE_TYPE: {
    httpStatus: 400,
    message_sv: 'Endast fakturor kan matchas mot en transaktion. Proforma och följesedel saknar momsskyldighet.',
    message_no: 'Bare fakturaer kan avstemmes mot en transaksjon. Proforma og følgeseddel mangler mva-plikt.',
    message_en: 'Only invoices may be matched to a transaction; proforma and delivery notes have no VAT obligation.',
  },
  MATCH_INVOICE_FX_RATE_UNAVAILABLE: {
    httpStatus: 400,
    message_sv:
      'Kunde inte hämta valutakurs från Riksbanken för betalningsdatumet. Ange kursen manuellt från ditt bankutdrag (fältet manual_exchange_rate).',
    message_no: 'Kunne ikke hente valutakursen fra Riksbanken for betalingsdatoen. Angi kursen manuelt fra din kontoutskrift (feltet manual_exchange_rate).',
    message_en:
      'Could not retrieve an exchange rate from Riksbanken for the payment date. Provide the rate manually from your bank statement (manual_exchange_rate field).',
  },
  MATCH_INVOICE_BOOKING_RATE_MISSING: {
    httpStatus: 400,
    message_sv:
      'Fakturan är utställd i utländsk valuta men saknar växelkurs. Utan kursen går det inte att räkna fram kursvinst eller kursförlust. Komplettera fakturans växelkurs (exchange_rate) och försök igen.',
    message_no: 'Fakturaen er utstedt i utenlandsk valuta, men mangler vekslingskurs. Uten kursen er det ikke mulig å beregne kursgevinst eller kurstap. Kompletter fakturaens vekslingskurs (exchange_rate) og prøv igjen.',
    message_en:
      'The foreign-currency invoice has no usable booking exchange rate on file (invoice.exchange_rate is missing, zero, or out of range), so the FX gain/loss (BAS 3960/7960) on settlement cannot be computed. Same guard as BATCH_FX_RATE_MISSING in match_batch_allocate.',
    remediation: {
      description:
        'Set invoice.exchange_rate to the rate the receivable (1510) was booked at, then retry the match. On an invoice that is not yet booked, POST /api/invoices/{id}/refresh-exchange-rate fetches the taxable-event rate from Riksbanken and fills it in. On an already-booked invoice that endpoint refuses (INVOICE_FX_REFRESH_BOOKED): the SEK amounts are in a verifikat and only storno or inline rättelse may change them.',
    },
  },
  // The BANK ROW itself has no SEK value: transactions.currency is foreign and
  // both amount_sek and exchange_rate are empty (the shape a row gets when
  // Riksbanken was unreachable at ingest, see lib/transactions/ingest.ts).
  // Journal entry lines are always SEK, so the raw foreign number must never
  // stand in for one: a 500 USD receipt would be allocated as 500 SEK. Same
  // refusal as the match_batch_allocate RPC's BATCH_FX_RATE_MISSING.
  MATCH_INVOICE_TX_FX_RATE_MISSING: {
    httpStatus: 400,
    message_sv:
      'Banktransaktionen är i utländsk valuta men saknar både SEK-belopp och växelkurs. Komplettera transaktionens växelkurs innan du matchar: utan den kan beloppet inte räknas om till kronor.',
    message_no: 'Banktransaksjonen er i utenlandsk valuta, men mangler både SEK-beløp og vekslingskurs. Kompletter transaksjonens vekslingskurs før du avstemmer: uten den kan beløpet ikke regnes om til kroner.',
    message_en:
      'The bank transaction is in a foreign currency but has neither a SEK amount nor an exchange rate on file. Set the transaction exchange rate before matching; without it the amount cannot be translated to SEK.',
    remediation: {
      description:
        'Set amount_sek (or exchange_rate) on the transaction for its value date, then retry the match.',
    },
  },
  MATCH_INVOICE_ALREADY_PAID: {
    httpStatus: 409,
    message_sv: 'Fakturan har redan slutbetalats av en annan förfrågan.',
    message_no: 'Fakturaen er allerede sluttbetalt av en annen forespørsel.',
    message_en: 'Invoice has already been fully paid or is no longer matchable.',
  },
  MATCH_INVOICE_DUPLICATE_PAYMENT: {
    httpStatus: 409,
    message_sv: 'Den här transaktionen är redan matchad mot fakturan.',
    message_no: 'Denne transaksjonen er allerede avstemt mot fakturaen.',
    message_en: 'This transaction is already matched to this invoice.',
  },
  MATCH_INVOICE_RECORD_PAYMENT_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte registrera fakturabetalningen.',
    message_no: 'Kunne ikke registrere fakturabetalingen.',
    message_en: 'Failed to record invoice payment.',
    retryable: true,
  },
  MATCH_INVOICE_LINK_TX_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte koppla transaktionen till fakturan.',
    message_no: 'Kunne ikke koble transaksjonen til fakturaen.',
    message_en: 'Failed to link transaction to invoice.',
    retryable: true,
  },
  MATCH_INVOICE_PARTIAL: {
    httpStatus: 200,
    message_sv: 'Matchningen registrerades men verifikationen kunde inte skapas.',
    message_no: 'Matchingen ble registrert, men bilaget kunne ikke opprettes.',
    message_en: 'Match recorded but the journal entry could not be created.',
  },
  MATCH_INVOICE_ALREADY_HAS_PAYMENT_VOUCHER: {
    httpStatus: 409,
    message_sv:
      'Fakturan har redan en betalningsverifikation. Koppla istället bankhändelsen till befintlig verifikation, eller rätta tidigare bokföring först.',
    message_no: 'Fakturaen har allerede et betalingsbilag. Koble bankhendelsen til det eksisterende bilaget i stedet, eller rett opp tidligere bokføring først.',
    message_en:
      'Invoice already has a payment journal entry. Link the bank transaction to the existing voucher instead, or correct the prior bookkeeping first.',
  },
  MATCH_INVOICE_POSSIBLE_DUPLICATE: {
    httpStatus: 409,
    message_sv:
      'Det finns redan en bokförd verifikation på samma belopp och datum. Har du redan bokfört denna betalning? Koppla bankhändelsen till befintlig verifikation, eller skapa ny verifikation ändå om de inte hör ihop.',
    message_no: 'Det finnes allerede et bokført bilag på samme beløp og dato. Har du allerede bokført denne betalingen? Koble bankhendelsen til det eksisterende bilaget, eller opprett et nytt bilag likevel hvis de ikke hører sammen.',
    message_en:
      'A posted journal entry already books the same amount on a nearby date. The user may have already booked this payment manually: link to the existing voucher or pass force=true to create a new one anyway.',
    retryable: false,
    remediation: {
      description:
        'Link the bank row to the existing voucher instead of booking a second one: gnubok_link_transaction_to_journal_entry (pass invoice_id to settle the kundfaktura at the same time) or gnubok_reconcile_match. Only if the row is a genuinely separate payment, call again with force=true and expected_journal_entry_id set to the id the refusal named.',
      tool: 'gnubok_link_transaction_to_journal_entry',
    },
  },
  MATCH_INVOICE_FORCE_CANDIDATE_MISMATCH: {
    httpStatus: 409,
    message_sv:
      'Verifikationen som dubblettkontrollen visade matchar inte längre. Stäng dialogen och försök igen så att rätt verifikation visas.',
    message_no: 'Bilaget som duplikatkontrollen viste, stemmer ikke lenger. Steng dialogen og prøv igjen, slik at riktig bilag vises.',
    message_en:
      'The candidate journal entry echoed in expected_journal_entry_id does not match the one detected at request time. Re-run the duplicate-payment pre-flight to obtain the current candidate, then retry.',
  },
  MATCH_AMOUNT_EXCEEDS_REMAINING: {
    httpStatus: 400,
    message_sv:
      'Transaktionsbeloppet är större än fakturans återstående belopp. Dela betalningen och fördela överskottet på en eller flera andra fakturor.',
    message_no: 'Transaksjonsbeløpet er større enn fakturaens gjenstående beløp. Del betalingen og fordel overskuddet på en eller flere andre fakturaer.',
    message_en:
      'Transaction amount exceeds the invoice remaining amount. Use the split-payment flow to allocate the excess across one or more other invoices.',
  },
}

const LINK_TX_JE: Record<string, StructuredErrorEntry> = {
  LINK_TX_JE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Verifikationen kunde inte hittas.',
    message_no: 'Bilaget ble ikke funnet.',
    message_en: 'Journal entry not found.',
  },
  LINK_TX_JE_NOT_POSTED: {
    httpStatus: 400,
    message_sv: 'Endast bokförda verifikationer kan kopplas till en banktransaktion.',
    message_no: 'Bare bokførte bilag kan kobles til en banktransaksjon.',
    message_en: 'Only posted journal entries can be linked to a transaction.',
  },
  LINK_TX_TX_ALREADY_LINKED: {
    httpStatus: 400,
    message_sv: 'Transaktionen är redan kopplad till en verifikation.',
    message_no: 'Transaksjonen er allerede koblet til et bilag.',
    message_en: 'Transaction is already linked to a journal entry.',
  },
  LINK_TX_INVOICE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Fakturan kunde inte hittas.',
    message_no: 'Fakturaen ble ikke funnet.',
    message_en: 'Invoice not found.',
  },
  LINK_TX_INVOICE_NOT_OPEN: {
    httpStatus: 400,
    message_sv: 'Fakturan är inte i ett obetalt läge och kan inte kopplas.',
    message_no: 'Fakturaen er ikke i en ubetalt status og kan ikke kobles.',
    message_en: 'Invoice is not in an unpaid state.',
  },
  LINK_TX_INVOICE_CREDIT_NOTE: {
    httpStatus: 400,
    message_sv: 'Kreditfakturor kan inte registreras som betalda.',
    message_no: 'Kreditnotaer kan ikke registreres som betalt.',
    message_en: 'Credit notes cannot be recorded as paid.',
  },
  LINK_TX_INVOICE_RACE: {
    httpStatus: 409,
    message_sv: 'Fakturan ändrades samtidigt. Försök igen.',
    message_no: 'Fakturaen ble endret samtidig. Prøv igjen.',
    message_en: 'Invoice status changed concurrently. Retry the request.',
  },
  LINK_TX_INVOICE_CURRENCY_MISMATCH: {
    httpStatus: 400,
    message_sv:
      'Transaktionens och fakturans valuta måste vara samma för att länka till en befintlig verifikation. Använd matchningsdialogen för valutaomräkning.',
    message_no: 'Transaksjonens og fakturaens valuta må være den samme for å koble til et eksisterende bilag. Bruk matching-dialogen for valutaomregning.',
    message_en:
      'Transaction and invoice currency must match to link to an existing voucher. Use the match-invoice flow for cross-currency settlement.',
  },
  // Raw database failure on the transaction or invoice UPDATE. The service
  // puts the Postgres message in details.reason; callers append it so the
  // constraint or trigger that fired is visible to the agent instead of a
  // bare code (a customer hit this reproducibly on certain positive amounts
  // and could not tell us why).
  LINK_TX_DB_ERROR: {
    httpStatus: 500,
    message_sv: 'Kopplingen kunde inte sparas i databasen.',
    message_no: 'Koblingen kunne ikke lagres i databasen.',
    message_en: 'Linking the transaction to the journal entry failed at the database.',
  },
}

const MATCH_SI: Record<string, StructuredErrorEntry> = {
  MATCH_SI_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Leverantörsfakturan kunde inte hittas.',
    message_no: 'Leverandørfakturaen ble ikke funnet.',
    message_en: 'Supplier invoice not found.',
  },
  MATCH_SI_NOT_EXPENSE: {
    httpStatus: 400,
    message_sv: 'Endast utgiftstransaktioner kan matchas mot leverantörsfakturor.',
    message_no: 'Bare utgiftstransaksjoner kan matches mot leverandørfakturaer.',
    message_en: 'Only expense transactions can be matched to supplier invoices.',
  },
  MATCH_SI_TX_ALREADY_LINKED: {
    httpStatus: 400,
    message_sv: 'Transaktionen är redan kopplad till en leverantörsfaktura.',
    message_no: 'Transaksjonen er allerede koblet til en leverandørfaktura.',
    message_en: 'Transaction is already linked to a supplier invoice.',
  },
  MATCH_SI_ALREADY_PAID: {
    httpStatus: 400,
    message_sv: 'Leverantörsfakturan är redan betald eller krediterad.',
    message_no: 'Leverandørfakturaen er allerede betalt eller kreditert.',
    message_en: 'Supplier invoice is already paid or credited.',
  },
  MATCH_SI_NOT_OPEN: {
    httpStatus: 409,
    message_sv: 'Leverantörsfakturan har redan slutbetalats av en annan förfrågan.',
    message_no: 'Leverandørfakturaen er allerede sluttbetalt av en annen forespørsel.',
    message_en: 'Supplier invoice has already been fully paid or is no longer matchable.',
  },
  MATCH_SI_DUPLICATE_PAYMENT: {
    httpStatus: 409,
    message_sv: 'Den här transaktionen är redan matchad mot leverantörsfakturan.',
    message_no: 'Denne transaksjonen er allerede avstemt mot leverandørfakturaen.',
    message_en: 'This transaction is already matched to this supplier invoice.',
  },
  MATCH_SI_JE_FAILED: {
    httpStatus: 500,
    message_sv:
      'Betalningsverifikationen kunde inte skapas. Matchningen avbröts: inga ändringar har sparats.',
    message_no: 'Betalingsbilaget kunne ikke opprettes. Avstemmingen ble avbrutt: ingen endringer er lagret.',
    message_en:
      'Failed to create the payment voucher. The match was aborted: no changes were saved.',
    retryable: true,
  },
  MATCH_SI_RECORD_PAYMENT_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte registrera leverantörsfakturabetalningen.',
    message_no: 'Kunne ikke registrere betalingen av leverandørfakturaen.',
    message_en: 'Failed to record supplier invoice payment.',
    retryable: true,
  },
  MATCH_SI_LINK_TX_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte koppla transaktionen till leverantörsfakturan.',
    message_no: 'Kunne ikke koble transaksjonen til leverandørfakturaen.',
    message_en: 'Failed to link transaction to supplier invoice.',
    retryable: true,
  },
  MATCH_SI_CASH_FX_UNSUPPORTED: {
    httpStatus: 400,
    message_sv:
      'Kontantmetoden kan inte dela upp en delbetalning i utländsk valuta. Betala hela fakturan på en gång, byt till löpande bokföring eller bokför betalningen manuellt.',
    message_no: 'Kontantmetoden kan ikke dele opp en delbetaling i utenlandsk valuta. Betal hele fakturaen på én gang, bytt til løpende bokføring eller bokfør betalingen manuelt.',
    message_en:
      'The cash method cannot handle a partial foreign-currency payment. Pay the invoice in full, switch to accrual, or book the payment manually.',
  },
  INVOICE_PAID_CASH_PARTIAL_UNSUPPORTED: {
    httpStatus: 400,
    message_sv:
      'Kontantmetoden kan inte bokföra delbetalningar av en obokförd faktura automatiskt: hela fakturan bokförs vid betalning. Ta emot hela beloppet i en betalning, byt till faktureringsmetoden eller bokför betalningen manuellt som verifikation.',
    message_no: 'Kontantmetoden kan ikke bokføre delbetalinger av en ikke-bokført faktura automatisk: hele fakturaen bokføres ved betaling. Ta imot hele beløpet i én betaling, bytt til faktureringsmetoden eller bokfør betalingen manuelt som et bilag.',
    message_en:
      'The cash method cannot auto-book partial payments of an unbooked invoice: the generated entry always books the full invoice. Receive the full amount in one payment, switch to the accrual method, or book the payment manually as a journal entry.',
  },
  SI_CASH_PARTIAL_UNSUPPORTED: {
    httpStatus: 400,
    message_sv:
      'Kontantmetoden kan inte bokföra delbetalningar av en obokförd leverantörsfaktura automatiskt: hela fakturan bokförs vid betalning. Betala hela beloppet i en betalning eller bokför betalningen manuellt som verifikation.',
    message_no: 'Kontantmetoden kan ikke bokføre delbetalinger av en ikke-bokført leverandørfaktura automatisk: hele fakturaen bokføres ved betaling. Betal hele beløpet i én betaling eller bokfør betalingen manuelt som et bilag.',
    message_en:
      'The cash method cannot auto-book partial payments of an unbooked supplier invoice: the generated entry always books the full invoice. Pay the full amount in one payment or book the payment manually as a journal entry.',
  },
  MATCH_SI_AMOUNT_EXCEEDS_REMAINING: {
    httpStatus: 400,
    message_sv:
      'Transaktionsbeloppet är större än leverantörsfakturans återstående belopp. Dela betalningen och fördela överskottet på en eller flera andra leverantörsfakturor.',
    message_no: 'Transaksjonsbeløpet er større enn det gjenstående beløpet på leverandørfakturaen. Del opp betalingen og fordel overskuddet på én eller flere andre leverandørfakturaer.',
    message_en:
      'Transaction amount exceeds the supplier invoice remaining amount. Use the split-payment flow to allocate the excess across one or more other supplier invoices.',
  },
  TX_UNCATEGORIZE_NOT_BOOKED: {
    httpStatus: 400,
    message_sv: 'Transaktionen är inte bokförd. Det finns inget att av-kategorisera.',
    message_no: 'Transaksjonen er ikke bokført. Det finnes ingenting å av-kategorisere.',
    message_en: 'Transaction has no journal entry: nothing to uncategorize.',
  },
  TX_UNCATEGORIZE_JE_NOT_POSTED: {
    httpStatus: 400,
    message_sv: 'Verifikationen är inte bokförd. Reversal kan inte utföras.',
    message_no: 'Bilaget er ikke bokført. Tilbakeføring kan ikke utføres.',
    message_en: 'Journal entry is not in posted status; reversal is not possible.',
  },
  TX_INGEST_INSERT_FAILED: {
    httpStatus: 500,
    message_sv: 'Transaktionerna kunde inte importeras.',
    message_no: 'Transaksjonene kunne ikke importeres.',
    message_en: 'Transaction ingest failed.',
    retryable: true,
  },
  TX_BATCH_CATEGORIZE_EMPTY: {
    httpStatus: 400,
    message_sv: 'Batchen är tom.',
    message_no: 'Partiet er tomt.',
    message_en: 'Batch is empty: pass at least one item.',
  },
}

const INVOICE: Record<string, StructuredErrorEntry> = {
  INVOICE_CUSTOMER_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Kunden kunde inte hittas.',
    message_no: 'Kunden kunne ikke finnes.',
    message_en: 'Customer not found.',
  },
  INVOICE_CREATE_VAT_RULE_VIOLATION: {
    httpStatus: 400,
    message_sv: 'Momssatsen är inte tillåten för denna kundtyp.',
    message_no: 'Mva-satsen er ikke tillatt for denne kundetypen.',
    message_en: 'The VAT rate is not allowed for this customer type.',
  },
  INVOICE_CREATE_REVENUE_ACCOUNT_INVALID: {
    httpStatus: 400,
    message_sv: 'Ett angivet bokföringskonto finns inte eller är inte ett aktivt balans- eller intäktskonto (klass 1-3).',
    message_no: 'En angitt bokføringskonto finnes ikke eller er ikke en aktiv balanse- eller inntektskonto (klasse 1-3).',
    message_en: 'A supplied posting account does not exist or is not an active balance-sheet or revenue account (class 1-3).',
  },
  INVOICE_CREATE_ARTICLE_INVALID: {
    httpStatus: 400,
    message_sv: 'En angiven artikel finns inte i företaget.',
    message_no: 'En angitt artikkel finnes ikke i selskapet.',
    message_en: 'A supplied article does not exist in this company.',
  },
  INVOICE_CREATE_POSTING_ACCOUNT_VAT_CONFLICT: {
    httpStatus: 400,
    message_sv: 'Ett balanskonto (klass 1-2) kan bara användas på rader utan moms. Använd ett intäktskonto (3xxx) för momspliktiga rader.',
    message_no: 'En balansekonto (klasse 1-2) kan bare brukes på linjer uten mva. Bruk en inntektskonto (3xxx) for mva-pliktige linjer.',
    message_en: 'A balance-sheet account (class 1-2) can only be used on zero-VAT lines. Use a revenue account (3xxx) for VAT-bearing lines.',
  },
  INVOICE_CREATE_ROT_RUT_VALIDATION: {
    httpStatus: 400,
    message_sv: 'ROT/RUT-avdraget kunde inte valideras. Kontrollera personnummer och fastighetsbeteckning.',
    message_no: 'ROT/RUT-fradraget kunne ikke valideres. Kontroller fødselsnummer og eiendomsbetegnelse.',
    message_en: 'ROT/RUT deduction failed validation. Check personnummer and housing designation.',
  },
  INVOICE_CREATE_ACCRUAL_INVALID: {
    httpStatus: 400,
    message_sv: 'Periodisering kan inte användas här. Den kräver faktureringsmetoden och stöds inte för omvänd skattskyldighet, export eller proforma.',
    message_no: 'Periodisering kan ikke brukes her. Den krever faktureringsmetoden og støttes ikke for omvendt avgiftsplikt, eksport eller proforma.',
    message_en: 'Periodisering cannot be used here. It requires the accrual method and is not supported for reverse charge, export, or proforma documents.',
  },
  ACCRUAL_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Periodiseringen kunde inte hittas.',
    message_no: 'Periodiseringen kunne ikke finnes.',
    message_en: 'Accrual schedule not found.',
  },
  ACCRUAL_DISSOLVE_FAILED: {
    httpStatus: 400,
    message_sv: 'Periodiseringen kunde inte lösas upp.',
    message_no: 'Periodiseringen kunne ikke løses opp.',
    message_en: 'The accrual schedule could not be dissolved.',
  },
  ACCRUAL_NOT_ACTIVE: {
    httpStatus: 400,
    message_sv: 'Periodiseringen är inte aktiv.',
    message_no: 'Periodiseringen er ikke aktiv.',
    message_en: 'The accrual schedule is not active.',
  },
  ACCRUAL_NOTHING_TO_DISSOLVE: {
    httpStatus: 400,
    message_sv: 'Det finns inget kvar att lösa upp.',
    message_no: 'Det er ikke noe igjen å løse opp.',
    message_en: 'There is nothing left to dissolve on this accrual schedule.',
  },
  INVOICE_CREATE_ROT_RUT_PERSONNUMMER_INVALID: {
    httpStatus: 400,
    message_sv: 'Personnumret för ROT/RUT-avdraget är ogiltigt.',
    message_no: 'Fødselsnummeret for ROT/RUT-fradraget er ugyldig.',
    message_en: 'The personnummer provided for the ROT/RUT deduction is invalid.',
  },
  // Rot/rut begäran om utbetalning (Skatteverkets husavdragstjänst)
  ROT_RUT_REQUEST_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Begäran om utbetalning hittades inte.',
    message_no: 'Forespørselen om utbetaling ble ikke funnet.',
    message_en: 'Payout request not found.',
  },
  ROT_RUT_NO_ELIGIBLE_INVOICES: {
    httpStatus: 400,
    message_sv: 'Ingen av de valda fakturorna kan ingå i filen. Se blockeringarna per faktura.',
    message_no: 'Ingen av de valgte fakturaene kan inngå i filen. Se blokkeringene per faktura.',
    message_en: 'None of the selected invoices can be included in the file. See the per-invoice blockers.',
  },
  ROT_RUT_INVOICES_BLOCKED: {
    httpStatus: 400,
    message_sv: 'En eller flera valda fakturor kan inte ingå i filen. Åtgärda blockeringarna eller välj bort fakturorna.',
    message_no: 'En eller flere valgte fakturaer kan ikke inngå i filen. Utbedre blokkeringene eller velg bort fakturaene.',
    message_en: 'One or more selected invoices cannot be included in the file. Fix the blockers or deselect the invoices.',
  },
  ROT_RUT_INVOICE_CONFLICT: {
    httpStatus: 409,
    message_sv: 'Minst en faktura ingår redan i en aktiv begäran om utbetalning.',
    message_no: 'Minst én faktura inngår allerede i en aktiv forespørsel om utbetaling.',
    message_en: 'At least one invoice is already part of an active payout request.',
  },
  ROT_RUT_INVALID_STATUS_TRANSITION: {
    httpStatus: 400,
    message_sv: 'Statusändringen är inte tillåten för begäran i dess nuvarande läge.',
    message_no: 'Statusendringen er ikke tillatt for forespørselen i dens nåværende tilstand.',
    message_en: 'The status transition is not allowed from the request current state.',
  },
  ROT_RUT_SETTLE_INVALID_STATE: {
    httpStatus: 400,
    message_sv: 'Utbetalningen kan bara bokföras för en inskickad begäran som inte redan är bokförd.',
    message_no: 'Utbetalingen kan bare bokføres for en innsendt forespørsel som ikke allerede er bokført.',
    message_en: 'The payout can only be booked for a submitted request that is not already settled.',
  },
  ROT_RUT_SETTLE_AMOUNT_EXCEEDS: {
    httpStatus: 400,
    message_sv:
      'Beloppet kan inte bokföras mot begäran: det är större än begärt eller beslutat belopp. Bokför transaktionen på annat sätt.',
    message_no: 'Beløpet kan ikke bokføres mot forespørselen: det er større enn forespurt eller besluttet beløp. Bokfør transaksjonen på annen måte.',
    message_en:
      'The amount cannot be booked against the request: it exceeds the requested or decided amount. Book the transaction another way.',
  },
  ROT_RUT_SETTLE_SET_AMOUNT: {
    httpStatus: 400,
    message_sv:
      'Beloppet stämmer inte med summan av de valda begäran. Skatteverket betalar ut exakt beslutade belopp, så flera begäran kan bara bokföras tillsammans när transaktionen motsvarar summan till öret.',
    message_no: 'Beløpet stemmer ikke med summen av de valgte forespørslene. Skatteetaten betaler ut nøyaktig besluttet beløp, så flere forespørsler kan bare bokføres sammen når transaksjonen tilsvarer summen til øret.',
    message_en:
      'The amount does not equal the sum of the selected requests. Skatteverket pays exactly the decided amounts, so several requests can only be booked together when the transaction equals their sum to the öre.',
  },
  ROT_RUT_SETTLE_RACE: {
    httpStatus: 409,
    message_sv:
      'Begäran hann redan bokföras som utbetald av en annan åtgärd. Verifikationen som skapades kan inte kopplas: kontrollera bokföringen på konto 1513.',
    message_no: 'Forespørselen rakk allerede å bli bokført som utbetalt av en annen handling. Bilaget som ble opprettet kan ikke kobles: kontroller bokføringen på konto 1513.',
    message_en:
      'The request was already settled by another action. The voucher that was created could not be attached: check the bookkeeping on account 1513.',
  },
  ROT_RUT_MATCH_NOT_INCOME: {
    httpStatus: 400,
    message_sv: 'Endast inbetalningar kan matchas mot en ROT/RUT-utbetalning från Skatteverket.',
    message_no: 'Bare innbetalinger kan matches mot en ROT/RUT-utbetaling fra Skatteetaten.',
    message_en: 'Only income transactions can be matched to a ROT/RUT payout from Skatteverket.',
  },
  ROT_RUT_MATCH_TX_ALREADY_LINKED: {
    httpStatus: 400,
    message_sv: 'Transaktionen är redan bokförd eller kopplad till en verifikation.',
    message_no: 'Transaksjonen er allerede bokført eller koblet til et bilag.',
    message_en: 'The transaction is already booked or linked to a journal entry.',
  },
  ROT_RUT_MATCH_CURRENCY: {
    httpStatus: 400,
    message_sv: 'Transaktionen kan inte matchas: Skatteverket betalar ut i SEK och transaktionen har en annan valuta.',
    message_no: 'Transaksjonen kan ikke matches: Skatteetaten betaler ut i SEK og transaksjonen har en annen valuta.',
    message_en: 'Skatteverket pays out in SEK; the transaction is in another currency.',
  },
  ROT_RUT_MATCH_TX_LINK_FAILED: {
    httpStatus: 409,
    message_sv:
      'Utbetalningen bokfördes men transaktionen kunde inte kopplas till verifikationen. Koppla den via "Matcha mot befintlig verifikation".',
    message_no: 'Utbetalingen ble bokført, men transaksjonen kunne ikke kobles til bilaget. Koble den via "Match mot eksisterende bilag".',
    message_en:
      'The payout was booked but the transaction could not be linked to the voucher. Link it via "Match against existing voucher".',
  },
  EXPENSE_PAYOUT_MATCH_NOT_EXPENSE: {
    httpStatus: 400,
    message_sv: 'Endast utbetalningar kan matchas mot utlägg.',
    message_no: 'Bare utbetalinger kan matches mot utlegg.',
    message_en: 'Only outgoing transactions can be matched to expense claims.',
  },
  EXPENSE_PAYOUT_MATCH_TX_ALREADY_LINKED: {
    httpStatus: 400,
    message_sv: 'Transaktionen är redan bokförd eller kopplad till en verifikation.',
    message_no: 'Transaksjonen er allerede bokført eller koblet til et bilag.',
    message_en: 'The transaction is already booked or linked to a journal entry.',
  },
  EXPENSE_PAYOUT_MATCH_CURRENCY: {
    httpStatus: 400,
    message_sv: 'Utlägg betalas ut i SEK och transaktionen har en annan valuta.',
    message_no: 'Utlegg betales ut i SEK og transaksjonen har en annen valuta.',
    message_en: 'Expense claims are reimbursed in SEK; the transaction is in another currency.',
  },
  EXPENSE_PAYOUT_MATCH_AMOUNT: {
    httpStatus: 400,
    message_sv: 'Beloppet stämmer inte med de valda utläggen. Välj de utlägg som överföringen täcker.',
    message_no: 'Beløpet stemmer ikke med de valgte utleggene. Velg de utleggene som overføringen dekker.',
    message_en: 'The amount does not match the selected expense claims. Pick the claims this transfer covers.',
  },
  // Reclaim: Skatteverkets avslag booked back onto the customer
  ROT_RUT_RECLAIM_NO_BESLUT: {
    httpStatus: 400,
    message_sv:
      'Skatteverkets beslut är inte registrerat för begäran. Importera beslutsfilen eller registrera beslutet först.',
    message_no: 'Skatteverkets vedtak er ikke registrert for søknaden. Importer vedtaksfilen eller registrer vedtaket først.',
    message_en:
      "Skatteverket's decision is not recorded for this request. Import the decision file or record the decision first.",
  },
  ROT_RUT_RECLAIM_NOTHING_REFUSED: {
    httpStatus: 400,
    message_sv: 'Skatteverket beviljade hela begäran: det finns inget nekat belopp att bokföra.',
    message_no: 'Skatteverket innvilget hele søknaden: det finnes ikke noe avslått beløp å bokføre.',
    message_en: 'Skatteverket approved the whole request: there is no refused amount to book.',
  },
  ROT_RUT_RECLAIM_ALREADY_DONE: {
    httpStatus: 409,
    message_sv: 'Det nekade beloppet är redan bokfört för den här begäran.',
    message_no: 'Det avslåtte beløpet er allerede bokført for denne søknaden.',
    message_en: 'The refused amount has already been booked for this request.',
  },
  ROT_RUT_RECLAIM_SPLIT_UNKNOWN: {
    httpStatus: 400,
    message_sv:
      'Beslutet är registrerat som en totalsumma för flera fakturor. Importera Skatteverkets beslutsfil så att det nekade beloppet kan fördelas per faktura.',
    message_no: 'Vedtaket er registrert som en totalsum for flere fakturaer. Importer Skatteverkets vedtaksfil slik at det avslåtte beløpet kan fordeles per faktura.',
    message_en:
      "The decision was recorded as one total for several invoices. Import Skatteverket's decision file so the refused amount can be split per invoice.",
  },
  ROT_RUT_RECLAIM_INVOICE_NOT_BOOKED: {
    httpStatus: 400,
    message_sv:
      'Fakturan har ingen verifikation, så det finns ingen fordran på konto 1513 att flytta. Bokför fakturan först.',
    message_no: 'Fakturaen har ikke noe bilag, så det finnes ingen fordring på konto 1513 å flytte. Bokfør fakturaen først.',
    message_en:
      'The invoice has no voucher, so there is no receivable on account 1513 to move. Book the invoice first.',
  },
  ROT_RUT_RECLAIM_INVOICE_NOT_OPEN: {
    httpStatus: 400,
    message_sv: 'Fakturan är makulerad eller krediterad och kan inte öppnas igen för det nekade beloppet.',
    message_no: 'Fakturaen er makulert eller kreditert og kan ikke åpnes igjen for det avslåtte beløpet.',
    message_en: 'The invoice is cancelled or credited and cannot be reopened for the refused amount.',
  },
  ROT_RUT_RECLAIM_CURRENCY: {
    httpStatus: 400,
    message_sv: 'Det nekade beloppet kan bara bokföras för fakturor i SEK.',
    message_no: 'Det avslåtte beløpet kan bare bokføres for fakturaer i SEK.',
    message_en: 'The refused amount can only be booked for invoices in SEK.',
  },
  ROT_RUT_RECLAIM_INVOICE_REREQUESTED: {
    httpStatus: 409,
    message_sv:
      'Minst en faktura i begäran ingår i en senare begäran som inte är avslagen. Det nekade beloppet kan inte bokföras på kunden när Skatteverket prövar fakturan igen.',
    message_no: 'Minst én faktura i søknaden inngår i en senere søknad som ikke er avslått. Det avslåtte beløpet kan ikke bokføres på kunden når Skatteverket prøver fakturaen på nytt.',
    message_en:
      'At least one invoice in this request is part of a later request that is not rejected. The refused amount cannot be booked onto the customer while Skatteverket is reviewing the invoice again.',
  },
  ROT_RUT_RECLAIM_RACE: {
    httpStatus: 409,
    message_sv:
      'Det nekade beloppet hann redan bokföras av en annan åtgärd. Verifikationen som skapades kan inte kopplas: kontrollera bokföringen på konto 1513 och 1510.',
    message_no: 'Det avslåtte beløpet rakk allerede å bli bokført av en annen handling. Bilaget som ble opprettet kan ikke kobles: kontroller bokføringen på konto 1513 og 1510.',
    message_en:
      'The refused amount was already booked by another action. The voucher that was created could not be attached: check the bookkeeping on accounts 1513 and 1510.',
  },
  ROT_RUT_FILE_CREATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Filen kunde inte skapas.',
    message_no: 'Filen kunne ikke opprettes.',
    message_en: 'The payout file could not be created.',
  },
  ROT_RUT_BESLUT_WRONG_COMPANY: {
    httpStatus: 400,
    message_sv:
      'Beslutsfilens utförare matchar inte företagets organisationsnummer. Kontrollera att filen laddades ner för rätt företag.',
    message_no: 'Vedtaksfilens utfører samsvarer ikke med foretakets organisasjonsnummer. Kontroller at filen ble lastet ned for riktig foretak.',
    message_en:
      "The decision file's utförare does not match the company's organisation number. Check that the file was downloaded for the right company.",
  },
  INVOICE_CREATE_INSERT_FAILED: {
    httpStatus: 500,
    message_sv: 'Fakturan kunde inte sparas.',
    message_no: 'Fakturaen kunne ikke lagres.',
    message_en: 'Invoice insert failed.',
  },
  INVOICE_CREATE_ITEMS_FAILED: {
    httpStatus: 500,
    message_sv: 'Fakturaraderna kunde inte sparas.',
    message_no: 'Fakturalinjene kunne ikke lagres.',
    message_en: 'Invoice items insert failed.',
  },
  INVOICE_CREATE_NUMBER_ASSIGN_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte tilldela fakturanummer vid skapande.',
    message_no: 'Kunne ikke tildele fakturanummer ved oppretting.',
    message_en: 'Failed to assign invoice number on create.',
  },
  INVOICE_CREDIT_ORIGINAL_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Ursprungsfakturan kunde inte hittas.',
    message_no: 'Opprinnelsesfakturaen kunne ikke finnes.',
    message_en: 'Original invoice not found.',
  },
  INVOICE_CREDIT_NOT_INVOICE: {
    httpStatus: 400,
    message_sv: 'Kreditfakturor kan endast skapas från riktiga fakturor.',
    message_no: 'Kreditnotaer kan bare opprettes fra ordentlige fakturaer.',
    message_en: 'Credit notes can only be created from standard invoices.',
  },
  INVOICE_CREDIT_ALREADY_CREDITED: {
    httpStatus: 400,
    message_sv: 'Fakturan har redan krediterats.',
    message_no: 'Fakturaen er allerede kreditert.',
    message_en: 'Invoice has already been credited.',
  },
  INVOICE_CREDIT_ROT_RUT_RECLAIMED: {
    httpStatus: 400,
    message_sv:
      'Fakturan har ett nekat ROT/RUT-avdrag bokfört som kundfordran. Makulera den bokningen (verifikationen med nekat avdrag) innan fakturan krediteras, annars stämmer inte kreditfakturans fördelning mellan konto 1510 och 1513.',
    message_no: 'Fakturaen har et avslått ROT/RUT-fradrag bokført som kundefordring. Makuler den bokføringen (bilaget med avslått fradrag) før fakturaen krediteres, ellers stemmer ikke kreditnotaens fordeling mellom konto 1510 og 1513.',
    message_en:
      'The invoice carries a refused ROT/RUT deduction booked as a customer receivable. Reverse that voucher before crediting the invoice, otherwise the credit note splits 1510 and 1513 wrongly.',
  },
  INVOICE_CREDIT_PERIOD_LOCKED: {
    httpStatus: 400,
    message_sv: 'Bokföringen är låst för dagens datum. Kreditfakturan kan inte skapas.',
    message_no: 'Bokføringen er låst for dagens dato. Kreditnotaen kan ikke opprettes.',
    message_en: 'Bookkeeping is locked for today\'s date; the credit note cannot be created.',
    remediation: {
      description:
        'The credit note is dated today (Europe/Stockholm) and that date falls in a closed or locked period, or on/before the company lock date (details.reason). Unlock the period in the dashboard or wait for the next open period; the API cannot backdate or forward-date a credit note.',
    },
  },
  INVOICE_CREDIT_NOT_SENT: {
    httpStatus: 400,
    message_sv: 'Endast skickade, betalda eller förfallna fakturor kan krediteras.',
    message_no: 'Bare sendte, betalte eller forfalte fakturaer kan krediteres.',
    message_en: 'Only sent, paid, or overdue invoices can be credited.',
  },
  INVOICE_CREDIT_NO_NUMBER: {
    httpStatus: 400,
    message_sv: 'Ursprungsfakturan saknar fakturanummer och kan inte krediteras.',
    message_no: 'Opprinnelsesfakturaen mangler fakturanummer og kan ikke krediteres.',
    message_en: 'The original invoice has no invoice number and cannot be credited.',
  },
  INVOICE_CREDIT_ISSUE_INCOMPLETE: {
    httpStatus: 500,
    message_sv:
      'Kreditfakturan kunde inte utfärdas färdigt. Ingen e-post skickades. Försök igen.',
    message_no: 'Kreditnotaen kunne ikke fullføres. Ingen e-post ble sendt. Prøv igjen.',
    message_en:
      'The credit note could not be issued completely. No email was sent. Please try again.',
  },
  INVOICE_CREDIT_REPAIR_REQUIRED: {
    httpStatus: 500,
    message_sv: 'Kreditfakturans verifikat skapades, men utfärdandet måste slutföras. Försök igen eller kontakta support.',
    message_no: 'Kreditnotaens bilag ble opprettet, men utstedelsen må fullføres. Prøv igjen eller kontakt support.',
    message_en: 'The credit-note voucher was created, but issuance must be completed. Retry or contact support.',
  },
  INVOICE_CREDIT_ALREADY_ISSUED: {
    httpStatus: 409,
    message_sv: 'Kreditfakturan har redan utfärdats.',
    message_no: 'Kreditnotaen er allerede utstedt.',
    message_en: 'The credit note has already been issued.',
  },
  INVOICE_MARK_SENT_INVALID_STATUS: {
    httpStatus: 400,
    message_sv: 'Fakturan kan inte markeras som skickad i nuvarande status.',
    message_no: 'Fakturaen kan ikke merkes som sendt i nåværende status.',
    message_en: 'The invoice cannot be marked as sent in its current status.',
  },
  INVOICE_MARK_SENT_STATUS_FAILED: {
    httpStatus: 500,
    message_sv: 'Fakturans status kunde inte uppdateras.',
    message_no: 'Fakturaens status kunne ikke oppdateres.',
    message_en: 'The invoice status could not be updated.',
  },
  INVOICE_MARK_SENT_RACE: {
    httpStatus: 409,
    message_sv: 'Fakturan ändrades av en annan begäran. Ladda om och försök igen.',
    message_no: 'Fakturaen ble endret av en annen forespørsel. Last inn på nytt og prøv igjen.',
    message_en: 'The invoice was changed by another request. Reload and retry.',
  },
  INVOICE_MARK_SENT_LINES_UNBALANCED: {
    httpStatus: 400,
    message_sv: 'Verifikationsraderna är inte balanserade (debet ≠ kredit).',
    message_no: 'Bilagslinjene er ikke balansert (debet ≠ kredit).',
    message_en: 'Custom journal lines do not balance.',
  },
  INVOICE_MARK_SENT_LINES_INVALID: {
    httpStatus: 400,
    message_sv: 'Verifikationsraderna kan inte användas: en rad har både debet och kredit, eller använder ett interimskonto (29xx). Använd periodisering på fakturaraden istället.',
    message_no: 'Bilagslinjene kan ikke brukes: en linje har både debet og kredit, eller bruker en interimskonto (29xx). Bruk periodisering på fakturalinjen i stedet.',
    message_en: 'Custom journal lines are invalid: a row carries both debit and credit, or uses a 29xx interim account. Use line-level periodisering instead.',
  },
  INVOICE_MARK_SENT_BOOK_FAILED: {
    httpStatus: 500,
    message_sv: 'Fakturan kunde inte bokföras och ligger kvar som utkast.',
    message_no: 'Fakturaen kunne ikke bokføres og ligger fortsatt som utkast.',
    message_en: 'The invoice could not be posted and remains a draft.',
  },
  INVOICE_MARK_SENT_REPAIR_REQUIRED: {
    httpStatus: 500,
    message_sv: 'Verifikatet skapades, men kopplingen till fakturan måste återställas. Kontakta support.',
    message_no: 'Bilaget ble opprettet, men koblingen til fakturaen må gjenopprettes. Kontakt support.',
    message_en: 'The voucher was created, but its invoice link must be repaired. Contact support.',
  },
  INVOICE_BOOK_ALREADY_BOOKED: {
    httpStatus: 400,
    message_sv: 'Fakturan är redan bokförd.',
    message_no: 'Fakturaen er allerede bokført.',
    message_en: 'The invoice is already booked.',
  },
  INVOICE_BOOK_INVALID_STATUS: {
    httpStatus: 400,
    message_sv: 'Endast skickade eller förfallna fakturor kan bokföras i efterhand.',
    message_no: 'Bare sendte eller forfalte fakturaer kan bokføres i ettertid.',
    message_en: 'Only sent or overdue invoices can be booked afterwards.',
  },
  INVOICE_BOOK_NOT_BOOKABLE: {
    httpStatus: 400,
    message_sv: 'Kreditfakturor och andra dokumenttyper bokförs inte via detta steg.',
    message_no: 'Kreditnotaer og andre dokumenttyper bokføres ikke via dette trinnet.',
    message_en: 'Credit notes and other document types are not booked through this step.',
  },
  INVOICE_BOOK_CASH_METHOD: {
    httpStatus: 400,
    message_sv: 'Vid kontantmetoden bokförs fakturan när den betalas.',
    message_no: 'Ved kontantmetoden bokføres fakturaen når den betales.',
    message_en: 'Under the cash method the invoice is booked when it is paid.',
  },
  // Bulk Bokför on a DRAFT when the company defers invoice booking (#967):
  // issuing the draft would consume an F-number and mark it sent without
  // booking anything, so the item is rejected before any side effect.
  INVOICE_BOOK_DEFERRED_DRAFT: {
    httpStatus: 400,
    message_sv:
      'Företaget bokför fakturor i ett separat steg. Skicka eller markera utkastet som skickat först, bokför sedan.',
    message_no: 'Bedriften bokfører fakturaer i et separat trinn. Send eller merk utkastet som sendt først, og bokfør deretter.',
    message_en:
      'This company books invoices in a separate step. Send or mark the draft as sent first, then book it.',
  },
  INVOICE_BOOK_NO_FISCAL_PERIOD: {
    httpStatus: 400,
    message_sv: 'Inget öppet räkenskapsår täcker fakturadatumet. Skapa räkenskapsåret först.',
    message_no: 'Ingen åpen regnskapsperiode dekker fakturadatoen. Opprett regnskapsperioden først.',
    message_en: 'No open fiscal period covers the invoice date. Create the fiscal year first.',
  },
  INVOICE_BOOK_CONFLICT: {
    httpStatus: 409,
    message_sv: 'Fakturan bokfördes samtidigt av en annan begäran. Ladda om sidan.',
    message_no: 'Fakturaen ble bokført samtidig av en annen forespørsel. Last inn siden på nytt.',
    message_en: 'The invoice was booked concurrently by another request. Reload the page.',
  },
  INVOICE_BOOK_FAILED: {
    httpStatus: 500,
    message_sv: 'Fakturan kunde inte bokföras.',
    message_no: 'Fakturaen kunne ikke bokføres.',
    message_en: 'Failed to book the invoice.',
  },
  // Raised by lib/bookkeeping/invoice-entries.ts when a foreign-currency
  // customer invoice reaches a booking path with no exchange rate. Items carry
  // no per-item SEK column, so the rate is the only honest source; booking 1:1
  // would still balance (the 1510 debit is derived from the credits) while
  // understating ruta 05 and ruta 10 of the momsdeklaration. Sales-side twin of
  // SI_FX_RATE_MISSING.
  INVOICE_FX_RATE_MISSING: {
    httpStatus: 400,
    message_sv:
      'Fakturan är i utländsk valuta men saknar växelkurs. Ange fakturans växelkurs innan den bokförs: utan kurs kan beloppen inte räknas om till kronor och momsen blir fel.',
    message_no: 'Fakturaen er i utenlandsk valuta, men mangler valutakurs. Angi fakturaens valutakurs før den bokføres: uten kurs kan beløpene ikke regnes om til kroner, og mvaen blir feil.',
    message_en:
      'The invoice is in a foreign currency but has no exchange rate on file. Set the invoice exchange rate before booking; without it the amounts cannot be translated to SEK and the output VAT would be understated.',
    remediation: {
      description:
        'Set exchange_rate on the invoice (the rate at the taxable-event date) and retry. On an unbooked invoice, POST /api/invoices/{id}/refresh-exchange-rate fetches it from Riksbanken.',
    },
  },
  INVOICE_SEND_EMAIL_NOT_CONFIGURED: {
    httpStatus: 503,
    message_sv:
      'E-posttjänsten är inte konfigurerad. Kontrollera att RESEND_API_KEY och RESEND_FROM_EMAIL är satta (eller SMTP_HOST och SMTP_FROM_EMAIL med EMAIL_PROVIDER=smtp).',
    message_no: 'E-posttjenesten er ikke konfigurert. Kontroller at RESEND_API_KEY og RESEND_FROM_EMAIL er satt (eller SMTP_HOST og SMTP_FROM_EMAIL med EMAIL_PROVIDER=smtp).',
    message_en: 'Email service is not configured.',
    remediation: {
      description: 'Set RESEND_API_KEY and RESEND_FROM_EMAIL (or SMTP_HOST and SMTP_FROM_EMAIL with EMAIL_PROVIDER=smtp) in the deployment environment.',
    },
  },
  INVOICE_SEND_NO_CUSTOMER_EMAIL: {
    httpStatus: 400,
    message_sv: 'Kunden saknar e-postadress. Uppdatera kunduppgifterna först.',
    message_no: 'Kunden mangler e-postadresse. Oppdater kundeopplysningene først.',
    message_en: 'Customer has no email address.',
    remediation: { description: 'Add an email address on the customer record before sending.' },
  },
  INVOICE_SEND_TOO_MANY_RECIPIENTS: {
    httpStatus: 400,
    message_sv: 'Ett fakturautskick får ha högst 20 mottagare totalt.',
    message_no: 'En fakturautsendelse kan ha høyst 20 mottakere totalt.',
    message_en: 'An invoice email may have at most 20 recipients in total.',
    remediation: { description: 'Remove CC or BCC recipients before sending the invoice.' },
  },
  INVOICE_SEND_COMPANY_SETTINGS_MISSING: {
    httpStatus: 404,
    message_sv: 'Företagsinställningar saknas.',
    message_no: 'Bedriftsinnstillinger mangler.',
    message_en: 'Company settings are missing.',
  },
  INVOICE_SEND_PAYMENT_ACCOUNT_INVALID: {
    httpStatus: 400,
    message_sv: 'Bankkontot som fakturan ska betalas till kan inte längre användas: det är avstängt, borttaget från kundfakturor eller saknar uppgifter för fakturans valuta. Välj ett annat konto på fakturan eller uppdatera kontot under Inställningar → Fakturering.',
    message_no: 'Bankkontoen som fakturaen skal betales til, kan ikke lenger brukes: den er stengt, fjernet fra kundefakturaer eller mangler opplysninger for fakturaens valuta. Velg en annen konto på fakturaen, eller oppdater kontoen under Innstillinger → Fakturering.',
    message_en: 'The bank account this invoice is to be paid to can no longer be used: it is disabled, no longer shown on customer invoices, or lacks details for the invoice currency. Pick another account on the invoice or update the account under Inställningar → Fakturering (Settings → Invoicing).',
    remediation: {
      description: 'Välj ett annat bankkonto på fakturan, eller återaktivera kontot och fyll i dess betaluppgifter under Inställningar → Fakturering.',
    },
  },
  INVOICE_PAYEE_SNAPSHOT_FAILED: {
    httpStatus: 500,
    message_sv: 'Betaluppgifterna kunde inte sparas på fakturan. Fakturan skickades inte; försök igen.',
    message_no: 'Betalingsopplysningene kunne ikke lagres på fakturaen. Fakturaen ble ikke sendt; prøv igjen.',
    message_en: 'The payment details could not be saved on the invoice. The invoice was not sent; try again.',
  },
  INVOICE_PAYEE_ACCOUNT_INVALID: {
    httpStatus: 400,
    message_sv: 'Bankkontot kan inte användas som betalningsmottagare på fakturan: det tillhör inte företaget, visas inte på kundfakturor eller saknar uppgifter för fakturans valuta.',
    message_no: 'Bankkontoen kan ikke brukes som betalingsmottaker på fakturaen: den tilhører ikke bedriften, vises ikke på kundefakturaer eller mangler opplysninger for fakturaens valuta.',
    message_en: 'The bank account cannot be the payee on this invoice: it does not belong to the company, is not shown on customer invoices, or lacks details for the invoice currency.',
    remediation: {
      description: 'Välj ett av företagets bankkonton som är markerat "Visas på fakturor" och har betaluppgifter för fakturans valuta.',
    },
  },
  INVOICE_SEND_PAYMENT_ACCOUNT_MISSING: {
    httpStatus: 400,
    // Currency-neutral by necessity (the registry has no details). Surfaces
    // that know the invoice currency say exactly what is missing through
    // describeMissingInvoicePaymentAccount() (lib/invoices/payment-accounts.ts).
    message_sv: 'Fakturan saknar betalningsuppgifter för sin valuta: bankgiro, plusgiro, Swish eller bankkonto för SEK, IBAN för andra valutor. Lägg till dem under Inställningar → Fakturering innan du skapar PDF-filen eller skickar fakturan.',
    message_no: 'Fakturaen mangler betalingsopplysninger for sin valuta: Bankgiro, Plusgiro, Swish eller bankkonto for SEK, IBAN for andre valutaer. Legg dem til under Innstillinger → Fakturering før du oppretter PDF-filen eller sender fakturaen.',
    message_en: 'The invoice has no payment details for its currency: bankgiro, plusgiro, Swish or a bank account for SEK, an IBAN for other currencies. Add them under Inställningar → Fakturering (Settings → Invoicing) before generating the PDF or sending the invoice.',
    remediation: {
      description: 'Lägg till betalningsuppgifter för fakturans valuta under Inställningar → Fakturering: bankgiro, plusgiro, Swish eller bankkonto för SEK, IBAN för andra valutor.',
    },
  },
  INVOICE_SEND_VAT_NUMBER_MISSING: {
    httpStatus: 400,
    message_sv: 'Företaget är momsregistrerat men saknar momsregistreringsnummer, som måste anges på fakturan (ML 17 kap. 24 §). Lägg till det under Inställningar → Skatt innan du skickar fakturan.',
    message_no: 'Bedriften er mva-registrert, men mangler mva-registreringsnummer, som må angis på fakturaen (ML 17 kap. 24 §). Legg det til under Innstillinger → Skatt før du sender fakturaen.',
    message_en: 'The company is VAT-registered but has no VAT number, which is a mandatory invoice element (ML 17 kap. 24 §). Add it under Inställningar → Skatt (Settings → Tax) before issuing the invoice.',
    remediation: {
      description: 'Lägg till företagets momsregistreringsnummer under Inställningar → Skatt.',
    },
  },
  INVOICE_SEND_NUMBER_ASSIGN_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte tilldela fakturanummer.',
    message_no: 'Kunne ikke tildele fakturanummer.',
    message_en: 'Failed to assign invoice number on send.',
  },
  INVOICE_SEND_PROVIDER_FAILED: {
    httpStatus: 502,
    message_sv: 'E-postleverantören kunde inte skicka meddelandet.',
    message_no: 'E-postleverandøren kunne ikke sende meldingen.',
    message_en: 'The email provider could not deliver the message.',
  },
  INVOICE_SEND_SNAPSHOT_FAILED: {
    httpStatus: 500,
    message_sv: 'Utskicksinformationen kunde inte sparas. Ingen e-post skickades.',
    message_no: 'Utsendelsesinformasjonen kunne ikke lagres. Ingen e-post ble sendt.',
    message_en: 'The delivery snapshot could not be saved. No email was sent.',
  },
  INVOICE_SEND_PDF_RENDER_FAILED: {
    httpStatus: 500,
    message_sv:
      'Fakturans PDF kunde inte skapas. Kontrollera fakturarader och kunduppgifter och försök igen.',
    message_no: 'Fakturaens PDF kunne ikke opprettes. Kontroller fakturalinjer og kundeopplysninger, og prøv igjen.',
    message_en: 'Failed to render invoice PDF before send; no invoice number was consumed.',
  },
  INVOICE_PDF_RENDER_FAILED: {
    httpStatus: 500,
    message_sv: 'Fakturans PDF kunde inte skapas.',
    message_no: 'Fakturaens PDF kunne ikke opprettes.',
    message_en: 'Invoice PDF rendering failed.',
  },
  INVOICE_SEND_PARTIAL: {
    httpStatus: 200,
    message_sv:
      'Fakturan skickades men en efterföljande åtgärd misslyckades (verifikation eller PDF-bilaga).',
    message_no: 'Fakturaen ble sendt, men en etterfølgende handling mislyktes (bilag eller PDF-vedlegg).',
    message_en: 'Invoice was sent but a follow-up step (journal entry or PDF) failed.',
  },
  INVOICE_SEND_CANCELLED: {
    httpStatus: 400,
    message_sv: 'Makulerade fakturor kan inte skickas. Skapa en ny faktura istället.',
    message_no: 'Makulerte fakturaer kan ikke sendes. Opprett en ny faktura i stedet.',
    message_en: 'Cancelled invoices cannot be sent; create a new invoice instead.',
  },
  INVOICE_PAID_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Fakturan kunde inte hittas.',
    message_no: 'Fakturaen kunne ikke finnes.',
    message_en: 'Invoice not found.',
  },
  INVOICE_PAID_NOT_PAYABLE: {
    httpStatus: 400,
    message_sv: 'Fakturan kan inte markeras som betald i nuvarande status.',
    message_no: 'Fakturaen kan ikke merkes som betalt i gjeldende status.',
    message_en: 'Invoice is not in a payable status.',
  },
  INVOICE_QUOTE_NOT_PAYABLE: {
    httpStatus: 400,
    message_sv: 'En offert kan inte betalas. Skapa en faktura från offerten först.',
    message_no: 'Et tilbud kan ikke betales. Opprett en faktura fra tilbudet først.',
    message_en: 'A quote cannot be paid. Convert it to an invoice first.',
    remediation: {
      description: 'Convert the accepted quote with POST /api/invoices/{id}/convert, then register the payment on the invoice.',
    },
  },
  INVOICE_NOT_A_QUOTE: {
    httpStatus: 400,
    message_sv: 'Dokumentet är inte en offert.',
    message_no: 'Dokumentet er ikke et tilbud.',
    message_en: 'This document is not a quote.',
  },
  INVOICE_QUOTE_NOT_DECIDABLE: {
    httpStatus: 400,
    message_sv: 'Makulerade offerter kan inte accepteras eller avböjas.',
    message_no: 'Makulerte tilbud kan ikke aksepteres eller avslås.',
    message_en: 'A cancelled quote cannot be accepted or declined.',
  },
  INVOICE_QUOTE_ALREADY_INVOICED: {
    httpStatus: 409,
    message_sv: 'Offerten är redan fakturerad och kan inte ändras.',
    message_no: 'Tilbudet er allerede fakturert og kan ikke endres.',
    message_en: 'This quote has already been invoiced and can no longer change.',
  },
  INVOICE_QUOTE_ALREADY_ORDERED: {
    httpStatus: 409,
    message_sv: 'Offerten har redan en kundorder. Fakturera från kundordern i stället.',
    message_no: 'Tilbudet har allerede en kundeordre. Fakturer fra kundeordren i stedet.',
    message_en: 'This quote already has a sales order. Invoice from the sales order instead.',
  },
  INVOICE_CONVERT_NOT_CONVERTIBLE: {
    httpStatus: 400,
    message_sv: 'Endast proformafakturor och offerter kan omvandlas till faktura.',
    message_no: 'Bare proformafakturaer og tilbud kan omgjøres til faktura.',
    message_en: 'Only proforma invoices and quotes can be converted to an invoice.',
  },
  INVOICE_CONVERT_SOURCE_CANCELLED: {
    httpStatus: 409,
    message_sv: 'Dokumentet är makulerat och kan inte omvandlas.',
    message_no: 'Dokumentet er makulert og kan ikke omgjøres.',
    message_en: 'This document is cancelled and cannot be converted.',
  },
  INVOICE_CONVERT_SOURCE_CHANGED: {
    httpStatus: 409,
    message_sv: 'Dokumentet ändrades samtidigt (makulerat, omvandlat eller beslutat på annat sätt). Ladda om och försök igen.',
    message_no: 'Dokumentet ble endret samtidig (makulert, omgjort eller besluttet på annen måte). Last inn på nytt og prøv igjen.',
    message_en: 'The document changed concurrently (cancelled, converted or decided elsewhere). Reload and try again.',
  },
  INVOICE_QUOTE_CHANGED_CONCURRENTLY: {
    httpStatus: 409,
    message_sv: 'Offerten ändrades samtidigt (fakturerad, makulerad eller beslutad på annat sätt). Ladda om och försök igen.',
    message_no: 'Tilbudet ble endret samtidig (fakturert, makulert eller besluttet på annen måte). Last inn på nytt og prøv igjen.',
    message_en: 'The quote changed concurrently (invoiced, cancelled or decided elsewhere). Reload and try again.',
  },
  INVOICE_CONVERT_QUOTE_DECLINED: {
    httpStatus: 409,
    message_sv: 'Offerten är avböjd. Markera den som accepterad innan du skapar en faktura.',
    message_no: 'Tilbudet er avslått. Merk det som akseptert før du oppretter en faktura.',
    message_en: 'The quote was declined. Mark it accepted before creating an invoice.',
  },
  INVOICE_UPDATE_DOCUMENT_TYPE_LOCKED: {
    httpStatus: 400,
    message_sv: 'Dokumenttypen kan inte ändras på en offert eller följesedel: numret hör till serien. Skapa ett nytt dokument i stället.',
    message_no: 'Dokumenttypen kan ikke endres på et tilbud eller en følgeseddel: nummeret hører til serien. Opprett et nytt dokument i stedet.',
    message_en: 'The document type of a quote or delivery note cannot change: its number belongs to that series. Create a new document instead.',
  },
  INVOICE_PAYMENT_CONFIRMATION_NOT_PAID: {
    httpStatus: 409,
    message_sv:
      'En betalningsbekräftelse kan bara skapas för en faktura som är fullt betald.',
    message_no: 'En betalingsbekreftelse kan bare opprettes for en faktura som er fullt betalt.',
    message_en: 'A payment confirmation can only be produced for a fully paid invoice.',
    remediation: {
      description:
        'Register the payment first (POST /api/invoices/{id}/mark-paid) so the invoice reaches status paid; credit notes and proformas never qualify.',
    },
  },
  INVOICE_PAID_LINES_UNBALANCED: {
    httpStatus: 400,
    message_sv: 'Verifikationsraderna är inte balanserade (debet ≠ kredit).',
    message_no: 'Bilagslinjene er ikke balanserte (debet ≠ kredit).',
    message_en: 'Custom journal lines do not balance.',
  },
  INVOICE_PAID_NO_FISCAL_PERIOD: {
    httpStatus: 400,
    message_sv: 'Ingen öppen räkenskapsperiod för betalningsdatumet.',
    message_no: 'Ingen åpen regnskapsperiode for betalingsdatoen.',
    message_en: 'No open fiscal period covers the payment date.',
  },
  INVOICE_PAID_RACE: {
    httpStatus: 409,
    message_sv: 'Fakturan har redan betalats av en annan förfrågan.',
    message_no: 'Fakturaen er allerede betalt av en annen forespørsel.',
    message_en: 'Invoice was already paid by another request.',
  },
  INVOICE_PAID_BOOK_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte bokföra betalningen.',
    message_no: 'Kunne ikke bokføre betalingen.',
    message_en: 'Failed to create payment journal entry.',
  },
  INVOICE_PAID_LIKELY_DUPLICATE: {
    httpStatus: 409,
    message_sv:
      'Det finns redan en obokförd inkommande banktransaktion som kan vara denna betalning. Länka den istället, eller markera som betald ändå om du är säker.',
    message_no: 'Det finnes allerede en ubokført inngående banktransaksjon som kan være denne betalingen. Koble den i stedet, eller merk som betalt likevel hvis du er sikker.',
    message_en:
      'A likely-matching unlinked inbound bank transaction was found for this customer. Suggest linking it instead of creating a new payment entry.',
    remediation: {
      description:
        'Match the candidate transaction via POST /api/transactions/{id}/match-invoice, or resend mark-paid with force: true to create the payment entry anyway. When using the v1 endpoint, the force retry requires a fresh Idempotency-Key (the original key is bound to the body hash).',
    },
  },
  INVOICE_DELETE_NOT_DRAFT: {
    httpStatus: 400,
    message_sv: 'Endast utkast kan tas bort. Bokförda fakturor måste krediteras istället.',
    message_no: 'Bare utkast kan slettes. Bokførte fakturaer må krediteres i stedet.',
    message_en: 'Only draft invoices can be deleted; non-drafts must be credited.',
    remediation: {
      description: 'Issue a credit note instead of deleting a posted invoice.',
    },
  },
  INVOICE_UPDATE_NOT_DRAFT: {
    httpStatus: 409,
    message_sv: 'Endast utkast kan ändras. Bokförda fakturor är oföränderliga: utfärda en kreditfaktura istället.',
    message_no: 'Bare utkast kan endres. Bokførte fakturaer er uforanderlige: utsted en kreditnota i stedet.',
    message_en: 'Only draft invoices can be updated. Issued invoices are immutable: issue a credit note instead.',
    remediation: {
      description: 'Issue a credit note via POST /invoices/{id}:credit and create a fresh invoice with the corrected details.',
    },
  },
  INVOICE_CANCEL_RACE: {
    httpStatus: 409,
    message_sv: 'Fakturan ändrades samtidigt och kunde inte makuleras. Ladda om och försök igen.',
    message_no: 'Fakturaen ble endret samtidig og kunne ikke makuleres. Last inn på nytt og prøv igjen.',
    message_en: 'Invoice was modified concurrently and could not be cancelled. Reload and retry.',
  },
  INVOICE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Fakturan kunde inte hittas.',
    message_no: 'Fakturaen kunne ikke finnes.',
    message_en: 'Invoice not found.',
  },
  // POST /api/invoices/{id}/refresh-exchange-rate: the repair path for a
  // foreign-currency invoice whose SEK conversion is missing or was stamped
  // from the wrong day's rate. It works on sent invoices (PATCH does not), but
  // stops at the verifikat.
  INVOICE_FX_REFRESH_BOOKED: {
    httpStatus: 409,
    message_sv:
      'Fakturan är redan bokförd, så växelkursen kan inte räknas om här. Beloppen i kronor sitter i verifikatet och får bara ändras genom rättelse: makulera med storno och bokför om, eller rätta verifikatet inifrån (BFL 5 kap. 5 §).',
    message_no: 'Fakturaen er allerede bokført, så valutakursen kan ikke beregnes på nytt her. Beløpene i kroner ligger i bilaget og kan bare endres gjennom retting: makuler med storno og bokfør på nytt, eller rett bilaget innenfra (BFL 5 kap. 5 §).',
    message_en:
      'The invoice already has a verifikat, so its SEK conversion cannot be re-rated here. The SEK amounts are posted entries and may only be changed through one of the two sanctioned rättelse tracks (BFL 5 kap 5 §): storno + correcting entry, or the inline rättelse RPCs on an open unlocked period.',
    remediation: {
      description:
        'Reverse the invoice verifikat (gnubok_reverse_journal_entry) and rebook it with the correct rate, or correct it inline via gnubok_correct_entry while the period is still open and unlocked. Never update invoice.exchange_rate behind a posted entry.',
      tool: 'gnubok_reverse_journal_entry',
    },
  },
  INVOICE_FX_REFRESH_PERIOD_LOCKED: {
    httpStatus: 409,
    message_sv:
      'Räkenskapsperioden för fakturadatumet är låst eller stängd, så växelkursen kan inte uppdateras. Öppna perioden eller rätta med storno i en öppen period.',
    message_no: 'Regnskapsperioden for fakturadatoen er låst eller stengt, så valutakursen kan ikke oppdateres. Åpne perioden eller rett med storno i en åpen periode.',
    message_en:
      'The fiscal period covering the invoice date is locked or closed, so the exchange rate cannot be updated. details.period_status carries the verdict; lookup_failed: true means the lock state could not be read and the request was refused fail-closed.',
    remediation: {
      description:
        'Unlock the period via gnubok_unlock_period (only if the status is "locked", not "closed"), then retry. Past a close, the correction belongs in an open period as a storno.',
      tool: 'gnubok_unlock_period',
    },
  },
  INVOICE_FX_REFRESH_RATE_UNAVAILABLE: {
    httpStatus: 502,
    message_sv:
      'Kunde inte hämta växelkursen från Riksbanken för leverans-/fakturadatumet. Fakturan är oförändrad: en gissad kurs får inte bokföras. Försök igen om en stund.',
    message_no: 'Kunne ikke hente valutakursen fra Riksbanken for leverings-/fakturadatoen. Fakturaen er uendret: en gjettet kurs får ikke bokføres. Prøv igjen om litt.',
    message_en:
      'No Riksbanken observation could be retrieved for the taxable-event date (delivery_date, falling back to invoice_date) and no cached rate was available either. The invoice was left unchanged rather than converted at an invented rate.',
    retryable: true,
    remediation: {
      description:
        'Retry once Riksbanken responds. The permitted rate sources are the Nasdaq OMX mid-rate published by Riksbanken or the latest ECB rate (ML 8 kap 21-23 §); never substitute an estimate.',
    },
  },
  INVOICE_FINALIZE_NOT_DRAFT: {
    httpStatus: 409,
    message_sv: 'Endast onumrerade utkast kan skapas. Fakturan har redan ett nummer eller är inte ett utkast.',
    message_no: 'Bare unummererte utkast kan opprettes. Fakturaen har allerede et nummer eller er ikke et utkast.',
    message_en: 'Only unnumbered drafts can be finalized; this invoice already has a number or is not a draft.',
  },
  INVOICE_FINALIZE_INCOMPLETE: {
    httpStatus: 500,
    message_sv: 'Fakturanumret tilldelades men fakturan kunde inte läsas tillbaka. Ladda om sidan och kontrollera fakturan.',
    message_no: 'Fakturanummeret ble tildelt, men fakturaen kunne ikke leses tilbake. Last inn siden på nytt og kontroller fakturaen.',
    message_en: 'The invoice number was assigned but the invoice could not be re-read. Reload the page and verify the invoice.',
  },
  INVOICE_RECURRING_UPDATE_PARTIAL: {
    httpStatus: 500,
    message_sv:
      'Ändringen av det återkommande schemat kunde inte slutföras och schemat kan ha hamnat i ett halvsparat läge. Öppna schemat och kontrollera både fält och rader innan du sparar igen.',
    message_no: 'Endringen av det tilbakevendende oppsettet kunne ikke fullføres, og oppsettet kan ha havnet i en halvlagret tilstand. Åpne oppsettet og kontroller både felt og linjer før du lagrer på nytt.',
    message_en:
      'The recurring schedule update failed and the compensating rollback did not fully apply: the schedule may be left in a partial state (header fields and items out of sync). Inspect the schedule fields and items before retrying.',
  },
  // Quotes / Offerter
  QUOTE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Offerten kunde inte hittas.',
    message_no: 'Tilbudet kunne ikke finnes.',
    message_en: 'Quote not found.',
  },
  QUOTE_INVALID_STATE: {
    httpStatus: 400,
    message_sv: 'Offerten är inte i en status som tillåter denna åtgärd.',
    message_no: 'Tilbudet har ikke en status som tillater denne handlingen.',
    message_en: 'Quote is not in a state that allows this action.',
  },
  QUOTE_TOKEN_INVALID: {
    httpStatus: 404,
    message_sv: 'Länken är ogiltig eller har gått ut.',
    message_no: 'Lenken er ugyldig eller har gått ut.',
    message_en: 'The link is invalid or has expired.',
  },
  QUOTE_NUMBER_ASSIGN_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte tilldela offertnummer.',
    message_no: 'Kunne ikke tildele tilbudsnummer.',
    message_en: 'Failed to assign quote number.',
  },
  QUOTE_CONVERSION_FAILED: {
    httpStatus: 500,
    message_sv: 'Offerten kunde inte konverteras till faktura.',
    message_no: 'Tilbudet kunne ikke konverteres til faktura.',
    message_en: 'Failed to convert quote to invoice.',
  },
  QUOTE_NOT_QUOTE: {
    httpStatus: 400,
    message_sv: 'Detta dokument är inte en offert.',
    message_no: 'Dette dokumentet er ikke et tilbud.',
    message_en: 'This document is not a quote.',
  },
  // Kundorder (sales orders): lib/sales-orders/*, app/api/sales-orders/*
  SALES_ORDER_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Kundordern hittades inte.',
    message_no: 'Kundeordren ble ikke funnet.',
    message_en: 'The sales order was not found.',
  },
  SALES_ORDER_INVALID_STATE: {
    httpStatus: 409,
    message_sv: 'Kundordern har inte en status som tillåter den här åtgärden.',
    message_no: 'Kundeordren har ikke en status som tillater denne handlingen.',
    message_en: 'The sales order is not in a state that allows this action.',
  },
  SALES_ORDER_NOT_EDITABLE: {
    httpStatus: 409,
    message_sv: 'Kundordern kan bara ändras medan den är utkast eller bekräftad.',
    message_no: 'Kundeordren kan bare endres mens den er utkast eller bekreftet.',
    message_en: 'A sales order can only be edited while it is a draft or confirmed.',
  },
  SALES_ORDER_HAS_INVOICES: {
    httpStatus: 409,
    message_sv: 'Kundordern kan inte makuleras: det finns fakturor som skapats från den. Makulera eller kreditera fakturorna först.',
    message_no: 'Kundeordren kan ikke makuleres: det finnes fakturaer som er opprettet fra den. Makuler eller krediter fakturaene først.',
    message_en: 'The sales order cannot be cancelled: invoices have been created from it. Cancel or credit those invoices first.',
  },
  SALES_ORDER_LINE_NOT_FOUND: {
    httpStatus: 400,
    message_sv: 'En angiven orderrad finns inte på kundordern.',
    message_no: 'En angitt ordrelinje finnes ikke på kundeordren.',
    message_en: 'A referenced line does not exist on the sales order.',
  },
  SALES_ORDER_OVER_INVOICED: {
    httpStatus: 409,
    message_sv: 'Angivet antal överstiger vad som återstår att fakturera på orderraden.',
    message_no: 'Angitt antall overstiger det som gjenstår å fakturere på ordrelinjen.',
    message_en: 'The requested quantity exceeds what remains to be invoiced on the order line.',
  },
  SALES_ORDER_OVER_DELIVERED: {
    httpStatus: 400,
    message_sv: 'Levererat antal kan inte överstiga beställt antal.',
    message_no: 'Levert antall kan ikke overstige bestilt antall.',
    message_en: 'Delivered quantity cannot exceed the ordered quantity.',
  },
  SALES_ORDER_QUANTITY_BELOW_INVOICED: {
    httpStatus: 409,
    message_sv: 'Antalet på en orderrad kan inte sänkas under det som redan fakturerats.',
    message_no: 'Antallet på en ordrelinje kan ikke settes lavere enn det som allerede er fakturert.',
    message_en: 'An order line quantity cannot be lowered below what has already been invoiced.',
  },
  SALES_ORDER_NOTHING_TO_INVOICE: {
    httpStatus: 409,
    message_sv: 'Det finns inget kvar att fakturera på kundordern.',
    message_no: 'Det er ikke noe igjen å fakturere på kundeordren.',
    message_en: 'There is nothing left to invoice on the sales order.',
  },
  SALES_ORDER_CUSTOMER_MISSING: {
    httpStatus: 409,
    message_sv: 'Kundordern saknar kund. Ange en kund innan du fakturerar.',
    message_no: 'Kundeordren mangler kunde. Angi en kunde før du fakturerer.',
    message_en: 'The sales order has no customer. Set a customer before invoicing.',
  },
  SALES_ORDER_CREATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Kundordern kunde inte sparas.',
    message_no: 'Kundeordren kunne ikke lagres.',
    message_en: 'The sales order could not be saved.',
  },
  SALES_ORDER_LINE_LOCKED: {
    httpStatus: 409,
    message_sv: 'En orderrad med fakturerat eller levererat antal kan inte tas bort.',
    message_no: 'En ordrelinje med fakturert eller levert antall kan ikke fjernes.',
    message_en: 'An order line with invoiced or delivered quantity cannot be removed.',
  },
  SALES_ORDER_SOURCE_NOT_PROFORMA: {
    httpStatus: 400,
    message_sv: 'Bara en proformafaktura eller offert kan omvandlas till kundorder.',
    message_no: 'Bare en proformafaktura eller et tilbud kan konverteres til kundeordre.',
    message_en: 'Only a proforma invoice or a quote can be converted into a sales order.',
  },
  SALES_ORDER_SOURCE_UNSUPPORTED_LINES: {
    httpStatus: 400,
    message_sv: 'Underlaget innehåller rader som inte kan föras över till en kundorder (ROT/RUT-avdrag, periodisering eller negativt antal). Skapa kundordern manuellt.',
    message_no: 'Underlaget inneholder linjer som ikke kan overføres til en kundeordre (ROT/RUT-avdrag, periodisering eller negativt antall). Opprett kundeordren manuelt.',
    message_en: 'The source document has lines that cannot be carried into a sales order (ROT/RUT deduction, accrual period or negative quantity). Create the sales order manually.',
  },
  SALES_ORDER_CUSTOMER_VAT_CHANGED: {
    httpStatus: 409,
    message_sv: 'Kundens momsuppgifter (kundtyp eller VAT-nummer) har ändrats sedan kundordern prissattes. Öppna och spara kundordern igen så att momssatserna kontrolleras innan du fakturerar.',
    message_no: 'Kundens mva-opplysninger (kundetype eller VAT-nummer) er endret siden kundeordren ble priset. Åpne og lagre kundeordren på nytt, slik at mva-satsene kontrolleres før du fakturerer.',
    message_en: 'The customer VAT facts (customer type or VAT number validation) changed after the sales order was priced. Open and save the order again so the VAT rates are re-checked before invoicing.',
  },
  INVOICE_UPDATE_DROPS_ORDER_LINK: {
    httpStatus: 409,
    message_sv: 'Fakturan är skapad från en kundorder och ändringen skulle tappa kopplingen till orderraderna. Skicka med sales_order_item_id på raderna, eller makulera fakturan och skapa en ny från kundordern.',
    message_no: 'Fakturaen er opprettet fra en kundeordre, og endringen vil miste koblingen til ordrelinjene. Send med sales_order_item_id på linjene, eller makuler fakturaen og opprett en ny fra kundeordren.',
    message_en: 'The invoice was created from a sales order and this edit would drop the link to its order lines. Keep sales_order_item_id on the lines, or cancel the invoice and create a new one from the order.',
  },
  SALES_ORDER_SOURCE_ALREADY_CONVERTED: {
    httpStatus: 409,
    message_sv: 'Underlaget har redan en kundorder.',
    message_no: 'Underlaget har allerede en kundeordre.',
    message_en: 'The source document already has a sales order.',
  },
  SALES_ORDER_INVOICE_FX_RATE_UNAVAILABLE: {
    httpStatus: 502,
    message_sv:
      'Kunde inte hämta växelkursen från Riksbanken för leverans-/fakturadatumet. Fakturan har inte skapats: en gissad kurs får inte bokföras. Försök igen om en stund.',
    message_no: 'Kunne ikke hente valutakursen fra Riksbanken for leverings-/fakturadatoen. Fakturaen er ikke opprettet: en antatt kurs må ikke bokføres. Prøv igjen om litt.',
    message_en:
      'Could not fetch the Riksbanken exchange rate for the delivery/invoice date. No invoice was created: a guessed rate must not be booked. Try again shortly.',
  },
  // POST /api/invoices/{id}/peppol/send. The Access Point is an environment
  // decision (PEPPOL_TRANSPORT_PROVIDER + adapter credentials); the product
  // never pretends to send when no adapter is switched on.
  SCB_NOT_CONFIGURED: {
    httpStatus: 503,
    message_sv: 'Uppslag mot SCB:s företagsregister är inte aktiverat i den här miljön.',
    message_no: 'Oppslag mot SCB sitt foretaksregister er ikke aktivert i dette miljøet.',
    message_en: 'Lookups against the SCB business register are not enabled in this environment.',
  },
  SCB_LOOKUP_FAILED: {
    httpStatus: 502,
    message_sv: 'SCB:s företagsregister svarade inte. Försök igen om en stund.',
    message_no: 'SCB sitt foretaksregister svarte ikke. Prøv igjen om litt.',
    message_en: 'The SCB business register did not answer. Try again shortly.',
  },
  SCB_NOT_A_LEGAL_PERSON: {
    httpStatus: 400,
    message_sv: 'Uppgifter hämtas bara för juridiska personer, inte för enskilda firmor.',
    message_no: 'Opplysninger hentes bare for juridiske personer, ikke for enkeltpersonforetak.',
    message_en: 'Details are fetched for legal persons only, not for sole traders.',
  },
  PEPPOL_TRANSPORT_UNAVAILABLE: {
    httpStatus: 503,
    message_sv: 'Peppol-utskick är inte aktiverat i den här miljön. En avtalad Peppol-operatör måste vara konfigurerad.',
    message_no: 'Peppol-utsending er ikke aktivert i dette miljøet. En avtalt Peppol-operatør må være konfigurert.',
    message_en: 'Peppol sending is not enabled in this environment. A contracted Peppol access point must be configured.',
  },
  PEPPOL_SEND_INVALID_STATUS: {
    httpStatus: 409,
    message_sv: 'Bara utkast och skickade fakturor kan skickas via Peppol. Makulerade, krediterade och proformafakturor kan inte skickas.',
    message_no: 'Bare utkast og sendte fakturaer kan sendes via Peppol. Makulerte, krediterte og proformafakturaer kan ikke sendes.',
    message_en: 'Only draft and sent invoices can be sent via Peppol. Cancelled, credited and proforma invoices cannot be sent.',
  },
  PEPPOL_RECIPIENT_NOT_REACHABLE: {
    httpStatus: 422,
    message_sv: 'Mottagaren är inte registrerad för att ta emot e-fakturor via Peppol. Kontrollera organisationsnumret eller skicka fakturan på annat sätt.',
    message_no: 'Mottakeren er ikke registrert for å ta imot e-fakturaer via Peppol. Kontroller organisasjonsnummeret eller send fakturaen på en annen måte.',
    message_en: 'The recipient is not registered to receive e-invoices via Peppol. Check the organisation number or deliver the invoice another way.',
  },
  PEPPOL_SUBMISSION_REJECTED: {
    httpStatus: 422,
    message_sv: 'Peppol-operatören avvisade fakturan vid valideringen. Fakturan har inte skickats.',
    message_no: 'Peppol-operatøren avviste fakturaen under valideringen. Fakturaen er ikke sendt.',
    message_en: 'The Peppol access point rejected the invoice during validation. The invoice has not been sent.',
  },
  PEPPOL_SUBMISSION_FAILED: {
    httpStatus: 502,
    message_sv: 'Peppol-operatören kunde inte nås just nu. Fakturan har inte skickats; försök igen om en stund.',
    message_no: 'Peppol-operatøren kunne ikke nås akkurat nå. Fakturaen er ikke sendt; prøv igjen om litt.',
    message_en: 'The Peppol access point could not be reached. The invoice has not been sent; try again shortly.',
  },
  // The SMP lookup itself failed (#2484), as opposed to a lookup that
  // answered "not registered": the staged delivery stays staged and nothing
  // terminal is recorded. The route answers 502 when the transport says the
  // failure is retryable, 422 otherwise.
  PEPPOL_LOOKUP_FAILED: {
    httpStatus: 502,
    message_sv: 'Kunde inte slå upp mottagaren i Peppol-nätverket. Försök igen om en stund.',
    message_no: 'Kunne ikke slå opp mottakeren i Peppol-nettverket. Prøv igjen om litt.',
    message_en: 'Could not look up the recipient in the Peppol network. Try again shortly.',
    retryable: true,
  },
  // The hosted service refused the submission for a reason about the sender,
  // the key or the service (not registered, quota, rate limit, scope,
  // upstream unconfigured), never about the document (#2484). The delivery
  // stays resendable; the route composes the hosted text onto the prefix
  // when the registry knows the code, else this generic pointer.
  PEPPOL_SEND_PRECONDITION_FAILED: {
    httpStatus: 409,
    message_sv: 'Fakturan kunde inte skickas via Peppol ännu: kontrollera Peppol-inställningarna och försök igen.',
    message_no: 'Fakturaen kunne ikke sendes via Peppol ennå: kontroller Peppol-innstillingene og prøv igjen.',
    message_en: 'The invoice could not be sent via Peppol yet: check the Peppol settings and try again.',
    thrown_message_sv: true,
  },
  // stage_peppol_delivery raises P0002 when no fiscal period covers the
  // invoice date: the delivery row carries a retention basis (BFL 7 kap.)
  // derived from the period, so it cannot be staged without one.
  PEPPOL_FISCAL_PERIOD_MISSING: {
    httpStatus: 422,
    message_sv: 'Fakturadatumet saknar ett räkenskapsår. Skapa räkenskapsåret innan fakturan skickas via Peppol.',
    message_no: 'Fakturadatoen mangler et regnskapsår. Opprett regnskapsåret før fakturaen sendes via Peppol.',
    message_en: 'The invoice date falls outside every fiscal year. Create the fiscal year before sending the invoice via Peppol.',
  },
  // /api/settings/peppol: publishing a company's identifier for receiving.
  PEPPOL_RECEIVING_UNSUPPORTED: {
    httpStatus: 503,
    message_sv: 'Den konfigurerade Peppol-operatören stöder inte mottagning av e-fakturor.',
    message_no: 'Den konfigurerte Peppol-operatøren støtter ikke mottak av e-fakturaer.',
    message_en: 'The configured Peppol access point does not support receiving e-invoices.',
  },
  PEPPOL_SANDBOX_NOT_ALLOWED: {
    httpStatus: 403,
    message_sv: 'Peppol-registrering är inte tillgänglig i demobolaget. Skapa ett riktigt konto för att ta emot e-fakturor.',
    message_no: 'Peppol-registrering er ikke tilgjengelig i demoselskapet. Opprett en ekte konto for å motta e-fakturaer.',
    message_en: 'Peppol registration is not available in the demo company. Create a real account to receive e-invoices.',
  },
  PEPPOL_REGISTRATION_ORG_NUMBER_REQUIRED: {
    httpStatus: 422,
    message_sv: 'Bolaget behöver ett giltigt organisationsnummer i företagsinställningarna innan det kan ta emot e-fakturor via Peppol.',
    message_no: 'Selskapet trenger et gyldig organisasjonsnummer i selskapsinnstillingene før det kan motta e-fakturaer via Peppol.',
    message_en: 'The company needs a valid organisation number in company settings before it can receive e-invoices via Peppol.',
  },
  PEPPOL_REGISTRATION_PERSONAL_NUMBER: {
    httpStatus: 422,
    message_sv: 'Enskild firma med personnummer kan ännu inte registreras för Peppol: det skulle publicera personuppgifter i Peppol-katalogen. Stöd för GLN-nummer kommer.',
    message_no: 'Enkeltpersonforetak med fødselsnummer kan ennå ikke registreres for Peppol: det vil publisere personopplysninger i Peppol-katalogen. Støtte for GLN-nummer kommer.',
    message_en: 'A sole trader identified by a personal identity number cannot be registered for Peppol yet: it would publish personal data in the Peppol directory. GLN support is coming.',
  },
  PEPPOL_REGISTRATION_COMPANY_NAME_REQUIRED: {
    httpStatus: 422,
    message_sv: 'Bolaget behöver ett företagsnamn i företagsinställningarna innan det kan registreras för Peppol.',
    message_no: 'Selskapet trenger et selskapsnavn i selskapsinnstillingene før det kan registreres for Peppol.',
    message_en: 'The company needs a company name in company settings before it can be registered for Peppol.',
  },
  PEPPOL_REGISTRATION_FAILED: {
    httpStatus: 502,
    message_sv: 'Peppol-operatören kunde inte genomföra registreringen. Försök igen om en stund.',
    message_no: 'Peppol-operatøren kunne ikke gjennomføre registreringen. Prøv igjen om en stund.',
    message_en: 'The Peppol access point could not complete the registration. Try again shortly.',
    retryable: true,
  },
  PEPPOL_REGISTRATION_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Bolaget är inte registrerat för Peppol-mottagning.',
    message_no: 'Selskapet er ikke registrert for Peppol-mottak.',
    message_en: 'The company is not registered for Peppol receiving.',
  },
  // Peppol access is granted per company by the operators (#546): locked by
  // default, requested from settings, enabled with a sending cap.
  PEPPOL_ACCESS_REQUIRED: {
    httpStatus: 403,
    message_sv: 'Peppol är inte aktiverat för det här bolaget. Begär åtkomst under Inställningar > Fakturering > E-faktura via Peppol, så aktiverar vi det.',
    message_no: 'Peppol er ikke aktivert for dette selskapet. Be om tilgang under Innstillinger > Fakturering > E-faktura via Peppol, så aktiverer vi det.',
    message_en: 'Peppol is not enabled for this company. Request access under Settings > Invoicing > E-invoicing via Peppol and we will enable it.',
  },
  PEPPOL_SEND_LIMIT_REACHED: {
    httpStatus: 409,
    message_sv: 'Bolaget har använt sina Peppol-sändningar. Hör av dig till support för fler.',
    message_no: 'Selskapet har brukt opp sine Peppol-sendinger. Ta kontakt med support for flere.',
    message_en: 'The company has used its Peppol sends. Contact support for more.',
  },
  PEPPOL_RECEIVING_NOT_ENABLED: {
    httpStatus: 403,
    message_sv: 'Mottagning via Peppol är inte aktiverad för det här bolaget. Hör av dig till support så öppnar vi en plats.',
    message_no: 'Mottak via Peppol er ikke aktivert for dette selskapet. Ta kontakt med support, så åpner vi en plass.',
    message_en: 'Receiving via Peppol is not enabled for this company. Contact support and we will open a slot.',
  },
  PEPPOL_ACCESS_ALREADY_ENABLED: {
    httpStatus: 409,
    message_sv: 'Peppol är redan aktiverat för bolaget.',
    message_no: 'Peppol er allerede aktivert for selskapet.',
    message_en: 'Peppol is already enabled for the company.',
  },
  PEPPOL_REGISTRATION_CAP_REACHED: {
    httpStatus: 409,
    message_sv: 'Alla platser för Peppol-mottagning är upptagna just nu. Hör av dig till support så öppnar vi fler. Att skicka e-fakturor fungerar ändå.',
    message_no: 'Alle plassene for Peppol-mottak er opptatt akkurat nå. Ta kontakt med support, så åpner vi flere. Å sende e-fakturaer fungerer likevel.',
    message_en: 'All Peppol receiving slots are taken right now. Contact support and we will open more. Sending e-invoices works regardless.',
  },
  // The access point gave a verdict on the identifier itself (#2483):
  // retrying the same registration cannot change it, unlike
  // PEPPOL_REGISTRATION_FAILED, which is the operational counterpart.
  PEPPOL_REGISTRATION_REJECTED: {
    httpStatus: 422,
    message_sv: 'Registreringen avvisades av Peppol-operatören. Kontakta support om felet kvarstår.',
    message_no: 'Registreringen ble avvist av Peppol-operatøren. Kontakt support hvis feilen vedvarer.',
    message_en: 'The Peppol access point rejected the registration. Contact support if the problem persists.',
  },
  // Hosted connector codes (packages/connect-contract) that a self-hosted
  // instance in connector mode stores as peppol_registrations.last_error_code
  // and shows translated. Permanent verdicts first, then transient ones.
  CONNECTOR_PEPPOL_PARTICIPANT_TAKEN: {
    httpStatus: 409,
    message_sv: 'Peppol-id:t är redan registrerat via ett annat konto. Kontakta support om det är ert bolag.',
    message_no: 'Peppol-id-en er allerede registrert via en annen konto. Kontakt support hvis det er deres selskap.',
    message_en: 'The Peppol id is already registered through another account. Contact support if it is your company.',
  },
  CONNECTOR_PEPPOL_PARTICIPANT_NOT_ALLOWED: {
    httpStatus: 422,
    message_sv: 'Peppol-id:t får inte registreras från det här kontot. Kontakta support.',
    message_no: 'Peppol-id-en kan ikke registreres fra denne kontoen. Kontakt support.',
    message_en: 'The Peppol id may not be registered from this account. Contact support.',
  },
  // The two likeliest send preconditions (#2484): the route composes these
  // behind PEPPOL_SEND_PRECONDITION_FAILED's prefix.
  CONNECTOR_PEPPOL_SENDER_NOT_REGISTERED: {
    httpStatus: 422,
    message_sv: 'Bolagets Peppol-id är inte registrerat hos operatören. Slå på mottagning under Inställningar > Fakturering > E-faktura via Peppol, eller kontakta support.',
    message_no: 'Selskapets Peppol-id er ikke registrert hos operatøren. Slå på mottak under Innstillinger > Fakturering > E-faktura via Peppol, eller kontakt support.',
    message_en: 'The company\'s Peppol id is not registered with the access point. Switch on receiving under Settings > Invoicing > E-invoicing via Peppol, or contact support.',
  },
  CONNECTOR_SCOPE_MISSING: {
    httpStatus: 403,
    message_sv: 'Kopplingsnyckeln saknar Peppol-behörighet. Kontakta support.',
    message_no: 'Koblingsnøkkelen mangler Peppol-tilgang. Kontakt support.',
    message_en: 'The connector key lacks Peppol permission. Contact support.',
  },
  CONNECTOR_PEPPOL_PARTICIPANT_PUBLISHED_ELSEWHERE: {
    httpStatus: 409,
    message_sv: 'Peppol-id:t är redan publicerat hos en annan operatör. Avregistrera det där först.',
    message_no: 'Peppol-id-en er allerede publisert hos en annen operatør. Avregistrer den der først.',
    message_en: 'The Peppol id is already published with another access point. Deregister it there first.',
  },
  CONNECTOR_QUOTA_EXCEEDED: {
    httpStatus: 409,
    message_sv: 'Kontots Peppol-platser är förbrukade. Hör av dig till support så öppnar vi fler.',
    message_no: 'Peppol-plassene til kontoen er brukt opp. Ta kontakt med support, så åpner vi flere.',
    message_en: 'The account has used its Peppol slots. Contact support and we will open more.',
  },
  CONNECTOR_PEPPOL_REGISTRATION_IN_PROGRESS: {
    httpStatus: 409,
    message_sv: 'En registrering av Peppol-id:t pågår redan. Försök igen om en stund.',
    message_no: 'Det pågår allerede en registrering av Peppol-id-en. Prøv igjen om litt.',
    message_en: 'A registration of the Peppol id is already in progress. Try again shortly.',
    retryable: true,
  },
  CONNECTOR_NOT_OWNED: {
    httpStatus: 404,
    message_sv: 'Peppol-id:t finns inte registrerat hos operatören för det här kontot.',
    message_no: 'Peppol-id-en er ikke registrert hos operatøren for denne kontoen.',
    message_en: 'The Peppol id is not registered with the access point for this account.',
  },
  CONNECTOR_UPSTREAM_ERROR: {
    httpStatus: 502,
    message_sv: 'Peppol-operatören svarade med ett fel. Försök igen om en stund.',
    message_no: 'Peppol-operatøren svarte med en feil. Prøv igjen om litt.',
    message_en: 'The Peppol access point answered with an error. Try again shortly.',
    retryable: true,
  },
  CONNECTOR_UNREACHABLE: {
    httpStatus: 502,
    message_sv: 'Tjänsten som förmedlar Peppol kunde inte nås. Försök igen om en stund.',
    message_no: 'Tjenesten som formidler Peppol kunne ikke nås. Prøv igjen om litt.',
    message_en: 'The service that brokers Peppol could not be reached. Try again shortly.',
    retryable: true,
  },
  CONNECTOR_RATE_LIMITED: {
    httpStatus: 429,
    message_sv: 'För många Peppol-anrop på kort tid. Vänta en stund och försök igen.',
    message_no: 'For mange Peppol-kall på kort tid. Vent litt og prøv igjen.',
    message_en: 'Too many Peppol calls in a short time. Wait a moment and try again.',
    retryable: true,
  },
  CONNECTOR_PROTOCOL_ERROR: {
    httpStatus: 502,
    message_sv: 'Svaret från Peppol-tjänsten kunde inte tolkas. Kontakta support om felet kvarstår.',
    message_no: 'Svaret fra Peppol-tjenesten kunne ikke tolkes. Kontakt support hvis feilen vedvarer.',
    message_en: 'The answer from the Peppol service could not be read. Contact support if the problem persists.',
  },
}

const SUPPLIER_INVOICE: Record<string, StructuredErrorEntry> = {
  SI_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Leverantörsfakturan kunde inte hittas.',
    message_no: 'Leverandørfakturaen ble ikke funnet.',
    message_en: 'Supplier invoice not found.',
  },
  SI_APPROVE_NOT_REGISTERED: {
    httpStatus: 400,
    message_sv: 'Fakturan är redan godkänd eller kan inte godkännas i nuvarande status.',
    message_no: 'Fakturaen er allerede godkjent eller kan ikke godkjennes i gjeldende status.',
    message_en: 'The invoice is already approved, or cannot be approved in its current status.',
  },
  SI_EDIT_CONFLICT: {
    httpStatus: 409,
    message_sv:
      'Leverantörsfakturan ändrades av någon annan (eller av den dagliga förfallokontrollen) medan du redigerade. Ladda om fakturan och försök igen.',
    message_no: 'Leverandørfakturaen ble endret av noen andre (eller av den daglige forfallskontrollen) mens du redigerte. Last inn fakturaen på nytt og prøv igjen.',
    message_en:
      'The supplier invoice changed elsewhere (or in the daily overdue check) while you were editing. Reload the invoice and try again.',
  },
  SI_EDIT_INVALID_STATUS: {
    httpStatus: 400,
    message_sv:
      'Bara obetalda leverantörsfakturor kan redigeras. Betalda, krediterade och återförda fakturor rättas genom kreditfaktura eller storno.',
    message_no: 'Bare ubetalte leverandørfakturaer kan redigeres. Betalte, krediterte og tilbakeførte fakturaer korrigeres med kreditnota eller storno.',
    message_en:
      'Only unsettled supplier invoices can be edited. Paid, credited and reversed invoices are corrected with a credit note or a storno.',
  },
  SI_EDIT_VERIFIKAT_LOCKED: {
    httpStatus: 400,
    message_sv:
      'Fakturadatum och fakturanummer står på det bokförda verifikatet och kan inte ändras här. ',
    message_no:
      'Fakturadato og fakturanummer står på det bokførte bilaget og kan ikke endres her. ' +
      'Rett bilaget (rettelse i åpen periode, ellers storno + ny bokføring) eller krediter fakturaen. ' +
      'Forfallsdato, betalingsreferanse og notater kan fortsatt endres.',
    message_en:
      'Invoice date and invoice number are part of the posted verifikat and cannot be changed here. ' +
      'Correct the entry instead (inline rättelse in an open period, otherwise storno + re-book), or credit the invoice. ' +
      'due_date, payment_reference and notes remain editable.',
    remediation: {
      description:
        'Correct the registration verifikat through a sanctioned rättelse path, or credit the supplier invoice and register a corrected one.',
      tool: 'gnubok_correct_entry',
    },
  },
  SI_APPROVE_UPDATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte godkänna leverantörsfakturan.',
    message_no: 'Kunne ikke godkjenne leverandørfakturaen.',
    message_en: 'Failed to update supplier invoice status to approved.',
  },
  SI_BOOK_ALREADY_BOOKED: {
    httpStatus: 400,
    message_sv: 'Leverantörsfakturan är redan bokförd.',
    message_no: 'Leverandørfakturaen er allerede bokført.',
    message_en: 'The supplier invoice is already booked.',
  },
  SI_BOOK_INVALID_STATUS: {
    httpStatus: 400,
    message_sv: 'Endast registrerade, godkända eller förfallna fakturor kan bokföras i efterhand.',
    message_no: 'Bare registrerte, godkjente eller forfalte fakturaer kan bokføres i etterkant.',
    message_en: 'Only registered, approved or overdue invoices can be booked afterwards.',
  },
  SI_BOOK_NOT_BOOKABLE: {
    httpStatus: 400,
    message_sv: 'Kreditfakturor bokförs inte via detta steg.',
    message_no: 'Kreditnotaer bokføres ikke via dette trinnet.',
    message_en: 'Credit notes are not booked through this step.',
  },
  SI_BOOK_CASH_METHOD: {
    httpStatus: 400,
    message_sv: 'Vid kontantmetoden bokförs fakturan när den betalas.',
    message_no: 'Ved kontantmetoden bokføres fakturaen når den betales.',
    message_en: 'Under the cash method the invoice is booked when it is paid.',
  },
  SI_BOOK_NO_FISCAL_PERIOD: {
    httpStatus: 400,
    message_sv: 'Inget öppet räkenskapsår täcker fakturadatumet. Skapa räkenskapsåret först.',
    message_no: 'Inget åpent regnskapsår dekker fakturadatoen. Opprett regnskapsåret først.',
    message_en: 'No open fiscal period covers the invoice date. Create the fiscal year first.',
  },
  SI_BOOK_CONFLICT: {
    httpStatus: 409,
    message_sv: 'Leverantörsfakturan bokfördes samtidigt av en annan begäran. Ladda om sidan.',
    message_no: 'Leverandørfakturaen ble bokført samtidig av en annen forespørsel. Last inn siden på nytt.',
    message_en: 'The supplier invoice was booked concurrently by another request. Reload the page.',
  },
  SI_BOOK_FAILED: {
    httpStatus: 500,
    message_sv: 'Leverantörsfakturan kunde inte bokföras.',
    message_no: 'Leverandørfakturaen kunne ikke bokføres.',
    message_en: 'Failed to book the supplier invoice.',
  },
  // Raised by lib/bookkeeping/supplier-invoice-entries.ts when a
  // foreign-currency invoice reaches a booking path with no exchange rate.
  // Booking it 1:1 would balance but understate the fiktiv moms on 2614/2645
  // and therefore rutorna 20-24 + 30-32 of the momsdeklaration.
  SI_FX_RATE_MISSING: {
    httpStatus: 400,
    message_sv:
      'Leverantörsfakturan är i utländsk valuta men saknar växelkurs. Ange fakturans växelkurs innan den bokförs: utan kurs kan beloppen inte räknas om till kronor och momsen blir fel.',
    message_no: 'Leverandørfakturaen er i utenlandsk valuta, men mangler valutakurs. Angi fakturaens valutakurs før den bokføres: uten kurs kan beløpene ikke regnes om til kroner, og mvaen blir feil.',
    message_en:
      'The supplier invoice is in a foreign currency but has no exchange rate on file. Set the invoice exchange rate before booking; without it the amounts cannot be translated to SEK and the reverse-charge VAT would be understated.',
    remediation: {
      description:
        'Set exchange_rate on the supplier invoice (the rate at the invoice date) and retry the booking.',
    },
  },
  PO_THREE_WAY_MATCH_FAILED: {
    httpStatus: 422,
    message_sv:
      'Trevägs-matchning misslyckades: leverantörsfakturan stämmer inte med inköpsordern eller godsmottagningen.',
    message_no: 'Treveismatchingen mislyktes: leverandørfakturaen stemmer ikke med innkjøpsordren eller varemottaket.',
    message_en:
      'Three-way match failed: the supplier invoice does not reconcile with the purchase order / goods receipt.',
  },
  PO_LINK_REQUIRED: {
    httpStatus: 422,
    message_sv:
      'Inställningarna kräver att varje leverantörsfaktura kopplas till en inköpsorder.',
    message_no: 'Innstillingene krever at hver leverandørfaktura kobles til en innkjøpsordre.',
    message_en:
      'Company settings require every supplier invoice to be linked to a purchase order.',
  },
  PO_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Inköpsordern kunde inte hittas.',
    message_no: 'Innkjøpsordren kunne ikke finnes.',
    message_en: 'Purchase order not found.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Wave 2: periods, year-end, reports
// ─────────────────────────────────────────────────────────────────

const PERIOD: Record<string, StructuredErrorEntry> = {
  PERIOD_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Räkenskapsperioden kunde inte hittas.',
    message_no: 'Regnskapsperioden kunne ikke finnes.',
    message_en: 'Fiscal period not found.',
  },
  PERIOD_LOCK_FAILED: {
    httpStatus: 400,
    message_sv: 'Perioden kunde inte låsas.',
    message_no: 'Perioden kunne ikke låses.',
    message_en: 'Failed to lock period.',
  },
  PERIOD_LOCK_HAS_DRAFTS: {
    httpStatus: 400,
    message_sv: 'Perioden innehåller verifikationsutkast som måste bokföras eller raderas innan låsning.',
    message_no: 'Perioden inneholder bilagsutkast som må bokføres eller slettes før låsing.',
    message_en: 'Period contains draft journal entries.',
  },
  PERIOD_LOCK_ALREADY_LOCKED: {
    httpStatus: 409,
    message_sv: 'Perioden är redan låst.',
    message_no: 'Perioden er allerede låst.',
    message_en: 'Period is already locked.',
    retryable: false,
    remediation: {
      description:
        'A lock only freezes the period. If the intent is bokslut, do not lock first: gnubok_run_year_end posts the closing entry into the period and then locks and closes it itself, so it needs an unlocked period (gnubok_unlock_period reopens a locked, not closed, one). If the period should simply stay frozen, nothing more is needed.',
      tool: 'gnubok_unlock_period',
    },
  },
  PERIOD_ALREADY_CLOSED: {
    httpStatus: 409,
    message_sv: 'Perioden är redan stängd: bokslutet är genomfört och perioden kan inte öppnas igen.',
    message_no: 'Perioden er allerede stengt: regnskapsavslutningen er gjennomført, og perioden kan ikke åpnes igjen.',
    message_en: 'Period is already closed: year-end has been run and the period is sealed.',
    retryable: false,
    remediation: {
      description:
        'Nothing more to do on this period. gnubok_run_year_end locks, closes and seeds the next period\'s opening balances in one step, so gnubok_close_period, gnubok_lock_period and gnubok_set_opening_balances are not follow-up calls. Confirm the state with gnubok_list_fiscal_periods and continue in the next period.',
      tool: 'gnubok_list_fiscal_periods',
    },
  },
  PERIOD_UNLOCK_NOT_LOCKED: {
    httpStatus: 409,
    message_sv: 'Perioden är inte låst.',
    message_no: 'Perioden er ikke låst.',
    message_en: 'Period is not locked.',
  },
  PERIOD_UNLOCK_CLOSED: {
    httpStatus: 409,
    message_sv: 'Ett stängt räkenskapsår kan inte låsas upp. Klarmarkerades året som avslutat i ett tidigare program kan du i stället öppna det igen under Räkenskapsår.',
    message_no: 'Et stengt regnskapsår kan ikke låses opp. Hvis året ble markert som avsluttet i et tidligere program, kan du i stedet åpne det igjen under Regnskapsår.',
    message_en: 'A closed fiscal year cannot be unlocked. If the year was marked as closed in a previous system, reopen it from Fiscal years instead.',
  },
  PERIOD_REOPEN_NOT_CLOSED: {
    httpStatus: 409,
    message_sv: 'Räkenskapsåret är inte stängt.',
    message_no: 'Regnskapsåret er ikke stengt.',
    message_en: 'Fiscal year is not closed.',
  },
  PERIOD_REOPEN_NOT_EXTERNAL: {
    httpStatus: 409,
    message_sv: 'Räkenskapsåret stängdes med ett bokslut i Accounted och kan inte öppnas igen här.',
    message_no: 'Regnskapsåret ble stengt med en regnskapsavslutning i Accounted og kan ikke åpnes igjen her.',
    message_en: 'The fiscal year was closed with a year-end run in Accounted and cannot be reopened here.',
  },
  FISCAL_YEAR_RESET_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Räkenskapsåret kunde inte hittas.',
    message_no: 'Regnskapsåret kunne ikke finnes.',
    message_en: 'Fiscal year not found.',
  },
  FISCAL_YEAR_RESET_FORBIDDEN: {
    httpStatus: 403,
    message_sv: 'Endast företagets ägare eller administratörer kan nollställa ett räkenskapsår.',
    message_no: 'Bare bedriftens eier eller administratorer kan nullstille et regnskapsår.',
    message_en: 'Only company owners and admins can reset a fiscal year.',
  },
  FISCAL_YEAR_RESET_INELIGIBLE: {
    httpStatus: 409,
    message_sv: 'Räkenskapsåret kan inte nollställas i sitt nuvarande läge.',
    message_no: 'Regnskapsåret kan ikke nullstilles i sin nåværende tilstand.',
    message_en: 'The fiscal year cannot be reset in its current state.',
  },
  FISCAL_YEAR_RESET_CONFIRMATION_MISMATCH: {
    httpStatus: 400,
    message_sv: 'Räkenskapsårets namn stämmer inte överens.',
    message_no: 'Navnet på regnskapsåret stemmer ikke overens.',
    message_en: 'The fiscal year name does not match.',
  },
  FISCAL_YEAR_RESET_LINKED_ENTRIES: {
    httpStatus: 409,
    message_sv:
      'Räkenskapsåret innehåller verifikat som är kopplade till andra poster (t.ex. anläggningstillgångar, periodiseringar eller lönekörningar). Ta bort eller ångra de kopplade flödena först. Inga ändringar har sparats.',
    message_no: 'Regnskapsåret inneholder bilag som er koblet til andre poster (f.eks. anleggsmidler, periodiseringer eller lønnskjøringer). Fjern eller angre de koblede flytene først. Ingen endringer er lagret.',
    message_en:
      'The fiscal year contains vouchers linked to other records (e.g. assets, accrual schedules or salary runs). Undo those flows first. No changes were saved.',
  },
  FISCAL_YEAR_RESET_FAILED: {
    httpStatus: 500,
    message_sv: 'Räkenskapsåret kunde inte nollställas. Inga ändringar har sparats.',
    message_no: 'Regnskapsåret kunne ikke nullstilles. Ingen endringer er lagret.',
    message_en: 'Failed to reset the fiscal year. No changes were saved.',
  },
  // Retired 2026-07-26: PERIOD_CREATE_BLOCKED_BY_OPEN_PERIODS. Creating the
  // next räkenskapsår while a prior one is still fully open is no longer an
  // error at all: BFL 5 kap 2 § forces the new year's affärshändelser to be
  // booked within weeks (which needs a räkenskapsår covering them) while BFL
  // 6 kap gives the prior year six months to be finished, so running both in
  // parallel is the mandated state, not an edge case. The detection now rides
  // along as a non-blocking `warnings: [{ code: 'PRIOR_FISCAL_YEAR_STILL_OPEN',
  // message }]` on the 200 (app/api/bookkeeping/fiscal-periods), which needs no
  // registry entry: warnings are not thrown errors. Do not re-add this code.
}

const YEAR_END: Record<string, StructuredErrorEntry> = {
  YEAR_END_PREVIEW_FAILED: {
    httpStatus: 400,
    message_sv: 'Bokslutsförhandsgranskningen misslyckades.',
    message_no: 'Forhåndsvisningen av regnskapsavslutningen mislyktes.',
    message_en: 'Failed to preview year-end closing.',
  },
  YEAR_END_FAILED: {
    httpStatus: 400,
    message_sv: 'Bokslutet kunde inte verkställas.',
    message_no: 'Årsavslutningen kunne ikke gjennomføres.',
    message_en: 'Failed to execute year-end closing.',
  },
  YEAR_END_PRIOR_PERIOD_OPEN: {
    httpStatus: 400,
    message_sv: 'En tidigare period är fortfarande öppen. Stäng den först.',
    message_no: 'En tidligere periode er fortsatt åpen. Steng den først.',
    message_en: 'A prior fiscal period is still open.',
  },
  YEAR_END_UNBALANCED_TRIAL: {
    httpStatus: 400,
    message_sv: 'Resultaträkningens debet och kredit balanserar inte. Granska verifikationerna innan bokslut.',
    message_no: 'Debet og kredit i resultatregnskapet balanserer ikke. Gå gjennom bilagene før årsavslutningen.',
    message_en: 'Trial balance does not balance.',
  },
  YEAR_END_NEXT_PERIOD_HAS_IB: {
    httpStatus: 400,
    message_sv: 'Nästa räkenskapsperiod har redan ingående balanser bokförda. Storno dem innan du kör om bokslutet.',
    message_no: 'Neste regnskapsperiode har allerede inngående balanser bokført. Tilbakefør dem før du kjører årsavslutningen på nytt.',
    message_en: 'Next fiscal period already has opening balances posted; reverse them before re-running year-end.',
  },
  YEAR_END_NO_ACTIVITY: {
    httpStatus: 409,
    message_sv:
      'Räkenskapsperioden saknar bokförd aktivitet och kan därför inte skapa en bokslutsverifikation. Bokför eller importera periodens affärshändelser innan du kör bokslutet.',
    message_no: 'Regnskapsperioden mangler bokført aktivitet og kan derfor ikke opprette et avslutningsbilag. Bokfør eller importer periodens forretningstransaksjoner før du kjører årsavslutningen.',
    message_en:
      'The fiscal period has no posted activity, so no year-end voucher can be created. Post or import the period activity before running year-end closing.',
    retryable: false,
  },
}

const FX: Record<string, StructuredErrorEntry> = {
  FX_CLOSING_RATE_UNAVAILABLE: {
    httpStatus: 502,
    message_sv:
      'Ingen valutakurs från Riksbanken finns för balansdagen. Valutaomvärderingen har inte bokförts: en uppskattad kurs får inte bokföras mot 3960/7960 (ÅRL 4 kap. 13 §). Försök igen när kursen är publicerad.',
    message_no: 'Det finnes ingen valutakurs fra Riksbanken for balansedagen. Valutaomvurderingen er ikke bokført: en estimert kurs kan ikke bokføres mot 3960/7960 (ÅRL 4 kap. 13 §). Prøv igjen når kursen er publisert.',
    message_en:
      'No Riksbanken observation is available for the closing date. The revaluation was refused rather than posted from an estimated rate; details.missingRates lists each currency and date.',
    retryable: true,
    remediation: {
      description:
        'Retry once Riksbanken has published the closing-date rate, or run the revaluation for a closing date that has a published observation.',
    },
  },
}

const REPORT: Record<string, StructuredErrorEntry> = {
  REPORT_PERIOD_REQUIRED: {
    httpStatus: 400,
    message_sv: 'period_id krävs.',
    message_no: 'period_id er påkrevd.',
    message_en: 'period_id query parameter is required.',
  },
  REPORT_GENERATION_FAILED: {
    httpStatus: 500,
    message_sv: 'Rapporten kunde inte genereras.',
    message_no: 'Rapporten kunne ikke genereres.',
    message_en: 'Failed to generate the report.',
  },
  REPORT_PDF_TOO_LARGE: {
    httpStatus: 413,
    message_sv: 'Rapporten är för stor för PDF. Ladda ner den som CSV eller Excel i stället.',
    message_no: 'Rapporten er for stor for PDF. Last den ned som CSV eller Excel i stedet.',
    message_en: 'The report is too large for PDF. Download it as CSV or Excel instead.',
  },
}

const VAT_REPORT: Record<string, StructuredErrorEntry> = {
  VAT_REPORT_MISSING_PARAMS: {
    httpStatus: 400,
    message_sv: 'periodType, year och period krävs.',
    message_no: 'periodType, year og period er påkrevd.',
    message_en: 'periodType, year and period query parameters are required.',
  },
  VAT_REPORT_INVALID_PERIOD_TYPE: {
    httpStatus: 400,
    message_sv: 'periodType måste vara monthly, quarterly eller yearly.',
    message_no: 'periodType må være monthly, quarterly eller yearly.',
    message_en: 'periodType must be one of monthly, quarterly, yearly.',
  },
  VAT_REPORT_INVALID_YEAR: {
    httpStatus: 400,
    message_sv: 'year måste vara ett giltigt årtal mellan 2000 och 2100.',
    message_no: 'year må være et gyldig årstall mellom 2000 og 2100.',
    message_en: 'year must be a number between 2000 and 2100.',
  },
  VAT_REPORT_INVALID_PERIOD: {
    httpStatus: 400,
    message_sv: 'period är ogiltig för vald periodtyp.',
    message_no: 'period er ugyldig for valgt periodetype.',
    message_en: 'period is invalid for the chosen period type.',
  },
  VAT_REPORT_GENERATION_FAILED: {
    httpStatus: 500,
    message_sv: 'Momsdeklarationen kunde inte beräknas.',
    message_no: 'Mva-meldingen kunne ikke beregnes.',
    message_en: 'Failed to calculate VAT declaration.',
  },
}

const PS_REPORT: Record<string, StructuredErrorEntry> = {
  PS_REPORT_MISSING_PARAMS: {
    httpStatus: 400,
    message_sv: 'periodType, year och period krävs.',
    message_no: 'periodType, year og period er påkrevd.',
    message_en: 'periodType, year and period query parameters are required.',
  },
  PS_REPORT_INVALID_PERIOD_TYPE: {
    httpStatus: 400,
    message_sv: 'periodType måste vara monthly eller quarterly.',
    message_no: 'periodType må være monthly eller quarterly.',
    message_en: 'periodType must be monthly or quarterly.',
  },
  PS_REPORT_INVALID_YEAR: {
    httpStatus: 400,
    message_sv: 'year måste vara ett giltigt årtal mellan 2000 och 2100.',
    message_no: 'year må være et gyldig årstall mellom 2000 og 2100.',
    message_en: 'year must be a number between 2000 and 2100.',
  },
  PS_REPORT_INVALID_PERIOD: {
    httpStatus: 400,
    message_sv: 'period är ogiltig för vald periodtyp.',
    message_no: 'period er ugyldig for valgt periodetype.',
    message_en: 'period is invalid for the chosen period type.',
  },
  PS_REPORT_GENERATION_FAILED: {
    httpStatus: 500,
    message_sv: 'Periodisk sammanställning kunde inte beräknas.',
    message_no: 'Periodisk sammanställning kunne ikke beregnes.',
    message_en: 'Failed to generate periodisk sammanställning.',
  },
  PS_REPORT_CSV_BLOCKED_BY_ERRORS: {
    httpStatus: 400,
    message_sv: 'CSV kan inte laddas ner. Åtgärda blockerande fel först.',
    message_no: 'CSV kan ikke lastes ned. Utbedre blokkerende feil først.',
    message_en: 'CSV download blocked by validation errors. Fix them first.',
  },
  PS_REPORT_MISSING_FILER_INFO: {
    httpStatus: 400,
    message_sv: 'Kontaktuppgifter saknas. Fyll i namn, telefon och e-post under Inställningar.',
    message_no: 'Kontaktopplysninger mangler. Fyll inn navn, telefon og e-post under Innstillinger.',
    message_en: 'Tax contact information is missing on company_settings.',
  },
}

const SIE_EXPORT: Record<string, StructuredErrorEntry> = {
  SIE_EXPORT_COMPANY_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Företagsinställningar saknas: SIE-exporten kan inte skapas.',
    message_no: 'Foretaksinnstillinger mangler: SIE-eksporten kan ikke opprettes.',
    message_en: 'Company settings missing; SIE export cannot be generated.',
  },
  SIE_EXPORT_FAILED: {
    httpStatus: 500,
    message_sv: 'SIE-exporten misslyckades.',
    message_no: 'SIE-eksporten mislyktes.',
    message_en: 'Failed to generate SIE export.',
  },
}

const TAX_DECL: Record<string, StructuredErrorEntry> = {
  TAX_DECL_GENERATION_FAILED: {
    httpStatus: 500,
    message_sv: 'Skattedeklarationen kunde inte genereras.',
    message_no: 'Skatteoppgaven kunne ikke genereres.',
    message_en: 'Failed to generate tax declaration.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Wave 3: imports (SIE, bank-file, opening-balance)
// ─────────────────────────────────────────────────────────────────

const SIE_IMPORT: Record<string, StructuredErrorEntry> = {
  SIE_IMPORT_LEGACY_REVIEW_REQUIRED: {
    httpStatus: 409,
    message_sv: 'Importhistoriken bevaras. Den här äldre SIE-importens utfall behöver granskas innan den kan ångras eller ersättas. Öppna importhistoriken och välj Granska.',
    message_no: 'Importhistorikken bevares. Resultatet av denne eldre SIE-importen må gjennomgås før den kan angres eller erstattes. Åpne importhistorikken og velg Gjennomgå.',
    message_en: 'Import history is retained. This legacy SIE import needs an outcome review before it can be undone or replaced. Open import history and choose Review.',
    retryable: false,
    remediation: {
      description: 'Read gnubok_sie_import_status with the same import_id for the assessment. In the app, open SIE import history and choose Review. No recovery mutation is available for this legacy import yet.',
      tool: 'gnubok_sie_import_status',
      resource: '/import?mode=sie',
    },
  },
  SIE_IMPORT_HISTORY_RETAINED: {
    httpStatus: 403,
    message_sv: 'Importhistoriken bevaras. Öppna importen för att granska dess status och tillgängliga åtgärder.',
    message_no: 'Importhistorikken bevares. Åpne importen for å gjennomgå statusen og tilgjengelige handlinger.',
    message_en: 'Import history is retained. Open the import to review its status and available actions.',
    retryable: false,
    remediation: { description: 'Read the import status with the same import_id.', tool: 'gnubok_sie_import_status', resource: '/import?mode=sie' },
  },
  SIE_IMPORT_UNSUPPORTED_ACCOUNT_CLASS: {
    httpStatus: 400,
    message_sv: 'Konton med belopp måste mappas till konton 1000-8999 före import. Målkonton i klass 0 och 9 stöds inte i balans- och resultatrapporterna. Oanvända kontodefinitioner kan behållas.',
    message_no: 'Kontoer med beløp må mappes til kontoer 1000-8999 før import. Målkontoer i klasse 0 og 9 støttes ikke i balanse- og resultatrapportene. Ubrukte kontodefinisjoner kan beholdes.',
    message_en: 'Map accounts carrying amounts to accounts 1000-8999 before importing. Target classes 0 and 9 are not supported by the balance sheet and income statement. Unused account definitions may be retained.',
    retryable: false,
  },
  SIE_PARSE_NO_FILE: {
    httpStatus: 400,
    message_sv: 'Ingen fil bifogad i förfrågan.',
    message_no: 'Ingen fil er vedlagt i forespørselen.',
    message_en: 'No file attached to the request.',
  },
  SIE_PARSE_INVALID_TYPE: {
    httpStatus: 400,
    message_sv: 'Filtypen stöds inte. Ladda upp en fil med ändelsen .se, .sie eller .si.',
    message_no: 'Filtypen støttes ikke. Last opp en fil med endelsen .se, .sie eller .si.',
    message_en: 'Unsupported file type; upload a .se, .sie or .si file.',
  },
  SIE_PARSE_FILE_TOO_LARGE: {
    httpStatus: 400,
    message_sv: 'Filen är för stor. Maxstorlek är 50 MB.',
    message_no: 'Filen er for stor. Maksimal størrelse er 50 MB.',
    message_en: 'File exceeds the 50 MB size limit.',
  },
  SIE_PARSE_EMPTY: {
    httpStatus: 400,
    message_sv: 'Filen är tom (0 bytes). Kontrollera exporten från bokföringsprogrammet.',
    message_no: 'Filen er tom (0 bytes). Kontroller eksporten fra regnskapsprogrammet.',
    message_en: 'File is empty.',
  },
  SIE_PARSE_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte tolka SIE-filen. Filen kan vara skadad eller i ett format som inte stöds.',
    message_no: 'Kunne ikke tolke SIE-filen. Filen kan være skadet eller i et format som ikke støttes.',
    message_en: 'Failed to parse the SIE file.',
  },
  SIE_PARSE_VALIDATION_FAILED: {
    httpStatus: 400,
    message_sv: 'SIE-filen innehåller valideringsfel som måste åtgärdas innan import.',
    message_no: 'SIE-filen inneholder valideringsfeil som må rettes før import.',
    message_en: 'SIE file failed validation.',
  },
  SIE_DUPLICATE_FILE: {
    httpStatus: 409,
    message_sv: 'Den här filen har redan importerats.',
    message_no: 'Denne filen er allerede importert.',
    message_en: 'File has already been imported.',
  },
  SIE_DUPLICATE_PERIOD: {
    httpStatus: 409,
    message_sv: 'En SIE-import för ett överlappande räkenskapsår finns redan.',
    message_no: 'Det finnes allerede en SIE-import for et overlappende regnskapsår.',
    message_en: 'An SIE import for an overlapping fiscal period already exists.',
  },
  SIE_IMPORT_UNMAPPED_ACCOUNTS: {
    httpStatus: 400,
    message_sv: 'Vissa konton saknar mappning. Gå tillbaka till kontomappningssteget och koppla alla konton.',
    message_no: 'Enkelte kontoer mangler mapping. Gå tilbake til kontomappingstrinnet og koble alle kontoer.',
    message_en: 'One or more accounts have no mapping target.',
    remediation: { description: 'Map every source account to a BAS account before importing.' },
  },
  SIE_IMPORT_ACCOUNT_ACTIVATION_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte aktivera konton i kontoplanen. Kontrollera att kontona inte redan finns med andra inställningar.',
    message_no: 'Kunne ikke aktivere kontoer i kontoplanen. Kontroller at kontoene ikke allerede finnes med andre innstillinger.',
    message_en: 'Failed to activate mapped accounts in the chart of accounts.',
  },
  SIE_IMPORT_FAILED: {
    httpStatus: 400,
    message_sv: 'Importen slutfördes med fel. Se detaljerna nedan.',
    message_no: 'Importen ble fullført med feil. Se detaljene nedenfor.',
    message_en: 'SIE import completed with errors.',
  },
  SIE_IMPORT_UNEXPECTED: {
    httpStatus: 500,
    message_sv: 'Importens resultat kunde inte bekräftas. Kontrollera importhistoriken innan du försöker igen.',
    message_no: 'Resultatet av importen kunne ikke bekreftes. Kontroller importhistorikken før du prøver igjen.',
    message_en: 'The import outcome could not be confirmed. Check import history before retrying.',
  },
  SIE_REPLACE_FAILED: {
    httpStatus: 400,
    message_sv: 'SIE-importen kunde inte ersättas.',
    message_no: 'SIE-importen kunne ikke erstattes.',
    message_en: 'Failed to replace SIE import.',
  },
  SIE_REPLACE_FORBIDDEN: {
    httpStatus: 403,
    message_sv: 'Endast ägare eller administratörer kan ersätta en SIE-import.',
    message_no: 'Bare eier eller administratorer kan erstatte en SIE-import.',
    message_en: 'Only company owners and admins can replace an SIE import.',
  },
  SIE_UNDO_FAILED: {
    httpStatus: 400,
    message_sv: 'SIE-importen kunde inte ångras.',
    message_no: 'SIE-importen kunne ikke angres.',
    message_en: 'Failed to undo SIE import.',
  },
}

const BANK_FILE: Record<string, StructuredErrorEntry> = {
  BANK_FILE_NO_FILE: {
    httpStatus: 400,
    message_sv: 'Ingen fil bifogad i förfrågan.',
    message_no: 'Ingen fil er vedlagt i forespørselen.',
    message_en: 'No file attached to the request.',
  },
  BANK_FILE_TOO_LARGE: {
    httpStatus: 400,
    message_sv: 'Filen är för stor. Maxstorlek är 10 MB.',
    message_no: 'Filen er for stor. Maksimal størrelse er 10 MB.',
    message_en: 'File exceeds the 10 MB size limit.',
  },
  BANK_FILE_DUPLICATE: {
    httpStatus: 409,
    message_sv: 'Den här filen har redan importerats.',
    message_no: 'Denne filen er allerede importert.',
    message_en: 'Bank file has already been imported.',
  },
  BANK_FILE_PARSE_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte tolka bankfilen.',
    message_no: 'Kunne ikke tolke bankfilen.',
    message_en: 'Failed to parse the bank file.',
  },
  BANK_FILE_NO_TRANSACTIONS: {
    httpStatus: 400,
    message_sv: 'Bankfilen innehåller inga transaktioner att importera.',
    message_no: 'Bankfilen inneholder ingen transaksjoner å importere.',
    message_en: 'No transactions to import.',
  },
  BANK_FILE_IMPORT_RECORD_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte skapa importpost.',
    message_no: 'Kunne ikke opprette importpost.',
    message_en: 'Failed to create the bank file import record.',
  },
  BANK_FILE_EXECUTE_FAILED: {
    httpStatus: 500,
    message_sv: 'Bankfilsimporten misslyckades.',
    message_no: 'Importen av bankfilen mislyktes.',
    message_en: 'Bank file import failed.',
  },
  BANK_FILE_SKATTEKONTO_DETECTED: {
    httpStatus: 400,
    message_sv:
      'Filen ser ut som ett skattekontoutdrag från Skatteverket. Använd Skattekonto-importen i stället.',
    message_no: 'Filen ser ut som et skattekontoutskrift fra Skatteetaten. Bruk Skattekonto-importen i stedet.',
    message_en:
      'This file looks like a Skatteverket tax account statement. Use the skattekonto import instead.',
  },
  BANK_FILE_UNDO_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Bankfilsimporten kunde inte hittas.',
    message_no: 'Importen av bankfilen kunne ikke finnes.',
    message_en: 'Bank file import not found.',
  },
  BANK_FILE_UNDO_FAILED: {
    httpStatus: 400,
    message_sv: 'Bankfilsimporten kunde inte ångras.',
    message_no: 'Importen av bankfilen kunne ikke angres.',
    message_en: 'Failed to undo bank file import.',
  },
  BANK_FILE_UNDO_FORBIDDEN: {
    httpStatus: 403,
    message_sv: 'Endast ägare eller administratörer kan ångra en bankfilsimport.',
    message_no: 'Bare eier eller administratorer kan angre en import av bankfil.',
    message_en: 'Only company owners and admins can undo a bank file import.',
  },
  BANK_FILE_LIST_INVALID_QUERY: {
    httpStatus: 400,
    message_sv: 'Ogiltiga listparametrar: limit måste vara 1-100, offset ett icke-negativt heltal och status ett giltigt importstatus.',
    message_no: 'Ugyldige listeparametere: limit må være 1-100, offset et ikke-negativt heltall og status en gyldig importstatus.',
    message_en: 'Invalid list parameters: limit must be 1-100, offset a nonnegative integer, and status a valid import status.',
  },
}

/**
 * Agent-triggered PSD2 sync (v1 bank-connections sync + MCP gnubok_sync_bank).
 * Emitted by extensions/general/enable-banking/lib/trigger-sync.ts.
 */
const BANK_SYNC: Record<string, StructuredErrorEntry> = {
  BANK_SYNC_NOT_ACTIVE: {
    httpStatus: 409,
    message_sv: 'Bankanslutningen är inte aktiv och kan inte synkas. Förnya den med BankID i webbläsaren.',
    message_no: 'Bankforbindelsen er ikke aktiv og kan ikke synkroniseres. Forny den med BankID i nettleseren.',
    message_en: 'The bank connection is not active and cannot be synced. It needs BankID re-authorisation in a browser.',
    remediation: {
      description: 'Give the user the connect_url from gnubok_connect_bank (or GET /bank-connections); only they can re-authorise with BankID.',
      tool: 'gnubok_connect_bank',
    },
  },
  BANK_SYNC_NO_ACCOUNTS: {
    httpStatus: 409,
    message_sv: 'Inga konton är valda för synkning. Aktivera minst ett konto under Inställningar, Bank.',
    message_no: 'Ingen kontoer er valgt for synkronisering. Aktiver minst ett konto under Innstillinger, Bank.',
    message_en: 'No accounts are selected for syncing. The user must enable at least one under Settings, Bank.',
  },
  BANK_SYNC_COOLDOWN: {
    httpStatus: 429,
    message_sv: 'Anslutningen synkades nyligen. Vänta tills next_allowed_at innan du synkar igen.',
    message_no: 'Forbindelsen ble synkronisert nylig. Vent til next_allowed_at før du synkroniserer igjen.',
    message_en: 'This connection was synced recently. Wait until next_allowed_at before syncing again; the data you have is already fresh.',
    retryable: true,
  },
  BANK_SESSION_EXPIRED: {
    httpStatus: 409,
    message_sv: 'Bankanslutningen har löpt ut. Förnya anslutningen med BankID för att fortsätta synka.',
    message_no: 'Bankforbindelsen har utløpt. Forny forbindelsen med BankID for å fortsette å synkronisere.',
    message_en: 'The bank session has expired. The connection is now marked expired; only the user can renew it with BankID in a browser.',
    remediation: {
      description: 'Give the user the connect_url from gnubok_connect_bank (or GET /bank-connections). Do not retry: no API call can revive a dead consent.',
      tool: 'gnubok_connect_bank',
    },
  },
  BANK_SYNC_FAILED: {
    httpStatus: 502,
    message_sv: 'Banksynkningen misslyckades. Försök igen om en stund, eller förnya anslutningen om felet kvarstår.',
    message_no: 'Banksynkroniseringen mislyktes. Prøv igjen om litt, eller forny forbindelsen hvis feilen vedvarer.',
    message_en: 'The bank sync failed upstream. Retry after the cooldown; if it keeps failing the user should renew the connection.',
    retryable: true,
  },
}

const SKATTEKONTO_FILE: Record<string, StructuredErrorEntry> = {
  SKATTEKONTO_FILE_NO_FILE: {
    httpStatus: 400,
    message_sv: 'Ingen fil bifogad i förfrågan.',
    message_no: 'Ingen fil er vedlagt i forespørselen.',
    message_en: 'No file attached to the request.',
  },
  SKATTEKONTO_FILE_TOO_LARGE: {
    httpStatus: 400,
    message_sv: 'Filen är för stor. Maxstorlek är 10 MB.',
    message_no: 'Filen er for stor. Maksimal størrelse er 10 MB.',
    message_en: 'File exceeds the 10 MB size limit.',
  },
  SKATTEKONTO_FILE_DUPLICATE: {
    httpStatus: 409,
    message_sv: 'Det här kontoutdraget har redan importerats.',
    message_no: 'Denne kontoutskriften er allerede importert.',
    message_en: 'This tax account statement has already been imported.',
  },
  SKATTEKONTO_FILE_PARSE_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte tolka skattekontoutdraget.',
    message_no: 'Kunne ikke tolke skattekontoutskriften.',
    message_en: 'Failed to parse the tax account statement.',
  },
  SKATTEKONTO_FILE_NOT_RECOGNIZED: {
    httpStatus: 400,
    message_sv:
      'Filen känns inte igen som ett skattekontoutdrag. Ladda ner kontohändelserna från Skatteverkets e-tjänst Skattekonto och försök igen.',
    message_no: 'Filen gjenkjennes ikke som en skattekontoutskrift. Last ned kontohandlingene fra Skatteverkets e-tjeneste Skattekonto og prøv igjen.',
    message_en:
      'The file was not recognized as a tax account statement. Download the account events from Skatteverket and try again.',
  },
  SKATTEKONTO_FILE_NO_ROWS: {
    httpStatus: 400,
    message_sv: 'Kontoutdraget innehåller inga händelser att importera.',
    message_no: 'Kontoutskriften inneholder ingen hendelser å importere.',
    message_en: 'No account events to import.',
  },
  SKATTEKONTO_FILE_IMPORT_RECORD_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte skapa importpost.',
    message_no: 'Kunne ikke opprette importpost.',
    message_en: 'Failed to create the import record.',
  },
  SKATTEKONTO_FILE_EXECUTE_FAILED: {
    httpStatus: 500,
    message_sv: 'Importen av skattekontoutdraget misslyckades.',
    message_no: 'Importen av skattekontoutskriften mislyktes.',
    message_en: 'Tax account statement import failed.',
  },
}

const OPENING_BALANCE_IMPORT: Record<string, StructuredErrorEntry> = {
  OB_NO_FILE: {
    httpStatus: 400,
    message_sv: 'Ingen fil bifogad.',
    message_no: 'Ingen fil vedlagt.',
    message_en: 'No file attached.',
  },
  OB_FILE_TOO_LARGE: {
    httpStatus: 400,
    message_sv: 'Filen är för stor. Maxstorlek är 10 MB.',
    message_no: 'Filen er for stor. Maksimal størrelse er 10 MB.',
    message_en: 'File exceeds the 10 MB size limit.',
  },
  OB_INVALID_FORMAT: {
    httpStatus: 400,
    message_sv: 'Filformatet stöds inte. Tillåtna format: .xlsx, .xls, .csv, .ods.',
    message_no: 'Filformatet støttes ikke. Tillatte formater: .xlsx, .xls, .csv, .ods.',
    message_en: 'Unsupported file format.',
  },
  OB_INVALID_COLUMN_OVERRIDES: {
    httpStatus: 400,
    message_sv: 'Ogiltig kolumnmappning.',
    message_no: 'Ugyldig kolonnetilordning.',
    message_en: 'Invalid column overrides JSON.',
  },
  OB_PARSE_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte tolka filen.',
    message_no: 'Kunne ikke tolke filen.',
    message_en: 'Failed to parse the opening balance file.',
  },
  OB_PERIOD_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Räkenskapsperioden hittades inte.',
    message_no: 'Regnskapsperioden ble ikke funnet.',
    message_en: 'Fiscal period not found.',
  },
  OB_PERIOD_CLOSED: {
    httpStatus: 400,
    message_sv: 'Räkenskapsperioden är stängd.',
    message_no: 'Regnskapsperioden er stengt.',
    message_en: 'Fiscal period is closed.',
  },
  OB_PERIOD_LOCKED: {
    httpStatus: 400,
    message_sv: 'Räkenskapsperioden är låst.',
    message_no: 'Regnskapsperioden er låst.',
    message_en: 'Fiscal period is locked.',
  },
  OB_COMPANY_LOCK_DATE: {
    httpStatus: 409,
    message_sv:
      'Bokföringen är låst t.o.m. ett låsdatum som täcker periodens start — ingående balanser kan inte korrigeras. Ta bort eller flytta låsdatumet under Inställningar → Bokföring och försök igen.',
    message_no: 'Bokføringen er låst til og med en låsedato som dekker periodens start — inngående balanser kan ikke korrigeres. Fjern eller flytt låsedatoen under Innstillinger → Bokføring og prøv igjen.',
    message_en:
      'The company-wide bookkeeping lock date covers the period start — opening balances cannot be corrected. Remove or move the lock date under Settings → Bookkeeping and try again.',
    remediation: {
      description:
        'Clear or move the bookkeeping lock date (company_settings.bookkeeping_locked_through) to a date before the period start, then retry the correction.',
    },
  },
  OB_PERIOD_ALREADY_HAS_BALANCES: {
    httpStatus: 409,
    message_sv: 'Räkenskapsperioden har redan ingående balanser.',
    message_no: 'Regnskapsperioden har allerede inngående balanser.',
    message_en: 'Fiscal period already has opening balances set.',
  },
  OB_TOO_FEW_LINES: {
    httpStatus: 400,
    message_sv: 'Minst två rader med belopp krävs.',
    message_no: 'Minst to linjer med beløp kreves.',
    message_en: 'At least two lines with amounts are required.',
  },
  OB_PNL_ACCOUNT: {
    httpStatus: 400,
    message_sv: 'Resultatkonton (klass 3-8) kan inte användas i ingående balanser.',
    message_no: 'Resultatkonti (klasse 3-8) kan ikke brukes i inngående balanser.',
    message_en: 'Profit & loss accounts (class 3-8) are not allowed in opening balances.',
  },
  OB_UNBALANCED: {
    httpStatus: 400,
    message_sv: 'Debet och kredit balanserar inte.',
    message_no: 'Debet og kredit balanserer ikke.',
    message_en: 'Opening balance debits and credits do not match.',
  },
  OB_ACCOUNT_ACTIVATION_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte aktivera konton i kontoplanen.',
    message_no: 'Kunne ikke aktivere kontoer i kontoplanen.',
    message_en: 'Failed to activate accounts in the chart of accounts.',
  },
  OB_EXECUTE_FAILED: {
    httpStatus: 500,
    message_sv: 'Importen misslyckades.',
    message_no: 'Importen mislyktes.',
    message_en: 'Opening balance import failed.',
  },
  OB_CORRECT_NO_EXISTING: {
    httpStatus: 409,
    message_sv: 'Perioden har inga ingående balanser att korrigera. Bokför dem först.',
    message_no: 'Perioden har ingen inngående balanser å korrigere. Bokfør dem først.',
    message_en: 'The period has no opening balances to correct. Book them first.',
  },
  OB_CORRECT_YEAR_END_EXISTS: {
    httpStatus: 409,
    message_sv:
      'Perioden har ett bokslut. Återför bokslutet och öppna perioden innan ingående balanser kan korrigeras.',
    message_no: 'Perioden har en regnskapsavslutning. Tilbakefør regnskapsavslutningen og åpne perioden før inngående balanser kan korrigeres.',
    message_en:
      'The period has a year-end close. Reverse the close and reopen the period before opening balances can be corrected.',
  },
  OB_CORRECT_FAILED: {
    httpStatus: 500,
    message_sv: 'Korrigeringen av ingående balanser misslyckades.',
    message_no: 'Korrigeringen av inngående balanser mislyktes.',
    message_en: 'Opening balance correction failed.',
  },
}

const REGISTER_IMPORT: Record<string, StructuredErrorEntry> = {
  REG_IMPORT_NO_FILE: {
    httpStatus: 400,
    message_sv: 'Ingen fil bifogad.',
    message_no: 'Ingen fil er vedlagt.',
    message_en: 'No file attached.',
  },
  REG_IMPORT_FILE_TOO_LARGE: {
    httpStatus: 400,
    message_sv: 'Filen är för stor. Maxstorlek är 10 MB.',
    message_no: 'Filen er for stor. Maksimal størrelse er 10 MB.',
    message_en: 'File exceeds the 10 MB size limit.',
  },
  REG_IMPORT_INVALID_FORMAT: {
    httpStatus: 400,
    message_sv: 'Filformatet stöds inte. Tillåtna format: .xlsx, .xls, .csv, .ods.',
    message_no: 'Filformatet støttes ikke. Tillatte formater: .xlsx, .xls, .csv, .ods.',
    message_en: 'Unsupported file format.',
  },
  REG_IMPORT_INVALID_COLUMN_OVERRIDES: {
    httpStatus: 400,
    message_sv: 'Ogiltig kolumnmappning.',
    message_no: 'Ugyldig kolonnetilordning.',
    message_en: 'Invalid column overrides JSON.',
  },
  REG_IMPORT_PARSE_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte tolka filen.',
    message_no: 'Kunne ikke tolke filen.',
    message_en: 'Failed to parse the register file.',
  },
  REG_IMPORT_NO_ROWS: {
    httpStatus: 400,
    message_sv: 'Inga giltiga rader hittades i filen.',
    message_no: 'Ingen gyldige rader ble funnet i filen.',
    message_en: 'No valid rows found in the file.',
  },
  REG_IMPORT_EXECUTE_FAILED: {
    httpStatus: 500,
    message_sv: 'Importen misslyckades.',
    message_no: 'Importen mislyktes.',
    message_en: 'Register import failed.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Wave 3 tail: provider migration extension codes
// ─────────────────────────────────────────────────────────────────

const PROVIDER_MIGRATION: Record<string, StructuredErrorEntry> = {
  PROVIDER_INVALID: {
    httpStatus: 400,
    message_sv: 'Okänd leverantör.',
    message_no: 'Ukjent leverandør.',
    message_en: 'Unknown provider.',
  },
  PROVIDER_CONSENT_NOT_READY: {
    httpStatus: 400,
    message_sv: 'Anslutningen är inte klar. Slutför inloggningen först.',
    message_no: 'Tilkoblingen er ikke klar. Fullfør innloggingen først.',
    message_en: 'Provider consent is not ready; finish authentication first.',
  },
  PROVIDER_CONSENT_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Anslutningen kunde inte hittas.',
    message_no: 'Tilkoblingen ble ikke funnet.',
    message_en: 'Provider consent not found.',
  },
  PROVIDER_CONNECT_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte starta anslutningen till leverantören.',
    message_no: 'Kunne ikke starte tilkoblingen til leverandøren.',
    message_en: 'Failed to start provider connection flow.',
  },
  PROVIDER_TOKEN_REQUIRED: {
    httpStatus: 400,
    message_sv: 'API-token krävs för den här leverantören.',
    message_no: 'API-token kreves for denne leverandøren.',
    message_en: 'apiToken is required for this provider.',
  },
  PROVIDER_COMPANY_ID_REQUIRED: {
    httpStatus: 400,
    message_sv: 'companyId krävs för den här leverantören.',
    message_no: 'companyId kreves for denne leverandøren.',
    message_en: 'companyId is required for this provider.',
  },
  PROVIDER_TOKEN_SUBMIT_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte kontrollera integrationsuppgifterna hos leverantören. Försök igen.',
    message_no: 'Kunne ikke kontrollere integrasjonsopplysningene hos leverandøren. Prøv igjen.',
    message_en: 'Could not verify the integration details with the provider. Try again.',
  },
  PROVIDER_TOKEN_INVALID: {
    // 422 (not 401): the UPSTREAM provider rejected the pasted credentials.
    // The caller's own session is fine: a 401 here can trip client-side auth
    // interceptors into logging the user out. Clients must dispatch on the
    // error code, never on the HTTP status.
    httpStatus: 422,
    message_sv:
      'Leverantören avvisade autentiseringen. Kontrollera integrationsuppgifterna och försök igen.',
    message_no: 'Leverandøren avviste autentiseringen. Kontroller integrasjonsopplysningene og prøv igjen.',
    message_en:
      'The provider rejected the authentication. Check the integration details and try again.',
  },
  BOKIO_COMPANY_NOT_FOUND: {
    httpStatus: 422,
    message_sv:
      'Bokio hittade inte företaget. Kontrollera företags-ID:t och att integrationstoken skapades för samma företag.',
    message_no: 'Bokio fant ikke selskapet. Kontroller selskaps-ID-en og at integrasjonstokenet ble opprettet for samme selskap.',
    message_en:
      'Bokio could not find the company. Check the company ID and that the integration token was created for the same company.',
  },
  BL_INTEGRATION_NOT_ACTIVATED: {
    // 422, same reasoning as PROVIDER_TOKEN_INVALID. The User-Key opened a
    // real company, but that company has granted our service provider no
    // scopes (BL: "out of allowed scope for service provider"). Nothing the
    // user re-pastes can fix this: the integration must be activated on the
    // BL side, and until BL has released it for the company it cannot be.
    httpStatus: 422,
    message_sv:
      'Företagsnyckeln stämmer, men företaget har inte aktiverat Accounted som integration i Björn Lundén. Aktivera integrationen under Integrationer i Lundify eller BL Administration och försök igen. Saknas Accounted i listan är integrationen inte släppt för ditt företag ännu: importera via SIE-fil så länge.',
    message_no: 'Selskapsnøkkelen stemmer, men selskapet har ikke aktivert Accounted som integrasjon i Björn Lundén. Aktiver integrasjonen under Integrasjoner i Lundify eller BL Administration og prøv igjen. Mangler Accounted i listen, er integrasjonen ikke sluppet for selskapet ditt ennå: importer via SIE-fil så lenge.',
    message_en:
      'The company key is valid, but the company has not activated Accounted as an integration in Björn Lundén. Activate the integration under Integrations in Lundify or BL Administration and try again. If Accounted is missing from the list, the integration has not been released for your company yet: import via a SIE file for now.',
  },
  BL_COMPANY_KEY_NOT_FOUND: {
    // 422: BL could not bind any company to the pasted User-Key (typo,
    // truncated GUID, key from a different BL environment).
    httpStatus: 422,
    message_sv:
      'Björn Lundén hittade inget företag för den här företagsnyckeln. Kontrollera att hela nyckeln (GUID) är kopierad från Integrationer → kugghjulet i Lundify och försök igen.',
    message_no: 'Björn Lundén fant ikke noe selskap for denne selskapsnøkkelen. Kontroller at hele nøkkelen (GUID) er kopiert fra Integrasjoner → tannhjulet i Lundify og prøv igjen.',
    message_en:
      'Björn Lundén found no company for this company key. Check that the whole key (GUID) was copied from Integrations → the gear icon in Lundify and try again.',
  },
  PROVIDER_COMPANY_MISMATCH: {
    // 422, same reasoning as PROVIDER_TOKEN_INVALID: the credentials are valid,
    // but they open a DIFFERENT legal entity than the one being imported into.
    // Importing anyway mixes another company's ledger into this one, which is
    // both a bookkeeping and a data-protection problem: refuse at the boundary.
    httpStatus: 422,
    message_sv:
      'Uppgifterna gäller ett annat företag än det du importerar till. Kontrollera att du valt rätt företag hos leverantören och försök igen.',
    message_no: 'Opplysningene gjelder et annet selskap enn det du importerer til. Kontroller at du har valgt riktig selskap hos leverandøren og prøv igjen.',
    message_en:
      'These credentials belong to a different company than the one you are importing into. Check that you picked the right company at the provider and try again.',
  },
  PROVIDER_PREVIEW_FAILED: {
    httpStatus: 500,
    message_sv: 'Förhandsgranskningen från leverantören misslyckades.',
    message_no: 'Forhåndsvisningen fra leverandøren mislyktes.',
    message_en: 'Provider preview failed.',
  },
  PROVIDER_SIE_FETCH_FAILED: {
    httpStatus: 502,
    message_sv: 'Kunde inte hämta SIE-data från leverantören.',
    message_no: 'Kunne ikke hente SIE-data fra leverandøren.',
    message_en: 'Failed to fetch SIE data from the provider.',
  },
  PROVIDER_SIE_NO_YEARS: {
    // The supported window is rolling (current year and the two before it):
    // the route interpolates the actual range via the messageSv/messageEn
    // overrides on errorResponseFromCode(); this entry is the static fallback.
    httpStatus: 404,
    message_sv: 'Inga räkenskapsår inom det stödda intervallet hittades hos leverantören.',
    message_no: 'Ingen regnskapsår innenfor det støttede intervallet ble funnet hos leverandøren.',
    message_en: 'No fiscal years available within the supported range.',
  },
  PROVIDER_SIE_NOT_SUPPORTED: {
    httpStatus: 400,
    message_sv:
      'Den här leverantören stöder inte SIE-hämtning via API. Ladda upp en SIE-fil manuellt istället.',
    message_no: 'Denne leverandøren støtter ikke SIE-henting via API. Last opp en SIE-fil manuelt i stedet.',
    message_en:
      'This provider does not support fetching SIE via API. Upload a SIE file manually instead.',
  },
  PROVIDER_SIE_IMPORT_REQUIRED: {
    httpStatus: 409,
    message_sv:
      'Bokföringsdata (SIE) måste importeras först. Ladda upp en SIE-fil med kontoplan, ingående balanser och verifikationer innan du hämtar kunder, leverantörer, fakturor och anläggningstillgångar från den här leverantören.',
    message_no: 'Regnskapsdata (SIE) må importeres først. Last opp en SIE-fil med kontoplan, inngående balanser og bilag før du henter kunder, leverandører, fakturaer og anleggsmidler fra denne leverandøren.',
    message_en:
      'A completed SIE import is required first. Import the SIE file (chart of accounts, opening balances and verifications) before importing customers, suppliers, invoices and fixed assets from this provider.',
  },
  PROVIDER_MIGRATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Migrationen från leverantören misslyckades.',
    message_no: 'Migreringen fra leverandøren mislyktes.',
    message_en: 'Provider migration failed.',
  },
  PROVIDER_IMPORT_DOCUMENTS_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte importera underlag från leverantören.',
    message_no: 'Kunne ikke importere underlag fra leverandøren.',
    message_en: 'Failed to import documents from provider.',
  },
  // Same-origin storage proxy (/api/storage): signed Storage URLs served
  // from the app's own host for agent sandboxes that only reach the MCP host.
  STORAGE_PROXY_UNSUPPORTED_PATH: {
    httpStatus: 404,
    message_sv: 'Sökvägen stöds inte av lagringsproxyn.',
    message_no: 'Stien støttes ikke av lagringsproxien.',
    message_en: 'The storage proxy does not serve this path.',
  },
  STORAGE_PROXY_TOKEN_REQUIRED: {
    httpStatus: 400,
    message_sv: 'Länken saknar sin signerade token.',
    message_no: 'Lenken mangler sitt signerte token.',
    message_en: 'The link is missing its signed token.',
  },
  STORAGE_PROXY_BODY_TOO_LARGE: {
    httpStatus: 413,
    message_sv: 'Filen är för stor för att laddas upp via länken.',
    message_no: 'Filen er for stor til å lastes opp via lenken.',
    message_en: 'The file is too large to upload through this link.',
  },
  STORAGE_PROXY_UNCONFIGURED: {
    httpStatus: 503,
    message_sv: 'Lagringen är inte konfigurerad på den här servern.',
    message_no: 'Lagringen er ikke konfigurert på denne serveren.',
    message_en: 'Storage is not configured on this server.',
  },
  STORAGE_PROXY_UPSTREAM_UNAVAILABLE: {
    httpStatus: 502,
    message_sv: 'Lagringen svarade inte.',
    message_no: 'Lagringen svarte ikke.',
    message_en: 'Storage did not respond.',
  },
  PROVIDER_DOCUMENT_SCOPES_REQUIRED: {
    httpStatus: 403,
    message_sv:
      'Fortnox-anslutningen saknar behörighet till Arkiv och Koppla fil. Koppla om Fortnox och godkänn behörigheterna för att importera underlag.',
    message_no: 'Fortnox-tilkoblingen mangler tilgang til Arkiv og Koble fil. Koble til Fortnox på nytt og godkjenn tilgangene for å importere underlag.',
    message_en:
      'The Fortnox connection lacks Archive and Connect file access. Reconnect Fortnox and approve those permissions to import documents.',
  },
  PROVIDER_DOCUMENT_SCOPES_UNAVAILABLE: {
    httpStatus: 403,
    message_sv:
      'Filimport från Fortnox är inte påslagen än: behörigheterna Arkiv och Koppla fil saknas för Accounted-integrationen hos Fortnox. Att koppla om hjälper inte, vi aktiverar det så snart behörigheten är på plats. Allt annat i migreringen är importerat.',
    message_no: 'Filimport fra Fortnox er ikke slått på ennå: tilgangene Arkiv og Koble fil mangler for Accounted-integrasjonen hos Fortnox. Å koble til på nytt hjelper ikke, vi aktiverer det så snart tilgangen er på plass. Alt annet i migreringen er importert.',
    message_en:
      'Fortnox file import is not enabled yet: the Archive and Connect file permissions are missing for the Accounted integration at Fortnox. Reconnecting will not help; we enable this as soon as the permission is in place. Everything else in the migration was imported.',
  },
  PROVIDER_DISCONNECT_FAILED: {
    httpStatus: 500,
    message_sv: 'Frånkoppling från leverantören misslyckades.',
    message_no: 'Frakoblingen fra leverandøren mislyktes.',
    message_en: 'Provider disconnect failed.',
  },
  PROVIDER_ACCEPT_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte slutföra anslutningen.',
    message_no: 'Kunne ikke fullføre tilkoblingen.',
    message_en: 'Failed to accept consent.',
  },
  PROVIDER_STATUS_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte hämta status från leverantören.',
    message_no: 'Kunne ikke hente status fra leverandøren.',
    message_en: 'Failed to fetch provider status.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Wave 4: documents, masters, salary, company, API keys
// ─────────────────────────────────────────────────────────────────

const DOCUMENT: Record<string, StructuredErrorEntry> = {
  // Signed-URL (direct-to-storage) upload: completion found no object under
  // the reservation. The bytes never landed, or the reservation expired.
  DOCUMENT_UPLOAD_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Den uppladdade filen hittades inte eller har gått ut. Ladda upp filen igen.',
    message_no: 'Den opplastede filen ble ikke funnet eller er utløpt. Last opp filen på nytt.',
    message_en: 'The uploaded file was not found or the upload has expired. Upload the file again.',
  },
  // Signed-URL upload completed against an empty object: the PUT sent no
  // bytes, or sent them somewhere else.
  DOC_UPLOAD_EMPTY: {
    httpStatus: 400,
    message_sv: 'Filen är tom. Ladda upp filen igen.',
    message_no: 'Filen er tom. Last opp filen på nytt.',
    message_en: 'The uploaded file is empty. Upload the file again.',
  },
  DOC_UPLOAD_NO_FILE: {
    httpStatus: 400,
    message_sv: 'Ingen fil bifogad.',
    message_no: 'Ingen fil er vedlagt.',
    message_en: 'No file attached.',
  },
  DOC_UPLOAD_TOO_LARGE: {
    httpStatus: 400,
    message_sv: 'Filen är för stor.',
    message_no: 'Filen er for stor.',
    message_en: 'Uploaded file exceeds the size limit.',
  },
  DOC_UPLOAD_UNSUPPORTED_TYPE: {
    httpStatus: 400,
    message_sv: 'Filtypen stöds inte.',
    message_no: 'Filtypen støttes ikke.',
    message_en: 'Unsupported file type.',
  },
  DOC_UPLOAD_INVALID_CONTENT: {
    httpStatus: 400,
    message_sv: 'Filen kunde inte läsas som en giltig PDF eller bild. Kontrollera att filen inte är skadad.',
    message_no: 'Filen kunne ikke leses som en gyldig PDF eller bilde. Kontroller at filen ikke er skadet.',
    message_en: 'The file could not be read as a valid PDF or image. Check that the file is not corrupted.',
  },
  DOC_UPLOAD_STORAGE_FAILED: {
    httpStatus: 500,
    message_sv: 'Filen kunde inte sparas.',
    message_no: 'Filen kunne ikke lagres.',
    message_en: 'Document storage failed.',
  },
  DOC_UPLOAD_PERIOD_LOCKED: {
    httpStatus: 400,
    message_sv: 'Det går inte att bifoga underlag till verifikationer i en låst eller stängd period.',
    message_no: 'Det er ikke mulig å vedlegge underlag til bilag i en låst eller stengt periode.',
    message_en: 'Cannot attach documents to entries in a locked or closed fiscal period.',
  },
  DOC_DOWNLOAD_FAILED: {
    httpStatus: 500,
    message_sv: 'Det gick inte att skapa nedladdningslänken.',
    message_no: 'Det gikk ikke å opprette nedlastingslenken.',
    message_en: 'Failed to create signed download URL.',
  },
  DOC_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Dokumentet kunde inte hittas.',
    message_no: 'Dokumentet ble ikke funnet.',
    message_en: 'Document not found.',
  },
  DOC_LINK_ENTRY_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Verifikationen kunde inte hittas.',
    message_no: 'Bilaget ble ikke funnet.',
    message_en: 'Journal entry not found.',
  },
  DOC_LINK_ALREADY_LINKED: {
    httpStatus: 409,
    message_sv: 'Dokumentet är redan kopplat till en verifikation.',
    message_no: 'Dokumentet er allerede koblet til et bilag.',
    message_en: 'Document is already linked to a journal entry.',
  },
  DOC_LINK_FAILED: {
    httpStatus: 500,
    message_sv: 'Kopplingen misslyckades.',
    message_no: 'Koblingen mislyktes.',
    message_en: 'Failed to link document to journal entry.',
  },
  UNDERLAG_REF_MISMATCH: {
    httpStatus: 409,
    message_sv:
      'Filnamnet pekar inte på den verifikation som valdes. Ladda om förhandsgranskningen och försök igen.',
    message_no: 'Filnavnet peker ikke på bilaget som ble valgt. Last inn forhåndsvisningen på nytt og prøv igjen.',
    message_en:
      'The filename does not point at the selected verifikat. Reload the preview and try again.',
  },
  UNDERLAG_PERIOD_MISMATCH: {
    httpStatus: 409,
    message_sv:
      'Verifikationen tillhör ett annat räkenskapsår än det du valde för underlagen. Ladda om förhandsgranskningen och försök igen.',
    message_no: 'Bilaget tilhører et annet regnskapsår enn det du valgte for underlagene. Last inn forhåndsvisningen på nytt og prøv igjen.',
    message_en:
      'The verifikat belongs to a different fiscal year than the one selected for these files. Reload the preview and try again.',
  },
  UNDERLAG_ENTRY_NOT_POSTED: {
    httpStatus: 409,
    message_sv: 'Verifikationen är inte bokförd, så underlag kan inte kopplas till den ännu.',
    message_no: 'Bilaget er ikke bokført, så underlag kan ikke kobles til det ennå.',
    message_en: 'The journal entry is not posted, so documents cannot be attached to it yet.',
  },
  UNDERLAG_ENTRY_NOT_MIGRATED: {
    httpStatus: 400,
    message_sv: 'Verifikationen kommer inte från en SIE-import och kan inte matchas mot filnamn.',
    message_no: 'Bilaget kommer ikke fra en SIE-import og kan ikke matches mot filnavn.',
    message_en: 'The journal entry did not come from a SIE import and cannot be matched by filename.',
  },
}

// Invoice-inbox manual upload and attach-document (extension REST routes).
const INBOX_UPLOAD: Record<string, StructuredErrorEntry> = {
  INBOX_UPLOAD_NO_FILE: {
    httpStatus: 400,
    message_sv: 'Ingen fil bifogad.',
    message_no: 'Ingen fil er vedlagt.',
    message_en: 'No file attached.',
  },
  INBOX_UPLOAD_TOO_LARGE: {
    httpStatus: 400,
    message_sv: 'Filen är för stor. Maxstorlek är 10 MB.',
    message_no: 'Filen er for stor. Maksstørrelse er 10 MB.',
    message_en: 'File exceeds the 10 MB size limit.',
  },
  INBOX_UPLOAD_UNSUPPORTED_TYPE: {
    httpStatus: 400,
    message_sv: 'Filtypen stöds inte. Tillåtna format: PDF, JPEG, PNG, HEIC och WebP.',
    message_no: 'Filtypen støttes ikke. Tillatte formater: PDF, JPEG, PNG, HEIC og WebP.',
    message_en: 'Unsupported file type. Allowed: PDF, JPEG, PNG, HEIC, WebP.',
  },
  INBOX_UPLOAD_TX_NOT_IN_COMPANY: {
    httpStatus: 400,
    message_sv: 'Den angivna transaktionen (matched_transaction_id) tillhör ett annat företag.',
    message_no: 'Den angitte transaksjonen (matched_transaction_id) tilhører et annet selskap.',
    message_en: 'matched_transaction_id refers to a transaction outside this company.',
  },
  INBOX_UPLOAD_FAILED: {
    httpStatus: 500,
    message_sv: 'Uppladdningen misslyckades. Försök igen.',
    message_no: 'Opplastingen mislyktes. Prøv igjen.',
    message_en: 'Upload failed.',
  },
  // A read-only (viewer) member: the storage policy admits the bytes on
  // membership alone, the document_attachments insert policy does not.
  INBOX_UPLOAD_NOT_PERMITTED: {
    httpStatus: 403,
    message_sv: 'Du har inte behörighet att ladda upp underlag i det här företaget. Medlemmar med läsbehörighet kan inte lägga till dokument.',
    message_no: 'Du har ikke tilgang til å laste opp underlag i dette selskapet. Medlemmer med lesetilgang kan ikke legge til dokumenter.',
    message_en: 'You do not have permission to upload documents to this company. Read-only members cannot add documents.',
  },
  INBOX_ATTACH_FAILED: {
    httpStatus: 500,
    message_sv: 'Bilagan kunde inte kopplas. Försök igen.',
    message_no: 'Underlaget kunne ikke kobles. Prøv igjen.',
    message_en: 'Failed to attach the document.',
  },
}

const CUSTOMER: Record<string, StructuredErrorEntry> = {
  CUSTOMER_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Kunden kunde inte hittas.',
    message_no: 'Kunden kunne ikke finnes.',
    message_en: 'Customer not found.',
  },
  CUSTOMER_DUPLICATE_ORG_NUMBER: {
    httpStatus: 409,
    message_sv: 'En kund med samma organisationsnummer finns redan.',
    message_no: 'Det finnes allerede en kunde med samme organisasjonsnummer.',
    message_en: 'A customer with that organisation number already exists.',
  },
  CUSTOMER_CREATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunden kunde inte skapas.',
    message_no: 'Kunden kunne ikke opprettes.',
    message_en: 'Failed to create customer.',
  },
  CUSTOMER_UPDATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunden kunde inte uppdateras.',
    message_no: 'Kunden kunne ikke oppdateres.',
    message_en: 'Failed to update customer.',
  },
  CUSTOMER_DELETE_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunden kunde inte tas bort.',
    message_no: 'Kunden kunne ikke slettes.',
    message_en: 'Failed to delete customer.',
  },
  CUSTOMER_HAS_INVOICES: {
    httpStatus: 409,
    message_sv: 'Kunden har fakturor och kan inte tas bort.',
    message_no: 'Kunden har fakturaer og kan ikke slettes.',
    message_en: 'Customer cannot be deleted while invoices reference it.',
  },
  CUSTOMER_NO_PERSONAL_NUMBER: {
    httpStatus: 404,
    message_sv: 'Kunden har inget sparat personnummer.',
    message_no: 'Kunden har ikke lagret fødselsnummer.',
    message_en: 'No personal number is stored for this customer.',
  },
  // The stored ciphertext could not be decrypted (written under a different
  // PERSONNUMMER_ENCRYPTION_KEY, or corrupted). Deliberately not an
  // INTERNAL_ERROR: it is not transient, retrying never helps, and the user
  // can fix it in one step by typing the personnummer in again.
  CUSTOMER_PERSONAL_NUMBER_UNREADABLE: {
    httpStatus: 422,
    message_sv:
      'Det sparade personnumret kan inte läsas. Skriv in det igen för att ersätta det.',
    message_no: 'Det lagrede fødselsnummeret kan ikke leses. Skriv det inn på nytt for å erstatte det.',
    message_en:
      'The stored personal number cannot be read. Enter it again to replace it.',
  },
}

const ARTICLE: Record<string, StructuredErrorEntry> = {
  ARTICLE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Artikeln kunde inte hittas.',
    message_no: 'Artikkelen kunne ikke finnes.',
    message_en: 'Article not found.',
  },
  ARTICLE_DUPLICATE_NUMBER: {
    httpStatus: 409,
    message_sv: 'En artikel med samma artikelnummer finns redan.',
    message_no: 'Det finnes allerede en artikkel med samme artikkelnummer.',
    message_en: 'An article with that article number already exists.',
  },
  ARTICLE_CREATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Artikeln kunde inte skapas.',
    message_no: 'Artikkelen kunne ikke opprettes.',
    message_en: 'Failed to create article.',
  },
  ARTICLE_UPDATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Artikeln kunde inte uppdateras.',
    message_no: 'Artikkelen kunne ikke oppdateres.',
    message_en: 'Failed to update article.',
  },
  INVOICE_DELETE_FAILED: {
    httpStatus: 500,
    message_sv: 'Fakturan kunde inte tas bort eller makuleras.',
    message_no: 'Fakturaen kunne ikke slettes eller makuleres.',
    message_en: 'The invoice could not be deleted or cancelled.',
  },
  CUSTOMER_PERSONAL_NUMBER_NOT_ALLOWED: {
    httpStatus: 400,
    message_sv: 'Personnummer kan endast sparas för privatkunder.',
    message_no: 'Fødselsnummer kan bare lagres for privatkunder.',
    message_en: 'Personal numbers can only be stored for individual customers.',
  },
  CUSTOMER_ORG_NUMBER_IS_PERSONAL: {
    httpStatus: 400,
    message_sv:
      'Organisationsnumret ser ut som ett personnummer, vilket ett utländskt företag inte kan ha. Välj kundtypen Svenskt företag för en enskild firma, eller Privatperson för en privatperson.',
    message_no: 'Organisasjonsnummeret ser ut som et fødselsnummer, noe et utenlandsk selskap ikke kan ha. Velg kundetypen Svensk selskap for et enkeltpersonforetak, eller Privatperson for en privatperson.',
    message_en:
      'The org number looks like a Swedish personal identity number, which a foreign business cannot have. Choose the customer type Swedish business for a sole trader, or Individual for a private person.',
  },
  CUSTOMER_COUNTRY_MISMATCH: {
    httpStatus: 400,
    message_sv: 'Landet stämmer inte med kundtypen eller VAT-numrets landsprefix.',
    message_no: 'Landet stemmer ikke med kundetypen eller landet i VAT-nummerets prefiks.',
    message_en: 'The country does not agree with the customer type or the VAT number\'s country prefix.',
  },
  CUSTOMER_PERSONAL_NUMBER_CONFLICT: {
    httpStatus: 400,
    message_sv:
      'Kunden fick två olika personnummer: ett i fältet personnummer och ett i fältet organisationsnummer. En privatperson har sitt personnummer i fältet personnummer; lämna organisationsnumret tomt.',
    message_no: 'Kunden fikk to ulike fødselsnummer: ett i feltet fødselsnummer og ett i feltet organisasjonsnummer. En privatperson har fødselsnummeret sitt i feltet fødselsnummer; la organisasjonsnummeret stå tomt.',
    message_en:
      'The customer was given two different personal identity numbers: one in personal_number and one in org_number. An individual customer keeps its personnummer in personal_number; leave org_number empty.',
  },
  ARTICLE_DELETE_FAILED: {
    httpStatus: 500,
    message_sv: 'Artikeln kunde inte tas bort.',
    message_no: 'Varen kunne ikke slettes.',
    message_en: 'Failed to delete article.',
  },
  ARTICLE_IN_USE: {
    httpStatus: 409,
    message_sv:
      'Artikeln har använts på en faktura och kan därför inte tas bort. Inaktivera den i stället om du inte vill kunna välja den på nya fakturor.',
    message_no: 'Varen er brukt på en faktura og kan derfor ikke slettes. Deaktiver den i stedet hvis du ikke vil kunne velge den på nye fakturaer.',
    message_en:
      'The article has been used on an invoice and cannot be deleted. Deactivate it instead if you no longer want it selectable on new invoices.',
  },
  ARTICLE_REVENUE_ACCOUNT_INVALID: {
    httpStatus: 400,
    message_sv: 'Bokföringskontot finns inte eller är inte ett aktivt balans- eller intäktskonto (klass 1-3).',
    message_no: 'Bokføringskontoen finnes ikke eller er ikke en aktiv balanse- eller inntektskonto (klasse 1-3).',
    message_en: 'The posting account does not exist or is not an active balance-sheet or revenue account (class 1-3).',
  },
}

const SUPPLIER: Record<string, StructuredErrorEntry> = {
  SUPPLIER_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Leverantören kunde inte hittas.',
    message_no: 'Leverandøren kunne ikke finnes.',
    message_en: 'Supplier not found.',
  },
  SUPPLIER_DUPLICATE_ORG_NUMBER: {
    httpStatus: 409,
    message_sv: 'En leverantör med samma organisationsnummer finns redan.',
    message_no: 'Det finnes allerede en leverandør med samme organisasjonsnummer.',
    message_en: 'A supplier with that organisation number already exists.',
  },
  SUPPLIER_CREATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Leverantören kunde inte skapas.',
    message_no: 'Leverandøren kunne ikke opprettes.',
    message_en: 'Failed to create supplier.',
  },
  SUPPLIER_UPDATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Leverantören kunde inte uppdateras.',
    message_no: 'Leverandøren kunne ikke oppdateres.',
    message_en: 'Failed to update supplier.',
  },
  SUPPLIER_DELETE_FAILED: {
    httpStatus: 500,
    message_sv: 'Leverantören kunde inte tas bort.',
    message_no: 'Leverandøren kunne ikke slettes.',
    message_en: 'Failed to delete supplier.',
  },
  // v1 archive refusal: leverantörsfakturor pointing at this supplier still
  // need its name/address for BFL 7 kap audit. Issue credit notes first.
  SUPPLIER_HAS_INVOICES: {
    httpStatus: 409,
    message_sv:
      'Leverantören kan inte arkiveras eftersom det finns öppna leverantörsfakturor som refererar till den.',
    message_no: 'Leverandøren kan ikke arkiveres fordi det finnes åpne leverandørfakturaer som refererer til den.',
    message_en:
      'Supplier cannot be archived while open supplier invoices reference it.',
    remediation: {
      description:
        'Close (credit / mark paid) every open supplier invoice before archiving the supplier. The dashboard exposes the same blocker.',
    },
  },
  // v1 strict-mode: update / delete only allowed on `registered` SIs (the
  // SI analogue of `draft`). Mirrors the dashboard internal route.
  SI_NOT_DRAFT: {
    httpStatus: 400,
    message_sv:
      'Leverantörsfakturan är inte längre i status "registrerad" och kan därför inte uppdateras eller tas bort.',
    message_no: 'Leverandørfakturaen er ikke lenger i status "registrert" og kan derfor ikke oppdateres eller slettes.',
    message_en:
      'Supplier invoice is not in `registered` status and cannot be updated or deleted.',
  },
}

const SUPPLIER_INVOICE_WAVE4: Record<string, StructuredErrorEntry> = {
  SI_CREATE_DUPLICATE_INVOICE_NUMBER: {
    httpStatus: 409,
    message_sv: 'En leverantörsfaktura med samma nummer finns redan.',
    message_no: 'Det finnes allerede en leverandørfaktura med samme nummer.',
    message_en: 'A supplier invoice with that number already exists.',
  },
  SI_CREATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Leverantörsfakturan kunde inte skapas.',
    message_no: 'Leverandørfakturaen kunne ikke opprettes.',
    message_en: 'Failed to create supplier invoice.',
  },
  SI_CREATE_INVALID_INPUT: {
    httpStatus: 400,
    message_sv: 'Ogiltig kombination av fakturafält. Kontrollera formuläret och försök igen.',
    message_no: 'Ugyldig kombinasjon av fakturafelt. Kontroller skjemaet og prøv igjen.',
    message_en: 'Invalid combination of supplier invoice fields.',
  },
  SI_CREATE_NO_FISCAL_PERIOD: {
    httpStatus: 400,
    message_sv:
      'Det finns inget räkenskapsår som täcker fakturadatumet. Lägg upp räkenskapsåret först, eller ändra fakturadatumet.',
    message_no: 'Det finnes ikke noe regnskapsår som dekker fakturadatoen. Opprett regnskapsåret først, eller endre fakturadatoen.',
    message_en:
      'No fiscal year covers the invoice date. Create the fiscal year first, or change the invoice date.',
  },
  SI_CREATE_ACCRUAL_REVERSE_CHARGE: {
    httpStatus: 400,
    message_sv:
      'Periodisering kan inte kombineras med omvänd skattskyldighet. Kostnadsraden utgör momsunderlaget i momsdeklarationen (ruta 20-32), så nettobeloppet kan inte skjutas upp till ett interimskonto.',
    message_no: 'Periodisering kan ikke kombineres med omvendt avgiftsplikt. Kostnadslinjen utgjør mva-grunnlaget i mva-meldingen (rubrikk 20-32), så nettobeløpet kan ikke utsettes til en interimskonto.',
    message_en:
      'Periodisering cannot be combined with reverse charge. The expense line carries the VAT base for the VAT declaration (boxes 20-32), so the net amount cannot be deferred to an interim account.',
  },
  SI_CREATE_SLP_INVALID_ACCOUNT: {
    httpStatus: 400,
    message_sv:
      'Särskild löneskatt kan bara läggas till på rader med pensionskonto 7410-7419 (t.ex. 7412 Premier för tjänstepensioner). Byt konto på raden eller ta bort löneskatten.',
    message_no: 'Særskilt arbeidsgiveravgift kan bare legges til på linjer med pensjonskonto 7410-7419 (f.eks. 7412 Premier for tjenestepensjoner). Bytt konto på linjen eller fjern arbeidsgiveravgiften.',
    message_en:
      'Särskild löneskatt (payroll tax on pension costs) can only be added on lines booked to a pension account 7410-7419 (e.g. 7412 occupational pension premiums). Change the line account or remove the flag.',
  },
  SI_CREATE_SLP_ACCRUAL: {
    httpStatus: 400,
    message_sv:
      'Särskild löneskatt kan inte kombineras med periodisering på samma rad. Löneskatten (7533/2514) beräknas på hela radbeloppet vid registrering och kan inte skjutas upp.',
    message_no: 'Særskilt arbeidsgiveravgift kan ikke kombineres med periodisering på samme linje. Arbeidsgiveravgiften (7533/2514) beregnes på hele linjebeløpet ved registrering og kan ikke utsettes.',
    message_en:
      'Särskild löneskatt cannot be combined with periodisering on the same line. The payroll tax (7533/2514) is computed on the full line amount at registration and cannot be deferred.',
  },
  SI_DELETE_HAS_BOOKING: {
    httpStatus: 400,
    message_sv:
      'Leverantörsfakturan är bokförd, har registrerade betalningar eller en periodisering och kan inte tas bort. Skapa en kreditfaktura i stället för att återställa bokföringen.',
    message_no: 'Leverandørfakturaen er bokført, har registrerte betalinger eller en periodisering og kan ikke slettes. Opprett en kreditnota i stedet for å tilbakeføre bokføringen.',
    message_en:
      'The supplier invoice has a posted journal entry, recorded payments, or an accrual schedule and cannot be deleted. Create a credit note instead to reverse the bookkeeping.',
  },
  SI_PAID_ALREADY: {
    httpStatus: 409,
    message_sv: 'Leverantörsfakturan är redan betald eller krediterad.',
    message_no: 'Leverandørfakturaen er allerede betalt eller kreditert.',
    message_en: 'Supplier invoice is already paid or credited.',
  },
  SI_PAID_NOT_PAYABLE: {
    httpStatus: 400,
    message_sv: 'Leverantörsfakturan kan inte markeras som betald i nuvarande status.',
    message_no: 'Leverandørfakturaen kan ikke markeres som betalt i gjeldende status.',
    message_en: 'Supplier invoice is not in a payable state.',
  },
  SI_BANK_ENTERED_NOT_PAYABLE: {
    httpStatus: 400,
    message_sv:
      'Fakturan kan bara markeras som inlagd i banken när den är godkänd och har något kvar att betala.',
    message_no: 'Fakturaen kan bare markeres som registrert i banken når den er godkjent og har noe igjen å betale.',
    message_en:
      'The invoice can only be marked as entered at the bank while it is approved and has an outstanding amount.',
  },
  SI_PAID_PERIOD_LOCKED: {
    httpStatus: 400,
    message_sv: 'Bokföringen är låst. Betalningen kan inte registreras.',
    message_no: 'Bokføringen er låst. Betalingen kan ikke registreres.',
    message_en: 'Bookkeeping is locked; payment cannot be recorded.',
  },
  SI_PAID_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte registrera betalningen.',
    message_no: 'Kunne ikke registrere betalingen.',
    message_en: 'Failed to record supplier invoice payment.',
  },
  SI_PAID_LIKELY_DUPLICATE: {
    httpStatus: 409,
    message_sv:
      'Det finns redan en banktransaktion som kan vara denna betalning. Länka den istället, eller markera som betald ändå om du är säker.',
    message_no: 'Det finnes allerede en banktransaksjon som kan være denne betalingen. Koble den i stedet, eller marker som betalt likevel hvis du er sikker.',
    message_en:
      'A likely-matching bank transaction was found for this supplier. Suggest linking it instead of creating a new payment entry.',
    remediation: {
      description:
        'Inspect details.candidates[].match_reason. For an unlinked row, match it via POST /api/transactions/{id}/match-supplier-invoice. For `already_booked`, the row is already a posted verifikat (booked straight from the bank side): do NOT pay the invoice, correct the double booking instead (reverse one of the two vouchers with a storno entry and attach the underlag to the remaining one). Resend mark-paid with force: true only when the payment really is separate; on the v1 endpoint that retry needs a fresh Idempotency-Key.',
    },
  },
  SI_CREDIT_ALREADY_CREDITED: {
    httpStatus: 409,
    message_sv: 'Leverantörsfakturan har redan krediterats.',
    message_no: 'Leverandørfakturaen er allerede kreditert.',
    message_en: 'Supplier invoice has already been credited.',
  },
  SI_CREDIT_PERIOD_LOCKED: {
    httpStatus: 400,
    message_sv: 'Bokföringen är låst. Krediteringen kan inte skapas.',
    message_no: 'Bokføringen er låst. Krediteringen kan ikke opprettes.',
    message_en: 'Bookkeeping is locked; credit note cannot be created.',
  },
  SI_CREDIT_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte kreditera leverantörsfakturan.',
    message_no: 'Kunne ikke kreditere leverandørfakturaen.',
    message_en: 'Failed to credit supplier invoice.',
  },
  SI_BATCH_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Betalfilen kunde inte hittas.',
    message_no: 'Betalingsfilen ble ikke funnet.',
    message_en: 'Payment batch not found.',
  },
  SI_BATCH_INELIGIBLE_INVOICE: {
    httpStatus: 400,
    message_sv:
      'En eller flera fakturor kan inte ingå i betalfilen. Se detaljerna för orsak per faktura.',
    message_no: 'Én eller flere fakturaer kan ikke inngå i betalingsfilen. Se detaljene for årsak per faktura.',
    message_en:
      'One or more invoices cannot be included in the payment batch. See details for the per-invoice reason.',
  },
  SI_BATCH_INVALID_AMOUNT: {
    httpStatus: 400,
    message_sv: 'Betalbeloppet måste vara större än noll.',
    message_no: 'Betalingsbeløpet må være større enn null.',
    message_en: 'The payment amount must be greater than zero.',
  },
  SI_BATCH_AMOUNT_EXCEEDS_REMAINING: {
    httpStatus: 400,
    message_sv: 'Betalbeloppet är större än kvar att betala på fakturan.',
    message_no: 'Betalingsbeløpet er større enn det som gjenstår å betale på fakturaen.',
    message_en: "The payment amount exceeds the invoice's remaining amount.",
  },
  SI_BATCH_DUPLICATE_INVOICE: {
    httpStatus: 409,
    message_sv:
      'En eller flera fakturor ingår redan i en aktiv betalfil. Bekräfta att du vill skapa en ny betalning ändå.',
    message_no: 'Én eller flere fakturaer inngår allerede i en aktiv betalingsfil. Bekreft at du vil opprette en ny betaling likevel.',
    message_en:
      'One or more invoices are already part of an active payment batch. Confirm to create another payment anyway.',
    remediation: {
      description:
        'Resend with confirm_already_batched: true to include the invoices anyway, or cancel the existing batch first via POST /api/supplier-invoices/payment-batches/{id}/cancel.',
    },
  },
  SI_BATCH_DEBTOR_INCOMPLETE: {
    httpStatus: 400,
    message_sv:
      'Företagets bankuppgifter är ofullständiga. Fyll i IBAN (och BIC om det inte kan härledas) under Inställningar → Fakturering.',
    message_no: 'Foretakets bankopplysninger er ufullstendige. Fyll inn IBAN (og BIC hvis det ikke kan utledes) under Innstillinger → Fakturering.',
    message_en:
      'The company bank details are incomplete. Enter the IBAN (and BIC if it cannot be derived) under Settings → Invoicing.',
  },
  SI_BATCH_CANCELLED: {
    httpStatus: 409,
    message_sv: 'Betalfilen är makulerad och kan inte laddas ner.',
    message_no: 'Betalingsfilen er makulert og kan ikke lastes ned.',
    message_en: 'The payment batch is cancelled and cannot be downloaded.',
  },
  SI_BATCH_ALREADY_CANCELLED: {
    httpStatus: 409,
    message_sv: 'Betalfilen är redan makulerad.',
    message_no: 'Betalingsfilen er allerede makulert.',
    message_en: 'The payment batch is already cancelled.',
  },
  SI_BATCH_CREATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunde inte skapa betalfilen.',
    message_no: 'Kunne ikke opprette betalingsfilen.',
    message_en: 'Failed to create the payment batch.',
  },
  SI_DELETE_IN_PAYMENT_BATCH: {
    httpStatus: 409,
    message_sv:
      'Leverantörsfakturan ingår i en betalfil och kan inte tas bort: betalfilens rader är underlag för betalningsinstruktionen, även om filen makulerats.',
    message_no: 'Leverandørfakturaen inngår i en betalingsfil og kan ikke fjernes: linjene i betalingsfilen er underlag for betalingsinstruksjonen, selv om filen er makulert.',
    message_en:
      'The supplier invoice is part of a payment batch and cannot be deleted: the batch rows document the payment instruction, even if the batch was cancelled.',
  },
}

const SALARY: Record<string, StructuredErrorEntry> = {
  SALARY_RUN_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Lönekörningen kunde inte hittas.',
    message_no: 'Lønnskjøringen ble ikke funnet.',
    message_en: 'Salary run not found.',
  },
  SALARY_RUN_NO_EMPLOYEES: {
    httpStatus: 400,
    message_sv: 'Inga aktiva anställda finns i företaget.',
    message_no: 'Det finnes ingen aktive ansatte i selskapet.',
    message_en: 'No active employees in the company.',
  },
  SALARY_RUN_LINE_NOT_DRAFT: {
    httpStatus: 400,
    message_sv: 'Lönebeskedets rader kan bara redigeras medan lönekörningen är ett utkast.',
    message_no: 'Lønnsslippens linjer kan bare redigeres mens lønnskjøringen er et utkast.',
    message_en: 'Payslip lines can only be edited while the salary run is a draft.',
  },
  SALARY_RUN_EMPLOYEE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Anställd finns inte i denna lönekörning.',
    message_no: 'Den ansatte finnes ikke i denne lønnskjøringen.',
    message_en: 'Employee is not part of this salary run.',
  },
  SALARY_LINE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Lönebeskedsraden kunde inte hittas.',
    message_no: 'Lønnsslipplinjen kunne ikke finnes.',
    message_en: 'Payslip line not found.',
  },
  SALARY_RUN_EMPLOYEE_DUPLICATE: {
    httpStatus: 409,
    message_sv: 'Den anställda finns redan i lönekörningen.',
    message_no: 'Den ansatte finnes allerede i lønnskjøringen.',
    message_en: 'Employee is already part of this salary run.',
  },
  SALARY_RUN_EMPLOYEES_NOT_DRAFT: {
    httpStatus: 400,
    message_sv: 'Lönekörningen måste vara ett utkast för att ändra anställda eller månadens lön.',
    message_no: 'Lønnskjøringen må være et utkast for å endre ansatte eller månedens lønn.',
    message_en: 'The salary run must be a draft to change its employees or this month\'s salary.',
  },
  ABSENCE_RANGE_TOO_LARGE: {
    httpStatus: 400,
    message_sv: 'Frånvarointervallet är för stort. Max 92 dagar per anrop.',
    message_no: 'Fraværsintervallet er for stort. Maks 92 dager per kall.',
    message_en: 'Absence range too large. Maximum 92 days per request.',
  },
  ABSENCE_HOURS_CONFLICT: {
    httpStatus: 409,
    message_sv: 'Total frånvarotid för dagen överstiger 24 timmar.',
    message_no: 'Samlet fraværstid for dagen overstiger 24 timer.',
    message_en: 'Total absence hours for the day exceed 24 hours.',
  },
  OPENING_BALANCES_LOCKED: {
    httpStatus: 409,
    message_sv: 'Ingående saldon är låsta: den anställda har en bokförd lönekörning.',
    message_no: 'Inngående saldoer er låst: den ansatte har en bokført lønnskjøring.',
    message_en: 'Opening balances are locked: the employee has a booked salary run.',
  },
  VACATION_YEAR_NOT_ENDED: {
    httpStatus: 400,
    message_sv: 'Semesteråret kan inte stängas innan det har tagit slut.',
    message_no: 'Ferieåret kan ikke stenges før det er over.',
    message_en: 'The vacation year cannot be closed before it has ended.',
  },
  VACATION_YEAR_ALREADY_CLOSED: {
    httpStatus: 409,
    message_sv: 'Semesteråret är redan stängt.',
    message_no: 'Ferieåret er allerede stengt.',
    message_en: 'The vacation year is already closed.',
  },
  VACATION_CLOSE_ADJUSTMENT_FAILED: {
    httpStatus: 500,
    message_sv: 'Semestersaldon rullades men justeringsverifikationen kunde inte bokföras. Bokför justeringen manuellt från rapporten.',
    message_no: 'Semestersaldoene ble rullert, men justeringsbilaget kunne ikke bokføres. Bokfør justeringen manuelt fra rapporten.',
    message_en: 'Vacation balances rolled but the adjustment entry failed to post. Book the adjustment manually from the report.',
  },
  VACATION_BALANCE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Inget semestersaldo finns för den anställda ännu.',
    message_no: 'Det finnes ingen semestersaldo for den ansatte ennå.',
    message_en: 'No vacation balance exists for the employee yet.',
  },
  SALARY_RUN_TAX_TABLE_MISSING: {
    httpStatus: 400,
    message_sv: 'Skattetabellen saknas för perioden. Importera skattetabellen först.',
    message_no: 'Skatetabellen mangler for perioden. Importer skattetabellen først.',
    message_en: 'Tax table is missing for the period.',
  },
  SALARY_RUN_PERIOD_LOCKED: {
    httpStatus: 400,
    message_sv: 'Lönekörningen kan inte göras i en låst period.',
    message_no: 'Lønnskjøringen kan ikke gjøres i en låst periode.',
    message_en: 'Salary run cannot be processed in a locked period.',
  },
  SALARY_RUN_NOT_CALCULATED: {
    httpStatus: 400,
    message_sv: 'Lönekörningen måste beräknas innan bokföring.',
    message_no: 'Lønnskjøringen må beregnes før bokføring.',
    message_en: 'Salary run must be calculated before booking.',
  },
  SALARY_RUN_CREATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Lönekörningen kunde inte skapas.',
    message_no: 'Lønnskjøringen kunne ikke opprettes.',
    message_en: 'Failed to create salary run.',
  },
  SALARY_RUN_CALCULATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Lönekörningen kunde inte beräknas.',
    message_no: 'Lønnskjøringen kunne ikke beregnes.',
    message_en: 'Failed to calculate salary run.',
  },
  SALARY_RUN_BOOK_FAILED: {
    httpStatus: 500,
    message_sv: 'Lönekörningen kunde inte bokföras.',
    message_no: 'Lønnskjøringen kunne ikke bokføres.',
    message_en: 'Failed to book salary run.',
  },
  AGI_NO_SALARY_RUN: {
    httpStatus: 400,
    message_sv: 'Det finns ingen lönekörning för perioden.',
    message_no: 'Det finnes ingen lønnskjøring for perioden.',
    message_en: 'No salary run exists for the period.',
  },
  AGI_FSKATT_VERIFICATION_FAILED: {
    httpStatus: 400,
    message_sv: 'F-skattekontrollen misslyckades. Kontrollera leverantörens F-skatt.',
    message_no: 'F-skatt-kontrollen mislyktes. Kontroller leverandørens F-skatt.',
    message_en: 'F-skatt verification failed.',
  },
  AGI_GENERATION_FAILED: {
    httpStatus: 500,
    message_sv: 'AGI-deklarationen kunde inte genereras.',
    message_no: 'a-meldingen kunne ikke genereres.',
    message_en: 'Failed to generate AGI declaration.',
  },
  // Phase 5 PR-1: v1 REST surface error codes.
  EMPLOYEE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Den anställda kunde inte hittas.',
    message_no: 'Den ansatte kunne ikke finnes.',
    message_en: 'Employee not found.',
  },
  EMPLOYEE_DUPLICATE_PERSONNUMMER: {
    httpStatus: 409,
    message_sv: 'En anställd med samma personnummer finns redan.',
    message_no: 'Det finnes allerede en ansatt med samme fødselsnummer.',
    message_en: 'An employee with that personnummer already exists.',
  },
  // A production deployment without PERSONNUMMER_ENCRYPTION_KEY: every
  // employee create (and every decrypt-on-read) throws before touching the
  // database. Deliberately not INTERNAL_ERROR: it is a configuration gap, not
  // transient, and retrying never helps, so the user should hear "contact
  // support" rather than "try again later". 503 like
  // INVOICE_SEND_EMAIL_NOT_CONFIGURED: the service is unavailable until an
  // operator sets the variable. #1996
  PERSONNUMMER_ENCRYPTION_NOT_CONFIGURED: {
    httpStatus: 503,
    message_sv:
      'Lönemodulen är inte konfigurerad: krypteringsnyckeln för personnummer (PERSONNUMMER_ENCRYPTION_KEY) saknas i driftmiljön. Kontakta supporten.',
    message_no: 'Lønnsmodulen er ikke konfigurert: krypteringsnøkkelen for fødselsnummer (PERSONNUMMER_ENCRYPTION_KEY) mangler i driftsmiljøet. Kontakt supporten.',
    message_en:
      'Payroll is not configured: the personal-number encryption key (PERSONNUMMER_ENCRYPTION_KEY) is missing from the deployment environment. Contact support.',
    remediation: {
      description:
        'Set PERSONNUMMER_ENCRYPTION_KEY in the deployment environment and redeploy. Retrying the request without it will fail identically.',
    },
  },
  SALARY_RUN_DUPLICATE_PERIOD: {
    httpStatus: 409,
    message_sv: 'En lönekörning för perioden finns redan.',
    message_no: 'Det finnes allerede en lønnskjøring for perioden.',
    message_en: 'A salary run for that period already exists.',
  },
  SALARY_RUN_PATCH_NOT_DRAFT: {
    httpStatus: 400,
    message_sv: 'Endast utkast (draft) kan uppdateras.',
    message_no: 'Bare utkast (draft) kan oppdateres.',
    message_en: 'Only draft salary runs can be patched.',
  },
  // Kontantprincipen guard: AGI derives its redovisningsperiod from the run's
  // period_year/period_month while the verifikat books on payment_date, so a
  // payment date outside the period month would declare the salary in the
  // wrong period (SFL 26 kap). For a payment that truly lands in another
  // month, the run itself belongs in that period.
  SALARY_RUN_PAYMENT_DATE_OUTSIDE_PERIOD: {
    httpStatus: 400,
    // No longer raised (#2191): the AGI period follows payment_date, so a
    // payout in another month is legal. Kept so clients mapping the code
    // keep compiling.
    message_sv: 'Utbetalningsdagen måste ligga i lönekörningens period.',
    message_no: 'Utbetalingsdagen må være innenfor lønnskjøringens periode.',
    message_en: 'The payment date must fall within the salary run\'s period month.',
  },
  SALARY_RUN_DELETE_NOT_DRAFT: {
    httpStatus: 400,
    message_sv: 'Endast utkast (draft) kan raderas.',
    message_no: 'Bare utkast (draft) kan slettes.',
    message_en: 'Only draft salary runs can be deleted.',
  },
  SALARY_RUN_CALCULATE_NOT_DRAFT: {
    httpStatus: 400,
    message_sv: 'Lönekörningen måste vara i status draft för beräkning.',
    message_no: 'Lønnskjøringen må være i status draft for beregning.',
    message_en: 'Salary run must be in draft status to calculate.',
  },
  SALARY_RUN_APPROVE_NOT_REVIEW: {
    httpStatus: 400,
    message_sv: 'Lönekörningen måste vara i status review för godkännande.',
    message_no: 'Lønnskjøringen må være i status review for godkjenning.',
    message_en: 'Salary run must be in review status to approve.',
  },
  SALARY_RUN_APPROVE_VALIDATION_FAILED: {
    httpStatus: 400,
    message_sv: 'Valideringsfel: korrigera innan godkännande.',
    message_no: 'Valideringsfeil: rett opp før godkjenning.',
    message_en: 'Validation failed: fix issues before approving.',
  },
  SALARY_RUN_MARK_PAID_NOT_APPROVED: {
    httpStatus: 400,
    message_sv: 'Lönekörningen måste vara godkänd för att markeras som betald.',
    message_no: 'Lønnskjøringen må være godkjent for å markeres som betalt.',
    message_en: 'Salary run must be approved before it can be marked paid.',
  },
  SALARY_RUN_BOOK_NOT_PAID: {
    httpStatus: 400,
    message_sv: 'Lönekörningen måste vara markerad som betald för bokföring.',
    message_no: 'Lønnskjøringen må være markert som betalt for bokføring.',
    message_en: 'Salary run must be marked paid before booking.',
  },
  SALARY_RUN_ALREADY_BOOKED: {
    httpStatus: 409,
    message_sv: 'Lönekörningen är redan bokförd.',
    message_no: 'Lønnskjøringen er allerede bokført.',
    message_en: 'Salary run is already booked.',
  },
  SALARY_PAYSLIPS_SEND_INVALID_STATUS: {
    httpStatus: 400,
    message_sv: 'Lönespecifikationer kan bara skickas efter godkännande.',
    message_no: 'Lønnsspesifikasjoner kan bare sendes etter godkjenning.',
    message_en: 'Payslips can only be sent after the salary run is approved.',
  },
  SALARY_PAYSLIPS_NO_EMPLOYEES: {
    httpStatus: 400,
    message_sv: 'Inga anställda i lönekörningen.',
    message_no: 'Ingen ansatte i lønnskjøringen.',
    message_en: 'No employees in the salary run.',
  },
  AGI_GENERATE_NOT_BOOKABLE: {
    httpStatus: 400,
    message_sv: 'AGI kan endast genereras för lönekörningar i status review, approved, paid, booked eller corrected.',
    message_no: 'a-melding kan bare genereres for lønnskjøringer i status review, approved, paid, booked eller corrected.',
    message_en: 'AGI can only be generated for salary runs in review, approved, paid, booked, or corrected status.',
  },
  AGI_PERIOD_CONFLICT: {
    httpStatus: 409,
    message_sv:
      'En annan lönekörning är redan deklarerad för samma redovisningsperiod (utbetalningsmånad). En arbetsgivardeklaration per månad ska omfatta alla utbetalningar den månaden: slå ihop körningarna eller rätta den befintliga deklarationen.',
    message_no: 'En annen lønnskjøring er allerede meldt inn for samme regnskapsperiode (utbetalingsmåned). En a-melding per måned skal omfatte alle utbetalinger den måneden: slå sammen kjøringene eller rett den eksisterende meldingen.',
    message_en:
      'Another salary run is already declared for the same reporting period (payout month). One employer declaration per month must cover every payment made that month: merge the runs or correct the existing declaration.',
  },
  AGI_INCOMPLETE_DATA: {
    httpStatus: 400,
    message_sv: 'AGI-data ofullständig: kontrollera att företaget har organisationsnummer, kontaktnamn, telefon och e-post.',
    message_no: 'a-melding-data er ufullstendig: kontroller at foretaket har organisasjonsnummer, kontaktnavn, telefon og e-post.',
    message_en: 'AGI data is incomplete: verify the company has org number, contact name, phone, and email.',
  },
  COMPANY_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Företaget kunde inte hittas.',
    message_no: 'Selskapet kunne ikke finnes.',
    message_en: 'Company not found.',
  },
  // An API key minted for an account that has not created its first company
  // yet (signup from the MCP OAuth popup, issue #1814). Not a lookup miss:
  // there is nothing to look up until the company exists.
  NO_COMPANY_YET: {
    httpStatus: 409,
    message_sv: 'Kontot har inget företag ännu. Skapa företaget i appen och försök igen.',
    message_no: 'Kontoen har ikke noe selskap ennå. Opprett selskapet i appen og prøv igjen.',
    message_en: 'This account has no company yet. Create the company in the web app, then retry; the connection picks it up automatically.',
    remediation: {
      description:
        'Ask the user to finish company setup in the Accounted web app (/onboarding). No re-authentication is needed afterwards: the same connection binds to the new company on its next call.',
      tool: 'gnubok_list_companies',
    },
  },
  // Phase 5 PR-1 carry-over: distinct error code for the salary-run DELETE
  // FK-null guard so an operator seeing this in logs knows a journal entry
  // is at risk, not just a status race.
  SALARY_RUN_DELETE_HAS_JOURNAL_ENTRY: {
    httpStatus: 400,
    message_sv: 'Lönekörningen är kopplad till en verifikation och kan inte raderas (BFL 5 kap räkenskapsinformation).',
    message_no: 'Lønnskjøringen er knyttet til et bilag og kan ikke slettes (BFL 5 kap regnskapsinformasjon).',
    message_en: 'Salary run is linked to a journal entry and cannot be deleted (BFL 5 kap räkenskapsinformation).',
  },
  // Utlägg repaid with the salary (#2331).
  SALARY_RUN_NO_OPEN_EXPENSE_CLAIMS: {
    httpStatus: 404,
    message_sv: 'Den anställda har inga öppna utlägg att lägga till.',
    message_no: 'Den ansatte har ingen åpne utlegg å legge til.',
    message_en: 'The employee has no open expense claims to add.',
  },
  EXPENSE_CLAIM_ALREADY_ON_PAYSLIP: {
    httpStatus: 409,
    message_sv: 'Utlägget ligger redan på ett lönebesked.',
    message_no: 'Utlegget ligger allerede på en lønnsslipp.',
    message_en: 'The expense claim is already on a payslip.',
  },
  SALARY_RUN_EXPENSE_CLAIM_NOT_OPEN: {
    httpStatus: 409,
    message_sv: 'Ett utlägg på lönebeskedet är inte längre öppet (utbetalt eller borttaget). Ta bort raden och beräkna om innan bokföring.',
    message_no: 'Et utlegg på lønnsslippen er ikke lenger åpent (utbetalt eller fjernet). Fjern linjen og beregn på nytt før bokføring.',
    message_en: 'An expense claim on the payslip is no longer open (paid or removed). Remove the line and recalculate before booking.',
  },
  // Phase 5 PR-3: additional import error codes.
  SIE_IMPORT_DUPLICATE: {
    httpStatus: 409,
    message_sv: 'Den här SIE-filen har redan importerats.',
    message_no: 'Denne SIE-filen er allerede importert.',
    message_en: 'This SIE file has already been imported.',
  },
  BANK_IMPORT_FAILED: {
    httpStatus: 500,
    message_sv: 'Bankfilsimporten misslyckades.',
    message_no: 'Importen av bankfilen mislyktes.',
    message_en: 'Bank file import failed.',
  },
  BANK_FILE_FORMAT_UNKNOWN: {
    httpStatus: 400,
    message_sv: 'Bankfilens format kunde inte identifieras.',
    message_no: 'Formatet på bankfilen kunne ikke identifiseres.',
    message_en: 'Bank file format could not be identified.',
  },
  BANK_IMPORT_DUPLICATE_OTHER_COMPANY: {
    httpStatus: 409,
    message_sv: 'Den här filen har redan importerats för ett annat företag av samma användare.',
    message_no: 'Denne filen er allerede importert for et annet selskap av samme bruker.',
    message_en: 'This file has already been imported into another company by this user.',
  },
}

const COMPANY: Record<string, StructuredErrorEntry> = {
  COMPANY_CREATE_DUPLICATE_ORG_NUMBER: {
    httpStatus: 409,
    message_sv: 'Ett företag med samma organisationsnummer finns redan.',
    message_no: 'Det finnes allerede et selskap med samme organisasjonsnummer.',
    message_en: 'A company with that organisation number already exists.',
  },
  COMPANY_CREATE_BAS_SEED_FAILED: {
    httpStatus: 500,
    message_sv: 'Kontoplanen kunde inte skapas. Försök igen.',
    message_no: 'Kontoplanen kunne ikke opprettes. Prøv igjen.',
    message_en: 'Failed to seed the chart of accounts.',
  },
  COMPANY_CREATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Företaget kunde inte skapas.',
    message_no: 'Selskapet kunne ikke opprettes.',
    message_en: 'Failed to create company.',
  },
  COMPANY_RESET_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Företaget kunde inte hittas.',
    message_no: 'Selskapet kunne ikke finnes.',
    message_en: 'Company not found.',
  },
  COMPANY_RESET_FORBIDDEN: {
    httpStatus: 403,
    message_sv: 'Endast företagets ägare kan starta om en migrering.',
    message_no: 'Bare selskapets eier kan starte en migrering på nytt.',
    message_en: 'Only the company owner can reset a migration.',
  },
  COMPANY_RESET_INELIGIBLE: {
    httpStatus: 409,
    message_sv: 'Företaget kan inte återställas med självservice. Kontakta supporten för en individuell bedömning.',
    message_no: 'Selskapet kan ikke tilbakestilles med selvbetjening. Kontakt support for en individuell vurdering.',
    message_en: 'The company is not eligible for a self-service reset. Contact support for an individual review.',
  },
  COMPANY_RESET_CONFIRMATION_MISMATCH: {
    httpStatus: 400,
    message_sv: 'Företagsnamnet stämmer inte överens.',
    message_no: 'Selskapsnavnet stemmer ikke overens.',
    message_en: 'The company name does not match.',
  },
  COMPANY_RESET_REASON_INVALID: {
    httpStatus: 400,
    message_sv: 'Beskriv varför migreringen behöver göras om med 20 till 1 000 tecken.',
    message_no: 'Beskriv hvorfor migreringen må gjøres på nytt, med 20 til 1 000 tegn.',
    message_en: 'Explain why the migration must be redone using 20 to 1,000 characters.',
  },
  COMPANY_RESET_CONFIRMATION_REQUIRED: {
    httpStatus: 400,
    message_sv: 'Alla säkerhetsbekräftelser krävs.',
    message_no: 'Alle sikkerhetsbekreftelser er påkrevd.',
    message_en: 'All safety confirmations are required.',
  },
  COMPANY_RESET_FAILED: {
    httpStatus: 500,
    message_sv: 'Migreringen kunde inte startas om. Inga ändringar har sparats.',
    message_no: 'Migreringen kunne ikke startes på nytt. Ingen endringer er lagret.',
    message_en: 'The migration reset failed. No changes were saved.',
  },
}

const API_KEY: Record<string, StructuredErrorEntry> = {
  API_KEY_SCOPE_INVALID: {
    httpStatus: 400,
    message_sv: 'En eller flera scopes är ogiltiga.',
    message_no: 'En eller flere scopes er ugyldige.',
    message_en: 'One or more requested scopes are invalid.',
  },
  API_KEY_QUOTA_EXCEEDED: {
    httpStatus: 429,
    message_sv: 'Du har nått maxgränsen för antal API-nycklar.',
    message_no: 'Du har nått maksgrensen for antall API-nøkler.',
    message_en: 'API key quota exceeded.',
  },
  API_KEY_CREATE_FAILED: {
    httpStatus: 500,
    message_sv: 'API-nyckeln kunde inte skapas.',
    message_no: 'API-nøkkelen kunne ikke opprettes.',
    message_en: 'Failed to create API key.',
  },
  API_KEY_REVOKE_FAILED: {
    httpStatus: 500,
    message_sv: 'API-nyckeln kunde inte återkallas.',
    message_no: 'API-nøkkelen kunne ikke tilbakekalles.',
    message_en: 'Failed to revoke API key.',
  },
  API_KEY_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'API-nyckeln kunde inte hittas.',
    message_no: 'API-nøkkelen kunne ikke finnes.',
    message_en: 'API key not found.',
  },
  API_KEY_SOD_CONFLICT: {
    httpStatus: 409,
    message_sv:
      'Nyckeln kombinerar ett skriv-scope som stagar bokföring med pending_operations:approve. Då kan en automatiserad agent både skapa och godkänna verifikationer utan mänsklig granskning (ansvarsfördelning, ISO 27001 A.5.3 / BFNAR 2013:2). Bekräfta att du förstår risken för att skapa nyckeln ändå.',
    message_no: 'Nøkkelen kombinerer et skrive-scope som kladdefører bilag med pending_operations:approve. Da kan en automatisert agent både opprette og godkjenne bilag uten menneskelig gjennomgang (ansvarsfordeling, ISO 27001 A.5.3 / BFNAR 2013:2). Bekreft at du forstår risikoen for å opprette nøkkelen likevel.',
    message_en:
      'This key combines a staging write scope with pending_operations:approve, letting an automated agent both stage and approve postings with no human in the loop (segregation of duties, ISO 27001 A.5.3 / BFNAR 2013:2).',
    remediation: {
      description:
        'Inform the user of the segregation-of-duties risk, then re-POST the same scopes with acknowledge_sod: true to create the key anyway.',
    },
  },
}

// ─────────────────────────────────────────────────────────────────
// Provider connection / external HTTP codes
// ─────────────────────────────────────────────────────────────────

const PROVIDER: Record<string, StructuredErrorEntry> = {
  PROVIDER_AUTH_EXPIRED: {
    httpStatus: 401,
    message_sv: 'Anslutningen till leverantören har gått ut. Återanslut för att fortsätta.',
    message_no: 'Tilkoblingen til leverandøren er utløpt. Koble til på nytt for å fortsette.',
    message_en: 'Provider authentication expired or refresh failed.',
  },
  // The provider refused ONE register while the same access token keeps
  // answering for the rest (Fortnox: "Saknar behörighet för
  // leverantörsregister.", code 2003275). Never "återanslut" here: the
  // reconnect re-mints the same grant and meets the same 403.
  PROVIDER_RESOURCE_FORBIDDEN: {
    httpStatus: 403,
    message_sv:
      'Leverantören nekade åtkomst till en del av uppgifterna, men anslutningen fungerar. Att återansluta hjälper inte: kontrollera behörigheterna för det registret hos leverantören (i Fortnox användarens rättigheter och licens, i Bokio rättigheterna på integrationstoken) och försök igen.',
    message_no: 'Leverandøren nektet tilgang til en del av opplysningene, men tilkoblingen fungerer. Å koble til på nytt hjelper ikke: kontroller tilgangene for det registeret hos leverandøren (i Fortnox brukerens rettigheter og lisens, i Bokio rettighetene på integrasjonstokenet) og prøv igjen.',
    message_en:
      'The provider refused access to part of the data, but the connection itself works. Reconnecting will not help: check that register\'s permissions with the provider (in Fortnox the user rights and licence, in Bokio the integration token rights) and try again.',
  },
  PROVIDER_LICENSE_MISSING: {
    httpStatus: 403,
    message_sv:
      'Fortnox nekade anslutningen eftersom integrationslicensen inte är aktiv. Aktivera tilläggstjänsten "Fortnox Integration" i ditt Fortnox-konto (Inställningar → Tilläggstjänster) och återanslut sedan. Du kan även importera via SIE-fil under tiden.',
    message_no: 'Fortnox nektet tilkoblingen fordi integrasjonslisensen ikke er aktiv. Aktiver tilleggstjenesten "Fortnox Integration" i Fortnox-kontoen din (Innstillinger → Tilleggstjenester) og koble til på nytt etterpå. Du kan også importere via SIE-fil i mellomtiden.',
    message_en:
      'Fortnox refused the connection because the integration license is not active. Activate the "Fortnox Integration" add-on in your Fortnox account, then reconnect. You can also import via SIE file in the meantime.',
  },
  PROVIDER_API_MODULE_INACTIVE: {
    httpStatus: 403,
    message_sv:
      'Visma nekade åtkomst eftersom API-modulen inte är aktiverad för företaget ("No access to module: api_standard"). Aktivera API:et i Visma/Spiris under Inställningar, Appar och tillägg. På de mindre abonnemangen är API:et ett tillägg (Integration) som kostar extra. Kontrollera också att inget standardföretag är valt i menyn uppe till höger i Visma, det kan göra att inloggningen hamnar på ett företag utan giltig licens. Försök sedan igen. Du kan även importera via SIE-fil under tiden.',
    message_no: 'Visma nektet tilgang fordi API-modulen ikke er aktivert for selskapet ("No access to module: api_standard"). Aktiver API-et i Visma/Spiris under Innstillinger, Apper og tillegg. På de mindre abonnementene er API-et et tillegg (Integration) som koster ekstra. Kontroller også at ingen standardselskap er valgt i menyen øverst til høyre i Visma, det kan gjøre at innloggingen havner på et selskap uten gyldig lisens. Prøv deretter igjen. Du kan også importere via SIE-fil i mellomtiden.',
    message_en:
      'Visma refused access because the API module is not activated for the company ("No access to module: api_standard"). Activate the API in Visma/Spiris under Settings, Apps and extensions (on smaller plans the API is a paid add-on called Integration), and make sure no default company is selected in the top-right menu. Then try again. You can also import via SIE file in the meantime.',
  },
  PROVIDER_RATE_LIMITED: {
    httpStatus: 429,
    message_sv:
      'Leverantören begränsar antalet anrop just nu. Vänta en stund och försök igen.',
    message_no: 'Leverandøren begrenser antall kall akkurat nå. Vent en stund og prøv igjen.',
    message_en: 'Provider rate limit exceeded.',
  },
  PROVIDER_UNREACHABLE: {
    httpStatus: 502,
    message_sv: 'Leverantörens tjänst är inte tillgänglig just nu. Försök igen om en stund.',
    message_no: 'Leverandørens tjeneste er ikke tilgjengelig akkurat nå. Prøv igjen om en stund.',
    message_en: 'Provider service is unreachable (network/DNS error).',
  },
  PROVIDER_UPSTREAM_ERROR: {
    httpStatus: 502,
    message_sv: 'Leverantören svarade med ett fel. Försök igen om en stund.',
    message_no: 'Leverandøren svarte med en feil. Prøv igjen om en stund.',
    message_en: 'Provider returned an upstream 5xx error.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Link invoice to an existing posted verifikat (no new JE)
// ─────────────────────────────────────────────────────────────────

const LINK_INVOICE_VOUCHER: Record<string, StructuredErrorEntry> = {
  LINK_VOUCHER_INVOICE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Fakturan kunde inte hittas.',
    message_no: 'Fakturaen kunne ikke finnes.',
    message_en: 'Invoice not found.',
  },
  LINK_VOUCHER_VOUCHER_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Verifikationen kunde inte hittas.',
    message_no: 'Bilaget kunne ikke finnes.',
    message_en: 'Journal entry not found.',
  },
  LINK_VOUCHER_NOT_POSTED: {
    httpStatus: 409,
    message_sv: 'Verifikationen är inte bokförd. Endast bokförda verifikationer kan länkas som betalning.',
    message_no: 'Bilaget er ikke bokført. Bare bokførte bilag kan lenkes som betaling.',
    message_en: 'Journal entry is not posted. Only posted entries can be linked as a payment.',
  },
  LINK_VOUCHER_NO_AR_CREDIT: {
    httpStatus: 400,
    message_sv:
      'Verifikationen krediterar inte ett kundfordringskonto (151x). Bokföringen behöver först rättas med en stornoverifikation som krediterar 1510, t.ex. via gnubok_correct_entry.',
    message_no: 'Bilaget krediterer ikke en kundefordringskonto (151x). Bokføringen må først rettes med en stornobilag som krediterer 1510, for eksempel via gnubok_correct_entry.',
    message_en:
      'The journal entry does not credit an accounts-receivable account (151x). Correct the booking first via a storno+correction (gnubok_correct_entry) that credits 1510.',
    remediation: {
      description:
        'Use gnubok_correct_entry to storno the existing voucher and re-book the receipt as Dr 1930 / Cr 1510, then link the corrected voucher.',
      tool: 'gnubok_correct_entry',
    },
  },
  LINK_VOUCHER_ALREADY_LINKED: {
    httpStatus: 409,
    message_sv: 'Verifikationen är redan länkad till den här fakturan.',
    message_no: 'Bilaget er allerede lenket til denne fakturaen.',
    message_en: 'This journal entry is already linked to this invoice.',
  },
  LINK_VOUCHER_AMOUNT_EXCEEDS_REMAINING: {
    httpStatus: 400,
    message_sv:
      'Verifikationens kundfordringskreditering är större än fakturans återstående belopp. Verifikationen täcker fler fakturor: välj en annan verifikation eller rätta beloppet först.',
    message_no: 'Bilagets kundefordringskreditering er større enn fakturaens gjenstående beløp. Bilaget dekker flere fakturaer: velg et annet bilag eller rett beløpet først.',
    message_en:
      'The voucher\'s AR credit exceeds the invoice\'s remaining balance. Split the voucher across multiple invoices via gnubok_correct_entry first, or pick a different voucher.',
  },
  LINK_VOUCHER_CURRENCY_MISMATCH: {
    httpStatus: 400,
    message_sv:
      'Verifikationens valuta matchar inte fakturans. Endast verifikationer i fakturans valuta kan länkas.',
    message_no: 'Bilagets valuta samsvarer ikke med fakturaens. Bare bilag i fakturaens valuta kan lenkes.',
    message_en: 'The voucher\'s currency does not match the invoice currency.',
  },
  LINK_VOUCHER_INVOICE_FULLY_PAID: {
    httpStatus: 409,
    message_sv: 'Fakturan har redan slutbetalats. Inget mer behöver länkas.',
    message_no: 'Fakturaen er allerede sluttbetalt. Ingenting mer trenger å kobles.',
    message_en: 'Invoice is already fully paid.',
  },
  LINK_VOUCHER_DB_ERROR: {
    httpStatus: 500,
    message_sv: 'Databasfel under länkning. Försök igen.',
    message_no: 'Databasefeil under koblingen. Prøv igjen.',
    message_en: 'Database error while linking the voucher. Please retry.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Link SUPPLIER invoice to an existing posted verifikat (no new JE)
// ─────────────────────────────────────────────────────────────────

const LINK_SI_VOUCHER: Record<string, StructuredErrorEntry> = {
  LINK_SI_VOUCHER_INVOICE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Leverantörsfakturan kunde inte hittas.',
    message_no: 'Leverandørfakturaen kunne ikke finnes.',
    message_en: 'Supplier invoice not found.',
  },
  LINK_SI_VOUCHER_VOUCHER_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Verifikationen kunde inte hittas.',
    message_no: 'Bilaget kunne ikke finnes.',
    message_en: 'Journal entry not found.',
  },
  LINK_SI_VOUCHER_NOT_POSTED: {
    httpStatus: 409,
    message_sv:
      'Verifikationen är inte bokförd. Endast bokförda verifikationer kan länkas som betalning.',
    message_no: 'Bilaget er ikke bokført. Bare bokførte bilag kan kobles som betaling.',
    message_en: 'Journal entry is not posted. Only posted entries can be linked as a payment.',
  },
  LINK_SI_VOUCHER_NO_AP_DEBIT: {
    httpStatus: 400,
    message_sv:
      'Verifikationen debiterar inget leverantörsskuldskonto (244x). Rätta bokföringen först med en stornoverifikation som debiterar t.ex. 2440 (SEK) eller 2441 (utländsk valuta), via gnubok_correct_entry.',
    message_no: 'Bilaget debiterer ingen leverandørgjeldskonto (244x). Rette bokføringen først med en stornobilag som debiterer for eksempel 2440 (SEK) eller 2441 (utenlandsk valuta), via gnubok_correct_entry.',
    message_en:
      'The journal entry does not debit any accounts-payable account in the 244x range (e.g. 2440 SEK, 2441 foreign currency). Correct the booking first via a storno+correction (gnubok_correct_entry).',
    remediation: {
      description:
        'Use gnubok_correct_entry to storno the existing voucher and re-book the payment as Dr 244x / Cr 1930, then link the corrected voucher.',
      tool: 'gnubok_correct_entry',
    },
  },
  LINK_SI_VOUCHER_ALREADY_LINKED: {
    httpStatus: 409,
    message_sv: 'Verifikationen är redan länkad till den här leverantörsfakturan.',
    message_no: 'Bilaget er allerede koblet til denne leverandørfakturaen.',
    message_en: 'This journal entry is already linked to this supplier invoice.',
  },
  LINK_SI_VOUCHER_AMOUNT_EXCEEDS_REMAINING: {
    httpStatus: 400,
    message_sv:
      'Verifikationens leverantörsskuldsdebitering är större än leverantörsfakturans återstående belopp. Verifikationen täcker fler fakturor: välj en annan verifikation eller rätta beloppet först.',
    message_no: 'Bilagets debitering av leverandørgjeld er større enn leverandørfakturaens gjenstående beløp. Bilaget dekker flere fakturaer: velg et annet bilag eller rett beløpet først.',
    message_en:
      'The voucher\'s AP debit exceeds the supplier invoice\'s remaining balance. Split the voucher across multiple supplier invoices via gnubok_correct_entry first, or pick a different voucher.',
  },
  LINK_SI_VOUCHER_CURRENCY_MISMATCH: {
    httpStatus: 400,
    message_sv:
      'Verifikationens valuta matchar inte leverantörsfakturans. Endast verifikationer i fakturans valuta kan länkas.',
    message_no: 'Bilagets valuta samsvarer ikke med leverandørfakturaens. Bare bilag i fakturaens valuta kan kobles.',
    message_en: 'The voucher\'s currency does not match the supplier invoice currency.',
  },
  LINK_SI_VOUCHER_INVOICE_FULLY_PAID: {
    httpStatus: 409,
    message_sv: 'Leverantörsfakturan har redan slutbetalats. Inget mer behöver länkas.',
    message_no: 'Leverandørfakturaen er allerede sluttbetalt. Ingenting mer trenger å kobles.',
    message_en: 'Supplier invoice is already fully paid.',
  },
  LINK_SI_VOUCHER_DB_ERROR: {
    httpStatus: 500,
    message_sv: 'Databasfel under länkning. Försök igen.',
    message_no: 'Databasefeil under koblingen. Prøv igjen.',
    message_en: 'Database error while linking the voucher. Please retry.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Batch allocation (match_batch_allocate RPC)
// ─────────────────────────────────────────────────────────────────

const MATCH_BATCH: Record<string, StructuredErrorEntry> = {
  BATCH_TX_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Transaktionen kunde inte hittas.',
    message_no: 'Transaksjonen kunne ikke finnes.',
    message_en: 'Transaction not found.',
  },
  BATCH_UNAUTHORIZED: {
    httpStatus: 403,
    message_sv: 'Du har inte behörighet att fördela transaktioner för det här företaget.',
    message_no: 'Du har ikke tilgang til å fordele transaksjoner for dette selskapet.',
    message_en: 'You are not authorized to allocate transactions for this company.',
  },
  BATCH_TX_ALREADY_BOOKED: {
    httpStatus: 409,
    message_sv:
      'Transaktionen är redan bokförd. Avbokföra först (storno) innan du fördelar den på flera fakturor.',
    message_no: 'Transaksjonen er allerede bokført. Avbokfør først (storno) før du fordeler den på flere fakturaer.',
    message_en:
      'Transaction is already booked. Reverse the existing journal entry before re-allocating.',
  },
  BATCH_TX_POSSIBLE_DUPLICATE: {
    httpStatus: 409,
    message_sv:
      'Transaktionen ser redan ut att vara bokförd: en eller flera verifikationer utan bankkoppling summerar exakt till beloppet. Koppla transaktionen till dem i stället, eller bokför ändå om de inte hör ihop.',
    message_no: 'Transaksjonen ser allerede ut til å være bokført: ett eller flere bilag uten bankkobling summerer nøyaktig til beløpet. Koble transaksjonen til dem i stedet, eller bokfør likevel hvis de ikke hører sammen.',
    message_en:
      'The transaction already looks booked: one or more posted vouchers with no bank link add up exactly to its amount. Link the transaction to them instead, or pass force=true with expected_journal_entry_ids to book anyway.',
    retryable: false,
    remediation: {
      description:
        'Link the bank row to the vouchers the message names instead of booking it again: gnubok_reconcile_match with account_key "bank:<cash_account_id>" and one pair { external_ids: [transaction_id], journal_entry_ids: [...], allocations }. Only if the row is a genuinely separate affärshändelse, call again with force=true and expected_journal_entry_ids set to exactly the ids the refusal listed.',
      tool: 'gnubok_reconcile_match',
    },
  },
  // force=true reached a door whose already-explained check could not run:
  // an override that cannot be re-verified against the current voucher set
  // is refused, never waved through. Transient by nature (a ledger scan that
  // timed out), hence retryable; a staged operation refused this way is
  // auto-rejected and has to be staged again.
  BATCH_TX_EXPLAINED_CHECK_FAILED: {
    httpStatus: 409,
    message_sv:
      'Dubblettkontrollen kunde inte köras, så "bokför ändå" avvisades: ett åsidosättande som inte kan verifieras igen bokförs aldrig. Försök igen.',
    message_no: 'Duplikatkontrollen kunne ikke kjøres, så "bokfør likevel" ble avvist: en overstyring som ikke kan verifiseres på nytt blir aldri bokført. Prøv igjen.',
    message_en:
      'The already-explained check could not run, so force=true was refused: an override that cannot be re-verified against the current vouchers is never honoured. Retry the request.',
    retryable: true,
    remediation: {
      description:
        'Retry after a short backoff. A staged operation refused this way is auto-rejected: stage it again with the same force + expected_journal_entry_ids, or link the row to the vouchers with gnubok_reconcile_match instead.',
    },
  },
  BATCH_TX_ZERO_AMOUNT: {
    httpStatus: 400,
    message_sv: 'Transaktioner med beloppet 0 kan inte bokföras.',
    message_no: 'Transaksjoner med beløp 0 kan ikke bokføres.',
    message_en: 'Zero-amount transactions cannot be allocated.',
  },
  BATCH_NO_ALLOCATIONS: {
    httpStatus: 400,
    message_sv: 'Minst en fördelning krävs.',
    message_no: 'Minst én fordeling kreves.',
    message_en: 'At least one allocation is required.',
  },
  BATCH_INVALID_AMOUNT: {
    httpStatus: 400,
    message_sv: 'Fördelningens belopp måste vara positivt.',
    message_no: 'Fordelingens beløp må være positivt.',
    message_en: 'Allocation amount must be positive.',
  },
  BATCH_DUPLICATE_ALLOCATION: {
    httpStatus: 400,
    message_sv:
      'Samma faktura förekommer två gånger i fördelningen. Slå ihop beloppen eller ta bort dubbletten.',
    message_no: 'Samme faktura forekommer to ganger i fordelingen. Slå sammen beløpene eller fjern duplikatet.',
    message_en:
      'The same invoice appears twice in the allocations. Merge the amounts or remove the duplicate.',
  },
  BATCH_INVALID_KIND: {
    httpStatus: 400,
    message_sv:
      'Okänd typ av fördelning. Endast customer_invoice och supplier_invoice stöds.',
    message_no: 'Ukjent type fordeling. Kun customer_invoice og supplier_invoice støttes.',
    message_en:
      'Unknown allocation kind. Only customer_invoice and supplier_invoice are supported.',
  },
  BATCH_INVOICE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'En av fakturorna i fördelningen kunde inte hittas.',
    message_no: 'En av fakturaene i fordelingen ble ikke funnet.',
    message_en: 'One of the invoices in the allocation could not be found.',
  },
  BATCH_INVOICE_NOT_OPEN: {
    httpStatus: 409,
    message_sv: 'En av fakturorna är inte i ett obetalt läge och kan inte ta emot betalning.',
    message_no: 'En av fakturaene er ikke i en ubetalt tilstand og kan ikke ta imot betaling.',
    message_en: 'One of the invoices is not in an open state.',
  },
  BATCH_SUPPLIER_INVOICE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'En av leverantörsfakturorna i fördelningen kunde inte hittas.',
    message_no: 'En av leverandørfakturaene i fordelingen ble ikke funnet.',
    message_en: 'One of the supplier invoices in the allocation could not be found.',
  },
  BATCH_SUPPLIER_INVOICE_NOT_OPEN: {
    httpStatus: 409,
    message_sv:
      'En av leverantörsfakturorna är inte i ett obetalt läge och kan inte ta emot betalning.',
    message_no: 'En av leverandørfakturaene er ikke i en ubetalt tilstand og kan ikke ta imot betaling.',
    message_en: 'One of the supplier invoices is not in an open state.',
  },
  BATCH_OVERSHOOT: {
    httpStatus: 400,
    message_sv:
      'En av fördelningarna överskrider fakturans återstående belopp. Sänk beloppet eller fördela överskottet på fler fakturor.',
    message_no: 'En av fordelingene overskrider fakturaens gjenstående beløp. Senk beløpet eller fordel overskuddet på flere fakturaer.',
    message_en:
      'One allocation exceeds the invoice remaining amount. Lower it or split the excess across additional invoices.',
  },
  BATCH_AMOUNT_EXCEEDS_TX: {
    httpStatus: 400,
    message_sv:
      'Summan av fördelningarna är större än transaktionens belopp.',
    message_no: 'Summen av fordelingene er større enn transaksjonens beløp.',
    message_en: 'Sum of allocations exceeds the transaction amount.',
  },
  BATCH_AMOUNT_BELOW_TX: {
    httpStatus: 400,
    message_sv:
      'Hela transaktionen måste fördelas. Lägg till fler fakturor eller höj något belopp så att summan motsvarar bankhändelsen.',
    message_no: 'Hele transaksjonen må fordeles. Legg til flere fakturaer eller øk et beløp slik at summen tilsvarer bankhendelsen.',
    message_en:
      'The full transaction amount must be allocated. Add more invoices or raise an amount so the sum matches the bank movement.',
  },
  BATCH_MIXED_KINDS_UNSUPPORTED: {
    httpStatus: 400,
    message_sv:
      'En transaktion kan inte fördelas på både kund- och leverantörsfakturor i samma verifikat. Skapa två separata fördelningar.',
    message_no: 'En transaksjon kan ikke fordeles på både kunde- og leverandørfakturaer i samme bilag. Opprett to separate fordelinger.',
    message_en:
      'A single transaction cannot allocate to both customer and supplier invoices in one batch.',
  },
  BATCH_DIRECTION_MISMATCH: {
    httpStatus: 400,
    message_sv:
      'Transaktionens riktning matchar inte fördelningens typ. Kundfakturor kräver inkommande, leverantörsfakturor utgående.',
    message_no: 'Transaksjonens retning samsvarer ikke med fordelingens type. Kundefakturaer krever innkommende, leverandørfakturaer utgående.',
    message_en:
      'Transaction direction does not match allocation kind: customer invoices require income, supplier invoices require expense.',
  },
  BATCH_CURRENCY_MISMATCH: {
    httpStatus: 400,
    message_sv:
      'Fakturans valuta matchar inte transaktionens. Endast samma valuta stöds i V1.',
    message_no: 'Fakturaens valuta samsvarer ikke med transaksjonens. Kun samme valuta støttes i V1.',
    message_en:
      'Invoice currency does not match the transaction currency. Same-currency only in v1.',
  },
  BATCH_FX_RATE_MISSING: {
    httpStatus: 400,
    message_sv:
      'Fakturan i annan valuta saknar växelkurs. Komplettera fakturans exchange_rate innan du fördelar.',
    message_no: 'Fakturaen i annen valuta mangler valutakurs. Fullfør fakturaens exchange_rate før du fordeler.',
    message_en:
      'The foreign-currency invoice has no exchange rate on file. Complete invoice.exchange_rate before allocating.',
    remediation: {
      description:
        'POST /api/invoices/{id}/refresh-exchange-rate fetches the taxable-event rate from Riksbanken and fills in exchange_rate plus the *_sek columns, then retry the allocation. It refuses with INVOICE_FX_REFRESH_BOOKED once the invoice has a verifikat: from there the correction is a storno or an inline rättelse, never an update behind the posted entry.',
    },
  },
  BATCH_FX_DEVIATION_TOO_LARGE: {
    httpStatus: 400,
    message_sv:
      'Beloppet du angav avviker mer än 10 % från fakturans bokförda värde. Kontrollera att du fyllt i bankbeloppet i transaktionens valuta.',
    message_no: 'Beløpet du oppga avviker mer enn 10 % fra fakturaens bokførte verdi. Kontroller at du har ført inn bankbeløpet i transaksjonens valuta.',
    message_en:
      'The amount you entered deviates more than 10% from the invoice\'s booked SEK value. Check that you entered the bank-side amount in the transaction\'s currency.',
  },
  BATCH_NO_FISCAL_PERIOD: {
    httpStatus: 400,
    message_sv:
      'Det finns ingen öppen räkenskapsperiod för transaktionens datum. Skapa perioden först.',
    message_no: 'Det finnes ingen åpen regnskapsperiode for transaksjonens dato. Opprett perioden først.',
    message_en:
      'No fiscal period exists for the transaction date. Create the period first.',
  },
  BATCH_PERIOD_LOCKED: {
    httpStatus: 409,
    message_sv:
      'Räkenskapsperioden för transaktionens datum är stängd. Öppna perioden eller välj ett annat datum.',
    message_no: 'Regnskapsperioden for transaksjonens dato er stengt. Åpne perioden eller velg en annen dato.',
    message_en:
      'Fiscal period for the transaction date is closed/locked. Open the period or pick a different date.',
  },
  BATCH_RPC_FAILED: {
    httpStatus: 500,
    message_sv: 'Databasfel under fördelning. Försök igen.',
    message_no: 'Databasefeil under fordeling. Prøv igjen.',
    message_en: 'Database error during batch allocation. Please retry.',
    retryable: true,
  },
}

// ─────────────────────────────────────────────────────────────────
// Bulk-book (bulk_book_transactions RPC): N txs → 1 verifikat
// ─────────────────────────────────────────────────────────────────

const BULK_BOOK: Record<string, StructuredErrorEntry> = {
  BULK_BOOK_UNAUTHORIZED: {
    httpStatus: 403,
    message_sv: 'Du har inte behörighet att bokföra transaktioner för det här företaget.',
    message_no: 'Du har ikke tilgang til å bokføre transaksjoner for dette selskapet.',
    message_en: 'You are not authorized to bulk-book transactions for this company.',
  },
  BULK_BOOK_NO_TXS: {
    httpStatus: 400,
    message_sv: 'Inga transaktioner att bokföra.',
    message_no: 'Ingen transaksjoner å bokføre.',
    message_en: 'No transactions to book.',
  },
  BULK_BOOK_TXS_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'En eller flera transaktioner kunde inte hittas i det aktuella företaget.',
    message_no: 'En eller flere transaksjoner ble ikke funnet i det gjeldende selskapet.',
    message_en: 'One or more transactions could not be found in this company.',
  },
  BULK_BOOK_TX_ALREADY_BOOKED: {
    httpStatus: 409,
    message_sv:
      'En av de valda transaktionerna är redan bokförd. Avbokföra (storno) den först eller välj bort den.',
    message_no: 'En av de valgte transaksjonene er allerede bokført. Reverser (storno) den først eller velg den bort.',
    message_en:
      'One of the selected transactions is already booked. Reverse the existing journal entry first or deselect it.',
  },
  BULK_BOOK_TX_ZERO_AMOUNT: {
    httpStatus: 400,
    message_sv: 'Transaktioner med beloppet 0 kan inte ingå i en samlingsbokföring.',
    message_no: 'Transaksjoner med beløp 0 kan ikke inngå i en samlebokføring.',
    message_en: 'Zero-amount transactions cannot be part of a bulk booking.',
  },
  BULK_BOOK_DATE_MISMATCH: {
    httpStatus: 400,
    message_sv:
      'Alla transaktioner i en samlingsbokföring måste ha samma datum: BFL 5 kap 6 § tredje stycket tillåter en gemensam verifikation bara för likartade affärshändelser samma dag. Dela upp bokföringen per dag.',
    message_no: 'Alle transaksjoner i en samlebokføring må ha samme dato: BFL 5 kap 6 § tredje ledd tillater et felles bilag bare for likartede forretningshendelser samme dag. Del opp bokføringen per dag.',
    message_en:
      'All transactions in a bulk booking must share the same date: BFL 5 kap 6 § tredje stycket allows a gemensam verifikation only for likartade affärshändelser on the same day. Split the batch per day.',
    retryable: false,
    remediation: {
      description:
        'This is a legal limit, not a technical one: a monthly samlingsverifikat over several days is not an option under BFL 5 kap 6 §. Group the tx_ids by date and call gnubok_bulk_book_transactions once per date (and per direction).',
      tool: 'gnubok_bulk_book_transactions',
    },
  },
  BULK_BOOK_DIRECTION_MISMATCH: {
    httpStatus: 400,
    message_sv:
      'Alla transaktioner i en samlingsbokföring måste ha samma riktning (alla intäkter eller alla utgifter): BFL 5 kap 6 § tredje stycket tillåter en gemensam verifikation bara för likartade affärshändelser. Dela upp bokföringen per riktning.',
    message_no: 'Alle transaksjoner i en samlebokføring må ha samme retning (alle inntekter eller alle utgifter): BFL 5 kap 6 § tredje ledd tillater et felles bilag bare for likartede forretningshendelser. Del opp bokføringen per retning.',
    message_en:
      'All transactions in a bulk booking must share the same direction (all income or all expense): BFL 5 kap 6 § tredje stycket allows a gemensam verifikation only for likartade affärshändelser. Split the batch per direction.',
    retryable: false,
    remediation: {
      description:
        'This is a legal limit, not a technical one: an inflow and an outflow are not likartade affärshändelser under BFL 5 kap 6 §. Call gnubok_bulk_book_transactions once for the income rows and once for the expense rows (each batch still on one date).',
      tool: 'gnubok_bulk_book_transactions',
    },
  },
  BULK_BOOK_MIXED_CURRENCY: {
    httpStatus: 400,
    message_sv:
      'Samlingsbokföring stödjer endast transaktioner i samma valuta. Välj transaktioner i en valuta åt gången.',
    message_no: 'Samlebokføring støtter bare transaksjoner i samme valuta. Velg transaksjoner i én valuta om gangen.',
    message_en:
      'Bulk booking supports only single-currency batches. Select transactions in one currency at a time.',
  },
  BULK_BOOK_FOREIGN_CURRENCY: {
    httpStatus: 400,
    message_sv:
      'Samlingsbokföring stödjer endast transaktioner i SEK. Bokför transaktioner i utländsk valuta enskilt, så att beloppet räknas om till kronor med rätt växelkurs.',
    message_no: 'Samlebokføring støtter bare transaksjoner i SEK. Bokfør transaksjoner i utenlandsk valuta enkeltvis, slik at beløpet regnes om til kroner med riktig valutakurs.',
    message_en:
      'Bulk booking supports only SEK transactions. Book foreign-currency transactions individually so the amount is converted to kronor at the correct exchange rate.',
  },
  BULK_BOOK_INVALID_PAYLOAD: {
    httpStatus: 400,
    message_sv:
      'Ange antingen existing_journal_entry_id (länkning) eller template_id (skapa ny), inte båda, och inte ingen.',
    message_no: 'Oppgi enten existing_journal_entry_id (kobling) eller template_id (opprett ny), ikke begge, og ikke ingen.',
    message_en:
      'Provide either existing_journal_entry_id (link) or template_id (create new), not both, and not neither.',
  },
  BULK_BOOK_TEMPLATE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Den valda bokföringsmallen kunde inte hittas.',
    message_no: 'Den valgte bokføringsmalen ble ikke funnet.',
    message_en: 'The selected booking template could not be found.',
  },
  BULK_BOOK_VOUCHER_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Verifikationen kunde inte hittas.',
    message_no: 'Bilaget ble ikke funnet.',
    message_en: 'The target journal entry could not be found.',
  },
  BULK_BOOK_VOUCHER_NOT_POSTED: {
    httpStatus: 409,
    message_sv: 'Endast bokförda verifikationer kan länkas mot banktransaktioner.',
    message_no: 'Bare bokførte bilag kan kobles mot banktransaksjoner.',
    message_en: 'Only posted journal entries can be linked.',
  },
  BULK_BOOK_NO_BANK_LINE: {
    httpStatus: 400,
    message_sv:
      'Verifikationen har ingen rad på bankkonto (19xx). Den kan inte länkas mot banktransaktioner.',
    message_no: 'Bilaget har ingen linje på bankkonto (19xx). Det kan ikke kobles mot banktransaksjoner.',
    message_en:
      'The journal entry has no bank-account (19xx) line and cannot be linked to bank transactions.',
  },
  BULK_BOOK_AMOUNT_MISMATCH: {
    httpStatus: 400,
    message_sv:
      'Summan av transaktionerna stämmer inte med bankradens nettobelopp på verifikationen.',
    message_no: 'Summen av transaksjonene stemmer ikke med banklinjens nettobeløp på bilaget.',
    message_en:
      'The sum of the selected transactions does not match the bank-line net amount on the journal entry.',
  },
  BULK_BOOK_NO_LINES: {
    httpStatus: 400,
    message_sv: 'Verifikationen måste innehålla minst två rader (debit och kredit).',
    message_no: 'Bilaget må inneholde minst to linjer (debet og kredit).',
    message_en: 'The journal entry must contain at least two lines (debit and credit).',
  },
  BULK_BOOK_UNBALANCED: {
    httpStatus: 400,
    message_sv: 'Verifikationen balanserar inte: summa debet måste lika summa kredit.',
    message_no: 'Bilaget balanserer ikke: sum debet må være lik sum kredit.',
    message_en: 'The journal entry does not balance: debits must equal credits.',
  },
  BULK_BOOK_NEGATIVE_LINE: {
    httpStatus: 400,
    message_sv: 'Verifikationsrader kan inte ha negativa belopp.',
    message_no: 'Bilagslinjer kan ikke ha negative beløp.',
    message_en: 'Journal entry lines cannot have negative amounts.',
  },
  BULK_BOOK_BOTH_SIDES_NONZERO: {
    httpStatus: 400,
    message_sv: 'En verifikationsrad kan inte ha både debet och kredit nollskilda.',
    message_no: 'En bilagslinje kan ikke ha både debet og kredit forskjellig fra null.',
    message_en: 'A journal entry line cannot have both debit and credit non-zero.',
  },
  BULK_BOOK_MISSING_DESCRIPTION: {
    httpStatus: 400,
    message_sv: 'Beskrivning krävs för en ny samlingsverifikation.',
    message_no: 'Beskrivelse er påkrevd for et nytt samlebilag.',
    message_en: 'Description is required when creating a new combined journal entry.',
  },
  BULK_BOOK_NO_FISCAL_PERIOD: {
    httpStatus: 400,
    message_sv:
      'Det finns ingen öppen räkenskapsperiod för transaktionsdatumet. Skapa perioden först.',
    message_no: 'Det finnes ingen åpen regnskapsperiode for transaksjonsdatoen. Opprett perioden først.',
    message_en:
      'No fiscal period exists for the transaction date. Create the period first.',
  },
  BULK_BOOK_PERIOD_LOCKED: {
    httpStatus: 409,
    message_sv:
      'Räkenskapsperioden för transaktionsdatumet är stängd. Öppna perioden eller välj ett annat datum.',
    message_no: 'Regnskapsperioden for transaksjonsdatoen er stengt. Åpne perioden eller velg en annen dato.',
    message_en:
      'The fiscal period for the transaction date is closed/locked.',
  },
  BULK_BOOK_RPC_FAILED: {
    httpStatus: 500,
    message_sv: 'Databasfel under samlingsbokföring. Försök igen.',
    message_no: 'Databasefeil under samlebokføring. Prøv igjen.',
    message_en: 'Database error during bulk booking. Please retry.',
    retryable: true,
  },
  BULK_BOOK_INVALID_ACCOUNT: {
    httpStatus: 400,
    message_sv:
      'Ett eller flera konton finns inte i kontoplanen eller är inaktiva. Välj giltiga BAS-konton.',
    message_no: 'Ett eller flere kontoer finnes ikke i kontoplanen eller er inaktive. Velg gyldige BAS-kontoer.',
    message_en:
      'One or more accounts are not in the chart of accounts or are inactive. Pick valid BAS accounts.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Skatteverket filing codes (PR5: MCP momsdeklaration + AGI tools)
// ─────────────────────────────────────────────────────────────────

const SKATTEVERKET: Record<string, StructuredErrorEntry> = {
  EXTENSION_DISABLED: {
    httpStatus: 503,
    message_sv: 'Skatteverket-integrationen är inte aktiverad i denna miljö.',
    message_no: 'Skatteverket-integrasjonen er ikke aktivert i dette miljøet.',
    message_en: 'The Skatteverket integration is not enabled in this environment.',
  },
  // One code covers both never-connected and expired: splitting it would
  // ripple through every consumer, and the declaration-status path already
  // differentiates in its message (DECISIONS.md 2026-08-25). The copy is
  // agent-directive on purpose: only a person can run the BankID flow, so
  // the agent must hand the task to the user instead of retrying.
  SKATTEVERKET_NOT_CONNECTED: {
    httpStatus: 401,
    message_sv:
      'Anslutningen till Skatteverket saknas eller har gått ut. Om företaget varit anslutet tidigare är detta normalt: Skatteverkets personliga inloggning gäller bara ca 1 timme. Be användaren ansluta (igen) med BankID under Inställningar → Skatteverket.',
    message_no: 'Tilkoblingen til Skatteverket mangler eller er utløpt. Hvis foretaket har vært tilkoblet tidligere, er dette normalt: Skatteverkets personlige innlogging gjelder bare ca. 1 time. Be brukeren koble til (på nytt) med BankID under Innstillinger → Skatteverket.',
    message_en:
      'The Skatteverket connection is missing or has expired. If the company was connected before this is expected: Skatteverket personal sessions last only about 1 hour. Tell the user to connect (or reconnect) with BankID under Inställningar → Skatteverket in Accounted. Only a person can do this; do not retry until they confirm they have reconnected.',
    remediation: {
      description:
        'A person must connect (or reconnect) to Skatteverket with BankID under Inställningar → Skatteverket. Personal Skatteverket sessions expire after about 1 hour by SKV design, so an expired session is normal, not a fault. Do not retry until the user confirms they have reconnected.',
    },
  },
  SKATTEVERKET_ACCESS_DENIED: {
    httpStatus: 403,
    message_sv:
      'Behörighet saknas hos Skatteverket för det här företaget. Kontrollera att du är firmatecknare eller deklarationsombud.',
    message_no: 'Tilgang mangler hos Skatteverket for dette foretaket. Kontroller at du er firmaunderskriver eller deklarasjonsfullmektig.',
    message_en:
      'Skatteverket denied access for this company (missing authorisation or scope).',
    remediation: {
      description:
        'Verify the signed-in user is firmatecknare/deklarationsombud for this company at Skatteverket, then reconnect with BankID.',
    },
  },
  SKATTEVERKET_RATE_LIMITED: {
    httpStatus: 429,
    message_sv: 'För många förfrågningar mot Skatteverket. Vänta en stund och försök igen.',
    message_no: 'For mange forespørsler mot Skatteverket. Vent litt og prøv igjen.',
    message_en: 'Skatteverket rate limit exceeded.',
    retryable: true,
  },
  SKATTEVERKET_API_ERROR: {
    httpStatus: 502,
    message_sv: 'Skatteverkets tjänst svarade med ett fel. Se detaljerna och försök igen.',
    message_no: 'Skatteverkets tjeneste svarte med en feil. Se detaljene og prøv igjen.',
    message_en: 'The Skatteverket API returned an error. See details for the upstream message.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Bolagsverket filing codes (digital inlämning av årsredovisning)
// ─────────────────────────────────────────────────────────────────

const BOLAGSVERKET: Record<string, StructuredErrorEntry> = {
  BOLAGSVERKET_API_ERROR: {
    httpStatus: 502,
    message_sv: 'Bolagsverkets tjänst svarade med ett fel. Se detaljerna och försök igen.',
    message_no: 'Bolagsverkets tjeneste svarte med en feil. Se detaljene og prøv igjen.',
    message_en: 'The Bolagsverket API returned an error. See details for the upstream message.',
  },
  BOLAGSVERKET_SUBMISSION_EXISTS: {
    httpStatus: 409,
    message_sv:
      'Det finns redan en aktiv inlämning av årsredovisningen för räkenskapsåret. Invänta Bolagsverkets besked innan du lämnar in på nytt.',
    message_no: 'Det finnes allerede en aktiv innsending av årsregnskapet for regnskapsåret. Vent på Bolagsverkets svar før du sender inn på nytt.',
    message_en:
      'An active årsredovisning submission already exists for this fiscal period. Wait for Bolagsverket to resolve it before submitting again.',
  },
  BOLAGSVERKET_FORBIDDEN: {
    httpStatus: 403,
    message_sv: 'Otillräcklig behörighet för att lämna in årsredovisning för det här företaget.',
    message_no: 'Utilstrekkelig tilgang til å sende inn årsregnskap for dette foretaket.',
    message_en:
      'Insufficient role to file an årsredovisning for this company (viewer members cannot submit).',
  },
  BOLAGSVERKET_INVALID_ENVIRONMENT: {
    httpStatus: 400,
    message_sv: "Ogiltig Bolagsverket-miljö. Tillåtna värden: 'test', 'accept', 'prod'.",
    message_no: "Ugyldig Bolagsverket-miljø. Tillatte verdier: 'test', 'accept', 'prod'.",
    message_en: "Invalid Bolagsverket environment. Allowed values: 'test', 'accept', 'prod'.",
  },
  BOLAGSVERKET_ENV_NOT_ALLOWED: {
    httpStatus: 403,
    message_sv:
      'Den valda Bolagsverket-miljön är inte tillåten i den här installationen. Plattformens BOLAGSVERKET_ENV sätter taket.',
    message_no: 'Det valgte Bolagsverket-miljøet er ikke tillatt i denne installasjonen. Plattformens BOLAGSVERKET_ENV setter taket.',
    message_en:
      'The selected Bolagsverket environment exceeds the platform ceiling set by BOLAGSVERKET_ENV (order: test < accept < prod; unset means test).',
  },
  BOLAGSVERKET_CONFIG_MISSING: {
    httpStatus: 503,
    message_sv:
      'Serverkonfiguration saknas för Bolagsverket-integrationen. Kontakta administratören.',
    message_no: 'Serverkonfigurasjon mangler for Bolagsverket-integrasjonen. Kontakt administratoren.',
    message_en:
      'Server configuration required by the Bolagsverket integration is missing (see details).',
  },
  BOLAGSVERKET_NO_SUBSCRIPTION: {
    httpStatus: 404,
    message_sv: 'Ingen händelseprenumeration finns för företaget ännu.',
    message_no: 'Ingen hendelsesabonnement finnes for foretaket ennå.',
    message_en:
      'No Bolagsverket event subscription exists for this company yet. One is created on the first submission.',
  },
  BOLAGSVERKET_NOT_RELEASED: {
    httpStatus: 503,
    message_sv:
      'Direktinlämning till Bolagsverket är inte öppnad i den här installationen. Använd pappersflödet tills anslutningen är godkänd.',
    message_no: 'Direkteinnsending til Bolagsverket er ikke åpnet i denne installasjonen. Bruk papirflyten til tilkoblingen er godkjent.',
    message_en:
      'Connected filing to Bolagsverket is not enabled for this installation. Use the paper flow until acceptance is complete.',
    retryable: false,
  },
  BOLAGSVERKET_VERSION_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Den valda versionen av årsredovisningen finns inte.',
    message_no: 'Den valgte versjonen av årsregnskapet finnes ikke.',
    message_en: 'The selected annual report version was not found.',
    retryable: false,
  },
  BOLAGSVERKET_VERSION_NOT_SIGNED: {
    httpStatus: 409,
    message_sv: 'Årsredovisningsversionen måste vara låst och undertecknad före inlämning.',
    message_no: 'Versjonen av årsregnskapet må være låst og underskrevet før innsending.',
    message_en: 'The annual report version must be finalized and signed before submission.',
    retryable: false,
  },
  BOLAGSVERKET_DIGITAL_INELIGIBLE: {
    httpStatus: 409,
    message_sv:
      'Den låsta årsredovisningsversionen är inte godkänd för digital inlämning. Använd pappersflödet och följ kontrollpunkterna i årsredovisningsstudion.',
    message_no: 'Den låste versjonen av årsregnskapet er ikke godkjent for digital innsending. Bruk papirflyten og følg kontrollpunktene i årsregnskapsstudioet.',
    message_en:
      'The locked annual report version is not eligible for connected filing. Use the paper workflow and review the Annual Report Studio checks.',
    retryable: false,
  },
  BOLAGSVERKET_SIGNATURE_EVIDENCE_INCOMPLETE: {
    httpStatus: 409,
    message_sv: 'Verifierbart underskriftsunderlag saknas för en eller flera undertecknare.',
    message_no: 'Verifiserbart underskriftsunderlag mangler for én eller flere underskrivere.',
    message_en: 'Verifiable signature evidence is missing for one or more required signers.',
    retryable: false,
  },
  BOLAGSVERKET_CERTIFICATE_SIGNER_MISMATCH: {
    httpStatus: 409,
    message_sv:
      'Undertecknaren av fastställelseintyget stämmer inte med den person som låstes i årsredovisningsversionen.',
    message_no: 'Underskriveren av fastsettelsesattesten stemmer ikke med personen som ble låst i versjonen av årsregnskapet.',
    message_en:
      'The certificate signer does not match the person locked into the annual report version.',
    retryable: false,
  },
  BOLAGSVERKET_ARELLE_UNAVAILABLE: {
    httpStatus: 503,
    message_sv:
      'Taxonomivalideringen med Arelle är inte tillgänglig. Inlämningen har stoppats innan något skickades.',
    message_no: 'Taksonomivalideringen med Arelle er ikke tilgjengelig. Innsendingen er stoppet før noe ble sendt.',
    message_en:
      'Arelle taxonomy validation is unavailable. Filing was stopped before anything was sent.',
    retryable: true,
  },
  BOLAGSVERKET_ARELLE_FAILED: {
    httpStatus: 409,
    message_sv:
      'Arelle hittade blockerande fel i iXBRL-dokumentet. Rätta felen och skapa en ny version.',
    message_no: 'Arelle fant blokkerende feil i iXBRL-dokumentet. Rett feilene og opprett en ny versjon.',
    message_en:
      'Arelle found blocking errors in the iXBRL document. Correct them and create a new version.',
    retryable: false,
  },
  ARSREDOVISNING_INCOMPLETE: {
    httpStatus: 409,
    message_sv: 'Årsredovisningen har blockerande kontrollfel och kan inte versionssparas ännu.',
    message_no: 'Årsregnskapet har blokkerende kontrollfeil og kan ikke versjonslagres ennå.',
    message_en: 'The annual report has blocking validation errors and cannot be versioned yet.',
    retryable: false,
  },
  ARSREDOVISNING_VERSION_NOT_SIGNABLE: {
    httpStatus: 409,
    message_sv: 'Den valda årsredovisningsversionen är inte öppen för underskrift.',
    message_no: 'Den valgte versjonen av årsregnskapet er ikke åpen for underskrift.',
    message_en: 'The selected annual report version is not open for signing.',
    retryable: false,
  },
  ARSREDOVISNING_SIGNATURE_DATE_INVALID: {
    httpStatus: 400,
    message_sv:
      'Underskriftsdatumet måste vara samma dag som eller senare än versionens låsdatum och får inte ligga i framtiden.',
    message_no: 'Underskriftsdatoen må være samme dag som eller senere enn versjonens låsedato og kan ikke ligge i fremtiden.',
    message_en:
      'The signature date must be on or after the version finalization date and cannot be in the future.',
    retryable: false,
  },
  ARSREDOVISNING_SIGNER_ROSTER_LOCKED: {
    httpStatus: 409,
    message_sv:
      'Undertecknarlistan är låst eftersom en årsredovisningsversion redan väntar på underskrift.',
    message_no: 'Listen over underskrivere er låst fordi en versjon av årsregnskapet allerede venter på underskrift.',
    message_en:
      'The signer roster is locked because an annual report version is already awaiting signatures.',
    retryable: false,
  },
  ARSREDOVISNING_SIGNER_ALREADY_EXISTS: {
    httpStatus: 409,
    message_sv: 'Undertecknaren finns redan i den aktuella undertecknarlistan.',
    message_no: 'Underskriveren finnes allerede i den gjeldende listen over underskrivere.',
    message_en: 'The signer is already present in the current signer roster.',
    retryable: false,
  },
  ARSREDOVISNING_REGISTERED: {
    httpStatus: 409,
    message_sv:
      'Årsredovisningen för räkenskapsåret är registrerad hos Bolagsverket och texterna kan inte längre ändras.',
    message_no: 'Årsregnskapet for regnskapsåret er registrert hos Bolagsverket, og teksten kan ikke lenger endres.',
    message_en:
      'The årsredovisning for this fiscal period has been registered with Bolagsverket; its narrative texts can no longer be edited.',
  },
}

const ASSETS: Record<string, StructuredErrorEntry> = {
  ASSET_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Tillgången kunde inte hittas.',
    message_no: 'Eiendelen kunne ikke finnes.',
    message_en: 'Asset not found.',
  },
  ASSET_ALREADY_DISPOSED: {
    httpStatus: 409,
    message_sv: 'Tillgången är redan avyttrad.',
    message_no: 'Eiendelen er allerede avhendet.',
    message_en: 'The asset has already been disposed.',
  },
  ASSET_DISPOSAL_BLOCKED: {
    httpStatus: 409,
    message_sv:
      'Avyttringen kan inte bokföras eftersom avskrivningar redan finns för samma eller en senare period. Återför den felaktiga avskrivningen med storno först.',
    message_no: 'Avhendelsen kan ikke bokføres fordi det allerede finnes avskrivninger for samme eller en senere periode. Tilbakefør den feilaktige avskrivningen med storno først.',
    message_en:
      'The disposal cannot be posted because depreciation already exists for the same or a later period. Reverse the incorrect depreciation first.',
  },
  ASSET_JAMKNING_DATA_REQUIRED: {
    httpStatus: 422,
    message_sv:
      'Ange ursprunglig ingående moms och ursprunglig avdragsprocent för att bedöma justering enligt ML 15 kap.',
    message_no: 'Oppgi opprinnelig inngående mva og opprinnelig fradragsprosent for å vurdere justering etter ML 15 kap.',
    message_en:
      'Enter the original input VAT and original deduction percentage to assess adjustment under ML chapter 15.',
  },
  ASSET_ADJUSTMENT_DOCUMENT_REQUIRED: {
    httpStatus: 422,
    message_sv:
      'Bekräfta att en justeringshandling upprättas när justeringsskyldigheten överförs.',
    message_no: 'Bekreft at et justeringsdokument utarbeides når justeringsplikten overføres.',
    message_en:
      'Confirm that an adjustment document is prepared when the adjustment obligation is transferred.',
  },
  ASSET_BUSINESS_TRANSFER_CONFIRMATION_REQUIRED: {
    httpStatus: 422,
    message_sv:
      'Bekräfta att överlåtelsen omfattar en hel verksamhet eller självständig verksamhetsgren och uppfyller villkoren i ML 5 kap. 38 §.',
    message_no: 'Bekreft at overføringen omfatter en hel virksomhet eller en selvstendig virksomhetsgren og oppfyller vilkårene i ML 5 kap. 38 §.',
    message_en:
      'Confirm that the transfer covers an entire business or independent branch and meets the conditions in ML chapter 5, section 38.',
  },
  ASSET_CORRECTION_BLOCKED: {
    httpStatus: 409,
    message_sv:
      'Anskaffningsdatum, anskaffningsvärde och kategori kan inte ändras efter att tillgången avyttrats eller avskrivningar bokförts. Återför (storno) först, eller använd avyttringsflödet.',
    message_no: 'Anskaffelsesdato, anskaffelsesverdi og kategori kan ikke endres etter at eiendelen er avhendet eller avskrivninger er bokført. Tilbakefør (storno) først, eller bruk avhendingsflyten.',
    message_en:
      'Acquisition date, cost and category cannot be changed once the asset has been disposed or depreciation has been posted. Reverse (storno) first, or use the disposal flow.',
  },
  // Generic on purpose: the flag covers accounts excluded from K2 for several
  // different reasons (egenupparbetade immateriella, uppskjuten skatt,
  // verkligt värde, säkringsredovisning, ...), so the static entry states only
  // what the BAS chart says. The asset routes override it with an
  // account-specific message from lib/bokslut/assets/k2-account-guard.ts,
  // which cites BFNAR 2016:10 punkt 10.4 only when the intangible group is
  // what actually triggered the gate.
  K2_EXCLUDED_ACCOUNT: {
    httpStatus: 422,
    message_sv:
      'Kontot är markerat Ej K2 i BAS-kontoplanen och förutsätter K3. Välj ett konto som är tillåtet enligt K2.',
    message_no: 'Kontoen er merket Ikke K2 i BAS-kontoplanen og forutsetter K3. Velg en konto som er tillatt etter K2.',
    message_en:
      'The account is marked Ej K2 in the BAS chart of accounts and presumes the K3 framework. Pick an account that K2 permits.',
  },
}

// Dimensions registry (kostnadsställe/projekt)
const DIMENSION: Record<string, StructuredErrorEntry> = {
  DIMENSION_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Dimensionen kunde inte hittas.',
    message_no: 'Dimensjonen kunne ikke finnes.',
    message_en: 'Dimension not found.',
  },
  DIMENSION_SYSTEM_RENAME: {
    httpStatus: 400,
    message_sv: 'Systemdimensioner kan inte döpas om.',
    message_no: 'Systemdimensjoner kan ikke gis nytt navn.',
    message_en: 'System dimensions (kostnadsställe/projekt) cannot be renamed.',
  },
  DIMENSION_UPDATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Dimensionen kunde inte uppdateras.',
    message_no: 'Dimensjonen kunne ikke oppdateres.',
    message_en: 'Failed to update dimension.',
  },
  DIMENSION_SYSTEM_DELETE: {
    httpStatus: 400,
    message_sv: 'Systemdimensioner (kostnadsställe och projekt) kan inte tas bort: avaktivera dem istället.',
    message_no: 'Systemdimensjoner (kostnadssted og prosjekt) kan ikke slettes: deaktiver dem i stedet.',
    message_en: 'System dimensions (kostnadsställe/projekt) cannot be deleted: archive (inactivate) them instead.',
  },
  // The DB registry guard (enforce_dimension_registry_guards) raises when any
  // posted/reversed line is tagged with the dimension's number, and the value
  // retention trigger fires on the cascade to dimension_values. Routes surface
  // the trigger's own Swedish message via `messageSv`.
  DIMENSION_REFERENCED: {
    httpStatus: 409,
    message_sv:
      'Dimensionen används på bokförda verifikat och kan inte tas bort: avaktivera den istället.',
    message_no: 'Dimensjonen brukes på bokførte bilag og kan ikke slettes: deaktiver den i stedet.',
    message_en:
      'The dimension is referenced by posted vouchers and cannot be deleted: archive (inactivate) it instead.',
    remediation: {
      description:
        'Archive the dimension instead: PATCH /api/dimensions/[id] with { "is_active": false }. Numbers tagged on posted lines are retained for the BFL 7-year period.',
    },
  },
  DIMENSION_DELETE_FAILED: {
    httpStatus: 500,
    message_sv: 'Dimensionen kunde inte tas bort.',
    message_no: 'Dimensjonen kunne ikke slettes.',
    message_en: 'Failed to delete dimension.',
  },
  DIMENSION_VALUE_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Dimensionsvärdet kunde inte hittas.',
    message_no: 'Dimensjonsverdien kunne ikke finnes.',
    message_en: 'Dimension value not found.',
  },
  DIMENSION_VALUE_DUPLICATE_CODE: {
    httpStatus: 409,
    message_sv: 'Ett värde med samma kod finns redan i dimensionen.',
    message_no: 'En verdi med samme kode finnes allerede i dimensjonen.',
    message_en: 'A value with that code already exists in the dimension.',
  },
  DIMENSION_VALUE_DATES_NOT_ALLOWED: {
    httpStatus: 400,
    message_sv: 'Datum kan bara sättas på ackumulerande dimensioner (t.ex. projekt).',
    message_no: 'Dato kan bare settes på akkumulerende dimensjoner (f.eks. prosjekt).',
    message_en:
      'Start/end dates can only be set on accumulating dimensions (e.g. projects): this dimension resets annually.',
  },
  DIMENSION_VALUE_CREATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Dimensionsvärdet kunde inte skapas.',
    message_no: 'Dimensjonsverdien kunne ikke opprettes.',
    message_en: 'Failed to create dimension value.',
  },
  DIMENSION_VALUE_UPDATE_FAILED: {
    httpStatus: 500,
    message_sv: 'Dimensionsvärdet kunde inte uppdateras.',
    message_no: 'Dimensjonsverdien kunne ikke oppdateres.',
    message_en: 'Failed to update dimension value.',
  },
  // The DB retention trigger (enforce_dimension_value_retention) raises when a
  // code is referenced by posted/reversed lines. Routes surface the trigger's
  // own Swedish message via `messageSv` so the code + kod appear in the toast.
  DIMENSION_VALUE_REFERENCED: {
    httpStatus: 409,
    message_sv:
      'Värdet används på bokförda verifikat och kan inte tas bort: arkivera det istället.',
    message_no: 'Verdien brukes på bokførte bilag og kan ikke slettes: arkiver den i stedet.',
    message_en:
      'The value is referenced by posted vouchers and cannot be deleted: archive (inactivate) it instead.',
    remediation: {
      description:
        'Archive the value instead: PATCH the dimension value with { "is_active": false }. Codes referenced by posted lines are retained for the BFL 7-year period.',
    },
  },
  DIMENSION_VALUE_DELETE_FAILED: {
    httpStatus: 500,
    message_sv: 'Dimensionsvärdet kunde inte tas bort.',
    message_no: 'Dimensjonsverdien kunne ikke slettes.',
    message_en: 'Failed to delete dimension value.',
  },
  DIMENSION_IMPORT_FAILED: {
    httpStatus: 500,
    message_sv: 'Import av befintliga dimensionskoder misslyckades.',
    message_no: 'Import av eksisterende dimensjonskoder mislyktes.',
    message_en: 'Failed to import existing dimension codes from journal lines.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Node.js / undici network system codes. These surface when an outbound call
// (email provider, Riksbanken, Skatteverket, a DB socket) fails at the
// network layer and the raw Error bubbles up with its `code` intact.
// Registered so they translate to a Swedish transient message instead of
// leaking strings like "connect ECONNREFUSED 10.0.0.1:443" (#337 follow-up).
// ─────────────────────────────────────────────────────────────────

const NETWORK_TRANSIENT_ENTRY: StructuredErrorEntry = {
  httpStatus: 503,
  message_sv: 'Kunde inte nå en extern tjänst. Försök igen om en stund.',
    message_no: 'Kunne ikke nå en ekstern tjeneste. Prøv igjen om en stund.',
  message_en: 'An upstream network call failed. Retry the same request after a short backoff.',
  retryable: true,
}

const WEBSHOP_ORDERS: Record<string, StructuredErrorEntry> = {
  WEBSHOP_ORDER_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Ordern hittades inte.',
    message_no: 'Ordren ble ikke funnet.',
    message_en: 'The order was not found.',
  },
  WEBSHOP_ORDER_ALREADY_BOOKED: {
    httpStatus: 409,
    message_sv: 'Ordern är redan bokförd.',
    message_no: 'Ordren er allerede bokført.',
    message_en: 'The order is already booked.',
  },
  WEBSHOP_ORDER_ALREADY_INVOICED: {
    httpStatus: 409,
    message_sv:
      'Ordern är kopplad till en kundfaktura. Bokföringen sker via fakturaflödet, inte direkt från ordern.',
    message_no: 'Ordren er koblet til en kundefaktura. Bokføringen skjer via fakturaflyten, ikke direkte fra ordren.',
    message_en:
      'The order is linked to a customer invoice. Bookkeeping happens through the invoice flow, not directly from the order.',
  },
  WEBSHOP_ORDER_NOT_PAID: {
    httpStatus: 409,
    message_sv:
      'Ordern är inte betald ännu. Obetalda ordrar bokförs när betalningen kommer, eller faktureras via Skapa faktura.',
    message_no: 'Ordren er ikke betalt ennå. Ubetaalte ordrer bokføres når betalingen kommer, eller faktureres via Opprett faktura.',
    message_en:
      'The order is not paid yet. Unpaid orders are booked when payment arrives, or invoiced via Create invoice.',
  },
  WEBSHOP_ORDER_LEGACY_TRANSACTION_OPEN: {
    httpStatus: 409,
    message_sv:
      'Samma order ligger redan som en obokförd transaktion under Transaktioner (importerad av det tidigare orderflödet). Bokför eller ignorera den transaktionen först, så att samma affärshändelse inte bokförs två gånger.',
    message_no: 'Samme ordre ligger allerede som en ubokført transaksjon under Transaksjoner (importert av den tidligere ordre-flyten). Bokfør eller ignorer den transaksjonen først, slik at samme forretningshendelse ikke bokføres to ganger.',
    message_en:
      'The same order already exists as an unbooked transaction under Transactions (imported by the previous order feed). Book or ignore that transaction first so the same business event is not booked twice.',
  },
  WEBSHOP_ORDER_LEGACY_TRANSACTION_BOOKED: {
    httpStatus: 409,
    message_sv:
      'Ordern är redan bokförd via en transaktion under Transaktioner (importerad av det tidigare orderflödet).',
    message_no: 'Ordren er allerede bokført via en transaksjon under Transaksjoner (importert av den tidligere ordre-flyten).',
    message_en:
      'The order is already booked via a transaction under Transactions (imported by the previous order feed).',
  },
  WEBSHOP_ORDER_FX_UNRESOLVED: {
    httpStatus: 422,
    message_sv:
      'Växelkursen för orderns valuta kunde inte hämtas ännu. Försök igen om en stund; ordern kan inte bokföras i SEK utan kurs.',
    message_no: 'Valutakursen for ordrens valuta kunne ikke hentes ennå. Prøv igjen om en stund; ordren kan ikke bokføres i SEK uten kurs.',
    message_en:
      'The exchange rate for the order currency could not be fetched yet. Try again shortly; the order cannot be booked in SEK without a rate.',
  },
  WEBSHOP_ORDER_REFUND_NOT_CONVERTIBLE: {
    httpStatus: 409,
    message_sv:
      'Återbetalningar kan inte omvandlas till fakturor. Hantera återbetalningen med en kreditfaktura från kundfakturan, eller bokför återbetalningsraden direkt.',
    message_no: 'Refusjoner kan ikke omgjøres til fakturaer. Håndter refusjonen med en kreditnota fra kundefakturaen, eller bokfør refusjonslinjen direkte.',
    message_en:
      'Refunds cannot be converted to invoices. Handle the refund with a credit note from the customer invoice, or book the refund row directly.',
  },
  WEBSHOP_ORDER_REFUND_PARENT_INVOICED: {
    httpStatus: 409,
    message_sv:
      'Ordern fakturerades via en kundfaktura. Återbetalningen hanteras med en kreditfaktura, inte genom att bokföra återbetalningsraden direkt.',
    message_no: 'Ordren ble fakturert via en kundefaktura. Refusjonen håndteres med en kreditnota, ikke ved å bokføre refusjonslinjen direkte.',
    message_en:
      'The order was invoiced through a customer invoice. Handle the refund with a credit note instead of booking the refund row directly.',
  },
  WEBSHOP_ORDER_VAT_BREAKDOWN_MISSING: {
    httpStatus: 422,
    message_sv:
      'Ordern saknar momsuppdelning från butiken, så konteringen kan inte härledas säkert. Bokför ordern enskilt och granska raderna.',
    message_no: 'Ordren mangler mva-fordeling fra butikken, så konteringen kan ikke utledes sikkert. Bokfør ordren enkeltvis og gjennomgå linjene.',
    message_en:
      'The order has no VAT breakdown from the store, so the posting cannot be derived reliably. Book the order individually and review the lines.',
  },
  WEBSHOP_ORDER_INVOICE_MODE_METHOD: {
    httpStatus: 409,
    message_sv:
      'Betalsättet är markerat som fakturaflöde i butiksinställningarna. Skapa faktura från ordern i stället, eller bokför den enskilt.',
    message_no: 'Betalingsmåten er merket som fakturaflyt i butikkinnstillingene. Opprett faktura fra ordren i stedet, eller bokfør den enkeltvis.',
    message_en:
      'The payment method is marked as invoice flow in the store settings. Create an invoice from the order instead, or book it individually.',
  },
  WEBSHOP_ORDER_UNSUPPORTED_VAT_RATE: {
    httpStatus: 422,
    message_sv:
      'Ordern har en momssats som inte är en svensk sats (25/12/6/0 %), till exempel utländsk OSS-moms. Bokför ordern enskilt och granska raderna.',
    message_no: 'Ordren har en mva-sats som ikke er en svensk sats (25/12/6/0 %), for eksempel utenlandsk OSS-mva. Bokfør ordren enkeltvis og gjennomgå linjene.',
    message_en:
      'The order has a VAT rate that is not a Swedish rate (25/12/6/0 %), for example foreign OSS VAT. Book the order individually and review the lines.',
  },
  WEBSHOP_ORDER_REVENUE_ACCOUNT_RATE_MISMATCH: {
    httpStatus: 422,
    message_sv:
      'Ett valt intäktskonto är inte upplagt för momssatsen det ska ta emot, så försäljningen skulle falla ur momsdeklarationens ruta 05. Ange kontots momssats i kontoplanen (eller välj ett konto för rätt sats) och försök igen.',
    message_no: 'En valgt inntektskonto er ikke satt opp for mva-satsen den skal ta imot, så salget ville falle ut av mva-meldingens rute 05. Angi kontoens mva-sats i kontoplanen (eller velg en konto for riktig sats) og prøv igjen.',
    message_en:
      'A chosen revenue account is not configured for the VAT rate it would receive, so the sale would drop out of ruta 05 in the VAT declaration. Set the account VAT rate in the chart of accounts (or pick an account for the right rate) and try again.',
  },
  WEBSHOP_ORDER_ZERO_RATE_CONTEXT_MISMATCH: {
    httpStatus: 422,
    message_sv:
      'Ordern har en momsfri del men faktureringslandet stämmer inte med det valda 0 %-kontot (export- eller EU-konto). Kontrollen bygger på faktureringsadressen, inte leveransadressen: går varorna till ett annat land kan kontot ändå vara rätt. Bokför ordern enskilt och bekräfta kontot för ruta 35-42.',
    message_no: 'Bestillingen har en mva-fri del, men faktureringslandet stemmer ikke med den valgte 0 %-kontoen (eksport- eller EU-konto). Kontrollen bygger på faktureringsadressen, ikke leveringsadressen: går varene til et annet land kan kontoen likevel være riktig. Bokfør bestillingen enkeltvis og bekreft kontoen for rute 35-42.',
    message_en:
      'The order has a 0 % part but the billing country does not match the chosen 0 % account (export or EU account). The check uses the billing address, not the delivery address: if the goods ship to another country the account may still be right. Book the order individually and confirm the account for the right box (ruta 35-42).',
  },
  WEBSHOP_ORDER_REVENUE_ACCOUNT_UNKNOWN: {
    httpStatus: 422,
    message_sv:
      'Ett valt intäktskonto finns inte i kontoplanen eller är inaktivt. Lägg till eller aktivera kontot under Kontoplan och försök igen.',
    message_no: 'En valgt inntektskonto finnes ikke i kontoplanen eller er inaktiv. Legg til eller aktiver kontoen under Kontoplan og prøv igjen.',
    message_en:
      'A chosen revenue account is not in the chart of accounts or is inactive. Add or activate the account in the chart of accounts and try again.',
  },
  WEBSHOP_ORDER_RESIDUAL_TOO_LARGE: {
    httpStatus: 422,
    message_sv:
      'Orderns belopp stämmer inte med momsuppdelningen (differensen är större än öresavrundning). Bokför ordern enskilt och granska raderna.',
    message_no: 'Bestillingens beløp stemmer ikke med mva-fordelingen (differansen er større enn øreavrunding). Bokfør bestillingen enkeltvis og gå gjennom linjene.',
    message_en:
      'The order total does not match its VAT breakdown (the difference is larger than öre rounding). Book the order individually and review the lines.',
  },
  WEBSHOP_ORDER_CREATE_INVOICE_CUSTOMER_FAILED: {
    httpStatus: 500,
    message_sv: 'Kunden kunde inte skapas från orderns uppgifter.',
    message_no: 'Kunden kunne ikke opprettes fra bestillingens opplysninger.',
    message_en: 'The customer could not be created from the order data.',
  },
  WEBSHOP_ORDER_CREATE_INVOICE_MISSING_CUSTOMER: {
    httpStatus: 422,
    message_sv:
      'Ordern saknar kunduppgifter. Välj en befintlig kund att fakturera.',
    message_no: 'Bestillingen mangler kundeopplysninger. Velg en eksisterende kunde å fakturere.',
    message_en:
      'The order has no customer data. Choose an existing customer to invoice.',
  },
  WEBSHOP_ORDER_MANUALLY_BOOKED: {
    httpStatus: 409,
    message_sv:
      'Ordern är markerad som bokförd utanför integrationen. Ångra markeringen först om du vill bokföra eller fakturera den härifrån.',
    message_no: 'Bestillingen er merket som bokført utenfor integrasjonen. Angre merkingen først hvis du vil bokføre eller fakturere den herfra.',
    message_en:
      'The order is marked as booked outside the integration. Undo the mark first if you want to book or invoice it from here.',
  },
  WEBSHOP_ORDER_MARK_ENTRY_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Verifikatet som ordern skulle kopplas till hittades inte.',
    message_no: 'Bilaget som bestillingen skulle kobles til ble ikke funnet.',
    message_en: 'The journal entry to link the order to was not found.',
  },
  WEBSHOP_ORDER_MARK_ENTRY_NOT_POSTED: {
    httpStatus: 409,
    message_sv:
      'Verifikatet är inte bokfört. Ordern kan bara kopplas till ett bokfört verifikat.',
    message_no: 'Bilaget er ikke bokført. Bestillingen kan bare kobles til et bokført bilag.',
    message_en:
      'The journal entry is not posted. The order can only be linked to a posted entry.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Reconciliation sign-off (lib/reconciliation/signoff.ts)
// ─────────────────────────────────────────────────────────────────

// Policy refusals from signOffAccount / reopenSignoff. Shipped as-is on the
// dashboard, v1 and MCP surfaces before this registry knew them, so the code
// names stay. The thrower's Swedish text is the message (thrown_message_sv):
// before that, getErrorMessage() fell through to its generic fallback and the
// user read "Något gick fel. Försök igen." for a refused sign-off.
const RECONCILIATION_SIGNOFF: Record<string, StructuredErrorEntry> = {
  INVALID_DATE: {
    httpStatus: 400,
    message_sv: 'Ogiltigt datum. Ange ÅÅÅÅ-MM-DD.',
    message_no: 'Ugyldig dato. Angi ÅÅÅÅ-MM-DD.',
    message_en: 'Invalid date. Use YYYY-MM-DD.',
    thrown_message_sv: true,
  },
  DATE_IN_FUTURE: {
    httpStatus: 400,
    message_sv: 'Du kan inte stämma av framåt i tiden.',
    message_no: 'Du kan ikke avstemme frem i tid.',
    message_en: 'The through date cannot be in the future.',
    thrown_message_sv: true,
  },
  NOT_FETCHED_THROUGH: {
    httpStatus: 400,
    message_sv: 'Skattekontot är inte hämtat t.o.m. det datumet. Hämta igen innan du stämmer av ett senare datum.',
    message_no: 'Skattekontoen er ikke hentet t.o.m. den datoen. Hent på nytt før du avstemmer en senere dato.',
    message_en: 'The skattekonto has not been fetched through that date. Fetch it again before signing off a later date.',
    thrown_message_sv: true,
  },
  OUTSIDE_UNKNOWN: {
    httpStatus: 400,
    message_sv: 'Saldot utanför bokföringen är okänt, så kontot kan inte stämmas av. Hämta det först, eller signera med en notering.',
    message_no: 'Saldoen utenfor regnskapet er ukjent, så kontoen kan ikke avstemmes. Hent den først, eller signer med en merknad.',
    message_en: 'The outside balance is unknown, so the account cannot be reconciled. Fetch it first, or sign with force and a note.',
    thrown_message_sv: true,
  },
  NOT_RECONCILED: {
    httpStatus: 400,
    message_sv: 'Kontot har en oförklarad differens. Koppla eller bokför raderna först, eller signera med en notering.',
    message_no: 'Kontoen har en uforklart differanse. Koble eller bokfør linjene først, eller signer med en merknad.',
    message_en: 'The account has an unexplained difference. Link or book the rows first, or sign with force and a note.',
    thrown_message_sv: true,
  },
  NOTE_REQUIRED: {
    httpStatus: 400,
    message_sv: 'Skriv en rad om varför du signerar trots att allt inte är förklarat.',
    message_no: 'Skriv en linje om hvorfor du signerer selv om ikke alt er forklart.',
    message_en: 'A note is required when signing with force.',
    thrown_message_sv: true,
  },
  ALREADY_SIGNED_OFF: {
    httpStatus: 409,
    message_sv: 'Kontot är redan avstämt t.o.m. ett senare datum. Öppna den signeringen igen om du vill ändra.',
    message_no: 'Kontoen er allerede avstemt t.o.m. en senere dato. Åpne den signeringen igjen hvis du vil endre.',
    message_en: 'The account is already signed off through that date or later. Reopen that sign-off to change it.',
    thrown_message_sv: true,
  },
  SIGNOFF_NOT_FOUND: {
    httpStatus: 404,
    message_sv: 'Signeringen hittades inte.',
    message_no: 'Signeringen ble ikke funnet.',
    message_en: 'The sign-off was not found.',
    thrown_message_sv: true,
  },
  ALREADY_REOPENED: {
    httpStatus: 409,
    message_sv: 'Signeringen är redan öppnad igen.',
    message_no: 'Signeringen er allerede åpnet igjen.',
    message_en: 'The sign-off is already reopened.',
    thrown_message_sv: true,
  },
  SIGNOFF_RACE: {
    httpStatus: 409,
    message_sv: 'Kontot signerades precis av någon annan. Ladda om.',
    message_no: 'Kontoen ble nettopp signert av noen andre. Last inn på nytt.',
    message_en: 'Someone else just changed this sign-off. Reload and try again.',
    thrown_message_sv: true,
  },
  EXTERNAL_BALANCE_NOT_ALLOWED: {
    httpStatus: 400,
    message_sv: 'Kontot har redan en sanning utanför bokföringen (bank, Skatteverket, reskontra eller beräkning). Ange inget saldo manuellt; signera med en notering om något avviker.',
    message_no: 'Kontoen har allerede en sannhet utenfor regnskapet (bank, Skatteetaten, reskontro eller beregning). Ikke angi noen saldo manuelt; signer med en merknad hvis noe avviker.',
    message_en: 'The account already has an outside truth (bank, Skatteverket, ledger or calculation). Do not state a balance; sign with a note if something differs.',
    thrown_message_sv: true,
  },
}

const NODE_SYSTEM: Record<string, StructuredErrorEntry> = {
  ECONNREFUSED: NETWORK_TRANSIENT_ENTRY,
  ECONNRESET: NETWORK_TRANSIENT_ENTRY,
  ETIMEDOUT: NETWORK_TRANSIENT_ENTRY,
  ENOTFOUND: NETWORK_TRANSIENT_ENTRY,
  EAI_AGAIN: NETWORK_TRANSIENT_ENTRY,
  EPIPE: NETWORK_TRANSIENT_ENTRY,
}

// ─────────────────────────────────────────────────────────────────
// Combined registry
// ─────────────────────────────────────────────────────────────────

const REGISTRY: Record<string, StructuredErrorEntry> = {
  ...GENERIC,
  ...BOOKKEEPING,
  ...TRANSACTIONS,
  ...MATCH_INVOICE,
  ...LINK_TX_JE,
  ...LINK_INVOICE_VOUCHER,
  ...LINK_SI_VOUCHER,
  ...MATCH_BATCH,
  ...BULK_BOOK,
  ...MATCH_SI,
  ...INVOICE,
  ...SUPPLIER_INVOICE,
  ...PERIOD,
  ...YEAR_END,
  ...FX,
  ...REPORT,
  ...VAT_REPORT,
  ...PS_REPORT,
  ...SIE_EXPORT,
  ...TAX_DECL,
  ...SIE_IMPORT,
  ...BANK_FILE,
  ...BANK_SYNC,
  ...SKATTEKONTO_FILE,
  ...OPENING_BALANCE_IMPORT,
  ...REGISTER_IMPORT,
  ...PROVIDER_MIGRATION,
  ...DOCUMENT,
  ...INBOX_UPLOAD,
  ...CUSTOMER,
  ...ARTICLE,
  ...SUPPLIER,
  ...SUPPLIER_INVOICE_WAVE4,
  ...SALARY,
  ...COMPANY,
  ...API_KEY,
  ...PROVIDER,
  ...SKATTEVERKET,
  ...BOLAGSVERKET,
  ...ASSETS,
  ...DIMENSION,
  ...WEBSHOP_ORDERS,
  ...RECONCILIATION_SIGNOFF,
  ...NODE_SYSTEM,
}

export function getErrorEntry(code: string): StructuredErrorEntry | undefined {
  return REGISTRY[code]
}

export function hasErrorEntry(code: string): boolean {
  return code in REGISTRY
}

/**
 * Test-only: returns all registered codes. Used by the unit test that asserts
 * the matrix in the plan file stays in sync with this registry.
 */
export function listErrorCodes(): string[] {
  return Object.keys(REGISTRY)
}
