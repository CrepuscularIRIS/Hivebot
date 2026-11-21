// T51 第 0 步 v4：无名 override 行（- id + config，settings.update 的写形态）
import { expect, test } from 'playwright/test'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '/tmp/bot-wt/T51/app/ui/tests/support/tmp-sweep.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '/tmp/bot-wt/T51/app/ui/tests/support/sdk-runtime.ts'
import { serveMarket } from '/tmp/bot-wt/T51/app/ui/tests/support/connectors.ts'

const OUT = '/tmp/bot-wt/T51/work/settings-connectors/evidence/T51'
const LOG = join(OUT, 'step0v4.txt')
const note = (s: string): void => { appendFileSync(LOG, `${s}\n`); console.log(s) }
const j = (v: unknown): string => JSON.stringify(v)?.slice(0, 700) ?? String(v)
const call = (rt: SdkRuntime, method: string, args: unknown): Promise<unknown> => rt.client.call(method, args as never)

test('step0v4：无名 override 行', async () => {
  mkdirSync(OUT, { recursive: true }); writeFileSync(LOG, `# T51 step0v4 @ ${new Date().toISOString()}\n`)
  const server = await serveMarket()
  const home = tmkdir('t51v4-')
  writeFileSync(join(home, 'cordis.patch.yml'), [
    '- id: plugin-market',
    '  config:',
    '    indexes:',
    `      - ${server.realUrl}`,
    '',
  ].join('\n'))
  let rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v4w1-'), home })
  try {
    const li = await call(rt, 'pluginMarket/listIndexes', {})
    note(`Q-a′ 无名行 listIndexes=${j(li)}`)
    const ok = j(li).includes(server.realUrl.replace(/\/index\.json$/, '').slice(0, 20))
    note(`Q-a′ 生效=${ok}`)

    if (ok) {
      try {
        note(`Q-b′ setIndexes([real,local]) 成功=${j(await call(rt, 'pluginMarket/setIndexes', { urls: [server.realUrl, server.localUrl] }))}`)
        note(`Q-b′ cordis.patch.yml=\n${readFileSync(join(home, 'cordis.patch.yml'), 'utf8')}`)
      } catch (e) { note(`Q-b′ setIndexes 失败=${String(e).slice(0, 300)}`) }
      await rt.stop()
      rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v4w2-'), home })
      note(`Q-c′ 重启后 listIndexes=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`)
    }
  } finally { await rt.stop(); await server.close() }
})
