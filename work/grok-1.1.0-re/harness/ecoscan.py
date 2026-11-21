"""Search bot-ecosystem strings in eager-app against the en master table.

usage: python3 -I harness/ecoscan.py <eager-common.js> <eager-app.js> <regex>
"""
import re
import sys
from pathlib import Path

master = Path(sys.argv[1]).read_text(errors='replace')
app = Path(sys.argv[2]).read_text(errors='replace')
pat = re.compile(sys.argv[3])

table = dict(re.findall(r'"([A-Za-z0-9]{6})":\["((?:[^"\\]|\\.)*)"', master))
for i, t in sorted(table.items()):
    if pat.search(t):
        off = app.find('id:`' + i)
        if off >= 0:
            print(f'{i} = {t[:70]!r} @{off}')
