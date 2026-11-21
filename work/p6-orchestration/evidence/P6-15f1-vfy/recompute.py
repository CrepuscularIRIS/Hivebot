from pathlib import Path
import math
import re
from PIL import Image, ImageStat

OUT = Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-15f1-vfy')
DELIVERY = OUT.parent / 'P6-15'

def color(text):
    return [float(v) for v in re.findall(r'[\d.]+', text)]

def luminance(rgb):
    values = [v / 255 for v in rgb]
    lin = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values]
    return sum(x * y for x, y in zip(lin, [0.2126, 0.7152, 0.0722]))

for file in [DELIVERY / 'contrast-deny.tsv', OUT / 'frames/contrast-deny.tsv', OUT / 'probe-frames/contrast-deny.tsv']:
    for line in file.read_text().splitlines():
        theme, reported, fg, bg = line.split('\t')
        foreground, background = color(fg), color(bg)
        alpha = foreground[3] if len(foreground) == 4 else 1
        rendered = [foreground[i] * alpha + background[i] * (1 - alpha) for i in range(3)]
        low, high = sorted([luminance(rendered), luminance(background)])
        ratio = (high + .05) / (low + .05)
        assert ratio >= 4.5 and abs(ratio - float(reported)) <= .005, (file, line, ratio)
        print(f'{file.relative_to(OUT.parent)} {theme} reported={reported} recomputed={ratio:.8f} PASS')

fresh = sorted((OUT / 'frames').glob('*.png'))
assert len(fresh) == 14
for frame in fresh:
    delivered = DELIVERY / frame.name
    with Image.open(frame) as a, Image.open(delivered) as b:
        a, b = a.convert('RGB'), b.convert('RGB')
        assert a.size == b.size == (1280,820)
        # Large invariant main-chat background, excluding timestamp and seeded avatars.
        crop = (900, 300, 1200, 500)
        am, bm = ImageStat.Stat(a.crop(crop)).mean, ImageStat.Stat(b.crop(crop)).mean
        assert max(abs(x-y) for x,y in zip(am,bm)) < .01, (frame.name,am,bm)
        print(f'{frame.name} size={a.size} invariant-background fresh={am} delivery={bm} PASS')
print('14/14 delivery background colors match fresh stabilized captures; not used as a substitute for visual inspection.')
