#!/usr/bin/env python3
"""真鼠标事件（Input.dispatchMouseEvent）——React 合成事件可靠触发。用法: cdp-mouse.py move|click <x> <y>"""
import asyncio, json, sys, urllib.request
import websockets

async def main():
    action, x, y = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    ws_url = json.load(urllib.request.urlopen("http://127.0.0.1:9224/json/list"))[0]["webSocketDebuggerUrl"]
    async with websockets.connect(ws_url, max_size=64*1024*1024) as ws:
        mid = 0
        async def send(**params):
            nonlocal mid; mid += 1
            await ws.send(json.dumps({"id": mid, "method": "Input.dispatchMouseEvent", "params": params}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("id") == mid: return msg
        if action == "move":
            await send(type="mouseMoved", x=x, y=y)
        elif action == "click":
            await send(type="mouseMoved", x=x, y=y)
            await send(type="mousePressed", x=x, y=y, button="left", clickCount=1)
            await send(type="mouseReleased", x=x, y=y, button="left", clickCount=1)
        print(f"{action} {x},{y} ok")

asyncio.run(main())
