import json,subprocess
from pathlib import Path
E=Path(__file__).parent
points={'connect':(80,780),'search':(190,20),'plus':(235,20),'composer':(500,780)}
report=[]
for p in sorted(E.glob('run-*/*.mkv')):
 dark='dark' in p.name
 info=json.loads(p.with_suffix('.frames.json').read_text())
 row={'movie':str(p.relative_to(E)),'unpresented':info['unpresented'],'regions':{}}
 for name,(x,y) in points.items():
  raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-vf',f'format=rgb24,crop=1:1:{x}:{y}','-pix_fmt','rgb24','-f','rawvideo','-'])
  colors=[list(raw[i:i+3]) for i in range(0,len(raw),3)]
  # Only documented dark unpresented first frame is exempt. Backgrounds must stay in the boot-cover→target envelope: dark 18–31, light 252–255.
  bad=[{'frame':i,'rgb':c} for i,c in enumerate(colors) if i>=info['unpresented'] and (max(c)>31 if dark else min(c)<252)]
  row['regions'][name]={'frames':len(colors),'unique':sorted({tuple(c) for c in colors[info['unpresented']:]}),'bad':bad}
 report.append(row)
(E/'pixels-strict.json').write_text(json.dumps(report,indent=1))
for row in report: print(row['movie'],{k:len(v['bad']) for k,v in row['regions'].items()})
print('movies',len(report),'bad regions',sum(bool(v['bad']) for r in report for v in r['regions'].values()))
assert len(report)==20
assert all(not v['bad'] for r in report for v in r['regions'].values())
