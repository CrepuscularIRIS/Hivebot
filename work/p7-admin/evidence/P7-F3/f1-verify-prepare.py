import pathlib, subprocess, tarfile, io, hashlib
E=pathlib.Path(__file__).parent; S=E/'f1-verify-source'; W=pathlib.Path('/tmp/bot-wt/P7-F3f1-verify'); SHA='de36bbc587d604c2672ede53c32d4554973082ec'
assert subprocess.check_output(['git','-C',str(W),'rev-parse','HEAD'],text=True).strip()==SHA
assert not subprocess.check_output(['git','-C',str(W),'status','--porcelain'])
assert not S.exists(); S.mkdir()
with tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['git','-C',str(W),'archive',SHA,'app/sdk','app/ui']))) as t:t.extractall(S,filter='data')
rows=[]
for p in sorted(S.rglob('*')):
 if p.is_file():
  rel=p.relative_to(S); assert p.read_bytes()==(W/rel).read_bytes(); rows.append(hashlib.sha256(p.read_bytes()).hexdigest()+' '+str(rel))
(E/'f1-verify-source-hashes.txt').write_text(SHA+'\n'+'\n'.join(rows)+'\n')
for pkg in ['sdk','ui']:
 target=S/'app'/pkg/'node_modules'; target.mkdir()
 for child in (pathlib.Path('/tmp/bot-wt/P7-F3/app')/pkg/'node_modules').iterdir():
  if child.name not in {'.vite','.cache'}:(target/child.name).symlink_to(child,target_is_directory=child.is_dir())
for name in ['f1-verify-home','f1-verify-tmp']:(E/name).mkdir()
for name in ['sdk','sdk-worker','sdk-child','ui']:
 text=(E/('f1-'+name+'.config.mjs')).read_text().replace('/tmp/bot-wt/P7-F3',str(S)).replace("./f1-sdk.config.mjs","./f1-verify-sdk.config.mjs")
 for prefix in ['f1-cache','f1-coverage']:text=text.replace(prefix,prefix.replace('f1-','f1-verify-'))
 (E/('f1-verify-'+name+'.config.mjs')).write_text(text)
text=(E/'f1-run.py').read_text().replace("SDK='/tmp/bot-wt/P7-F3/app/sdk'","SDK=str(E/'f1-verify-source/app/sdk')").replace('f1-home','f1-verify-home').replace('f1-tmp','f1-verify-tmp').replace("('f1-'+group","('f1-verify-'+group")
text=text.replace("'ui':ui}","'ui':ui,'loader':['tests/unit/orchestration-report-live.test.ts','tests/unit/orchestration-foundation-delivery.test.ts','-t','P6-12 live \\(real Loader\\)|delivers each stable|two concurrent same-id','--coverage.enabled=false']}")
text=text.replace("('f1-verify-'+group+'.config.mjs')","('f1-verify-'+('sdk-worker' if group=='loader' else group)+'.config.mjs')")
(E/'f1-verify-run.py').write_text(text)
for name in ['native-storage','independent']:
 text=(E/('verify-'+name+'.mjs')).read_text().replace('./verify-source/','./f1-verify-source/')
 if name=='independent':
  text=text.replace('async send(){sends++},wake(){}}}',"async send(_a,m,p){p.signal.throwIfAborted();sends++;logs.main.push({type:'agent/inbox/spliced',target:'next-turn',start:0,removedCount:0,inserted:[{id:m.id,kind:'pbots-worker',items:m.source.items}]})},wake(){}}}")
  text=text.replace('await sleep(2100);release.resolve();',"await sleep(2100);result('old generation has consumed zero before release',sends,0);release.resolve();")
 (E/('f1-verify-'+name+'.mjs')).write_text(text)
(E/'f1-verify-production.diff').write_bytes(subprocess.check_output(['git','-C',str(W),'diff','e5ff286..'+SHA,'--','app/sdk/src','app/ui/main']))
print('Prepared',len(rows),'byte-matched files; isolated cache and individual dependency links')
