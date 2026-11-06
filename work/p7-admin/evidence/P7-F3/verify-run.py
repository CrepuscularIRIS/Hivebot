import os, pathlib, subprocess, sys, time
E=pathlib.Path(__file__).parent
S=E/'verify-source/app'
env={'HOME':str(E/'verify-home'),'TMPDIR':str(E/'verify-tmp'),'PATH':'/home/lingxufeng/.npm-global/bin:/usr/bin:/bin','DBUS_SESSION_BUS_ADDRESS':'unix:path=/tmp/bot-P7-F3-no-dbus'}
groups={
'sdk':['tests/unit/p7-host-recovery.test.ts','tests/unit/orchestration-report.test.ts','tests/unit/orchestration-foundation.test.ts','tests/unit/orchestration-create.test.ts','tests/unit/p7-admin-channel.test.ts','tests/unit/p7-authority.test.ts','tests/unit/start.test.ts'],
'ui':['tests/unit/admin/recovery.test.ts','tests/unit/admin/operations.test.ts','tests/unit/admin/channel.test.ts','tests/unit/shell/restore-wiring.test.ts','tests/unit/shell/ready.test.ts','tests/unit/shell/connect.test.ts','tests/unit/shell/startup-gate.test.ts','tests/unit/shell/wire.test.ts','tests/unit/shell/document-path.test.ts','tests/unit/shell/single-instance.test.ts','tests/unit/shell/load-abort.test.ts','tests/unit/m3/restore.test.ts','tests/unit/m3/orch-channel.test.ts'],
'loader':['tests/unit/orchestration-report-live.test.ts','tests/unit/orchestration-foundation-delivery.test.ts','-t',r'P6-12 live \(real Loader\)|delivers each stable|two concurrent same-id']}
for group in sys.argv[1:]:
 config=E/('verify-'+('sdk' if group=='loader' else group)+'.config.mjs')
 cmd=['/home/lingxufeng/.npm-global/bin/pnpm','-C',str(S/'sdk'),'--config.verify-deps-before-run=false','exec','vitest','run','--config',str(config),'--maxWorkers=1','--no-file-parallelism']
 if group=='loader':cmd+=['--coverage.enabled=false']
 cmd+=groups[group]
 with (E/('verify-'+group+'-run.txt')).open('w') as out:
  out.write('SHA 4da62902c7a9c26452eafc4e98cf40c6d6a6d452\nENV '+repr(env)+'\nCOMMAND '+repr(cmd)+'\n');out.flush()
  result=subprocess.run(cmd,env=env,cwd=S/'sdk',stdout=out,stderr=subprocess.STDOUT)
  out.write('\nEXIT '+str(result.returncode)+'\n')
 print(group,'exit',result.returncode,flush=True)
