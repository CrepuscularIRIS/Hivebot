// T51 第 0 步 v3：预写 $DSH_HOME/cordis.patch.yml（用户层 override 行）三问
// Q-a 用户层行对 insert 条目生效否 / Q-b 此形态下 setIndexes 可写否 / Q-c 重启双源还在否
import { expect, test } from 'playwright/test'
import { appendFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '/tmp/bot-wt/T51/app/ui/tests/support/tmp-sweep.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '/tmp/bot-wt/T51/app/ui/tests/support/sdk-runtime.ts'
import { serveMarket } from '/tmp/bot-wt/T51/app/ui/tests/support/connectors.ts'

const OUT = '/tmp/bot-wt/T51/work/settings-connectors/evidence/T51'
const LOG = join(OUT, 'step0v3.txt')
const note = (s: string): void => { appendFileSync(LOG, `${s}\n`); console.log(s) }
const j = (v: unknown): string => JSON.stringify(v)?.slice(0, 700) ?? String(v)
const call = (rt: SdkRuntime, method: string, args: unknown): Promise<unknown> => rt.client.call(method, args as never)

test('step0v3：用户层 cordis.patch.yml 三问', async () => {
  mkdirSync(OUT, { recursive: true }); writeFileSync(LOG, `# T51 step0v3 @ ${new Date().toISOString()}\n`)
  const server = await serveMarket()
  note(`serveMarket: real=${server.realUrl} local=${server.localUrl}`)
  const home = tmkdir('t51v3-')
  writeFileSync(join(home, 'cordis.patch.yml'), [
    '# T51 probe user layer',
    '- id: plugin-market',
    "  name: '@deepseek-ai/dsh-plugin-market'",
    '  config:',
    '    indexes:',
    `      - ${server.realUrl}`,
    '',
  ].join('\n'))
  let rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v3w1-'), home })
  try {
    const li = await call(rt, 'pluginMarket/listIndexes', {})
    note(`Q-a 预写用户层后 listIndexes=${j(li)}`)
    expect(j(li), 'Q-a：用户层 override 行生效').toContain(server.realUrl.replace(/\/index\.json$/, '').slice(0, 20))

    // Q-b：此形态下 setIndexes 增加第二个源
    try {
      note(`Q-b setIndexes([real, local]) 成功=${j(await call(rt, 'pluginMarket/setIndexes', { urls: [server.realUrl, server.localUrl] }))}`)
      const after = readFileSync(join(home, 'cordis.patch.yml'), 'utf8')
      note(`Q-b cordis.patch.yml 更新后:\n${after}`)
    } catch (e) { note(`Q-b setIndexes 失败=${String(e).slice(0, 300)}`); throw e }

    // Q-c：重启后双源在
    await rt.stop()
    rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v3w2-'), home })
    const li2 = await call(rt, 'pluginMarket/listIndexes', {})
    note(`Q-c 重启后 listIndexes=${j(li2)}`)
    expect(j(li2), 'Q-c：重启后双源都在').toContain(server.realUrl.replace(/\/index\.json$/, '').slice(0, 20))
    expect(j(li2), 'Q-c：local 也在').toContain(server.localUrl.replace(/\/index\.json$/, '').slice(0, 20))
  } finally { await rt.stop(); await server.close() }
})
