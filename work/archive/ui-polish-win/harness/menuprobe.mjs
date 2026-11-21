// quick: click account, dump menu DOM
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
const PROFILE='/tmp/uiw-mp-'+Date.now(), PORT=19700+Math.floor(Math.random()*200);
const chrome=spawn('/usr/bin/google-chrome',['--headless=new','--disable-gpu','--hide-scrollbars',`--user-data-dir=${PROFILE}`,`--remote-debugging-port=${PORT}`,'--no-first-run','about:blank'],{stdio:['ignore','pipe','pipe']});
chrome.stderr.on('data',()=>{});
process.on('exit',()=>{try{chrome.kill('SIGKILL')}catch{}});
async function target(){for(let i=0;i<50;i++){try{const r=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();const p=r.find(t=>t.type==='page');if(p)return p.webSocketDebuggerUrl}catch{}await new Promise(r=>setTimeout(r,200))}throw new Error('no target')}
const ws=new WebSocket(await target());await new Promise(r=>ws.onopen=r);
let seq=0;const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}};
const send=(method,params={})=>new Promise(res=>{const id=++seq;pend.set(id,res);ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pend.has(id)){pend.delete(id);res({error:'timeout'})}},15000)});
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
await send('Runtime.enable');await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument',{source:await fs.readFile(process.argv[2],'utf8')});
await send('Page.navigate',{url:process.argv[3]});
await new Promise(r=>setTimeout(r,9000));
// click Stub Dev
let loc=await send('Runtime.evaluate',{expression:`(()=>{const els=[...document.querySelectorAll('button')];const el=els.find(e=>(e.textContent||'').includes('Stub Dev'));if(!el)return 'no';const r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`,returnByValue:true});
const p=JSON.parse(loc.result.result.value);
for(const t of['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type:t,x:p.x,y:p.y,button:'left',clickCount:1});
await new Promise(r=>setTimeout(r,1800));
const dump=await send('Runtime.evaluate',{expression:`(()=>{const out=[];const walk=(el,d)=>{if(d>7)return;const cs=getComputedStyle(el);out.push('  '.repeat(d)+el.tagName.toLowerCase()+' cls='+(typeof el.className==='string'?el.className.slice(0,90):'')+' role='+(el.getAttribute('role')||'')+' aria='+(el.getAttribute('aria-label')||'').slice(0,30)+' txt='+[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('').slice(0,40));[...el.children].forEach(c=>walk(c,d+1))};
const menu=document.querySelector('[role=menu]')||document.querySelector('[class*=menu]')||[...document.querySelectorAll('div')].find(d=>d.textContent.includes('Log out')&&d.textContent.length<300);
out.push('menu found: '+(menu?menu.className.slice(0,80):'NONE')); if(menu)walk(menu,0); return out.join('\\n')})()`,returnByValue:true});
console.log(dump.result.result.value);
ws.close();try{chrome.kill('SIGKILL')}catch{};process.exit(0);
