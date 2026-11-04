import { test, expect } from '/tmp/bot-wt/P5-61f1/app/ui/node_modules/playwright/test'
import { launchProduct, waitProductReady } from '/tmp/bot-wt/P5-61f1/app/ui/tests/support/ui.ts'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
const OUT='/home/lingxufeng/bot/work/p5-parity/evidence/P5-61f1/vfy'
const set=(page:any, mode:string)=>page.evaluate(v=>window.desktop.theme.set(v),mode)
test('mirror stable reload + native/page divergence + invalid IPC + CLI UI', async()=>{
 test.setTimeout(180000)
 const env=await launchProduct({extraArgs:['--remote-debugging-port=19361']})
 let attached=false
 const cli=(args:string[])=>execFileSync('/home/lingxufeng/.npm-global/bin/playwright-cli',['-s=p561f1-vfy',...args],{env:{...process.env,HOME:env.shell.home},cwd:OUT,encoding:'utf8',timeout:30000})
 try{
  const initialDivergence={host:await env.shell.app.evaluate(({nativeTheme})=>({source:nativeTheme.themeSource,dark:nativeTheme.shouldUseDarkColors})),page:await env.page.evaluate(()=>({dark:matchMedia('(prefers-color-scheme: dark)').matches,theme:document.documentElement.dataset.theme}))}
  const file=join(env.shell.home,'data','theme-source')
  const get=()=>({content:readFileSync(file,'utf8'),mtime:statSync(file,{bigint:true}).mtimeNs.toString()})
  await set(env.page,'dark'); await env.page.waitForTimeout(300)
  const before=get(); const reloads=[]
  for(let i=0;i<4;i++){await env.page.reload(); await waitProductReady(env.page); await env.page.waitForTimeout(350); reloads.push(get()); expect(get()).toEqual(before)}
  // Invalid trusted-main-frame input must not overwrite preference/mirror.
  await env.page.evaluate(()=>{window.pbots.window.setTheme({preference:'evil',resolved:'light'}); window.pbots.window.setTheme({preference:'light',resolved:'evil'})})
  await env.page.waitForTimeout(250); expect(get()).toEqual(before); const invalid=get()
  await set(env.page,'system'); await env.page.emulateMedia({colorScheme:null}); await env.page.waitForTimeout(350)
  const divergence={host:await env.shell.app.evaluate(({nativeTheme})=>({source:nativeTheme.themeSource,dark:nativeTheme.shouldUseDarkColors})),page:await env.page.evaluate(()=>({dark:matchMedia('(prefers-color-scheme: dark)').matches,theme:document.documentElement.dataset.theme}))}
  await env.shell.app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='dark'})
  await expect(env.page.locator('html')).toHaveAttribute('data-theme','cursor-dark')
  await env.page.waitForTimeout(700)
  expect(await env.shell.app.evaluate(({nativeTheme})=>nativeTheme.themeSource)).toBe('dark')
  const systemMirror=get()
  await env.shell.app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='light'})
  await expect(env.page.locator('html')).toHaveAttribute('data-theme','cursor-light')
  await env.page.waitForTimeout(700); expect(get()).toEqual(systemMirror)
  // Real CLI browser actions against only this Xvfb Electron via CDP.
  writeFileSync(join(OUT,'cli-attach.txt'),cli(['attach','--cdp=http://127.0.0.1:19361'])); attached=true
  writeFileSync(join(OUT,'cli-snapshot.txt'),cli(['snapshot']))
  writeFileSync(join(OUT,'cli-account.txt'),cli(['click','button[aria-label="Account"]']))
  writeFileSync(join(OUT,'cli-menu.txt'),cli(['snapshot']))
  cli(['screenshot','--filename='+join(OUT,'cli-account-light.png')])
  cli(['press','Escape'])
  await set(env.page,'dark'); await env.page.waitForTimeout(700)
  cli(['screenshot','--filename='+join(OUT,'cli-dark.png')])
  writeFileSync(join(OUT,'mirror-divergence.json'),JSON.stringify({before,reloads,invalid,initialDivergence,divergence,systemMirror},null,2))
 }finally{
  if(attached) cli(['detach'])
  await env.stop()
 }
})
