import assert from 'node:assert/strict'
import { readdirSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply as policy } from '/home/lingxufeng/bot/app/sdk/src/policy/shell-ask.mjs'
const root = '/tmp/vfy-r-p625-a'
const store = '/home/lingxufeng/bot/app/sdk/node_modules/.pnpm'
const installed = (name) => join(store,readdirSync(store).find(x=>x.startsWith('@deepseek-ai+'+name+'@')),'node_modules/@deepseek-ai',name,'lib/index.js')
const { LocalFileSystem } = await import(pathToFileURL(installed('dsh-fs-local')))
const upstream = await import(pathToFileURL(installed('dsh-tool-fs')))
const ws=join(root,'ws'); mkdirSync(ws,{recursive:true})
const fs=Object.assign(Object.create(LocalFileSystem.prototype), {config:{cwd:ws,diffBasisMaxBytes:1048576},internals:{},locks:new Map()})
const tools=new Map(); let listener
const ctx={ fs, tools:{register:t=>tools.set(t.name,t),get:n=>tools.get(n)},systemPrompt:{section(){},getSectionOrder(){return 0}},emit(){}, waterfall:async()=>undefined,workingDirectory:{ensure:async()=>ws}, get(n){return n==='fs'?fs:n==='workingDirectory'?this.workingDirectory:n==='sandboxPolicy'?{resolve:()=>({workspaceRoot:ws,mode:'workspace-write'})}:undefined},on(_,fn){listener=fn}}
upstream.apply(ctx,{read:false,readImage:false,write:true,edit:true,readLimit:2000,readMaxLineLength:2000,readMaxBytes:51200,readStreamMinSize:10485760})
policy(ctx,{policyStatePaths:[join(root,'home','missing-policy.json')]})
const schemas=Object.fromEntries([...tools].map(([n,t])=>[n,t.parameters]))
writeFileSync(join(root,'schemas.json'),JSON.stringify(schemas,null,2))
for(const t of tools.values()) {assert(t.parameters.required.includes('file_path')); for(const alias of ['path','filePath','filename','file','target_path']) assert(!(alias in t.parameters.properties))}
const out=join(root,'outside.txt'); writeFileSync(out,'before')
const cases=[['null-args',null],['array-args',[]],['string-args','x'],['missing',{}],...[
 ['null',null],['empty',''],['blank','   '],['number',42],['boolean',false],['object',{}],['array',[]],['nul','nul\0.txt'],['long-segment','x'.repeat(100000)],['long-depth',('dir/').repeat(3000)+'a'],['inside-relative','inside.txt'],['outside-relative',relative(ws,out)],['outside-absolute',out],['file-url',pathToFileURL(out).href],['windows-drive','C:\\tmp\\outside.txt'],['windows-traversal','..\\outside.txt'],['windows-mixed','../ws\\../outside.txt'],['unc','\\\\localhost\\tmp\\outside.txt']
].map(([label,p])=>[label,{file_path:p}]),...['path','filePath','filename','file','target_path'].flatMap(alias=>[[alias+'-only',{[alias]:out}],[alias+'-with-canonical',{[alias]:out,file_path:'inside.txt'}]])]
const rows=[]
for(const [name,tool] of tools) for(const [label,partial] of cases){
 const args=partial && typeof partial==='object'&&!Array.isArray(partial)?{...partial,content:'after',old_string:'before',new_string:'after'}:partial
 writeFileSync(join(ws,'inside.txt'),'before')
 const exec={name,arguments:args,agent:{session:{header:{id:'probe'}}}}
 let result; const start=performance.now()
 try {const decision=await listener(exec,()=>({kind:'next'}));result={decision:decision.kind};if(decision.kind==='next'){try {const value=await tool.execute(args,exec);result.execution='success';result.path=value.path}catch(e){result.execution='rejected';result.error=e.name;result.message=e.message.slice(0,160)}}}catch(e){result={uncaught:e.name,message:e.message.slice(0,160)}}
 assert.equal(readFileSync(out,'utf8'),'before','outside modified: '+name+' '+label)
 assert(!result.uncaught,JSON.stringify({name,label,result}))
 rows.push({name,label,...result,ms:Math.round(performance.now()-start)})
}
assert(rows.filter(r=>r.label==='outside-absolute'||r.label==='outside-relative'||r.label==='nul'||r.label==='long-segment').every(r=>r.decision==='deny'))
assert(rows.filter(r=>r.label.endsWith('-only')||['null','empty','number','boolean','object','array','null-args','string-args','array-args','missing'].includes(r.label)).every(r=>r.execution==='rejected'))
assert(rows.filter(r=>r.label==='inside-relative').every(r=>r.execution==='success'))
assert(rows.filter(r=>r.execution==='success').every(r=>r.path.startsWith(ws+'/')))
writeFileSync(join(root,'results.json'),JSON.stringify(rows,null,2))
console.log(JSON.stringify({cases:rows.length,uncaught:rows.filter(r=>r.uncaught).length,denied:rows.filter(r=>r.decision==='deny').length,rejected:rows.filter(r=>r.execution==='rejected').length,successInside:rows.filter(r=>r.execution==='success').length,outsideUnchanged:true,maxMs:Math.max(...rows.map(r=>r.ms))},null,2))
console.log('PASS: installed schema has only file_path; malformed inputs cannot write outside; successful calls resolve inside workspace')
