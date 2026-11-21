from pathlib import Path
import subprocess, os, json
root = Path('/tmp/vfy-r-p610-d')
sdk = root / 'sdk'
vitest = '/home/lingxufeng/bot/app/sdk/node_modules/.bin/vitest'
env = dict(os.environ, HOME=str(root/'home'), TMPDIR=str(root))
results = []
def run(label, file, pattern):
    cmd = [vitest, 'run', '--root', str(sdk), f'tests/unit/{file}', '-t', pattern, '--reporter=verbose']
    p = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    (root/f'{label}.log').write_text(p.stdout)
    results.append({'probe':label,'exit':p.returncode,'command':cmd})
    print(label, 'exit=', p.returncode)
    print('\n'.join(p.stdout.splitlines()[-9:]))
create = sdk/'src/orchestration/create.mjs'
orig = create.read_text()
try:
    # Disable exactly both taint guards added by f1, not identity checks.
    changed = orig.replace('return !orch.turns.classify(String(agent.id)).tainted', 'return true')
    changed = changed.replace('if (orch.turns.classify(String(exec.agent.id)).tainted)', 'if (false)')
    assert changed != orig
    create.write_text(changed)
    run('mut-f1-taint','orchestration-create.test.ts','create_bot taint guard')
finally:
    create.write_text(orig)
slots = sdk/'src/orchestration/slots.mjs'
orig = slots.read_text()
try:
    slots.write_text(orig.replace('slots.onFree = adopt', 'slots.onFree = undefined'))
    run('mut-f1a-adoption','orchestration-create.test.ts','N 起跑|create 流程释放占位|成对续')
finally:
    slots.write_text(orig)
pending = sdk/'src/orchestration/pending.mjs'
orig = pending.read_text()
try:
    assert orig.count('        continue') == 1
    pending.write_text(orig.replace('        continue', '        // mutation: dead ask no longer skipped'))
    run('mut-p621-current','orchestration-foundation.test.ts','.')
    run('mut-p621-restored','legacy-f1.test.ts','crash log|live ask regression')
finally:
    pending.write_text(orig)
(root/'mutation-summary.json').write_text(json.dumps(results,indent=2,ensure_ascii=False))
