import re

app = open('/tmp/t78-asar/dist/electron-main/main-app.cjs', encoding='utf-8', errors='ignore').read()
# caller-interrupted 事件处理链
for kw in ['caller-interrupted', 'caller_speech_started', 'callerInterruption', 'barged', 'barge']:
    hits = list(re.finditer(re.escape(kw), app))
    print(kw, len(hits))

print()
for m in list(re.finditer(r'caller-interrupted', app))[:3]:
    i = m.start()
    print('== caller-interrupted at', i)
    print(repr(app[i-300:i+300].replace('\n', ' ')))
    print('---')
