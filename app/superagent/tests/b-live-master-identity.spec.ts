import { describe, expect, test } from 'vitest'
import { resolveLiveMasterId, readDsBotBotParts } from '../src/app/master-id.ts'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mkController = (items: Array<{ id: string; at: number }>) => ({
  list: async () => ({ items: items.map(i => ({ sessionId: i.id, updatedAt: i.at })) }),
})

describe('纠错轮四（审查 #2b）：resolveLiveMasterId 身份白名单', () => {
  const chiefOld = 'session-chief-old', chiefNew = 'session-chief-new', worker = 'session-worker-busy'
  const rooms = ['session-room-x']
  const allow = new Set([chiefOld, chiefNew]) // Chief 的全部段（state.json parts 同源）

  test('活跃 worker 段 updatedAt 更新但不被误选（白名单挡住）', async () => {
    const live = await resolveLiveMasterId(chiefOld, mkController([
      { id: chiefOld, at: 100 },
      { id: chiefNew, at: 200 },
      { id: worker, at: 999 }, // 最活跃但不是 Chief 的段
    ]), rooms, allow)
    expect(live).toBe(chiefNew)
  })

  test('白名单空（旧格式 state.json 无 segments）回退现行为：最新者胜', async () => {
    const live = await resolveLiveMasterId(chiefOld, mkController([
      { id: chiefOld, at: 100 },
      { id: worker, at: 999 },
    ]), rooms, new Set())
    expect(live).toBe(worker)
  })

  test('白名单内无更新段时保持 candidate（不误绑）', async () => {
    const live = await resolveLiveMasterId(chiefOld, mkController([
      { id: chiefOld, at: 500 },
      { id: chiefNew, at: 100 },
    ]), rooms, allow)
    expect(live).toBe(chiefOld)
  })

  test('readDsBotBotParts：segments 形状读取 + 旧格式/缺失回空集', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ident-'))
    mkdirSync(join(dir, 'bot'), { recursive: true })
    writeFileSync(join(dir, 'bot', 'state.json'), JSON.stringify({
      bots: { 'session-chief-old': { segments: [{ sessionId: 'session-chief-old' }, { sessionId: 'session-chief-new' }] } },
    }))
    expect(readDsBotBotParts(dir, 'session-chief-old')).toEqual(new Set(['session-chief-old', 'session-chief-new']))
    expect(readDsBotBotParts(dir, 'session-none').size).toBe(0)
    expect(readDsBotBotParts(undefined, 'x').size).toBe(0)
  })
})
