// P6-26 verifier independent seam (not product code). Usage: node seam.mjs <worktree> <label>
// Seams differ from builder's: (S2) upstream internals.inspectReadBytesAfterStat hook
// (after upstream stat, before upstream's own open-by-path); (S1/S4/S5) swap inside the
// tools/execute next() before the backend call; approval swap happens BEFORE execute.
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

const [wt, label] = process.argv.slice(2)
const { ZoneCheckedFileSystem, applyZoneRecheck } = await import(join(wt, 'app/sdk/src/policy/fs-zone.mjs'))
const { noteZoneVerdict } = await import(join(wt, 'app/sdk/src/policy/resolve.mjs'))

const out = []
const log = (k, v) => { out.push([k, v]); console.log(`${label} ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`) }
const roots = []
const fdCount = () => readdirSync('/proc/self/fd').length

function harness({ wsAlias = false } = {}) {
  const root = realpathSync(mkdtempSync('/tmp/bot-p626v-'))
  roots.push(root)
  const home = join(root, 'home') // temp HOME: fake credential dir lives here only
  const ws = join(root, 'ws'); const outside = join(root, 'outside'); const outside2 = join(root, 'outside2')
  const cred = join(home, '.ssh')
  for (const d of [join(ws, 'sub'), join(outside, 'appr'), outside2, cred]) mkdirSync(d, { recursive: true })
  writeFileSync(join(ws, 'sub', 'a.txt'), 'INSIDE-OK')
  writeFileSync(join(ws, 'sub', 'big.txt'), 'b'.repeat(300000))
  writeFileSync(join(outside, 'a.txt'), 'OUTSIDE-MARKER')
  writeFileSync(join(outside, 'big.txt'), 'O'.repeat(10))
  writeFileSync(join(outside, 'appr', 'a.txt'), 'APPROVED-OUTSIDE')
  writeFileSync(join(outside2, 'a.txt'), 'SWAPPED-OTHER-OUTSIDE')
  writeFileSync(join(cred, 'a.txt'), 'FAKE-CRED-P626V')
  writeFileSync(join(cred, 'big.txt'), 'FAKE-CRED-P626V')
  symlinkSync(join(outside, 'appr', 'a.txt'), join(outside, 'lnk')) // approved via a symlink spelling
  let wsRoot = ws
  if (wsAlias) { symlinkSync(ws, join(root, 'wsalias')); wsRoot = join(root, 'wsalias') }
  const fs = Object.assign(Object.create(ZoneCheckedFileSystem.prototype), {
    config: { cwd: ws, diffBasisMaxBytes: 1 << 20 }, internals: {}, locks: new Map(), p2sdkNeverRoots: [cred],
  })
  let wrapper
  applyZoneRecheck({
    on: (_e, fn) => { wrapper = fn },
    get: (n) => ({ fs, sandboxPolicy: { resolve: () => ({ mode: 'workspace-write', workspaceRoot: wsRoot }) } })[n],
  }, [cred])
  const swapSub = (to) => { renameSync(join(ws, 'sub'), join(ws, 'sub.orig')); symlinkSync(to, join(ws, 'sub')) }
  // exec mimics a model `read` call already approved at pre-execute.
  const call = async (filePath, body, { approved } = {}) => {
    const exec = { name: 'read', arguments: { file_path: filePath } }
    const targets = approved ? [ (await fs.resolve(approved)).targetKey ] : [ (await fs.resolve(filePath)).targetKey ]
    noteZoneVerdict(exec, { kind: 'workspace-read', allInside: !approved, targets })
    return wrapper(exec, body)
  }
  return { root, home, ws, outside, outside2, cred, fs, call, swapSub }
}

const show = async (p) => {
  try { const r = await p; return { ok: r?.isError ? false : true, val: typeof r === 'string' ? r : JSON.stringify(r) } }
  catch (e) { return { ok: false, code: e.code, msg: e.message } }
}
const text = async (it) => { let s = ''; for await (const c of it) s += c; return s }

// S1: swap ws/sub -> outside between tool's resolve and backend read (inside execute)
for (const m of ['readText', 'readBytes', 'streamText', 'listDir', 'stat']) {
  const h = harness()
  const fp = m === 'listDir' ? join(h.ws, 'sub') : join(h.ws, 'sub', 'a.txt')
  const r = await show(h.call(fp, async () => {
    const t = await h.fs.resolve(fp)
    h.swapSub(h.outside)
    if (m === 'readBytes') return Buffer.from(await h.fs.readBytes(t, undefined, 1 << 20)).toString()
    if (m === 'streamText') return text(await h.fs.streamText(t))
    if (m === 'listDir') return (await h.fs.listDir(t)).map((e) => e.name).join(',')
    return h.fs[m](t)
  }))
  log(`S1-swap-to-outside ${m}`, r)
}

// S2: upstream internals seam — after upstream stat, before upstream opens by path (readBytes)
{
  const h = harness()
  const fp = join(h.ws, 'sub', 'big.txt')
  h.fs.internals.inspectReadBytesAfterStat = async () => { h.swapSub(h.outside) }
  const r = await show(h.call(fp, async () => {
    const b = await h.fs.readBytes(await h.fs.resolve(fp), undefined, 1 << 20)
    return `len=${b.length} head=${Buffer.from(b.subarray(0, 5)).toString()}`
  }))
  log('S2-upstream-afterstat-swap readBytes', r)
}

// S5: swap to fake credential dir under temp HOME (outer: before the tool's resolve)
for (const when of ['before-resolve', 'after-resolve']) {
  const h = harness()
  const fp = join(h.ws, 'sub', 'a.txt')
  const r = await show(h.call(fp, async () => {
    if (when === 'before-resolve') h.swapSub(h.cred)
    const t = await h.fs.resolve(fp)
    if (when === 'after-resolve') h.swapSub(h.cred)
    return h.fs.readText(t)
  }))
  log(`S5-fake-cred ${when}`, r)
}

// S4: approved outside A; before execute A's parent is swapped to point at B
{
  const h = harness()
  const A = join(h.outside, 'appr', 'a.txt')
  const ok = await show(h.call(A, async () => h.fs.readText(await h.fs.resolve(A)), { approved: A }))
  log('S4a approved A reads A', ok)
  const viaLink = await show(h.call(join(h.outside, 'lnk'), async () => h.fs.readText(await h.fs.resolve(join(h.outside, 'lnk'))), { approved: join(h.outside, 'lnk') }))
  log('S4b approved via symlink spelling', viaLink)
  const exec = { name: 'read', arguments: { file_path: A } }
  noteZoneVerdict(exec, { kind: 'workspace-read', allInside: false, targets: [(await h.fs.resolve(A)).targetKey] })
  renameSync(join(h.outside, 'appr'), join(h.outside, 'appr.orig')); symlinkSync(h.outside2, join(h.outside, 'appr'))
  // re-run through the wrapper using the exec whose approval snapshot is A
  let wrapper
  applyZoneRecheck({ on: (_e, fn) => { wrapper = fn }, get: (n) => ({ fs: h.fs, sandboxPolicy: { resolve: () => ({ mode: 'workspace-write', workspaceRoot: h.ws }) } })[n] }, [h.cred])
  const sw = await show(wrapper(exec, async () => h.fs.readText(await h.fs.resolve(A))))
  log('S4c approval A then relink A->B', sw)
  const other = join(h.outside, 'a.txt')
  const ex2 = { name: 'read', arguments: { file_path: other } }
  noteZoneVerdict(ex2, { kind: 'workspace-read', allInside: false, targets: [(await h.fs.resolve(join(h.outside2, 'a.txt'))).targetKey] })
  log('S4d approval snapshot B, read different C', await show(wrapper(ex2, async () => h.fs.readText(await h.fs.resolve(other)))))
}

// Not-mis-hit: inside reads, internal read (no scope), alias workspace root
{
  const h = harness()
  const fp = join(h.ws, 'sub', 'a.txt')
  log('N1 inside readText', await show(h.call(fp, async () => h.fs.readText(await h.fs.resolve(fp)))))
  log('N2 inside listDir root', await show(h.call(h.ws, async () => (await h.fs.listDir(await h.fs.resolve(h.ws))).map((e) => e.name).join(','))))
  log('N3 internal read outside (no scope)', await show(h.fs.readText(await h.fs.resolve(join(h.outside, 'a.txt')))))
  log('N4 stat missing inside', await show(h.call(join(h.ws, 'nope'), async () => String(await h.fs.stat(await h.fs.resolve(join(h.ws, 'nope')))))))
  const ha = harness({ wsAlias: true })
  const fa = join(ha.ws, 'sub', 'a.txt')
  log('N5 workspaceRoot given as symlink alias, inside read', await show(ha.call(fa, async () => ha.fs.readText(await ha.fs.resolve(fa)))))
}

// S7: streamText mid-way abort, fd closes without consumer calling next()
{
  const h = harness()
  const fp = join(h.ws, 'sub', 'big.txt')
  const base = fdCount()
  const ac = new AbortController()
  const it = await h.call(fp, async () => h.fs.streamText(await h.fs.resolve(fp), ac.signal))
  const iter = it[Symbol.asyncIterator]()
  const first = await iter.next()
  const during = fdCount()
  ac.abort()
  await new Promise((r) => setTimeout(r, 50))
  log('S7 stream mid-abort fds', { base, during, afterAbortNoNext: fdCount(), firstLen: first.value?.length })
  await iter.return?.()
}

// S6: 1000 mixed reads, fd must not grow
{
  const h = harness()
  const fp = join(h.ws, 'sub', 'a.txt'); const big = join(h.ws, 'sub', 'big.txt')
  const msgs = []
  const base = fdCount()
  await h.call(fp, async () => {
    const t = await h.fs.resolve(fp); const tb = await h.fs.resolve(big); const td = await h.fs.resolve(join(h.ws, 'sub'))
    const tout = await h.fs.resolve(join(h.outside, 'a.txt')); const tmiss = await h.fs.resolve(join(h.ws, 'sub', 'missing'))
    for (let i = 0; i < 1000; i++) {
      try {
        switch (i % 8) {
          case 0: await h.fs.readText(t); break
          case 1: await h.fs.readBytes(tb, undefined, 10); break // FS_TOO_LARGE
          case 2: await h.fs.listDir(td); break
          case 3: await h.fs.readText(tout); break // denied (outside, no approval)
          case 4: await h.fs.readText(tmiss); break // not found
          case 5: for await (const _ of await h.fs.streamText(tb)) break; break
          case 6: { const ac = new AbortController(); const it2 = (await h.fs.streamText(tb, ac.signal))[Symbol.asyncIterator](); await it2.next(); ac.abort(); await it2.next() } break
          case 7: await h.fs.stat(t); await h.fs.readByteRange(t, { offset: 0, length: 3 }); break
        }
      } catch (e) { msgs.push(e.message) }
    }
  })
  await new Promise((r) => setTimeout(r, 50))
  log('S6 1000 mixed fds', { base, after: fdCount(), errors: msgs.length, procLeak: msgs.filter((m) => /\/proc\/self\/fd/.test(m)).length, sampleErr: [...new Set(msgs)].slice(0, 4) })
}

const all = JSON.stringify(out)
log('LEAK /proc/self/fd anywhere in outputs', /\/proc\/self\/fd/.test(all))
for (const r of roots) rmSync(r, { recursive: true, force: true })
