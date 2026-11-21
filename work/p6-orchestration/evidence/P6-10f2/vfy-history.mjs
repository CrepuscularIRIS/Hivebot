import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const wt='/tmp/bot-wt/P6-10f2'
const git=(...a)=>execFileSync('git',['-C',wt,...a],{encoding:'utf8'})
const file='app/sdk/tests/unit/orchestration-foundation.test.ts'
const historical=git('show','2746c31:'+file),base=git('show','29c6b1a:'+file),head=readFileSync(wt+'/'+file,'utf8')
const titles=s=>[...s.matchAll(/\bit\('([^']+)'/g)].map(m=>m[1])
const old=titles(historical),before=titles(base),now=titles(head)
const restored=old.filter(x=>!before.includes(x)&&!x.startsWith('re-exports'))
assert.equal(restored.length,6)
for(const x of restored){assert.ok(now.includes(x));console.log('RESTORED '+x)}
assert.deepEqual(before.filter(x=>!now.includes(x)),[])
console.log('P6-10 baseline literal titles retained='+before.length+'/'+before.length)
const log=readFileSync('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-10f2/vfy-sdk-95.log','utf8')
for(const f of ['orchestration-foundation.test.ts','orchestration-foundation-delivery.test.ts','orchestration-create.test.ts']){
 const lines=log.split('\n').filter(l=>l.includes('✓ tests/unit/'+f+' > '));console.log('EXECUTED '+f+' '+lines.length);assert.equal(lines.length,f==='orchestration-foundation.test.ts'?56:f==='orchestration-foundation-delivery.test.ts'?2:37)
}
const names=git('diff','--name-only','29c6b1a..HEAD').trim().split('\n');assert.equal(names.length,11)
assert.ok(!names.some(x=>/\/send\.[^/]*$|\/index\.mjs$|\/slots\.mjs$/.test(x)))
assert.equal(git('diff','29c6b1a..HEAD','--','app/sdk/src/orchestration/slots.mjs'),'')
console.log('DIFF 11 files; send.*/index.mjs/slots.mjs untouched; slots API identical')
console.log('HEAD '+git('rev-parse','HEAD').trim())
