// app/sdk/src/market/wrapper-name.mjs 的类型标注（上游纯 JS 无 .d.ts；preset-id.d.ts 同款）。
// UI 只用 wrapperNameOf——命名规则单点在 sdk，不在 renderer 复制第二份（U-26 ①）。
declare module '*wrapper-name.mjs' {
  /** 包名 → wrapper bundle 名（@p2sdk-market/<段>）。 */
  export function wrapperNameOf(name: string): string
}
