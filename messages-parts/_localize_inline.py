#!/usr/bin/env python3
"""Make the remaining Swedish strings in get-error-message.ts locale-aware."""
from pathlib import Path

P = Path('/Users/harald/projects/accounted/lib/errors/get-error-message.ts')
t = P.read_text(encoding='utf-8')

def rep(old, new, label):
    n = t.count(old)
    if n != 1:
        raise SystemExit(f'FAIL [{label}]: expected 1 occurrence, found {n}')
    return t.replace(old, new)

# ---------------------------------------------------------------- helpers
t = rep(
    """function pick(b: Bilingual, locale: ErrorLocale): string {
  return b[locale] ?? b.sv
}""",
    """function pick(b: Bilingual, locale: ErrorLocale): string {
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
}""",
    'helpers',
)

# ---------------------------------------------------------------- validation branch
t = rep(
    "const label = source ? (locale === 'en' ? `Source account ${source}` : `Källkonto ${source}`) : field",
    "const label = source\n                ? locale === 'en'\n                  ? `Source account ${source}`\n                  : locale === 'no'\n                  ? `Kildekonto ${source}`\n                  : `Källkonto ${source}`\n                : field",
    'sourceAccount label',
)

t = rep(
    """              const message = /^accounts\\.\\d+\\.number$/.test(field)
                ? locale === 'en'
                  ? 'The account could not be created. Select a target account with exactly four digits in the account mapping step.'
                  : 'Kontot kunde inte skapas. Välj ett målkonto med exakt fyra siffror i kontomappningen.'
                : field.endsWith('targetAccount')
                ? locale === 'en'
                  ? 'The target account must have exactly four digits. Select an account in the account mapping step.'
                  : 'Målkontot måste ha exakt fyra siffror. Välj ett konto i kontomappningen.'
                : locale === 'en' ? 'The account number must contain four digits.' : ACCOUNT_NUMBER_MESSAGE""",
    """              const message = /^accounts\\.\\d+\\.number$/.test(field)
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
                : locale === 'en' ? 'The account number must contain four digits.' : ACCOUNT_NUMBER_MESSAGE""",
    'account number message',
)

t = rep(
    "? ` (+${remaining} ${locale === 'en' ? 'more' : 'till'})` : ''",
    "? ` (+${remaining} ${locale === 'en' ? 'more' : locale === 'no' ? 'flere' : 'till'})` : ''",
    'validation remainder',
)

t = rep(
    "const more = items.length > 5 ? ` (+${items.length - 5} till)` : ''",
    "const more = items.length > 5\n      ? ` (+${items.length - 5} ${locale === 'no' ? 'flere' : 'till'})`\n      : ''",
    'details remainder',
)

# ---------------------------------------------------------------- structured branches
PAIRS = [
    (
        "return `Följande konton behöver aktiveras: ${numbers.join(', ')}`",
        "return loc(\n          `Följande konton behöver aktiveras: ${numbers.join(', ')}`,\n          `Følgende kontoer må aktiveres: ${numbers.join(', ')}`,\n          locale,\n        )",
        'ACCOUNTS_NOT_IN_CHART',
    ),
    (
        "          return `Verifikationen balanserar inte (${formatCurrency(details.totalDebit)} debet vs ${formatCurrency(details.totalCredit)} kredit).`",
        "          return loc(\n            `Verifikationen balanserar inte (${formatCurrency(details.totalDebit)} debet vs ${formatCurrency(details.totalCredit)} kredit).`,\n            `Bilaget balanserer ikke (${formatCurrency(details.totalDebit)} debet mot ${formatCurrency(details.totalCredit)} kredit).`,\n            locale,\n          )",
        'JOURNAL_ENTRY_NOT_BALANCED dynamic',
    ),
    (
        "return 'Verifikationen balanserar inte. Kontrollera att debet och kredit är lika stora.'",
        "return loc(\n          'Verifikationen balanserar inte. Kontrollera att debet och kredit är lika stora.',\n          'Bilaget balanserer ikke. Kontroller at debet og kredit er like store.',\n          locale,\n        )",
        'JOURNAL_ENTRY_NOT_BALANCED static',
    ),
    (
        "return 'En verifikationsrad har ett negativt belopp. Boka beloppet på motsatt sida i stället.'",
        "return loc(\n          'En verifikationsrad har ett negativt belopp. Boka beloppet på motsatt sida i stället.',\n          'En bilagslinje har et negativt beløp. Bokfør beløpet på motsatt side i stedet.',\n          locale,\n        )",
        'JOURNAL_LINE_NEGATIVE_AMOUNT',
    ),
    (
        "return 'En verifikationsrad kan inte ha både debet och kredit nollskilda.'",
        "return loc(\n          'En verifikationsrad kan inte ha både debet och kredit nollskilda.',\n          'En bilagslinje kan ikke ha både debet og kredit ulik null.',\n          locale,\n        )",
        'JOURNAL_LINE_BOTH_SIDES_NONZERO',
    ),
    (
        "return 'Räkenskapsperioden kunde inte hittas.'",
        "return loc('Räkenskapsperioden kunde inte hittas.', 'Regnskapsperioden kunne ikke finnes.', locale)",
        'FISCAL_PERIOD_NOT_FOUND',
    ),
    (
        "return 'Datumet ligger utanför det valda räkenskapsåret.'",
        "return loc('Datumet ligger utanför det valda räkenskapsåret.', 'Datoen ligger utenfor det valgte regnskapsåret.', locale)",
        'ENTRY_DATE_OUTSIDE_FISCAL_PERIOD',
    ),
    (
        "return 'Verifikationen kunde inte hittas.'",
        "return loc('Verifikationen kunde inte hittas.', 'Bilaget kunne ikke finnes.', locale)",
        'JOURNAL_ENTRY_NOT_FOUND',
    ),
    (
        "return 'Endast bokförda verifikationer kan stornas.'",
        "return loc('Endast bokförda verifikationer kan stornas.', 'Bare bokførte bilag kan stornes.', locale)",
        'CANNOT_REVERSE_NON_POSTED',
    ),
    (
        "return 'Endast bokförda verifikationer kan rättas.'",
        "return loc('Endast bokförda verifikationer kan rättas.', 'Bare bokførte bilag kan rettes.', locale)",
        'CANNOT_CORRECT_NON_POSTED',
    ),
    (
        "return 'Verifikationen har redan stornats av en annan användare. Ladda om sidan och försök igen.'",
        "return loc(\n          'Verifikationen har redan stornats av en annan användare. Ladda om sidan och försök igen.',\n          'Bilaget er allerede stornert av en annen bruker. Last inn siden på nytt og prøv igjen.',\n          locale,\n        )",
        'ENTRY_ALREADY_REVERSED',
    ),
    (
        "return 'En valutaomvärdering finns redan för denna period.'",
        "return loc(\n          'En valutaomvärdering finns redan för denna period.',\n          'En valutaomvurdering finnes allerede for denne perioden.',\n          locale,\n        )",
        'CURRENCY_REVALUATION_ALREADY_EXISTS',
    ),
    (
        "return `Ingen valutakurs från Riksbanken finns för ${what}. Valutaomvärderingen har inte bokförts: en uppskattad kurs får inte bokföras mot 3960/7960. Försök igen när kursen är publicerad.`",
        "return loc(\n          `Ingen valutakurs från Riksbanken finns för ${what}. Valutaomvärderingen har inte bokförts: en uppskattad kurs får inte bokföras mot 3960/7960. Försök igen när kursen är publicerad.`,\n          `Ingen valutakurs fra Norges Bank finnes for ${what}. Valutaomvurderingen er ikke bokført: en anslått kurs kan ikke bokføres mot 3960/7960. Prøv igjen når kursen er publisert.`,\n          locale,\n        )",
        'FX_CLOSING_RATE_UNAVAILABLE',
    ),
    (
        "return 'Kontering saknas för transaktionen. Kontrollera bokföringsreglerna.'",
        "return loc(\n          'Kontering saknas för transaktionen. Kontrollera bokföringsreglerna.',\n          'Kontering mangler for transaksjonen. Kontroller bokføringsreglene.',\n          locale,\n        )",
        'INVALID_MAPPING_RESULT',
    ),
    (
        "return 'Ett angivet kostnadsställe/projekt finns inte i dimensionsregistret eller är arkiverat. Skapa värdet i registret först.'",
        "return loc(\n          'Ett angivet kostnadsställe/projekt finns inte i dimensionsregistret eller är arkiverat. Skapa värdet i registret först.',\n          'Et angitt kostnadssted/prosjekt finnes ikke i dimensjonsregisteret eller er arkivert. Opprett verdien i registeret først.',\n          locale,\n        )",
        'DIMENSION_VALIDATION_FAILED',
    ),
    (
        "return 'Det finns ingen räkenskapsperiod som täcker det valda datumet. Skapa eller öppna räkenskapsåret först.'",
        "return loc(\n          'Det finns ingen räkenskapsperiod som täcker det valda datumet. Skapa eller öppna räkenskapsåret först.',\n          'Det finnes ingen regnskapsperiode som dekker den valgte datoen. Opprett eller åpne regnskapsåret først.',\n          locale,\n        )",
        'NO_OPEN_PERIOD_FOR_DATE',
    ),
    (
        "return 'Räkenskapsåret för det valda datumet är stängt (bokslut) och kan inte återöppnas. Bokför rättelsen i innevarande period istället.'",
        "return loc(\n          'Räkenskapsåret för det valda datumet är stängt (bokslut) och kan inte återöppnas. Bokför rättelsen i innevarande period istället.',\n          'Regnskapsåret for den valgte datoen er stengt (regnskapsavslutning) og kan ikke gjenåpnes. Bokfør rettelsen i inneværende periode i stedet.',\n          locale,\n        )",
        'TARGET_PERIOD_CLOSED',
    ),
    (
        "          ? `Räkenskapsperioden för det valda datumet är låst (t.o.m. ${details.lockDate}). Lås upp perioden för att flytta verifikationen dit.`\n          : 'Räkenskapsperioden för det valda datumet är låst. Lås upp perioden för att flytta verifikationen dit.'",
        "          ? loc(\n              `Räkenskapsperioden för det valda datumet är låst (t.o.m. ${details.lockDate}). Lås upp perioden för att flytta verifikationen dit.`,\n              `Regnskapsperioden for den valgte datoen er låst (t.o.m. ${details.lockDate}). Lås opp perioden for å flytte bilaget dit.`,\n              locale,\n            )\n          : loc(\n              'Räkenskapsperioden för det valda datumet är låst. Lås upp perioden för att flytta verifikationen dit.',\n              'Regnskapsperioden for den valgte datoen er låst. Lås opp perioden for å flytte bilaget dit.',\n              locale,\n            )",
        'TARGET_PERIOD_LOCKED',
    ),
    (
        "          ? `Bokföringen är låst t.o.m. ${details.lockDate} och ingående balanser kan inte korrigeras. Ta bort eller flytta låsdatumet under Inställningar → Bokföring och försök igen.`\n          : 'Bokföringen är låst av företagets låsdatum och ingående balanser kan inte korrigeras. Ta bort eller flytta låsdatumet under Inställningar → Bokföring och försök igen.'",
        "          ? loc(\n              `Bokföringen är låst t.o.m. ${details.lockDate} och ingående balanser kan inte korrigeras. Ta bort eller flytta låsdatumet under Inställningar → Bokföring och försök igen.`,\n              `Bokføringen er låst t.o.m. ${details.lockDate} og inngående balanser kan ikke korrigeres. Fjern eller flytt låsedatoen under Innstillinger → Bokføring og prøv igjen.`,\n              locale,\n            )\n          : loc(\n              'Bokföringen är låst av företagets låsdatum och ingående balanser kan inte korrigeras. Ta bort eller flytta låsdatumet under Inställningar → Bokföring och försök igen.',\n              'Bokføringen er låst av foretakets låsedato og inngående balanser kan ikke korrigeres. Fjern eller flytt låsedatoen under Innstillinger → Bokføring og prøv igjen.',\n              locale,\n            )",
        'OB_COMPANY_LOCK_DATE',
    ),
    (
        "          return 'Det nya datumet är samma som det nuvarande: det finns inget att flytta.'",
        "          return loc(\n            'Det nya datumet är samma som det nuvarande: det finns inget att flytta.',\n            'Den nye datoen er den samme som den nåværende: det er ingenting å flytte.',\n            locale,\n          )",
        'MEANINGLESS_CORRECTION no_date_change',
    ),
    (
        "          return 'Rättelsen är identisk med originalverifikationen: inget har ändrats.'",
        "          return loc(\n            'Rättelsen är identisk med originalverifikationen: inget har ändrats.',\n            'Rettelsen er identisk med originalbilaget: ingenting er endret.',\n            locale,\n          )",
        'MEANINGLESS_CORRECTION identical',
    ),
    (
        "        return 'Rättelsen saknar ekonomisk innebörd: varje konto netto till noll. En rättelse måste beskriva en faktisk affärshändelse (BFL 5 kap. 5 §).'",
        "        return loc(\n          'Rättelsen saknar ekonomisk innebörd: varje konto netto till noll. En rättelse måste beskriva en faktisk affärshändelse (BFL 5 kap. 5 §).',\n          'Rettelsen mangler økonomisk innhold: hver konto netto til null. En rettelse må beskrive en faktisk forretningshendelse (regnskapsloven § 5-1).',\n          locale,\n        )",
        'MEANINGLESS_CORRECTION fallback',
    ),
    (
        "            ? `Kedjan är redan ${details.depth} nivåer djup`\n            : 'Rättelsekedjan är redan flera nivåer djup'",
        "            ? loc(\n                `Kedjan är redan ${details.depth} nivåer djup`,\n                `Kjeden er allerede ${details.depth} nivåer dyp`,\n                locale,\n              )\n            : loc('Rättelsekedjan är redan flera nivåer djup', 'Rettelseskjeden er allerede flere nivåer dyp', locale)",
        'CORRECTION_CHAIN_TOO_DEEP depth',
    ),
    (
        "          ? ` (ursprungsverifikat ${details.chainRootVoucher})`",
        "          ? loc(\n              ` (ursprungsverifikat ${details.chainRootVoucher})`,\n              ` (opprinnelig bilag ${details.chainRootVoucher})`,\n              locale,\n            )",
        'CORRECTION_CHAIN_TOO_DEEP root',
    ),
    (
        "        return `${depthPart}${rootPart}. Räkna ut nettoeffekten av hela kedjan och gör EN rättelse istället, eller skicka allow_deep_chain=true för att rätta ändå.`",
        "        return loc(\n          `${depthPart}${rootPart}. Räkna ut nettoeffekten av hela kedjan och gör EN rättelse istället, eller skicka allow_deep_chain=true för att rätta ändå.`,\n          `${depthPart}${rootPart}. Regn ut nettoeffekten av hele kjeden og gjør ÉN rettelse i stedet, eller send allow_deep_chain=true for å rette likevel.`,\n          locale,\n        )",
        'CORRECTION_CHAIN_TOO_DEEP body',
    ),
    (
        "return 'Verifikationen kunde inte sparas. Försök igen.'",
        "return loc('Verifikationen kunde inte sparas. Försök igen.', 'Bilaget kunne ikke lagres. Prøv igjen.', locale)",
        'BOOKKEEPING_DATABASE_ERROR',
    ),
]

for old, new, label in PAIRS:
    t = rep(old, new, label)

P.write_text(t, encoding='utf-8')
print(f'converted {len(PAIRS) + 5} sites')
