// P5-53 对照台 · Chrome + CDP 客户端。
// 来源: work/p5-parity/harness/grok-r3/drive.mjs 的 CDP 核心（R3 踩坑已吸收：
// 随机调试端口 + 每 run 独立 profile，防孤儿 chrome 劫持；结束只 kill 自己 spawn 的子进程）。
import { spawn } from 'node:child_process';

export async function launchChrome({ width = 1440, height = 900, dsf = 2 } = {}) {
  const profile = `/tmp/bot-p5-53-profile-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const debugPort = 21000 + Math.floor(Math.random() * 3000);
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`,
    '--no-first-run', '--no-default-browser-check',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  chrome.stderr.on('data', () => {});
  const kill = () => { try { chrome.kill('SIGKILL'); } catch {} }; // 测试自管子进程（CLAUDE.md §5 允许项）
  process.on('exit', kill);

  let wsUrl = null;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await new Promise((r) => setTimeout(r, 200));
  }
  if (!wsUrl) { kill(); throw new Error('no CDP target'); }

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => { ws.onopen = r; });
  let seq = 0;
  const pending = new Map();
  const events = [];
  const stubScriptIds = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    events.push(msg);
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq; pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ error: 'timeout:' + method }); } }, 30000);
  });
  const consoleLines = [];
  const fmtArg = (a) => a.type === 'string' ? a.value : a.type === 'object' && a.preview ? a.preview.description : a.description ? a.description : JSON.stringify(a.value);
  const pump = setInterval(() => {
    for (const ev of events.splice(0)) {
      if (ev.method === 'Runtime.consoleAPICalled') consoleLines.push(`[page:${ev.params.type}] ${ev.params.args.map(fmtArg).join(' ').slice(0, 400)}`);
      else if (ev.method === 'Runtime.exceptionThrown') consoleLines.push(`[page:exception] ${ev.params.exceptionDetails.text} ${ev.params.exceptionDetails.exception?.description?.slice(0, 600) || ''}`);
    }
  }, 100);

  await send('Runtime.enable');
  await send('Page.enable');
  const setViewport = async (w = width, h = height, d = dsf) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: d, mobile: false });
  };
  await setViewport();

  return {
    send, setViewport, consoleLines, ws,
    evaluate: async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r?.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text || String(r.result.exceptionDetails) };
      return r?.result?.result?.value;
    },
    // 注入 fixture + stub（addScriptToEvaluateOnNewDocument 按注册序执行，fixture 先于 stub；
    // 重复注入前先移除旧脚本，避免多套桩叠加——只有最后一套生效但会产生噪音与双 claim）
    addStub: async (stubSource, fixture) => {
      while (stubScriptIds.length) {
        const id = stubScriptIds.pop();
        await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id });
      }
      const a = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__FIXTURE__=${JSON.stringify(fixture)};` });
      if (a?.result?.identifier) stubScriptIds.push(a.result.identifier);
      const b = await send('Page.addScriptToEvaluateOnNewDocument', { source: stubSource });
      if (b?.result?.identifier) stubScriptIds.push(b.result.identifier);
    },
    navigate: (url) => send('Page.navigate', { url }),
    screenshot: async (opts = {}) => {
      const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, ...opts });
      return s?.result?.data ? Buffer.from(s.result.data, 'base64') : null;
    },
    async close() {
      clearInterval(pump);
      try { ws.close(); } catch {}
      kill();
      process.removeListener('exit', kill);
    },
  };
}
