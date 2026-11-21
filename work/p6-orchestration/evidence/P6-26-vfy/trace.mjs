// strace target: one model-scoped readText + readBytes + listDir; markers bracket the window.
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const wt = process.argv[2]
const { ZoneCheckedFileSystem, applyZoneRecheck } = await import(join(wt, 'app/sdk/src/policy/fs-zone.mjs'))
const { noteZoneVerdict } = await import(join(wt, 'app/sdk/src/policy/resolve.mjs'))
const root = realpathSync(mkdtempSync('/tmp/bot-p626v-tr-'))
const ws = join(root, 'ws'); mkdirSync(join(ws, 'sub'), { recursive: true })
writeFileSync(join(ws, 'sub', 'a.txt'), 'INSIDE')
const fs = Object.assign(Object.create(ZoneCheckedFileSystem.prototype), { config: { cwd: ws, diffBasisMaxBytes: 1 << 20 }, internals: {}, locks: new Map(), p2sdkNeverRoots: [] })
let w; applyZoneRecheck({ on: (_e, f) => { w = f }, get: (n) => ({ fs, sandboxPolicy: { resolve: () => ({ mode: 'workspace-write', workspaceRoot: ws }) } })[n] }, [])
const fp = join(ws, 'sub', 'a.txt')
const exec = { name: 'read', arguments: { file_path: fp } }
noteZoneVerdict(exec, { kind: 'workspace-read', allInside: true, targets: [fp] })
await w(exec, async () => {
  const t = await fs.resolve(fp)
  existsSync('/tmp/bot-p626v-MARK-BEGIN')
  const s = await fs.readText(t)
  existsSync('/tmp/bot-p626v-MARK-END')
  return s
})
rmSync(root, { recursive: true, force: true })
