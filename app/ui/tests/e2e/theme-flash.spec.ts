// P5-61.f1 主题闪烁回归（DIAG-P5-61 ①②③；定稿 work/p5-parity/ui/P5-61f1-final.md）。
// 判据全部机械：① DOM 逐帧 trace（诊断 assert-traces 同法）+ 窗口录像逐帧亮度（x11grab，含原生标题栏控件）；
// ② 切换后逐 rAF 采样关键部件底色，data-theme 一到位即等于稳定值；③ 原生 overlay 像素随主题。
// 录像只在 run-e2e.sh 的 Xvfb 里跑（DISPLAY=:0 直接跳过，绝不弹主屏）。
import { expect, test, type ElectronApplication, type Page } from 'playwright/test'
import { spawn, execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { evidenceOut, launchProduct, waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

const OUT = evidenceOut('P5-61f1')
type Mode = 'light' | 'dark'
const other = (m: Mode): Mode => (m === 'dark' ? 'light' : 'dark')
const COVER = { light: 'rgb(252, 252, 252)', dark: 'rgb(18, 18, 18)' } // boot-cover bg-chrome
const OVERLAY = { light: [255, 255, 255], dark: [22, 22, 22] } // main/window.ts overlay color
/** 整窗平均亮度：暗色全程 ≤ DARK_MAX（诊断白封面帧 ≈ 250、淡出帧 ≈ 70+），亮色全程 ≥ LIGHT_MIN（黑封面帧 ≈ 20）。 */
const DARK_MAX = 60
const LIGHT_MIN = 190

test.skip(process.env.DISPLAY === undefined || process.env.DISPLAY === ':0', '只在 run-e2e.sh 自带的 Xvfb 里录像')

const luma = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b

async function xid(app: ElectronApplication): Promise<string> {
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false), { timeout: 30_000 }).toBe(true)
  return String(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getNativeWindowHandle().readUInt32LE(0)))
}

/** 窗口级录像（ffv1 无损，色值不受编码漂移）；返回 stop()。只杀自己 spawn 的 ffmpeg。 */
function record(win: string, file: string): { stop(): Promise<void> } {
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'x11grab', '-window_id', win, '-framerate', '30', '-i', process.env.DISPLAY!, '-c:v', 'ffv1', '-y', file], { stdio: ['pipe', 'ignore', 'inherit'] })
  return {
    async stop() {
      ff.stdin!.end('q')
      await new Promise<void>((r) => { const t = setTimeout(() => { ff.kill('SIGKILL'); r() }, 5_000); ff.once('exit', () => { clearTimeout(t); r() }) })
    },
  }
}

/** 解码为 rgb24 帧序列（filter 决定取整窗缩略还是右上 overlay 条），返回每帧平均 rgb。 */
function frameMeans(file: string, vf: string, w: number, h: number): Array<[number, number, number]> {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `${vf},scale=${w}:${h}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 })
  const size = w * h * 3
  const out: Array<[number, number, number]> = []
  for (let off = 0; off + size <= raw.length; off += size) {
    let r = 0, g = 0, b = 0
    for (let i = off; i < off + size; i += 3) { r += raw[i]!; g += raw[i + 1]!; b += raw[i + 2]! }
    const n = w * h
    out.push([r / n, g / n, b / n])
  }
  return out
}
const WHOLE = 'null'
const OVERLAY_STRIP = 'crop=150:6:iw-150:0' // 原生控件区顶边 6px：只有 overlay 底色，没有符号

/** 采样控件：composer 药丸、侧栏 Connect apps、顶部搜索 / 加号圆钮（VERIFY-P5-61f1 [FIX] 的 4 个部件）。 */
const CONTROLS = ['.sand-prompt-shell', '.sand-agents-sidebar__plugins-entry button', '.sand-agents-sidebar > .sand-agents-sidebar__search', '.sand-agents-sidebar__header .sand-kit-icon-button']
/** 诊断 trace-init 同款：每 rAF 记 data-theme 与封面底色/不透明度；P5-61.f2 加记 CONTROLS 底色（未挂 = null）。 */
function traceInit(sel: string[]): void {
  const w = window as unknown as { __p561f1?: unknown[] }
  const rows: unknown[] = []; w.__p561f1 = rows
  let n = 0
  const tick = (): void => {
    const cover = document.getElementById('pbots-boot')
    const cs = cover === null ? null : getComputedStyle(cover)
    rows.push({ t: performance.now(), theme: document.documentElement.dataset.theme ?? null, cover: cs === null ? null : { bg: cs.backgroundColor, opacity: Number(cs.opacity) }, ctl: sel.map((q) => { const e = document.querySelector(q); return e === null ? null : getComputedStyle(e).backgroundColor }) })
    if (++n < 600) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
type Row = { t: number; theme: string | null; cover: { bg: string; opacity: number } | null; ctl: Array<string | null> }

/** 冷启映射窗口那一刻 Chromium 尚未 present 时，Xvfb（无合成 WM）里整窗是 GTK 窗口底 #fafafa、连原生控件都没画。
 * 这帧不是我们的渲染（与偏好无关、backgroundColor 也管不到），冷启只豁免**开头至多 1 帧**整窗 + 控件区同为 (250,250,250) 的，
 * 计数写进 frames.json 的 unpresented；第 2 帧起或中途出现一律算闪。 */
const UNPRESENTED = (rgb: [number, number, number]): boolean => rgb.every((v) => Math.abs(v - 250) <= 1)

function assertFrames(file: string, mode: Mode, label: string, allowUnpresented = false): void {
  const rgb = frameMeans(file, WHOLE, 160, 100)
  const strip = frameMeans(file, OVERLAY_STRIP, 150, 6)
  const unpresented = allowUnpresented && mode === 'dark' && UNPRESENTED(rgb[0]!) && UNPRESENTED(strip[0]!) ? 1 : 0
  const whole = rgb.map(([r, g, b]) => luma(r, g, b))
  writeFileSync(join(OUT, `${label}.frames.json`), JSON.stringify({ mode, unpresented, whole, strip }))
  expect(whole.length, `${label}: 录到帧`).toBeGreaterThan(10)
  const bad = whole.map((l, i) => ({ i, l })).filter(({ i, l }) => i >= unpresented && (mode === 'dark' ? l > DARK_MAX : l < LIGHT_MIN))
  expect(bad, `${label}: ${mode} 全程无${mode === 'dark' ? '白' : '黑'}帧（整窗亮度）`).toEqual([])
  const badStrip = strip.map(([r, g, b], i) => ({ i, l: luma(r, g, b) })).filter(({ i, l }) => i >= unpresented && (mode === 'dark' ? l > 60 : l < 200))
  expect(badStrip, `${label}: 原生控件区全程随 ${mode}`).toEqual([])
  // P5-61.f2：整窗均值盖不住局部亮钮（VERIFY-P5-61f1 [FIX]）——按钮区逐帧单像素，暗色无 >100 亮像素、亮色无 <150 暗像素
  for (const [name, [x, y]] of Object.entries(CONTROL_PX)) {
    const px = frameMeans(file, `crop=1:1:${x}:${y}`, 1, 1)
    const badPx = px.map((c, i) => ({ i, c })).filter(({ i, c }) => i >= unpresented && (mode === 'dark' ? Math.min(...c) > 100 : Math.max(...c) < 150))
    expect(badPx, `${label}: ${name} 按钮区全程随 ${mode}`).toEqual([])
  }
}
/** 按钮区采样点（窗口坐标；VERIFY-P5-61f1 initial-mixed-probe.py 同点）：Connect apps 底、顶部搜索 / 加号圆钮底（避开图标笔画）。 */
const CONTROL_PX: Record<string, [number, number]> = { connect: [80, 780], search: [190, 20], plus: [235, 20] }

async function overlayColor(win: string): Promise<number[]> {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-f', 'x11grab', '-window_id', win, '-i', process.env.DISPLAY!, '-frames:v', '1', '-vf', `${OVERLAY_STRIP},scale=1:1`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
  return [raw[0]!, raw[1]!, raw[2]!]
}
const near = (a: number[], b: number[], tol = 4): boolean => a.every((v, i) => Math.abs(v - b[i]!) <= tol)

const setTheme = (page: Page, p: Mode | 'system'): Promise<unknown> =>
  page.evaluate((v) => (window as unknown as { desktop: { theme: { set(p: string): Promise<unknown> } } }).desktop.theme.set(v), p)

/** reload 场景：设好偏好 → 挂 trace → 录窗口 → reload → 收集。emulate=true 时先把 media 设成相反（DIAG 前提）。 */
async function reloadRun(mode: Mode, emulate: boolean): Promise<{ rows: Row[]; file: string; label: string }> {
  const env = await launchProduct()
  const label = `reload-${mode}${emulate ? '-media' : ''}`
  try {
    const { page, shell } = env
    if (emulate) await page.emulateMedia({ colorScheme: other(mode) })
    await setTheme(page, mode)
    await expect(page.locator('html')).toHaveAttribute('data-theme', `cursor-${mode}`)
    await page.addInitScript(traceInit, CONTROLS)
    const win = await xid(shell.app)
    await expect.poll(() => overlayColor(win).then((c) => near(c, OVERLAY[mode])), { timeout: 5_000, message: `原生控件 ${mode}` }).toBe(true)
    await page.waitForTimeout(400)
    const file = join(OUT, `${label}.mkv`)
    const rec = emulate ? undefined : record(win, file)
    await page.waitForTimeout(500)
    await page.reload()
    await waitProductReady(page)
    await expect(page.locator('#pbots-boot')).toHaveCount(0)
    await page.waitForTimeout(800)
    await rec?.stop()
    const rows = await page.evaluate(() => (window as unknown as { __p561f1: Row[] }).__p561f1)
    writeFileSync(join(OUT, `${label}.trace.json`), JSON.stringify(rows))
    await page.screenshot({ path: join(OUT, `${label}.png`) })
    return { rows, file, label }
  } finally {
    await env.stop()
  }
}

function assertTrace(rows: Row[], mode: Mode): void {
  const coverRows = rows.filter((r) => r.cover !== null && r.cover.opacity > 0.01)
  expect(coverRows.length, '封面被采到（trace 生效）').toBeGreaterThan(0)
  expect(coverRows.filter((r) => r.cover!.bg !== COVER[mode]), `封面全程 ${mode}`).toEqual([])
  expect(rows.filter((r) => r.theme !== null && r.theme !== `cursor-${mode}`), `正文全程 ${mode}`).toEqual([])
  // P5-61.f2：控件挂上那一帧起即终值（早于上游 useEffect 挂载的侧栏钮曾按亮默认算底色再过渡）
  const stable = rows.at(-1)!.ctl
  expect(stable.every((v) => v !== null), '4 控件都采到').toBe(true)
  expect(rows.filter((r) => r.ctl.some((v, i) => v !== null && v !== stable[i])), `控件挂上后全程 ${mode} 终值（无中间色帧）`).toEqual([])
}

for (const mode of ['dark', 'light'] as const) {
  test(`① 保存 ${mode}、media 被模拟成相反：封面与正文逐帧都跟偏好（DIAG assert-traces 同法，DOM trace）`, async () => {
    test.setTimeout(120_000)
    assertTrace((await reloadRun(mode, true)).rows, mode)
  })

  test(`①③ 保存 ${mode} reload：DOM trace + 窗口录像逐帧（整窗与原生控件全程同为 ${mode}）`, async () => {
    test.setTimeout(120_000)
    const { rows, file, label } = await reloadRun(mode, false)
    assertTrace(rows, mode)
    assertFrames(file, mode, label)
  })
}

test('① 冷启动：保存的偏好与宿主镜像在 shim 之前生效——Chromium 首次 present 起整窗与原生控件同色（亮暗各一次）', async () => {
  test.setTimeout(180_000)
  const home = tmkdir('bot-p561f1-cold-')
  for (const mode of ['dark', 'light'] as const) {
    const first = await launchProduct({ home })
    await setTheme(first.page, mode)
    await first.page.waitForTimeout(300) // IPC 镜像落盘
    await first.stop()
    const env = await launchProduct({ home, ready: false })
    try {
      const win = await xid(env.shell.app)
      const file = join(OUT, `cold-${mode}.mkv`)
      const rec = record(win, file)
      await waitProductReady(env.page)
      await expect(env.page.locator('#pbots-boot')).toHaveCount(0)
      await env.page.waitForTimeout(600)
      await rec.stop()
      assertFrames(file, mode, `cold-${mode}`, true)
      expect(near(await overlayColor(win), OVERLAY[mode]), `冷启 ${mode} 原生控件色`).toBe(true)
    } finally {
      await env.stop()
    }
  }
})

test('②③ 亮暗切换：data-theme 到位那一帧起 composer / Connect apps / 顶部按钮即稳定色（无混色帧）；原生控件色随之', async () => {
  test.setTimeout(120_000)
  const env = await launchProduct()
  try {
    const { page, shell } = env
    const win = await xid(shell.app)
    const SEL = CONTROLS
    await setTheme(page, 'light')
    await page.waitForTimeout(600)
    const report: Record<string, unknown> = {}
    for (const mode of ['dark', 'light'] as const) {
      const rows = await page.evaluate(async ([sel, m]) => {
        const sample = (): { theme: string | undefined; bg: string[] } => ({ theme: document.documentElement.dataset.theme, bg: (sel as string[]).map((s) => { const e = document.querySelector(s); return e === null ? 'missing' : getComputedStyle(e).backgroundColor }) })
        const out: Array<ReturnType<typeof sample>> = []
        void (window as unknown as { desktop: { theme: { set(p: string): Promise<unknown> } } }).desktop.theme.set(m as string)
        out.push(sample()) // 同步到位的那一刻
        const t0 = performance.now()
        await new Promise<void>((r) => { const tick = (): void => { out.push(sample()); if (performance.now() - t0 < 700) requestAnimationFrame(tick); else r() }; requestAnimationFrame(tick) })
        return out
      }, [SEL, mode] as const)
      const stable = rows[rows.length - 1]!
      report[mode] = rows
      expect(stable.bg.filter((v) => v === 'missing'), `${mode} 采样部件都在`).toEqual([])
      const mixed = rows.filter((r) => r.theme === `cursor-${mode}` && r.bg.some((v, i) => v !== stable.bg[i]))
      expect(rows[0]!.theme, '上游监听同步换 data-theme').toBe(`cursor-${mode}`)
      expect(mixed, `${mode}：data-theme 之后无中间色帧`).toEqual([])
      await expect.poll(() => overlayColor(win).then((c) => near(c, OVERLAY[mode])), { timeout: 5_000, message: `原生控件 ${mode}` }).toBe(true)
      await page.screenshot({ path: join(OUT, `switch-${mode}.png`) })
    }
    writeFileSync(join(OUT, 'switch.trace.json'), JSON.stringify(report))
    // 悬停动效不受影响（只在切换帧禁过渡）
    const transition = await page.locator(SEL[2]!).evaluate((e) => getComputedStyle(e).transitionDuration)
    expect(transition).toContain('0.12s')
  } finally {
    await env.stop()
  }
})
