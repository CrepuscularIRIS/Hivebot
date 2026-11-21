// click account -> click Settings menuitem -> dump settings dialog DOM+styles
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
const stub=process.argv[2], url=process.argv[3], outPrefix=process.argv[4], theme=process.argv[5]||'light', section=process.argv[6]||'';
const PROFILE='/tmp/uiw-sp-'+Date.now(), PORT=19900+Math.floor(Math.random()*100);
const chrome=spawn('/usr/bin/google-chrome',['--headless=new','--disable-gpu','--hide-scrollbars',`--user-data-dir=${PROFILE}`,`--remote-debugging-port=${PORT}`,'--no-first-run','about:blank'],{stdio:['ignore','pipe','pipe']});
chrome.stderr.on('data',()=>{});
process.on('exit',()=>{try{chrome.kill('SIGKILL')}catch{}});
async function target(){for(let i=0;i<50;i++){try{const r=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();const p=r.find(t=>t.type==='page');if(p)return p.webSocketDebuggerUrl}catch{}await new Promise(r=>setTimeout(r,200))}throw new Error('no target')}
const ws=new WebSocket(await target());await new Promise(r=>ws.onopen=r);
let seq=0;const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}};
const send=(method,params={})=>new Promise(res=>{const id=++seq;pend.set(id,res);ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pend.has(id)){pend.delete(id);res({error:'timeout'})}},25000)});
const clickAt=async(x,y)=>{for(const t of['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type:t,x,y,button:'left',clickCount:1})};
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
await send('Runtime.enable');await send('Page.enable');
const consoleLines=[];const evbuf=[];
ws.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.method==='Runtime.consoleAPICalled')evbuf.push(m.params.args.map(a=>a.value??a.description??'').join(' ').slice(0,300));if(m.method==='Runtime.exceptionThrown')evbuf.push('EXC:'+(m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text||'').slice(0,300))}catch{}});
setInterval(()=>{while(evbuf.length)consoleLines.push(evbuf.shift())},100);
await send('Page.addScriptToEvaluateOnNewDocument',{source:await fs.readFile(stub,'utf8')});
await send('Page.navigate',{url});
await new Promise(r=>setTimeout(r,9500));
// 1) account menu
let r1=await send('Runtime.evaluate',{expression:`(()=>{const el=[...document.querySelectorAll('button')].find(e=>(e.textContent||'').includes('Stub Dev'));if(!el)return 'NOBTN';const b=el.getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2})})()`,returnByValue:true});
if(String(r1.result.result.value).startsWith('{')){const p=JSON.parse(r1.result.result.value);await clickAt(p.x,p.y);await new Promise(r=>setTimeout(r,1800));}
// 2) Settings item
let r2=await send('Runtime.evaluate',{expression:`(()=>{const el=[...document.querySelectorAll('[role=menuitem],button,[role=menu] *')].find(e=>e.children.length===0&&(e.textContent||'').trim()==='Settings');if(!el)return 'NOSET';const b=el.getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2})})()`,returnByValue:true});
console.log('settings item:', r2.result.result.value);
if(String(r2.result.result.value).startsWith('{')){const p=JSON.parse(r2.result.result.value);await clickAt(p.x,p.y);await new Promise(r=>setTimeout(r,Number(process.env.AFTER_SET||3000)));}
// 3) optional nav section click
if(section){
  let r3=await send('Runtime.evaluate',{expression:`(()=>{const el=[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||'')==='${section}'||(e.textContent||'').trim().toLowerCase().includes('${section.toLowerCase()}'));if(!el)return 'NOSEC';const b=el.getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2})})()`,returnByValue:true});
  console.log('section:', r3.result.result.value);
  if(String(r3.result.result.value).startsWith('{')){const p=JSON.parse(r3.result.result.value);await clickAt(p.x,p.y);await new Promise(r=>setTimeout(r,2500));}
}
// settle & shot
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:799,deviceScaleFactor:1,mobile:false});
await new Promise(r=>setTimeout(r,300));
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
await new Promise(r=>setTimeout(r,500));
const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});
await fs.mkdir(outPrefix.replace(/\/[^/]*$/,''),{recursive:true});
if(shot.result?.data)await fs.writeFile(outPrefix+'.png',Buffer.from(shot.result.data,'base64'));
// 4) dump dialog tree with styles
const chk=await send('Runtime.evaluate',{expression:`JSON.stringify({gpane: performance.getEntriesByType('resource').some(r=>r.name.includes('chunk-general-pane')), paneHtmlLen: document.querySelector('[class*=sand-settings-panel]')?.innerHTML.length||0})`,returnByValue:true});console.log('CHK:', chk.result.result.value);
const dump=await send('Runtime.evaluate',{expression:`(() => {
  const PICK=['width','height','min-height','padding','padding-top','padding-bottom','padding-inline-start','padding-inline-end','border-radius','border-top-left-radius','font-size','font-weight','line-height','letter-spacing','font-family','color','background-color','gap','margin-top','box-shadow','border-top-color','border-top-width'];
  const out=[];
  const snap=(el,d,max)=>{
    const cs=getComputedStyle(el);
    const rec={t:el.tagName.toLowerCase(),c:(typeof el.className==='string'?el.className:'').split(/\\s+/).filter(x=>x&&(x.startsWith('sand-')||x.startsWith('ui-'))).slice(0,12),role:el.getAttribute('role')||undefined,aria:(el.getAttribute('aria-label')||'').slice(0,36)||undefined,txt:([...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim().slice(0,60))||undefined,
      rect:(()=>{const b=el.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]})(),
      s:Object.fromEntries(PICK.map(p=>[p,cs.getPropertyValue(p)]).filter(([,v])=>v&&v!=='none'&&v!=='normal'&&v!=='auto'&&v!=='medium'))};
    out.push('  '.repeat(d)+JSON.stringify(rec));
    if(d<max)for(const ch of el.children){if(ch.tagName==='SVG'||ch.tagName==='STYLE'||ch.tagName==='SCRIPT')continue;snap(ch,d+1,max)}
  };
  const dlgs=document.querySelectorAll('[role=dialog]');
  out.push('dialogs='+dlgs.length+' sandEls='+document.querySelectorAll('[class*=sand-]').length);
  dlgs.forEach((d,i)=>{out.push('=== dialog '+i); snap(d,0,${process.env.DEP||6});});
  const dlg=document.querySelector("[role=dialog]");out.push("DLGTEXT::"+(dlg?dlg.innerText.slice(0,2000):"none"));
  return out.join('\\n');
})()`,returnByValue:true});
await fs.writeFile(outPrefix+'.probe.txt',String(dump.result.result.value||'').slice(0,500000));
console.log('=== console tail ===');console.log(consoleLines.filter(l=>l.includes('STUB')).slice(-60).join('\n'));
console.log('done', outPrefix);
ws.close();try{chrome.kill('SIGKILL')}catch{};process.exit(0);
