import pathlib, subprocess, sys
E=pathlib.Path(__file__).parent
SDK=str(E/'f1-verify-source/app/sdk')
env={'HOME':str(E/'f1-verify-home'),'TMPDIR':str(E/'f1-verify-tmp'),'PATH':'/home/lingxufeng/.npm-global/bin:/usr/bin:/bin','DBUS_SESSION_BUS_ADDRESS':'unix:path=/tmp/bot-P7-F3-no-dbus'}
sdk=['tests/unit/p7-host-recovery.test.ts','tests/unit/orchestration-report.test.ts','tests/unit/orchestration-foundation.test.ts','tests/unit/orchestration-create.test.ts','tests/unit/p7-admin-channel.test.ts','tests/unit/p7-authority.test.ts','tests/unit/start.test.ts']
ui=['tests/unit/admin/recovery.test.ts','tests/unit/admin/operations.test.ts','tests/unit/admin/channel.test.ts','tests/unit/shell/restore-wiring.test.ts','tests/unit/shell/ready.test.ts','tests/unit/shell/connect.test.ts','tests/unit/shell/startup-gate.test.ts','tests/unit/shell/wire.test.ts','tests/unit/shell/document-path.test.ts','tests/unit/shell/single-instance.test.ts','tests/unit/shell/load-abort.test.ts','tests/unit/m3/restore.test.ts','tests/unit/m3/orch-channel.test.ts']
groups={'sdk-worker':sdk,'sdk-child':['tests/unit/p7-host-recovery.test.ts','-t','P7-F3 real Loader control stream'],'ui':ui,'loader':['tests/unit/orchestration-report-live.test.ts','tests/unit/orchestration-foundation-delivery.test.ts','-t','P6-12 live \(real Loader\)|delivers each stable|two concurrent same-id','--coverage.enabled=false']}
for group in sys.argv[1:]:
 cmd=['/home/lingxufeng/.npm-global/bin/pnpm','-C',SDK,'--config.verify-deps-before-run=false','exec','vitest','run','--config',str(E/('f1-verify-'+('sdk-worker' if group=='loader' else group)+'.config.mjs')),'--maxWorkers=1','--no-file-parallelism',*groups[group]]
 with (E/('f1-verify-'+group+'-run.txt')).open('w') as out:
  out.write('ENV '+repr(env)+'\nCOMMAND '+repr(cmd)+'\n');out.flush()
  result=subprocess.run(cmd,env=env,cwd=SDK,stdout=out,stderr=subprocess.STDOUT)
  out.write('\nEXIT '+str(result.returncode)+'\n')
 print(group,'exit',result.returncode,flush=True)
