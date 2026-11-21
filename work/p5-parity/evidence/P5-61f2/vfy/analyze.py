import json, subprocess, sys
from pathlib import Path
from collections import Counter
E=Path(__file__).parent
summary={'red':[],'runs':[],'points17':[]}
for p in sorted((E/'red-reproduced').glob('reload-*.json')):
 d=json.loads(p.read_text()); bad=d['bad']; summary['red'].append({'file':p.name,'bad':len(bad),'range':[bad[0]['t'],bad[-1]['t']] if bad else None,'stable':d['stable'],'badPerControl':[sum(r['bg'][i] is not None and r['bg'][i]!=d['stable'][i] for r in bad) for i in range(4)]})
for run in sorted(E.glob('run-*')):
 r={'run':run.name,'traces':[],'movies':[]}
 for p in sorted(run.glob('reload-*.json')):
  d=json.loads(p.read_text())
  if isinstance(d,list):
   rows=d; key='ctl'; stable=rows[-1][key]
   bad=[x for x in rows if any(v is not None and v!=stable[i] for i,v in enumerate(x[key]))]
  elif 'rows' in d:
   rows=d['rows']; key='bg'; stable=d['stable']; bad=d['bad']
  else:continue
  band=[x for x in rows if 129<=x['t']<=380]
  r['traces'].append({'file':p.name,'bad':len(bad),'rows':len(rows),'band129to380':len(band),'stable':stable})
 for p in sorted(run.glob('*.frames.json')):
  d=json.loads(p.read_text()); skip=d['unpresented']; vals=d['whole'][skip:]; mode=d['mode']
  r['movies'].append({'file':p.name,'mode':mode,'frames':len(d['whole']),'unpresented':skip,'minLuma':min(vals),'maxLuma':max(vals),'badWhole':sum(x>60 if mode=='dark' else x<190 for x in vals),'badStrip':sum(sum(v)/3>60 if mode=='dark' else sum(v)/3<200 for v in d['strip'][skip:])})
 summary['runs'].append(r)
for p in E.glob('points17-*.json'):
 rows=json.loads(p.read_text()); stable=rows[-1]['bg']; summary['points17'].append({'file':p.name,'n':len(rows),'nullPerControl':[sum(x['bg'][i] is None for x in rows) for i in range(4)],'bad':sum(any(v is not None and v!=stable[i] for i,v in enumerate(x['bg'])) for x in rows),'timeRange':[rows[0]['t'],rows[-1]['t']]})
(E/'summary.json').write_text(json.dumps(summary,indent=2))
print('RED',summary['red']); print('NEW rounds',len(summary['runs']))
for r in summary['runs']: print(r['run'],'trace bad',sum(x['bad'] for x in r['traces']),'movies',len(r['movies']),'whole/strip bad',sum(x['badWhole']+x['badStrip'] for x in r['movies']))
print('POINTS17',summary['points17'])
assert len(summary['runs'])==5
assert all(len(r['movies'])==4 for r in summary['runs'])
assert all(not x['bad'] for r in summary['runs'] for x in r['traces'])
assert all(not(x['badWhole']+x['badStrip']) for r in summary['runs'] for x in r['movies'])
assert len(summary['points17'])==2 and all(x['n']==17 and not x['bad'] and not any(x['nullPerControl']) for x in summary['points17'])
