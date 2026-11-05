from pathlib import Path
root = Path('/tmp/bot-wt/P6-12/app/sdk')
out = Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-12/vfy')
orig = (root/'tests/unit/orchestration-report-live.test.ts').read_text()
s = orig[:orig.index("describe('P6-12 live")]
s += orig[orig.index("import { spawn,"):orig.index("describe('P6-12 crash & restart")]
helpers = orig[orig.index('  const cRead ='):orig.index("  it('(i) crashAt")]
s += "describe('Verifier three-item crash batches', () => {\n" + helpers
s += '''
  for (const point of ['report-before-send', 'report-after-send', 'report-before-splice', 'claim']) {
    it(point + ': three keys, one batch, exactly once after restart', { timeout: 180_000 }, async () => {
      let rt1, rt2
      try {
        rt1 = await crashBoot(point === 'claim' ? undefined : point)
        const M = ((await rt1.client.call('session/create', { request: { agentPreset: 'standard' } }))).sessionId
        const ws = []
        for (let i=0; i<3; i++) ws.push(((await rt1.client.call('session/create', { request: { agentPreset: 'standard' } }))).sessionId)
        mkdirSync(join(crashHome, 'gates'), {recursive:true})
        writeFileSync(join(crashData,'bots.json'), JSON.stringify({version:1,mainBotId:M,recipes:{},bots:Object.fromEntries(ws.map(w=>[w,{createdBy:M}]))}))
        ws.forEach((w,i)=>writeFileSync(join(crashHome,'fake','scripts',w+'.json'), JSON.stringify({calls:[text('batch result '+i)]})))
        // Consecutive send calls in one main turn; the final gate ensures all three are due before crash.
        writeFileSync(join(crashHome,'fake','scripts',M+'.json'), JSON.stringify({calls:[...ws.map((w,i)=>sendCall('s'+i,w,'task '+i)),gatedText('batch-'+point)]}))
        if(point==='claim') await rt1.client.call('p610/control',{request:{op:'arm-claim-crash',armed:true}})
        await cPrompt(rt1,M,'delegate three')
        await cUntil(rt1,async()=>{
          for(const w of ws) if(!(await cRead(rt1,w)).some(e=>e.type==='turn/end')) return false
          return (await cRead(rt1,M)).filter(e=>e.type==='tool/result').length===3
        },'all three workers complete')
        const keys = (await cRead(rt1,M)).filter(e=>e.type==='tool/result' && !e.isError).map(e=>JSON.parse(e.text).assignmentId+':end').sort()
        expect(keys).toHaveLength(3)
        const exited = new Promise(resolve=>rt1.child.once('exit',resolve))
        writeFileSync(join(crashHome,'gates','batch-'+point),'1')
        await exited
        expect(rt1.child.exitCode).toBe(point==='claim'?88:87)
        rt1.client.close()
        writeFileSync(join(crashHome,'fake','scripts',M+'.json'), JSON.stringify({calls:[text('receive three after restart'),text('should not consume twice')]}))
        rt2 = await crashBoot()
        await cUntil(rt2,async()=>{
          const log = await cRead(rt2,M)
          return keys.every(k=>keyCount(log,k)===1)
        },'all three report keys consumed once')
        await sleep(3500)
        const log = await cRead(rt2,M)
        const batch = log.filter(e=>e.type==='user/message' && e.sourceKind==='pbots-worker')
        expect(batch).toHaveLength(1)
        expect(batch[0].items.map(i=>i.key).sort()).toEqual(keys)
        expect(batch[0].items.every(i=>i.outcome==='completed')).toBe(true)
        for (const key of keys) expect(keyCount(log,key)).toBe(1)
        console.log('CRASH_BATCH evidence',JSON.stringify({point,exit:rt1.child.exitCode,reports:batch.length,keys,items:batch[0].items}))
      } finally {
        if(rt2) await crashStop(rt2)
        if(rt1) await crashStop(rt1)
      }
    })
  }
})
'''
s = s.replace("from 'vitest'", f"from '{root}/node_modules/vitest/dist/index.js'")
s = s.replace("from '../support/", f"from '{root}/tests/support/")
s = s.replace("from '../../examples/", f"from '{root}/examples/")
s = s.replace("const PKG_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..')", f"const PKG_ROOT = '{root}'")
(out/'crash-probe.test.ts').write_text(s)
(out/'crash-probe.config.mjs').write_text("export default { test: { include: ['" + str(out/'crash-probe.test.ts') + "'], setupFiles: ['" + str(root/'tests/support/tmp-sweep.setup.ts') + "'], testTimeout: 120000, hookTimeout: 120000, fileParallelism: false } }\n")
