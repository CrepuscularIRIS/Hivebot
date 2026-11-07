// T28b：kickstart 队列（按 sid）+ templateId 不设主 + 介绍带名字——照 p5-w3f1 的 createShimData 假 api 用法。
import { describe, expect, it } from 'vitest'
import { createShimData } from '../../../renderer-grok/shim/src/data'
import { roleUseCaseBots } from '../../../renderer-grok/overrides/modules/onboarding-walk'

const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

function rig() {
  let seq = 0
  const calls: Array<{ method: string; args?: unknown }> = []
  const api = (method: string, args?: unknown) => {
    calls.push({ method, args })
    return Promise.resolve({ ok: true, value: { sessionId: `s${++seq}` } })
  }
  const metaOps: unknown[] = []
  const metaApi = (op: unknown) => { metaOps.push(op); return Promise.resolve({ ok: true, value: { mainBotId: null, recipes: {} } }) }
  const data = createShimData({ authId: 'auth', api, metaApi })
  return { data, calls, metaOps }
}

describe('T28b kickstart 队列', () => {
  it('(a) A、B 登记后 finishKickstart(A) 只发 A；再调 A 不发；finishKickstart(B) 发 B', async () => {
    const { data, calls } = rig()
    const a = await data.deps.createAgent({ origin: 'user', isKickstartRequested: true, name: 'A Bot', description: 'da' })
    const b = await data.deps.createAgent({ origin: 'user', isKickstartRequested: true, name: 'B Bot', description: 'db' })
    await data.dev.finishKickstart(rec(a).id as string)
    const prompts = calls.filter((c) => c.method === 'session/prompt')
    expect(prompts).toHaveLength(1)
    expect(JSON.stringify(prompts[0]!.args)).toContain('Your name is A Bot.')
    await data.dev.finishKickstart(rec(a).id as string) // 同 sid 再调不发
    expect(calls.filter((c) => c.method === 'session/prompt')).toHaveLength(1)
    await data.dev.finishKickstart(rec(b).id as string)
    expect(calls.filter((c) => c.method === 'session/prompt')).toHaveLength(2)
    expect(JSON.stringify(calls.filter((c) => c.method === 'session/prompt')[1]!.args)).toContain('Your name is B Bot.')
  })
  it('(b) name 空串时提示不含 Your name is', async () => {
    const { data, calls } = rig()
    const m = await data.deps.createAgent({ origin: 'user', isKickstartRequested: true, name: '', description: 'x' })
    await data.dev.finishKickstart(rec(m).id as string)
    const args = JSON.stringify(calls.find((c) => c.method === 'session/prompt')!.args)
    expect(args).not.toContain('Your name is')
  })
  it('(c) 带 templateId 不 patch main；不带照旧 patch', async () => {
    const { data, metaOps } = rig()
    const t = await data.deps.createAgent({ origin: 'user', isKickstartRequested: true, name: 'T', description: '', templateId: 'bug-reproduction' })
    expect(metaOps.some((op) => rec(op).op === 'patch'), '模板 bot 不 setMain').toBe(false)
    const p = await data.deps.createAgent({ origin: 'user', isKickstartRequested: true, name: 'P', description: '' })
    expect(metaOps.some((op) => rec(op).op === 'patch' && rec(op).mainBotId === rec(p).id), '主 bot setMain').toBe(true)
  })
  it('(e) 介绍失败抛错——完成链停建后续模板（review M）', async () => {
    let seq = 0
    const prompts: Array<{ sid: string; ok: boolean }> = []
    const api = (method: string, args?: unknown) => {
      if (method === 'session/prompt') {
        const sid = (rec(args).request as { sessionId: string }).sessionId
        const ok = prompts.length === 0 ? false : true // 第一次介绍失败
        prompts.push({ sid, ok })
        return ok ? Promise.resolve({ ok: true }) : Promise.resolve({ ok: false, error: { code: 'x', message: 'boom' } })
      }
      return Promise.resolve({ ok: true, value: { sessionId: `s${++seq}` } })
    }
    const data = createShimData({ authId: 'a', api, metaApi: () => Promise.resolve({ ok: true, value: { mainBotId: null, recipes: {} } }) })
    const a = await data.deps.createAgent({ origin: 'user', isKickstartRequested: true, name: 'A', description: '' })
    const b = await data.deps.createAgent({ origin: 'user', isKickstartRequested: true, name: 'B', description: '' })
    await expect(data.dev.finishKickstart(rec(a).id as string)).rejects.toThrow('kickstart prompt failed')
    // B 未被消费（失败抛错不吞后续）
    const promptsAfter = prompts.length
    await data.dev.finishKickstart(rec(b).id as string).catch(() => {})
    expect(prompts.length).toBe(promptsAfter + 1) // B 的介绍仍可独立发
  })

  it('(d) roleUseCaseBots 请求体经 createAgent 全链可建', async () => {
    const { data } = rig()
    const [first] = roleUseCaseBots('engineering')
    const r = await data.deps.createAgent({ ...first })
    expect(rec(r).name).toBe('Bug Reproduction')
  })
})
