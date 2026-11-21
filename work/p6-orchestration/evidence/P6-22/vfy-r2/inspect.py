import json, pathlib, collections
B=pathlib.Path('/tmp/bot-wt/P6-22/work/p6-orchestration/evidence/D3-orch/rounds/r2/heldout/raw')
IDS=['single1-packing-1','single3-fib-run-3','par1-two-tasks-2','attach1-hike-append-3','stop1-lowercase-2','stop2-archive-3']
def load(p):
    return [(i,json.loads(s)) for i,s in enumerate(p.read_text().splitlines(),1)]
def inspect(id, timeout=False):
    rows=load(B/(id+'.jsonl')); meta=rows[0][1]
    print('\nGROUP',id,'meta',json.dumps({k:meta.get(k) for k in ['outcome','timeouts','retryCount','rateLimited','frameCount','ts']},ensure_ascii=False))
    current=None; user=0; texts=0; calls=[]; results=[]; start=0
    for line,f in rows[1:]:
        if f.get('type')!='event': continue
        e=f['event']; d=e.get('data',{}); t=e['type']
        if t=='user/message' and d.get('source',{}).get('kind') in ['user','pbots-worker']:
            current=d['source']['kind']; user+=current=='user'; texts=0; calls=[]; results=[]; start=line
            if current=='user': print(' L',line,'user turn',user,'time',e.get('time'))
        elif current and t=='tool/call':
            calls.append(d.get('name')); print(' L',line,'TOOL',d.get('name'),'callId',d.get('callId'))
            if d.get('name') in ['send_to_bot','stop_bot']:
                a=json.loads(d.get('arguments','{}')); print(' target', {k:a[k] for k in ['botId','bot','workerId','sessionId','id'] if k in a})
        elif current and t=='tool/result':
            m=d.get('message',{}); results.append(m.get('isError') is not True)
            if calls and calls[-1]=='create_bot':
                for c in m.get('content',[]):
                    if c.get('type')=='text':
                        try:
                            v=json.loads(c['text']); print(' L',line,'create result',{k:v[k] for k in ['sessionId'] if k in v})
                        except (ValueError,TypeError): pass
            texts=0
        elif current and t=='assistant/message':
            text=''.join(c.get('text','') for c in d.get('message',{}).get('content',[]) if c.get('type')=='text')
            texts+=bool(text.strip())
        elif current and t=='turn/end':
            print(' REGION',current,'userOrdinal',user,'lines',str(start)+'-'+str(line),'end',d.get('reason'),'counts',dict(collections.Counter(calls)),'successfulResults',sum(results),'tailTexts',texts)
            current=None
    if timeout:
        for w in meta['workers']:
            rr=load(B/w['raw']); print(' WORKER',w['raw'],'meta', {k:rr[0][1].get(k) for k in ['retryCount','frameCount','ts','workerId']})
            c=collections.Counter(f.get('event',{}).get('type') for _,f in rr if f.get('type')=='event')
            print('  eventCounts',dict(c))
            for n,f in rr:
                ev=f.get('event',{}); t=ev.get('type'); d=ev.get('data',{})
                if t in ['turn/end','llm/retry','llm/error']:
                    print('  L',n,t,'time',ev.get('time'),'reason',d.get('reason'))
for id in IDS: inspect(id)
inspect('attach2-backup-index-3',True)
