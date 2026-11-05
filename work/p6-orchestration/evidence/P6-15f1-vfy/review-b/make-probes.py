from pathlib import Path
import re
root=Path('/home/lingxufeng/bot/app/ui')
out=Path('/tmp/vfy-r-p615f1-b')
src=root/'renderer-grok/shim/src/data.ts'
s=src.read_text()
s=re.sub(r"from '([^']+)'",lambda m: "from '"+str((src.parent/m[1]).resolve())+"'" if m[1].startswith('.') else m[0],s)
s=s.replace('    deps,\n    answers,','    probe: { onFollowItem, onEventsItem, loadRoster },\n    deps,\n    answers,')
(out/'data-probe.ts').write_text(s)
(out/'vitest.config.mjs').write_text("export default {test:{include:['/tmp/vfy-r-p615f1-b/probe.test.ts'],environment:'node'}}\n")
# Copy only this task's e2e, retain original real imports; add CPU throttling and animation observations without changing product.
src=root/'tests/e2e/p6-workers.spec.ts'
s=src.read_text()
s=re.sub(r"from '([^']+)'",lambda m: "from '"+str((src.parent/m[1]).resolve())+"'" if m[1].startswith('.') else m[0],s)
s=s.replace("const OUT = evidenceOut('P6-15')", "const OUT = '/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-15f1-vfy/review-b'; mkdirSync(OUT, { recursive: true })")
s=s.replace("join(__dirname, '..', 'support', 'p6-peer-plugin.mjs')", "'/home/lingxufeng/bot/app/ui/tests/support/p6-peer-plugin.mjs'")
s=s.replace("  for (const mode of ['light', 'dark'] as const) {", "  const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });\n  for (const mode of ['light', 'dark'] as const) {")
s=s.replace('    await check?.(mode)', "    console.log('THEME-PROBE', name, mode, await page.evaluate(() => document.getAnimations().filter(a => a instanceof CSSTransition && a.playState === 'running').map(a => ({property: (a as CSSTransition).transitionProperty, time: a.currentTime}))));\n    await check?.(mode)")
s=s.replace("  await page.emulateMedia({ colorScheme: 'light' })", "  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.detach();\n  await page.emulateMedia({ colorScheme: 'light' })")
(out/'probe.spec.ts').write_text(s)
(out/'playwright.config.cjs').write_text("module.exports={testDir:'/tmp/vfy-r-p615f1-b',testMatch:'probe.spec.ts',workers:1,reporter:'list',timeout:240000,outputDir:'/tmp/vfy-r-p615f1-b/results',use:{trace:'retain-on-failure'}}\n")
