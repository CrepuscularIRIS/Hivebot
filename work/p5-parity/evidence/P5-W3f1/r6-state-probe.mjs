import { apply } from '/tmp/bot-wt/P5-W3f1/app/sdk/src/policy/shell-ask.mjs'
import { mkdtempSync,mkdirSync,writeFileSync,unlinkSync,rmSync } from 'node:fs'
import { join } from 'node:path'
const root=mkdtempSync('/tmp/bot-P5-W3f1-state-');const ws=join(root,'workspace');mkdirSync(ws);writeFileSync(join(ws,'a.txt'),'non-secret fixture');const state=join(root,'policy-state.json');let listener;
const ctx={on(_e,fn){listener=fn},get(name){if(name==='sandboxPolicy')return {resolve:()=>({mode:'workspace-write',workspaceRoot:ws})};if(name==='fs')return {resolve:async p=>({targetKey:join(ws,p)})};if(name==='approval')return {config:{policy:'ask'},overrideOf:()=>undefined};return undefined}}
try{apply(ctx,{policyStatePaths:[state]});const call=async()=>listener({name:'read',arguments:{file_path:'a.txt'},agent:{session:{header:{id:'vfy-session',cwd:ws}}}},()=>({kind:'next'}));console.log('missing',JSON.stringify(await call()));writeFileSync(state,'{bad json');console.log('exists invalid',JSON.stringify(await call()));unlinkSync(state);console.log('deleted after existing',JSON.stringify(await call()))}finally{rmSync(root,{recursive:true,force:true})}
