"""Independent mutations on a disposable SDK copy; never modify the worktree.
Run installed node/vitest directly: pnpm on a symlinked dependency copy requests
an unnecessary reinstall (see vfy-f1a-copy-control.log first attempt).
"""
import os
from pathlib import Path
import shutil
import subprocess

SOURCE = Path('/tmp/bot-wt/P6-05f1/app/sdk')
ROOT = Path('/tmp/bot-p605f1a-vfy')
SDK = ROOT / 'sdk'
EVIDENCE = Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-05f1')
if not SDK.exists():
    shutil.copytree(SOURCE, SDK, ignore=shutil.ignore_patterns('node_modules', 'evidence', '.dsh'), symlinks=True)
    (SDK / 'node_modules').symlink_to(SOURCE / 'node_modules', target_is_directory=True)
approval = SDK / 'profile/patches/approval.yml'
original = (SOURCE / 'profile/patches/approval.yml').read_text()
approval.write_text(original)
env = dict(os.environ, HOME=str(ROOT / 'home'), TMPDIR=str(ROOT / 'tmp'), PBOTS_DATA_DIR=str(ROOT / 'data'), DBUS_SESSION_BUS_ADDRESS='unix:path=' + str(ROOT / 'no-bus'))
GUARD = 'tests/e2e/guard-plugin-manager.test.ts'
CONFIG = 'tests/e2e/config.test.ts'
summary = []

def run(label, files, pattern, expected):
    command = [str(SOURCE / 'node_modules/node/bin/node'), str(SOURCE / 'node_modules/vitest/vitest.mjs'), 'run', *files, '--maxWorkers=1', '-t', pattern]
    log = EVIDENCE / ('vfy-f1a-' + label + '.log')
    with log.open('w') as out:
        out.write('CWD: ' + str(SDK) + '\nCOMMAND: ' + repr(command) + '\n')
        out.flush()
        result = subprocess.run(command, cwd=SDK, env=env, stdout=out, stderr=subprocess.STDOUT, timeout=180)
        out.write('\nEXIT: ' + str(result.returncode) + '\n')
    text = log.read_text()
    assert ('AssertionError' in text) if expected else ('passed' in text), text
    assert result.returncode == expected, (label, result.returncode, expected)
    summary.append(f'{label}: exit={result.returncode} expected={expected}; log={log}')
    print(summary[-1], flush=True)

try:
    run('copy-control', [GUARD, CONFIG], '^drift：|P6-05.f1:', 0)
    anchor = '      - id: agent-instructions'
    assert original.count(anchor) >= 1
    approval.write_text(original.replace(anchor, '          suffix: UNAPPROVED-BY-VERIFIER\n' + anchor, 1))
    run('suffix', [GUARD], '^drift：', 1)
    anchor = '            You are a coding agent powered by the {{model}} model.'
    assert anchor in original
    approval.write_text(original.replace(anchor, '            Independent verifier prefix value mutation.', 1))
    run('prefix', [GUARD], '^drift：', 0)
    anchor = "        name: '@deepseek-ai/dsh-persona'"
    assert anchor in original
    approval.write_text(original.replace(anchor, "        name: 'verifier-unapproved-persona'", 1))
    run('name', [GUARD], '^drift：', 1)
    start = original.index('            ## Replying to the user')
    end = original.index('      - id: agent-instructions', start)
    approval.write_text(original[:start] + original[end:])
    run('section-deleted-drift', [GUARD], '^drift：', 0)
    run('section-deleted-config', [CONFIG], 'P6-05.f1:', 1)
finally:
    approval.write_text(original)
    (EVIDENCE / 'vfy-f1a-mutations.txt').write_text('\n'.join(summary) + '\n')
