import os
from pathlib import Path
import subprocess
import tempfile

with tempfile.TemporaryDirectory(prefix='bot-p618-guard-') as tmp:
    root = Path(tmp)
    (root / 'playwright').write_text('#!/bin/sh\nprintf "bus=%s args=%s\\n" "$DBUS_SESSION_BUS_ADDRESS" "$*"\n')
    (root / 'xvfb-run').write_text('#!/bin/sh\nshift 2\nexec "$@"\n')
    for p in root.iterdir():
        p.chmod(0o700)
    env = dict(os.environ, HOME=tmp, PATH=tmp + ':' + os.environ['PATH'], DBUS_SESSION_BUS_ADDRESS='unix:path=/tmp/bot-p618-sentinel-not-a-real-bus')
    for flag in ['0', '1']:
        result = subprocess.run(['sh', 'scripts/run-e2e.sh', 'sentinel.spec.ts'], cwd='/tmp/bot-wt/P6-18/app/ui', env=dict(env, PBOTS_E2E_NO_XVFB=flag), text=True, capture_output=True, check=True)
        expected = ('unix:path=/tmp/bot-wt/P6-18/app/ui/.build/e2e-dead-bus' if flag == '0' else env['DBUS_SESSION_BUS_ADDRESS'])
        assert f'bus={expected} args=test sentinel.spec.ts' in result.stdout, result
        print('NO_XVFB=' + flag + ' PASS: ' + result.stdout.strip())
print('No real desktop launched; branch probe uses stub executables only.')
