#!/usr/bin/env python3
"""Prepare translation batches for the 740 message_sv entries."""
import json
from pathlib import Path

REPO = Path('/Users/harald/projects/accounted')
pairs = json.loads((REPO/'messages-parts'/'errors'/'pairs.json').read_text(encoding='utf-8'))
print(f'pairs: {len(pairs)}')

items = []
for i, p in enumerate(pairs):
    key = f'{p["code"]}__{i}'
    items.append((key, p['msg']))

BATCH = 20
outdir = REPO/'messages-parts'/'errors'
for f in outdir.glob('batch_*.source.json'):
    f.unlink()

n = 0
for i in range(0, len(items), BATCH):
    chunk = dict(items[i:i+BATCH])
    json.dump(chunk, open(outdir/f'batch_{i//BATCH:03d}.source.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)
    n += 1
print(f'batches: {n}')

# report longest messages (they matter most)
longest = sorted(items, key=lambda kv: -len(kv[1]))[:5]
for k, v in longest:
    print(f'  {len(v):4d}  {k}: {v[:80]}')
