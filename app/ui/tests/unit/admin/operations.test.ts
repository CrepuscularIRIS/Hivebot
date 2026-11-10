// P7-F1 操作账本定向单测：append/flush 失败→副作用 0；同 key 并发仅 1 占位；
// 尾行截断（行原子修复+持久 repaired 事件）/版本未知/丢文件失败关闭；读回前后
// 投影/undo；state unknown 不变成功；凭证字段拒入账；恢复投影三类视图；
// undo 句柄往返；回执位翻转（含旧代拒）。
//
// open 用 vi.mock 部分替换（默认仍 passthrough 真实现）模拟 append 失败；
// 零参 teardown 调用透传容忍（LEARNINGS U-18，同 m3/store-lock-flush.test.ts）。
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '../../support/tmp-sweep.ts'

// vi.mock 工厂被提升到模块体之前执行：flag 用函数读值，调用时模块体已初始化
let failNextOpen = false
let repairFailure: 'open' | 'sync' | 'rename' | undefined
let syncBarrier: { entered: () => void; wait: Promise<void> } | undefined
const currentBarrier = (): typeof syncBarrier => syncBarrier
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
const shouldFailOpen = (): boolean => failNextOpen
const repairFailureAt = (): typeof repairFailure => repairFailure

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const open = vi.fn((...args: unknown[]) => {
    if (args.length < 2) return Promise.resolve(undefined as never)
    if (shouldFailOpen()) {
      failNextOpen = false
      return Promise.resolve({
        appendFile: () => Promise.reject(new Error('simulated EIO')),
        sync: () => Promise.resolve(),
        close: () => Promise.resolve(),
      })
    }
    if (repairFailureAt() === 'open') return Promise.reject(new Error('simulated EIO open'))
    return actual.open(args[0] as string, args[1] as string, args[2] as number | undefined).then((handle) => {
      if (repairFailureAt() !== 'sync' && currentBarrier() === undefined) return handle
      return {
        appendFile: (data: Buffer) => handle.appendFile(data),
        sync: async () => {
          const barrier = currentBarrier()
          if (barrier !== undefined) {
            syncBarrier = undefined
            barrier.entered()
            await barrier.wait
          }
          if (repairFailureAt() === 'sync') throw new Error('simulated EIO sync')
          await handle.sync()
        },
        close: () => handle.close(),
      }
    })
  })
  const rename = vi.fn((...args: unknown[]) => {
    if (args.length < 2) return Promise.resolve()
    if (repairFailureAt() === 'rename') return Promise.reject(new Error('simulated EIO rename'))
    return actual.rename(args[0] as string, args[1] as string)
  })
  return { ...actual, open, rename }
})

const {
  OPERATIONS_JSONL, OPERATIONS_VERSION, OperationsLedger,
} = await import('../../../main/admin/operations')

type Ledger = InstanceType<typeof OperationsLedger>
type BeginRequest = Parameters<Ledger['beginOperation']>[0]
type FinishResult = Parameters<Ledger['finishOperation']>[1]

const dataDir = (): string => tmkdir('bot-p7f1-ops-')
const ledgerFile = (dir: string): string => join(dir, OPERATIONS_JSONL)
const rawLines = (dir: string): string[] =>
  readFileSync(ledgerFile(dir), 'utf8').split('\n').filter((l) => l !== '')
const beginCount = (dir: string): number =>
  rawLines(dir).filter((l) => JSON.parse(l).type === 'begin').length

const baseRequest = (over: Partial<BeginRequest> = {}): BeginRequest => ({
  action: 'install', actor: 'main-bot', turnCategory: 'user', generation: 1,
  target: 'connector-x', params: { preset: 'standard' },
  ...over,
})
const finishWith = (over: Partial<FinishResult> = {}): FinishResult => ({ outcome: 'completed', ...over })

beforeEach(() => { failNextOpen = false; repairFailure = undefined })

describe('P7-F1 · beginOperation 先落盘意图', () => {
  it('落盘 begin 行（version/operationId/去重键/generation/回合类别/actor/动作/目标/参数/授权依据/前投影）后才返回', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    const r = await ledger.beginOperation(baseRequest({
      dedupeKey: 'install:bot-1:connector-x',
      authority: { basis: 'human-text', goalId: 'g-1' },
      before: { enabled: false },
      session: { sessionId: 's-1', turnId: 3, sourceKind: 'user' },
    }))
    ledger.close()
    expect(r.created).toBe(true)
    expect(r.status).toBe('inProgress')
    expect(typeof r.operationId).toBe('string')
    const lines = rawLines(dir).map((l) => JSON.parse(l))
    expect(lines).toHaveLength(1)
    const begin = lines[0]
    expect(begin.version).toBe(OPERATIONS_VERSION)
    expect(begin.type).toBe('begin')
    expect(begin.operationId).toBe(r.operationId)
    expect(begin.dedupeKey).toBe('install:bot-1:connector-x')
    expect(begin.generation).toBe(1)
    expect(begin.turnCategory).toBe('user')
    expect(begin.actor).toBe('main-bot')
    expect(begin.action).toBe('install')
    expect(begin.target).toBe('connector-x')
    expect(begin.params).toEqual({ preset: 'standard' })
    expect(begin.authority).toEqual({ basis: 'human-text', goalId: 'g-1' })
    expect(begin.before).toEqual({ enabled: false })
    expect(typeof begin.ts).toBe('number')
  })

  it('非法请求拒收（未知回合类别 / 空 actor），不入账', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    await expect(ledger.beginOperation(baseRequest({ turnCategory: 'robot' as never })))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_BAD_REQUEST' })
    await expect(ledger.beginOperation(baseRequest({ actor: '' })))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_BAD_REQUEST' })
    ledger.close()
    expect(existsSync(ledgerFile(dir))).toBe(false)
  })
})

describe('P7-F1 · 同 key 并发仅 1 占位', () => {
  it('并发同 dedupeKey：恰 1 个 created，另一个拿到同一 operationId 且 created:false', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    const req = baseRequest({ dedupeKey: 'install:bot-1:connector-x' })
    const [a, b] = await Promise.all([ledger.beginOperation(req), ledger.beginOperation(req)])
    ledger.close()
    const created = [a, b].filter((r) => r.created)
    expect(created).toHaveLength(1)
    const other = a.created ? b : a
    expect(other.created).toBe(false)
    expect(other.operationId).toBe(created[0].operationId)
    expect(beginCount(dir)).toBe(1)
  })

  it('首个同 key begin 落盘失败不占位：后来者可建（P6-21.f1 接管语义）', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    failNextOpen = true
    await expect(ledger.beginOperation(baseRequest({ dedupeKey: 'k1' })))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_APPEND_FAILED' })
    const second = await ledger.beginOperation(baseRequest({ dedupeKey: 'k1' }))
    ledger.close()
    expect(second.created).toBe(true)
    expect(rawLines(dir)).toHaveLength(1)
  })

  it('已完成操作的同 key 重开（含跨重启）返回 created:false + 完成态，不重复建', async () => {
    const dir = dataDir()
    const first = new OperationsLedger(dir)
    await first.init()
    const r = await first.beginOperation(baseRequest({ dedupeKey: 'k1' }))
    await first.finishOperation(r.operationId, finishWith())
    first.close()
    const second = new OperationsLedger(dir)
    await second.init()
    const again = await second.beginOperation(baseRequest({ dedupeKey: 'k1' }))
    second.close()
    expect(again.created).toBe(false)
    expect(again.operationId).toBe(r.operationId)
    expect(again.status).toBe('completed')
    expect(beginCount(dir)).toBe(1)
  })
})

describe('P7-F1 · append/flush 失败 → 副作用 0', () => {
  it('append 失败抛 PBOTS_OPS_APPEND_FAILED，文件无行、索引无操作，后续 begin 仍可用', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    failNextOpen = true
    await expect(ledger.beginOperation(baseRequest())).rejects.toMatchObject({ code: 'PBOTS_OPS_APPEND_FAILED' })
    // mock 的 open 未建文件：副作用 0 = 磁盘无账本文件、内存无操作
    expect(existsSync(ledgerFile(dir))).toBe(false)
    expect(ledger.readOperations().inProgress).toHaveLength(0)
    const ok = await ledger.beginOperation(baseRequest({ action: 'modify' }))
    ledger.close()
    expect(ok.created).toBe(true)
    expect(rawLines(dir)).toHaveLength(1)
  })
})

describe('P7-F1.f2 · sync 结果不明失败关闭', () => {
  it('首次真实 append 后 sync 失败：重试与 finish 均拒，重开只恢复原 ID，不重放', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    const request = baseRequest({ dedupeKey: 'uncertain' })
    repairFailure = 'sync' // appendFile / close 保留真实文件系统操作。
    await expect(ledger.beginOperation(request)).rejects.toMatchObject({ code: 'PBOTS_OPS_APPEND_FAILED' })
    repairFailure = undefined
    const original = readFileSync(ledgerFile(dir))
    const id = JSON.parse(rawLines(dir)[0]).operationId
    try {
      await expect(ledger.beginOperation(request)).rejects.toMatchObject({ code: 'PBOTS_OPS_APPEND_FAILED' })
      await expect(ledger.finishOperation(id, finishWith())).rejects.toMatchObject({ code: 'PBOTS_OPS_APPEND_FAILED' })
      await expect(ledger.recordReceipt(id, 2)).rejects.toMatchObject({ code: 'PBOTS_OPS_APPEND_FAILED' })
      expect(() => ledger.readOperations()).toThrowError(/PBOTS_OPS_APPEND_FAILED/)
      expect(readFileSync(ledgerFile(dir))).toEqual(original)
    } finally { ledger.close() }
    const reopened = new OperationsLedger(dir)
    try {
      await reopened.init()
      expect(await reopened.beginOperation(request)).toEqual({ operationId: id, created: false, status: 'inProgress' })
      expect(reopened.readOperations().inProgress.map((entry) => entry.operationId)).toEqual([id])
      await reopened.finishOperation(id, finishWith())
      expect(reopened.readOperations().completed[0].operationId).toBe(id)
      const normal = await reopened.beginOperation(baseRequest({ dedupeKey: 'normal' }))
      await reopened.finishOperation(normal.operationId, finishWith())
      expect(beginCount(dir)).toBe(2)
    } finally { reopened.close() }
    const restarted = new OperationsLedger(dir)
    try {
      await restarted.init()
      expect(await restarted.beginOperation(request)).toEqual({ operationId: id, created: false, status: 'completed' })
      expect(restarted.readOperations().completed).toHaveLength(2)
    } finally { restarted.close() }
  })
})

describe('P7-F1 · 丢文件失败关闭', () => {
  it('落盘后文件被删：后续 begin 拒收 PBOTS_OPS_LOST 且不重建文件', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    await ledger.beginOperation(baseRequest())
    rmSync(ledgerFile(dir))
    await expect(ledger.beginOperation(baseRequest({ action: 'modify' })))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_LOST' })
    ledger.close()
    expect(existsSync(ledgerFile(dir))).toBe(false)
  })

  it('文件被外部截短（size 不符）：同样拒收，不盲写', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    await ledger.beginOperation(baseRequest())
    const text = readFileSync(ledgerFile(dir), 'utf8')
    writeFileSync(ledgerFile(dir), text.slice(0, -5), 'utf8')
    await expect(ledger.beginOperation(baseRequest({ action: 'modify' })))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_LOST' })
    ledger.close()
  })
})

describe('P7-F1 · 版本未知 / 中段坏行失败关闭', () => {
  it('未知 version：init 后读侧与写侧都拒绝（PBOTS_OPS_UNTRUSTED），不静默降级', async () => {
    const dir = dataDir()
    const seed = new OperationsLedger(dir)
    await seed.init()
    await seed.beginOperation(baseRequest())
    seed.close()
    const bumped = JSON.parse(rawLines(dir)[0]); bumped.version = 2
    writeFileSync(ledgerFile(dir), `${JSON.stringify(bumped)}\n`, 'utf8')
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    expect(() => ledger.readOperations()).toThrowError(/PBOTS_OPS_UNTRUSTED/)
    await expect(ledger.beginOperation(baseRequest({ action: 'modify' })))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_UNTRUSTED' })
    ledger.close()
  })

  it('中段坏 JSON 行（不在尾部）：同样失败关闭', async () => {
    const dir = dataDir()
    const seed = new OperationsLedger(dir)
    await seed.init()
    await seed.beginOperation(baseRequest())
    seed.close()
    appendFileSync(ledgerFile(dir), '{"type":"finish","operationId":"x"\n', 'utf8')
    appendFileSync(ledgerFile(dir), `${JSON.stringify({ version: 1, type: 'receipt', operationId: 'x', generation: 2, ts: 1 })}\n`, 'utf8')
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    expect(() => ledger.readOperations()).toThrowError(/PBOTS_OPS_UNTRUSTED/)
    ledger.close()
  })
})

describe('P7-F1 · 崩溃截断恢复（行原子修复 + state unknown 不变成功）', () => {
  it('finish 行撕裂：重启后该操作回到 inProgress（未知不判成功），repaired 事件持久、跨重启仍标记', async () => {
    const dir = dataDir()
    const first = new OperationsLedger(dir)
    await first.init()
    const a = await first.beginOperation(baseRequest({ dedupeKey: 'a' }))
    await first.finishOperation(a.operationId, finishWith())
    const b = await first.beginOperation(baseRequest({ action: 'modify', dedupeKey: 'b' }))
    first.close()
    // 崩溃注入：b 的 finish 只写了一半
    appendFileSync(ledgerFile(dir), `{"version":1,"type":"finish","operationId":"${b.operationId}"`, 'utf8')

    const second = new OperationsLedger(dir)
    await second.init()
    let view = second.readOperations()
    expect(view.completed.map((o) => o.operationId)).toEqual([a.operationId])
    expect(view.inProgress.map((o) => o.operationId)).toEqual([b.operationId])
    expect(view.tailTruncated).toBe(true)
    // repaired 事件已入账：读侧可见、不静默
    expect(rawLines(dir).some((l) => JSON.parse(l).type === 'repaired')).toBe(true)
    second.close()

    const third = new OperationsLedger(dir)
    await third.init()
    view = third.readOperations()
    expect(view.tailTruncated).toBe(true)
    expect(view.inProgress.map((o) => o.operationId)).toEqual([b.operationId])
    third.close()
  })

  it('撕裂的是 begin 意图行：操作视为未发生（未执行），好记录不受牵连，账本可继续写', async () => {
    const dir = dataDir()
    const first = new OperationsLedger(dir)
    await first.init()
    const a = await first.beginOperation(baseRequest({ dedupeKey: 'a' }))
    first.close()
    appendFileSync(ledgerFile(dir), '{"version":1,"type":"begin","operationId":"tor', 'utf8')
    const second = new OperationsLedger(dir)
    await second.init()
    const view = second.readOperations()
    expect(view.inProgress.map((o) => o.operationId)).toEqual([a.operationId])
    expect(view.tailTruncated).toBe(true)
    const c = await second.beginOperation(baseRequest({ action: 'modify', dedupeKey: 'c' }))
    expect(c.created).toBe(true)
    second.close()
  })

  it('空文件（0 字节，建后崩溃）按新账本处理，不算坏', async () => {
    const dir = dataDir()
    writeFileSync(ledgerFile(dir), '', 'utf8')
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    expect(ledger.readOperations().inProgress).toHaveLength(0)
    const r = await ledger.beginOperation(baseRequest())
    expect(r.created).toBe(true)
    ledger.close()
  })

  it('尾行完整但缺换行：init 补换行后再续写，不与尾行拼接成坏行', async () => {
    const dir = dataDir()
    const first = new OperationsLedger(dir)
    await first.init()
    const a = await first.beginOperation(baseRequest({ dedupeKey: 'a' }))
    first.close()
    const text = readFileSync(ledgerFile(dir), 'utf8')
    writeFileSync(ledgerFile(dir), text.trimEnd(), 'utf8') // 去掉尾换行（外部编辑形状）
    const second = new OperationsLedger(dir)
    await second.init()
    const b = await second.beginOperation(baseRequest({ action: 'modify', dedupeKey: 'b' }))
    second.close()
    expect(b.created).toBe(true)
    const lines = rawLines(dir).map((l) => JSON.parse(l))
    expect(lines).toHaveLength(2) // a 与 b 各自成行，无拼接坏行
    const third = new OperationsLedger(dir)
    await third.init()
    expect(third.readOperations().inProgress).toHaveLength(2)
    third.close()
  })
})

describe('P7-F1.f1 · 撕裂修复边界', () => {
  it('中文完整行的字节与投影在修复和再次启动后保持不变', async () => {
    const dir = dataDir()
    const first = new OperationsLedger(dir)
    await first.init()
    const request = baseRequest({ actor: '主机器人', before: { name: '测试🙂' } })
    const a = await first.beginOperation(request)
    first.close()
    const intact = readFileSync(ledgerFile(dir))
    // 尾部连 UTF-8 字符自身也被撕裂，不能影响上一条完整记录。
    const torn = Buffer.from('{"finish":"中文🙂')
    appendFileSync(ledgerFile(dir), torn.subarray(0, torn.length - 1))
    for (let restart = 0; restart < 2; restart += 1) {
      const ledger = new OperationsLedger(dir)
      try {
        await ledger.init()
        const view = ledger.readOperations()
        expect(view.tailTruncated).toBe(true)
        expect(view.inProgress[0]).toMatchObject({ operationId: a.operationId, actor: request.actor, before: request.before })
        expect(readFileSync(ledgerFile(dir)).subarray(0, intact.length)).toEqual(intact)
        const repair = rawLines(dir).map((line) => JSON.parse(line)).find((line) => line.type === 'repaired')
        expect(repair.droppedBytes).toBe(torn.length - 1)
      } finally { ledger.close() }
    }
  })

  it.each([true, false])('完整未知版本不因缺换行被删除（已有正常行=%s）', async (hasPrefix) => {
    const dir = dataDir()
    const seed = new OperationsLedger(dir)
    await seed.init()
    if (hasPrefix) await seed.beginOperation(baseRequest())
    seed.close()
    appendFileSync(ledgerFile(dir), JSON.stringify({ version: 999, ts: 1, type: 'repaired', droppedBytes: 1 }))
    const original = readFileSync(ledgerFile(dir))
    const ledger = new OperationsLedger(dir)
    try {
      await ledger.init()
      expect(() => ledger.readOperations()).toThrowError(/PBOTS_OPS_UNTRUSTED/)
      await expect(ledger.beginOperation(baseRequest())).rejects.toMatchObject({ code: 'PBOTS_OPS_UNTRUSTED' })
      expect(readFileSync(ledgerFile(dir))).toEqual(original)
    } finally { ledger.close() }
  })

  it.each(['append', 'open', 'sync', 'rename'] as const)('修复记录 %s 失败后，重启仍能恢复永久撕裂标记', async (failure) => {
    const dir = dataDir()
    const first = new OperationsLedger(dir)
    await first.init()
    const a = await first.beginOperation(baseRequest())
    first.close()
    appendFileSync(ledgerFile(dir), '{torn')
    const original = readFileSync(ledgerFile(dir))
    const repairing = new OperationsLedger(dir)
    try {
      if (failure === 'append') failNextOpen = true
      else repairFailure = failure
      await repairing.init()
      expect(() => repairing.readOperations()).toThrowError(/simulated EIO/)
      expect(readFileSync(ledgerFile(dir))).toEqual(original)
    } finally { repairing.close(); repairFailure = undefined }
    const restarted = new OperationsLedger(dir)
    try {
      await restarted.init()
      expect(restarted.readOperations().tailTruncated).toBe(true)
      expect(restarted.readOperations().inProgress[0].operationId).toBe(a.operationId)
      expect(rawLines(dir).some((line) => JSON.parse(line).type === 'repaired')).toBe(true)
    } finally { restarted.close() }
  })
})

describe('P7-F1 · 恢复投影三类视图', () => {
  it('重启后重建 进行中/已完成/已撤销（含 failed 分桶）', async () => {
    const dir = dataDir()
    const first = new OperationsLedger(dir)
    await first.init()
    const a = await first.beginOperation(baseRequest({ dedupeKey: 'a' }))                  // → completed
    await first.finishOperation(a.operationId, finishWith())
    const b = await first.beginOperation(baseRequest({ action: 'modify', dedupeKey: 'b' })) // → 崩溃前未 finish
    const c = await first.beginOperation(baseRequest({ action: 'archive', target: 'bot-2', dedupeKey: 'c' })) // → completed 再被撤销
    await first.finishOperation(c.operationId, finishWith({ undo: { handle: 'unarchive:bot-2' } }))
    const undo = await first.beginOperation(baseRequest({ action: 'modify', target: 'bot-2', dedupeKey: 'undo:c', undoOf: c.operationId }))
    await first.finishOperation(undo.operationId, finishWith())
    const d = await first.beginOperation(baseRequest({ dedupeKey: 'd' }))                  // → failed
    await first.finishOperation(d.operationId, { outcome: 'failed', error: 'market unreachable' })
    expect(b.created).toBe(true)
    first.close()

    const second = new OperationsLedger(dir)
    await second.init()
    const view = second.readOperations()
    second.close()
    // 撤销操作本身也是一条 completed 记录（有自己的审计轨迹），与 a 同在 completed 桶
    expect(view.completed.map((o) => o.operationId)).toEqual([a.operationId, undo.operationId])
    expect(view.inProgress.map((o) => o.operationId)).toEqual([b.operationId])
    expect(view.undone.map((o) => o.operationId)).toEqual([c.operationId])
    expect(view.failed.map((o) => o.operationId)).toEqual([d.operationId])
    expect(view.failed[0].error).toBe('market unreachable')
  })
})

describe('P7-F1 · 前后投影与 undo 句柄往返', () => {
  it('读回 before/after/undo；readUndo 只对带句柄的已完成操作返回', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    const r = await ledger.beginOperation(baseRequest({ before: { name: 'old', enabled: true } }))
    await ledger.finishOperation(r.operationId, finishWith({
      after: { name: 'new', enabled: true },
      undo: { handle: 'write-back', restore: { name: 'old' } },
    }))
    const plain = await ledger.beginOperation(baseRequest({ action: 'modify', dedupeKey: 'p2' }))
    await ledger.finishOperation(plain.operationId, finishWith())
    const view = ledger.readOperations()
    const op = view.completed.find((o) => o.operationId === r.operationId)
    expect(op?.before).toEqual({ name: 'old', enabled: true })
    expect(op?.after).toEqual({ name: 'new', enabled: true })
    expect(ledger.readUndo(r.operationId)).toEqual({ handle: 'write-back', restore: { name: 'old' } })
    expect(ledger.readUndo(plain.operationId)).toBeUndefined()
    expect(ledger.readUndo('no-such-op')).toBeUndefined()
    ledger.close()
  })

  it('撤销操作完成才翻转原操作状态；原操作未完成时不翻', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    const pending = await ledger.beginOperation(baseRequest({ dedupeKey: 't1' })) // 未 finish
    const early = await ledger.beginOperation(baseRequest({ action: 'modify', dedupeKey: `undo:${pending.operationId}`, undoOf: pending.operationId }))
    await ledger.finishOperation(early.operationId, finishWith())
    expect(ledger.readOperations().inProgress.map((o) => o.operationId)).toContain(pending.operationId)
    await ledger.finishOperation(pending.operationId, finishWith({ undo: { handle: 'h' } }))
    expect(ledger.readOperations().undone.map((o) => o.operationId)).toEqual([pending.operationId])
    ledger.close()
  })
})

describe('P7-F1 · 回执位翻转（代际回执）', () => {
  it('新代回执后 receipt 位翻转；旧代/同代回执拒、双回执拒、未知操作拒，跨重启仍在', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    const r = await ledger.beginOperation(baseRequest({ action: 'restart', target: undefined, generation: 3, dedupeKey: 'rst' }))
    await ledger.finishOperation(r.operationId, finishWith())
    expect(ledger.readOperations().completed[0].receipt).toBeUndefined()
    await expect(ledger.recordReceipt(r.operationId, 2)).rejects.toMatchObject({ code: 'PBOTS_OPS_INVALID_STATE' })
    await expect(ledger.recordReceipt(r.operationId, 3)).rejects.toMatchObject({ code: 'PBOTS_OPS_INVALID_STATE' })
    await ledger.recordReceipt(r.operationId, 4)
    const flipped = ledger.readOperations().completed[0]
    expect(flipped.receipt?.generation).toBe(4)
    expect(typeof flipped.receipt?.ts).toBe('number')
    await expect(ledger.recordReceipt(r.operationId, 5)).rejects.toMatchObject({ code: 'PBOTS_OPS_INVALID_STATE' })
    await expect(ledger.recordReceipt('no-such-op', 9)).rejects.toMatchObject({ code: 'PBOTS_OPS_NOT_FOUND' })
    ledger.close()
    const second = new OperationsLedger(dir)
    await second.init()
    expect(second.readOperations().completed[0].receipt?.generation).toBe(4)
    second.close()
  })
})

describe('P7-F1 · 凭证字段拒入账', () => {
  it('params/before/after/undo 深层出现凭证样键 → 拒收且不落行；正常摘要字段不受影响', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    await expect(ledger.beginOperation(baseRequest({ params: { token: 'x' } })))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_CREDENTIAL_FIELD' })
    await expect(ledger.beginOperation(baseRequest({ before: { nested: { apiKey: 'k' } } })))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_CREDENTIAL_FIELD' })
    const r = await ledger.beginOperation(baseRequest({ dedupeKey: 'ok1' }))
    await expect(ledger.finishOperation(r.operationId, finishWith({ undo: { handle: 'h', restore: { password: 'p' } } })))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_CREDENTIAL_FIELD' })
    // 驼峰/连字符凭证键同样命中
    await expect(ledger.beginOperation(baseRequest({ params: { launchToken: 't' } })))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_CREDENTIAL_FIELD' })
    await expect(ledger.beginOperation(baseRequest({ params: { 'x-api-key': 'k' } })))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_CREDENTIAL_FIELD' })
    const ok = await ledger.beginOperation(baseRequest({ action: 'modify', params: { preset: 'standard', every: 60 } }))
    expect(ok.created).toBe(true)
    ledger.close()
    expect(beginCount(dir)).toBe(2)
  })
})

describe('P7-F1.f2 · close 永久停写与锁交接', () => {
  it('idle close 后新 writer 正常，旧引用的 begin/finish/receipt/init 全拒且重复 close 不解新锁', async () => {
    const dir = dataDir()
    const old = new OperationsLedger(dir)
    await old.init()
    old.close()
    const fresh = new OperationsLedger(dir)
    try {
      await fresh.init()
      const req = baseRequest({ dedupeKey: 'same' })
      await expect(old.beginOperation(req)).rejects.toMatchObject({ code: 'PBOTS_OPS_CLOSED' })
      await expect(old.finishOperation('old', finishWith())).rejects.toMatchObject({ code: 'PBOTS_OPS_CLOSED' })
      await expect(old.recordReceipt('old', 2)).rejects.toMatchObject({ code: 'PBOTS_OPS_CLOSED' })
      await expect(old.init()).rejects.toMatchObject({ code: 'PBOTS_OPS_CLOSED' })
      old.close()
      expect(() => new OperationsLedger(dir)).toThrowError(/PBOTS_OPS_LOCKED/)
      const result = await fresh.beginOperation(req)
      expect(result.created).toBe(true)
      await fresh.finishOperation(result.operationId, finishWith())
      expect(beginCount(dir)).toBe(1)
    } finally { fresh.close(); old.close() }
  })

  it.each([false, true])('在途 sync 结束前保留锁；未启动队列拒绝；失败=%s', async (failSync) => {
    const dir = dataDir()
    const old = new OperationsLedger(dir)
    await old.init()
    const entered = deferred()
    const release = deferred()
    syncBarrier = { entered: entered.resolve, wait: release.promise }
    if (failSync) repairFailure = 'sync'
    const req = baseRequest({ dedupeKey: 'same' })
    const active = old.beginOperation(req).then((value) => value, (error: Error) => error)
    await entered.promise // 已真实 append，sync 被确定性屏障挡住。
    const queued = old.beginOperation(req).then(() => 'unexpected write', (error) => error.code)
    old.close()
    old.close()
    try {
      expect(() => new OperationsLedger(dir)).toThrowError(/PBOTS_OPS_LOCKED/)
    } finally { release.resolve() }
    const result = await active
    expect(result instanceof Error).toBe(failSync)
    expect(await queued).toBe('PBOTS_OPS_CLOSED')
    repairFailure = undefined
    const fresh = new OperationsLedger(dir)
    try {
      await fresh.init()
      const id = JSON.parse(rawLines(dir)[0]).operationId
      expect(await fresh.beginOperation(req)).toEqual({ operationId: id, created: false, status: 'inProgress' })
      await fresh.finishOperation(id, finishWith())
      expect(beginCount(dir)).toBe(1)
    } finally { fresh.close() }
  })

  it('close 发生在任务启动前：保留锁直到已排队请求拒绝，然后可重建', async () => {
    const dir = dataDir()
    const old = new OperationsLedger(dir)
    await old.init()
    const queued = old.beginOperation(baseRequest()).then(() => 'unexpected write', (error) => error.code)
    old.close()
    expect(() => new OperationsLedger(dir)).toThrowError(/PBOTS_OPS_LOCKED/)
    expect(await queued).toBe('PBOTS_OPS_CLOSED')
    expect(existsSync(ledgerFile(dir))).toBe(false)
    const fresh = new OperationsLedger(dir)
    try { await fresh.init(); expect((await fresh.beginOperation(baseRequest())).created).toBe(true) }
    finally { fresh.close() }
  })

  it('init 补换行写入在途时 close 也不得提前交锁', async () => {
    const dir = dataDir()
    const seed = new OperationsLedger(dir)
    await seed.init()
    const result = await seed.beginOperation(baseRequest({ dedupeKey: 'same' }))
    seed.close()
    writeFileSync(ledgerFile(dir), readFileSync(ledgerFile(dir), 'utf8').trimEnd())
    const old = new OperationsLedger(dir)
    const entered = deferred()
    const release = deferred()
    syncBarrier = { entered: entered.resolve, wait: release.promise }
    const initializing = old.init()
    await entered.promise
    old.close()
    try { expect(() => new OperationsLedger(dir)).toThrowError(/PBOTS_OPS_LOCKED/) }
    finally { release.resolve() }
    await initializing
    const fresh = new OperationsLedger(dir)
    try {
      await fresh.init()
      expect(fresh.readOperations().inProgress[0].operationId).toBe(result.operationId)
      await fresh.finishOperation(result.operationId, finishWith())
    } finally { fresh.close() }
  })
})

describe('P7-F1 · finish 校验与单实例锁', () => {
  it('finish 未知操作拒；重复 finish 拒（append-only 不改写）', async () => {
    const dir = dataDir()
    const ledger = new OperationsLedger(dir)
    await ledger.init()
    await expect(ledger.finishOperation('nope', finishWith()))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_NOT_FOUND' })
    const r = await ledger.beginOperation(baseRequest())
    await ledger.finishOperation(r.operationId, { outcome: 'failed', error: 'x' })
    await expect(ledger.finishOperation(r.operationId, finishWith()))
      .rejects.toMatchObject({ code: 'PBOTS_OPS_INVALID_STATE' })
    ledger.close()
    expect(rawLines(dir)).toHaveLength(2) // begin + 1 条 finish
  })

  it('同 dataDir 第二实例构造即抛（PBOTS_OPS_LOCKED）；close 后可重建', async () => {
    const dir = dataDir()
    const first = new OperationsLedger(dir)
    await first.init()
    expect(() => new OperationsLedger(dir)).toThrowError(/PBOTS_OPS_LOCKED/)
    first.close()
    const second = new OperationsLedger(dir)
    await second.init()
    second.close()
  })
})
