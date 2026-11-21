// B10（1.1.0 re-permission）：per-tool 权限档位（LocalToolPermissionCeiling 语义）。
// 1.1.0：ask（发审批卡）/ always（跳过审批）/ never（自动拒）；主线此前内存态不落盘（data.ts:24）。
// 存 localStorage pbots-tool-ceiling：Record<toolName, 'always' | 'never'>——缺省=ask。
const KEY = 'pbots-tool-ceiling'

export type CeilingLevel = 'always' | 'never'

function readMap(): Record<string, CeilingLevel> {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as Record<string, CeilingLevel>
  } catch { return {} } // 坏 JSON 降级空表（Review Focus 2：不 crash）
}

export function readCeiling(toolName: string): CeilingLevel | undefined {
  const v = readMap()[toolName]
  return v === 'always' || v === 'never' ? v : undefined
}

export function writeCeiling(toolName: string, level: CeilingLevel): void {
  const map = readMap()
  map[toolName] = level
  try { window.localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* 静默：写失败保持内存语义 */ }
}

export function removeCeiling(toolName: string): void {
  const map = readMap()
  delete map[toolName]
  try { window.localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* 同上 */ }
}

export function listCeilings(): Record<string, CeilingLevel> { return readMap() }
