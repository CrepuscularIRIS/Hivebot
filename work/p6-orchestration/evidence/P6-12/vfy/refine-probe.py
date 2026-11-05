from pathlib import Path
out=Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-12/vfy')
p=out/'probe.test.ts'
s=p.read_text().replace("outcome: 'stopped', workerId: W", "outcome: 'error', reason: 'blocked', workerId: W")
s=s.replace("    console.log('BAD_PATH evidence',", f"    writeFileSync('{out}/bad-path.json', JSON.stringify({{before,after}},null,2))\n    console.log('BAD_PATH evidence',")
s=s.replace("    console.log('WITHDRAW evidence',", f"    writeFileSync('{out}/withdraw-observed.txt', rt.readStderr().split('\\n').filter(l => /p612-vfy|withdrew/.test(l)).join('\\n'))\n    writeFileSync('{out}/cancel-events.json', JSON.stringify(finalLog,null,2))\n    console.log('WITHDRAW evidence',")
p.write_text(s)
