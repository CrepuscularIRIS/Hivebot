// T51 第 0 步 v7：plugin-market 挂进 bundle 层（DSH 官方正路）→ setIndexes 应可写且持久
import { expect, test } from 'playwright/test'
import { appendFileSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '/tmp/bot-wt/T51/app/ui/tests/support/tmp-sweep.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '/tmp/bot-wt/T51/app/ui/tests/support/sdk-runtime.ts'
import { serveMarket } from '/tmp/bot-wt/T51/app/ui/tests/support/connectors.ts'

const OUT = '/tmp/bot-wt/T51/work/settings-connectors/evidence/T51'
const LOG = join(OUT, 'step0v7.txt')
const REAL_PKG = '/tmp/bot-wt/T51/app/sdk/node_modules/@deepseek-ai/dsh-plugin-market'
const note = (s: string): void => { appendFileSync(LOG, `${s}\n`); console.log(s) }
const j = (v: unknown): string => JSON.stringify(v)?.slice(0, 700) ?? String(v)
const call = (rt: SdkRuntime, method: string, args: unknown): Promise<unknown> => rt.client.call(method, args as never)

test('step0v7：bundle 层挂载', async () => {
  mkdirSync(OUT, { recursive: true }); writeFileSync(LOG, `# T51 step0v7 @ ${new Date().toISOString()}\n`)
  const server = await serveMarket()
  const home = tmkdir('t51v7-')
  // 1) profile workspace manifest：声明 bundle
  writeFileSync(join(home, 'package.json'), JSON.stringify({ name: 'hivebot-profile', private: true, dsh: { profile: { bundles: ['hivebot-market-bundle'] } } }, null, 1))
  // 2) 本地 bundle 包
  const bundle = join(home, 'node_modules', 'hivebot-market-bundle')
  mkdirSync(bundle, { recursive: true })
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'hivebot-market-bundle', version: '0.0.1', private: true, dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 1))
  writeFileSync(join(bundle, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: plugin-market',
    "      name: '@deepseek-ai/dsh-plugin-market'",
    '',
  ].join('\n'))
  // 3) bare name 解析链：node_modules/@deepseek-ai/dsh-plugin-market → 真包 symlink
  mkdirSync(join(home, 'node_modules', '@deepseek-ai'), { recursive: true })
  symlinkSync(REAL_PKG, join(home, 'node_modules', '@deepseek-ai', 'dsh-plugin-market'))

  let rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v7w1-'), home })
  try {
    note(`Q1 listIndexes(初)=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`) // [] = bundle 层挂载成功
    try {
      note(`Q2 setIndexes([real]) 成功=${j(await call(rt, 'pluginMarket/setIndexes', { urls: [server.realUrl] }))}`)
    } catch (e) { note(`Q2 setIndexes 失败=${String(e).slice(0, 300)}`); throw e }
    note(`Q2 cordis.patch.yml(用户层)=\n${readFileSync(join(home, 'cordis.patch.yml'), 'utf8')}`)
    note(`Q3 listIndexes=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`)

    await rt.stop()
    rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v7w2-'), home })
    const li2 = await call(rt, 'pluginMarket/listIndexes', {})
    note(`Q4 重启后 listIndexes=${j(li2)}`)
    expect(j(li2), 'Q4：重启后源还在').toContain(server.realUrl.replace(/\/index\.json$/, '').slice(0, 20))
  } finally { await rt.stop(); await server.close() }
})
