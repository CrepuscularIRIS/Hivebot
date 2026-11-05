from pathlib import Path
import subprocess, shutil
base = Path('/tmp/vfy-r-p610-d')
repo = Path('/home/lingxufeng/bot')
sdk = base / 'sdk'
(sdk / 'src').mkdir(parents=True, exist_ok=True)
shutil.copytree(repo / 'app/sdk/src/orchestration', sdk / 'src/orchestration', dirs_exist_ok=True)
(sdk / 'node_modules').symlink_to(repo / 'app/sdk/node_modules', target_is_directory=True)
(sdk / 'tests/unit').mkdir(parents=True, exist_ok=True)
(sdk / 'tests/support').mkdir(parents=True, exist_ok=True)
for name in ['orchestration-create.test.ts', 'orchestration-foundation.test.ts']:
    shutil.copy(repo / 'app/sdk/tests/unit' / name, sdk / 'tests/unit' / name)
shutil.copy(repo / 'app/sdk/tests/support/tmp-sweep.ts', sdk / 'tests/support/tmp-sweep.ts')
legacy = subprocess.check_output(['git', '-C', str(repo), 'show', '29c6b1a^:app/sdk/tests/unit/orchestration-foundation.test.ts'], text=True)
(sdk / 'tests/unit/legacy-f1.test.ts').write_text(legacy)
(sdk / 'vitest.config.mts').write_text("export default {test:{include:['tests/unit/**/*.test.ts'],testTimeout:10000}}\n")
(sdk / 'package.json').write_text('{"type":"module"}')
# Standalone UI probes use native Node type stripping; bundling the orchestrator
# is necessary because its existing extensionless relative imports are Vite-only.
print('Prepared isolated copy at', sdk)
