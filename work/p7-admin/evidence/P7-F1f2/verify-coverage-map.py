"""Map official Istanbul remapped coverage to fixed-SHA changed lines; no raw V8 interpretation."""
import hashlib
import json
import re
import subprocess
from pathlib import Path
ROOT = Path('/tmp/bot-wt/P7-F1f2-verify')
E = Path('/home/lingxufeng/bot/work/p7-admin/evidence/P7-F1f2')
SHA = 'd8765b6e779c397801be48651d8830a45995d3a4'
REL = 'app/ui/main/admin/operations.ts'
def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])
assert git('rev-parse', 'HEAD').decode().strip() == SHA
assert not git('status', '--short').strip()
print('SOURCE HASHES (working SHA256 == git show fixed SHA SHA256)')
for rel in [REL, 'app/ui/tests/unit/admin/operations.test.ts', 'app/ui/vitest.config.ts', 'app/ui/package.json', 'app/ui/pnpm-lock.yaml']:
    actual = (ROOT/rel).read_bytes()
    assert actual == git('show', SHA+':'+rel), rel
    print(rel, hashlib.sha256(actual).hexdigest(), 'BYTE_IDENTICAL')
for p in [Path('/tmp/bot-P7-F1f2-coverage/package.json'), Path('/tmp/bot-P7-F1f2-coverage/pnpm-lock.yaml'), ROOT/'app/ui/node_modules/vitest/package.json', Path('/tmp/bot-P7-F1f2-coverage/node_modules/@vitest/coverage-v8/package.json'), E/'verify-official-coverage.config.mjs', E/'verify-probe.test.ts', E/'verify-extra.test.ts', E/'verify-official-coverage/coverage-final.json']:
    print(p, hashlib.sha256(p.read_bytes()).hexdigest())
diff = git('diff', '--unified=0', 'a2279cd..'+SHA, '--', REL).decode()
changed = set()
line = 0
for row in diff.splitlines():
    m = re.match(r'@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@', row)
    if m:
        line = int(m.group(1))
    elif row.startswith('+++') or row.startswith('---'):
        pass
    elif row.startswith('+'):
        changed.add(line)
        line += 1
    elif not row.startswith('-') and not row.startswith('\\'):
        line += 1
print('\nADDED/REPLACED LINES:', ','.join(map(str, sorted(changed))))
coverage = json.loads((E/'verify-official-coverage/coverage-final.json').read_text())[str(ROOT/REL)]
summary = json.loads((E/'verify-official-coverage/coverage-summary.json').read_text())[str(ROOT/REL)]
print('OFFICIAL FULL FILE SUMMARY', json.dumps(summary, sort_keys=True))
def intersects(loc):
    start = loc.get('start', {}).get('line')
    end = loc.get('end', {}).get('line')
    # Istanbul implicit else arms may have empty coordinates. Keep their counts whenever parent branch selected.
    return start is not None and end is not None and any(n in changed for n in range(start, end+1))
def metric(name, values):
    covered = sum(v > 0 for v in values)
    total = len(values)
    pct = 100*covered/total if total else 100
    print(name, f'{covered}/{total} = {pct:.2f}%', 'PASS>=80' if pct >= 80 else 'FAIL<80')
svalues, fvalues, bvalues = [], [], []
lines = {}
print('\nMODIFIED STATEMENT MAP (official statement id, location, hits)')
for key, loc in coverage['statementMap'].items():
    if intersects(loc):
        svalues.append(coverage['s'][key])
        print(key, json.dumps(loc), coverage['s'][key])
    n = loc['start']['line']
    if n in changed:
        lines[n] = max(lines.get(n, 0), coverage['s'][key])
print('\nTOUCHED FUNCTION MAP (whole function intersects change)')
for key, fn in coverage['fnMap'].items():
    if intersects(fn['loc']):
        fvalues.append(coverage['f'][key])
        print(key, fn['name'], json.dumps(fn['loc']), coverage['f'][key])
print('\nMODIFIED BRANCH MAP (span or arm intersects change; ALL arms including implicit else counted)')
for key, branch in coverage['branchMap'].items():
    if intersects(branch['loc']) or any(intersects(loc) for loc in branch['locations']):
        bvalues.extend(coverage['b'][key])
        print(key, branch['type'], json.dumps(branch['loc']), 'arms='+json.dumps(branch['locations']), 'hits='+json.dumps(coverage['b'][key]))
print('\nMODIFIED EXECUTABLE LINE MAP (max count per statement start line)', json.dumps(lines,sort_keys=True))
print('\nDIFF METRICS (derived only from official remapped coverage-final.json)')
metric('modified statements', svalues)
metric('touched functions', fvalues)
metric('modified branch arms', bvalues)
metric('modified executable lines', list(lines.values()))
