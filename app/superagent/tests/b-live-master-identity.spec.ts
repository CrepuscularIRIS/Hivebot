import { describe, expect, test } from 'vitest'
import { resolveLiveMasterId, readDsBotBotIdentity } from '../src/app/master-id.ts'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 列表越靠后 updatedAt 越新（worker 通常最新）。 */
const mkController = (ids: string[]) => ({
  list: async () => ({ items: ids.map((id, n) => ({ sessionId: id, updatedAt: 1000 + n })) }),
})
const writeState = (bots: Record<string, unknown>, mainBotIds?: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'ident-'))
  mkdirSync(join(dir, 'bot'), { recursive: true })
  writeFileSync(join(dir, 'bot', 'state.json'), JSON.stringify({ mainBotIds, bots }))
  return dir
}

const chiefOld = 'session-chief-old', chiefNew = 'session-chief-new', worker = 'session-worker'

// UI 验收 B2：旧实现按「updatedAt 最新者胜」轮转，Chief 用原生 create_bot 新建的 Worker 会话最新 →
// 插件 masterId 绑到 Worker；真实 bot-new-part 后新段记在条目的 sessionId（不在 segments）→ 永远留在旧段。
// DS-Bot 0.3.8 store.js:507 chatOf = botId => sessionIdOf(botOf(botId)?.sessionId) ?? botId 才是权威认定。
describe('UI 验收 B2：master 轮转以 DS-Bot 认定为准（bot/state.json 的 sessionId）', () => {
  test('首启形状（条目无 sessionId/segments）：Chief 新建的 worker 最新也不接任', async () => {
    const dir = writeState({ [chiefOld]: { name: 'Chief', createdBy: null }, [worker]: { name: 'Worker', createdBy: chiefOld } }, [chiefOld])
    const identity = readDsBotBotIdentity(dir, chiefOld)
    expect(identity?.current).toBe(chiefOld)
    expect(await resolveLiveMasterId(chiefOld, mkController([chiefOld, worker]), identity)).toBe(chiefOld)
  })

  test('真实段轮转形状（bot-new-part 实测：sessionId=新段，segments=[旧段]）：跟到新段', async () => {
    const dir = writeState({ [chiefOld]: { sessionId: chiefNew, segments: [{ sessionId: chiefOld }], openParts: [] } }, [chiefOld])
    const identity = readDsBotBotIdentity(dir, chiefOld)
    expect(identity?.owned).toEqual(new Set([chiefOld, chiefNew]))
    expect(await resolveLiveMasterId(chiefOld, mkController([chiefOld, chiefNew, worker]), identity)).toBe(chiefNew)
  })

  test('换主：旧 Chief 不属于新主 → 绑到新主的当前段', async () => {
    const dir = writeState({ [chiefOld]: { sessionId: chiefOld }, [worker]: { sessionId: 'session-worker-current' } }, [worker])
    const identity = readDsBotBotIdentity(dir, worker)
    expect(await resolveLiveMasterId(chiefOld, mkController([chiefOld, worker, 'session-worker-current']), identity)).toBe('session-worker-current')
  })

  test('无身份认定（state.json 未写 / 无条目）：保持 candidate，不再「最新者胜」', async () => {
    expect(await resolveLiveMasterId(chiefOld, mkController([chiefOld, worker]), undefined)).toBe(chiefOld)
    const dir = writeState({ [worker]: {} }, [worker])
    expect(readDsBotBotIdentity(dir, chiefOld)).toBeUndefined()
    expect(readDsBotBotIdentity(undefined, chiefOld)).toBeUndefined()
  })

  test('当前段未列出且 candidate 仍属该 bot（存活的旧段/openPart）：保持 candidate', async () => {
    const identity = { current: chiefNew, owned: new Set([chiefOld, chiefNew, worker]) }
    expect(await resolveLiveMasterId(chiefOld, mkController([chiefOld, worker]), identity)).toBe(chiefOld)
  })

  test('当前段与 candidate 都不可用：取该 bot 仍存活段里最新的，没有则保持', async () => {
    const identity = { current: chiefNew, owned: new Set([chiefOld, chiefNew, worker]) }
    expect(await resolveLiveMasterId('session-elsewhere', mkController([chiefOld, worker]), identity)).toBe(worker)
    expect(await resolveLiveMasterId('session-elsewhere', mkController(['session-room-y']), identity)).toBe('session-elsewhere')
  })
})
