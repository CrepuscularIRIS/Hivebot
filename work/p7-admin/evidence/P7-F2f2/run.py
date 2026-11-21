import json
import pathlib
import subprocess
import sys

EVIDENCE = pathlib.Path('/home/lingxufeng/bot/work/p7-admin/evidence/P7-F2f2')
name, package, *args = sys.argv[1:]
env = {'PATH': '/usr/bin:/bin:/home/lingxufeng/.npm-global/bin',
       'HOME': '/tmp/bot-P7-F2f2/home', 'TMPDIR': '/tmp/bot-P7-F2f2/tmp'}
command = ['/bin/bash', '--noprofile', '--norc', '-c', 'exec ./node_modules/.bin/vitest run "$@" --maxWorkers=1', 'vitest', *args]
cwd = f'/tmp/bot-wt/P7-F2f2/app/{package}'
result = subprocess.run(command, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
(EVIDENCE / f'{name}.txt').write_text(result.stdout)
(EVIDENCE / f'{name}.exit').write_text(f'{result.returncode}\n')
(EVIDENCE / f'{name}.command.json').write_text(json.dumps({'cwd': cwd, 'env': env, 'command': command}, indent=2) + '\n')
print(result.stdout)
print(f'EXIT={result.returncode}')
sys.exit(result.returncode)
