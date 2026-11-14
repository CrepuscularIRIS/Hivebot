// T49a 验收 2：默认 litellm 路由改由启动种子（settings/mutate 写 user 层）。
// ① 首启后 modelCatalog 含 litellm:<model>；② mutate 第二条路由不报
// 「expected string but got [object Object]」（探针在旧形态下必报的那条）；③ 用户改
// baseURL 后重启，路由仍在且不被重写（T51 口径：种子只作首启）。
// real provider + 本地假 OpenAI 端点（不打真 LLM）。
import { expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchRuntime, type Runtime } from '../support/runtime'

async function fakeLlm(): Promise<{ port: number; close(): Promise<void> }> {
  const srv = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
  })
  await new Promise<void>((r) => { srv.listen(0, '127.0.0.1', () => r()) })
  return { port: (srv.address() as { port: number }).port, close: () => new Promise((r) => srv.close(() => r())) }
}

const boot = (home: string, port: number, model?: string): Promise<Runtime> => launchRuntime({
  env: {
    P2SDK_PROVIDER: 'real',
    P2SDK_HOME: home,
    P2SDK_LLM_API_KEY: 'e2e-key',
    P2SDK_LLM_BASE_URL: `http://127.0.0.1:${port}`,
    ...(model !== undefined ? { P2SDK_LLM_MODEL: model } : {}),
  },
})

const catalog = async (rt: Runtime): Promise<{ routableProviders?: string[]; groups?: Array<{ id: string; models: Array<{ id: string }> }> }> =>
  (await rt.client.call('session/modelCatalog', {})) as never

it('T49a：种子路由三断言（首启可见 / settings 可写 / 重启不覆盖用户改动）', { timeout: 180_000 }, async () => {
  const llm = await fakeLlm()
  const home = mkdtempSync(join(tmpdir(), 't49a-e2e-home-'))
  try {
    // ① 首启（T49ab：ready 行已在种子之后——一见 ready 立即查，不用轮询；轮询正是掩盖
    // 时序窗口的盲点，Sol M4）。default model 也须跟种子一致（M2：custom 模型场景）。
    const rt = await boot(home, llm.port, 'custom-review-model')
    try {
      const cat = await catalog(rt)
      expect(cat.routableProviders, 'ready 即查：种子已落地').toContain('litellm')
      const litellmGroup = (cat.groups ?? []).find((g) => g.id === 'litellm')
      expect(litellmGroup?.models.map((m) => m.id)).toContain('custom-review-model')
      expect((cat as { default?: { provider?: string; model?: string } }).default, '默认选择跟种子同模型（M2）')
        .toEqual({ provider: 'litellm', model: 'custom-review-model' })
    } finally { await rt.stop() }

    // ② settings 可写：再起一次，mutate 第二条路由不被拒（旧形态必报 object object）
    const rt2 = await boot(home, llm.port)
    try {
      expect((await catalog(rt2)).routableProviders, 'ready 即查').toContain('litellm')
      await rt2.client.call('settings/mutate', {
        ns: 'llm-pi-ai',
        ops: [{ op: 'set', path: ['providers', 'second'], value: { api: 'openai-completions', baseURL: `http://127.0.0.1:${llm.port}/v1`, apiKeyEnv: 'SECOND_API_KEY', models: [{ id: 'second-model', contextWindow: 8192 }] } }],
      })
      // 用户改默认路由的 baseURL（③的铺垫）
      await rt2.client.call('settings/mutate', {
        ns: 'llm-pi-ai',
        ops: [{ op: 'set', path: ['providers', 'litellm'], value: { api: 'openai-completions', baseURL: 'http://user-edited.example/v1', apiKeyEnv: 'P2SDK_LLM_API_KEY', models: [{ id: 'glm-5.3-flash', contextWindow: 131072 }] } }],
      })
    } finally { await rt2.stop() }

    // ③ 重启（同 home）：litellm 仍是用户改过的 baseURL（种子不覆盖）
    const rt3 = await boot(home, llm.port)
    try {
      expect((await catalog(rt3)).routableProviders, 'ready 即查').toContain('litellm')
      const d = (await rt3.client.call('settings/describe', {})) as { namespaces?: Array<{ ns?: string; user?: { providers?: Record<string, { baseURL?: string }> } }> }
      const providers = (d.namespaces ?? []).find((n) => n.ns === 'llm-pi-ai')?.user?.providers ?? {}
      expect(providers.litellm?.baseURL, 'litellm 仍是用户改过的 baseURL（种子不覆盖）').toBe('http://user-edited.example/v1')
      expect(providers.second?.baseURL, '② 加的第二条路由重启仍在').toContain(`127.0.0.1:${llm.port}`)
    } finally { await rt3.stop() }
  } finally {
    await llm.close()
    void writeFileSync
  }
})
