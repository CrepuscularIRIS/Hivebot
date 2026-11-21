// 重放 grok-bot 0.78.1 的 sand 主题纯函数，生成 --sand-* 语法层 CSS。
// 输入：evidence/chunks/index.eager-common-DbK3Oi_r.js（静态拷贝）
// 仅静态求值，不联网、不加载 Electron。
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('./chunks/index.eager-common-DbK3Oi_r.js', import.meta.url), 'utf8');
const start = src.indexOf('function m_');
const end = src.indexOf('function lv');
if (start < 0 || end < 0 || end <= start) throw new Error(`segment not found: ${start}..${end}`);
let seg = src.slice(start, end);
// 段内引用的外部断言函数 Ge(cond[, msgFn]) -> stub；Ge 也可能以 {__proto__} 等出现，仅替换调用形式
const stubs = 'function Ge(c){return c}\nvar jt={},At=e=>e,Vn=e=>e,M={locale:"en"};\n';
const fn = new Function(stubs + seg + '\nreturn {W_,V_,H_,U_,y_,h_,g_,X_,tv,ev,rv,av,Q,G_,$,K_};');
const api = fn();
const { W_, X_, tv, av } = api;

function block(sel, rec) {
  return `${sel} {\n` + Object.entries(rec).map(([k, v]) => `  ${k}: ${v};`).join('\n') + `\n}`;
}
const out = [];
for (const appearance of ['light', 'dark']) {
  const theme = W_[appearance];
  const rec = av(theme); // {--sand-xxx: value}
  out.push(`/* ===== ${theme.id} · ${theme.name} · ${appearance} · ${Object.keys(rec).length} tokens ===== */`);
  out.push(`[data-theme="cursor-${appearance}"] {\n` + Object.entries(rec).map(([k, v]) => `  ${k}: ${v};`).join('\n') + `\n}`);
}
// 附：accent->blue 别名层（nv）也验证一下 key 数量
writeFileSync(new URL('./theme-sand-tokens.css', import.meta.url), out.join('\n\n') + '\n');
console.log('light tokens:', Object.keys(av(W_.light)).length);
console.log('dark tokens:', Object.keys(av(W_.dark)).length);
console.log('sample light:', Object.entries(av(W_.light)).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' | '));
console.log('sample dark :', Object.entries(av(W_.dark)).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' | '));
