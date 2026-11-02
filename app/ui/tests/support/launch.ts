// E2E 启动 helper：一律生产 build + 临时 HOME 隔离（PLAN §2、LEARNINGS 2026-11-01 Grok Bot 条）。
import { _electron, type ElectronApplication, type Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const UI_ROOT = resolve(__dirname, '..', '..')

export interface ShellLaunch {
  app: ElectronApplication
  page: Page
  home: string
  stop(): Promise<void>
}

export interface ShellOptions {
  env?: Record<string, string>
  extraArgs?: string[]
}

export function sandboxHome(label: string): string {
  return mkdtempSync(join(tmpdir(), `bot-${label}-`))
}

export async function launchShell(opts: ShellOptions = {}): Promise<ShellLaunch> {
  const home = sandboxHome('U-00')
  const app = await _electron.launch({
    args: [join(UI_ROOT, 'out', 'main', 'index.js'), '--disable-gpu', ...(opts.extraArgs ?? [])],
    cwd: UI_ROOT,
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_CACHE_HOME: join(home, '.cache'),
      PBOTS_DATA_DIR: join(home, 'data'),
      ...opts.env,
    },
  })
  const page = await app.firstWindow()
  return {
    app,
    page,
    home,
    async stop() { await app.close() },
  }
}
