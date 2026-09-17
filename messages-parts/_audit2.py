#!/usr/bin/env python3
"""Audit every chunk for values left in Swedish, using a strong Swedish-word detector."""
import json, re
from pathlib import Path

BASE = Path('/Users/harald/projects/accounted/messages-parts/leafchunks')

# Swedish-specific words/forms that essentially never occur in Norwegian bokmål
SV_WORDS = re.compile(
    r'\b('
    r'och|att|är|för|med|inte|kan|vid|eller|som|av|till|från|månader|månad|veckor|dagar|'
    r'hämta|hämtar|hämtning|stänga|stäng|öppna|öppnar|ladda|laddar|skapa|skapar|visar|visa|'
    r'ändra|ändrar|spara|sparar|ta bort|söker|sök|ange|anger|ange|fyll|fyller|'
    r'kunde|kunde inte|måste|ska|kommer|finns|saknas|gäller|avser|innehåller|'
    r'företag|företaget|kr|belopp|underlag|verifikation|verifikat|konton|kontot|kontoplan|'
    r'faktura|fakturan|kund|kunden|leverantör|anställd|anställda|lönekörning|'
    r'moms|momsen|momsdeklaration|momskod|ingående|utgående|skattetabell|arbetsgivardeklaration|'
    r'räkenskapsår|årsredovisning|bokslut|bokföring|bokfört|kontering|konteringsförslag|'
    r'rättelse|dubblett|periodspärr|saldo|saldon|insättning|uttag|'
    r'påminnelse|betalning|förfallodatum|förfallen|makulera|kreditera|'
    r'filen|filerna|sidan|listan|värdet|värden|texten|namnet|datumet|'
    r'är|kan|vill|behöver|behövs|krävs|kräver|'
    r'denna|detta|dessa|samma|endast|även|redan|alltid|aldrig|'
    r'igen|tillbaka|ned|ladda ner|skriv ut'
    r')\b',
    re.IGNORECASE,
)

report = []
for i in range(35):
    sp = BASE / f'l{i:03d}.source.json'
    tp = BASE / f'l{i:03d}.target.json'
    s = json.loads(sp.read_text(encoding='utf-8'))
    t = json.loads(tp.read_text(encoding='utf-8'))
    suspects = [(k, s[k]) for k in s if isinstance(s[k], str) and s[k] == t.get(k) and SV_WORDS.search(s[k])]
    if suspects:
        report.append((i, len(suspects), suspects))

report.sort(key=lambda x: -x[1])
total = sum(r[1] for r in report)
print(f'chunks with Swedish leftovers: {len(report)} | total suspect strings: {total}\n')
for i, n, sus in report:
    print(f'--- l{i:03d}: {n} suspects ---')
    for k, v in sus[:4]:
        print(f'   {k}: {v[:100]}')
