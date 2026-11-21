// T51 第 0 步 v2：patch 无 config（对齐 DSH bundle）后 setIndexes 四问复测
import { expect, test } from 'playwright/test'
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '/tmp/bot-wt/T51/app/ui/tests/support/tmp-sweep.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '/tmp/bot-wt/T51/app/ui/tests/support/sdk-runtime.ts'
import { serveMarket } from '/tmp/bot-wt/T51/app/ui/tests/support/connectors.ts'

const OUT = '/tmp/bot-wt/T51/work/settings-connectors/evidence/T51'
const LOG = join(OUT, 'step0v2.txt')
const note = (s: string): void => { appendFileSync(LOG, `${s}\n`); console.log(s) }
const j = (v: unknown): string => JSON.stringify(v)?.slice(0, 600) ?? String(v)
const call = (rt: SdkRuntime, method: string, args: unknown): Promise<unknown> => rt.client.call(method, args as never)

function findFilesWith(home: string, needle: string): string[] {
  const hits: string[] = []
  const walk = (d: string, depth: number): void => {
    if (depth > 4) return
    let entries
    try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const f of entries) {
      const p = join(d, f.name)
      if (f.isDirectory()) { if (!['node_modules', 'repositories', 'fake', 'scripts'].includes(f.name)) walk(p, depth + 1) }
      else if (/\.(ya?ml|json)$/.test(f.name)) { try { if (readFileSync(p, 'utf8').includes(needle)) hits.push(p) } catch { /* 忽略 */ } }
    }
  }
  walk(home, 0)
  return hits
}

test('step0v2：无 config patch 下 setIndexes', async () => {
  mkdirSync(OUT, { recursive: true }); writeFileSync(LOG, `# T51 step0v2 @ ${new Date().toISOString()}\n`)
  const server = await serveMarket()
  note(`serveMarket: real=${server.realUrl}`)
  const home = tmkdir('bot-t51-v2-')
  let rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t51-v2w1-'), home })
  try {
    note(`Q0 listIndexes(初)=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`)

    // Q1：对象形态 {urls:[...]}（v1 已证 RPC 要单对象）
    try { note(`Q1 setIndexes({urls}) 成功=${j(await call(rt, 'pluginMarket/setIndexes', { urls: [server.realUrl] }))}`) }
    catch (e) { note(`Q1 setIndexes({urls}) 失败=${String(e).slice(0, 300)}`); throw e }
    expect(true, 'Q1 成功').toBe(true)

    // Q2：立即可用
    note(`Q2 listIndexes=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`)
    note(`Q2 search=${j(await call(rt, 'pluginMarket/search', { url: server.realUrl, query: '' }).catch((e) => `ERR ${String(e).slice(0, 200)}`))}`)

    // Q3：写哪个文件 + 重启还在
    const files1 = findFilesWith(home, server.realUrl)
    note(`Q3 存量文件: ${j(files1)}`)
    for (const f of files1) note(`Q3 ${f} 内容:\n${readFileSync(f, 'utf8').slice(0, 500)}`)
    await rt.stop()
    rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t51-v2w2-'), home })
    const li2 = await call(rt, 'pluginMarket/listIndexes', {})
    note(`Q3 重启后 listIndexes=${j(li2)}`)
    expect(j(li2), 'Q3：重启后源还在').toContain(server.realUrl.replace(/\/index\.json$/, '').slice(0, 20))

    // Q4：env 只作初值——patch 不再读 env 后，设 env 不应清掉用户源（谁都不覆盖谁）
    await rt.stop()
    rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t51-v2w3-'), home, env: { P2SDK_MARKET_INDEXES: server.localUrl } })
    const li3 = await call(rt, 'pluginMarket/listIndexes', {})
    note(`Q4 设 env 重启后 listIndexes=${j(li3)}（预期：只有用户源 real；env 不再生效——初值注入交给 operator）`)
  } finally { await rt.stop(); await server.close() }
})
