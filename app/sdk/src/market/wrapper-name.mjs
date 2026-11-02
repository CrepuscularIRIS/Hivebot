// U-26：wrapper 命名规则的纯函数块（零 node: 依赖）——renderer（浏览器 bundle）直接 import 它，
// 规则单点不复制；其余带 node:fs/crypto 的生成逻辑留在 wrapper.mjs。
/** 包名 → wrapper 目录段：scope 与名字各 sanitized 后以 __ 相连。 */
function dirSegmentOf(name) {
  return name.replace(/^@/, '').split('/').map((seg) => seg.replace(/[^a-z0-9-._~]/g, '-')).join('__')
}

/** 包名 → wrapper bundle 名（p2temp/readConnectorRows 的 BUNDLE_NAME_RE 合法形状）。 */
export function wrapperNameOf(name) {
  return `@p2sdk-market/${dirSegmentOf(name)}`
}
