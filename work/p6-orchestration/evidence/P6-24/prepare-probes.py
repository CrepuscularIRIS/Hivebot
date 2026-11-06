from pathlib import Path
root = Path('/tmp/bot-wt/P6-24/app/sdk')
out = Path('/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-24')
s = (root / 'tests/e2e/p624-worker-cwd.test.ts').read_text()
for rel in ['../../examples/lib/client.mjs','../support/runtime.ts','../support/fake/harness.ts','../support/tmp-sweep.ts']:
    absolute = str((root / 'tests/e2e' / rel).resolve())
    s = s.replace("'"+rel+"'", "'"+absolute+"'")
s = s.replace("from 'vitest'", "from '/tmp/bot-wt/P6-24/app/sdk/node_modules/vitest/dist/index.js'")
s = s.replace("const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')", "const PKG_ROOT = '/tmp/bot-wt/P6-24/app/sdk'")
s = s.replace("    toolCall('write', { file_path: join(MAIN_WS, 'link.md'), content: 'hijack-via-link' }),", """    toolCall('write', { file_path: join(MAIN_WS, 'link.md'), content: 'hijack-via-link' }),
    toolCall('read', { file_path: join(MAIN_WS, 'CLAUDE.local.md') }),
    toolCall('edit', { file_path: join(MAIN_WS, 'CLAUDE.local.md'), old_string: 'innocent', new_string: 'injected-instruction' }),""")
s = s.replace("  symlinkSync('AGENTS.md', join(MAIN_WS, 'link.md'))", """  symlinkSync('AGENTS.md', join(MAIN_WS, 'link.md'))
  writeFileSync(join(MAIN_WS, 'innocent.md'), 'innocent')
  symlinkSync('innocent.md', join(MAIN_WS, 'CLAUDE.local.md'))""")
s = s.replace("  expect(askedFrom(h, WORKER) - before).toBe(0) // 拒不出卡", """  console.log('INVERSE_SYMLINK_RESULT', JSON.stringify(results.slice(4)), 'BYTES', readFileSync(join(MAIN_WS, 'innocent.md'), 'utf8'))
  expect(results[5]!.isError, 'CLAUDE.local.md -> innocent.md must still deny edit of an instruction path').toBe(true)
  expect(readFileSync(join(MAIN_WS, 'innocent.md'), 'utf8')).toBe('innocent')
  expect(askedFrom(h, WORKER) - before).toBe(0) // 拒不出卡""")
(out / 'inverse-symlink.test.ts').write_text(s)
