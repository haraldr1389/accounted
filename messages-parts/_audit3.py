#!/usr/bin/env python3
"""Find leaves in messages/no.json that still contain Swedish-specific forms
that differ from Norwegian bokmål."""
import json, re
from pathlib import Path

REPO = Path('/Users/harald/projects/accounted')
no = json.loads((REPO / 'messages' / 'no.json').read_text(encoding='utf-8'))
sv = json.loads((REPO / 'messages' / 'sv.json').read_text(encoding='utf-8'))

# Tokens whose Swedish form is NOT the Norwegian form (case-insensitive, word-boundary)
DIFF = {
    'och': 'og', 'att': 'å', 'är': 'er', 'för': 'for', 'inte': 'ikke', 'vid': 'ved',
    'till': 'til', 'från': 'fra', 'månad': 'måned', 'månader': 'måneder',
    'vecka': 'uke', 'veckor': 'uker', 'dagar': 'dager', 'hämta': 'hent', 'hämta': 'hent',
    'hämtar': 'henter', 'stänga': 'lukke', 'öppna': 'åpne', 'ladda': 'laste',
    'skapa': 'opprette', 'ändra': 'endre', 'spara': 'lagre', 'söka': 'søke',
    'ange': 'angi', 'kunde': 'kunne', 'måste': 'må', 'finns': 'finnes',
    'saknas': 'mangler', 'gäller': 'gjelder', 'innehåller': 'inneholder',
    'företag': 'foretak', 'belopp': 'beløp', 'kund': 'kunde',
    'leverantör': 'leverandør', 'anställd': 'ansatt', 'anställda': 'ansatte',
    'lönekörning': 'lønnskjøring', 'moms': 'mva', 'räkenskapsår': 'regnskapsår',
    'årsredovisning': 'årsregnskap', 'bokslut': 'regnskapsavslutning',
    'påminnelse': 'påminnelse', 'betalning': 'betaling', 'förfallodatum': 'forfallsdato',
    'förfallen': 'forfalt', 'listan': 'listen', 'värdet': 'verdien', 'namnet': 'navnet',
    'datumet': 'datoen', 'denna': 'denne', 'detta': 'dette', 'samma': 'samme',
    'endast': 'kun', 'även': 'også', 'redan': 'allerede', 'aldrig': 'aldri',
    'igen': 'igjen', 'tillbaka': 'tilbake', 'utan': 'uten', 'kontrollera': 'kontroller',
    'tolkar': 'tolker', 'stäng': 'lukk', 'välj': 'velg', 'skicka': 'send',
    'sparad': 'lagret', 'skickad': 'sendt', 'betald': 'betalt', 'makulerad': 'annullert',
    'krediterad': 'kreditert', 'utkast': 'utkast', 'momsdeklaration': 'momsoppgave',
    'momskod': 'mva-kode', 'ingående': 'inngående', 'utgående': 'utgående',
    'skattetabell': 'skattetabell', 'arbetsgivardeklaration': 'a-melding',
    'försäljning': 'salg', 'inköp': 'kjøp', 'återbetalning': 'refusjon',
    'ordrar': 'ordrer', 'butik': 'butikk', 'betalda': 'betalte', 'kontoutdrag': 'kontoutskrift',
    'bankkoppling': 'bankkobling', 'koppla': 'koble', 'mitt': 'midt', 'ackumulerade': 'akkumulerte',
    'semestersaldon': 'feriesaldoer', 'byta': 'bytte', 'stämts': 'avstemt', 'kontot': 'kontoen',
    'specifikation': 'spesifikasjon', 'kvitton': 'kvitteringer', 'personuppgifter': 'personopplysninger',
}

def walk(node, prefix=''):
    for k, v in node.items():
        p = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            yield from walk(v, p)
        else:
            yield p, v

pat = re.compile(r'\b(' + '|'.join(re.escape(w) for w in DIFF) + r')\b', re.IGNORECASE)

hits = []
for p, v in walk(no):
    if isinstance(v, str) and pat.search(v):
        hits.append((p, v))

print(f'leaves with Swedish-differing tokens: {len(hits)}\n')
# Group by token
from collections import defaultdict
bytok = defaultdict(list)
for p, v in hits:
    for m in pat.finditer(v):
        bytok[m.group(1).lower()].append((p, v))
for tok in sorted(bytok, key=lambda t: -len(bytok[t])):
    print(f'{tok} ({len(bytok[tok])}): {DIFF.get(tok,"?")}')
    for p, v in bytok[tok][:2]:
        print(f'    {p}: {v[:95]}')
