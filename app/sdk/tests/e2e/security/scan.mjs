// T-08 credential-leak scanner (PLAN p2-sdk T-08 / D8, R-5 wording).
// Sweeps a set of roots for a secret given through $P2SCAN_SECRET (the value
// is never printed) and exits:
//   0 CLEAN   no hit, every file classified as text or zstd (all frames decoded)
//   1 HIT     the secret was found; prints `HIT <path>` per hit (paths only)
//   2 UNRECOGNIZED  a file was neither text nor decodable zstd — FAIL, not skip
//   3 GUARD   not running under `pnpm -C app/sdk exec node` or Node <24.9.0
// Node guard rationale: v22's zstdDecompressSync decodes only the FIRST frame
// of a multi-frame stream (re-verified 2026-11-01: v22.23.4 -> 17 of 42 bytes,
// v24.22.2 -> all), and dsh session files are multi-frame — a single-frame
// scanner would silently miss canaries planted in later frames (G2-r2 item 2).
//
// Usage:
//   pnpm -C app/sdk exec node tests/e2e/security/scan.mjs \
//     [--home DIR] [--file PATH]... [--pid N]... [--tracked]
// Env: P2SCAN_SECRET (required), P2SCAN_PREFIX (optional display prefix).
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 24 || (major === 24 && minor < 9)) {
  console.log(`GUARD node ${process.versions.node} < 24.9.0: multi-frame zstd decode is unsafe here; run through \`pnpm -C app/sdk exec node\` (devEngines-pinned runtime)`)
  process.exit(3)
}
if (!(process.env.npm_config_user_agent ?? '').startsWith('pnpm/')) {
  console.log('GUARD scanner must run through pnpm (`pnpm -C app/sdk exec node tests/e2e/security/scan.mjs`): npm_config_user_agent does not start with "pnpm/"')
  process.exit(3)
}
const SECRET = process.env.P2SCAN_SECRET
if (!SECRET || SECRET.length === 0) {
  console.log('GUARD $P2SCAN_SECRET is required (its value is never printed)')
  process.exit(3)
}
const PREFIX = process.env.P2SCAN_PREFIX ?? ''
const needle = Buffer.from(SECRET, 'utf8')
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// --- collect the scan set ---
// `strict` roots (--home: dsh storage) get format classification: anything
// that is neither UTF-8 text nor decodable zstd FAILS the scan, because an
// unknown storage format means absence cannot be proven (G2-r2). Tracked and
// explicitly named files (--tracked/--file: our source, logs) are raw byte
// searched regardless of format — a literal secret surfaces in any file type,
// and a pre-existing tracked JPEG must not veto the sweep.

const hits = []
const unrecognized = []
const args = process.argv.slice(2)
const strict = new Set()
const raw = new Set()
const pids = []
let tracked = false
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--home') { for (const f of walk(args[++i])) strict.add(f) }
  else if (args[i] === '--file') raw.add(args[++i])
  else if (args[i] === '--pid') pids.push(Number(args[++i]))
  else if (args[i] === '--tracked') tracked = true
  else { console.log(`GUARD unknown argument ${args[i]}`); process.exit(3) }
}
if (tracked) for (const f of gitTracked()) raw.add(f)

function walk(root) {
  const out = []
  const rec = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      unrecognized.push(`${dir}: unreadable (${e.code ?? e.message})`)
      return
    }
    for (const ent of entries) {
      const p = join(dir, ent.name)
      if (ent.isDirectory()) rec(p)
      else if (ent.isFile()) out.push(p)
      else unrecognized.push(`${p}: ${ent.isSymbolicLink() ? 'symlink' : 'special file'} — not scannable, refusing to skip`)
    }
  }
  rec(root)
  return out
}

function gitTracked() {
  const root = spawnSync('git', ['-C', PKG_ROOT, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  if (root.status !== 0) { console.log(`GUARD git rev-parse failed: ${root.stderr}`); process.exit(3) }
  const ls = spawnSync('git', ['-C', root.stdout.trim(), 'ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (ls.status !== 0) { console.log(`GUARD git ls-files failed: ${ls.stderr}`); process.exit(3) }
  return ls.stdout.split('\n').filter(Boolean).map((rel) => join(root.stdout.trim(), rel))
}

// --- classify and search ---

const decoder = new TextDecoder('utf-8', { fatal: true })

function searchBuf(buf) {
  let count = 0
  for (let i = buf.indexOf(needle); i !== -1; i = buf.indexOf(needle, i + 1)) count += 1
  return count
}

function scanFile(path, mode) {
  let buf
  try {
    buf = readFileSync(path)
  } catch (e) {
    if (e.code === 'ENOENT') return // tracked file deleted in a worktree — nothing on disk
    if (e.code === 'EISDIR') return // T-20: a directory entry (e.g. a submodule gitlink from git ls-files) is not a scannable file — its content lives in its own repo
    unrecognized.push(`${path}: unreadable (${e.code ?? e.message})`)
    return
  }
  if (buf.length === 0) return
  if (buf.subarray(0, 4).equals(ZSTD_MAGIC)) {
    let decoded
    try {
      decoded = zstdDecompressSync(buf) // on Node >=24.9 this decodes ALL concatenated frames
    } catch (e) {
      unrecognized.push(`${path}: zstd decode failed (${e.message})`)
      return
    }
    if (searchBuf(decoded) > 0) hits.push(path)
    return
  }
  if (mode === 'raw') {
    if (searchBuf(buf) > 0) hits.push(path)
    return
  }
  try {
    decoder.decode(buf)
  } catch {
    unrecognized.push(`${path}: not UTF-8 text and not zstd — unrecognized format, refusing to skip`)
    return
  }
  if (buf.includes(0)) {
    unrecognized.push(`${path}: NUL byte in a non-zstd file — unrecognized format, refusing to skip`)
    return
  }
  if (searchBuf(buf) > 0) hits.push(path)
}

for (const f of [...strict].sort()) scanFile(f, 'strict')
for (const f of [...raw].sort()) scanFile(f, 'raw')

let pidCount = 0
for (const pid of pids) {
  try {
    if (searchBuf(readFileSync(`/proc/${pid}/cmdline`)) > 0) hits.push(`/proc/${pid}/cmdline`)
    pidCount += 1
  } catch {
    console.log(`PID-GONE ${pid} (already exited; its cmdline no longer exists anywhere)`)
  }
}

// --- report (paths and the known prefix only; never the secret) ---

if (PREFIX) console.log(`secret-prefix: ${PREFIX}`)
for (const u of unrecognized) console.log(`UNRECOGNIZED ${u}`)
for (const h of hits) console.log(`HIT ${h}`)
console.log(`SCANNED files=${strict.size + raw.size} pids=${pidCount}`)
if (unrecognized.length > 0) {
  console.log(`FAIL ${hits.length} hits, ${unrecognized.length} unrecognized files`)
  process.exit(2)
}
if (hits.length > 0) {
  console.log(`FAIL ${hits.length} hits`)
  process.exit(1)
}
console.log('CLEAN')
process.exit(0)
