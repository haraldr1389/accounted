#!/usr/bin/env python3
"""Add `no` to every inline `{ sv: '...', en: '...' }` literal in get-error-message.ts."""
import re
from pathlib import Path

P = Path('/Users/harald/projects/accounted/lib/errors/get-error-message.ts')
text = P.read_text(encoding='utf-8')

NO = {
    # POSTGRES_ERROR_MAP
    'En post med samma uppgifter finns redan.': 'En post med samme opplysninger finnes allerede.',
    'Posten kan inte ändras eftersom den refereras av annan data.': 'Posten kan ikke endres fordi den refereres til av andre data.',
    'Ett obligatoriskt fält saknas.': 'Et obligatorisk felt mangler.',
    'Du har inte behörighet att utföra denna åtgärd.': 'Du har ikke tilgang til å utføre denne handlingen.',
    'Resursen kunde inte hittas.': 'Ressursen kunne ikke finnes.',
    'Värdet uppfyller inte de tillåtna kraven.': 'Verdien oppfyller ikke de tillatte kravene.',
    'En annan ändring pågick samtidigt. Försök igen.': 'En annen endring pågikk samtidig. Prøv igjen.',
    'En konflikt uppstod. Försök igen.': 'Det oppstod en konflikt. Prøv igjen.',
    'Ogiltigt värde angavs.': 'Ugyldig verdi oppgitt.',
    'Värdet är utanför tillåtet intervall.': 'Verdien er utenfor tillatt intervall.',
    # HTTP_STATUS_MAP
    'Förfrågan innehåller ogiltiga uppgifter.': 'Forespørselen inneholder ugyldige opplysninger.',
    'Din session har gått ut. Logga in igen.': 'Økten din har utløpt. Logg inn på nytt.',
    'En konflikt uppstod. Ladda om sidan och försök igen.': 'Det oppstod en konflikt. Last inn siden på nytt og prøv igjen.',
    'Filen är för stor för att skickas. Försök igen med en mindre fil.': 'Filen er for stor til å sendes. Prøv igjen med en mindre fil.',
    'Filtypen stöds inte.': 'Filtypen støttes ikke.',
    'Uppgifterna kunde inte bearbetas. Kontrollera fälten och försök igen.': 'Opplysningene kunne ikke behandles. Kontroller feltene og prøv igjen.',
    'För många förfrågningar. Vänta en stund och försök igen.': 'For mange forespørsler. Vent litt og prøv igjen.',
    'Ett oväntat serverfel uppstod. Försök igen senare.': 'Det oppstod en uventet serverfeil. Prøv igjen senere.',
    'Servern är tillfälligt otillgänglig. Försök igen om en stund.': 'Serveren er midlertidig utilgjengelig. Prøv igjen om litt.',
    'Tjänsten är tillfälligt otillgänglig. Försök igen om en stund.': 'Tjenesten er midlertidig utilgjengelig. Prøv igjen om litt.',
    # CONTEXT_FALLBACKS
    'Kunde inte hantera fakturan. Försök igen.': 'Kunne ikke behandle fakturaen. Prøv igjen.',
    'Kunde inte hantera leverantörsfakturan. Försök igen.': 'Kunne ikke behandle leverandørfakturaen. Prøv igjen.',
    'Kunde inte hantera kunden. Försök igen.': 'Kunne ikke behandle kunden. Prøv igjen.',
    'Kunde inte hantera artikeln. Försök igen.': 'Kunne ikke behandle artikkelen. Prøv igjen.',
    'Kunde inte hantera leverantören. Försök igen.': 'Kunne ikke behandle leverandøren. Prøv igjen.',
    'Kunde inte hantera transaktionen. Försök igen.': 'Kunne ikke behandle transaksjonen. Prøv igjen.',
    'Kunde inte hantera verifikationen. Försök igen.': 'Kunne ikke behandle bilaget. Prøv igjen.',
    'Kunde inte spara inställningarna. Försök igen.': 'Kunne ikke lagre innstillingene. Prøv igjen.',
    'Ett fel uppstod vid inloggningen. Försök igen.': 'Det oppstod en feil ved innloggingen. Prøv igjen.',
    'Kunde inte hantera löneuppgifterna. Försök igen.': 'Kunne ikke behandle lønnsdataene. Prøv igjen.',
    # GENERIC_FALLBACK
    'Något gick fel. Försök igen.': 'Noe gikk galt. Prøv igjen.',
    # PROVIDER_REASON_PREFIX
    'Leverantörens svar': 'Leverandørens svar',
}

def esc(s):
    return s.replace('\\', '\\\\').replace("'", "\\'")

# Inline `{ sv: 'X', en: 'Y' }` (single line, possibly spread over one line)
pat = re.compile(r"\{ sv: '((?:[^'\\]|\\.)*)', en: '((?:[^'\\]|\\.)*)' \}")

added = 0
unknown = []

def repl(m):
    global added
    sv = m.group(1)
    if sv in NO:
        added += 1
        return "{ sv: '" + sv + "', en: '" + m.group(2) + "', no: '" + esc(NO[sv]) + "' }"
    unknown.append(sv)
    return m.group(0)

text = pat.sub(repl, text)

# Multi-line PROVIDER_REASON_PREFIX block
ml = re.compile(r"const PROVIDER_REASON_PREFIX: Bilingual = \{\n  sv: '([^']*)',\n  en: '([^']*)',\n\}")
def repl2(m):
    global added
    sv = m.group(1)
    if sv in NO:
        added += 1
        return ("const PROVIDER_REASON_PREFIX: Bilingual = {\n"
                f"  sv: '{sv}',\n  en: '{m.group(2)}',\n  no: '{esc(NO[sv])}',\n}}")
    unknown.append(sv)
    return m.group(0)

text = ml.sub(repl2, text)

P.write_text(text, encoding='utf-8')
print(f'no-variants added: {added}')
print(f'unmatched sv strings: {len(unknown)}')
for u in unknown:
    print('  ', u)
