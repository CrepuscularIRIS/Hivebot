#!/usr/bin/env node
// P6-05 验收探针（PLAN p6-orchestration P6-05）：
//   1. 定稿段落自洽：p6-reply-style.yml persona literal block 首空行后的段落，
//      sha256 = D3 result.json 记录的 presetSectionSha256（P6-02 定稿值）。
//   2. 静态：approval.yml preset-standard 的 persona prefix = standard 基础句
//      + '\n\n' + 段落（与 p6-reply 的 prefix 逐字节一致）。
//   3. 动态：spawn scripts/start.mjs（P2SDK_PROVIDER=mock，P2SDK_PATCH 只挂本
//      探针的 recorder，不挂 p6-reply-style.yml）——默认链建会话（session/create
//      不带 agentPreset），mock 回合一轮后读 recorder：systemTexts 含段落全文，
//      header.agentPreset === 'standard'。证明段落进了默认链而非 insert preset。
//
// 运行：node probe.mjs   （退出码 0 = 全过；沙箱 /tmp/bot-p6-05 用后即删）
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..')
const SDK = join(REPO_ROOT, 'app', 'sdk')
const P6_YML = join(SDK, 'profile', 'patches', 'p6-reply-style.yml')
const APPROVAL_YML = join(SDK, 'profile', 'patches', 'approval.yml')
const D3_META = resolve(HERE, '..', 'D3', 'raw', 'run-meta.json')
const ROOT = '/tmp/bot-p6-05'
/** P6-02 定稿段落 sha256（D3 采集时记入 run-meta.json）。 */
const EXPECTED_SHA = 'c7c53cd4e281e361191cbdecf873d2c6c5a5d9d7e56277091bf0d54a9734b356'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
const fileText = (p) => readFileSync(p, 'utf8')

/** 与 evidence/D3/run.mjs 同法：行级取 `- id: <rowId>`（0/4 空格缩进）到同级下一行。 */
function presetBlock(text, rowId) {
  const rows = text.split('\n')
  const s = rows.findIndex((l) => l === `- id: ${rowId}` || l === `    - id: ${rowId}`)
  if (s < 0) return null
  const nextRow = rows[s].startsWith(' ') ? '    - id: ' : '- id: '
  let e = rows.length
  for (let k = s + 1; k < rows.length; k++) {
    if (rows[k].startsWith(nextRow)) { e = k; break }
  }
  return rows.slice(s, e)
}

/** `prefix: |` literal block 全文（dedent，掐尾空行）。 */
function literalBlock(rows, startIdx) {
  const headIndent = /^(\s*)/.exec(rows[startIdx])[1].length
  const contentIndent = headIndent + 2
  const out = []
  for (let i = startIdx + 1; i < rows.length; i++) {
    const l = rows[i]
    if (l.trim() === '') { out.push(''); continue }
    if (/^(\s*)/.exec(l)[1].length < contentIndent) break
    out.push(l.slice(contentIndent))
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}

/** 块内 persona 的 prefix 值（literal block 或裸标量两种写法都收）。 */
function personaPrefix(block, label) {
  const idx = block.findIndex((l) => /^ {10,}prefix: /.test(l) || /^ {10,}prefix: \|$/.test(l))
  if (idx < 0) throw new Error(`${label}: persona 没有 prefix 行`)
  const line = block[idx]
  if (/\|$/.test(line)) return literalBlock(block, idx)
  return line.replace(/^ *prefix: /, '')
}

function fail(label) { console.error(`FAIL: ${label}`) }

function staticChecks() {
  const fails = []
  // 1. P6-02 定稿段落与 D3 记录一致
  const p6Block = presetBlock(fileText(P6_YML), 'preset-p6-reply')
  if (p6Block === null) { fail('p6-reply-style.yml 缺 preset-p6-reply'); return { fails, section: '', base: '' } }
  const p6Prefix = personaPrefix(p6Block, 'p6-reply')
  const cut = p6Prefix.indexOf('\n\n')
  if (cut < 0) { fail('p6-reply prefix 缺首空行分段'); return { fails, section: '', base: '' } }
  const base = p6Prefix.slice(0, cut)
  const section = p6Prefix.slice(cut + 2)
  if (sha256(section) !== EXPECTED_SHA) fails.push(`段落 sha256 ${sha256(section)} != D3 记录 ${EXPECTED_SHA}`)
  const d3Meta = JSON.parse(fileText(D3_META))
  if (d3Meta.presetSectionSha256 !== sha256(section)) fails.push('run-meta.json 的 presetSectionSha256 与现文件不一致')

  // 2. approval.yml preset-standard 的 persona prefix
  const stdBlock = presetBlock(fileText(APPROVAL_YML), 'preset-standard')
  if (stdBlock === null) { fail('approval.yml 缺 preset-standard 覆盖块'); return { fails, section, base } }
  const stdPrefix = personaPrefix(stdBlock, 'preset-standard')
  if (stdPrefix !== `${base}\n\n${section}`) {
    fails.push(`approval.yml standard persona prefix != p6-reply 定稿（前 60 字符：${JSON.stringify(stdPrefix.slice(0, 60))}）`)
  }
  return { fails, section, base }
}

/** llm/stream recorder overlay（只记 systemTexts/toolNames/model，不记用户消息）。 */
function recorderOverlay() {
  const dir = mkdtempSync(join(tmpdir(), 'bot-p6-05-rec-'))
  const overlay = join(dir, 'recorder.yml')
  writeFileSync(join(dir, 'recorder.mjs'), `\
// P6-05 recorder: per-request system prompt texts at llm/stream.
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'p6-05-recorder'

const textOf = (message) => (message.content ?? [])
  .filter((b) => b?.type === 'text')
  .map((b) => b.text)
  .join('')

export function apply(ctx) {
  ctx.on('llm/stream', (options, next) => {
    const home = process.env.DSH_HOME
    if (home !== undefined) {
      appendFileSync(join(home, 'p6-05-llm.jsonl'), JSON.stringify({
        ts: Date.now(),
        sessionId: options.sessionId === undefined ? 'null' : String(options.sessionId),
        model: options.model ?? null,
        systemTexts: (options.messages ?? []).filter((m) => m.role === 'system').map(textOf),
        toolNames: (options.tools ?? []).map((t) => t.name).sort(),
      }) + '\\n')
    }
    return next()
  })
}
`)
  writeFileSync(overlay, `\
- insert:
    - id: p6-05-recorder
      name: '${pathToFileURL(join(dir, 'recorder.mjs')).href}'
`)
  return { dir, overlay }
}

async function liveCheck(section) {
  const fails = []
  const rec = recorderOverlay()
  rmSync(ROOT, { recursive: true, force: true })
  for (const d of ['home', 'dsh', 'handoff', 'data', 'work']) mkdirSync(join(ROOT, d), { recursive: true })

  const env = {
    PATH: process.env.PATH,
    HOME: join(ROOT, 'home'),
    P2SDK_PROVIDER: 'mock',
    P2SDK_HOME: join(ROOT, 'dsh'),
    P2SDK_HANDOFF: join(ROOT, 'handoff'),
    P2SDK_PORT: '0',
    P2SDK_PATCH: rec.overlay,
    P2SDK_READY_TIMEOUT_MS: '180000',
    PBOTS_DATA_DIR: join(ROOT, 'data'),
    DSH_TELEMETRY_MODE: 'DISABLED',
  }
  const child = spawn(process.execPath, [join(SDK, 'scripts', 'start.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
  child.stdout.on('data', (c) => process.stdout.write(`[sdk] ${c}`))
  child.stderr.on('data', (c) => { stderr += c })
  const dshPid = () => Number(/^p2sdk: dsh pid (\d+)$/m.exec(stderr)?.[1] ?? 0) || 0

  const cleanup = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      const until = Date.now() + 8000
      while (child.exitCode === null && Date.now() < until) await sleep(200)
      if (child.exitCode === null) child.kill('SIGKILL')
    }
    const dp = dshPid()
    if (dp > 0) {
      try { process.kill(dp, 0); process.kill(dp, 'SIGTERM'); } catch { /* 已退出 */ }
      const until = Date.now() + 8000
      while (Date.now() < until) { try { process.kill(dp, 0); await sleep(200) } catch { break } }
      try { process.kill(dp, 0); process.kill(dp, 'SIGKILL') } catch { /* 已退出 */ }
    }
    rmSync(ROOT, { recursive: true, force: true })
    rmSync(rec.dir, { recursive: true, force: true })
  }
  process.on('SIGINT', () => { void cleanup().then(() => process.exit(130)) })

  try {
    const handoffBase = join(ROOT, 'handoff', 'base-url')
    const bootDeadline = Date.now() + 180_000
    let booted = false
    while (Date.now() < bootDeadline) {
      if (child.exitCode !== null) throw new Error(`runtime 提前退出（code ${child.exitCode}）\n${stderr.slice(-2000)}`)
      if (existsSync(handoffBase)) { booted = true; break }
      await sleep(300)
    }
    if (!booted) throw new Error(`runtime 180s 内未 ready\n${stderr.slice(-2000)}`)

    const baseUrl = fileText(handoffBase).trim()
    const token = fileText(join(ROOT, 'handoff', 'launch-token')).trim()
    const { connect, snapshotFrames } = await import(pathToFileURL(join(SDK, 'examples', 'lib', 'client.mjs')).href)
    const client = await connect({ baseUrl, token })

    // 默认链会话：不带 agentPreset
    const work = join(ROOT, 'work', 'std')
    const { sessionId } = await client.call('session/create', { request: { cwd: work } })
    const { stream, snapshot } = await client.follow(sessionId, { assistantStream: true, awaitSnapshot: true })
    const frames = [...snapshotFrames(snapshot)]
    const header = snapshot?.header ?? null
    let ended = false
    const drained = (async () => {
      for await (const f of stream) {
        frames.push(f)
        if (f.type === 'event' && f.event?.type === 'turn/end') { ended = true; break }
      }
    })().catch((e) => fail(`follow 流错误 ${String(e?.message ?? e)}`))
    await client.call('session/prompt', {
      request: {
        requestId: `p6-05-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        sessionId, mode: 'queue', content: [{ type: 'text', text: 'P6-05 默认链 persona 探针' }],
      },
    })
    const deadline = Date.now() + 60_000
    while (!ended && Date.now() < deadline && child.exitCode === null) await sleep(300)
    if (!ended) fail('60s 内未见 turn/end')
    stream.cancel()
    await sleep(150)
    void drained
    client.close()

    if (header?.agentPreset !== 'standard') fails.push(`header.agentPreset != standard（实际 ${header?.agentPreset}）`)
    const recPath = join(ROOT, 'dsh', 'p6-05-llm.jsonl')
    const rows = existsSync(recPath)
      ? fileText(recPath).split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l))
      : []
    const mine = rows.filter((r) => r.sessionId === sessionId)
    if (mine.length === 0) { fails.push('recorder 无本会话记录'); return { fails } }
    const systemText = mine.map((r) => r.systemTexts.join('\n')).join('\n')
    if (!systemText.includes(section)) fails.push('默认链会话系统提示不含三段式段落')
    console.log(`[p6-05] 默认会话 ${sessionId} preset=${header?.agentPreset} llm 记录 ${mine.length} 条，系统提示 ${systemText.length} 字符`)
    return { fails }
  } finally {
    await cleanup()
  }
}

async function main() {
  const { fails: sfails, section } = staticChecks()
  for (const f of sfails) fail(f)
  console.log(`[p6-05] 静态：${sfails.length === 0 ? 'PASS' : `${sfails.length} 项不过`}`)
  if (sfails.length > 0) return 1 // 静态不过就不起 runtime
  const { fails: lfails } = await liveCheck(section)
  for (const f of lfails) fail(f)
  console.log(`[p6-05] 动态：${lfails.length === 0 ? 'PASS' : `${lfails.length} 项不过`}`)
  if (sfails.length + lfails.length > 0) return 1
  console.log('probe PASS')
  return 0
}

main().then((code) => process.exit(code ?? 0), (e) => { console.error(`[p6-05] FATAL: ${e?.stack ?? e}`); process.exit(1) })
