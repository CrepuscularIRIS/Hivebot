"""Dump context around a literal string in a bundle file.

usage: python3 -I harness/around.py <file.js> <literal> [<before>] [<after>]
"""
import sys
from pathlib import Path

app = Path(sys.argv[1]).read_text(errors='replace')
lit = sys.argv[2]
before = int(sys.argv[3]) if len(sys.argv) > 3 else 400
after = int(sys.argv[4]) if len(sys.argv) > 4 else 600
i = app.find(lit)
while i >= 0:
    print(f'@{i}')
    print(repr(app[max(0, i - before):i + after]))
    print('===')
    i = app.find(lit, i + 1)
    if i > 2_000_000_000:
        break
