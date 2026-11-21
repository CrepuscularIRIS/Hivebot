# CDP 输入：python3 /tmp/cdp-type.py '<text>'  —— ProseMirror 需真实键盘事件，用 Input.dispatchKeyEvent 逐键太慢；
# 改用 DOM 设置+InputEvent 模拟（ProseMirror 监听 beforeinput/input）
import json, sys, urllib.request, asyncio
import websockets
WS = json.load(urllib.request.urlopen('http://127.0.0.1:9224/json/list'))[0]['webSocketDebuggerUrl']
TEXT = sys.argv[1]
JS = '''(() => {
  const ed = document.querySelector(".sand-prompt-shell .ProseMirror");
  if (!ed) return "NO_EDITOR";
  ed.focus();
  document.execCommand("insertText", false, %s);
  return ed.textContent.slice(0, 50);
})()''' % json.dumps(TEXT)
async def main():
    async with websockets.connect(WS, max_size=50*1024*1024) as ws:
        await ws.send(json.dumps({'id':1,'method':'Runtime.evaluate','params':{'expression':JS,'returnByValue':True}}))
        r = json.loads(await ws.recv())
        print(json.dumps(r.get('result',{}).get('result',{}).get('value'), ensure_ascii=False))
asyncio.run(main())
