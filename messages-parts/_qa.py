#!/usr/bin/env python3
"""Final QA on messages/no.json: validity, key parity, placeholder parity,
ICU plural sanity, and residual Swedish/nynorsk detection."""
import json, re
from pathlib import Path

REPO = Path('/Users/harald/projects/accounted')
no = json.loads((REPO/'messages'/'no.json').read_text(encoding='utf-8'))
sv = json.loads((REPO/'messages'/'sv.json').read_text(encoding='utf-8'))

def walk(node, prefix=''):
    for k, v in node.items():
        p = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            yield from walk(v, p)
        else:
            yield p, v

sv_map = dict(walk(sv))
no_map = dict(walk(no))

print(f'sv leaves: {len(sv_map)} | no leaves: {len(no_map)}')
print(f'missing: {len(set(sv_map)-set(no_map))} | extra: {len(set(no_map)-set(sv_map))}')

# 1. type parity
typebad = [k for k in sv_map if type(sv_map[k]) is not type(no_map.get(k))]
print(f'type mismatches: {len(typebad)}')

# 2. placeholder parity (simple {name}, {count}, {date} ...)
ph = re.compile(r'\{([a-zA-Z_][a-zA-Z0-9_]*)\}')
phbad = []
for k, v in sv_map.items():
    t = no_map.get(k)
    if isinstance(v, str) and isinstance(t, str):
        if sorted(ph.findall(v)) != sorted(ph.findall(t)):
            phbad.append((k, ph.findall(v), ph.findall(t)))
print(f'placeholder mismatches: {len(phbad)}')
for k, a, b in phbad[:12]:
    print(f'   {k}: sv={a} no={b}')

# 3. ICU plural structure parity
icubad = []
for k, v in sv_map.items():
    t = no_map.get(k)
    if isinstance(v, str) and isinstance(t, str):
        a = v.count('plural,')
        b = t.count('plural,')
        if a != b:
            icubad.append((k, a, b))
print(f'ICU plural mismatches: {len(icubad)}')
for k, a, b in icubad[:10]:
    print(f'   {k}: sv={a} no={b}')

# 4. empty values
empty = [k for k, v in no_map.items() if isinstance(v, str) and v.strip() == '' and isinstance(sv_map.get(k), str) and sv_map[k].strip() != '']
print(f'newly-empty values: {len(empty)}')

# 5. residual Swedish/nynorsk
TOKENS = ['och','att','är','för','från','till','dagar','månad','månader','vecka','veckor',
 'hämta','hämtar','hämtas','ladda','stänga','öppna','ändra','spara','sparad','söka','ange',
 'finns','saknas','företag','belopp','leverantör','räkenskapsår','årsredovisning','moms',
 'försäljning','inköp','ordrar','kontoutdrag','koppla','kvitton','importera','återstår',
 'granska','rättelse','dubblett','kronor','skicka','välj','kontrollera','tolkar','betald',
 'skickad','makulerad','krediterad','momsdeklaration','momskod','arbetsgivardeklaration',
 'återbetalning','förfallodatum','förfallen','betalning','värdet','namnet','datumet','denna',
 'detta','samma','endast','även','redan','aldrig','igen','tillbaka','anställd','anställda',
 'lönekörning','förskjuts','numrering','vyn','fliken','fältet','innebär','avser','hittades',
 'misslyckades','krävs','måste','gäller','innehåller','listan','ändring','hämtning','utan',
 'vart','eg','ikkje','kva','korleis','noko','nokon','nokre','dei','ein','eit','følgjer',
 'endar','mogeleg','vert','berre','sjølv','frå','desse','mykje','saman','veke','veker',
 'kjem','kome','høyrer','dykkar','koplast','handterast','finst','nedan','herfrå','enkeltvise',
 'hentar','henta','synkar','synka','oppretta','lagra','sletta','endra','brukar','nyttar','gjev','gjer']
pat = re.compile(r'\b(' + '|'.join(TOKENS) + r')\b', re.IGNORECASE)
resid = [(k, v) for k, v in no_map.items() if isinstance(v, str) and pat.search(v)]
print(f'residual Swedish/nynorsk leaves: {len(resid)}')
for k, v in resid:
    print(f'   {k}: {v[:110]}')
