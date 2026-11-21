import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
const stub=process.argv[2], url=process.argv[3], outPrefix=process.argv[4];
const extraWait=Number(process.env.MKT_WAIT||10000);
const PROFILE='/tmp/uiw-mk-'+Date.now(), PORT=19600+Math.floor(Math.random()*100);
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
const evbuf=[];ws.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.method==='Runtime.consoleAPICalled')evbuf.push(m.params.args.map(a=>a.value??a.description??'').join(' ').slice(0,400));if(m.method==='Runtime.exceptionThrown')evbuf.push('EXC:'+(m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text||'').slice(0,500))}catch{}});
await send('Page.addScriptToEvaluateOnNewDocument',{source:await fs.readFile(stub,'utf8')});
await send('Page.navigate',{url});
await new Promise(r=>setTimeout(r,9000));
// real click on Connect apps
let r1=await send('Runtime.evaluate',{expression:`(()=>{const el=document.querySelector('[data-sidebar-marketplace]');if(!el)return 'NO';const b=el.getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2})})()`,returnByValue:true});
console.log('connect-apps:', r1.result.result.value); const bb=await send('Runtime.evaluate',{expression:'document.body.innerText.slice(0,300)',returnByValue:true});console.log('BODY:',bb.result.result.value);
if(String(r1.result.result.value).startsWith('{')){const p=JSON.parse(r1.result.result.value);await clickAt(p.x,p.y);}
await new Promise(r=>setTimeout(r,extraWait));
// settle + shots
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:799,deviceScaleFactor:1,mobile:false});
await new Promise(r=>setTimeout(r,300));
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
await new Promise(r=>setTimeout(r,600));
const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});
await fs.mkdir(outPrefix.replace(/\/[^/]*$/,''),{recursive:true});
if(shot.result?.data)await fs.writeFile(outPrefix+'.png',Buffer.from(shot.result.data,'base64'));
// optional detail click: first openable row
if(process.env.ROW_TEXT){
  let r2=await send('Runtime.evaluate',{expression:`(()=>{const el=[...document.querySelectorAll('button[aria-label^="Open"]')].find(e=>(e.getAttribute('aria-label')||'').includes('${process.env.ROW_TEXT}'));if(!el)return 'NOROW';const b=el.getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2})})()`,returnByValue:true});
  console.log('row:', r2.result.result.value);
  if(String(r2.result.result.value).startsWith('{')){const p=JSON.parse(r2.result.result.value);await clickAt(p.x,p.y);await new Promise(r=>setTimeout(r,6000));
    const s2=await send('Page.captureScreenshot',{format:'png',fromSurface:true});
    if(s2.result?.data)await fs.writeFile(outPrefix+'-detail.png',Buffer.from(s2.result.data,'base64'));}
}
// dump dialog DOM deep
const dump=await send('Runtime.evaluate',{expression:`(() => {
  const PICK=['width','height','padding','padding-top','padding-bottom','padding-inline-start','padding-inline-end','border-radius','font-size','font-weight','line-height','color','background-color','gap','min-height','box-shadow','border-top-color','border-top-width'];
  const out=[];
  const snap=(el,d,max)=>{const cs=getComputedStyle(el);
    const rec={t:el.tagName.toLowerCase(),c:(typeof el.className==='string'?el.className:'').split(/\\s+/).filter(x=>x&&(x.startsWith('sand-'))).slice(0,10),role:el.getAttribute('role')||undefined,aria:(el.getAttribute('aria-label')||'').slice(0,40)||undefined,txt:([...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim().slice(0,60))||undefined,
      rect:(()=>{const b=el.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]})(),
      s:Object.fromEntries(PICK.map(p=>[p,cs.getPropertyValue(p)]).filter(([,v])=>v&&v!=='none'&&v!=='normal'&&v!=='auto'&&v!=='medium'))};
    out.push('  '.repeat(d)+JSON.stringify(rec));
    if(d<max)for(const ch of el.children){if(ch.tagName==='SVG'||ch.tagName==='STYLE'||ch.tagName==='SCRIPT')continue;snap(ch,d+1,max)}};
  const dlg=document.querySelector('[role=dialog]');
  out.push('DLG='+(dlg?dlg.className.slice(0,60):'none'));
  if(dlg)snap(dlg,0,${process.env.DEP||10});
  out.push('TEXT::'+(dlg?dlg.innerText.replace(/\\n/g,'|').slice(0,1500):''));
  return out.join('\\n');
})()`,returnByValue:true});
await fs.writeFile(outPrefix+'.probe.txt',String(dump.result.result.value||'').slice(0,600000));
console.log(evbuf.filter(l=>l.includes('getMcp')||l.startsWith('EXC')||l.includes('malformed')).slice(-15).join('\n'));
ws.close();try{chrome.kill('SIGKILL')}catch{};process.exit(0);
