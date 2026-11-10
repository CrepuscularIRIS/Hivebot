// T-04 acceptance (PLAN p2-sdk T-04): D3 并发不串线, one runtime, 3 sessions.
//
// D3 原文 (work/p2-sdk/BRIEF.md:66), clause by clause:
//   「3 个 session 同时发不同的 prompt」………… 3 个新 session，3 个互不相同的
//     prompt（断言 pairwise 不同），Promise.all 同时发出
//   「只用离线测试验证」………… 真 key 哨兵不进 runtime 子进程（离线判定本体是
//     出口汇合的 $OFFLINE 全绿，此处断言 harness 的 keyless 性质）
//   「必须走真实 dsh 调用路径」………… T-01⑧ launcher 起真实 dsh runtime，
//     examples/lib 客户端走 /api + /api/remote.mux
//   「fake provider 先挂起，直到 3 个请求都进入执行再放行」………… 3 个 session
//     的剧本共用同一 gate 文件（gateAfterChunk=1，首块后挂起）；测试轮询
//     $P2SDK_HOME/fake/requests.jsonl（fake 侧记录）直到 3 个请求都出现才 release
//   「断言任何一个回合结束之前 3 个请求都已进入执行」………… 放行前断言：3 条
//     follow 流里都没有 turn/end
//   「每个 prompt 带唯一标记，fake 原样回显」………… prompt 带 marker，requests
//     记录 userTexts 含该 marker；剧本回显含 marker 的原文
//   「sessionId=X 的流里 assistant 内容只含 X 的标记」………… 每条流的 text-delta
//     精确拼接 === 自己的剧本全文，含自己的 marker、不含另外两个
//   「证伪：任一断言失败」………… 上述任一断言红即本测试 FAIL
//
// T-04 验收补充：屏障等待 5s 超时判 FAIL（所有等待都是 5000ms 时钟）；3 个
// session 共用 1 条 mux socket、各开一路 follow（断言同一 MuxSocket 上 3 个
// 不同 streamId 的逻辑流）。
import { expect, it } from 'vitest'
import {
  childEnvHas,
  createSession,
  KEY_VARS,
  launchFakeRuntime,
  sendPrompt,
  waitForDelta,
  waitForTurnEnd,
  type FakeRequest,
  type FakeRuntime,
  type Frame,
} from '../support/fake/harness.ts'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const isTextDelta = (f: Frame): boolean =>
  f.type === 'assistant-stream' && f.frame?.type === 'chunk' && f.frame.chunk?.type === 'text-delta'

const isTurnEnd = (f: Frame): boolean => f.type === 'event' && f.event?.type === 'turn/end'

/** Per-session fixture: a unique prompt marker plus the scripted echo text. */
interface Lane {
  marker: string
  pieces: string[]
}

const GATE = 't04-barrier'

const LANES: Lane[] = [
  { marker: 'mk-t04-alpha-3f9', pieces: ['mk-t04-alpha-3f9', '并发段一', '并发段二', '并发段三'] },
  { marker: 'mk-t04-bravo-7c2', pieces: ['mk-t04-bravo-7c2', '并行段一', '并行段二', '并行段三'] },
  { marker: 'mk-t04-charlie-51d', pieces: ['mk-t04-charlie-51d', '齐发段一', '齐发段二', '齐发段三'] },
]

const promptOf = (lane: Lane): string => `并发测试，回显标记 ${lane.marker}`

/** 5s barrier clock (acceptance: 屏障 5s 超时判 FAIL): poll the fake-side record
 *  until every lane's request has entered execution on its own sessionId. */
async function waitAllEntered(rt: FakeRuntime, lanes: Lane[], ids: string[]): Promise<FakeRequest[]> {
  const deadline = Date.now() + 5000
  for (;;) {
    const requests = rt.readRequests()
    const all = lanes.every((lane, i) =>
      requests.some((r) => r.sessionId === ids[i] && r.userTexts.some((t) => t.includes(lane.marker))),
    )
    if (all) return requests
    if (Date.now() >= deadline) {
      throw new Error(`barrier FAIL: after 5000ms only ${rt.readRequests().length} request(s) entered execution (need ${lanes.length})`)
    }
    await sleep(20)
  }
}

it('D3 并发不串线: barrier proves 3 concurrent turns on one runtime, markers stay per-session on one mux socket', async () => {
  process.env.P2SDK_LLM_API_KEY = 'sk-p2sdk-sentinel-not-a-real-key' // 只用离线验证：真实 key 不得进入 runtime
  const rt = await launchFakeRuntime()
  try {
    for (const name of KEY_VARS) {
      expect(childEnvHas(rt.child.pid ?? 0, name), `${name} must not reach the runtime`).toBe(false)
    }

    // 3 个 session（一个 runtime）。
    const ids: string[] = []
    for (let i = 0; i < LANES.length; i += 1) ids.push(await createSession(rt.client, rt.home))
    expect(new Set(ids).size, '3 distinct sessions').toBe(3)

    // 各自的剧本，共用同一个 gate：首块后一起挂住。
    ids.forEach((id, i) => rt.writeScript(id, LANES[i].pieces, GATE))

    // 3 个 session 共用 1 条 mux socket，各开一路 follow。
    const socket = rt.client.socket
    const streamsBefore = socket.streams.size
    const streams = await Promise.all(ids.map((id) => rt.client.follow(id)))
    expect(socket.streams.size, '3 follow streams on the same mux socket').toBe(streamsBefore + 3)
    expect(new Set(streams.map((s) => s.streamId)), 'each lane has its own logical stream').toHaveLength(3)

    const frames: Frame[][] = LANES.map(() => [])
    streams.forEach((stream, i) => {
      void (async () => {
        for await (const f of stream) frames[i].push(f)
      })()
    })

    // 3 个不同的 prompt，同时发。
    const prompts = LANES.map(promptOf)
    expect(new Set(prompts).size, '3 pairwise different prompts').toBe(3)
    await Promise.all(ids.map((id, i) => sendPrompt(rt.client, id, prompts[i])))

    // 屏障：3 个请求都进入执行（fake 侧记录），5s 超时判 FAIL。
    const entered = await waitAllEntered(rt, LANES, ids)
    expect(entered.length, 'at least the 3 lane requests entered execution').toBeGreaterThanOrEqual(3)

    // 屏障回执：每条流都已实际收到自己的首块（fake 仍在 gate 上挂起）。
    for (let i = 0; i < LANES.length; i += 1) await waitForDelta(frames[i], LANES[i].pieces[0])

    // 放行前，任何一个回合都还没结束 —— 3 个请求都已进入执行。
    for (let i = 0; i < LANES.length; i += 1) {
      expect(frames[i].some(isTurnEnd), `lane ${i} must not end before the barrier releases`).toBe(false)
    }

    rt.release(GATE)

    for (let i = 0; i < LANES.length; i += 1) {
      const turnEndIndex = await waitForTurnEnd(frames[i])

      // 路由证明：sessionId=X 的流里 assistant 内容只含 X 的标记（原样回显，精确全文）。
      const all = frames[i]
        .filter((f, j) => j < turnEndIndex && isTextDelta(f))
        .map((f) => f.frame?.chunk?.text ?? '')
      expect(all.join(''), `lane ${i} echoes its scripted text exactly`).toBe(LANES[i].pieces.join(''))
      for (const other of LANES) {
        if (other === LANES[i]) {
          expect(all.join(''), `lane ${i} carries its own marker`).toContain(LANES[i].marker)
        } else {
          expect(all.join(''), `lane ${i} carries no foreign marker`).not.toContain(other.marker)
        }
      }

      // 请求侧路由：进入执行的请求里，sessionId=X 的 userTexts 带 X 的标记。
      const own = entered.filter((r) => r.sessionId === ids[i])
      expect(own.length, `lane ${i} has its model call recorded`).toBeGreaterThanOrEqual(1)
      expect(own.some((r) => r.userTexts.some((t) => t.includes(LANES[i].marker))), `lane ${i} prompt marker reached its own session's call`).toBe(true)
    }

    for (const stream of streams) stream.cancel()
  } finally {
    await rt.stop()
  }
})
