// Minimal CDP driver: launch headless Chrome, inject stub, load page, dump console + screenshot.
// Usage: node drive.mjs <url> <outPrefix> [waitMs]
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';

const url = process.argv[2];
const outPrefix = process.argv[3] || '/tmp/grok-r3-work/out/run';
const waitMs = Number(process.argv[4] || 8000);

const PROFILE = '/tmp/grok-r3-chrome-profile-' + Date.now();
const DEBUG_PORT = 18000 + Math.floor(Math.random() * 2000);

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
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ error: 'timeout:' + method }); } }, 15000);
  });

if (process.env.DEBUG_PAUSE) {
  await send('Debugger.enable');
  await send('Debugger.setPauseOnException', { state: 'all' });
  const pausedStacks = [];
  let resumeSeq = 0;
  const origHandler = ws.onmessage;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Debugger.paused') {
      const frames = (msg.params.callFrames || []).slice(0, 8).map((f) => `${f.functionName || '?'} @ ${f.url.split('/').pop()}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1}`);
      const desc = msg.params.reason + ' :: ' + (msg.params.data?.description || msg.params.data?.value || '');
      pausedStacks.push(desc + '\n  ' + frames.join('\n  '));
      try { require('fs').appendFileSync('/tmp/grok-r3-work/pauses.txt', desc + '\n  ' + frames.join('\n  ') + '\n=====\n'); } catch {}
      if (pausedStacks.length <= 25) send('Debugger.resume');
      else consoleLines.push('[pause] ' + pausedStacks[pausedStacks.length - 1]);
    }
    origHandler(ev);
  };
  process.on('exit', () => { try { require('fs').appendFileSync('/tmp/grok-r3-work/pauses.txt', pausedStacks.slice(0, 40).join('\n=====\n')); } catch {} });
}
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
await send('Runtime.enable');
await send('Page.enable');
// Fetch-based reload blocking removed: failRequest freezes the headless compositor (stale frames).
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  events.push(msg);
};
const docsSeen = new Set();

const stub = await fs.readFile('/tmp/grok-r3-work/stub-init.js', 'utf8');
await send('Page.addScriptToEvaluateOnNewDocument', { source: stub });

const consoleLines = [];
const fmtArg = (a) =>
  a.type === 'string' ? a.value :
  a.type === 'object' && a.preview ? a.preview.description :
  a.description ? a.description : JSON.stringify(a.value);

const pump = setInterval(() => {
  for (const ev of events.splice(0)) {
    if (ev.method === 'Runtime.consoleAPICalled') {
      consoleLines.push(`[page:${ev.params.type}] ${ev.params.args.map(fmtArg).join(' ').slice(0, 600)}`);
    } else if (ev.method === 'Runtime.exceptionThrown') {
      const d = ev.params.exceptionDetails;
      consoleLines.push(`[page:exception] ${d.text} ${d.exception?.description?.slice(0, 800) || ''}`);
    }
  }
}, 100);

await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, waitMs));

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 899, deviceScaleFactor: 2, mobile: false });
await new Promise((r) => setTimeout(r, 400));
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
await new Promise((r) => setTimeout(r, 600));
const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
await fs.mkdir(outPrefix.replace(/\/[^/]*$/, ''), { recursive: true });
if (shot?.result?.data) await fs.writeFile(`${outPrefix}.png`, Buffer.from(shot.result.data, 'base64'));
else consoleLines.push('[driver] screenshot failed');
await fs.writeFile(`${outPrefix}.console.txt`, consoleLines.join('\n'));

// Optional click: CLICK_SEL env, clicked after first settle, then wait CLICK_WAIT ms more.
const clickSel = process.env.CLICK_SEL;
await send('Runtime.evaluate', { expression: `window.__CLICK_TEXT__=${JSON.stringify(process.env.CLICK_TEXT || '')}`, returnByValue: true }).catch(() => {});
if (clickSel) {
  await new Promise((r) => setTimeout(r, Number(process.env.PRE_WAIT || 6000)));
  const clk = await send('Runtime.evaluate', { expression: `(() => { try { const els=[...document.querySelectorAll('${clickSel}')]; const want=(window.__CLICK_TEXT__||''); const el=want?els.find(e=>(e.textContent||'').includes(want)):els[${Number(process.env.CLICK_IDX || 0)}]; if(!el) return JSON.stringify({els:els.length}); const r=el.getBoundingClientRect(); for (const t of ['pointerdown','mousedown','pointerup','mouseup','click']) el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window,clientX:r.x+r.width/2,clientY:r.y+r.height/2})); return JSON.stringify({els:els.length,x:r.x,y:r.y,text:(el.textContent||'').slice(0,40)}); } catch(e) { return 'ERR:'+e.message; } })()`, returnByValue: true });
  consoleLines.push('[driver] click ' + clickSel + ' -> ' + clk?.result?.result?.value);
  await new Promise((r) => setTimeout(r, Number(process.env.CLICK_WAIT || 6000)));
}
// Optional event push: PUSH_EVENT='name:json'
if (process.env.PUSH_EVENT) {
  const [name, json] = process.env.PUSH_EVENT.split(':', 2);
  await new Promise((r) => setTimeout(r, Number(process.env.PRE_WAIT || 6000)));
  const res = await send('Runtime.evaluate', { expression: `window.__pushEvent(${JSON.stringify(name)}, ${json || 'null'})`, returnByValue: true });
  consoleLines.push('[driver] pushEvent ' + name + ' -> ' + res?.result?.result?.value);
  await new Promise((r) => setTimeout(r, Number(process.env.CLICK_WAIT || 8000)));
}
// Also grab the AX-ish text content for quick reading.
const evalRes = await send('Runtime.evaluate', {
  expression: `JSON.stringify({rootLen: document.getElementById('root')?.innerHTML.length, sandEls: document.querySelectorAll('[class*=sand-]').length, marks: performance.getEntriesByType('mark').map(m=>m.name), bodyText: document.body.innerText.slice(0,1500)})`,
  returnByValue: true,
});
await fs.writeFile(`${outPrefix}.text.txt`, String(evalRes.result?.result?.value || ''));

console.log('screenshot:', `${outPrefix}.png`);
console.log('console lines:', consoleLines.length);
console.log(consoleLines.slice(-40).join('\n'));
clearInterval(pump);
ws.close();
killChrome();
process.exit(0);
