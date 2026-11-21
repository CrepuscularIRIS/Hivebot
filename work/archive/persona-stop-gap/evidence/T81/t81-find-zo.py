import re, glob, os

os.chdir('/tmp/t78-asar/dist/renderer/assets')
pat = re.compile(r'(?<![A-Za-z_$0-9])Zo(?![A-Za-z_$0-9])')
import_pat = re.compile(r'import\{([^}]{1,20000})\}from"\./index\.eager-app[^"]*"')

# 1) 哪些文件 import 了 eager-app 且名字表里有 Zo
consumers = []
for f in glob.glob('*.js'):
    if f.startswith('index.eager-app'):
        continue
    try:
        data = open(f, encoding='utf-8', errors='ignore').read()
    except Exception:
        continue
    for m in import_pat.finditer(data):
        if pat.search(m.group(1)):
            consumers.append(f)
            break
print("import Zo from eager-app:", consumers[:10])

# 2) 这些文件里 Zo( 的调用上下文
for f in consumers[:6]:
    data = open(f, encoding='utf-8', errors='ignore').read()
    for m in re.finditer(r'(?<![A-Za-z_$0-9])Zo\s*\(', data):
        i = m.start()
        print('==', f)
        print(repr(data[i-200:i+150].replace('\n', ' ')))
