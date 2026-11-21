# B31 SuperAgent 主 bot 实装 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Grok Bot 的主 bot 对话走 SuperAgent 的 work-item → 会话 → 回写循环，同时不改 transcript/composer UI、不改 0.78.1 外壳。

**Architecture:** 把 `repos/dsh-superagent-prototype` 搬进 `app/superagent/` 当 DSH bundle 跑（搬运阶梯三级：复制改造），用新配置 `masterSessionId` 把 SuperAgent 的 master/router 会话钉到主 bot 会话上；新增 `local` Source 把主 bot 里的用户消息变成 Trigger（work item），新增 `local` channel 把回写以 **inject notice** 投回主 bot 会话（永不伪造 user 消息）。shim 只加两处：主 bot 建会话时带 router preset、把 `agentPreset === 'dsh-superagent-worker'` 的会话并按 T36 的 helper 路径归到 Workers 分组。

**Tech Stack:** TypeScript + cordis/Dsh plugin、vitest（`app/ui/tests/unit/`、`app/superagent/tests/`）、playwright e2e（b18 rig：`launchSdkRuntime({patch})` + `launchShell` + scripted fake LLM）。

**Spec:** `work/b30-live-re/ARCHITECTURE.md`（§三 B31）、`work/b30-live-re/evidence/EVIDENCE.md`、`work/HANDOFF.md` §2/§6、`work/WORKFLOW.md`。

## Global Constraints

- 最小 diff（Ponytail）：只换引擎，不重画 UI；不做 panel/客户端适配、不做 GitHub/Feishu 配置面迁移、不做 B32 委派 UI。
- `repos/` 只读：改造一律复制进 `app/superagent/`，文件头与 commit 正文写 `来源: repos/dsh-superagent-prototype@6337fc823ce2:src/...`（MIT，`repos/MANIFEST.tsv:3`）。
- 凭证不进 git、不进模型、不进 e2e 子进程 env；GitHub/Feishu 监听源默认 `disabled`。
- 分支：worktree `/tmp/bot-wt/B31`；worktree 内 pnpm 一律 `--config.verify-deps-before-run=false` + 显式 `workdir`（不用 `pnpm -C`）。
- 单测：`pnpm -C app/ui test tests/unit/...`（shim 层）/ `pnpm -C app/superagent test tests/b31-*.spec.ts`；新 worktree 首跑先 `pnpm install --prefer-offline`（app/ui、app/sdk、app/superagent 各自）。
- e2e：`pnpm -C app/ui test:e2e tests/e2e/<spec>`；exit 78 = 新鲜度守卫，先 `pnpm -C app/ui build`；隔离 HOME/死 DBus，不改 `run-e2e.sh` 里 `env -u ELECTRON_RUN_AS_NODE` 的位置。
- 合并：`git merge --no-ff` → 立刻定向回测 → `work/LOG.md` 记一行。不用 `git stash`、不 `sudo`、不 `pkill -f`、不重启机器。

## Review Focus

spec 没写、但真人一用就撞的五类；每条在括号里的任务里落测试。

1. **同一条用户消息被派发两次**（主 bot 重发/重试、shim 已有 `clientNonce` 重试语义）：重试必须复用同一 work item，不能开两张单。（Task 3）
2. **回写被渲染成「你说的话」**：worker 结果回主 bot 若是 user-role 消息，UI 会把 agent 的答复画在你的气泡里。（Task 4）
3. **worker 会话污染侧栏**：worker 是顶层 session，不归 Workers 分组就会在侧栏多出一个 bot，且打乱 R9 的「首载定序后冻结」。（Task 5）
4. **插件缺失/加载失败时主 bot 白屏**：SuperAgent 起不来必须静默退回今天的 `session/prompt` 直连。（Task 5）
5. **本地消息跨会话串台**：masterSessionId 换绑后，旧会话的 in-flight 消息不能落进新主 bot 的 thread。（Task 2）

---

### Task 1: 搬运 SuperAgent 原型进 `app/superagent/`

**Files:**
- Create: `app/superagent/`（`src/`、`prompts/`、`locale/`、`package.json`、`tsconfig.json`、`tsdown.config.ts`、`cordis.patch.yml`，来自 `repos/dsh-superagent-prototype`）
- Create: `app/superagent/tests/b31-bundle.spec.ts`
- Modify: `app/superagent/cordis.patch.yml`（GitHub/Feishu 源保持 disabled）

**Interfaces:**
- Consumes: 无。
- Produces: 可 `pnpm -C app/superagent build` 的 bundle 包，`package.json` 的 `dsh.bundle.patch = './cordis.patch.yml'`，patch 内包含 `dsh-superagent` 与 `dsh-superagent-router` / `dsh-superagent-worker` 两个 agent preset。

- [ ] **Step 1: 写失败测试** `app/superagent/tests/b31-bundle.spec.ts`

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as
  { name: string; dsh?: { bundle?: { patch?: string } } }
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

describe('B31 bundle 结构', () => {
  it('是可加载的 dsh bundle', () => {
    expect(pkg.name).toBe('dsh-superagent')
    expect(pkg.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
  })
  it('声明 router/worker 两个 preset，外部监听源默认关闭', () => {
    expect(patch).toContain('dsh-superagent-router')
    expect(patch).toContain('dsh-superagent-worker')
    expect(patch).toMatch(/dsh-superagent-github[\s\S]{0,200}disabled: true/)
    expect(patch).toMatch(/dsh-superagent-feishu[\s\S]{0,200}disabled: true/)
  })
})
```

- [ ] **Step 2: 跑它看红**：`pnpm -C app/superagent test tests/b31-bundle.spec.ts` → FAIL（目录不存在）

- [ ] **Step 3: 复制并改造**

```bash
mkdir -p app/superagent
cp -r repos/dsh-superagent-prototype/{src,prompts,locale,package.json,tsconfig.json,tsdown.config.ts,cordis.patch.yml} app/superagent/
```

改两处：`cordis.patch.yml` 里 `dsh-superagent-github` 加 `disabled: true`（Feishu 已是）；`src/index.ts` 与 `src/app/runtime.ts` 文件头各加一行 `来源: repos/dsh-superagent-prototype@6337fc823ce2:src/index.ts`（其余复制文件靠 commit 正文统一注明）。

- [ ] **Step 4: 跑绿 + 能编译**：`pnpm --config.verify-deps-before-run=false install`（workdir `app/superagent`）→ `pnpm typecheck` → `pnpm build` → `pnpm test tests/b31-bundle.spec.ts` 全绿

- [ ] **Step 5: 提交**

```bash
git add app/superagent
git commit -F - <<'EOF'
feat(b31): 搬运 dsh-superagent 原型为 app/superagent bundle

来源: repos/dsh-superagent-prototype@6337fc823ce2 (MIT)
改造: GitHub/Feishu 监听源默认 disabled；仅保留引擎+local 面。
EOF
```

---

### Task 2: `masterSessionId` 把 router 会话钉到主 bot

**Files:**
- Create: `app/superagent/src/app/master-id.ts`
- Modify: `app/superagent/src/app/runtime.ts:104`（`const masterId = this.masterId = resolveMasterId(config.masterSessionId, store.get(KV.runtime.masterId), \`orchestrator-${key(machine.stateDir)}\`)`）
- Modify: `app/superagent/src/deployment.ts`（`DeploymentConfig` 加 `masterSessionId?: string`）
- Test: `app/superagent/tests/b31-master-id.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `Runtime`（构造时读 config）。
- Produces: `export function resolveMasterId(pin: string | undefined, stored: string | undefined, fallback: string): string`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { resolveMasterId } from '../src/app/master-id'

describe('B31 主 bot 会话钉定', () => {
  it('pin 优先于已存值与默认值', () => {
    expect(resolveMasterId('main-bot', 'orchestrator-old', 'orchestrator-fb')).toBe('main-bot')
  })
  it('无 pin 时用已存值（重启不换会话）', () => {
    expect(resolveMasterId(undefined, 'orchestrator-old', 'orchestrator-fb')).toBe('orchestrator-old')
  })
  it('两者皆缺回落默认', () => {
    expect(resolveMasterId(undefined, undefined, 'orchestrator-fb')).toBe('orchestrator-fb')
  })
  it('空串 pin 视为未配置（换绑后清空即回退）', () => {
    expect(resolveMasterId('', 'orchestrator-old', 'orchestrator-fb')).toBe('orchestrator-old')
  })
})
```

- [ ] **Step 2: 跑它看红**：`pnpm -C app/superagent test tests/b31-master-id.spec.ts` → FAIL "Cannot find module '../src/app/master-id'"

- [ ] **Step 3: 实现** `resolveMasterId`（trim + 空串当 undefined；pin 命中时**不回写** KV，避免换绑后无法回退），并在 `runtime.ts:104` 接上、`deployment.ts` 加可选字段。

- [ ] **Step 4: 跑绿**：`pnpm -C app/superagent test tests/b31-master-id.spec.ts` → 4 passed

- [ ] **Step 5: 提交**：`git commit -m "feat(b31): masterSessionId 把 SuperAgent router 会话钉到主 bot 会话"`

---

### Task 3: `local` Source —— 主 bot 用户消息 → work item

**Files:**
- Create: `app/superagent/src/sources/local-trigger.ts`（纯函数）
- Create: `app/superagent/src/sources/local.ts`（`localKind` + `watchLocalSession`）
- Modify: `app/superagent/src/app/runtime.ts`（`initialize()` 里注册 `localKind`，并把 master 会话的用户消息喂给 `receive`）
- Test: `app/superagent/tests/b31-local-trigger.spec.ts`

**Interfaces:**
- Consumes: `src/core/model.ts:23` 的 `Trigger`；`src/sources/kind.ts` 的 `SourceKind`；Task 2 的 `masterId`。
- Produces:
  - `export const LOCAL_SOURCE = 'local'`
  - `export function localTrigger(input: { sessionId: string; messageId: string; text: string; at: string }): Trigger`
  - `export function watchLocalSession(ctx: Context, opts: { sessionId: string; receive: (t: Trigger) => void }): () => void`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { localTrigger, LOCAL_SOURCE } from '../src/sources/local-trigger'

describe('B31 local trigger', () => {
  it('thread = 会话，人发起的直接请求，id 由会话+消息稳定派生', () => {
    const t = localTrigger({ sessionId: 'main-1', messageId: 'm7', text: '  看一下 PR  ', at: '2026-11-18T17:20:00.000Z' })
    expect(t).toMatchObject({
      id: 'local:main-1:m7', source: LOCAL_SOURCE, human: true, addressed: 'direct',
      threads: [{ source: LOCAL_SOURCE, id: 'main-1' }],
      actor: { source: LOCAL_SOURCE, id: 'person' }, at: '2026-11-18T17:20:00.000Z', text: '看一下 PR',
    })
    expect(t.channel).toEqual({ source: LOCAL_SOURCE, thread: 'local:main-1', address: { session: 'main-1' } })
  })
  it('重试同一消息 → 同一 id（Intake 去重，不开第二张单）', () => {
    const a = localTrigger({ sessionId: 'main-1', messageId: 'm7', text: 'x', at: '2026-11-18T17:20:00Z' })
    const b = localTrigger({ sessionId: 'main-1', messageId: 'm7', text: 'x', at: '2026-11-18T17:21:00Z' })
    expect(a.id).toBe(b.id)
  })
  it('空文本不产生 work item', () => {
    expect(() => localTrigger({ sessionId: 'main-1', messageId: 'm8', text: '   ', at: '2026-11-18T17:20:00Z' })).toThrow(/empty/)
  })
})
```

- [ ] **Step 2: 跑它看红**：`pnpm -C app/superagent test tests/b31-local-trigger.spec.ts` → FAIL module not found

- [ ] **Step 3: 实现 `local-trigger.ts`**（按 `Trigger` 全字段填：`meta: { session: sessionId, message: messageId }`、`text.trim()`，trim 后为空 throw）；`local.ts` 里 `localKind` 的 `scope()` 返回 `{ listened: true, observed: false }`、`channel` 委托 Task 4。

- [ ] **Step 4: 接监听面**：先在真机上探一次事件形状——`watchLocalSession` 里临时 `ctx.logger.info('b31 session/event %j', event)`，起 runtime 发一条消息，把 `{ session, event }` 的字段名记进回执；确认后仅保留 `event.type` 为消息新增 + 角色 user 的分支，映射到 `localTrigger`。订阅用现有 `ctx.on('session/event', …)`（`app/superagent/src/app/sessions.ts:114` 同款 API）。

- [ ] **Step 5: 跑绿 + 回归**：`pnpm -C app/superagent test tests/b31-local-trigger.spec.ts` → 3 passed；`pnpm -C app/superagent test` 全量不红

- [ ] **Step 6: 提交**：`git commit -m "feat(b31): local Source 把主 bot 用户消息变成 work item（按消息 id 去重）"`

---

### Task 4: `local` channel 回写 —— 只许 inject notice

**Files:**
- Create: `app/superagent/src/sources/local-channel.ts`
- Modify: `app/superagent/src/sources/local.ts`（`channel: { send: sendLocal, link: localLink }`）
- Modify: `app/superagent/src/app/runtime.ts`（把 `sessions.prompt` 包成 `deliver` 注入 `localKind`）
- Test: `app/superagent/tests/b31-local-channel.spec.ts`

**Interfaces:**
- Consumes: `src/sources/kind.ts` 的 `SourceChannel`；`OutboundMessage`。
- Produces:
  - `export type LocalDeliver = (input: { sessionId: string; requestId: string; text: string }) => Promise<void>`
  - `export const sendLocal = (deliver: LocalDeliver) => async (_host: unknown, message: OutboundMessage): Promise<'sent' | 'gone'>`
  - runtime 侧 `deliver = ({sessionId, requestId, text}) => sessions.prompt(sessionId, requestId, text, { inject: 'Work item update' })`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, vi } from 'vitest'
import { sendLocal } from '../src/sources/local-channel'
import type { OutboundMessage } from '../src/core/index'

const message = (over: Partial<OutboundMessage> = {}): OutboundMessage => ({
  id: 'reply-1', kind: 'reply', text: 'PR 已提，等 review',
  channel: { source: 'local', thread: 'local:main-1', address: { session: 'main-1' } }, ...over,
})

describe('B31 local 回写', () => {
  it('投到会话，requestId = 消息 id（重投幂等）', async () => {
    const deliver = vi.fn(async () => {})
    await expect(sendLocal(deliver)({}, message())).resolves.toBe('sent')
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver).toHaveBeenCalledWith({ sessionId: 'main-1', requestId: 'reply-1', text: 'PR 已提，等 review' })
  })
  it('地址缺 session → gone，不投', async () => {
    const deliver = vi.fn(async () => {})
    await expect(sendLocal(deliver)({}, message({ channel: { source: 'local', thread: 'x', address: {} } }))).resolves.toBe('gone')
    expect(deliver).not.toHaveBeenCalled()
  })
  it('投递失败向上抛（Outbox 重试），不吞', async () => {
    const deliver = vi.fn(async () => { throw new Error('boom') })
    await expect(sendLocal(deliver)({}, message())).rejects.toThrow('boom')
  })
})
```

- [ ] **Step 2: 跑它看红**：`pnpm -C app/superagent test tests/b31-local-channel.spec.ts` → FAIL module not found

- [ ] **Step 3: 实现**：`send` 从 `message.channel.address.session` 取会话，无则 `'gone'`；`requestId` 用 `message.id`；不 catch。`sendLocal` 是工厂（`localKind(deliver)` 传进去），不读全局。

- [ ] **Step 4: 跑绿**：`pnpm -C app/superagent test tests/b31-local-channel.spec.ts` → 3 passed

- [ ] **Step 5: 断言不伪造 user 消息**：给 `runtime.ts` 的 `deliver` 加一行注释 `// 必须走 inject 模式：user-role 消息会在 UI 里显示成用户自己说的话`，并在 Task 6 e2e 里断言气泡条数不变（见下）。

- [ ] **Step 6: 提交**：`git commit -m "feat(b31): local channel 用 inject notice 回写主 bot，避免伪造 user 消息"`

---

### Task 5: shim —— worker 会话归 Workers 分组；主 bot 带 router preset；插件缺失回退

**Files:**
- Create: `app/ui/renderer-grok/shim/src/roster.ts`（把 `data.ts:513-522` 的过滤逻辑提成纯函数）
- Modify: `app/ui/renderer-grok/shim/src/data.ts:513-522`（改调 `classifyRoster`）、`:541`（`session/create` 传 `agentPreset`）、`:553-566`（helper 重筛块接入 `workers`）
- Test: `app/ui/tests/unit/grok-shim/b31-roster.test.ts`

**Interfaces:**
- Consumes: `session/list` 的 `{ sessionId, origin?, parentSessionId?, projections.values.agentPreset }`。
- Produces:
  - `export interface RosterInput { sessionId: string; origin?: string; parentSessionId?: string; preset?: string | null }`
  - `export function classifyRoster(items: RosterInput[]): { top: RosterInput[]; helpers: RosterInput[] }` —— 顶层照旧；`origin==='subagent' && parentSessionId` 进 helpers；`preset === 'dsh-superagent-worker'` 也进 helpers（等主 bot 定后按 helper 挂）。
  - `export const ROUTER_PRESET = 'dsh-superagent-router'`、`WORKER_PRESET = 'dsh-superagent-worker'`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { classifyRoster } from '../../../../renderer-grok/shim/src/roster'

describe('B31 roster 归类', () => {
  it('worker preset 顶层会话归 helpers（进 Workers 分组，不占侧栏）', () => {
    const { top, helpers } = classifyRoster([
      { sessionId: 'main', preset: 'dsh-superagent-router' },
      { sessionId: 'worker-1', preset: 'dsh-superagent-worker' },
    ])
    expect(top.map(s => s.sessionId)).toEqual(['main'])
    expect(helpers.map(s => s.sessionId)).toEqual(['worker-1'])
  })
  it('subagent helper 仍归 helpers，普通会话仍归 top', () => {
    const { top, helpers } = classifyRoster([
      { sessionId: 'a' }, { sessionId: 'b', origin: 'subagent', parentSessionId: 'a' },
    ])
    expect(top.map(s => s.sessionId)).toEqual(['a'])
    expect(helpers.map(s => s.sessionId)).toEqual(['b'])
  })
  it('无 preset 的顶层会话不受影响（回归）', () => {
    expect(classifyRoster([{ sessionId: 'x', preset: null }]).top).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 跑它看红**：`pnpm -C app/ui test tests/unit/grok-shim/b31-roster.test.ts` → FAIL module not found

- [ ] **Step 3: 提纯函数并接线**：`classifyRoster` 照 Step 1 三例实现；`data.ts` 用它替掉内联 filter，`nextSummaries`/`helpersOfMain` 填法不变（worker 会话在终值 `mainBotId` 定后才挂，见 `:553-566`）。

- [ ] **Step 4: 主 bot 建会话带 router preset + 缺失回退**：`data.ts:541` 改为

```ts
const created = await api('session/create', { request: { agentPreset: ROUTER_PRESET } })
// preset 未安装时上游回 error/空 → 退回无 preset 建会话（现状路径）
const sid = created.ok && typeof rec(created.value).sessionId === 'string'
  ? rec(created.value).sessionId as string
  : rec((await api('session/create', { request: {} })).value).sessionId
```

- [ ] **Step 5: 跑绿 + 回归**：`pnpm -C app/ui test tests/unit/grok-shim/b31-roster.test.ts` → 3 passed；`pnpm -C app/ui test` 全量不红（838 基线）

- [ ] **Step 6: 提交**：`git commit -m "feat(b31): shim 主 bot 带 router preset，SuperAgent worker 会话归 Workers 分组"`

---

### Task 6: e2e —— 主 bot 一句话派生出 work item

**Files:**
- Create: `app/ui/tests/e2e/support/superagent-patch.ts`（组合 fake LLM overlay + SuperAgent insert 成**一个** patch yml）
- Create: `app/ui/tests/e2e/b31-superagent-main-bot.spec.ts`

**Interfaces:**
- Consumes: `launchSdkRuntime`、`launchShell`、`waitProductReady`、`fakeOverlayPath`（`app/ui/tests/support/sdk-runtime.ts`）；`P2SDK_PATCH` 只收一个文件，故必须自己拼。
- Produces: `export function superagentOverlayPath(opts: { pluginDir: string }): string`

- [ ] **Step 1: 写失败 spec**

```ts
// B31 e2e：主 bot 发一句话 → SuperAgent 建 work item（ticket）→ 主 bot transcript 出现 work item 通知；
// 插件缺席时同一条 prompt 仍走 session/prompt 直连（回退不白屏）。
import { expect, test } from 'playwright/test'
import { launchShell } from '../support/launch.ts'
import { launchSdkRuntime } from '../support/sdk-runtime.ts'
import { superagentOverlayPath } from '../support/superagent-patch.ts'
import { waitProductReady } from '../support/ui.ts'
import { tmkdir } from '../support/tmp-sweep.ts'

test('B31：主 bot 对话经 SuperAgent 建 work item', async () => {
  test.setTimeout(300_000)
  const rt = await launchSdkRuntime({ patch: superagentOverlayPath({ pluginDir: 'superagent' }), cwd: tmkdir('b31-ws-'), readyTimeoutMs: 180_000 })
  const shell = await launchShell({ env: { PBOTS_DSH_HANDOFF: rt.handoff } })
  try {
    const page = shell.page
    await waitProductReady(page)
    await page.getByRole('textbox').fill('调研一下 v4.1 flash 的定价')
    await page.keyboard.press('Enter')
    // work item 命中的证据：主 bot transcript 出现 SuperAgent 的通知条目
    await expect(page.getByText(/Work item|ticket/i).first()).toBeVisible({ timeout: 60_000 })
    // 用户气泡只有我们发的那一条（回写没伪造 user 消息）
    await expect(page.locator('[data-role="user"]')).toHaveCount(1)
  } finally { await shell.stop(); await rt.stop() }
})
```

- [ ] **Step 2: 跑它看红**：`pnpm -C app/ui build && pnpm -C app/ui test:e2e tests/e2e/b31-superagent-main-bot.spec.ts` → FAIL `superagent-patch.ts` 不存在

- [ ] **Step 3: 实现 `superagentOverlayPath`**：先 `fakeOverlayPath()` 拿 fake LLM 那段 yml，再把 `- insert: [- id: dsh-superagent, name: '<abs>/app/superagent/lib/index.js' …]` 追加进同一文件（`P2SDK_PATCH` 只读一个文件），并把 `dsh-superagent` 的 `stateDir` 指到 `tmkdir('b31-sa-')`。

- [ ] **Step 4: 让 Router 走 `orchestrator_route`**：用 `rt.writeScriptCalls(mainSessionId, [...])` 给主会话灌一条 tool-call 轮（`orchestrator_route` + `accept`），worker 会话脚本用 `writeScriptCalls(\`worker-${ticketId}\`, …)`；ticketId 从 SuperAgent 面板 HTTP `GET /<前缀>/state` 读（前缀先 `grep -n "registerHttp" app/superagent/src/app/http.ts` 记进回执）。若拿到 ticketId 前 worker 已跑完，改为只断言 ticket 建成（`state` 里 `tickets[0].ended` 为真）+ 通知可见，并在 spec 里留 `shortcut: 未断言 worker 正文回写，B32 补`。

- [ ] **Step 5: 跑绿**：同 Step 2 → 1 passed；再跑 `b18-general-rows` + `b21-tasks-island` 两条回归 → 全绿（确认 roster 改动没打乱侧栏）

- [ ] **Step 6: 提交**：`git commit -m "test(b31): e2e 主 bot 经 SuperAgent 建 work item + 回写不伪造 user 消息"`

---

### Task 7: 合并回主线并记 LOG

**Files:**
- Modify: `work/LOG.md`（一行）

- [ ] **Step 1: 全量回测**：`pnpm -C app/ui build` → `pnpm -C app/ui test` → `pnpm -C app/superagent test` → `pnpm -C app/ui test:e2e tests/e2e/b31-superagent-main-bot.spec.ts`（贴原样输出到回执）
- [ ] **Step 2: 合并**：`git checkout main && git merge --no-ff feat/B31-superagent-main-bot` → 合并后立刻重跑 Step 1 三条
- [ ] **Step 3: 记档**：`work/LOG.md` 加 `B31 ✅（<sha>）：主 bot 对话经 SuperAgent 循环；<单测>/<e2e> 计数`
- [ ] **Step 4: 提交**：`git commit -m "chore(b31): 合并 --no-ff 并记 LOG"`

---

## 自审清单（写完后核对）

- 规格覆盖：B30 §三 B31 的「换执行面/保留 UI/work-item 派发」→ Task 1–5 施工、Task 6 验收；「凭证/监听源不启用」→ Task 1 Step 3+测试断言。
- 类型一致：`localTrigger` / `sendLocal` / `classifyRoster` / `resolveMasterId` 在 Task 2–5 的 Interfaces 与测试里同名同签名。
- 最大风险：Task 3 Step 4 与 Task 6 Step 4 都依赖**未被本计划证实**的上游面（`session/event` 的消息形状、SuperAgent 面板 HTTP 前缀），所以两步都写成了「先探一次、记回执、再断言」；任一步探不通就降级为只验 engine 层（Task 3/4 单测）+ 主 bot 回退路径（Task 5 Step 4），把「worker 正文回写」推到 B32。
