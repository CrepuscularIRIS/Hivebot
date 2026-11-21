"""Identify a view chunk by resolving its i18n ids to English via the eager-app master table.

usage: python3 -I chunkname.py <eager-app.js> <chunk.js>
"""
import re
import sys
from pathlib import Path

master = Path(sys.argv[1]).read_text(errors="replace")
chunk = Path(sys.argv[2]).read_text(errors="replace")

# master table: "ABcdef":["Some text", ...] (array shape, en inline in eager-common)
table = dict(re.findall(r'"([A-Za-z0-9]{6})":\["((?:[^"\\]|\\.)*)"', master))
ids = re.findall(r'id:`([A-Za-z0-9]{6})`', chunk)
seen = []
for i in ids:
    if i in table and i not in seen:
        seen.append(i)
print(f"{Path(sys.argv[2]).name}: {len(ids)} ids, {len(seen)} resolved")
for i in seen[:25]:
    print(f"  {i} = {table[i][:70]}")
