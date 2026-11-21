# CDP 截图：python3 /tmp/cdp-shot.py <out.png>
import json, sys, urllib.request, asyncio, base64
import websockets
WS = json.load(urllib.request.urlopen('http://127.0.0.1:9224/json/list'))[0]['webSocketDebuggerUrl']
OUT = sys.argv[1]
async def main():
    async with websockets.connect(WS, max_size=50*1024*1024) as ws:
        await ws.send(json.dumps({'id':1,'method':'Page.captureScreenshot','params':{'format':'png'}}))
        r = json.loads(await ws.recv())
        open(OUT,'wb').write(base64.b64decode(r['result']['data']))
        print('saved', OUT)
asyncio.run(main())
