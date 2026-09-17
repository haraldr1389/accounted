#!/usr/bin/env python3
"""Final extraction of leaves needing bokmål repair (nynorsk or Swedish forms),
excluding false positives. Writes batches to messages-parts/fix/."""
import json, re
from pathlib import Path

REPO = Path('/Users/harald/projects/accounted')
no = json.loads((REPO/'messages'/'no.json').read_text(encoding='utf-8'))

TOKENS = [
    # Swedish forms (never correct bokmål)
    'och','att','är','för','från','till','dagar','månad','månader','vecka','veckor',
    'hämta','hämtar','hämtas','ladda','stänga','öppna','ändra','spara','sparad','söka',
    'ange','finns','saknas','företag','belopp','leverantör','räkenskapsår','årsredovisning',
    'moms','försäljning','inköp','ordrar','kontoutdrag','koppla','kvitton','importera',
    'återstår','granska','rättelse','dubblett','kronor','skicka','välj','kontrollera',
    'tolkar','betald','skickad','makulerad','krediterad','momsdeklaration','momskod',
    'arbetsgivardeklaration','återbetalning','förfallodatum','förfallen','betalning',
    'värdet','namnet','datumet','denna','detta','samma','endast','även','redan','aldrig',
    'igen','tillbaka','anställd','anställda','lönekörning','förskjuts','numrering',
    'vyn','fliken','fältet','innebär','avser','hittades','misslyckades','krävs',
    'måste','gäller','innehåller','listan','ändring','hämtning',
    # Nynorsk-only forms (never correct bokmål)
    'utan','vart','eg','ikkje','kva','korleis','noko','nokon','nokre','dei','ein','eit',
    'følgjer','endar','mogeleg','vert','berre','sjølv','frå','desse','mykje','saman',
    'veke','veker','kjem','kome','høyrer','dykkar','koplast','handterast','finst',
    'sine','nedan','herfrå','enkeltvise','ein','eit',
    # More nynorsk verb/noun forms seen in audit
    'hentar','henta','synkar','synka','oppretta','lagra','sletta','endra','vel',
    'brukar','nyttar','skriv','les','finn','gjev','gjer','kom','vart','vart',
]

pat = re.compile(r'\b(' + '|'.join(sorted(set(TOKENS), key=len, reverse=True)) + r')\b', re.IGNORECASE)

def walk(node, prefix=''):
    for k, v in node.items():
        p = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            yield from walk(v, p)
        else:
            yield p, v

problems = {p: v for p, v in walk(no) if isinstance(v, str) and pat.search(v)}
print(f'leaves to repair: {len(problems)}')

items = list(problems.items())
BATCH = 20
outdir = REPO/'messages-parts'/'fix'
outdir.mkdir(parents=True, exist_ok=True)
for f in outdir.glob('f*'):
    f.unlink()
n = 0
for i in range(0, len(items), BATCH):
    json.dump(dict(items[i:i+BATCH]), open(outdir/f'f{i//BATCH:03d}.source.json','w',encoding='utf-8'), ensure_ascii=False, indent=2)
    n += 1
print(f'batches: {n}')
