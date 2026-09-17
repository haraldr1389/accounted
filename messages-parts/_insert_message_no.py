#!/usr/bin/env python3
"""Insert message_no after every message_sv in lib/errors/structured-errors.ts."""
import json
from pathlib import Path

REPO = Path('/Users/harald/projects/accounted')
SRC = REPO/'lib'/'errors'/'structured-errors.ts'
ERR = REPO/'messages-parts'/'errors'

pairs = json.loads((ERR/'pairs.json').read_text(encoding='utf-8'))

# 1. gather translations, keyed by CODE__index
trans = {}
for f in sorted(ERR.glob('batch_*.target.json')):
    d = json.loads(f.read_text(encoding='utf-8'))
    trans.update(d)
print(f'translations gathered: {len(trans)}')
print(f'expected: {len(pairs)}')

# 2. map index -> norwegian
missing = []
by_index = {}
for i, p in enumerate(pairs):
    key = f'{p["code"]}__{i}'
    if key in trans:
        by_index[i] = trans[key]
    else:
        missing.append(key)
print(f'missing translations: {len(missing)}')
for k in missing[:10]:
    print('  ', k)

# 3. report untranslated (identical to source)
same = [(pairs[i]['code'], pairs[i]['msg']) for i in by_index
        if by_index[i] == pairs[i]['msg']]
print(f'translations identical to Swedish: {len(same)}')
for c, m in same[:15]:
    print(f'   {c}: {m[:90]}')

# 4. build insertions
def esc(s):
    return s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n')

text = SRC.read_text(encoding='utf-8')
insertions = []
for i, val in by_index.items():
    end = pairs[i]['msg_end']     # index right after the closing quote
    insertions.append((end, val))

# insert from the end backwards so earlier offsets stay valid
insertions.sort(key=lambda t: -t[0])
for pos, val in insertions:
    text = text[:pos] + ",\n    message_no: '" + esc(val) + "'" + text[pos:]

SRC.write_text(text, encoding='utf-8')
print(f'\ninserted message_no for {len(insertions)} entries')
print(f'new message_no count: {text.count("message_no:")}')
