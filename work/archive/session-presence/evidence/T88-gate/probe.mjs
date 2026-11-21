import { chromium } from '/home/lingxufeng/bot/app/ui/node_modules/playwright/index.mjs'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 300, height: 200 } })
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 200)))
page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)))
await page.goto('http://127.0.0.1:8137/gate.html')
await page.waitForTimeout(1_500)
const gate = await page.evaluate(() => ({ ...window.__gate, hostHtml: document.getElementById('c').innerHTML.slice(0, 200), childCount: document.getElementById('c').childElementCount }))
console.log('GATE', JSON.stringify(gate))
const svg1 = await page.evaluate(() => document.querySelector('#host svg')?.outerHTML.slice(0, 400) ?? 'none')
await page.waitForTimeout(400)
const svg2 = await page.evaluate(() => document.querySelector('#host svg')?.outerHTML.slice(0, 400) ?? 'none')
console.log('SVG-DIFF', svg1 !== svg2 ? 'DIFFERS(动画在跑)' : 'SAME(静止)')
console.log('SVG1', svg1.slice(0, 240))
const stats = await page.evaluate(() => {
  const cv = document.getElementById('c')
  if (!cv || cv.tagName !== 'CANVAS') return { err: 'no canvas' }
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
  let non = 0
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] !== 0 && !(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) non++
  return { nonWhite: non, total: d.length / 4 }
})
console.log('STATS', JSON.stringify(stats))
await b.close()
