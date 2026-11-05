import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

SDK = Path('/tmp/bot-wt/P6-05f1/app/sdk')
OUT = Path(__file__).resolve().parent
ROOT = Path(tempfile.mkdtemp(prefix='bot-p605f1-vfy-'))
ENV = os.environ.copy()
for key in list(ENV):
    if key.startswith(('P2SDK_', 'DSH_', 'PBOTS_')):
        ENV.pop(key)
ENV.update(HOME=str(ROOT / 'home'), TMPDIR=str(ROOT / 'tmp'), PBOTS_DATA_DIR=str(ROOT / 'data'), DBUS_SESSION_BUS_ADDRESS='unix:path=' + str(ROOT / 'no-dbus'))
for key in ('HOME', 'TMPDIR', 'PBOTS_DATA_DIR'):
    Path(ENV[key]).mkdir(parents=True)


def run(label, sdk, args, expected):
    if sdk == SDK:
        cmd = ['pnpm', '-C', str(sdk), 'test', *args, '--maxWorkers=1']
    else:
        # pnpm checks copied node_modules metadata against its new location and
        # attempts install. Invoke the exact installed vitest/node directly;
        # never let a clone's install mutate the shared node_modules symlink.
        cmd = [str(SDK / 'node_modules/node/bin/node'), str(SDK / 'node_modules/vitest/vitest.mjs'), 'run', *args, '--maxWorkers=1']
    p = subprocess.run(cmd, cwd=sdk, env=ENV, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=240)
    log = 'COMMAND: ' + ' '.join(cmd) + '\nCWD: ' + str(sdk) + '\nHOME/TMPDIR root: ' + str(ROOT) + '\n' + p.stdout + '\nEXIT: ' + str(p.returncode) + '\n'
    (OUT / (label + '.log')).write_text(log)
    print(label, 'exit=', p.returncode, flush=True)
    print('\n'.join(p.stdout.splitlines()[-22:]), flush=True)
    assert p.returncode == expected, label


def section(text):
    block = text.split('- id: preset-standard\n', 1)[1].split('\n- id:', 1)[0]
    m = re.search(r'^            ## Replying to the user\n\n            [^\n]+', block, re.M)
    assert m
    return '\n'.join(line[12:] if line else '' for line in m[0].split('\n')).encode()


try:
    current = (SDK / 'profile/patches/approval.yml').read_text()
    historical = subprocess.check_output(['git', '-C', str(SDK), 'show', '8973a67:app/sdk/profile/patches/approval.yml'], text=True)
    a, b = section(current), section(historical)
    hashes = {'current': hashlib.sha256(a).hexdigest(), '8973a67': hashlib.sha256(b).hexdigest(), 'bytes': len(a), 'equal': a == b}
    (OUT / 'vfy-hash.json').write_text(json.dumps(hashes, indent=2) + '\n')
    print(hashes, flush=True)
    assert a == b and hashes['current'] == 'c7c53cd4e281e361191cbdecf873d2c6c5a5d9d7e56277091bf0d54a9734b356'
    tests = ['tests/e2e/guard-plugin-manager.test.ts', 'tests/e2e/config.test.ts']
    run('vfy-present', SDK, tests, 0)
    clone = ROOT / 'sdk'
    shutil.copytree(SDK, clone, ignore=shutil.ignore_patterns('node_modules', '.dsh', 'coverage', 'evidence'))
    (clone / 'node_modules').symlink_to(SDK / 'node_modules', target_is_directory=True)
    approval = clone / 'profile/patches/approval.yml'
    prefix = re.search(r'          prefix: \|\n.*?(?=      - id: agent-instructions)', current, re.S)
    assert prefix
    removed = current[:prefix.start()] + '          prefix: You are a coding agent powered by the {{model}} model.\n' + current[prefix.end():]
    approval.write_text(removed)
    run('vfy-removed', clone, tests + ['-t', 'P6-05.f1|drift'], 1)
    removed_log = (OUT / 'vfy-removed.log').read_text()
    assert '1 failed | 1 passed' in removed_log and 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' in removed_log
    approval.write_text(current)
    run('vfy-restored', clone, tests + ['-t', 'P6-05.f1|drift'], 0)
    approval.write_text(current.replace('          maxBytes: 65536', '          maxBytes: 65537', 1))
    run('vfy-drift-maxBytes', clone, [tests[0], '-t', 'drift'], 1)
    approval.write_text(current.replace('      - id: agent-instructions', '          suffix: UNAPPROVED-P605F1-SUFFIX\n      - id: agent-instructions', 1))
    run('vfy-drift-suffix', clone, [tests[0], '-t', 'drift'], 0)
    approval.write_text(current)
finally:
    shutil.rmtree(ROOT)
