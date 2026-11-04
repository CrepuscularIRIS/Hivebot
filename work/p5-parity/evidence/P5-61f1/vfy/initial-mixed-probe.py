import json, subprocess
from pathlib import Path
ROOT=Path('/home/lingxufeng/bot/work/p5-parity/evidence/P5-61f1/vfy')
report=[]
for p in sorted(ROOT.glob('repeat-*/*/*dark.mkv')):
    regions={}
    for name,(x,y) in {'connect':(80,780),'search':(190,20),'plus':(235,20),'composer':(500,780)}.items():
        raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-vf',f'format=rgb24,crop=1:1:{x}:{y}','-pix_fmt','rgb24','-f','rawvideo','-'])
        rgb=[list(raw[i:i+3]) for i in range(0,len(raw),3)]
        regions[name]={'stable':rgb[-1],'brightFrames':[i for i,c in enumerate(rgb) if min(c)>100],'rgb':rgb}
    report.append({'movie':str(p.relative_to(ROOT)),'regions':regions})
(ROOT/'initial-mixed-pixels.json').write_text(json.dumps(report,indent=2))
for r in report:
    print(r['movie'],{k:v['brightFrames'] for k,v in r['regions'].items()})
print('FAIL: startup/reload has bright controls in',sum(bool(r['regions']['connect']['brightFrames']) for r in report),'/',len(report),'dark recordings')
assert not any(r['regions']['connect']['brightFrames'] for r in report), 'dark startup/reload exposes bright Connect apps background'
