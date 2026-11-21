// app/sdk/src/p2temp/preset-id.mjs 的类型标注（上游是纯 JS 无 .d.ts；签名与实现一致）。
declare module '*preset-id.mjs' {
  /** 校验 connectors（非空字符串数组）并返回规范化副本（去重 + 排序）。 */
  export function normalizedConnectors(connectors: unknown): string[]
  /** 内容定 id：'p2temp-' + sha256(JSON.stringify([agentPreset, 规范化 connectors])).slice(0,12)。拒绝缺省 agentPreset。 */
  export function presetIdOf(agentPreset: string, connectors: string[]): string
}
