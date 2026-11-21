// Q2/Q3/Q4：write/edit 之外的落盘通道，逐一实测「无卡写到工作区外（宿主 /tmp）」能否成立。
// 区外目标统一在宿主 /tmp/bot-p625c-out/（测试前删除，测试后检查宿主侧是否存在）。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { DATA_DIR, launch, OUT_DIR, R, results, text, toolCall, turn, WS, type H } from './h.ts'

const SDK = '/home/lingxufeng/bot/app/sdk'
const OUT2 = '/home/lingxufeng/bot/.test-homes/p625c-out'
mkdirSync(OUT2, { recursive: true })
const out2 = (name: string) => { const p = join(OUT2, `${name}-${R}.txt`); rmSync(p, { force: true }); return p }
const log: Record<string, unknown> = {}
let h: H

function ptcBootstrapSource(): string {
  const store = join(SDK, 'node_modules', '.pnpm')
  const hit = readdirSync(store).find((n) => n.startsWith('@deepseek-ai+dsh-ptc-runtime-node@'))!
  return join(store, hit, 'node_modules', '@deepseek-ai', 'dsh-ptc-runtime-node', 'lib', 'process.js')
}
const out = (name: string) => { const p = join(OUT_DIR, `${name}-${R}.txt`); rmSync(p, { force: true }); return p }

beforeAll(async () => {
  const boot = join(WS, '.p625c-ptc-boot.mjs')
  copyFileSync(ptcBootstrapSource(), boot)
  h = await launch(`\
- id: ptc-runtime
  config:
    launch:
      kind: node-script
      executable: /usr/bin/node
      bootstrapPath: ${boot}
`)
})
afterAll(async () => {
  writeFileSync('/tmp/vfy-r-p625-c/channels-log.json', JSON.stringify(log, null, 2))
  h?.closeFeed()
  await h?.stop()
})

/** 等子会话完成 n 次模型调用，返回其工具结果。 */
async function childResults(parent: string, n: number, before: Set<string | null>, ms = 120_000): Promise<{ id: string; results: Array<{ isError: boolean; text: string }> }> {
  const deadline = Date.now() + ms
  for (;;) {
    const reqs = h.requests()
    const child = reqs.find((r) => r.sessionId !== null && r.sessionId !== parent && !before.has(r.sessionId) && !seenChildren.has(r.sessionId))
    if (child) {
      const id = child.sessionId as string
      for (;;) {
        const mine = h.requests().filter((r) => r.sessionId === id)
        if (mine.length >= n) { seenChildren.add(id); return { id, results: mine.flatMap((r) => r.toolResults ?? []) } }
        if (Date.now() > deadline) throw new Error(`child ${id} only ${mine.length}/${n}`)
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    if (Date.now() > deadline) throw new Error('no child session observed')
    await new Promise((r) => setTimeout(r, 100))
  }
}
const seenChildren = new Set<string>()
const childScript = (calls: object[]) => {
  const d = join(h.home, 'fake', 'scripts')
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'default.json'), JSON.stringify({ calls: [...calls, text('child done')] }))
}

it('C-runcode: ptc run_code — 直接 node:fs 写宿主 /tmp + 嵌套 tools.write 写宿主 /tmp', async () => {
  const direct = out('rc-direct')
  const nested = out('rc-nested')
  const direct2 = out2('rc-direct2')
  const code = `
const r = {};
try { const fs = process.getBuiltinModule('node:fs'); fs.writeFileSync(${JSON.stringify(direct)}, 'p625c'); r.direct = 'wrote:' + fs.existsSync(${JSON.stringify(direct)}); r.tmpls = fs.readdirSync('/tmp').slice(0, 20); } catch (e) { r.direct = 'err:' + String(e && e.message || e); }
try { const fs = process.getBuiltinModule('node:fs'); fs.writeFileSync(${JSON.stringify(direct2)}, 'p625c'); r.direct2 = 'wrote'; } catch (e) { r.direct2 = 'err:' + String(e && e.message || e); }
try { r.nested = await tools.write({ file_path: ${JSON.stringify(nested)}, content: 'p625c' }); } catch (e) { r.nested = 'err:' + String(e && e.message || e); }
return r;`
  const t = await turn(h, { preset: 'ptc', calls: [toolCall('run_code', { code, description: 'probe host tmp writes' })], answer: 'rejected' })
  const res = results(t.frames)
  log.runcode = { res, cards: t.cards.map((c) => c.request), directOnHost: existsSync(direct), direct2OnHost: existsSync(direct2), nestedOnHost: existsSync(nested) }
  console.log('[C-runcode]', JSON.stringify(log.runcode).slice(0, 1500))
  expect(existsSync(direct), 'run_code 直接 fs 写不落宿主 /tmp').toBe(false)
  expect(existsSync(nested), 'run_code 嵌套 write 不落宿主 /tmp').toBe(false)
  expect(existsSync(direct2), 'run_code 直接 fs 写非 /tmp 区外不落盘').toBe(false)
})

it('C-workflow: workflow 脚本尝试拿 node:fs 写宿主 /tmp', async () => {
  const p = out('wf')
  const script = `
const r = {};
try { const fs = process.getBuiltinModule('node:fs'); fs.writeFileSync(${JSON.stringify(p)}, 'p625c'); r.a = 'wrote'; } catch (e) { r.a = 'err:' + String(e && e.message || e); }
try { const fs = await import('node:fs'); fs.writeFileSync(${JSON.stringify(p)}, 'p625c'); r.b = 'wrote'; } catch (e) { r.b = 'err:' + String(e && e.message || e); }
try { const F = (function(){}).constructor; const g = F('return this')(); r.c = typeof g.process + '/' + typeof g.require; } catch (e) { r.c = 'err:' + String(e && e.message || e); }
return r;`
  const t = await turn(h, { calls: [toolCall('workflow', { script, meta: { name: 'p625c-probe', description: 'probe' } })] })
  const res = results(t.frames)
  log.workflow = { res, cards: t.cards.map((c) => c.request), onHost: existsSync(p) }
  console.log('[C-workflow]', JSON.stringify(log.workflow).slice(0, 1500))
  expect(existsSync(p), 'workflow 不落宿主 /tmp').toBe(false)
})

it('C-fork: subagent_fork 子会话写宿主 /tmp（绝对路径）→ 应同样被 P6-25 拒', async () => {
  const p = out('fork')
  childScript([toolCall('write', { file_path: p, content: 'p625c' })])
  const before = new Set(h.requests().map((r) => r.sessionId))
  const t = await turn(h, { calls: [toolCall('subagent_fork', { description: 'fork probe', prompt: 'write probe' })] })
  const c = await childResults(t.sessionId, 2, before)
  const cards = h.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === c.id)
  log.fork = { child: c, childCards: cards.length, onHost: existsSync(p) }
  console.log('[C-fork]', JSON.stringify(log.fork).slice(0, 1200))
  expect(existsSync(p)).toBe(false)
})

it('C-subcwd: subagent 带 cwd=宿主 /tmp 目录，子会话相对路径写 → 子会话 workspaceRoot 仍是父工作区？', async () => {
  const p = out('subcwd')
  childScript([toolCall('write', { file_path: `subcwd-${R}.txt`, content: 'p625c' })])
  const before = new Set(h.requests().map((r) => r.sessionId))
  const t = await turn(h, { calls: [toolCall('subagent', { description: 'cwd probe', prompt: 'write probe', cwd: OUT_DIR })] })
  const c = await childResults(t.sessionId, 2, before)
  const cards = h.frames.filter((f) => f.type === 'waterfall' && f.event === 'approval/request' && f.agentId === c.id)
  log.subcwd = { parentResults: results(t.frames), child: c, childCards: cards.length, onHost: existsSync(p) }
  console.log('[C-subcwd]', JSON.stringify(log.subcwd).slice(0, 1200))
  expect(existsSync(p)).toBe(false)
})

it('C-argshape: write 的 file_path 非字符串（数组/对象/数字）→ extractPaths 无候选 → total=0 → next()；看执行层是否落盘', async () => {
  const p = out('argshape')
  const t = await turn(h, {
    calls: [
      toolCall('write', { file_path: [p], content: 'p625c' }),
      toolCall('write', { file_path: { toString: p }, content: 'p625c' }),
      toolCall('edit', { file_path: [p], old_string: 'a', new_string: 'b' }),
    ],
  })
  log.argshape = { res: results(t.frames), cards: t.cards.length, onHost: existsSync(p) }
  console.log('[C-argshape]', JSON.stringify(log.argshape).slice(0, 1200))
  expect(existsSync(p)).toBe(false)
})

it('C-wd: working_directory 切到宿主 /tmp 目录后相对路径 write → 判外 deny', async () => {
  const p = out('wd')
  const t = await turn(h, {
    calls: [
      toolCall('working_directory', { cd: OUT_DIR }),
      toolCall('write', { file_path: `wd-${R}.txt`, content: 'p625c' }),
    ],
  })
  log.wd = { res: results(t.frames), cards: t.cards.length, onHost: existsSync(p) }
  console.log('[C-wd]', JSON.stringify(log.wd).slice(0, 1200))
  expect(existsSync(p)).toBe(false)
})

it('Q4: 拒绝文本中的宿主绝对路径（P6-25 deny vs guard deny）', async () => {
  const p = out('q4')
  const maskTarget = join(DATA_DIR, `q4-${R}.txt`)
  const t = await turn(h, {
    calls: [
      toolCall('write', { file_path: p, content: 'x' }),
      toolCall('write', { file_path: maskTarget, content: 'x' }),
    ],
  })
  const res = results(t.frames)
  log.q4 = { res, hasOut: res.map((r) => r.text.includes(OUT_DIR)), hasData: res.map((r) => r.text.includes(DATA_DIR)), anyAbs: res.map((r) => /(^|[\s"'(])\/(tmp|home)\//.test(r.text)) }
  console.log('[Q4]', JSON.stringify(log.q4).slice(0, 1500))
  expect(res.length).toBe(2)
})

it('Q3-bash: bash 写 /tmp 落私有 tmpfs、看不见宿主 /tmp', async () => {
  const p = out('bash')
  const p2 = out2('bash2')
  const seen = join(OUT_DIR, `hostseen-${R}.txt`)
  writeFileSync(seen, 'host-only')
  const cmd = `echo p625c > ${p}; echo "rc=$?"; test -e ${seen}; echo "seen=$?"; grep -E ' /tmp ' /proc/self/mountinfo | head -3; echo x > ${p2}; echo "rc2=$?"; echo netdev=$(tail -n +3 /proc/net/dev | cut -d: -f1 | tr -d ' ' | tr '\\n' ,)`
  const t = await turn(h, { calls: [toolCall('bash', { command: cmd, description: 'tmp view probe' })], answer: 'allowed-once' })
  log.bash = { res: results(t.frames), cards: t.cards.map((c) => c.request?.toolName), onHost: existsSync(p), p2OnHost: existsSync(p2) }
  console.log('[Q3-bash]', JSON.stringify(log.bash).slice(0, 1500))
  expect(existsSync(p), 'bash 写 /tmp 不落宿主').toBe(false)
})

it('Q3-net: request_network 批准后同命令 bash（联网态）写 /tmp 是否落宿主', async () => {
  const p = out('net')
  const seen = join(OUT_DIR, `hostseen-${R}.txt`)
  const cmd = `echo p625c > ${p}; echo "rc=$?"; test -e ${seen}; echo "seen=$?"; grep -E ' /tmp ' /proc/self/mountinfo | head -3; echo netdev=$(tail -n +3 /proc/net/dev | cut -d: -f1 | tr -d ' ' | tr '\\n' ,)`
  const t = await turn(h, {
    calls: [
      toolCall('request_network', { reason: 'p625c tmp view probe', command: cmd }),
      toolCall('bash', { command: cmd, description: 'tmp view probe (net)' }),
    ],
    answer: 'allowed-once',
  })
  log.net = { res: results(t.frames), cards: t.cards.map((c) => c.request?.toolName), onHost: existsSync(p) }
  console.log('[Q3-net]', JSON.stringify(log.net).slice(0, 1800))
  expect(existsSync(p), '联网态 bash 写 /tmp 不落宿主').toBe(false)
  void readFileSync
})
