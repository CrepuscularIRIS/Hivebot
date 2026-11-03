// P5-50 stub-mount check: build output + S0 stub in our Electron 44, light and dark.
// Asserts sidebar (3 bots, persona SVG state), boot transcript (user msg, thinking, bash/read tool rows,
// assistant markdown + code block, composer), entry boundary = 0, no MISSING bridge method; saves one screenshot per theme.
// Run under Xvfb: `pnpm mount [outDir]` (needs `pnpm build` first). playwright/electron resolve from app/ui (parent package).
import { _electron } from 'playwright'
import electronPath from 'electron'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[2] ?? join(here, '..', '.build', 'mount-evidence')
mkdirSync(outDir, { recursive: true })

const probe = () => {
  const body = document.body.innerText
  // first opaque background under the conversation pane (body itself is transparent)
  let el = document.elementFromPoint(1100, 600), bg = [255, 255, 255]
  for (; el; el = el.parentElement) {
    const c = getComputedStyle(el).backgroundColor.match(/[\d.]+/g).map(Number)
    if (c.length === 3 || c[3] === 1) { bg = c.slice(0, 3); break }
  }
  return {
    agentNames: [...document.querySelectorAll('.sand-agent-item')].map((el) => el.querySelector('.sand-agent-item__name')?.textContent),
    personaStates: [...document.querySelectorAll('[data-grok-state]')].map((el) => el.getAttribute('data-grok-state')),
    boundaryCount: (body.match(/Couldn't render this/g) || []).length,
    hasUserMsg: body.includes('quarterly numbers'),
    hasThinking: body.includes('Thinking') || body.includes('quarterly delta summary'),
    hasToolBash: body.includes('analyze.py') || /\bbash\b/i.test(body),
    hasToolRead: body.includes('summary.md'),
    hasAssistant: body.includes('Revenue is up') && body.includes('12%'),
    hasCodeBlock: !!document.querySelector('pre code, pre'),
    composer: !!document.querySelector('.ProseMirror[contenteditable="true"]'),
    bodyLuma: Math.round(0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]),
    missing: (window.__stubLogs || []).filter((l) => l.includes('(MISSING)')),
    errors: (window.__stubLogs || []).filter((l) => /window\.error|unhandledrejection/.test(l)),
  }
}

const failures = []
for (const theme of ['light', 'dark']) {
  const home = mkdtempSync('/tmp/bot-P5-50-mount-') // runtime dir: deleted below
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [join(here, 'electron-main.cjs'), '--disable-gpu'],
    env: { PATH: process.env.PATH, DISPLAY: process.env.DISPLAY ?? '', XAUTHORITY: process.env.XAUTHORITY ?? '', HOME: home, GROK_THEME: theme },
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.sand-agent-item', { timeout: 30_000 })
    await page.waitForFunction(() => document.body.innerText.includes('Revenue is up'), null, { timeout: 30_000 })
    await page.mouse.move(1100, 600) // park pointer on empty pane so hover toolbars don't show
    await page.waitForTimeout(1500) // persona rAF + late cards settle
    const s = await page.evaluate(probe)
    writeFileSync(join(outDir, `mount-${theme}.json`), JSON.stringify(s, null, 2))
    await page.screenshot({ path: join(outDir, `mount-${theme}.png`) })
    const expect = (ok, what) => { if (!ok) failures.push(`${theme}: ${what}`) }
    expect(s.agentNames.length === 3, `agents=${s.agentNames.length}`)
    expect(s.personaStates.length >= 3 && s.personaStates.every(Boolean), `persona states ${s.personaStates}`)
    expect(s.boundaryCount === 0, `boundary=${s.boundaryCount}`)
    for (const k of ['hasUserMsg', 'hasThinking', 'hasToolBash', 'hasToolRead', 'hasAssistant', 'hasCodeBlock', 'composer']) expect(s[k], k)
    expect(theme === 'light' ? s.bodyLuma > 180 : s.bodyLuma < 80, `bodyLuma=${s.bodyLuma}`)
    expect(s.missing.length === 0, `missing bridge ${s.missing}`)
    expect(s.errors.length === 0, `page errors ${s.errors}`)
    console.log(theme, JSON.stringify({ agents: s.agentNames, persona: s.personaStates, boundary: s.boundaryCount, luma: s.bodyLuma }))
  } finally {
    await app.close()
    rmSync(home, { recursive: true, force: true })
  }
}
if (failures.length) {
  console.error('FAIL\n' + failures.join('\n'))
  process.exit(1)
}
console.log(`PASS (evidence: ${outDir})`)
