# P5-61.f2 录像按钮区逐帧复核（VERIFY-P5-61f1 initial-mixed-probe.py 同点同判据，暗/亮对称）。
# 用法：python3 -I pixels.py <rec 目录>；暗：任一通道 min>100 为亮帧；亮：max<150 为暗帧。exit 1 = 有混色帧。
import json, subprocess, sys
from pathlib import Path
ROOT = Path(sys.argv[1])
PTS = {'connect': (80, 780), 'search': (190, 20), 'plus': (235, 20), 'composer': (500, 780)}
report, bad = [], 0
for p in sorted(ROOT.glob('run-*/*.mkv')):
    dark = 'dark' in p.name
    regions = {}
    for name, (x, y) in PTS.items():
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(p), '-vf', f'format=rgb24,crop=1:1:{x}:{y}', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
        rgb = [list(raw[i:i + 3]) for i in range(0, len(raw), 3)]
        hits = [i for i, c in enumerate(rgb) if (min(c) > 100 if dark else max(c) < 150)]
        regions[name] = {'frames': len(rgb), 'stable': rgb[-1], 'hits': hits}
        bad += bool(hits)
    report.append({'movie': str(p.relative_to(ROOT)), 'mode': 'dark' if dark else 'light', 'regions': regions})
    print(report[-1]['movie'], {k: v['hits'] for k, v in regions.items()}, 'frames', regions['connect']['frames'])
(ROOT / 'pixels.json').write_text(json.dumps(report, indent=1))
print(f"{len(report)} movies ({sum(r['mode'] == 'dark' for r in report)} dark), region-hits={bad}")
sys.exit(1 if bad else 0)
