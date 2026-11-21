"""Recreate an unchanged scoped snapshot using existing locked dependencies only.
Run: python3 -I /home/lingxufeng/bot/work/p7-admin/evidence/review-e5ff286/A-prepare.py
All writes stay in this evidence directory. No installs, credentials or external services.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

SOURCE = Path('/tmp/bot-wt/P7-review-A')
HERE = Path(__file__).resolve().parent
SHA = 'e5ff286e686994b489766ea7d3bd1f74614a342b'
assert subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip() == SHA
DEST = HERE / 'A-runtime/project'
FILES = [
    'app/sdk/src/admin/authority.mjs', 'app/sdk/src/admin/channel.mjs',
    'app/sdk/src/admin/origin.mjs', 'app/sdk/src/admin/tools.mjs',
    'app/sdk/src/orchestration/turn-origin.mjs',
    'app/sdk/tests/unit/p7-authority.test.ts', 'app/sdk/tests/unit/p7-admin-channel.test.ts',
    'app/sdk/vitest.config.ts', 'app/ui/main/admin/policy.ts',
    'app/ui/main/admin/channel.ts', 'app/ui/main/admin/consumer.ts',
    'app/ui/tests/unit/admin/channel.test.ts', 'app/ui/vitest.config.ts',
]
for package in ('sdk', 'ui'):
    for name in ('tmp-sweep.setup.ts', 'tmp-sweep.ts'):
        FILES.append(f'app/{package}/tests/support/{name}')
rows = []
for name in FILES:
    data = (SOURCE / name).read_bytes()
    committed = subprocess.check_output(['git', '-C', str(SOURCE), 'show', f'{SHA}:{name}'])
    assert data == committed, name
    target = DEST / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    rows.append({'path': name, 'source_sha256': hashlib.sha256(data).hexdigest(),
                 'mirror_sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'equal': True})
for package in ('sdk', 'ui'):
    link = DEST / f'app/{package}/node_modules'
    if not link.exists():
        link.symlink_to(f'/home/lingxufeng/bot/app/{package}/node_modules', target_is_directory=True)
for directory in ('home', 'tmp'):
    (HERE / 'A-runtime' / directory).mkdir(parents=True, exist_ok=True)
(HERE / 'A-mirror-hashes.json').write_text(json.dumps(rows, indent=2) + '\n')
print(f'Fixed SHA {SHA}; {len(FILES)} unchanged files matched committed bytes.')
