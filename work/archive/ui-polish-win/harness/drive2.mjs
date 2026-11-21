// drive2.mjs — UI-layout reference driver for grok-bot 0.78.1 renderer.
// Usage: node drive2.mjs <url> <stubPath> <outPrefix> [waitMs]
// Env: THEME=light|dark (via url ?theme=), PUSH=<event:json> (after PRE_WAIT), CLICKS=<sel||text;sel||text;...>,
//      PROBE=<js expression file-less string> — evaluated, result saved as .probe.json
// Screen: 1280x800 @ deviceScaleFactor 1 (matches Win11 VM window), DSF env can override (2 for hi-dpi set).
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';

const url = process.argv[2];
const stubPath = process.argv[3];
const outPrefix = process.argv[4] || '/tmp/uiw-work/out/run';
const waitMs = Number(process.argv[5] || 9000);
const DSF = Number(process.env.DSF || 1);

const PROFILE = '/tmp/uiw-chrome-profile-' + Date.now();
const DEBUG_PORT = 19500 + Math.floor(Math.random() * 1500);

const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${DEBUG_PORT}`,
  '--no-first-run', '--no-default-browser-check',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
chrome.stderr.on('data', () => {});
const killChrome = () => { try { chrome.kill('SIGKILL'); } catch {} };
process.on('exit', killChrome);

async function findTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('no CDP target');
}

const ws = new WebSocket(await findTarget());
await new Promise((r) => { ws.onopen = r; });
let seq = 0;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else events.push(msg);
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq; pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ error: 'timeout:' + method }); } }, 25000);
  });

const W = Number(process.env.WIN_W || 1280), H = Number(process.env.H || 800);
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
await send('Runtime.enable');
await send('Page.enable');

const stub = await fs.readFile(stubPath, 'utf8');
await send('Page.addScriptToEvaluateOnNewDocument', { source: stub });

const consoleLines = [];
const fmtArg = (a) =>
  a.type === 'string' ? a.value :
  a.type === 'object' && a.preview ? a.preview.description :
  a.description ? a.description : JSON.stringify(a.value);
const pump = setInterval(() => {
  for (const ev of events.splice(0)) {
    if (ev.method === 'Runtime.consoleAPICalled') {
      consoleLines.push(`[page:${ev.params.type}] ${ev.params.args.map(fmtArg).join(' ').slice(0, 500)}`);
    } else if (ev.method === 'Runtime.exceptionThrown') {
      const d = ev.params.exceptionDetails;
      consoleLines.push(`[page:exception] ${d.text} ${d.exception?.description?.slice(0, 700) || ''}`);
    }
  }
}, 100);

// DOM probe: dump dialog trees with computed styles + all subscribe handler names.
const PROBE_FN = `(() => {
  const PICK = ['width','height','padding','padding-top','padding-inline-start','border-radius','font-size','font-weight','line-height','font-family','color','background-color','border','gap','margin-top','min-height','letter-spacing','box-shadow','outline'];
  const snap = (el, depth, maxDepth, out) => {
    const cs = getComputedStyle(el);
    const rec = {
      tag: el.tagName.toLowerCase(),
      cls: (el.className && typeof el.className === 'string' ? el.className : '').split(/\\s+/).filter(c => c && (c.startsWith('sand-') || c.startsWith('ui-'))).slice(0, 14),
      role: el.getAttribute('role') || undefined,
      aria: el.getAttribute('aria-label') || undefined,
      text: (el.childNodes.length && [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim().slice(0, 80)) || undefined,
      rect: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(),
      style: Object.fromEntries(PICK.map(p => [p, cs.getPropertyValue(p)]).filter(([, v]) => v && v !== 'none' && v !== 'normal' && v !== 'auto')),
    };
    out.push('  '.repeat(depth) + JSON.stringify(rec));
    if (depth < maxDepth) {
      for (const ch of el.children) {
        if (ch.tagName === 'svg' || ch.tagName === 'STYLE' || ch.tagName === 'SCRIPT') continue;
        snap(ch, depth + 1, maxDepth, out);
      }
    }
  };
  const out = [];
  const dialogs = document.querySelectorAll('[role=dialog], [data-state=open][role=dialog], .sand-dialog');
  out.push('dialogs=' + dialogs.length);
  dialogs.forEach((d, i) => { out.push('--- dialog ' + i); snap(d, 0, ${process.env.PROBE_DEPTH || 5}, out); });
  if (!dialogs.length) { out.push('--- body top'); snap(document.body, 0, 2, out); }
  out.push('--- stubEvents: ' + JSON.stringify((window.__stubLogs || []).filter(l => l.includes('subscribe')).slice(0, 6)));
  return out.join('\\n');
})()`;

const clickByTextOrSel = async (spec) => {
  const [sel, text] = spec.split('||');
  const expr = `(() => { try {
    const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
    const el = ${text ? `els.find(e => (e.textContent||'').includes(${JSON.stringify(text)}))` : 'els[0]'};
    if (!el) return JSON.stringify({els: els.length, snippet: (document.body.innerText||'').slice(0,200)});
    el.scrollIntoView({block:'center'});
    const r = el.getBoundingClientRect();
    return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height, text: (el.textContent||'').slice(0,50)});
  } catch (e) { return 'ERR:' + e.message; } })()`;
  const loc = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const info = loc?.result?.result?.value;
  let extra = '';
  if (info && !String(info).startsWith('ERR') && String(info).startsWith('{"x"')) {
    try {
      const p = JSON.parse(info);
      for (const t of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type: t, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      }
      await new Promise((r) => setTimeout(r, 120));
      extra = ` clicked@${Math.round(p.x)},${Math.round(p.y)}`;
    } catch (e) { extra = ' parse-err'; }
  }
  return String(info) + extra;
};

await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, waitMs));

// Optional event push (open settings / theme / deep-link).
if (process.env.PUSH) {
  for (const spec of process.env.PUSH.split(';;')) {
    const [name, json] = spec.split(':', 2);
    const res = await send('Runtime.evaluate', { expression: `window.__pushEvent(${JSON.stringify(name)}, ${json || 'null'})`, returnByValue: true });
    consoleLines.push('[driver] push ' + name + ' -> ' + res?.result?.result?.value);
    await new Promise((r) => setTimeout(r, Number(process.env.PUSH_WAIT || 2500)));
  }
}

// Optional click sequence: CLICKS='sel1||text1;sel2;;sel3'
if (process.env.CLICKS) {
  for (const spec of process.env.CLICKS.split(';')) {
    if (!spec.trim()) continue;
    const r = await clickByTextOrSel(spec.trim());
    consoleLines.push('[driver] click ' + spec + ' -> ' + r.slice(0, 220));
    await new Promise((r2) => setTimeout(r2, Number(process.env.CLICK_WAIT || 2500)));
  }
}

// settle + screenshot (resize nudge to defeat stale compositor frames)
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H - 1, deviceScaleFactor: DSF, mobile: false });
await new Promise((r) => setTimeout(r, 350));
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
await new Promise((r) => setTimeout(r, 500));
const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
await fs.mkdir(outPrefix.replace(/\/[^/]*$/, ''), { recursive: true });
const md5 = shot?.result?.data ? crypto.createHash('md5').update(shot.result.data).digest('hex') : 'noshot';
if (shot?.result?.data) await fs.writeFile(`${outPrefix}.png`, Buffer.from(shot.result.data, 'base64'));
else consoleLines.push('[driver] screenshot failed');

// DOM probe
const pr = await send('Runtime.evaluate', { expression: PROBE_FN, returnByValue: true });
await fs.writeFile(`${outPrefix}.probe.txt`, String(pr?.result?.result?.value || '').slice(0, 400000));
const summary = await send('Runtime.evaluate', {
  expression: `JSON.stringify({bodyHead: document.body.innerText.slice(0, 900), dialogs: document.querySelectorAll('[role=dialog]').length, sandEls: document.querySelectorAll('[class*=sand-]').length})`,
  returnByValue: true,
});
await fs.writeFile(`${outPrefix}.text.txt`, String(summary?.result?.result?.value || ''));
consoleLines.push('[driver] shot md5=' + md5);

console.log('screenshot:', `${outPrefix}.png`);
console.log('console lines:', consoleLines.length);
console.log(consoleLines.slice(-45).join('\n'));
clearInterval(pump);
ws.close();
killChrome();
process.exit(0);
