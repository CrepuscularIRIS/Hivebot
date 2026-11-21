// T51 第 0 步 v8（终局）：plugin-market 挂进 profiles/web 的 bundle 层（DSH 官方正路）
// 流程：先起一次生成 workspace → 注入 bundle（package.json bundles 增补 + 本地 bundle 包 + 真包 symlink）→ 四问
import { expect, test } from 'playwright/test'
import { appendFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmkdir } from '/tmp/bot-wt/T51/app/ui/tests/support/tmp-sweep.ts'
import { fakeOverlayPath, launchSdkRuntime, type SdkRuntime } from '/tmp/bot-wt/T51/app/ui/tests/support/sdk-runtime.ts'
import { serveMarket } from '/tmp/bot-wt/T51/app/ui/tests/support/connectors.ts'

const OUT = '/tmp/bot-wt/T51/work/settings-connectors/evidence/T51'
const LOG = join(OUT, 'step0v8.txt')
const REAL_PKG = '/tmp/bot-wt/T51/app/sdk/node_modules/@deepseek-ai/dsh-plugin-market'
const note = (s: string): void => { appendFileSync(LOG, `${s}\n`); console.log(s) }
const j = (v: unknown): string => JSON.stringify(v)?.slice(0, 700) ?? String(v)
const call = (rt: SdkRuntime, method: string, args: unknown): Promise<unknown> => rt.client.call(method, args as never)

test('step0v8：bundle 层（profiles/web）挂载', async () => {
  mkdirSync(OUT, { recursive: true }); writeFileSync(LOG, `# T51 step0v8 @ ${new Date().toISOString()}\n`)
  const server = await serveMarket()
  const home = tmkdir('t51v8-')

  // ① 首起：生成 profiles/web workspace
  let rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v8w0-'), home })
  await rt.stop()
  const ws = join(home, 'profiles', 'web')
  expect(existsSync(join(ws, 'package.json')), 'workspace 已生成').toBe(true)
  note(`workspace: ${ws}`)

  // ② 注入 bundle：manifest bundles 增补 + 本地 bundle 包 + 真包 symlink
  const manifest = JSON.parse(readFileSync(join(ws, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }
  const bundles = new Set(manifest.dsh?.profile?.bundles ?? [])
  bundles.add('hivebot-market-bundle')
  manifest.dsh ??= {}; manifest.dsh.profile ??= {}; manifest.dsh.profile.bundles = [...bundles]
  writeFileSync(join(ws, 'package.json'), JSON.stringify(manifest, null, 2))
  const bundle = join(ws, 'node_modules', 'hivebot-market-bundle')
  mkdirSync(bundle, { recursive: true })
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'hivebot-market-bundle', version: '0.0.1', private: true, dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 1))
  writeFileSync(join(bundle, 'cordis.patch.yml'), "- insert:\n    - id: plugin-market\n      name: '@deepseek-ai/dsh-plugin-market'\n")
  mkdirSync(join(ws, 'node_modules', '@deepseek-ai'), { recursive: true })
  symlinkSync(REAL_PKG, join(ws, 'node_modules', '@deepseek-ai', 'dsh-plugin-market'))

  // ③ 四问
  rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v8w1-'), home })
  try {
    note(`Q1 listIndexes(初)=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`)
    try { note(`Q2 setIndexes([real]) 成功=${j(await call(rt, 'pluginMarket/setIndexes', { urls: [server.realUrl] }))}`) }
    catch (e) { note(`Q2 setIndexes 失败=${String(e).slice(0, 300)}`); throw e }
    note(`Q2 profiles/web/cordis.patch.yml=\n${readFileSync(join(ws, 'cordis.patch.yml'), 'utf8')}`)
    note(`Q3 listIndexes=${j(await call(rt, 'pluginMarket/listIndexes', {}))}`)

    await rt.stop()
    rt = await launchSdkRuntime({ patch: fakeOverlayPath(), cwd: tmkdir('t51v8w2-'), home })
    const li2 = await call(rt, 'pluginMarket/listIndexes', {})
    note(`Q4 重启后 listIndexes=${j(li2)}`)
    expect(j(li2), 'Q4：重启后源还在').toContain(server.realUrl.replace(/\/index\.json$/, '').slice(0, 20))
  } finally { await rt.stop(); await server.close() }
})
