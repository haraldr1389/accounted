#!/usr/bin/env python3
"""List translated leaves that are byte-identical to Swedish, to spot genuine misses."""
import json, re
from pathlib import Path

REPO = Path('/Users/harald/projects/accounted')
flat = {}
for i in range(35):
    flat.update(json.loads((REPO/'messages-parts'/'leafchunks'/f'l{i:03d}.target.json').read_text(encoding='utf-8')))
sv = json.loads((REPO/'messages'/'sv.json').read_text(encoding='utf-8'))

def get(node, path):
    for part in path.split('.'):
        node = node[part]
    return node

# Swedish markers that should almost always be translated
MARKERS = re.compile(r'\b(och|att|är|för|med|inte|kan|vid|eller|som|av|till|från|månader|månad|veckor|dagar|år|kr)\b')

same = []
for p, v in flat.items():
    s = get(sv, p)
    if isinstance(s, str) and s == v:
        same.append((p, v))

print(f'identical leaves: {len(same)}')
print('\n--- with Swedish marker words (candidates for genuine misses) ---')
n = 0
for p, v in same:
    if MARKERS.search(v):
        print(f'{p}\t{v[:110]}')
        n += 1
        if n >= 60:
            break
print(f'\n...shown {n} of marker-hits')
