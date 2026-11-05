import pathlib,json,hashlib,subprocess,re,collections
W=pathlib.Path('/tmp/bot-wt/P6-22'); R=W/'work/p6-orchestration/evidence/D3-orch'; E=pathlib.Path(__file__).parent
V=E/'D3-orch/rounds/r2'; O=R/'rounds/r2'
def git(*args): return subprocess.check_output(['git','-C',str(W),*args])
def read(p): return json.loads(p.read_text())
def h(b): return hashlib.sha256(b).hexdigest()
print('COMMAND HOME=<evidence>/home python -I',str(pathlib.Path(__file__)))
print('HEAD',git('rev-parse','HEAD').decode().strip()); assert git('rev-parse','HEAD').decode().startswith('cd40f65')
for phase in ['heldout','dev']:
    for name in ['scores.json','SCORE.txt']:
        assert (V/phase/name).read_bytes()==(O/phase/name).read_bytes()
    print('RECOMPUTE',phase,'scores.json and SCORE.txt byte-identical')
a=(V/'SCORE.txt').read_text().splitlines(); b=(O/'SCORE.txt').read_text().splitlines()
assert [s for s in a if not s.startswith('generated=')]==[s for s in b if not s.startswith('generated=')]
print('AGGREGATE SCORE identical except generated timestamp')
held=read(V/'heldout/scores.json'); before=read(O/'archive-r2b/heldout-scores.json')
cases=read(R/'prompts.json')['cases']; expected={f"{c['id']}-{n}" for c in cases for n in range(1,2 if c['kind'] in ['direct','chat'] else 4)}
ids=[r['id'] for r in held]; assert len(ids)==len(set(ids))==36; assert set(ids)==expected
preserved={r['id'] for r in before if r.get('complete')}; assert len(preserved)==17
for row in held:
    raw=(O/'heldout/raw'/(row['id']+'.jsonl')).read_bytes(); assert h(raw)==row['sha256']
    meta=json.loads(raw.splitlines()[0]); assert row['id']==f"{meta['promptId']}-{meta['rep']}"
    if row['id'] in preserved:
        baseline=git('show','a4f1bb3:'+str((O/'heldout/raw'/(row['id']+'.jsonl')).relative_to(W)))
        assert h(raw)==h(baseline)==next(r['sha256'] for r in before if r['id']==row['id'])
labels={}
for line in (O/'SCORE.txt').read_text().splitlines():
    x=line.split('\t')
    if len(x)==3 and x[1] in ['r2a保留','r2c补采']:
        assert x[0] not in labels; labels[x[0]]=x[1]
assert set(labels)==expected
assert {k for k,v in labels.items() if v=='r2a保留'}==preserved
assert len(expected-preserved)==19
print('MERGE 17 originals hash-identical to a4f1bb3; 19 supplements; 36 distinct exact planned IDs; labels exact; raw hashes exact')
paths=['app/sdk/src/orchestration/'+p+'.mjs' for p in ['routing-prompt','create','send','stop']]
frozen=['work/p6-orchestration/evidence/D3-orch/'+p for p in ['prompts.json','score.mjs']]
for p in paths+frozen: assert git('show','0ed1ed4:'+p)==(W/p).read_bytes()
for p in frozen: assert git('show','7ea8fcc:'+p)==(W/p).read_bytes()
commits=git('log','--format=%h','7ea8fcc..HEAD','--',*paths,*frozen).decode().splitlines(); assert commits==['0ed1ed4']
print('FREEZE only r2 wording commit:',commits,'; four product files unchanged since 0ed1ed4; prompts/scorer unchanged since r1')
for p in frozen: print('SHA256',p,h((W/p).read_bytes()))
# Independent report counting: no prose output, count only event types/tool results.
allreports=[]; samples={('single3-fib-run-3',1),('par1-two-tasks-2',2),('attach1-hike-append-3',1)}
for row in held:
    current=None; reports=[]; callrefs={}
    for line,s in enumerate((O/'heldout/raw'/(row['id']+'.jsonl')).read_text().splitlines(),1):
        f=json.loads(s)
        if f.get('type')!='event': continue
        e=f['event']; d=e.get('data',{}); t=e['type']
        if t=='user/message' and d.get('source',{}).get('kind') in ['user','pbots-worker']:
            assert current is None, (row['id'],'open report truncated')
            if d['source']['kind']=='pbots-worker':
                current={'start':line,'tailTexts':0,'toolSuccess':0,'calls':[],'results':[]}; reports.append(current)
        elif current is not None:
            if t=='tool/call': current['calls'].append([line,d.get('name'),d.get('callId')]); callrefs[d.get('callId')]=current
            elif t=='tool/result':
                m=d.get('message',{}); cid=m.get('toolCallId',d.get('toolCallId')); owner=callrefs.get(cid)
                if owner is not None:
                    owner['toolSuccess']+=m.get('isError') is not True; owner['results'].append([line,cid,m.get('isError')]); current['tailTexts']=0
            elif t=='assistant/message':
                text=''.join(c.get('text','') for c in d.get('message',{}).get('content',[]) if c.get('type')=='text'); current['tailTexts']+=bool(text.strip())
            elif t=='turn/end': current['end']=line; current['reason']=d.get('reason',{}).get('kind'); current=None
    assert current is None
    assert len(reports)==len(row['reports'])
    for i,(a,b) in enumerate(zip(reports,row['reports']),1):
        assert a['toolSuccess']==b['toolSuccess']==0 and a['tailTexts']==b['tailTexts']==1 and a['reason']=='completed'
        if (row['id'],i) in samples: print('REPORT SAMPLE',row['id'],i,json.dumps(a))
    allreports.extend(reports)
assert len(allreports)==42
print('HARD independent audit: reports=42; tool-success=0; tailTexts!=1=0; all closed completed')
print('PASS audit assertions')
