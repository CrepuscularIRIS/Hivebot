#!/usr/bin/env python3
import asyncio, json, urllib.request
import websockets

async def main():
    ws_url = json.load(urllib.request.urlopen("http://127.0.0.1:9224/json/list"))[0]["webSocketDebuggerUrl"]
    async with websockets.connect(ws_url, max_size=64*1024*1024) as ws:
        mid = 0
        async def ev(expr):
            nonlocal mid; mid += 1
            await ws.send(json.dumps({"id": mid, "method": "Runtime.evaluate",
                "params": {"expression": expr, "returnByValue": True}}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("id") == mid:
                    return msg.get("result", {}).get("result", {}).get("value")
        async def click_text(txt):
            return await ev(f"(function(){{var els=[...document.querySelectorAll('button')]; var b=els.find(e=>e.textContent.trim()==={txt!r}); if(!b) return 'nf'; b.dispatchEvent(new MouseEvent('mousedown',{{bubbles:true}})); b.click(); return 'ok'}})()")
        # 欢迎页可能有 Get started；主界面没有这些按钮——逐步试
        for s in ["Get started","Next","Next","Next","Skip","Skip","Skip for now"]:
            r = await click_text(s)
            print(s, '->', r)
            await asyncio.sleep(0.7)
        await asyncio.sleep(1.2)
        print('state:', await ev("document.querySelector('.sand-prompt-shell .ProseMirror')?'main-ui':'still-onboarding'"))

asyncio.run(main())
