// ⑦ 来源门控（HIGH-1）(a)-(f) + ⑧ CSP —— 每条对应一个可独立去门控的突变（红绿记录见 work/p4-ui/evidence/U-00/red-green/）。
import { expect, test } from 'playwright/test'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchShell, UI_ROOT } from '../../support/launch.ts'

const PRELOAD = join(UI_ROOT, 'out', 'preload', 'index.cjs')

test('(a) webviewTag === false 且 devTools === false', async () => {
  const shell = await launchShell()
  try {
    const prefs = await shell.app.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0]!.webContents.getLastWebPreferences()
    })
    expect(prefs.webviewTag).toBe(false)
    // Electron 44 的 getLastWebPreferences 不序列化 devTools 键（false 时缺失）：精确断言
    // undefined，并以行为证据补强——openDevTools() 后仍无 devtools 窗口。
    expect(prefs.devTools).toBe(undefined)
    await shell.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.openDevTools()
    })
    await shell.page.waitForTimeout(500)
    const windows = await shell.app.windows()
    expect(windows).toHaveLength(1)
  } finally { await shell.stop() }
})

test('(b) window.open 与 <a target=_blank> 均不开新窗，http(s) 交给 openExternal', async () => {
  const shell = await launchShell()
  try {
    await shell.app.evaluate(({ shell: sh }) => {
      const g = globalThis as { __openExternalCalls?: string[] }
      g.__openExternalCalls = []
      sh.openExternal = ((url: string) => {
        g.__openExternalCalls!.push(url)
        return Promise.resolve()
      }) as typeof sh.openExternal
    })
    // 合成 click/无手势 window.open 会被 Chromium 弹窗拦截先挡掉（测不到 handler），
    // 必须用 playwright 的真实输入（可信手势）触发。
    await shell.page.evaluate(() => {
      const a = document.createElement('a')
      a.id = 'ext-link'
      a.href = 'https://example.com/blank-click'
      a.target = '_blank'
      a.textContent = 'x'
      document.body.appendChild(a)
      const b = document.createElement('button')
      b.id = 'win-open'
      b.textContent = 'o'
      b.addEventListener('click', () => {
        const w = window.open('https://example.com/win-open')
        ;(globalThis as { __openRet?: string }).__openRet = String(w)
      })
      document.body.appendChild(b)
    })
    await shell.page.click('#ext-link')
    await shell.page.click('#win-open')
    await shell.page.waitForTimeout(500)
    // deny 的页面可观测证据：window.open 返回 null（allow 突变下会返回 [object Window]）。
    const openRet = await shell.page.evaluate(() => (globalThis as { __openRet?: string }).__openRet)
    expect(openRet).toBe('null')
    const windows = await shell.app.windows()
    expect(windows).toHaveLength(1)
    const calls = await shell.app.evaluate(() => (globalThis as { __openExternalCalls?: string[] }).__openExternalCalls ?? [])
    expect(calls.sort()).toEqual(['https://example.com/blank-click', 'https://example.com/win-open'])
  } finally { await shell.stop() }
})

test('(c) 页内 location.href 外部/ file:// 导航被拒，getURL 仍在 pbots-app://app/', async () => {
  const shell = await launchShell()
  try {
    // 先桩 openExternal，防止真实 xdg-open 弹浏览器。
    await shell.app.evaluate(({ shell: sh }) => { sh.openExternal = (() => Promise.resolve()) as typeof sh.openExternal })
    for (const target of ['https://example.com/nav', 'file:///tmp/x.html']) {
      await shell.page.evaluate((t) => { location.href = t }, target)
      await shell.page.waitForTimeout(500)
      const url = await shell.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getURL())
      expect(url.startsWith('pbots-app://app/')).toBe(true)
    }
  } finally { await shell.stop() }
})

test('(d) 同一 preload 载入 data:/file: 页面拿不到 window.pbots', async () => {
  const shell = await launchShell()
  try {
    const filePage = join(mkdtempSync(join(tmpdir(), 'bot-U-00-page-')), 'x.html')
    writeFileSync(filePage, '<!doctype html><html><body>file page</body></html>')
    for (const target of ['data:text/html,<html><body>d</body></html>', `file://${filePage}`]) {
      const created = shell.app.waitForEvent('window', { timeout: 10_000 })
      await shell.app.evaluate(({ BrowserWindow }, { preload, target: t }) => {
        const w = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } })
        if (t.startsWith('file:')) void w.loadFile(t.slice('file://'.length))
        else void w.loadURL(t)
      }, { preload: PRELOAD, target })
      const page = await created
      await page.waitForLoadState('domcontentloaded')
      const hasPbots = await page.evaluate(() => typeof window.pbots)
      expect(hasPbots).toBe('undefined')
      await shell.app.evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows().slice(1)) w.destroy()
      })
    }
  } finally { await shell.stop() }
})

test('(e) 非主窗口（同 preload、pbots-app://app/ 页面）的 pbots:api 被拒', async () => {
  const shell = await launchShell()
  try {
    const created = shell.app.waitForEvent('window', { timeout: 10_000 })
    await shell.app.evaluate(({ BrowserWindow }, { preload }) => {
      const w = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } })
      void w.loadURL('pbots-app://app/')
    }, { preload: PRELOAD })
    const page = await created
    await page.waitForFunction(() => typeof window.pbots !== 'undefined', undefined, { timeout: 10_000 })
    const error = await page.evaluate(() =>
      window.pbots!.api('session/list').then(() => 'no-error', (e: Error) => String(e.message)))
    expect(error).toContain('rejected IPC from a non-main window')
    await shell.app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows().slice(1)) w.destroy()
    })
  } finally { await shell.stop() }
})

test('(f) pbots-app 协议只答静态产物：/api/ 404、穿越 403/非2xx、other 主机 404', async () => {
  const shell = await launchShell()
  try {
    const statuses = await shell.page.evaluate(async () => {
      const out: Record<string, number | 'rejected'> = {}
      const tryStatus = async (key: string, url: string): Promise<void> => {
        try {
          const res = await fetch(url)
          out[key] = res.status
        } catch {
          out[key] = 'rejected'
        }
      }
      await tryStatus('api', 'pbots-app://app/api/session/list')
      await tryStatus('traversal-literal', 'pbots-app://app/../../etc/passwd')
      await tryStatus('traversal-encoded', 'pbots-app://app/%2e%2e/%2e%2e/etc/passwd')
      await tryStatus('other-host', 'pbots-app://other/')
      await tryStatus('boot-absent', 'pbots-app://app/no-such-file.js')
      return out
    })
    expect(statuses.api).toBe(404)
    // URL 解析器会把字面与 %2e%2e 的 ../ 都先规范化掉（WHATWG URL 把 %2e%2e 视作 ..），
    // 所以到 handler 的路径已无穿越段；403 防穿越分支由单测 resolveAppPath 直接覆盖。
    for (const key of ['traversal-literal', 'traversal-encoded', 'other-host', 'boot-absent']) {
      const s = statuses[key as keyof typeof statuses]
      expect(s === 'rejected' || (typeof s === 'number' && (s < 200 || s >= 300))).toBe(true)
    }
    // 跨主机 fetch 在 CORS 层就被拒（corsEnabled 已去），到不了 handler；主机门控用第二窗口导航断言：
    // 载入 pbots-app://other/ 的文档不含应用标记、拿不到 window.pbots（去掉主机门控时 other/ 会照常吐 index.html）。
    // 不用主窗口导航：404 导航的 URL commit 时序在自定义协议下不稳定。
    const created = shell.app.waitForEvent('window', { timeout: 10_000 })
    await shell.app.evaluate(({ BrowserWindow }, { preload }) => {
      const w = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true } })
      void w.loadURL('pbots-app://other/').catch(() => undefined)
    }, { preload: PRELOAD })
    const other = await created
    await other.waitForLoadState('domcontentloaded')
    await other.waitForTimeout(500)
    expect(await other.locator('#shell-ready').count()).toBe(0)
    expect(await other.evaluate(() => typeof window.pbots)).toBe('undefined')
    expect(other.url().startsWith('pbots-app://other/')).toBe(true)
    await shell.app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows().slice(1)) w.destroy()
    })
  } finally { await shell.stop() }
})

test('(f2) dsh 侧 /api 调用计数恒 0（无 spike 桥时通道未接线，静态 fetch 也到不了 dsh）', async () => {
  const shell = await launchShell()
  try {
    const count = await shell.app.evaluate(() => (globalThis as { __pbotsApiCount?: number }).__pbotsApiCount ?? 0)
    expect(count).toBe(0)
  } finally { await shell.stop() }
})

test('⑧ CSP：响应头带最小 CSP，且内联脚本被拦', async () => {
  const fixture = join(mkdtempSync(join(tmpdir(), 'bot-U-00-csp-')), '')
  const { writeFileSync: wf, mkdirSync } = await import('node:fs')
  mkdirSync(fixture, { recursive: true })
  wf(join(fixture, 'index.html'), '<!doctype html><html><head></head><body><script>window.__pwned = 1</script><div id=ok>csp-fixture</div></body></html>')
  const shell = await launchShell({ env: { PBOTS_APP_ROOT: fixture } })
  try {
    const header = await shell.page.evaluate(async () => {
      const res = await fetch(location.href)
      return res.headers.get('content-security-policy') ?? ''
    })
    expect(header).toContain("script-src 'self'")
    const pwned = await shell.page.evaluate(() => (window as { __pwned?: number }).__pwned)
    expect(pwned).toBeUndefined()
    expect(await shell.page.locator('#ok').textContent()).toBe('csp-fixture')
  } finally { await shell.stop() }
})
