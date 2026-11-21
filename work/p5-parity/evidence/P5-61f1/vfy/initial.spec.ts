import { test, expect } from '/tmp/bot-wt/P5-61f1/app/ui/node_modules/playwright/test'
import { launchProduct, waitProductReady } from '/tmp/bot-wt/P5-61f1/app/ui/tests/support/ui.ts'
import { writeFileSync } from 'node:fs'
const OUT='/home/lingxufeng/bot/work/p5-parity/evidence/P5-61f1/vfy'
test('dark reload initial component backgrounds',async()=>{
 const env=await launchProduct()
 try{
  await env.page.evaluate(()=>window.desktop.theme.set('dark'))
  await env.page.waitForTimeout(700)
  await env.page.addInitScript(()=>{
   window.__initial=[]
   const selectors=['.sand-prompt-shell','.sand-agents-sidebar__plugins-entry button','.sand-agents-sidebar > .sand-agents-sidebar__search','.sand-agents-sidebar__header .sand-kit-icon-button']
   const tick=()=>{
    const cover=document.querySelector('#pbots-boot')
    window.__initial.push({t:performance.now(),theme:document.documentElement.dataset.theme,cover:cover?getComputedStyle(cover).opacity:null,bg:selectors.map(s=>{const el=document.querySelector(s);return el?getComputedStyle(el).backgroundColor:null})})
    if(window.__initial.length<240)requestAnimationFrame(tick)
   };requestAnimationFrame(tick)
  })
  await env.page.reload(); await waitProductReady(env.page)
  await expect(env.page.locator('#pbots-boot')).toHaveCount(0)
  await env.page.waitForTimeout(800)
  const rows=await env.page.evaluate(()=>window.__initial)
  const stable=rows.at(-1).bg
  const bad=rows.filter(r=>r.theme==='cursor-dark'&&r.bg.every(Boolean)&&r.bg.some((v,i)=>v!==stable[i]))
  writeFileSync(OUT+'/initial-dom.json',JSON.stringify({stable,bad,rows},null,2))
  expect(bad,'dark data-theme with initial interpolated backgrounds').toEqual([])
 }finally{await env.stop()}
})
