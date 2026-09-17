#!/usr/bin/env python3
"""Extract (error code, message_sv) pairs from lib/errors/structured-errors.ts.

Handles single-line and multi-line single-quoted strings, plus escaped \\'.
"""
import json, re
from pathlib import Path

SRC = Path('/Users/harald/projects/accounted/lib/errors/structured-errors.ts')
text = SRC.read_text(encoding='utf-8')

# 1. Locate every `CODE_NAME: {` that starts an entry (uppercase snake_case keys)
code_re = re.compile(r'^\s{2}([A-Z][A-Z0-9_]*):\s*\{', re.M)
codes = [(m.start(), m.group(1)) for m in code_re.finditer(text)]

# 2. Locate every message_sv occurrence and parse the string literal that follows
msv_re = re.compile(r'message_sv:\s*', re.M)

def parse_string(s, i):
    """s[i] should be the opening quote. Return (value, end_index_after_closing_quote)."""
    assert s[i] == "'", f'expected single quote, got {s[i]!r} at {i}'
    i += 1
    out = []
    while i < len(s):
        ch = s[i]
        if ch == '\\':
            nxt = s[i+1]
            if nxt == "'":
                out.append("'")
            elif nxt == '\\':
                out.append('\\')
            elif nxt == 'n':
                out.append('\n')
            else:
                out.append(nxt)
            i += 2
            continue
        if ch == "'":
            return ''.join(out), i + 1
        out.append(ch)
        i += 1
    raise ValueError('unterminated string')

pairs = []
for m in msv_re.finditer(text):
    j = m.end()
    while j < len(text) and text[j] in ' \t':
        j += 1
    if j < len(text) and text[j] == "'":
        val, end = parse_string(text, j)
        # nearest preceding code
        code = None
        for pos, c in codes:
            if pos < m.start():
                code = c
            else:
                break
        pairs.append({'code': code, 'msg': val, 'msg_start': j, 'msg_end': end})

print(f'message_sv occurrences parsed: {len(pairs)}')
print(f'with code: {sum(1 for p in pairs if p["code"])}')
ml = [p for p in pairs if '\n' in p['msg']]
print(f'multi-line values: {len(ml)}')

# sanity: all codes unique?
from collections import Counter
dupes = [c for c, n in Counter(p['code'] for p in pairs).items() if n > 1]
print(f'codes appearing more than once (expected if key repeats across groups): {len(dupes)}')

out = Path('/Users/harald/projects/accounted/messages-parts/errors')
out.mkdir(parents=True, exist_ok=True)
json.dump(pairs, open(out/'pairs.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('wrote', out/'pairs.json')

for p in pairs[:4]:
    print(f'  {p["code"]}: {p["msg"][:90]!r}')
