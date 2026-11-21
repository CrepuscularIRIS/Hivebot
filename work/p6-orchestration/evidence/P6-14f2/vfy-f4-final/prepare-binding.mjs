import {readFileSync,writeFileSync} from 'node:fs';
const E='/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-14f2/vfy-f4-final';
const root='/tmp/bot-wt/P6-14f2/app/ui';
const original=readFileSync(root+'/tests/unit/shell/startup-gate.test.ts','utf8');
let test=original.replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?`from '${new URL(path,'file://'+root+'/tests/unit/shell/').pathname}'`:all)
.replace("fileURLToPath(new URL('../../../main/index.ts', import.meta.url))",JSON.stringify(root+'/main/index.ts'));
writeFileSync(E+'/binding-baseline.test.ts',test);
const mock=`
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return { ...fs, readFileSync: (...args: any[]) => {
    const value = (fs.readFileSync as any)(...args)
    if (!String(args[0]).endsWith('/main/index.ts')) return value
    const changed = String(value).replace(/void m3\\.init\\.then\\([\\s\\S]*?\\n        \\)/, 'ready.setRestoreSettled([...m3.failed])')
    if(changed === value) throw Error('mutation did not bind production source')
    console.log('MUTATION: production timeout body reverted in memory; product file unchanged')
    return changed
  }}
})
`;
writeFileSync(E+'/binding-mutant.test.ts',mock+test);
for(const [name,include] of [['startup',['/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-14f2/vfy-f4/startup-f4.test.ts',E+'/binding-baseline.test.ts']],['mutant',[E+'/binding-mutant.test.ts']]]){
writeFileSync(E+'/'+name+'.config.mts','export default '+JSON.stringify({test:{include,globals:true,environment:'node',testTimeout:10000,maxWorkers:1}}));
}
console.log('generated from production startup-gate.test.ts; only imports and source URL relocated; mutant changes returned production source in memory');
