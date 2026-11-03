// E2E 启动 helper：一律生产 build + 临时 HOME 隔离（PLAN §2、LEARNINGS 2026-11-01 Grok Bot 条）。
// U-32 O4（REVIEW-P4终审复审）：Electron env 经 shellChildEnv 副本剥凭证键（原先
// ...process.env 直 spread，真实 key 进被测 Electron 主/Chromium 子进程）。
import { _electron, type ElectronApplication, type Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { shellChildEnv } from './sdk-env'

export const UI_ROOT = resolve(__dirname, '..', '..')

export interface ShellLaunch {
  app: ElectronApplication
  page: Page
  home: string
  stop(): Promise<void>
}

export interface ShellOptions {
  env?: Record<string, string>
  /** 复用上一次的临时 HOME（同一 PBOTS_DATA_DIR，模拟 close→launch）。 */
  home?: string
  extraArgs?: string[]
}

export function sandboxHome(label: string): string {
  return mkdtempSync(join(tmpdir(), `bot-${label}-`))
}

export async function launchShell(opts: ShellOptions = {}): Promise<ShellLaunch> {
  const home = opts.home ?? sandboxHome('U-00')
  const app = await _electron.launch({
    args: [join(UI_ROOT, 'out', 'main', 'index.js'), '--disable-gpu', ...(opts.extraArgs ?? [])],
    cwd: UI_ROOT,
    env: shellChildEnv(home, opts.env),
  })
  const page = await app.firstWindow()
  return {
    app,
    page,
    home,
    async stop() { await app.close() },
  }
}
