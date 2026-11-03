// P5-53 对照台 · 一条命令入口。
// 用法：node run.mjs
//   环境变量：COMPARE_RIGHT_DIST（移植版 build 目录，默认 S0 的 /tmp/bot-s0-build/.build/frontend-shell，
//             P5-50 落地后改指 app/ui/renderer-grok 的 build）
//             LEFT_ROOT（原版 0.78.1 解包树，默认 /dev/shm/grok-re/0.78.1/app/dist/renderer）
//             EVID_DIR（证据输出目录，默认 <repo>/work/p5-parity/evidence/compare）
// 产物：singles/ 每侧截图、pairs/ 并排拼图（REF 0.78.1 | OURS 移植树）、persona/ 头像抽帧、
//       u1-diff.{tsv,md} U1′ 差异表初版、run-summary.{json,md}。
// 运行环境：headless Chrome（--headless=new），无 X / 无外联（仅 127.0.0.1 静态服务）。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './cdp.mjs';
import { semanticFixture, toV1, toV3, personaMatrixRoster, PERSONA_STATES, PERSONA_SHAPES, PERSONA_COLORS } from './fixture.mjs';
import { THEMES, VIEWS, PARTS, STYLE_PROPS } from './views.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RIGHT_DIST = process.env.COMPARE_RIGHT_DIST || '/tmp/bot-s0-build/.build/frontend-shell';
const LEFT_ROOT = process.env.LEFT_ROOT || '/dev/shm/grok-re/0.78.1/app/dist/renderer';
const EVID_DIR = process.env.EVID_DIR || path.resolve(HERE, '../../evidence/compare');
const SIDES = {
  ref: { label: 'REF 0.78.1', root: LEFT_ROOT, stub: 'stub-v3.js', ser: toV3 },
  ours: { label: 'OURS 0.18-port', root: RIGHT_DIST, stub: 'stub-v1.js', ser: toV1 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

async function startServer(root, port) {
  const s = spawn('node', [path.join(HERE, 'serve.mjs'), root, String(port)], { stdio: 'ignore' });
  s.stderr?.on?.('data', () => {});
  return s;
}

const CLICK_MAIN = `(() => { const el = [...document.querySelectorAll('.sand-agent-item')][0]; if (!el) return 'no-item'; const r = el.getBoundingClientRect(); for (const t of ['pointerdown','mousedown','pointerup','mouseup','click']) el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window,clientX:r.x+r.width/2,clientY:r.y+r.height/2})); return 'clicked'; })()`;
const STATE_JS = `(() => {
  const b = document.body.innerText;
  const sidebar = document.querySelector('.sand-agents-sidebar');
  return {
    boundary: (b.match(/Couldn't render this/g) || []).length,
    boundaryReports: (window.__stubLogs || []).filter(l => l.includes('renderer_boundary_caught')).length,
    agentItems: document.querySelectorAll('.sand-agent-item').length,
    sidebarWidth: Math.round(sidebar?.getBoundingClientRect().width ?? -1),
    sidebarCollapsed: sidebar?.getAttribute('data-sidebar-collapsed') ?? null,
    hasUserMsg: b.includes('quarterly numbers'),
    hasToolBash: b.includes('analyze.py'),
    hasThinking: b.includes('quarterly delta summary'),
    hasAssistant: b.includes('Revenue is up'),
    hasPermCard: b.includes('Allow once') || b.includes('Allow Once'),
    hasUser2: b.includes('Q4 outlook'),
    personaStates: [...new Set([...document.querySelectorAll('svg[data-grok-state]')].map(e => e.getAttribute('data-grok-state')))],
    bodyLen: b.length,
  };
})()`;

async function captureView(chrome, url, payload, stubSrc, { theme, clickAgent }) {
  await chrome.navigate(`${url}/?theme=${theme}`);
  await sleep(9000);
  let clicked = null;
  if (clickAgent) {
    clicked = await chrome.evaluate(CLICK_MAIN);
    await sleep(4500);
  }
  return clicked;
}

async function main() {
  const t0 = Date.now();
  for (const s of Object.values(SIDES)) {
    if (!(await exists(s.root))) {
      throw new Error(`渲染根目录不存在：${s.root}\n  ${s === SIDES.ours ? '重建方法见 harness/compare/README.md（S0 构建要点）' : '按 RE-unpack §0 重建 0.78.1 解包树'}`);
    }
  }
  await fs.mkdir(path.join(EVID_DIR, 'singles'), { recursive: true });
  await fs.mkdir(path.join(EVID_DIR, 'pairs'), { recursive: true });
  await fs.mkdir(path.join(EVID_DIR, 'persona'), { recursive: true });
  await fs.mkdir(path.join(EVID_DIR, 'styles'), { recursive: true });

  const servers = {};
  const ports = { ref: 26100 + Math.floor(Math.random() * 200), ours: 26400 + Math.floor(Math.random() * 200) };
  for (const [k, s] of Object.entries(SIDES)) servers[k] = await startServer(s.root, ports[k]);
  process.on('exit', () => { for (const s of Object.values(servers)) { try { s.kill('SIGKILL'); } catch {} } });
  await sleep(700);

  const summary = { startedAt: new Date().toISOString(), rightDist: RIGHT_DIST, leftRoot: LEFT_ROOT, views: {}, persona: null, issues: [] };
  const stubSrc = {};
  for (const s of Object.values(SIDES)) stubSrc[s.stub] = await fs.readFile(path.join(HERE, s.stub), 'utf8');

  const chrome = await launchChrome();
  const stitchChrome = await launchChrome({ width: 1440, height: 960, dsf: 1 });

  try {
    // —— 逐侧 × 主题 × 视图 ——
    const singles = {};
    const styles = {};
    for (const [sideKey, side] of Object.entries(SIDES)) {
      for (const theme of THEMES) {
        for (const view of VIEWS) {
          const fx = semanticFixture(view.variant);
          fx.theme = theme;
          await chrome.addStub(stubSrc[side.stub], side.ser(fx));
          const clicked = await captureView(chrome, `http://127.0.0.1:${ports[sideKey]}`, null, null, { theme, clickAgent: view.clickAgent && sideKey === 'ref' });
          const full = await chrome.screenshot();
          const name = `${view.id}.${theme}.${sideKey}.png`;
          await fs.writeFile(path.join(EVID_DIR, 'singles', name), full);
          singles[`${view.id}.${theme}`] = singles[`${view.id}.${theme}`] || {};
          singles[`${view.id}.${theme}`][sideKey] = name;
          const state = await chrome.evaluate(STATE_JS);
          const styleDump = await chrome.evaluate(`(${COLLECT_FN})(${JSON.stringify(Object.fromEntries(PARTS.map(p => [p.part, p.sel[sideKey]])))}, ${JSON.stringify(STYLE_PROPS)})`);
          styles[`${view.id}.${theme}`] = styles[`${view.id}.${theme}`] || {};
          styles[`${view.id}.${theme}`][sideKey] = styleDump;
          summary.views[`${view.id}.${theme}`] = summary.views[`${view.id}.${theme}`] || {};
          summary.views[`${view.id}.${theme}`][sideKey] = { ...state, clicked };
          // 市场入口尝试（仅 conv-rest）：0.78.1 = footer「Connect apps」；0.18 = footer「Plugins」
          if (view.id === 'conv-rest') {
            const pillText = sideKey === 'ref' ? 'Connect apps' : 'Plugins';
            const opened = await chrome.evaluate(`(() => { const el = [...document.querySelectorAll('button,[role=button]')].find(e => (e.textContent||'').includes('${pillText}')); if (!el) return 'no-pill'; const r = el.getBoundingClientRect(); for (const t of ['pointerdown','mousedown','pointerup','mouseup','click']) el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window,clientX:r.x+r.width/2,clientY:r.y+r.height/2})); return 'clicked'; })()`);
            await sleep(3500);
            const shot = await chrome.screenshot();
            if (shot && opened === 'clicked') {
              await fs.writeFile(path.join(EVID_DIR, 'singles', `market.${theme}.${sideKey}.png`), shot);
              singles[`market.${theme}`] = singles[`market.${theme}`] || {};
              singles[`market.${theme}`][sideKey] = `market.${theme}.${sideKey}.png`;
            }
            summary.views[`market.${theme}`] = summary.views[`market.${theme}`] || {};
            summary.views[`market.${theme}`][sideKey] = { pill: opened, ...(await chrome.evaluate(STATE_JS)) };
          }
          console.log(`[view] ${view.id}.${theme}.${sideKey} boundary=${state.boundary}/${state.boundaryReports} items=${state.agentItems} card=${state.hasPermCard}`);
        }
      }
    }
    await fs.writeFile(path.join(EVID_DIR, 'styles', 'styles.json'), JSON.stringify(styles, null, 1));

    // —— 头像矩阵（8 形 × 11 色 × 3 状态，移植版折叠侧栏整列渲染）——
    const persona = { frames: 0, states: {} };
    for (const stateKey of Object.keys(PERSONA_STATES)) {
      const roster = personaMatrixRoster(stateKey);
      const fx = { theme: 'light', layout: { uiLayoutKey: 'sand.client.slice.ui-layout', uiLayoutValue: JSON.stringify({ schemaVersion: 3, value: { sidebar: { expandedWidth: 280, isCollapsed: true }, infoPane: { isOpen: false, width: 320 } } }) }, agents: roster.map((a) => ({ id: a.id, name: a.name, description: '', path: `/agents/${a.id}`, createdAtMs: Date.now() - 86400000, updatedAtMs: Date.now() - 60000, hasUnread: false, notificationsEnabled: true, notifyOnUpdatesEnabled: false, isGroup: false, origin: 'user', lastMessageId: null, lastEntry: null, awaitingUserResponse: null, memberIds: [], conversationPartnerIds: [], avatarDataUrl: null, avatarShape: a.shape, avatarColor: a.color, currentActivity: a.activity, isRunning: false, isPinned: false, isMain: false })), mainAgentId: roster[0].id, entriesByAgent: {} };
      await chrome.setViewport(600, 6300, 2);
      // fx 已是 v1 桩载荷形状（roster 直接可消费），直接注入，不再过 toV1
      await chrome.addStub(stubSrc[SIDES.ours.stub], fx);
      await chrome.navigate(`http://127.0.0.1:${ports.ours}/?theme=light`);
      await sleep(9000);
      const st = await chrome.evaluate(`(() => ({ marks: [...document.querySelectorAll('.sand-agent-item [data-avatar-shape]')].map(m => ({ shape: m.getAttribute('data-avatar-shape'), color: m.getAttribute('data-avatar-color'), state: m.querySelector('svg')?.getAttribute('data-grok-state') })), collapsed: document.querySelector('.sand-agents-sidebar')?.getAttribute('data-sidebar-collapsed') }))()`);
      const stateDir = path.join(EVID_DIR, 'persona', stateKey);
      await fs.mkdir(stateDir, { recursive: true });
      let n = 0;
      for (const m of st.marks || []) {
        if (!m.shape || !m.color) continue;
        const rect = await chrome.evaluate(`(() => { const el = [...document.querySelectorAll('.sand-agent-item [data-avatar-shape]')].find(m => m.getAttribute('data-avatar-shape') === '${m.shape}' && m.getAttribute('data-avatar-color') === '${m.color}'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: window.devicePixelRatio }; })()`);
        if (!rect || rect.width === 0) continue;
        const shot = await chrome.screenshot({ clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: rect.scale } });
        if (shot) { await fs.writeFile(path.join(stateDir, `${m.shape}-${m.color}.png`), shot); n += 1; }
      }
      persona.states[stateKey] = { collapsed: st.collapsed, marks: (st.marks || []).length, statesSeen: [...new Set((st.marks || []).map((m) => m.state))], frames: n };
      persona.frames += n;
      console.log(`[persona] ${stateKey}: marks=${(st.marks || []).length} frames=${n} states=${JSON.stringify(persona.states[stateKey].statesSeen)}`);
      await chrome.setViewport(1440, 900, 2);
    }
    summary.persona = persona;

    // —— 拼图（REF | OURS）——
    let pairs = 0;
    for (const [key, files] of Object.entries(singles)) {
      if (!files.ref || !files.ours) continue;
      const left = await fs.readFile(path.join(EVID_DIR, 'singles', files.ref));
      const right = await fs.readFile(path.join(EVID_DIR, 'singles', files.ours));
      // P5-54 第三列：真实 Electron（app-column.spec.ts 先跑，产出 singles/<key>.app.png）存在就拼成三联
      const appFile = path.join(EVID_DIR, 'singles', `${key}.app.png`);
      const cols = [['REF 0.78.1', left.toString('base64')], ['OURS 0.18-port', right.toString('base64')]];
      if (await exists(appFile)) cols.push(['APP Electron (fake LLM)', (await fs.readFile(appFile)).toString('base64')]);
      await stitchChrome.navigate('about:blank');
      await sleep(200);
      await stitchChrome.evaluate(`document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#525c66'; const wrap = document.createElement('div'); wrap.style.cssText = 'display:grid;grid-template-columns:repeat(${cols.length},1fr);gap:8px;padding:8px'; for (const [label, b64] of ${JSON.stringify(cols)}) { const cell = document.createElement('div'); const h = document.createElement('div'); h.textContent = label; h.style.cssText = 'color:#fff;font:600 13px system-ui;padding:2px 6px'; const img = document.createElement('img'); img.src = 'data:image/png;base64,' + b64; img.style.cssText = 'width:100%;display:block;border:1px solid #999'; cell.append(h, img); wrap.append(cell); } document.body.append(wrap); 'ok'`);
      await sleep(450);
      const shot = await stitchChrome.screenshot();
      if (shot) { await fs.writeFile(path.join(EVID_DIR, 'pairs', `${key}.png`), shot); pairs += 1; }
    }
    summary.pairs = pairs;

    // —— U1′ 差异表 ——
    const diffRows = [];
    for (const [viewKey, bySide] of Object.entries(styles)) {
      for (const p of PARTS) {
        const ref = bySide.ref?.[p.part] ?? null;
        const ours = bySide.ours?.[p.part] ?? null;
        if (ref == null && ours == null) continue;
        if (ref == null || ours == null) {
          diffRows.push({ view: viewKey, part: p.part, prop: '(element)', ref: ref == null ? 'MISSING' : 'present', ours: ours == null ? 'MISSING' : 'present', diff: 'element-only-one-side' });
          continue;
        }
        for (const prop of STYLE_PROPS) {
          const a = (ref[prop] || '').trim(), b = (ours[prop] || '').trim();
          if (a !== b) diffRows.push({ view: viewKey, part: p.part, prop, ref: a, ours: b, diff: 'value' });
        }
      }
    }
    // P5-54 第三列：app（真实 Electron）对 ours（移植树 + 桩）的差异 = shim / 真实数据引入的问题（diff-type app-vs-ours）
    const appStylesPath = path.join(EVID_DIR, 'styles', 'app.json');
    if (await exists(appStylesPath)) {
      const appStyles = JSON.parse(await fs.readFile(appStylesPath, 'utf8'));
      for (const [viewKey, bySide] of Object.entries(styles)) {
        for (const p of PARTS) {
          const ours = bySide.ours?.[p.part] ?? null;
          const app = appStyles[viewKey]?.[p.part] ?? null;
          if (ours == null && app == null) continue;
          if (ours == null || app == null) { diffRows.push({ view: viewKey, part: p.part, prop: '(element)', ref: ours == null ? 'ours MISSING' : 'ours present', ours: app == null ? 'app MISSING' : 'app present', diff: 'app-vs-ours' }); continue; }
          for (const prop of STYLE_PROPS) {
            const a = (ours[prop] || '').trim(), b = (app[prop] || '').trim();
            if (a !== b) diffRows.push({ view: viewKey, part: p.part, prop, ref: `ours=${a}`, ours: `app=${b}`, diff: 'app-vs-ours' });
          }
        }
      }
      summary.appColumn = true;
    }
    const tsv = ['view\tpart\tproperty\tref(0.78.1)\tours(0.18)\tdiff-type', ...diffRows.map(r => [r.view, r.part, r.prop, r.ref, r.ours, r.diff].map(v => String(v).replace(/\t|\n/g, ' ')).join('\t'))].join('\n');
    await fs.writeFile(path.join(EVID_DIR, 'u1-diff.tsv'), tsv);
    const md = [`# U1′ 差异表 · 初版（P5-53 对照台自动产出）`, '', `差异行数：${diffRows.length}（value ${diffRows.filter(r => r.diff === 'value').length} / 单侧缺失 ${diffRows.filter(r => r.diff === 'element-only-one-side').length}）`, '', '| 视图 | 部位 | 属性 | REF 0.78.1 | OURS 0.18 | 类型 |', '|---|---|---|---|---|---|', ...diffRows.map(r => `| ${r.view} | ${r.part} | ${r.prop} | ${String(r.ref).slice(0, 60)} | ${String(r.ours).slice(0, 60)} | ${r.diff} |`)].join('\n');
    await fs.writeFile(path.join(EVID_DIR, 'u1-diff.md'), md);
    summary.u1DiffRows = diffRows.length;

    // —— 汇总与验收标记 ——
    const issues = [];
    for (const [vk, bySide] of Object.entries(summary.views)) {
      for (const sideKey of ['ref', 'ours']) {
        const st = bySide[sideKey];
        if (!st) continue;
        if (st.boundary > 0 || st.boundaryReports > 0) issues.push(`${vk}.${sideKey}: boundary=${st.boundary}/${st.boundaryReports}`);
      }
      if (bySide.ref && bySide.ours && vk.startsWith('conv')) {
        if (!bySide.ref.hasUserMsg || !bySide.ours.hasUserMsg) issues.push(`${vk}: 单侧缺用户消息`);
      }
    }
    if (!summary.views['conv-rest.light']?.ref?.hasToolBash) issues.push('conv-rest.ref: tool 行在桩下不渲染（R3 已提交 harness 同样复现，非对照台回归；v3 是静默丢行不是渲染报错）');
    if (persona.frames !== PERSONA_SHAPES.length * PERSONA_COLORS.length * Object.keys(PERSONA_STATES).length) issues.push(`persona 抽帧不全：${persona.frames}/264`);
    summary.issues = issues;
    summary.pass = issues.filter(i => i.includes('boundary') || i.includes('缺用户消息')).length === 0;
    summary.durationSec = Math.round((Date.now() - t0) / 1000);

    await fs.writeFile(path.join(EVID_DIR, 'run-summary.json'), JSON.stringify(summary, null, 1));
    const smd = [`# P5-53 对照台 run summary`, '', `- 时间：${summary.startedAt}（${summary.durationSec}s）`, `- 左（REF）：${LEFT_ROOT}`, `- 右（OURS）：${RIGHT_DIST}`, `- 拼图：${pairs} 张（pairs/）`, `- U1′ 差异行：${summary.u1DiffRows}（u1-diff.tsv / .md）`, `- persona 抽帧：${persona.frames}/264（persona/<state>/<shape>-<color>.png）`, `- 验收判定：${summary.pass ? 'PASS（两侧同 fixture 完成渲染，boundary=0）' : '见 issues'}`, ...issues.map(i => `- issue：${i}`)].join('\n');
    await fs.writeFile(path.join(EVID_DIR, 'run-summary.md'), smd);
    console.log(smd);
  } finally {
    await chrome.close();
    await stitchChrome.close();
    for (const s of Object.values(servers)) { try { s.kill('SIGKILL'); } catch {} }
  }
}

// 页内样式采集函数（views.mjs 的 COLLECT_STYLES_JS 保持字符串同构，此处内联给 evaluate 用）
const COLLECT_FN = `(parts, props) => {
  const out = {};
  for (const [part, expr] of Object.entries(parts)) {
    let el = null;
    try { el = eval(expr); } catch (e) { el = null; }
    if (!el) { out[part] = null; continue; }
    const cs = getComputedStyle(el);
    const style = {};
    for (const p of props) style[p] = cs.getPropertyValue(p);
    out[part] = style;
  }
  return out;
}`;

main().catch((e) => { console.error(e); process.exit(1); });
