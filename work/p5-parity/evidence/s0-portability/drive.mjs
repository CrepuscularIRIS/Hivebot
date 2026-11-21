// S0 driver: headless Chrome + CDP; loads the 0.18 frontend build with stub-init.js,
// walks the U0 journey (sidebar -> open bot -> transcript -> composer send), dumps evidence.
// Usage: node drive.mjs <url> <outPrefix> [theme]
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';

const url = process.argv[2];
const outPrefix = process.argv[3] || '/tmp/bot-s0-run/out/run';
const theme = process.argv[4] || 'light';

const PROFILE = '/tmp/bot-s0-chrome-profile-' + Date.now();
const DEBUG_PORT = 19000 + Math.floor(Math.random() * 2000);
const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${DEBUG_PORT}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
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
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  events.push(msg);
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq; pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ error: 'timeout:' + method }); } }, 20000);
});

const consoleLines = [];
const fmtArg = (a) => a.type === 'string' ? a.value : a.type === 'object' && a.preview ? a.preview.description : a.description ? a.description : JSON.stringify(a.value);
setInterval(() => {
  for (const ev of events.splice(0)) {
    if (ev.method === 'Runtime.consoleAPICalled') consoleLines.push(`[page:${ev.params.type}] ${ev.params.args.map(fmtArg).join(' ').slice(0, 500)}`);
    else if (ev.method === 'Runtime.exceptionThrown') consoleLines.push(`[page:exception] ${ev.params.exceptionDetails.text} ${ev.params.exceptionDetails.exception?.description?.slice(0, 700) || ''}`);
  }
}, 100);

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
await send('Runtime.enable');
await send('Page.enable');
const stub = await fs.readFile('/tmp/bot-s0-run/stub-init.js', 'utf8');
await send('Page.addScriptToEvaluateOnNewDocument', { source: stub });

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.navigate', { url: url + (url.includes('?') ? '&' : '?') + 'theme=' + theme });
await sleep(9000);
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  if (s?.result?.data) await fs.writeFile(`${outPrefix}-${name}.png`, Buffer.from(s.result.data, 'base64'));
  else consoleLines.push(`[driver] screenshot ${name} failed`);
};

const state1 = await evaluate(`(() => {
  const items = [...document.querySelectorAll('.sand-agent-item')];
  return {
    rootLen: document.getElementById('root')?.innerHTML.length ?? 0,
    agentItems: items.length,
    agentNames: items.map((el) => el.querySelector('.sand-agent-item__name')?.textContent),
    personaSvgs: [...document.querySelectorAll('[data-grok-state]')].map((el) => ({ state: el.getAttribute('data-grok-state'), size: el.getAttribute('width') })),
    promptShell: !!document.querySelector('.sand-prompt-shell'),
    bodyText: document.body.innerText.slice(0, 600),
  };
})()`);
await fs.writeFile(`${outPrefix}-state1.json`, JSON.stringify(state1, null, 2));
await shot('1-sidebar');

// type into the tiptap composer via real CDP input pipeline, then send
const focusRes = await evaluate(`(() => {
  const eds = [...document.querySelectorAll('.ProseMirror[contenteditable="true"]')];
  const ed = eds[eds.length - 1];
  if (!ed) return null;
  ed.focus();
  return { count: eds.length, tag: ed.className.slice(0, 40) };
})()`);
let typed = 'no-editor';
if (focusRes) {
  await sleep(500);
  await send('Input.insertText', { text: 'Summarize the top risk for Q4' });
  await sleep(1000);
  typed = await evaluate(`(() => { const eds = [...document.querySelectorAll('.ProseMirror[contenteditable="true"]')]; const ed = eds[eds.length-1]; return 'typed:' + (ed ? ed.textContent : 'gone') + '|send:' + !!document.querySelector('button[aria-label="Send message"]'); })()`);
}
consoleLines.push('[driver] type -> ' + typed + ' ' + JSON.stringify(focusRes));
await sleep(1200);
const sent = await evaluate(`(() => {
  const btn = document.querySelector('button[aria-label="Send message"]');
  if (!btn) return 'no-send-button:' + document.querySelector('.sand-prompt-shell')?.innerText.slice(0, 60);
  if (btn.disabled) return 'send-disabled';
  const r = btn.getBoundingClientRect();
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) btn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  return 'sent';
})()`);
consoleLines.push('[driver] send -> ' + sent);
await sleep(3500);

const stateSend = await evaluate(`(() => ({ sendPromptSeen: window.__sendPromptSeen || 0, boundaryCount: (document.body.innerText.match(/Couldn't render this/g) || []).length }))()`);
await fs.writeFile(`${outPrefix}-stateSend.json`, JSON.stringify(stateSend, null, 2));
await shot('2-after-send');

// open the Research Bot conversation
const click = await evaluate(`(() => {
  const el = [...document.querySelectorAll('.sand-agent-item')].find((e) => (e.textContent || '').includes('Research Bot'));
  if (!el) return 'not-found';
  const r = el.getBoundingClientRect();
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  return 'clicked';
})()`);
consoleLines.push('[driver] open bot -> ' + click);
await sleep(6000);

const state2 = await evaluate(`(() => {
  const body = document.body.innerText;
  const toolRows = [...document.querySelectorAll('[class*=sand-tool], [data-kind="tool-call"]')].length;
  return {
    boundaryCount: (body.match(/Couldn't render this/g) || []).length,
    hasUserMsg: body.includes('quarterly numbers'),
    hasThinking: body.includes('quarterly delta summary') || body.includes('Thinking'),
    hasToolBash: body.includes('bash') || body.includes('analyze.py'),
    hasToolRead: body.includes('summary.md'),
    hasAssistant: body.includes('Revenue is up') && body.includes('12%'),
    hasPermCard: body.includes('run commands'),
    toolRowCount: toolRows,
    headerAvatar: document.querySelector('.sand-chat-header [data-grok-state]')?.getAttribute('data-grok-state') ?? [...document.querySelectorAll('[data-grok-state]')].map((e) => e.getAttribute('data-grok-state')),
    bodyText: body.slice(0, 1200),
  };
})()`);
await fs.writeFile(`${outPrefix}-state2.json`, JSON.stringify(state2, null, 2));
await shot('2-conversation');

await shot('3-switched-bot');

const state3 = await evaluate(`(() => ({
  sendPromptSeen: window.__sendPromptSeen || 0,
  boundaryCount: (document.body.innerText.match(/Couldn't render this/g) || []).length,
  bodyTail: document.body.innerText.slice(-400),
}))()`);
await fs.writeFile(`${outPrefix}-state3.json`, JSON.stringify(state3, null, 2));
await shot('3-after-send');

const stubLogs = await evaluate(`window.__stubLogs ? JSON.stringify([...window.__stubLogs]) : '[]'`);
await fs.writeFile(`${outPrefix}-stublogs.txt`, JSON.parse(stubLogs).join('\n'));
const stubCounts = await evaluate(`window.__stubCounts ? JSON.stringify(Object.fromEntries(window.__stubCounts)) : '{}'`);
await fs.writeFile(`${outPrefix}-stubcounts.json`, JSON.stringify(JSON.parse(stubCounts), null, 2));
await fs.writeFile(`${outPrefix}-console.txt`, consoleLines.join('\n'));

console.log('state1 agents:', state1?.agentItems, 'persona:', state1?.personaSvgs?.length, '| open:', click, '| state2:', JSON.stringify(state2 && { b: state2.boundaryCount, u: state2.hasUserMsg, t: state2.hasToolBash, a: state2.hasAssistant, p: state2.hasPermCard }), '| typed:', typed, '| sent:', sent, '| sendPrompt:', state3?.sendPromptSeen, '| boundary:', state3?.boundaryCount);
console.log('console lines:', consoleLines.length);
console.log(consoleLines.slice(-30).join('\n'));
process.exit(0);
