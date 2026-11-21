import { launchShell, sandboxHome } from '/tmp/bot-wt/P5-W3f1/app/ui/tests/support/launch.ts'
import { fakeOverlayPath, launchSdkRuntime } from '/tmp/bot-wt/P5-W3f1/app/ui/tests/support/sdk-runtime.ts'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const evidence='/home/lingxufeng/bot/work/p5-parity/evidence/P5-W3f1'
async function main(){
 const home=sandboxHome('P5-W3f1-browser'); const rt=await launchSdkRuntime({patch:'/tmp/bot-wt/P5-W3f1/app/sdk/profile/patches/presets.yml:'+fakeOverlayPath(),dataDir:join(home,'data')});
 let shell:any;
 try {
  shell=await launchShell({home,env:{PBOTS_DSH_HANDOFF:rt.handoff},extraArgs:['--remote-debugging-port=19331']});
  await shell.page.locator('.sand-agent-item').first().waitFor({timeout:60000});
  const list:any=await rt.client.call('session/list',{_request:{}}); const sid=list.items.find((i:any)=>i.origin!=='subagent').sessionId;
  const args=JSON.stringify({command:'printf VFY-UNIQUE-FULL-RESULT',description:'independent verifier tool output'});
  rt.writeScriptCalls(sid,[{chunks:[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id:'vfy-tool',name:'bash',argumentsDelta:args},{type:'block-end',index:0,block:{type:'tool-call',id:'vfy-tool',name:'bash',arguments:args}},{type:'finish',reason:{kind:'tool-calls'}}]},{chunks:[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:'Verifier turn finished.'},{type:'block-end',index:0,block:{type:'text',text:'Verifier turn finished.'}},{type:'finish',reason:{kind:'stop'}}]}]);
  writeFileSync(join(evidence,'browser-ready.txt'),'CDP http://127.0.0.1:19331\n');console.log('BROWSER_READY');
  while(!existsSync(join(evidence,'browser-stop.flag'))) await new Promise(r=>setTimeout(r,500));
 } finally { if(shell) await shell.stop(); await rt.stop() }
}
main().catch(e=>{console.error(e);process.exitCode=1})
