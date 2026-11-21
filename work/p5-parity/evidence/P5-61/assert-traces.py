import json
from pathlib import Path

root = Path(__file__).resolve().parent
traces = json.loads((root / 'theme-traces.json').read_text())
for name, theme, cover_color in (
    ('reloadDark', 'cursor-dark', 'rgb(252, 252, 252)'),
    ('reloadLight', 'cursor-light', 'rgb(18, 18, 18)'),
):
    overlapping = [r for r in traces[name] if r['theme'] == theme and r['style'] and r['colors']['#pbots-boot'] and r['colors']['#pbots-boot']['bg'] == cover_color and float(r['colors']['#pbots-boot']['opacity']) > 0.1]
    assert overlapping, f'{name}: opposite cover not observed'
    first = overlapping[0]
    print(f"{name}: OPPOSITE COVER CONFIRMED at {first['t']:.1f}ms, theme={first['theme']}, cover={cover_color}, shell={first['colors']['.sand-shell']['bg']}")
for name in ('worker-start-trace', 'worker-end-trace'):
    rows = json.loads((root / f'{name}.json').read_text())
    assert rows and all(r['style'] and not r['remount'] for r in rows)
    sections = sorted(set(tuple(r['workers']) for r in rows))
    print(f'{name}: {len(rows)} samples; shell replacements=0; theme-style-missing=0; section snapshots={len(sections)}')
end = json.loads((root / 'worker-end-trace.json').read_text())
assert len(set(tuple(r['workers']) for r in end)) > 1
print('worker completion: section set changed during observation; theme remained', sorted(set(r['theme'] for r in end)))
print('These are assertions of the observed defect, NOT a product PASS verdict.')
