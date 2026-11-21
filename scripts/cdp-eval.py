# CDP 求值小工具：python3 /tmp/cdp-eval.py '<js expr>'
import json, sys, urllib.request, asyncio
sys.path.insert(0, '/home/lingxufeng/.local/lib/python3.11/site-packages')
import websockets

WS = json.load(urllib.request.urlopen('http://127.0.0.1:9224/json/list'))[0]['webSocketDebuggerUrl']
EXPR = sys.argv[1]

async def main():
    async with websockets.connect(WS, max_size=50*1024*1024) as ws:
        await ws.send(json.dumps({'id':1,'method':'Runtime.evaluate','params':{'expression':EXPR,'returnByValue':True}}))
        r = json.loads(await ws.recv())
        res = r.get('result',{}).get('result',{})
        print(json.dumps(res.get('value'), ensure_ascii=False)[:4000])

asyncio.run(main())
