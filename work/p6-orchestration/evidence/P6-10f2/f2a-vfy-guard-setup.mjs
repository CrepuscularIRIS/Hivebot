import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
const evidence = '/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f2'
for (const [label, sdk] of [['branch', '/tmp/bot-wt/P6-10f2/app/sdk'], ['base', '/tmp/bot-p610f2a-verify/base/app/sdk']]) {
  const home = `/tmp/bot-p610f2a-verify/guard-${label}`
  mkdirSync(home, { recursive: true })
  let text = readFileSync(join(sdk, 'tests/e2e/guard-fs.test.ts'), 'utf8')
  const source = text
  text = text.replace("const TEST_HOME = '/home/lingxufeng/bot/.test-homes/p5-02'", `const TEST_HOME = ${JSON.stringify(home)}`)
  text = text.replace("const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')", `const PKG_ROOT = ${JSON.stringify(sdk)}`)
  text = text.replace(/from '([^']+)'/g, (whole, specifier) => {
    if (specifier === 'vitest') return `from '${sdk}/node_modules/vitest/dist/index.js'`
    if (specifier.startsWith('.')) return `from '${resolve(sdk, 'tests/e2e', specifier)}'`
    return whole
  })
  assert.notEqual(source, text)
  writeFileSync(join(evidence, `f2a-vfy-guard-${label}.test.ts`), text)
  writeFileSync(join(evidence, `f2a-vfy-guard-${label}.config.mjs`), `export default ${JSON.stringify({ root: sdk, test: { include: [join(evidence, `f2a-vfy-guard-${label}.test.ts`)], setupFiles: [join(sdk, 'tests/support/tmp-sweep.setup.ts')], testTimeout: 120000, hookTimeout: 120000 } })}\n`)
  console.log(`Prepared ${label}: original spec body unchanged, only temporary HOME and module/PKG_ROOT anchors substituted; sdk=${sdk}`)
}
