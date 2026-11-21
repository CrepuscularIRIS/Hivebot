// T49 第 0 步可行性探针 P1–P4（工单 §第 0 步；P5 在 sdk 侧跑，见回执）。
// 前置实验已定:patch 层 config 会锁 ns/带 !!js 对象进合并校验(market.yml 注释 T51 先例+实测),
// 故本探针验证 DSH 官方形态:llm-pi-ai 零路由挂载,默认路由由 settings/mutate 写 user 层。
// real runtime + 本地假 OpenAI 端点(不打真 LLM)。跑法:
//   cd app/ui && PATH=$PWD/node_modules/.bin:$PATH npx playwright test \
//     --config .../T49/pw.config.ts --reporter=line .../T49/probe.spec.ts
import { test } from 'playwright/test'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchSdkRuntime, type SdkRuntime } from '/home/lingxufeng/bot/app/ui/tests/support/sdk-runtime.ts'

const OUT = '/home/lingxufeng/bot/work/settings-connectors/evidence/T49'
const CONSOLE = join(OUT, 'probe.txt')
const note = (s: string): void => { appendFileSync(CONSOLE, `${s}\n`) }

test.beforeAll(() => { mkdirSync(OUT, { recursive: true }); writeFileSync(CONSOLE, `T49 probe ${new Date().toISOString()}\n`) })

/** 假 OpenAI 兼容端点:记录 Authorization;回非流式 chat completion。 */
async function fakeLlm(): Promise<{ port: number; hitsFile: string; close(): Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), 't49-fakellm-'))
  const hitsFile = join(dir, 'auth-hits.jsonl')
  writeFileSync(hitsFile, '')
  const srv: Server = createServer((_req, res) => {
    appendFileSync(hitsFile, JSON.stringify({ path: _req.url, auth: req2auth(_req) }) + '\n')
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ id: 'chatcmpl-t49', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 't49 probe ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
  })
  await new Promise<void>((r) => { srv.listen(0, '127.0.0.1', () => r()) })
  const port = (srv.address() as { port: number }).port
  return { port, hitsFile, close: () => new Promise((r) => srv.close(() => r())) }
}

const req2auth = (req: { headers: { authorization?: string } }): string | null => req.headers.authorization ?? null

const auths = (f: string): Array<string | null> =>
  readFileSync(f, 'utf8').split('\n').filter((l) => l !== '').map((l) => (JSON.parse(l) as { auth: string | null }).auth)

const waitHits = async (f: string, n: number, ms = 90_000): Promise<void> => {
  const deadline = Date.now() + ms
  for (;;) {
    if (auths(f).length >= n) return
    if (Date.now() > deadline) throw new Error(`假端点 ${n} 次命中超时（现 ${JSON.stringify(auths(f))}）`)
    await new Promise((r) => setTimeout(r, 200))
  }
}

const call = (rt: SdkRuntime, method: string, args?: unknown): Promise<unknown> => rt.client.call(method, args)

const bootReal = (home: string, port: number): Promise<SdkRuntime> => launchSdkRuntime({
  patch: '/home/lingxufeng/bot/app/sdk/profile/patches/presets.yml',
  home,
  env: { P2SDK_PROVIDER: 'real', P2SDK_LLM_API_KEY: 'env-value-1', P2SDK_LLM_BASE_URL: `http://127.0.0.1:${port}` },
})

const newSession = (rt: SdkRuntime): Promise<string> => call(rt, 'session/create', { request: { cwd: mkdtempSync(join(tmpdir(), 't49-cwd-')) } })
  .then((r) => (r as { sessionId: string }).sessionId)

const prompt = (rt: SdkRuntime, sessionId: string, tag: string): Promise<unknown> =>
  call(rt, 'session/prompt', { request: { requestId: `t49-${tag}-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: `t49 ${tag}` }] } })

const mutateProviders = (rt: SdkRuntime, route: string, value: Record<string, unknown>): Promise<unknown> =>
  call(rt, 'settings/mutate', { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', route], value }] })

const catalog = (rt: SdkRuntime): Promise<{ routableProviders?: string[]; groups?: Array<{ id: string; models: Array<{ id: string }> }> }> =>
  call(rt, 'session/modelCatalog', {}) as Promise<{ routableProviders?: string[]; groups?: Array<{ id: string; models: Array<{ id: string }> }> }>

const exists = (p: string): boolean => { try { statSync(p); return true } catch { return false } }

test('P1–P4 real runtime 探针（零路由挂载 + mutate 注入默认路由形态）', async () => {
  test.setTimeout(300_000)
  const llm = await fakeLlm()
  const home = mkdtempSync(join(tmpdir(), 't49-home-'))
  const litellm = { api: 'openai-completions', baseURL: `http://127.0.0.1:${llm.port}/v1`, apiKeyEnv: 'P2SDK_LLM_API_KEY', models: [{ id: 'glm-5.3-flash', contextWindow: 131072 }] }
  const rt = await bootReal(home, llm.port)
  try {
    // P1：环境变量层 describe（P2SDK_LLM_API_KEY 来自 env）
    note(`P1 describe(env-only) = ${JSON.stringify(await call(rt, 'credentials/describe', { refs: ['P2SDK_LLM_API_KEY'] } ))}`)

    // P4b：mutate 写默认 litellm 路由进 user 层（launcher 启动注入的同款调用）
    note(`P4b mutate litellm = ${JSON.stringify(await mutateProviders(rt, 'litellm', litellm)).slice(0, 200)}`)
    note(`P4b' mutate t49probe = ${JSON.stringify(await mutateProviders(rt, 't49probe', { api: 'openai-completions', baseURL: `http://127.0.0.1:${llm.port}/v1`, apiKeyEnv: 'T49PROBE_API_KEY', models: [{ id: 't49-model', contextWindow: 8192 }] })).slice(0, 200)}`)
    const cat = await catalog(rt)
    note(`P4c catalog providers = ${JSON.stringify(cat.routableProviders)} groups = ${JSON.stringify((cat.groups ?? []).map((g) => `${g.id}:${g.models.map((m) => m.id).join(',')}`))}`)

    // P2：set 盖过 env——下一条请求 Authorization 换新值；文件 600；describe 层变 file
    note(`P2 credentials/set = ${JSON.stringify(await call(rt, 'credentials/set', { ref: 'P2SDK_LLM_API_KEY', value: 'probe-new' }))}`)
    const sid = await newSession(rt)
    await prompt(rt, sid, 'p2')
    await waitHits(llm.hitsFile, 1)
    note(`P2 auth after set = ${JSON.stringify(auths(llm.hitsFile).at(-1))}（期望 Bearer probe-new）`)
    const cred = join(rt.home, '.credentials.yaml')
    note(`P2 ${cred} exists=${exists(cred)}` + (exists(cred) ? ` mode=${(statSync(cred).mode & 0o777).toString(8)}` : ''))
    note(`P2 describe after set = ${JSON.stringify(await call(rt, 'credentials/describe', { refs: ['P2SDK_LLM_API_KEY'] } ))}`)
  } finally { await rt.stop(); await llm.close() }

  // P3+P4d：重启（同 home）——credentials 仍在 file 层；user 路由仍在；catalog 仍两组（合并语义）
  const rt3 = await bootReal(home, llm.port)
  try {
    note(`P3 describe after restart = ${JSON.stringify(await call(rt3, 'credentials/describe', { refs: ['P2SDK_LLM_API_KEY'] } ))}`)
    const d = JSON.stringify(await call(rt3, 'settings/describe', {}))
    const seg = d.slice(Math.max(0, d.indexOf('"ns":"llm-pi-ai"')), d.indexOf('"ns":"llm-pi-ai"') + 260)
    note(`P4d restart llm-pi-ai 头 260 字 = ${seg}`)
    const cat3 = await catalog(rt3)
    note(`P4d restart catalog providers = ${JSON.stringify(cat3.routableProviders)} groups = ${JSON.stringify((cat3.groups ?? []).map((g) => `${g.id}:${g.models.map((m) => m.id).join(',')}`))}`)
  } finally { await rt3.stop() }
})
