import { test } from '/home/lingxufeng/bot/app/ui/node_modules/playwright/test'
import { launchShell } from '/home/lingxufeng/bot/app/ui/tests/support/launch'
import { launchSdkRuntime, fakeOverlayPath } from '/home/lingxufeng/bot/app/ui/tests/support/sdk-runtime'
import { PRESETS_PATCH, waitProductReady } from '/home/lingxufeng/bot/app/ui/tests/support/ui'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
test('p561 context menu and outline diagnostic', async () => {
  const home=mkdtempSync('/tmp/bot-p561-ui-'); const runtimeHome=join(home,'runtime');mkdirSync(runtimeHome)
  const rt=await launchSdkRuntime({home:runtimeHome,cwd:home,dataDir:join(home,'data'),patch:`${PRESETS_PATCH}:${fakeOverlayPath()}`})
  let shell: Awaited<ReturnType<typeof launchShell>>|undefined
  try {
    const id=randomUUID();await rt.client.call('session/create',{request:{sessionId:id}});await rt.client.call('session/rename',{request:{sessionId:id,title:'Main Bot'}})
    shell=await launchShell({home,env:{PBOTS_DSH_HANDOFF:rt.handoff},extraArgs:['--remote-debugging-port=9561']});await waitProductReady(shell.page)
    await shell.page.locator('.sand-agent-item[aria-label="Main Bot"]').click()
    writeFileSync(join(__dirname,'ui-ready.json'),JSON.stringify({home,display:process.env.DISPLAY,pid:shell.app.process().pid}))
    for(let i=0;i<240&&!existsSync(join(__dirname,'ui-stop'));i++)await new Promise(r=>setTimeout(r,500))
  } finally {if(shell)await shell.stop();await rt.stop();try{execFileSync('/home/lingxufeng/bot/scripts/bot-reap',['--match','bot-p561-ui-'],{stdio:'pipe'})}catch{}}
})
