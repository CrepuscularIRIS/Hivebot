// presetIdOf 共用模块（CONTRACT §3.1 + REUSE v1.1 决策行）：直接 import P2 的
// app/sdk/src/p2temp/preset-id.mjs，不复制第二份。类型声明见 preset-id.d.ts。
export { normalizedConnectors, presetIdOf } from '../../../sdk/src/p2temp/preset-id.mjs'
