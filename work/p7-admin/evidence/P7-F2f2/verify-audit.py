from pathlib import Path
import json, subprocess, hashlib, shutil
E=Path(__file__).resolve().parent
W=Path('/tmp/bot-wt/P7-F2f2-verify')
R=E/'verify-runtime'
P=R/'project'
B=R/'red-project'
rows=[]
for f in ['app/sdk/package.json','app/sdk/pnpm-lock.yaml','app/ui/package.json','app/ui/pnpm-lock.yaml']:
 p=W/f
 if not p.exists(): continue
 data=p.read_bytes(); other=Path('/home/lingxufeng/bot')/f
 rows.append({'path':f,'fixed_sha256':hashlib.sha256(data).hexdigest(),'tool_owner_equal':data==other.read_bytes()})
tools=[]
for f in ['vitest/package.json','@vitest/coverage-v8/package.json']:
 p=Path('/home/lingxufeng/bot/app/sdk/node_modules')/f
 o=json.loads(p.read_text()); tools.append({'path':str(p.resolve()),'version':o['version'],'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
for name in ['A1-RED-test','A1-GREEN','A2-RED','A2-GREEN','A3-RED','A3-GREEN','SDK-final','UI-final']:
 rows.append({'author_evidence':name,'exit':(E/(name+'.exit')).read_text().strip(),'command':json.loads((E/(name+'.command.json')).read_text())})
hashes=[]
for line in (E/'tested-files.sha256').read_text().splitlines():
 expected,path=line.split(None,1); rel=path.split('/tmp/bot-wt/P7-F2f2/')[1]
 actual=hashlib.sha256((W/rel).read_bytes()).hexdigest(); hashes.append({'path':rel,'author_sha256':expected,'fixed_sha_equal':actual==expected})
for src in P.rglob('*'):
 rel=src.relative_to(P); dst=B/rel
 if src.is_symlink():
  dst.parent.mkdir(parents=True,exist_ok=True)
  if not dst.exists(): dst.symlink_to(src.resolve(),target_is_directory=True)
 elif src.is_file(): dst.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(src,dst)
for f in ['app/sdk/src/admin/authority.mjs','app/ui/main/admin/consumer.ts']:
 (B/f).write_bytes(subprocess.check_output(['git','-C',str(W),'show',f'a2279cd:{f}']))
env={'PATH':'/usr/bin:/bin','HOME':str(R/'home'),'TMPDIR':str(R/'tmp')}
for name,args in [('red-sdk',['tests/unit/p7-authority.test.ts','-t','A1|A2']),('red-ui',['--root='+str(B/'app/ui'),'--config='+str(B/'app/ui/vitest.config.ts'),'tests/unit/admin/channel.test.ts','-t','A3'])]:
 cmd=['/home/lingxufeng/bot/app/sdk/node_modules/.bin/vitest','run',*args,'--maxWorkers=1','--no-file-parallelism']
 info={'baseline_product':'a2279cd','tests':'ed336c9','cwd':str(B/'app/sdk'),'env':env,'command':cmd}
 r=subprocess.run(cmd,cwd=B/'app/sdk',env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 (E/f'verify-{name}.command.json').write_text(json.dumps(info,indent=2)); (E/f'verify-{name}.log').write_text(r.stdout);(E/f'verify-{name}.exit').write_text(str(r.returncode)+'\n')
 print(name,'exit',r.returncode); print('\n'.join(r.stdout.splitlines()[-9:]))
base=B/'app/sdk/src/admin/authority.mjs'
(E/'verify-base-authority.mjs').write_bytes(base.read_bytes())
(E/'verify-provenance.json').write_text(json.dumps({'author_evidence':rows,'author_file_hashes':hashes,'existing_tools':tools},indent=2))
print('author file hashes match:',all(x['fixed_sha_equal'] for x in hashes))
print('dependency owners match:',all(x.get('tool_owner_equal',True) for x in rows))
