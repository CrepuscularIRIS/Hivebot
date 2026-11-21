// 来源: repos/dsh-superagent-prototype@6337fc823ce2:src/index.ts（搬运阶梯三级：复制改造；MIT）
/** Main plugin entry: mounts the Runtime and provides its restart callback for deployment account changes. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { Runtime } from './app/runtime.ts'
import { Config, machineOf, type DeploymentConfig } from './deployment.ts'

export const name = 'dsh-superagent'
export const inject = ['agents', 'sessionController', 'sessionPersistence', 'workspaceRegistry', 'permissionPresets', 'tools', 'systemPrompt', 'skills', 'webServer', 'llm', 'subprocess']
export { Config }
export async function apply(ctx: Context, config: DeploymentConfig): Promise<void> {
  const machine = machineOf(config)
  // The management panel provides its own settings UI, so disable DSH's auto-generated settings page.
  ctx.inject(['settings'], child => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
  // Volatile limits update in place without a restart; account changes restart dsh-superagent. DSH's settings service stops
  // serving this entry while dsh-superagent restarts and rereads it only on a configuration write, so trigger `describe()`
  // after restart to keep open configuration forms editable without a page reload.
  // TODO: drop the read once DSH's settings service rereads an entry whose plugin becomes active again.
  const restart = (): void => {
    ctx.fiber.restart().then(() => { ctx.get('settings')?.describe() }).catch((error: unknown) => { ctx.logger.error('dsh-superagent restart failed: %s', String(error)) })
  }
  // goal-0acebfbf R2：composer 对齐 0.78.1 —— tapIndex 注入 CSS（零 fork，dsh-web-app 布局微调）。
  // 收模型选择器排（0.78.1 composer 上方无此排）+语音钮语义保持（voice chat/voice input setup 双钮=0.78.1 四控件缩减版）。
  // goal-0acebfbf R10：手打 @mention 发送静默失败兜底（dsh-web 前端 bug：无效 mention 在 fetch 前抛错，消息零网络活动即丢）。
  // 检测 send 点击后 800ms 零网络活动且编辑器已清空 → api/bot send 端点直发纯文本（channel.js:707 契约 {text,sessionId}）。
  ctx.webServer.tapIndex(html => html.replace('</head>',
    `<script>${String.raw`// R10: 手打 @mention 发送静默失败兜底——dsh-web 前端对无效 mention 在 fetch 前抛错（消息丢且无反馈）。
// 兜底法：捕获编辑器 send 按钮点击后 800ms 内无网络活动，用 api/bot send 端点直发纯文本（channel.js:707 契约）。
(function(){
  if (window.__mentionFallback) return; window.__mentionFallback = true;
  const log = (...a) => console.info('[mention-fallback]', ...a);
  let netActive = false;
  const _f = window.fetch;
  window.fetch = function(u, o){ netActive = true; return _f.apply(this, arguments); };
  const _x = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u){ netActive = true; return _x.apply(this, arguments); };
  const _w = WebSocket.prototype.send;
  WebSocket.prototype.send = function(d){ netActive = true; return _w.apply(this, arguments); };

  const editorText = () => (document.querySelector('[contenteditable=true]') || {}).textContent || '';

  document.addEventListener('mousedown', (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('button[aria-label]') : null;
    if (!btn) return;
    if (!/send/i.test(btn.getAttribute('aria-label') || '')) return;
    const text = editorText().trim();
    if (!text) return;
    netActive = false;
    // 纠错轮修复：text 与目标 sessionId 在同一决策点（点击时刻）锁定，800ms 后只用闭包值——
    // 之前 id 在 800ms 后重读 location，用户点击后快速切换会话会把 A 的文本发进 B（串台）。
    const m = location.pathname.match(/(session-[0-9a-f-]{36})/);
    let sessionId = m ? m[1] : null;
    // 主会话页（URL 无 session 前缀）：点击后立刻拉 state 锁定 mainBotIds[0]（不等 800ms）
    const idFromState = sessionId ? null
      : _f('/api/bot', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ endpoint: 'state', payload: { since: 0 } }) })
          .then(r => r.json())
          .then(j => { const v = j.value || j; const id = (v.mainBotIds || [])[0] || v.mainBotId; if (id) sessionId = id; return id || null; })
          .catch(() => null);
    setTimeout(() => {
      if (netActive) return;                 // 正常发送走了网络——不干预
      const after = editorText().trim();
      if (after === '') {
        // UI 认为成功（清空了）但零网络活动 → 前端静默吞了（mention 解析失败）——原 R10 形态
      } else if (after === text) {
        // R11 形态：点击根本没触发 send 流程（编辑器残留原文本+零网络）——同样兜底直发
      } else {
        return; // 文本变了（用户在改）——不干预
      }
      log('silent failure detected, falling back to api/bot send');
      const send = (sid) => _f('/api/bot', { method: 'POST', headers: {'content-type': 'application/json'},
          body: JSON.stringify({ endpoint: 'send', payload: { text, sessionId: sid } }) })
        .then(r => r.json()).then(j => log('fallback result:', JSON.stringify(j).slice(0,120)))
        .catch(e => log('fallback error:', String(e).slice(0,120)));
      if (sessionId) { send(sessionId); return; }
      if (idFromState) { idFromState.then(id => { if (id) send(id); else log('no session id anywhere'); }); return; }
      log('no session id anywhere');
    }, 800);
  }, true);
  log('installed');
})();
`}</script><style id="composer-parity">
/* 模型选择器排（两胶囊+Manage models）收进单行——0.78.1 无此排 */
[data-testid="model-selector"], [class*="model-selector"] { display: none !important; }
/* composer 行内元素间距收敛 */
[class*="composer"] { gap: 4px; }
</style></head>`))
  const runtime = new Runtime(ctx, machine, restart)
  ctx.effect(() => async () => { await runtime.stop() })
  await runtime.ready
  ctx.logger.info(runtime.configured() ? 'dsh-superagent ready; the Superagent sidebar entry opens the management panel' : `dsh-superagent is waiting for setup: ${runtime.setupProblem?.detail ?? ''}`)
}
export type { Deployment, DeploymentConfig } from './deployment.ts'
export * from './core/index.ts'
