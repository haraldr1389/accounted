#!/usr/bin/env python3
"""Assemble messages/no.json from translated leaf chunks, preserving sv.json structure/order."""
import json
from pathlib import Path

REPO = Path('/Users/harald/projects/accounted')
BASE = REPO / 'messages-parts' / 'leafchunks'

# 1. Gather all flat translations
flat = {}
for i in range(35):
    p = BASE / f'l{i:03d}.target.json'
    flat.update(json.loads(p.read_text(encoding='utf-8')))

sv = json.loads((REPO / 'messages' / 'sv.json').read_text(encoding='utf-8'))

def build(node, prefix=''):
    """Rebuild the sv.json structure, replacing leaves with translations."""
    out = {}
    for k, v in node.items():
        path = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            out[k] = build(v, path)
        else:
            out[k] = flat.get(path, v)   # fall back to source if somehow missing
    return out

no = build(sv)

# 2. Verify key parity
def leaf_paths(node, prefix=''):
    out = set()
    for k, v in node.items():
        p = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            out |= leaf_paths(v, p)
        else:
            out.add(p)
    return out

sv_leaves = leaf_paths(sv)
no_leaves = leaf_paths(no)
print(f'sv leaves: {len(sv_leaves)} | no leaves: {len(no_leaves)}')
print(f'missing: {len(sv_leaves - no_leaves)} | extra: {len(no_leaves - sv_leaves)}')

# 3. Which leaves were left untranslated (still identical to Swedish)?
untranslated = [p for p in sorted(sv_leaves) if no and flat.get(p) == None]
same_as_sv = []
for p in sorted(sv_leaves):
    a = flat.get(p)
    # locate sv value
    parts = p.split('.')
    node = sv
    for part in parts:
        node = node[part]
    if a is not None and a == node:
        same_as_sv.append(p)
print(f'leaves identical to Swedish (likely intentionally untranslated): {len(same_as_sv)}')
for p in same_as_sv[:15]:
    print('   ', p, '=', repr(flat.get(p))[:70])

(REPO / 'messages' / 'no.json').write_text(
    json.dumps(no, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
)
print('written messages/no.json')
