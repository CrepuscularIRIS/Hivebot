// T51 第 0 步 v8（终局）：plugin-market 挂进 profiles/web 的 bundle 层（DSH 官方正路）
// 流程：先起一次生成 workspace → 注入 bundle（package.json bundles 增补 + 本地 bundle 包 + 真包 symlink）→ 四问
import { expect, test } from 'playwright/test'
import { appendFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '/tmp/bot-wt/T51/app/ui/tests/support/tmp-sweep.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '/tmp/bot-wt/T51/app/ui/tests/support/sdk-runtime.ts'
import { serveMarket } from '/tmp/bot-wt/T51/app/ui/tests/support/connectors.ts'

const OUT = '/tmp/bot-wt/T51/work/settings-connectors/evidence/T51'
const LOG = join(OUT, 'step0v10.txt')
const REAL_PKG = '/tmp/bot-wt/T51/app/sdk/node_modules/@deepseek-ai/dsh-plugin-market'
const note = (s: string): void => { appendFileSync(LOG, `${s}\n`); console.log(s) }
const j = (v: unknown): string => JSON.stringify(v)?.slice(0, 700) ?? String(v)
const call = (rt: SdkRuntime, method: string, args: unknown): Promise<unknown> => rt.client.call(method, args as never)

test('step0v10：bundle 层（profiles/web）挂载', async () => {
  mkdirSync(OUT, { recursive: true }); writeFileSync(LOG, `# T51 step0v10 @ ${new Date().toISOString()}\n`)
  const server = await serveMarket()
  const home = tmkdir('t51v10-')
  const ws = join(home, 'profiles', 'web') // 产品代码生成后供 Q2 读取

  // 产品路径：不预写任何东西——start.ts ensureMarketBundle 自己干；env 初值也由它种
  // ③ 四问
  let rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v10w1-'), home, env: { P2SDK_MARKET_INDEXES: server.realUrl } })
  try {
    const li0 = await call(rt, 'pluginMarket/listIndexes', {})
    note(`Q1 listIndexes(env 初值)=${j(li0)}`)
    expect(j(li0), 'Q1：env 初值已种入').toContain(server.realUrl.replace(/\/index\.json$/, '').slice(0, 20))
    try { note(`Q2 setIndexes([real]) 成功=${j(await call(rt, 'pluginMarket/setIndexes', { urls: [server.realUrl] }))}`) }
    catch (e) { note(`Q2 setIndexes 失败=${String(e).slice(0, 300)}`); throw e }
    note(`Q2 profiles/web/cordis.patch.yml=\n${readFileSync(join(ws, 'cordis.patch.yml'), 'utf8')}`)
    note(`Q3 listIndexes=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`)

    await rt.stop()
    rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v10w2-'), home, env: { P2SDK_MARKET_INDEXES: server.localUrl } })
    const li2 = await call(rt, 'pluginMarket/listIndexes', {})
    note(`Q4 重启后 listIndexes=${j(li2)}`)
    expect(j(li2), 'Q4：重启后源还在').toContain(server.realUrl.replace(/\/index\.json$/, '').slice(0, 20))
  } finally { await rt.stop(); await server.close() }
})
