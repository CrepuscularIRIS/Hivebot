import { test, expect } from '/tmp/bot-wt/P5-61f1/app/ui/node_modules/playwright/test'
import { launchProduct, waitProductReady } from '/tmp/bot-wt/P5-61f1/app/ui/tests/support/ui.ts'
import { tmkdir } from '/tmp/bot-wt/P5-61f1/app/ui/tests/support/tmp-sweep.ts'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
const OUT='/home/lingxufeng/bot/work/p5-parity/evidence/P5-61f2/vfy'
const snap = (page:any) => page.evaluate(async()=>({theme:await window.desktop.theme.get(), attr:document.documentElement.dataset.theme, scheme:document.documentElement.style.colorScheme, media:matchMedia('(prefers-color-scheme: dark)').matches, saved:localStorage.getItem('pbots.shim.theme-preference')}))
test('fresh system / dynamic follow / same preference no mirror write / corrupt preference / CLI', async()=>{
 test.setTimeout(240000)
 const home=tmkdir('bot-p561f2-edge-')
 let env=await launchProduct({home,extraArgs:['--remote-debugging-port=19362']})
 let attached=false
 const report:any={}
 const cli=(args:string[])=>execFileSync('/home/lingxufeng/.npm-global/bin/playwright-cli',['-s=p561f2-vfy',...args],{env:{...process.env,HOME:home},cwd:OUT,encoding:'utf8',timeout:30000})
 const file=join(home,'data','theme-source')
 const mirror=()=>({content:readFileSync(file,'utf8'),mtime:statSync(file,{bigint:true}).mtimeNs.toString()})
 try{
  report.fresh=await snap(env.page)
  expect(report.fresh.saved).toBeNull()
  expect(report.fresh.theme.preference).toBe('system')
  expect(report.fresh.theme.resolved).toBe(report.fresh.media?'dark':'light')
  expect(report.fresh.attr).toBe(`cursor-${report.fresh.theme.resolved}`)
  expect(report.fresh.scheme).toBe(report.fresh.theme.resolved)
  await expect.poll(()=>mirror().content).toBe('system')
  report.systemMirror=mirror(); report.flips=[]
  // Electron automation starts with Playwright's default light media override; nativeTheme probing must clear it (theme-dual uses the same reset).
  await env.page.emulateMedia({colorScheme:null})
  await env.page.waitForTimeout(350)
  report.afterClearEmulation=await snap(env.page)
  for(const mode of ['dark','light','dark'] as const){
   await env.shell.app.evaluate(({nativeTheme},m)=>{nativeTheme.themeSource=m},mode)
   await expect(env.page.locator('html')).toHaveAttribute('data-theme',`cursor-${mode}`)
   await env.page.waitForTimeout(350)
   const s=await snap(env.page); expect(s.theme.preference).toBe('system'); expect(s.saved).toBeNull(); expect(s.theme.resolved).toBe(mode)
   expect(mirror()).toEqual(report.systemMirror)
   report.flips.push({state:s,mirror:mirror()})
  }
  await env.page.reload(); await waitProductReady(env.page); await env.page.waitForTimeout(350)
  report.reload=await snap(env.page); expect(report.reload.theme.preference).toBe('system'); expect(report.reload.saved).toBeNull(); expect(mirror()).toEqual(report.systemMirror)
  // Bad path: damaged persisted preference must fall back to system, never persist an invalid fixed value.
  await env.page.evaluate(()=>localStorage.setItem('pbots.shim.theme-preference','neon'))
  await env.page.reload(); await waitProductReady(env.page)
  report.corrupt=await snap(env.page); expect(report.corrupt.theme.preference).toBe('system')
  expect(report.corrupt.theme.resolved).toBe(report.corrupt.media?'dark':'light')
  expect(mirror()).toEqual(report.systemMirror)
  // Same explicit preference set + repeated reload must not rewrite the host mirror.
  await env.page.evaluate(()=>window.desktop.theme.set('dark')); await env.page.waitForTimeout(350)
  const before=mirror(); report.fixedMirror=before; report.same=[]
  for(let i=0;i<3;i++){
   await env.page.evaluate(()=>window.desktop.theme.set('dark'))
   await env.page.reload(); await waitProductReady(env.page); await env.page.waitForTimeout(250)
   expect(mirror()).toEqual(before); report.same.push(mirror())
  }
  writeFileSync(join(OUT,'cli-attach.txt'),cli(['attach','--cdp=http://127.0.0.1:19362'])); attached=true
  writeFileSync(join(OUT,'cli-snapshot.txt'),cli(['snapshot']))
  writeFileSync(join(OUT,'cli-account.txt'),cli(['click','button[aria-label="Account"]']))
  cli(['screenshot','--filename='+join(OUT,'cli-account-dark.png')]); cli(['press','Escape'])
  await env.page.evaluate(()=>window.desktop.theme.set('light')); await env.page.waitForTimeout(500)
  cli(['screenshot','--filename='+join(OUT,'cli-light.png')])
  cli(['detach']); attached=false
  // True process restart with no persisted preference, not just renderer reload.
  await env.page.evaluate(()=>localStorage.removeItem('pbots.shim.theme-preference'))
  await env.page.evaluate(()=>window.desktop.theme.set('system'))
  await env.page.evaluate(()=>localStorage.removeItem('pbots.shim.theme-preference'))
  await env.page.waitForTimeout(250); await env.stop()
  env=await launchProduct({home})
  report.restart=await snap(env.page)
  expect(report.restart.saved).toBeNull(); expect(report.restart.theme.preference).toBe('system')
  expect(report.restart.theme.resolved).toBe(report.restart.media?'dark':'light')
  report.restartHost=await env.shell.app.evaluate(({nativeTheme})=>({source:nativeTheme.themeSource,dark:nativeTheme.shouldUseDarkColors}))
  expect(report.restartHost.source).toBe('system')
  await env.page.emulateMedia({colorScheme:null}); await env.page.waitForTimeout(350)
  report.restartWithoutAutomationOverride=await snap(env.page)
  expect(report.restartWithoutAutomationOverride.theme.preference).toBe('system')
  expect(report.restartWithoutAutomationOverride.saved).toBeNull()
  expect(report.restartWithoutAutomationOverride.theme.resolved).toBe(report.restartHost.dark?'dark':'light')
 }finally{
  writeFileSync(join(OUT,'edge.json'),JSON.stringify(report,null,2))
  if(attached)cli(['detach'])
  await env.stop()
 }
})
