import {createRequire} from 'node:module'
import {writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import assert from 'node:assert/strict'
const tmp='/tmp/vfy-r-p610-a',root='/home/lingxufeng/bot',require=createRequire(root+'/app/ui/package.json')
const esbuild=require(root+'/app/ui/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild')
await esbuild.build({stdin:{contents:`export {rpcRaw} from '${root}/app/ui/main/dsh/connect.ts'`,resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile:tmp+'/rpc.cjs'})
await writeFile(tmp+'/rpc-child.cjs',`const http=require('node:http'),{wireOrchChannel}=require('./production.cjs'),{rpcRaw}=require('./rpc.cjs');
(async()=>{const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end('{');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;wireOrchChannel({dsh:{onConnected(){},ready:async()=>({openStream(e,a,cb){setImmediate(()=>cb({type:'item',value:{requestId:'r1',kind:'create-bot',name:'w',prompt:'p',mainBotId:'main'}}));return {cancel(){}}}}),rpc:(m,a)=>rpcRaw(base,'',m,a)},create:async()=>({ok:true,value:{sessionId:'worker-created'}})});})();`)
const r=spawnSync(process.execPath,[tmp+'/rpc-child.cjs'],{cwd:tmp,env:{HOME:tmp+'/home',PATH:process.env.PATH},encoding:'utf8',timeout:5000})
console.log('RESPOND_INVALID_JSON',JSON.stringify({status:r.status,signal:r.signal,stderr:r.stderr}));assert.equal(r.status,1);assert.match(r.stderr,/SyntaxError/)
