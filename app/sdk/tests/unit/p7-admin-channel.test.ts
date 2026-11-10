// P7-F2 unit tests: 受限 SDK→main 管理桥（channel.mjs，照 P6 ⑤ 通道模式：
// 只认 main 单订阅、respond 绑连接、30s 超时结果 unknown 不重试、断流作废在
// 途、迟到 respond 拒）+ 空动作表（tools.mjs，默认全拒）。
// 验收锚点 = p7-admin PLAN P7-F2 行：伪 source / 旧代 / 非 main respond /
// 重复订阅 / 超长 / null / 断流均无越权；未知副作用不重试。
import { describe, expect, it } from 'vitest'
import {
  ADMIN_REQUESTS_ENDPOINT, ADMIN_RESPOND_METHOD, DEFAULT_ADMIN_TIMEOUT_MS, MAX_ADMIN_REQUEST_CHARS,
  adminError, validateAdminRequest, AdminChannel,
} from '../../src/admin/channel.mjs'
import { ADMIN_ACTIONS, resolveAdminAction, adminRefusal } from '../../src/admin/tools.mjs'

const REQUEST = {
  sessionId: 'session-main', turnId: 'turn-7', originRef: 'admin-origin:r1',
  action: 'install', target: 'github-connectors', params: { region: 'cn' },
}

function subscriber(peer: string, generation = 3) {
  return { peer, generation, queue: [] as Array<Record<string, unknown>>, wake: undefined as undefined | (() => void) }
}

describe('endpoints & defaults（P6 ⑤ 模式沿用）', () => {
  it('main-only 端点不进 renderer 白名单；30s 超时缺省', () => {
    expect(ADMIN_REQUESTS_ENDPOINT).toBe('pbots/admin.requests')
    expect(ADMIN_RESPOND_METHOD).toBe('pbots/admin.respond')
    expect(DEFAULT_ADMIN_TIMEOUT_MS).toBe(30_000)
    expect(MAX_ADMIN_REQUEST_CHARS).toBeGreaterThan(0)
  })

  it('adminError message 以 code 前缀开头（tool/result 只能从文本读码）', () => {
    const e = adminError('pbots/invalid-args', 'bad request')
    expect(e.message).toBe('pbots/invalid-args: bad request')
    expect((e as { code?: string }).code).toBe('pbots/invalid-args')
  })
})

describe('validateAdminRequest（null / 缺字段 / 超长 → 无越权）', () => {
  it('null / 非对象 / 缺必填字符串字段一律 invalid-args', () => {
    for (const bad of [null, undefined, 42, 'x', {}, { ...REQUEST, action: null }, { ...REQUEST, action: 7 },
      { ...REQUEST, sessionId: '' }, { ...REQUEST, turnId: undefined }, { ...REQUEST, originRef: '' },
      { ...REQUEST, params: 'nope' }, { ...REQUEST, target: 9 }]) {
      expect(() => validateAdminRequest(bad as never)).toThrowError(/invalid-args/)
    }
  })

  it('合法请求原样通过（target / params 可缺省）', () => {
    expect(validateAdminRequest(REQUEST)).toEqual(REQUEST)
    expect(validateAdminRequest({ sessionId: 's', turnId: 't', originRef: 'o', action: 'list' })).toEqual({ sessionId: 's', turnId: 't', originRef: 'o', action: 'list' })
  })

  it('超长请求拒绝（request-too-large），不管内容是什么', () => {
    const big = { ...REQUEST, params: { blob: 'x'.repeat(MAX_ADMIN_REQUEST_CHARS + 4096) } }
    expect(() => validateAdminRequest(big)).toThrowError(/request-too-large/)
  })

  it('调用方自带 requestId / generation → 拒（通道盖章字段不可走私）', () => {
    expect(() => validateAdminRequest({ ...REQUEST, generation: 99 })).toThrowError(/invalid-args/)
    expect(() => validateAdminRequest({ ...REQUEST, requestId: 'forged' })).toThrowError(/invalid-args/)
  })
})

describe('AdminChannel（照 CreateChannel 安全语义 + 重复订阅 / 旧代）', () => {
  it('无订阅者 → main-unavailable 立即失败（outcome unknown），不入队', async () => {
    const ch = new AdminChannel()
    await expect(ch.request(REQUEST)).rejects.toMatchObject({
      code: 'main-unavailable', details: { reason: 'no-subscriber', outcome: 'unknown' },
    })
  })

  it('非法 / 超长请求在入队前拒绝（无越权面）', async () => {
    const ch = new AdminChannel()
    const sub = subscriber('peer-main')
    ch.attach(sub)
    await expect(ch.request(null as never)).rejects.toMatchObject({ code: 'pbots/invalid-args' })
    const big = { ...REQUEST, params: { blob: 'y'.repeat(MAX_ADMIN_REQUEST_CHARS + 4096) } }
    await expect(ch.request(big)).rejects.toMatchObject({ code: 'pbots/request-too-large' })
    expect(sub.queue.length).toBe(0)
  })

  it('重复订阅拒绝：第二个 main 客户端不得抢占（单订阅）', () => {
    const ch = new AdminChannel()
    ch.attach(subscriber('peer-main'))
    expect(() => ch.attach(subscriber('peer-other'))).toThrowError(/forbidden/)
  })

  it('round trip：请求盖章 requestId + 当前订阅代 generation；持流 Peer 作答放行', async () => {
    const ch = new AdminChannel()
    const sub = subscriber('peer-main', 5)
    ch.attach(sub)
    const pending = ch.request(REQUEST)
    expect(sub.queue.length).toBe(1)
    const item = sub.queue[0] as { requestId: string, generation: number, action: string, originRef: string }
    expect(item.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(item.generation).toBe(5) // 旧代鉴别：请求携带订阅时的连接代
    expect(item.action).toBe('install')
    ch.respond(item.requestId, { value: { ok: true, operationId: 'op-1' } }, 'peer-main')
    await expect(pending).resolves.toEqual({ ok: true, operationId: 'op-1' })
  })

  it('非持流 Peer 的 respond 拒绝，请求仍 pending；迟到 / 伪造 requestId 拒', async () => {
    const ch = new AdminChannel()
    const sub = subscriber('peer-main')
    ch.attach(sub)
    const pending = ch.request(REQUEST)
    const { requestId } = sub.queue[0] as { requestId: string }
    expect(() => ch.respond(requestId, { value: { ok: true } }, 'peer-other')).toThrowError(/forbidden/)
    expect(() => ch.respond('forged-request-id', { value: { ok: true } }, 'peer-main')).toThrowError(/forbidden|stale/)
    ch.respond(requestId, { value: { ok: true } }, 'peer-main')
    await expect(pending).resolves.toEqual({ ok: true })
  })

  it('无效 respond 形状（error 缺 code / 无 value 对象）→ invalid-response，outcome unknown，占位释放', async () => {
    const ch = new AdminChannel()
    const sub = subscriber('peer-main')
    ch.attach(sub)
    for (const outcome of [{ error: null }, { value: null }, {}, { error: 'boom' }, { error: { code: 7, message: 'x' } }]) {
      const pending = ch.request(REQUEST)
      const { requestId } = sub.queue.pop() as { requestId: string }
      ch.respond(requestId, outcome as never, 'peer-main')
      await expect(pending).rejects.toMatchObject({ code: 'main-unavailable', details: { reason: 'invalid-response', outcome: 'unknown' } })
    }
    expect(ch.pendingCount()).toBe(0)
  })

  it('超时 → outcome unknown 不重试：队列回收、占位清空、迟到 respond 拒', async () => {
    const ch = new AdminChannel({ timeoutMs: 30 })
    const sub = subscriber('peer-main')
    ch.attach(sub)
    const pending = ch.request(REQUEST)
    const { requestId } = sub.queue[0] as { requestId: string }
    await expect(pending).rejects.toMatchObject({ code: 'main-unavailable', details: { reason: 'timeout', outcome: 'unknown' } })
    expect(sub.queue.length).toBe(0) // 未发出载荷回收；已发出的不重发（未知副作用不重试）
    expect(ch.pendingCount()).toBe(0)
    expect(() => ch.respond(requestId, { value: { ok: true } }, 'peer-main')).toThrowError(/forbidden|stale/)
  })

  it('断流作废在途（stream-closed, outcome unknown）；重订阅后旧请求不得复活', async () => {
    const ch = new AdminChannel()
    const sub = subscriber('peer-main', 4)
    ch.attach(sub)
    const pending = ch.request(REQUEST)
    const { requestId } = sub.queue[0] as { requestId: string }
    ch.detach()
    await expect(pending).rejects.toMatchObject({ code: 'main-unavailable', details: { reason: 'stream-closed', outcome: 'unknown' } })
    expect(() => ch.respond(requestId, { value: { ok: true } }, 'peer-main')).toThrowError(/forbidden|stale/)
    // 新一代连接重新订阅是新的开始
    ch.attach(subscriber('peer-main', 5))
    expect(ch.subscribed).toBe(true)
  })
})

describe('tools.mjs（F2 只搭桥：动作表为空，默认全拒）', () => {
  it('动作表为空；任何动作 resolve 为 unknown → 明确 unavailable 拒绝', () => {
    expect(Object.keys(ADMIN_ACTIONS)).toEqual([])
    for (const action of ['install', 'archive', 'modify', 'create', 'disable', 'dispatch', 'restart']) {
      expect(resolveAdminAction(action)).toEqual({ known: false })
    }
    const refusal = adminRefusal('install')
    expect(refusal.code).toBe('pbots/admin-unavailable')
    expect(refusal.message).toContain('install')
    expect(refusal.message).toMatch(/未接线|不可用/)
  })
})
