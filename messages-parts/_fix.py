#!/usr/bin/env python3
import json, re
from pathlib import Path

BASE = Path('/Users/harald/projects/accounted/messages-parts/leafchunks')

PATTERN = re.compile(r'^(\s*)"([^"]*)"(:\s)"(.*)"(\s*,?\s*)$')

def fix(target, source):
    data = target.read_text(encoding='utf-8')
    lines = data.split('\n')
    out = []
    for line in lines:
        m = PATTERN.match(line.rstrip('\r'))
        if m and m.group(3):
            indent, key, sep, val, tail = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
            val = val.replace('"', '\\\"').replace('\t', '\\t')
            out.append(f'{indent}"{key}"{sep}"{val}"{tail}')
        else:
            out.append(line)
    new = '\n'.join(out)
    try:
        parsed = json.loads(new)
        n_src = len(json.loads(source.read_text(encoding='utf-8')))
        print(f'{target.name}: OK, {len(parsed)} keys (source {n_src})')
        target.write_text(new, encoding='utf-8')
        return len(parsed) == n_src
    except Exception as e:
        print(f'{target.name}: STILL BROKEN: {e}')
        return False

for i in [20]:
    idx = f'{i:03d}'
    fix(BASE / f'l{idx}.target.json', BASE / f'l{idx}.source.json')
