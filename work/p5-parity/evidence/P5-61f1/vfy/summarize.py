import json, subprocess, io
from pathlib import Path
from PIL import Image, ImageDraw
ROOT=Path('/home/lingxufeng/bot/work/p5-parity/evidence/P5-61f1/vfy')
rows=[]; pictures=[]
for p in sorted(ROOT.glob('repeat-*/*/*.frames.json')):
    d=json.loads(p.read_text()); mode=d['mode']; movie=p.with_name(p.name.replace('.frames.json','.mkv'))
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(movie),'-vf','scale=64:40','-pix_fmt','rgb24','-f','rawvideo','-'])
    size=64*40*3; means=[]
    for i in range(0,len(raw)-size+1,size):
        f=raw[i:i+size]
        means.append(sum(.299*r+.587*g+.114*b for r,g,b in zip(f[::3],f[1::3],f[2::3]))/(64*40))
    near=lambda c: all(abs(v-250)<=1 for v in c)
    gtk=bool(means and abs(means[0]-250)<=1 and near(d['strip'][0]))
    exempt=int(gtk and mode=='dark' and movie.name.startswith('cold-'))
    bad=[{'frame':i,'luma':v} for i,v in enumerate(means) if i>=exempt and (v>60 if mode=='dark' else v<190)]
    row={'path':str(p.relative_to(ROOT)),'mode':mode,'frames':len(means),'gtkFirstFrame':gtk,'exempt':exempt,'declaredExempt':d['unpresented'],'range':[min(means[exempt:]),max(means[exempt:])],'first':means[:3],'bad':bad,'overlayFirst':d['strip'][:3]}
    rows.append(row)
    pick=max(range(exempt,len(means)),key=lambda i: means[i] if mode=='dark' else -means[i])
    png=subprocess.check_output(['ffmpeg','-v','error','-i',str(movie),'-vf',f'select=eq(n\\,{pick})','-frames:v','1','-f','image2pipe','-vcodec','png','-'])
    image=Image.open(io.BytesIO(png)); image.thumbnail((384,246))
    canvas=Image.new('RGB',(400,280),'#888888'); canvas.paste(image,(8,25)); ImageDraw.Draw(canvas).text((5,4),str(p.relative_to(ROOT))+' f'+str(pick),fill='white'); pictures.append(canvas)
    assert not bad,row
    assert len(means)==len(d['whole']),row
    assert exempt==d['unpresented'],row
cold=[r for r in rows if '/cold-' in r['path']]
switch=[]
for p in sorted(ROOT.glob('repeat-*/*/switch.trace.json')):
    d=json.loads(p.read_text())
    for mode,frames in d.items():
        stable=frames[-1]['bg']; bad=[r for r in frames if r['theme']=='cursor-'+mode and r['bg']!=stable]
        switch.append({'path':str(p.relative_to(ROOT)),'mode':mode,'frames':len(frames),'mixed':len(bad),'stable':stable})
        assert not bad
summary={'videos':rows,'coldRecorded':len(cold),'coldGTK':sum(r['gtkFirstFrame'] for r in cold),'coldByTheme':{m:{'n':sum(r['mode']==m for r in cold),'gtk':sum(r['mode']==m and r['gtkFirstFrame'] for r in cold)} for m in ['dark','light']},'switches':switch,'mixedTotal':sum(r['mixed'] for r in switch)}
(ROOT/'independent-summary.json').write_text(json.dumps(summary,indent=2))
out=Image.new('RGB',(400*4,280*((len(pictures)+3)//4)),'#888888')
for i,image in enumerate(pictures):out.paste(image,((i%4)*400,(i//4)*280))
out.save(ROOT/'recordings-contact.png')
print(json.dumps({'videos':len(rows),'frames':sum(r['frames'] for r in rows),'cold':len(cold),'gtk':summary['coldGTK'],'switches':len(switch),'mixed':summary['mixedTotal'],'luma':{m:[min(r['range'][0] for r in rows if r['mode']==m),max(r['range'][1] for r in rows if r['mode']==m)] for m in ['dark','light']}},indent=2))
