import json
import pathlib
import subprocess

source = pathlib.Path('/home/lingxufeng/bot/work/p7-admin/evidence/review-e5ff286')
evidence = pathlib.Path('/home/lingxufeng/bot/work/p7-admin/evidence/P7-F2f2')
worktree = pathlib.Path('/tmp/bot-wt/P7-F2f2')
env = {'PATH': '/usr/bin:/bin', 'HOME': '/tmp/bot-P7-F2f2/home', 'TMPDIR': '/tmp/bot-P7-F2f2/tmp'}
for name in ['A-probe', 'A-bridge-probe']:
    original = source / f'{name}.mjs'
    script = evidence / f'{name}-current.mjs'
    content = original.read_text().replace("'./A-runtime/project/", "'file:///tmp/bot-wt/P7-F2f2/")
    script.write_text(content)
    command = ['node', '--experimental-strip-types', str(script)]
    result = subprocess.run(command, env=env, cwd=worktree, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    (evidence / f'{name}-current.txt').write_text(result.stdout)
    (evidence / f'{name}-current.exit').write_text(f'{result.returncode}\n')
    (evidence / f'{name}-current.command.json').write_text(json.dumps({'source': str(original), 'adaptation': 'Only replace fixture import prefix with absolute worktree file URL', 'command': command, 'env': env, 'cwd': str(worktree)}, indent=2) + '\n')
    print(result.stdout)
    print(f'{name}: EXIT={result.returncode}')
    if result.returncode:
        raise SystemExit(result.returncode)
