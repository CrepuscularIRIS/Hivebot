// P2-TEMP：P3 可推翻
// presetIdOf(agentPreset, connectors)（work/p3-contract/CONTRACT.md §3.1，#4 与
// #21 共用）:
//   'p2temp-' + sha256(JSON.stringify([agentPreset, 规范化 connectors])).slice(0, 12)
// 规范化 = 去重 + 排序（bundle 名是 ASCII，Array#sort 即码点序）。不用 rows
// 内容派生：rows 来自 bundle 的 patch 文件，bundle 一升级 id 就会变、对不上
// header 里冻结的 id（CONTRACT §3.1）。
// agentPreset 与 connectors 必须显式：缺省解析是 main 的单点职责（CONTRACT §8
// 第 2 条）；本模块被 p2temp 与 main 共用，故拒绝缺省输入。
import { createHash } from 'node:crypto'

/** 校验 connectors（非空字符串数组）并返回规范化副本（去重 + 排序）。 */
export function normalizedConnectors(connectors) {
  if (!Array.isArray(connectors) || connectors.length === 0) {
    throw new Error('p2temp: presetIdOf requires a non-empty connectors array of bundle names')
  }
  for (const name of connectors) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('p2temp: presetIdOf requires a non-empty connectors array of bundle names')
    }
  }
  return [...new Set(connectors)].sort()
}

/** 内容定 id：同一 (agentPreset, connectors) 恒得同一 id（CONTRACT §3.1）。 */
export function presetIdOf(agentPreset, connectors) {
  if (typeof agentPreset !== 'string' || agentPreset.trim() === '') {
    throw new Error('p2temp: presetIdOf requires an explicit agentPreset (main resolves defaults; CONTRACT §8 item 2)')
  }
  const digest = createHash('sha256').update(JSON.stringify([agentPreset, normalizedConnectors(connectors)]))
  return `p2temp-${digest.digest('hex').slice(0, 12)}`
}
