import re, json, sys
# 0.78.1 preload: extract desktop.main method names + worlds
src = open('/tmp/t78-asar/dist/electron-preload/preload.cjs', encoding='utf-8', errors='replace').read()
# method names registered via be("main",{methods:{...}})
methods = sorted(set(re.findall(r'([a-zA-Z][a-zA-Z0-9]{2,60}):(?:async\s*)?\(', src)))
open('preload-methods-raw.txt','w').write('\n'.join(methods))
# worlds
worlds = re.findall(r'exposeInMainWorld\("([^"]+)"', src)
print(json.dumps({"size": len(src), "worlds": worlds, "raw_method_like_count": len(methods)}, indent=1))
