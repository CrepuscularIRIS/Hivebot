import {writeFileSync,existsSync,appendFileSync} from 'node:fs';
import {basename,dirname,join} from 'node:path';
export const name='p625-b-barrier';
export function apply(ctx){ctx.on('tools/pre-execute',async(exec,next)=>{const decision=await next();if(exec.name==='write'){const path=exec.arguments.file_path;appendFileSync("/tmp/vfy-r-p625-b/run-nUsIyU/gates.jsonl",JSON.stringify({path,decision})+'\n');if(decision?.kind==='allow'&&basename(path)==='x'){const id=basename(dirname(path));writeFileSync(join("/tmp/vfy-r-p625-b/run-nUsIyU/barriers",id+'.ready'),'');const end=Date.now()+60000;while(!existsSync(join("/tmp/vfy-r-p625-b/run-nUsIyU/barriers",id+'.go'))){if(Date.now()>end)throw Error('barrier timeout '+id);await new Promise(r=>setTimeout(r,5));}}}return decision;},true)}
