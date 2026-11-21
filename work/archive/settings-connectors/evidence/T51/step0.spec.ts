// T51 第 0 步：pluginMarket/setIndexes 可行性四问（Q1 存 / Q2 即用 / Q3 重启还在 / Q4 env 谁赢）
// 纯后端实测：不起 UI，隔离 HOME，serveMarket 回环目录。
import { expect, test } from 'playwright/test'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '/home/lingxufeng/bot/app/ui/tests/support/tmp-sweep.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '/home/lingxufeng/bot/app/ui/tests/support/sdk-runtime.ts'
import { serveMarket } from '/home/lingxufeng/bot/app/ui/tests/support/connectors.ts'

const OUT = '/home/lingxufeng/bot/work/settings-connectors/evidence/T51'
const LOG = join(OUT, 'step0.txt')
const note = (s: string): void => { appendFileSync(LOG, `${s}\n`); console.log(s) }
const j = (v: unknown): string => JSON.stringify(v)?.slice(0, 600) ?? String(v)
const call = (rt: SdkRuntime, method: string, args: unknown): Promise<unknown> => rt.client.call(method, args as never)

/** 在 HOME 下找含目标 URL 的 yml/json 文件（浅层，跳过大目录）。 */
function findFilesWith(home: string, needle: string): string[] {
  const hits: string[] = []
  const walk = (d: string, depth: number): void => {
    if (depth > 4) return
    let entries
    try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const f of entries) {
      const p = join(d, f.name)
      if (f.isDirectory()) { if (!['node_modules', 'repositories', 'fake', 'scripts'].includes(f.name)) walk(p, depth + 1) }
      else if (/\.(ya?ml|json)$/.test(f.name)) { try { if (readFileSync(p, 'utf8').includes(needle)) hits.push(p) } catch { /* 二进制等 */ } }
    }
  }
  walk(home, 0)
  return hits
}

test('step0：setIndexes 四问', async () => {
  mkdirSync(OUT, { recursive: true }); writeFileSync(LOG, `# T51 step0 @ ${new Date().toISOString()}\n`)
  const server = await serveMarket()
  note(`serveMarket: real=${server.realUrl} local=${server.localUrl}`)
  const home = tmkdir('bot-t51-s0-')
  let rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t51-ws1-'), home })
  try {
    note(`Q0 listIndexes(初)=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`)

    // Q1：无 env、无既有源 → setIndexes 存不存（先试数组位置参数，失败试对象）
    let ok = false
    for (const [form, args] of [['array', [server.realUrl]], ['object', { urls: [server.realUrl] }]] as const) {
      try { note(`Q1 setIndexes(${form}) 成功=${j(await call(rt, 'pluginMarket/setIndexes', args as never))}`); ok = true; break } catch (e) { note(`Q1 setIndexes(${form}) 失败=${String(e).slice(0, 300)}`) }
    }
    expect(ok, 'Q1：setIndexes 至少一种参数形态要成功').toBe(true)

    // Q2：立即可用
    note(`Q2 listIndexes=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`)
    note(`Q2 search=${j(await call(rt, 'pluginMarket/search', { url: server.realUrl, query: '' }).catch((e) => `ERR ${String(e).slice(0, 200)}`))}`)

    // Q3：写到哪个文件 + 重启还在吗
    note(`Q3 存量文件: ${j(findFilesWith(home, server.realUrl))}`)
    await rt.stop()
    rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t51-ws2-'), home })
    const li2 = await call(rt, 'pluginMarket/listIndexes', {})
    note(`Q3 重启后 listIndexes=${j(li2)}`)
    note(`Q3 存量文件(重启后): ${j(findFilesWith(home, server.realUrl))}`)
    expect(j(li2), 'Q3：重启后源还在').toContain(server.realUrl.replace(/\/index\.json$/, '').slice(0, 20))

    // Q4：已有存量源时设 P2SDK_MARKET_INDEXES=另一源，谁赢
    await rt.stop()
    rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('bot-t51-ws3-'), home, env: { P2SDK_MARKET_INDEXES: server.localUrl } })
    const li3 = await call(rt, 'pluginMarket/listIndexes', {})
    note(`Q4 env=localUrl 重启后 listIndexes=${j(li3)}`)
    note(`Q4 判定: real在=${j(li3).includes(server.realUrl.slice(0, 24))} local在=${j(li3).includes(server.localUrl.slice(0, 24))}`)
  } finally { await rt.stop(); await server.close(); note(`finally: LOG=${existsSync(LOG)}`) }
})
