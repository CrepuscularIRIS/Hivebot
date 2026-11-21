// T51 第 0 步 v5：plugin-market 定义挪 home 层（file:// 绝对路径）→ setIndexes 应可写
import { expect, test } from 'playwright/test'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '/tmp/bot-wt/T51/app/ui/tests/support/tmp-sweep.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '/tmp/bot-wt/T51/app/ui/tests/support/sdk-runtime.ts'
import { serveMarket } from '/tmp/bot-wt/T51/app/ui/tests/support/connectors.ts'

const OUT = '/tmp/bot-wt/T51/work/settings-connectors/evidence/T51'
const LOG = join(OUT, 'step0v5.txt')
const PKG = '/tmp/bot-wt/T51/app/sdk' // start.ts 同款：fileUrl(join(PKG_ROOT, node_modules, …, lib, index.js))
const note = (s: string): void => { appendFileSync(LOG, `${s}\n`); console.log(s) }
const j = (v: unknown): string => JSON.stringify(v)?.slice(0, 700) ?? String(v)
const call = (rt: SdkRuntime, method: string, args: unknown): Promise<unknown> => rt.client.call(method, args as never)

test('step0v5：home 层定义 + setIndexes', async () => {
  mkdirSync(OUT, { recursive: true }); writeFileSync(LOG, `# T51 step0v5 @ ${new Date().toISOString()}\n`)
  const server = await serveMarket()
  const home = tmkdir('t51v5-')
  writeFileSync(join(home, 'cordis.patch.yml'), [
    '- id: plugin-market',
    `  name: file://${PKG}/node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js`,
    '',
  ].join('\n'))
  let rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v5w1-'), home })
  try {
    note(`Q1 listIndexes(初)=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`) // 挂载成功=空数组；失败=RPC 404/unknown
    try {
      note(`Q2 setIndexes([real]) 成功=${j(await call(rt, 'pluginMarket/setIndexes', { urls: [server.realUrl] }))}`)
    } catch (e) { note(`Q2 setIndexes 失败=${String(e).slice(0, 300)}`); throw e }
    note(`Q2 cordis.patch.yml=\n${readFileSync(join(home, 'cordis.patch.yml'), 'utf8')}`)
    note(`Q3 listIndexes=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`)

    await rt.stop()
    rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v5w2-'), home })
    note(`Q4 重启后 listIndexes=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`)
    expect(j(await call(rt, 'pluginMarket/listIndexes', {})), 'Q4：重启后源还在').toContain(server.realUrl.replace(/\/index\.json$/, '').slice(0, 20))
  } finally { await rt.stop(); await server.close() }
})
