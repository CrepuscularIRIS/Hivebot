import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
const stub=process.argv[2], url=process.argv[3];
const PROFILE='/tmp/uiw-pc-'+Date.now(), PORT=19800+Math.floor(Math.random()*100);
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
const evbuf=[];ws.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.method==='Runtime.consoleAPICalled')evbuf.push(m.params.args.map(a=>a.value??a.description??'').join(' ').slice(0,400));if(m.method==='Runtime.exceptionThrown')evbuf.push('EXC:'+(m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text||'').slice(0,600))}catch{}});
await send('Page.addScriptToEvaluateOnNewDocument',{source:await fs.readFile(stub,'utf8')});
await send('Page.navigate',{url});
await new Promise(r=>setTimeout(r,9500));
let r1=await send('Runtime.evaluate',{expression:`(()=>{const el=[...document.querySelectorAll('button')].find(e=>(e.textContent||'').includes('Stub Dev'));if(!el)return 'NOBTN';const b=el.getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2})})()`,returnByValue:true});
if(String(r1.result.result.value).startsWith('{')){const p=JSON.parse(r1.result.result.value);await clickAt(p.x,p.y);await new Promise(r=>setTimeout(r,1800));}
let r2=await send('Runtime.evaluate',{expression:`(()=>{const el=[...document.querySelectorAll('[role=menuitem],button,[role=menu] *')].find(e=>e.children.length===0&&(e.textContent||'').trim()==='Settings');if(!el)return 'NOSET';const b=el.getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2})})()`,returnByValue:true});
if(String(r2.result.result.value).startsWith('{')){const p=JSON.parse(r2.result.result.value);await clickAt(p.x,p.y);await new Promise(r=>setTimeout(r,5000));}
const info=await send('Runtime.evaluate',{expression:`(()=>{const dlg=document.querySelector('[role=dialog]');if(!dlg)return 'NODLG';
const pane=dlg.querySelector('[class*=settings-pane],[class*=pane]');
return JSON.stringify({dlgChildren:dlg.querySelectorAll('*').length, paneCls: pane?pane.className.slice(0,120):null, paneChildren: pane?pane.querySelectorAll('*').length:0,
ALLHTML: dlg.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g,"<svg/>").slice(0,9000)})})()`,returnByValue:true});
console.log('PANE:', info.result.result.value);
console.log('--- exceptions ---');
console.log(evbuf.filter(l=>l.startsWith('EXC')||/error|Error/.test(l)).slice(-12).join('\n'));
ws.close();try{chrome.kill('SIGKILL')}catch{};process.exit(0);
