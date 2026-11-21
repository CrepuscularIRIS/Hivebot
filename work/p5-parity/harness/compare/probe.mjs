// 开发探针：单侧 boot + 状态采样，用于调 fixture / 桩。产物不进 evidence。
// Usage: node probe.mjs <v1|v3> [theme] [variantJson]
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { launchChrome } from './cdp.mjs';
import { semanticFixture, toV1, toV3 } from './fixture.mjs';

const side = process.argv[2] || 'v1';
const theme = process.argv[3] || 'light';
const variant = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const ROOTS = {
  v1: process.env.COMPARE_RIGHT_DIST || '/tmp/bot-s0-build/.build/frontend-shell',
  v3: '/dev/shm/grok-re/0.78.1/app/dist/renderer',
};
const WORK = `/tmp/bot-p5-53-probe`;

const port = 22500 + Math.floor(Math.random() * 500);
const server = spawn('node', [new URL('./serve.mjs', import.meta.url).pathname, ROOTS[side], String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', () => {});
process.on('exit', () => { try { server.kill('SIGKILL'); } catch {} });
await new Promise((r) => setTimeout(r, 600));

const chrome = await launchChrome();
const stub = await fs.readFile(new URL(`./stub-${side}.js`, import.meta.url), 'utf8');
const fx = semanticFixture(variant);
fx.theme = theme;
const payload = side === 'v1' ? toV1(fx) : toV3(fx);
await chrome.addStub(stub, payload);
await chrome.navigate(`http://127.0.0.1:${port}/?theme=${theme}`);
await new Promise((r) => setTimeout(r, 9000));

if (side === 'v3') {
  // 0.78.1 的会话面板在显式 openAgent（点击侧栏项）后才渲染 transcript（P5-53 实测）
  const clicked = await chrome.evaluate(`(() => { const el = [...document.querySelectorAll('.sand-agent-item')][0]; if (!el) return 0; const r = el.getBoundingClientRect(); for (const t of ['pointerdown','mousedown','pointerup','mouseup','click']) el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window,clientX:r.x+r.width/2,clientY:r.y+r.height/2})); return 1; })()`);
  console.error('v3 click ->', clicked);
  await new Promise((r) => setTimeout(r, 5000));
}

const state = await chrome.evaluate(`(() => {
  const items = [...document.querySelectorAll('.sand-agent-item')];
  const personas = [...document.querySelectorAll('[data-grok-state]')].map((el) => ({
    state: el.getAttribute('data-grok-state'), shape: el.closest('[data-avatar-shape]')?.getAttribute('data-avatar-shape') ?? el.getAttribute('data-avatar-shape'), color: el.closest('[data-avatar-color]')?.getAttribute('data-avatar-color'),
  }));
  const body = document.body.innerText;
  return {
    rootLen: document.getElementById('root')?.innerHTML.length ?? 0,
    agentItems: items.length,
    agentNames: items.map((el) => el.getAttribute('aria-label') || el.textContent?.slice(0, 30)),
    sidebarCollapsed: document.querySelector('.sand-agents-sidebar')?.getAttribute('data-sidebar-collapsed') ?? null,
    sidebarWidth: document.querySelector('.sand-agents-sidebar')?.getBoundingClientRect().width ?? null,
    infoPane: !!document.querySelector('[class*=sand-info-pane], [class*=sand-agent-info]'),
    personas,
    boundary: (body.match(/Couldn't render this/g) || []).length,
    hasUserMsg: body.includes('quarterly numbers'),
    hasThinking: body.includes('quarterly delta summary') || /thinking/i.test(body),
    hasToolBash: body.includes('analyze.py'),
    hasToolRead: body.includes('summary.md'),
    hasAssistant: body.includes('Revenue is up'),
    hasPermCard: body.includes('pandas') || body.includes('run commands') || body.includes('Allow'),
    timeSep: body.includes('yesterday') || body.includes(':') && /am|pm/i.test(body),
    cardEls: [...document.querySelectorAll('[class*=permission],[class*=local-tool],[class*=card],[class*=Card]')].map(e => e.className.slice(0, 90) + ' :: ' + (e.textContent||'').slice(0, 80)).slice(0, 6),
    kinds: [...document.querySelectorAll('[data-kind]')].map(e => e.getAttribute('data-kind')).reduce((a, k) => (a[k] = (a[k]||0)+1, a), {}),
    bodyHead: body,
  };
})()`);
const shot = await chrome.screenshot();
await fs.mkdir(WORK, { recursive: true });
await fs.writeFile(`${WORK}/probe-${side}-${theme}.png`, shot);
await fs.writeFile(`${WORK}/probe-${side}-${theme}.json`, JSON.stringify(state, null, 2));
await fs.writeFile(`${WORK}/probe-${side}-${theme}.console.txt`, chrome.consoleLines.join('\n'));
const stubLogs = await chrome.evaluate(`window.__stubLogs ? JSON.stringify([...window.__stubLogs].filter(l => l.includes('coord.request') || l.includes('readMany') || l.includes('readClient'))) : '[]'`);
console.log('coord requests:', JSON.parse(stubLogs || '[]').join('\n'));
const itemHtml = await chrome.evaluate(`document.querySelector('.sand-agent-item')?.outerHTML.slice(0, 1200) || 'none'`);
console.log('first item html:', itemHtml);
console.log(JSON.stringify({ ...state, bodyHead: undefined }, null, 2));
console.log('bodyHead:', state?.bodyHead?.slice(0, 400));
console.log('console tail:', chrome.consoleLines.slice(-12).join('\n'));
await chrome.close();
process.exit(0);
