from pathlib import Path
import re, subprocess
out=Path('/tmp/vfy-r-p615f1-b')
src=Path('/home/lingxufeng/bot/app/ui/renderer-grok/shim/src/data.ts')
s=subprocess.check_output(['git','-C','/home/lingxufeng/bot','show','5930660:app/ui/renderer-grok/shim/src/data.ts'],text=True)
s=re.sub(r"from '([^']+)'",lambda m:"from '"+str((src.parent/m[1]).resolve())+"'" if m[1].startswith('.') else m[0],s)
s=s.replace('    deps,\n    answers,','    probe: { onFollowItem, onEventsItem, loadRoster },\n    deps,\n    answers,')
(out/'parent-data.ts').write_text(s)
(out/'differential.config.mjs').write_text("export default {test:{include:['/tmp/vfy-r-p615f1-b/differential.test.ts'],environment:'node'}}\n")
