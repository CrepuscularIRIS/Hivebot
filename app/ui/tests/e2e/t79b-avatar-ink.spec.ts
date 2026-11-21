// T79b · 头像整片空白（P0）：attach 的 canvas 参数实为**svg 容器**（0.78.1 传 span——
// eager-platform @519603 pM 定位），我们传真 <canvas> → svg 成 fallback 不画。
// 修：PersonaMark 挂载点改 0.78.1 mM 同形（内层 span pM(fill)/外层 host fM）。
import { expect, test } from 'playwright/test'
import { launchProduct } from '../support/ui.ts'

test('T79b：侧栏/会话头 idle 头像有墨（svg 不在 canvas 内+离屏栅格化 alpha>10 像素>0）', async () => {
  test.setTimeout(180_000)
  const env = await launchProduct({})
  try {
    const { page } = env
    await page.waitForSelector('.sand-agent-item', { timeout: 60_000 })
    const marks = page.locator('.sand-grok-bot-mark')
    const count = await marks.count()
    expect(count, `≥2 个 mark（实际 ${count}）`).toBeGreaterThanOrEqual(2)
    const states = await marks.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.grokState ?? ''))
    expect(states.some((s) => s === 'idle'), `至少 1 个 idle（实际 ${states.join(',')}）`).toBe(true)
    const out = await marks.evaluateAll(async (els) => {
      const results: Array<Record<string, unknown>> = []
      for (const el of els) {
        const svg = el.querySelector('svg')
        if (svg == null) { results.push({ where: el.closest('.sand-agent-item') ? 'sidebar' : 'other', err: 'no svg' }); continue }
        const inCanvas = svg.closest('canvas') !== null
        const r = svg.getBoundingClientRect()
        let ink = -1
        try {
          const xml = new XMLSerializer().serializeToString(svg)
          const img = new Image()
          const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
          await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img load')); img.src = url })
          const cv = document.createElement('canvas')
          cv.width = 64; cv.height = 64
          const ctx = cv.getContext('2d')!
          ctx.drawImage(img, 0, 0, 64, 64)
          const d = ctx.getImageData(0, 0, 64, 64).data
          ink = 0
          for (let i = 3; i < d.length; i += 4) if (d[i] > 10) ink += 1
        } catch (e) { results.push({ where: el.closest('.sand-agent-item') ? 'sidebar' : 'other', err: String(e) }); continue }
        const host = el as HTMLElement
        const spanEl = svg.parentElement as HTMLElement
        const ratio = spanEl && host ? spanEl.getBoundingClientRect().width / host.getBoundingClientRect().width : 0
        results.push({ where: el.closest('.sand-agent-item') ? 'sidebar' : el.closest('header, [class*="header"]') ? 'header' : 'other', inCanvas, w: Math.round(r.width), h: Math.round(r.height), ink, spanW: ratio })
      }
      return results
    })
    for (const [i, r] of out.entries()) {
      expect(r.err, `mark ${i} ${JSON.stringify(r)}`).toBeUndefined()
      expect(r.inCanvas, `mark ${i} svg 不在 canvas 内（真挂载）`).toBe(false)
      expect(Number(r.w), `mark ${i} svg 有布局宽`).toBeGreaterThan(0)
      expect(Number(r.ink), `mark ${i} 离屏栅格化有墨（alpha>10）`).toBeGreaterThan(0)
      expect(Number(r.spanW), `mark ${i} 容器=host 100%（N(fill)=1——曾 60% 缩小；实际 ${r.spanW}）`).toBeGreaterThan(0.99)
    }
  } finally {
    await env.stop()
  }
})
