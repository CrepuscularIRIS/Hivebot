import sys,glob,os
from PIL import Image
H='/home/lingxufeng/bot/work/p5-parity/evidence/compare/persona'
O=sys.argv[1]
def ink(p,size=28):
    im=Image.open(p).convert('RGBA').resize((size,size),Image.LANCZOS)
    px=[(r,g,b) for r,g,b,a in im.getdata() if a>200 and not (r>235 and g>235 and b>235)]
    n=len(px); m=tuple(round(sum(c[i] for c in px)/n) for i in range(3)) if n else None
    return n,m
for f in sorted(glob.glob(O+'/persona-*-*.png')):
    name=os.path.basename(f)[:-4].split('-')
    if name[1]=='reduced': continue
    state,shape,color=name[1],name[2],name[3]
    h=f'{H}/{state}/{shape}-{color}.png'
    if not os.path.exists(h): continue
    a,b=ink(f),ink(h)
    print(f'{state:9} {shape}-{color:8} ours ink={a[0]:3} rgb={a[1]}  harness ink={b[0]:3} rgb={b[1]}  dRGB={max(abs(x-y) for x,y in zip(a[1],b[1]))}  area%={round(100*abs(a[0]-b[0])/b[0])}')
