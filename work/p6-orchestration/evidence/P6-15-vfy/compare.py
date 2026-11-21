#!/usr/bin/env python3
"""对比两组同名截图的结构相似度（dHash 感知哈希 + 像素差），验收 builder 截图可复现。"""
import sys
from pathlib import Path
from PIL import Image

def dhash(im: Image.Image, size=16) -> list[int]:
    g = im.convert('L').resize((size + 1, size))
    return [1 if g.getpixel((x, y)) > g.getpixel((x + 1, y)) else 0 for y in range(size) for x in range(size)]

def ham(a, b) -> int:
    return sum(x != y for x, y in zip(a, b))

names = ['sidebar-workers-4states', 'sidebar-workers-folded', 'sidebar-rail', 'main-report-batch',
         'main-report-single', 'worker-dock-focused', 'worker-task']
a_dir, b_dir = Path(sys.argv[1]), Path(sys.argv[2])
print(f'{"name":28} dHash-Hamming(0-256) 判定')
bad = 0
for n in names:
    for mode in ['light', 'dark']:
        f = f'{n}-{mode}.png'
        a, b = a_dir / f, b_dir / f
        if not a.exists() or not b.exists():
            print(f'{f:28} 缺文件: {a.exists()=}{b.exists()=}'); bad += 1; continue
        ia, ib = Image.open(a), Image.open(b)
        h = ham(dhash(ia), dhash(ib))
        verdict = 'OK' if h <= 30 else ('DIFF' if h <= 60 else 'FAIL')
        if verdict != 'OK': bad += 1
        print(f'{f:28} {h:4} {verdict} ({ia.size} vs {ib.size})')
sys.exit(1 if bad else 0)
