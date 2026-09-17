#!/usr/bin/env python3
"""Merge fix/*.target.json back into messages/no.json, then re-audit."""
import json, re
from pathlib import Path

REPO = Path('/Users/harald/projects/accounted')
FIX = REPO/'messages-parts'/'fix'

no = json.loads((REPO/'messages'/'no.json').read_text(encoding='utf-8'))

def set_path(node, path, value):
    parts = path.split('.')
    cur = node
    for p in parts[:-1]:
        cur = cur[p]
    cur[parts[-1]] = value

applied = 0
rejected = []
for f in sorted(FIX.glob('f*.target.json')):
    srcp = Path(str(f).replace('.target.json', '.source.json'))
    try:
        tgt = json.loads(f.read_text(encoding='utf-8'))
    except Exception as e:
        rejected.append((f.name, str(e)[:50]))
        continue
    srck = set(json.loads(srcp.read_text(encoding='utf-8')).keys())
    if set(tgt.keys()) != srck:
        rejected.append((f.name, f'keyset mismatch {len(set(tgt)-srck)}/{len(srck-set(tgt))}'))
        continue
    for k, v in tgt.items():
        if isinstance(v, str):
            set_path(no, k, v)
            applied += 1

print(f'applied: {applied} values')
print(f'rejected files: {len(rejected)}')
for r in rejected:
    print('  ', r)

(REPO/'messages'/'no.json').write_text(
    json.dumps(no, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# --- re-audit ---
TOKENS = ['och','att','är','för','från','till','dagar','månad','månader','vecka','veckor',
 'hämta','hämtar','hämtas','ladda','stänga','öppna','ändra','spara','sparad','söka','ange',
 'finns','saknas','företag','belopp','leverantör','räkenskapsår','årsredovisning','moms',
 'försäljning','inköp','ordrar','kontoutdrag','koppla','kvitton','importera','återstår',
 'granska','rättelse','dubblett','kronor','skicka','välj','kontrollera','tolkar','betald',
 'skickad','makulerad','krediterad','momsdeklaration','momskod','arbetsgivardeklaration',
 'återbetalning','förfallodatum','förfallen','betalning','värdet','namnet','datumet','denna',
 'detta','samma','endast','även','redan','aldrig','igen','tillbaka','anställd','anställda',
 'lönekörning','förskjuts','numrering','vyn','fliken','fältet','innebär','avser','hittades',
 'misslyckades','krävs','måste','gäller','innehåller','listan','ändring','hämtning',
 'utan','vart','eg','ikkje','kva','korleis','noko','nokon','nokre','dei','ein','eit',
 'følgjer','endar','mogeleg','vert','berre','sjølv','frå','desse','mykje','saman','veke',
 'veker','kjem','kome','høyrer','dykkar','koplast','handterast','finst','sine','nedan',
 'herfrå','enkeltvise','hentar','henta','synkar','synka','oppretta','lagra','sletta','endra',
 'brukar','nyttar','gjev','gjer']
pat = re.compile(r'\b(' + '|'.join(sorted(set(TOKENS), key=len, reverse=True)) + r')\b', re.IGNORECASE)

def walk(node, prefix=''):
    for k, v in node.items():
        p = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            yield from walk(v, p)
        else:
            yield p, v

left = [(p, v) for p, v in walk(no) if isinstance(v, str) and pat.search(v)]
print(f'\nremaining leaves with Swedish/nynorsk tokens: {len(left)}')
for p, v in left[:25]:
    print(f'  {p}: {v[:100]}')

# key parity vs sv
sv = json.loads((REPO/'messages'/'sv.json').read_text(encoding='utf-8'))
sl = {p for p, _ in walk(sv)}
nl = {p for p, _ in walk(no)}
print(f'\nsv leaves {len(sl)} | no leaves {len(nl)} | missing {len(sl-nl)} | extra {len(nl-sl)}')
