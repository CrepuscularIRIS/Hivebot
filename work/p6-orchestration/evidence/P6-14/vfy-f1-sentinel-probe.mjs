// Static API-shape tripwire negative controls, no installed dependency mutation.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, realpathSync } from 'node:fs'
const require = createRequire(realpathSync('/tmp/bot-wt/P6-14/app/sdk/node_modules/@deepseek-ai/dsh-plugin-market/lib/index.js'))
const lib = readFileSync(require.resolve('@deepseek-ai/dsh-tools'), 'utf8')
for (const marker of ['requires a scoped context', 'names unknown global tool', 'label: "tools.restrict()"']) {
  assert.ok(lib.includes(marker), marker)
  const changedShape = lib.split(marker).join('<changed-upstream-shape>')
  assert.throws(() => assert.ok(changedShape.includes(marker)))
  console.log('PASS static sentinel baseline + negative control', marker)
}
console.log('Boundary: these are source-string shape tripwires, not complete behavioral API compatibility tests.')
