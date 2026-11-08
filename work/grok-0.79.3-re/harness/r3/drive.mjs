// T20 · 0.79.3 参照台驱动（工单验收形态）：
//   node drive.mjs --scene conv-done [--theme light|dark]
// 流程：起 loopback serve（renderer 只读目录）→ 起 headless chrome（隔离 profile/端口、
// 除 loopback 零外联）→ 注入 stub-init.js（由 stub-init-0793.js 提供）→ 按场景交互 →
// 截图 work/grok-0.79.3-re/ref/<scene>.<theme>.png + 同名 .json（bodyText/DOM 断言/
// 控制台 error/nonLoopbackRequests）。产物目录以 env REF_DIR 覆盖（默认仓内 ref/）。
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const SCENE = arg('scene', 'conv-done');
const THEME = arg('theme', 'light');
const RENDERER_DIR = process.env.GROK_RENDERER_DIR || '/tmp/grokbot-0.79.3/extracted/dist/renderer';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const REF_DIR = process.env.REF_DIR || path.resolve(HERE, '../../ref');
const PORT = 8900 + Math.floor(Math.random() * 90);
const DEBUG_PORT = 18200 + Math.floor(Math.random() * 600);
const TMP = process.env.TMPDIR || '/tmp';

const outPrefix = () => path.join(REF_DIR, `${SCENE}.${THEME}`);
await fs.mkdir(REF_DIR, { recursive: true });

// 1) renderer 目录只读校验（工单边界：不写 renderer 树）
// 2) loopback serve
const serve = spawn('node', [path.join(HERE, 'serve.mjs'), RENDERER_DIR, String(PORT)], { stdio: ['ignore', 'ignore', 'pipe'] });
await new Promise((r) => setTimeout(r, 800));

// 3) chrome（工单边界 2：MAP NOTFOUND + no-proxy + 随机 profile）
const PROFILE = mkdtempSync(path.join(TMP, 'bot-T20-chrome-'));
const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${DEBUG_PORT}`,
  '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });
const reap = () => { for (const p of [chrome, serve]) { try { p.kill('SIGKILL'); } catch {} } };
process.on('exit', reap);

async function findTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const page = (await res.json()).find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('no CDP target');
}
const ws = new WebSocket(await findTarget());
await new Promise((r) => { ws.onopen = r; });
let seq = 0; const pending = new Map(); const events = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  events.push(msg);
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq; pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ error: `timeout:${method}` }); } }, 20000);
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  return r?.result?.result?.value;
};

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
const urls = [];
const consoleLines = [];
const pump = setInterval(() => {
  for (const ev of events.splice(0)) {
    if (ev.method === 'Runtime.consoleAPICalled') {
      const a = ev.params.args.map((x) => (x.type === 'string' ? x.value : x.description ?? JSON.stringify(x.value))).join(' ');
      consoleLines.push(`[${ev.params.type}] ${a.slice(0, 500)}`);
    } else if (ev.method === 'Runtime.exceptionThrown') {
      consoleLines.push(`[exception] ${ev.params.exceptionDetails.text} ${ev.params.exceptionDetails.exception?.description?.slice(0, 600) || ''}`);
    } else if (ev.method === 'Network.requestWillBeSent') {
      urls.push(ev.params.request.url);
    }
  }
}, 100);

const stub = await fs.readFile(path.join(HERE, 'stub-init-0793.js'), 'utf8');
await send('Page.addScriptToEvaluateOnNewDocument', { source: stub });

const clickText = async (text, sel = 'button,[role=button]') => {
  const info = await evaluate(`(() => { try { const els=[...document.querySelectorAll('${sel}')]; const el=els.find(e=>(e.textContent||'').includes(${JSON.stringify(text)}) || (e.getAttribute('aria-label')||'').includes(${JSON.stringify(text)})); if(!el) return JSON.stringify({found:0,els:els.length}); const r=el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2}); } catch (e) { return JSON.stringify({found:0,err:String(e)}); } })()`);
  let p; try { p = JSON.parse(String(info)); } catch { return false; }
  if (!p || p.found === 0) return false;
  for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  return true;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  if (s?.result?.data) await fs.writeFile(`${outPrefix()}${name}.png`, Buffer.from(s.result.data, 'base64'));
};
/** 点容器内第 idx 个含 svg 的可点击元素（形状 picker 按钮）。 */
const clickIdx = async (inner, idx, containerSel) => {
  const info = await evaluate(`(() => { const c=document.querySelector('${containerSel}'); if(!c) return JSON.stringify({ok:0}); const els=[...c.querySelectorAll('button,[role=button]')].filter(e=>e.querySelector('${inner}')); const el=els[${idx}]; if(!el) return JSON.stringify({ok:0,found:els.length}); const r=el.getBoundingClientRect(); return JSON.stringify({ok:1,x:r.x+r.width/2,y:r.y+r.height/2,found:els.length}); })()`);
  const p = JSON.parse(String(info));
  if (!p.ok) return { found: p.found ?? 0 };
  for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  return { clicked: true, found: p.found };
};

await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?scene=${SCENE}&theme=${THEME}` });
await new Promise((r) => setTimeout(r, 9000));

const result = { scene: SCENE, theme: THEME, asserts: {}, facts: {}, statusLineSamples: [] };

if (SCENE.startsWith('conv-working')) {
  // T20b：短语探针不猜白名单——bodyText 行集合里排除静态 UI 词后取首条符合短语形态的行
  const phrase = () => evaluate(`(() => {
    const STATIC = new Set(['Main Bot','Research Bot','Ops Bot','Connect apps','Cancel','Create','Create New Bot','New chat','SD','Stub Dev','No messages yet','Mulling it over placeholder']);
    const lines = (document.body.innerText||'').split('\n').map(x=>x.trim()).filter(Boolean);
    const hit = lines.find(l => !STATIC.has(l) && /^[A-Z][a-z']+( [a-z']+){1,6}$/.test(l) && l.length >= 10 && l.length <= 45);
    return hit || '';
  })()`);
  await clickText('Main Bot');
  await new Promise((r) => setTimeout(r, 3000));
  for (const t of [0, 5, 10, 12]) {
    if (t > 0) await new Promise((r) => setTimeout(r, (t === 12 ? 2 : 5) * 1000));
    result.statusLineSamples.push({ t, text: String(await phrase()) });
    if (t === 0 || t === 12) await shot(`-t${t}`);
  }
  // T20b：多挂载短语采样改由外层独立进程循环（单进程内反复 navigate 会卡 boot）——
  // 本进程只采本挂载 t0，写 mountT0；外层聚合成 phrasesAcrossMounts/toolPhrases。
  result.mountT0 = result.statusLineSamples[0]?.text ?? '';
  const body = String(await evaluate('document.body.innerText'));
  result.bodyText = body.slice(0, 4000);
} else if (SCENE === 'conv-done') {
  await clickText('Main Bot');
  await new Promise((r) => setTimeout(r, 5000));
  const body = String(await evaluate('document.body.innerText'));
  result.bodyText = body.slice(0, 4000);
  result.asserts.hasA = body.includes('A first answer');
  result.asserts.hasE = body.includes('E final answer');
  result.asserts.noB = !body.includes('B middle turn');
  result.asserts.noToolSummary = !body.includes('ls -la');
  result.asserts.noToolRowDom = (await evaluate(`document.querySelectorAll('.sand-outline-item[data-kind="tool-call"], [class*="tool-call"]').length`)) === 0;
  await shot('');
} else if (SCENE === 'create-dialog') {
  // T20b：S4 全机器记录——形状按钮数组 / 色板数组 / 初始选中 / 点第 3 形状后 / helpCard / 多次重开初始随机性
  const openDlg = async () => {
    await clickText('New Bot', 'button[aria-label="New Bot"]');
    await new Promise((r) => setTimeout(r, 3000));
    const input = await evaluate(`(() => { const el=document.querySelector('[role=dialog] input,[role=dialog] textarea'); if(!el) return JSON.stringify({found:0}); el.focus(); const r=el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2}); })()`);
    const ip = JSON.parse(String(input));
    if (ip.found !== 0) {
      for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x: ip.x, y: ip.y, button: 'left', clickCount: 1 });
      await send('Input.insertText', { text: 'Research Helper' });
      await new Promise((r) => setTimeout(r, 3000));
    }
  };
  const snapshot = () => evaluate(`(() => {
    const dlg = document.querySelector('[role=dialog]'); if (!dlg) return JSON.stringify({hasDialog:false});
    const btns = [...dlg.querySelectorAll('button,[role=button]')];
    const shapes = btns.map((b, i) => ({ i, svg: b.querySelector('svg path') ? (b.querySelector('svg path').getAttribute('d') || '').slice(0, 40) : null, bg: getComputedStyle(b).backgroundColor, pressed: b.getAttribute('aria-pressed') || b.getAttribute('aria-checked') || (b.dataset.active ?? null) })).filter((x) => x.svg);
    const swatchBtns = btns.map((b, i) => ({ i, aria: b.getAttribute('aria-label') || '', pressed: b.getAttribute('aria-pressed') })).filter((x) => / character color$/.test(x.aria));
    const selectedShape = shapes.find((x) => x.pressed === 'true' || x.pressed === true) ?? null;
        return JSON.stringify({ hasDialog: true, shapes, swatches: swatchBtns.map((x) => x.aria.replace(' character color', '')), helpCard: (dlg.innerText || '').includes('Help me create'), text: (dlg.innerText || '').slice(0, 300), selectedShapeIdx: selectedShape ? selectedShape.i : null, selectedSwatch: (swatchBtns.find((x) => x.pressed === 'true') || {}).aria ?? null });
  })()`);
  await openDlg();
  await shot('-named');
  const facts = JSON.parse(String(await snapshot()));
  // 点第 3 个形状按钮 → 之后态
  const clicked = await clickIdx('svg', 2, '[role=dialog]');
  await new Promise((r) => setTimeout(r, 2000));
  const after = JSON.parse(String(await snapshot()));
  result.facts.createDialog = { ...facts, afterShape3: { clicked, selectedShapeIdx: after.selectedShapeIdx, selectedSwatch: after.selectedSwatch, shapesSameOrder: JSON.stringify(after.shapes) === JSON.stringify(facts.shapes) } };
  await shot('-shape3');
  // 重开 3 次记 initial（关对话框 → 再开）：Cancel 关闭
  const initials = [];
  for (let k = 0; k < 3; k += 1) {
    await clickText('Cancel', '[role=dialog] button');
    await new Promise((r) => setTimeout(r, 1200));
    await openDlg();
    const st = JSON.parse(String(await snapshot()));
    initials.push({ shape: st.selectedShapeIdx, swatch: st.selectedSwatch });
  }
  result.facts.createDialog.initials = initials;
  result.bodyText = String(await evaluate('document.body.innerText')).slice(0, 4000);
} else {
  // 兜底：直接截当前态
  result.bodyText = String(await evaluate('document.body.innerText')).slice(0, 4000);
  await shot('');
}

result.errors = consoleLines.filter((l) => l.startsWith('[error]') || l.startsWith('[exception]')).slice(0, 20);
result.nonLoopbackRequests = [...new Set(urls)].filter((u) => !/^data:|^blob:|^https?:\/\/127\.0\.0\.1|^https?:\/\/localhost/.test(u));
result.consoleTail = consoleLines.slice(-25);
await fs.writeFile(`${outPrefix()}.json`, JSON.stringify(result, null, 1));

console.log(`scene=${SCENE} theme=${THEME} → ${outPrefix()}.png/.json`);
console.log('asserts:', JSON.stringify(result.asserts));
console.log('nonLoopback:', result.nonLoopbackRequests.length);
clearInterval(pump); ws.close(); reap();
process.exit(0);
