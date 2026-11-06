from pathlib import Path

w = Path('/tmp/bot-wt/P6-24')
e = Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-24')
s = (w / 'app/sdk/tests/e2e/p624-worker-cwd.test.ts').read_text()
replacements = {
    "from 'vitest'": f"from '{w}/app/sdk/node_modules/vitest/dist/index.js'",
    "from '../../../ui/main/m3-meta/store.ts'": f"from '{w}/app/ui/main/m3-meta/store.ts'",
    "from '../../examples/lib/client.mjs'": f"from '{w}/app/sdk/examples/lib/client.mjs'",
    "from '../support/runtime.ts'": f"from '{w}/app/sdk/tests/support/runtime.ts'",
    "from '../support/fake/harness.ts'": f"from '{w}/app/sdk/tests/support/fake/harness.ts'",
    "from '../support/tmp-sweep.ts'": f"from '{w}/app/sdk/tests/support/tmp-sweep.ts'",
    "const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')": f"const PKG_ROOT = '{w}/app/sdk'",
    "  mkdirSync(SUB_WS, { recursive: true })": "  mkdirSync(SUB_WS, { recursive: true })\n  mkdirSync(join(MAIN_WS, 'normal', 'AGENTS.md'), { recursive: true })",
    "    toolCall('write', { file_path: 'write-note.txt', content: 'from-write' }),": "    toolCall('write', { file_path: 'write-note.txt', content: 'from-write' }),\n    toolCall('write', { file_path: 'normal/AGENTS.md/notes.md', content: 'ordinary-directory-success' }),",
    "  // 主 bot 下一回合直接 read 两者（验收 ② 后半）": "  expect(results[3]!.isError, results[3]!.text).toBe(false)\n  expect(readFileSync(join(MAIN_WS, 'normal', 'AGENTS.md', 'notes.md'), 'utf8')).toBe('ordinary-directory-success')\n  console.log('DIRECTORY_BASENAME_NORMAL', JSON.stringify(results[3]))\n  // 主 bot 下一回合直接 read 两者（验收 ② 后半）",
}
for old, new in replacements.items():
    assert s.count(old) == 1, repr(old)
    s = s.replace(old, new)
(e / 'f1-independent-directory-loader.test.ts').write_text(s)
(e / 'f1-independent-extra.config.mjs').write_text("export default {test:{include:[" + repr(str(e / 'f1-independent-directory-loader.test.ts')) + "," + repr(str(e / 'f1-independent-boundaries.test.ts')) + "],setupFiles:[" + repr(str(w / 'app/sdk/tests/support/tmp-sweep.setup.ts')) + "],testTimeout:120000,hookTimeout:120000,maxWorkers:1}}\n")
