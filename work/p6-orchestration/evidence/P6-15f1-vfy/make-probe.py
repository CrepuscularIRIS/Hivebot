from pathlib import Path
import re

ROOT = Path('/tmp/bot-wt/P6-15f1/app/ui')
OUT = Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-15f1-vfy')
source = ROOT / 'tests/e2e/p6-workers.spec.ts'
s = source.read_text()
s = re.sub(r"from '(\.[^']+)'", lambda m: "from '" + str((source.parent / m.group(1)).resolve()) + "'", s)
s = s.replace("from 'playwright/test'", f"from '{ROOT}/node_modules/playwright/test.js'")
s = s.replace("import { randomUUID }", "import { execFileSync } from 'node:child_process'\nimport { randomUUID }")
s = s.replace("const OUT = evidenceOut('P6-15')", f"const OUT = '{OUT}/probe-frames'\nmkdirSync(OUT, {{ recursive: true }})")
s = s.replace("join(__dirname, '..', 'support', 'p6-peer-plugin.mjs')", f"'{ROOT}/tests/support/p6-peer-plugin.mjs'")
s = s.replace("launchShell({ home, env:", "launchShell({ home, extraArgs: ['--remote-debugging-port=19351'], env:")
needle = "    await single.locator('button[aria-label^=\"Open Test fixer\"]').click()\n    await active(page, 'Test fixer')"
replacement = """    // 独立探针：已读 worker 在折叠 Done 不可见 → 回报 Open → Workers 活跃行；离开后再归档，再打开仍成立。
    await expect(header(page, `pbots:done:${M}`)).toHaveAttribute('aria-expanded', 'false')
    await expect(rowIn(page, `pbots:workers:${M}`, 'Test fixer')).toHaveCount(0)
    await expect(page.locator('.sand-agent-item[aria-label="Test fixer"]')).toHaveCount(0)
    await single.locator('button[aria-label^="Open Test fixer"]').click()
    await active(page, 'Test fixer')
    await expect(rowIn(page, `pbots:workers:${M}`, 'Test fixer')).toHaveAttribute('data-active', 'true')
    await expect(rowIn(page, `pbots:done:${M}`, 'Test fixer')).toHaveCount(0)
    await page.locator('.sand-agent-item[aria-label="Main Bot"]').click()
    await active(page, 'Main Bot')
    await expect(rowIn(page, `pbots:workers:${M}`, 'Test fixer')).toHaveCount(0)
    await single.locator('button[aria-label^="Open Test fixer"]').focus()
    await page.keyboard.press('Enter')
    await expect(rowIn(page, `pbots:workers:${M}`, 'Test fixer')).toHaveAttribute('data-active', 'true')
    console.log('INDEPENDENT read-worker Open -> Workers -> leave -> Done -> keyboard Open -> Workers: PASS')"""
assert needle in s
s = s.replace(needle, replacement)
needle = "      denyRows.push([mode, rows[0]!.ratio, rows[0]!.fg, rows[0]!.bg])"
replacement = needle + """
      if (mode === 'dark') {
        const cli = (...args: string[]) => execFileSync('/home/lingxufeng/.npm-global/bin/playwright-cli', ['-s=p615f1-vfy', ...args], { cwd: OUT, encoding: 'utf8', timeout: 45000 })
        try {
          console.log(cli('attach', '--cdp=http://127.0.0.1:19351'))
          console.log(cli('snapshot', '--filename=../cli-dock-snapshot.yaml'))
          console.log(cli('screenshot', '--filename=../cli-worker-dock-dark.png'))
        } finally { console.log(cli('detach')) }
      }"""
assert needle in s
s = s.replace(needle, replacement)
(OUT / 'independent.spec.ts').write_text(s)
(OUT / 'probe.config.ts').write_text(f"import {{ defineConfig }} from '{ROOT}/node_modules/playwright/test.js'\nexport default defineConfig({{ testDir: '{OUT}', testMatch: 'independent.spec.ts', workers: 1, timeout: 240000 }})\n")
print('Created independent.spec.ts and probe.config.ts; product source unchanged.')
