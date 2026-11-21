#!/usr/bin/env python3
"""CDP 真键盘事件驱动器：Input.dispatchKeyEvent + Input.insertText。
用法:
  cdp-keys.py type "文本"        — 聚焦元素后逐字插入（走 IME 通道，产 input 事件）
  cdp-keys.py press Enter        — 真按键 down/up（trusted event）
  cdp-keys.py combo Return 0x0D  — 指定 nativeKeyCode
"""
import asyncio, json, sys, urllib.request
import websockets

async def main():
    ws_url = json.load(urllib.request.urlopen("http://127.0.0.1:9224/json/list"))[0]["webSocketDebuggerUrl"]
    async with websockets.connect(ws_url, max_size=64*1024*1024) as ws:
        mid = 0
        async def cmd(method, params):
            nonlocal mid; mid += 1
            await ws.send(json.dumps({"id": mid, "method": method, "params": params}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("id") == mid: return msg
        async def ev(expr):
            nonlocal mid; mid += 1
            await ws.send(json.dumps({"id": mid, "method": "Runtime.evaluate",
                "params": {"expression": expr, "returnByValue": True}}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get("id") == mid:
                    return msg.get("result", {}).get("result", {}).get("value")

        mode = sys.argv[1]
        if mode == "type":
            text = sys.argv[2]
            await cmd("Input.insertText", {"text": text})
            print(f"typed {len(text)} chars")
        elif mode == "press":
            key = sys.argv[2]
            code = {"Enter": 13, "Return": 13, "Escape": 27, "Tab": 9, "Backspace": 8}.get(key, 0)
            def kp(t, text=None):
                p = {"type": t, "key": key, "code": key if len(key) > 1 else f"Key{key}",
                     "windowsVirtualKeyCode": code, "nativeVirtualKeyCode": code}
                if text: p["text"] = text
                return p
            # down with text → char-producing key press; plain Enter needs text="\r" for keypress semantics
            await cmd("Input.dispatchKeyEvent", kp("keyDown", "\r" if key in ("Enter", "Return") else None))
            await cmd("Input.dispatchKeyEvent", kp("keyUp"))
            print(f"pressed {key}")
        elif mode == "state":
            out = await ev(sys.argv[2])
            print(out)

asyncio.run(main())
