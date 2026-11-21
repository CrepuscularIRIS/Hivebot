from pathlib import Path
import subprocess, json, hashlib, sys
E=Path(__file__).resolve().parent
W=Path('/tmp/bot-wt/P7-F2f2-verify')
SHA='ed336c9a39660a30f23f415debc9e07f22b026ea'
R=E/'verify-runtime'
M=R/'project'
files=['app/sdk/src/admin/'+n+'.mjs' for n in ['authority','channel','origin','tools']]+['app/sdk/src/orchestration/turn-origin.mjs','app/sdk/tests/unit/p7-authority.test.ts','app/sdk/tests/unit/p7-admin-channel.test.ts','app/sdk/vitest.config.ts','app/ui/main/admin/policy.ts','app/ui/main/admin/channel.ts','app/ui/main/admin/consumer.ts','app/ui/tests/unit/admin/channel.test.ts','app/ui/vitest.config.ts']
for p in ['sdk','ui']:
 for n in ['tmp-sweep.setup.ts','tmp-sweep.ts']:
  files.append(f'app/{p}/tests/support/{n}')
assert subprocess.check_output(['git','-C',str(W),'rev-parse','HEAD'],text=True).strip()==SHA
rows=[]
for f in files:
 data=(W/f).read_bytes()
 assert data==subprocess.check_output(['git','-C',str(W),'show',f'{SHA}:{f}'])
 dst=M/f; dst.parent.mkdir(parents=True,exist_ok=True); dst.write_bytes(data)
 rows.append({'path':f,'sha256':hashlib.sha256(data).hexdigest()})
for p in ['sdk','ui']:
 link=M/f'app/{p}/node_modules'
 if not link.exists(): link.symlink_to(f'/home/lingxufeng/bot/app/{p}/node_modules',target_is_directory=True)
for d in ['home','tmp']: (R/d).mkdir(parents=True,exist_ok=True)
(E/'verify-mirror.json').write_text(json.dumps({'sha':SHA,'files':rows},indent=2))
env={'PATH':'/usr/bin:/bin','HOME':str(R/'home'),'TMPDIR':str(R/'tmp')}
name=sys.argv[1]
args=sys.argv[2:]
cmd=['/home/lingxufeng/bot/app/sdk/node_modules/.bin/vitest','run',*args,'--maxWorkers=1','--no-file-parallelism']
cwd=M/'app/sdk'
(E/f'verify-{name}.command.json').write_text(json.dumps({'sha':SHA,'env':env,'cwd':str(cwd),'command':cmd},indent=2))
p=subprocess.run(cmd,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
(E/f'verify-{name}.log').write_text(p.stdout)
(E/f'verify-{name}.exit').write_text(str(p.returncode)+'\n')
print(p.stdout); print('EXIT='+str(p.returncode))
sys.exit(p.returncode)
