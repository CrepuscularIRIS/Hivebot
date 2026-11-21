import re

data = open('/tmp/t78-asar/dist/renderer/assets/chunk-team-bot-line-render-DBs7eslj.js', encoding='utf-8', errors='ignore').read()
for key in ['vHRDVH', 'Vzhfmq', 'lxctHy', 'c1RW8q', 'GdILlQ', 'SyZOKi', 'SwNfAO', 'DousN2', '7wlkBz']:
    pat = re.compile('"' + key + r'":\["([^"\\]{5,200})"\]')
    seen = set()
    for m in pat.finditer(data):
        v = m.group(1)
        # 只要英文
        if re.match(r"^[A-Za-z0-9 ,'\"./():-]+$", v) and v not in seen:
            seen.add(v)
            print(key, '=>', v)
