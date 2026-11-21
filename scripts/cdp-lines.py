#!/usr/bin/env python3
"""单语句逐条 eval（绕开多语句 null 问题）。每行一个 JS 表达式，输出逐行。"""
import asyncio, json, sys, urllib.request
import websockets

async def main():
    ws_url = json.load(urllib.request.urlopen("http://127.0.0.1:9224/json/list"))[0]["webSocketDebuggerUrl"]
    exprs = [l.strip() for l in open(sys.argv[1]) if l.strip() and not l.startswith('#')]
    async with websockets.connect(ws_url, max_size=64*1024*1024) as ws:
        mid = 0
        async def ev(expr):
            nonlocal mid; mid += 1
            await ws.send(json.dumps({"id": mid, "method": "Runtime.evaluate",
                "params": {"expression": expr, "returnByValue": True}}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("id") == mid:
                    r = msg.get("result", {})
                    if "exceptionDetails" in r:
                        return "EXC:" + r["exceptionDetails"].get("text", "?")[:60]
                    return r.get("result", {}).get("value")
        for e in exprs:
            print(f"{e[:70]} => {await ev(e)}", flush=True)

asyncio.run(main())
