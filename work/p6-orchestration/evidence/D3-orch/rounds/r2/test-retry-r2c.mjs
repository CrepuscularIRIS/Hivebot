import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../../run.mjs', import.meta.url), 'utf8')
const fn = source.slice(source.indexOf('function retry429Delay('), source.indexOf('\n}', source.indexOf('function retry429Delay(')) + 2)
const retry429Delay = new Function(`${fn}; return retry429Delay`)()
assert.equal(retry429Delay('429 retry-after: 2', 0), 30000)
assert.equal(retry429Delay('429 Try again in 10428 seconds', 0), null)
assert.equal(retry429Delay('429 retry-after: 90', 1), 90000)
assert.equal(retry429Delay('429', 2), 30000)
assert.equal(retry429Delay('429', 3), null)
assert.equal(retry429Delay('429 retry-after: 900', 0), 900000)
assert.equal(retry429Delay('429 retry-after: 1000', 0), null)
console.log('PASS: 7 bounded 429 retry checks')
