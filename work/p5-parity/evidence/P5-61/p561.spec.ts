import { test, expect } from '/home/lingxufeng/bot/app/ui/node_modules/playwright/test'
import { launchShell } from '/home/lingxufeng/bot/app/ui/tests/support/launch'
import { launchSdkRuntime, fakeOverlayPath } from '/home/lingxufeng/bot/app/ui/tests/support/sdk-runtime'
import { PRESETS_PATCH, textCall, toolCall, waitProductReady } from '/home/lingxufeng/bot/app/ui/tests/support/ui'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
const OUT = __dirname
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

test('p561 diagnostic live shell', async () => {
  const home = mkdtempSync('/tmp/bot-p561-home-')
  const runtimeHome = join(home, 'runtime'); mkdirSync(runtimeHome)
  const workspace = join(home, 'workspace'); mkdirSync(workspace)
  const peer = join(home, 'peer.yml')
  writeFileSync(peer, `- insert:\n    - id: p615-peer\n      name: '${pathToFileURL('/home/lingxufeng/bot/app/ui/tests/support/p6-peer-plugin.mjs').href}'\n`)
  const rt = await launchSdkRuntime({ home: runtimeHome, cwd: workspace, dataDir: join(home,'data'), patch: `${PRESETS_PATCH}:${fakeOverlayPath()}:${peer}` })
  const ids = { main: randomUUID(), worker: randomUUID(), blocked: randomUUID() }
  for (const [key, id] of Object.entries(ids)) {
    await rt.client.call('session/create', { request: { sessionId: id } })
    await rt.client.call('session/rename', { request: { sessionId: id, title: key === 'main' ? 'Main Bot' : key === 'worker' ? 'Test fixer' : 'Doc writer' } })
  }
  mkdirSync(join(home,'data'),{recursive:true})
  writeFileSync(join(home,'data','bots.json'), JSON.stringify({version:1,mainBotId:ids.main,recipes:{},bots:{[ids.worker]:{createdBy:ids.main},[ids.blocked]:{createdBy:ids.main}}}))
  // Start window-only recorder immediately after the target X window is mapped.
  const recorder = spawn('bash',['-c', `for i in $(seq 1 600); do W=$(xdotool search --onlyvisible --name '^Grok Bot$' 2>/dev/null | tr '\\n' ' '); for w in $W; do width=$(xdotool getwindowgeometry --shell $w | grep '^WIDTH=' | cut -d= -f2); if [ "$width" -gt 500 ]; then printf '%s\\n' "$w" > '${OUT}/window-id.txt'; exec ffmpeg -hide_banner -loglevel warning -f x11grab -window_id "$w" -draw_mouse 0 -framerate 20 -i "$DISPLAY" -t 150 -c:v libx264 -preset ultrafast -crf 18 -y '${OUT}/window.mp4'; fi; done; sleep 0.02; done`], {stdio:['ignore','ignore','pipe']})
  let recerr=''; recorder.stderr!.on('data',d=>recerr+=d)
  let shell: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
    shell = await launchShell({home,env:{PBOTS_DSH_HANDOFF:rt.handoff},extraArgs:['--remote-debugging-port=9561']})
    const page=shell.page
    await waitProductReady(page)
    await page.locator('.sand-agent-item[aria-label="Main Bot"]').click()
    await page.waitForTimeout(1000)
    writeFileSync(join(OUT,'ready.json'), JSON.stringify({home,ids,display:process.env.DISPLAY,pid:shell.app.process().pid,time:Date.now()}))
    // UI is now driven using playwright-cli via CDP. Commands below only deliver worker state changes.
    let seen=''
    for(let i=0;i<1800;i++) {
      if(existsSync(join(OUT,'stop'))) break
      if(existsSync(join(OUT,'command'))) {
        const command=readFileSync(join(OUT,'command'),'utf8').trim()
        if(command!==seen) {
          seen=command
          if(command==='run') {
            rt.writeScriptCalls(ids.worker,[textCall(['Running the suite…',' tests passed.'],{gateId:'p561-gate'})])
            rt.writeScriptCalls(ids.blocked,[toolCall('bash',{command:'git push origin main',description:'publish docs'},'p561-push'),textCall(['Done.'])])
            for(const id of [ids.worker,ids.blocked]) await rt.client.call('p615/control',{request:{op:'deliver',sessionId:id,id:`pbots-assign:${id}`,text:'Check this project.',source:{kind:'pbots-main',assignmentId:id,mainBotId:ids.main}}})
          }
          if(command==='finish') { mkdirSync(join(runtimeHome,'gates'),{recursive:true});writeFileSync(join(runtimeHome,'gates','p561-gate'),'') }
          writeFileSync(join(OUT,'command-done'),command)
        }
      }
      await delay(300)
    }
  } finally {
    if(shell) await shell.stop()
    await rt.stop()
    recorder.kill('SIGINT')
    await Promise.race([new Promise(r=>recorder.once('exit',r)),delay(3000)])
    writeFileSync(join(OUT,'recorder.log'),recerr)
    // Launcher can orphan dsh; only reap this task's sandbox paths.
    try { execFileSync('/home/lingxufeng/bot/scripts/bot-reap',['--match','p561'],{stdio:'pipe'}) } catch {}
  }
})
