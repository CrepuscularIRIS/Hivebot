import json, hashlib, collections, subprocess
from pathlib import Path
S=Path('/tmp/bot-wt/P6-20/work/p6-orchestration/evidence/D3-orch')
R=json.loads((S/'result.json').read_text()); P=json.loads((S/'prompts.json').read_text())['cases']
def load(p): return [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
def events(p): return [(i,x['event']) for i,x in enumerate(load(p),1) if x.get('type')=='event']
def text(c): return ''.join(x.get('text','') for x in c or [] if x.get('type')=='text')
rows=[]; by=collections.defaultdict(lambda:[0,0]); totals=collections.Counter(); selected={'dir3-power-1','chat1-thanks-1','single1-packing-1','single3-fib-run-1','par1-two-tasks-2','stop2-archive-3'}
for p in P:
 for rep in range(1,4):
  gid=f"{p['id']}-{rep}"; path=S/'raw'/f'{gid}.jsonl'; lines=load(path); m=lines[0]; regions=[]; cur=None; calls={}
  for ln,e in events(path):
   d=e.get('data') or {}; t=e['type']
   if t=='user/message' and d.get('source',{}).get('kind') in ('user','pbots-worker'):
    assert cur is None, (gid,'unclosed region')
    cur={'kind':d['source']['kind'],'text':text(d.get('content')),'tools':[],'tail':[],'start':ln,'source':d['source']}; regions.append(cur)
   elif t=='tool/call':
    assert cur is not None,(gid,'orphan call',ln)
    c={'line':ln,'id':d['callId'],'name':d['name'],'args':d.get('arguments'),'result':None};cur['tools'].append(c);calls[d['callId']]=c;totals[d['name']]+=1
   elif t=='tool/result':
    msg=d.get('message',{}); cid=msg.get('toolCallId',d.get('toolCallId')); assert cid in calls,(gid,'orphan result',ln)
    calls[cid]['result']={'line':ln,'error':msg.get('isError',False),'text':text(msg.get('content'))}
    if cur: cur['tail']=[]
   elif t=='assistant/message' and cur:
    txt=text(d.get('message',{}).get('content'))
    if txt.strip(): cur['tail'].append({'line':ln,'text':txt})
   elif t=='turn/end':
    if cur: cur['end']=d.get('reason',{}).get('kind');cur['endLine']=ln;cur=None
  assert cur is None,(gid,'truncated')
  users=[r for r in regions if r['kind']=='user']; reports=[r for r in regions if r['kind']=='pbots-worker']; expected=p.get('turns',[p.get('prompt')]); assert [r['text'] for r in users]==expected,(gid,'prompt mismatch')
  assert all(r.get('end')=='completed' for r in regions); assert all(c['result'] is not None for r in regions for c in r['tools'])
  c=collections.Counter(t['name'] for t in users[-1]['tools']); c0=collections.Counter(t['name'] for t in users[0]['tools'])
  k=p['kind']; ok=(c['create_bot']==0 and c['send_to_bot']==0 and c['stop_bot']==0) if k in ('direct','chat') else (c['create_bot']==(1 if k=='single' else 2) and c['send_to_bot']==c['stop_bot']==0) if k in ('single','parallel') else False
  if k=='attach': ok=c0['create_bot']==1 and c['create_bot']==c['stop_bot']==0 and c['send_to_bot']>=1
  if k=='stop': ok=c0['create_bot']==1 and c['create_bot']==0 and c['stop_bot']==1
  scored=next(x for x in R['perTurn'] if x['promptId']==p['id'] and x['rep']==rep)
  assert ok==scored['routeOk']; assert hashlib.sha256(path.read_bytes()).hexdigest()==scored['raw']['sha256']
  by[k][0]+=1;by[k][1]+=ok
  if k not in ('direct','chat'): assert {'create_bot','send_to_bot','stop_bot'}<=set(m['toolNames'])
  assert m['model']=='glm-5.3' and m['outcome']=='turn/end' and not m['timeouts']
  assert m['frameCount']==len(lines)-2,(gid,'frame count')
  rows.append((gid,m['ts'],m['sessionId']))
  if gid in selected:
   print('\nSAMPLE',gid,'kind',k,'independent routeOk',ok,'score',scored['routeOk'])
   print(json.dumps(regions,ensure_ascii=False,indent=2))
  for report in reports:
   print('\nPOLLUTED',gid,json.dumps(report,ensure_ascii=False,indent=2))
   assert len(report['tail'])==1
   assert all(t['result']['error'] is True for t in report['tools'])
  for w in m['workers']:
   wp=S/'raw'/w['raw']; wl=load(wp); we=events(wp)
   assert wl[0]['createdBy']==m['sessionId'] and wl[0]['workerId']==w['sessionId']
   print('\nWORKER',wp.name,'frames',len(wl)-1)
   for ln,e in we:
    if e['type'] in ('user/message','tool/call','tool/result','turn/end'):
     print(ln,json.dumps(e,ensure_ascii=False))
print('\nINDEPENDENT TOTALS',dict(by),'tools',dict(totals),'sum',sum(v[1] for v in by.values()))
print('48/48 hashes match committed result; 48/48 complete, prompt/frame-count/model checks pass; coordinator tool tables 30/30')
prev=list((S/'raw').glob('*.jsonl.prev2')); expectedprev={f"{p['id']}-{rep}.jsonl.prev2" for p in P if p['kind'] in ('parallel','attach','stop') for rep in range(1,4)}
assert {x.name for x in prev}==expectedprev
runmeta=json.loads((S/'raw'/'run-meta.json').read_text()); assert len(runmeta['entries'])==48
for gid,ts,sid in rows:
 x=next(x for x in runmeta['entries'] if f"{x['id']}-{x['rep']}"==gid); assert x['sessionId']==sid
 old=S/'raw'/f'{gid}.jsonl.prev2'
 if old.exists():
  om=load(old)[0]; assert om['sessionId']!=sid and om['ts']<ts
  print('RECOLLECT',gid,'old',om['ts'],om['sessionId'],'new',ts,sid)
print('18/18 prev2 groups exactly parallel/attach/stop; fresh session and later timestamps; run-meta 48 current session IDs match')
new=json.loads(Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/D3-orch/vfy-score/result.json').read_text());assert new==R
print('Recomputed result JSON identical to committed result')
files=subprocess.check_output(['git','-C','/tmp/bot-wt/P6-20','diff','--name-only','ae41ce7..HEAD'],text=True).splitlines();assert all(x.startswith('work/p6-orchestration/evidence/') for x in files)
print('Diff evidence-only',len(files),'files')
print('REPORT numerical typo: direct/chat = 18 groups, not REPORT line59 24/24')
