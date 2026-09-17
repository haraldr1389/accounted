#!/usr/bin/env python3
"""Regenerate the country-name VALUES table in the SQL twin so it matches
listKnownCountryNames() exactly (the parity test asserts set equality)."""
import json, subprocess
from pathlib import Path

REPO = Path('/Users/harald/projects/accounted')
SQL = REPO/'supabase'/'migrations'/'20260903173000_customer_supplier_country_iso.sql'

# Ask the TypeScript module for the authoritative table.
out = subprocess.run(
    ['npx', 'tsx', '-e',
     "import { listKnownCountryNames } from './lib/vat/country-codes';"
     "console.log(JSON.stringify(listKnownCountryNames()))"],
    cwd=REPO, capture_output=True, text=True,
)
line = [l for l in out.stdout.splitlines() if l.startswith('[[')]
if not line:
    raise SystemExit('could not read TS table:\n' + out.stdout + out.stderr)
pairs = json.loads(line[-1])
print(f'TS names: {len(pairs)}')

# Names must be plain ASCII-safe single-quoted SQL literals; double any apostrophe.
def lit(s):
    return "'" + s.replace("'", "''") + "'"

rows = sorted({(name, code) for name, code in pairs}, key=lambda t: (t[0], t[1]))
body = ',\n'.join(f"      ({lit(n)}, '{c}')" for n, c in rows)

t = SQL.read_text(encoding='utf-8')
start = t.index('    from (values\n')
end = t.index('    ) as m(name, code)')
new = t[:start] + '    from (values\n' + body + '\n' + t[end:]
SQL.write_text(new, encoding='utf-8')
print(f'SQL rows written: {len(rows)}')
