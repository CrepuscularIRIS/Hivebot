from pathlib import Path
root=Path('/tmp/bot-wt/P6-12/app/sdk')
out=Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-12/vfy')
s=(root/'tests/unit/orchestration-foundation.test.ts').read_text()
s=s.replace("from 'vitest'",f"from '{root}/node_modules/vitest/dist/index.js'")
s=s.replace("from '../../src/",f"from '{root}/src/")
delivery=(root/'src/orchestration/delivery.mjs').read_text()
variants={
 'original':delivery,
 'no-disposed':delivery.replace("      if (this.ctx.agents.get(agent.id) !== agent) throw new Error('Delivery target was disposed')",''),
 'no-inflight-cleanup':delivery.replace('      if (this.inflight.get(key) === attempt) this.inflight.delete(key)',''),
}
for name,source in variants.items():
    (out/f'delivery-{name}.mjs').write_text(source)
    test=s.replace(f"from '{root}/src/orchestration/delivery.mjs'",f"from '{out}/delivery-{name}.mjs'")
    (out/f'foundation-{name}.test.ts').write_text(test)
    (out/f'foundation-{name}.config.mjs').write_text("export default {test:{include:['"+str(out/f'foundation-{name}.test.ts')+"'],testNamePattern:'target replaced during|clears the in-flight',testTimeout:10000}}\n")
