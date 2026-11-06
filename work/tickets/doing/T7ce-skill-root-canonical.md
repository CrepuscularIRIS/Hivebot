# T7ce：skill 根也过 fs.resolve——`.dsh` 是链接且 skills 未建时首次写 skill 漏卡

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：Sol 审查 `work/tickets/review/T7c-T9a-security.md` C1（经理核实 CONFIRMED，见该文件「## 经理核实」）；T7c 链（T7c/T7cb/T7cc 已 done）的边界缺口
> 分支 / 作业目录：feat/T7ce，从主线 `docs/rebuild-p6-p5-plan`（≥ 35a235c6）切；小改动，可不建 worktree
> 排期：现在就做，与 T16 并行（T16 不碰 `shell-ask.mjs` / `policy.test.ts`），合并不必等 T16
> claimed：2026-11-06 15:3x main (GLM 5.3) @ /tmp/bot-wt/T7ce
> accepted：

## 目标
`<ws>/.dsh` 是指向 `<ws>/config` 的符号链接、`config/skills` 尚不存在时，write 到 `.dsh/skills/<x>/SKILL.md`（或直写 `config/skills/<x>/SKILL.md`）仍出 skill 卡，自主门开也一样。

## 根因（经理实测）
`shell-ask.mjs:392-393` 只把 workspaceRoot `realpathSync`，skill 根是 `join(realWs, '.dsh', 'skills')` 字面拼出。target 已被 `fs.resolve` 解析到 `<ws>/config/skills/new/SKILL.md`；`isPathUnder(target, <ws>/.dsh/skills)` 词法不中，root 本身 stat ENOENT → 直接 false（`containment.mjs` `if (!rootInfo) return false`），inode 回退不起作用。经理探针：当前判定 `inSkill=false`（两种写法都漏），skill 根改走「最长现存祖先 realpath + 缺失后缀」后 `inSkill=true`，普通文件仍 false；`config/skills` 建出来之后当前代码又能判中（inode 回退）——所以只漏「首次」。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/sdk/src/policy/shell-ask.mjs:359-398`（`fs` 在 :360 取到，:387 分支内可直接用）、`src/policy/resolve.mjs:46-80`（targets 怎么 resolve 的，同一口径）
3. `tests/unit/policy.test.ts:17-115`（RecordedListener、fakeCtx、provisionedConfig、VALID、next/nextResult、cleanups）

## 边界
1. 只动：`app/sdk/src/policy/shell-ask.mjs`（:392-395 一处）、`app/sdk/tests/unit/policy.test.ts`（新增一个 describe）、回执。别的不碰。
2. 先写失败测试（下面的 describe 照抄），**先不改产品代码跑它，看红**，红的原样贴回执。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；不跑全量 e2e。
4. 只在 feat/T7ce 提交；合并等经理验收。

## 第 1 步：先红（照抄进 `tests/unit/policy.test.ts` 文件末；import 行按需补 `existsSync`、`realpathSync`、`symlinkSync`、`basename`）

```ts
// T7ce（审查 C1）：`.dsh` 是链接、skills 未建 → 首次写 skill 仍出卡（门开态，漏卡＝直接 next）
describe('T7ce: skill roots are canonicalised like the targets', () => {
  it('ws/.dsh → ws/config with no skills dir: both spellings still ask; a plain file passes', async () => {
    const p = provisionedConfig(VALID)
    cleanups.push(p.cleanup)
    const ws = realpathSync(tmkdir('t7ce-ws-'))
    cleanups.push(() => rmSync(ws, { recursive: true, force: true }))
    mkdirSync(join(ws, 'config'))
    symlinkSync(join(ws, 'config'), join(ws, '.dsh'))
    // 照上游 fs.resolve 语义：最长现存祖先 realpath + 保留缺失后缀
    const resolve = async (raw: string): Promise<{ targetKey: string }> => {
      let a = raw.startsWith('/') ? raw : join(ws, raw)
      const rest: string[] = []
      while (!existsSync(a)) { rest.unshift(basename(a)); a = dirname(a) }
      return { targetKey: join(realpathSync(a), ...rest) }
    }
    const listeners: RecordedListener[] = []
    const ctx = {
      on: (event: string, listener: RecordedListener['listener']) => { listeners.push({ event, listener }) },
      get: (name: string) => name === 'sandboxPolicy' ? { resolve: () => ({ mode: 'workspace-write', workspaceRoot: ws }) }
        : name === 'fs' ? { resolve } : undefined,
    }
    plugin.apply(ctx as never, p.config as never)
    expect(listeners).toHaveLength(1)
    const l = listeners[0].listener
    for (const fp of [join(ws, '.dsh/skills/new/SKILL.md'), join(ws, 'config/skills/new/SKILL.md')]) {
      const out = await l({ name: 'write', arguments: { file_path: fp, content: 'x' } }, next) as { kind?: string; reason?: string }
      expect(out, fp).toMatchObject({ kind: 'ask' })
      expect(out.reason, fp).toContain('writing to a skill folder requires user approval')
    }
    expect(await l({ name: 'write', arguments: { file_path: join(ws, 'notes.md'), content: 'x' } }, next), '门开态普通文件放行（正对照）').toBe(nextResult)
  })
})
```

预期红：两个 skill 路径都返回 `nextResult`（`toMatchObject` 失败），`notes.md` 正对照绿。若红在别处（例如普通文件也不放行），停下写回执，不要改断言凑。

## 第 2 步：修（`shell-ask.mjs:393` 那一行换成下面这段，:392 与 :394-396 不动）

```js
      const rawSkillRoots = [join(realWs, '.dsh', 'skills'), join(realWs, '.agents', 'skills')]
      // T7ce（审查 C1）：skill 根自己也过 fs.resolve——`.dsh` 可能是链接（.dsh → config）且
      // skills 还没建，字面拼的根 stat 不到，isPathUnder 的 inode 回退救不回，首次写入漏卡。
      // fs.resolve 与 targets 同一口径（解析链接、保留缺失后缀；ssh 模式下是 fs-ssh 的远端口径）。
      // 只增不减：原根保留，解析失败不影响原判定。
      const skillRoots = [...rawSkillRoots]
      for (const r of rawSkillRoots) {
        try {
          const k = (await fs.resolve(r, { signal: exec.signal }))?.targetKey
          if (typeof k === 'string') skillRoots.push(k)
        } catch { /* 解析失败 → 只用原根 */ }
      }
```

## 验收（写命令，不写感觉）
```bash
T=$(mktemp -d /tmp/bot-T7ce-XXXX); mkdir -p $T/tmp $T/home
cd <feat/T7ce 工作目录>/app/sdk
E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
V="pnpm --config.verify-deps-before-run=false exec vitest run"
```
1. 先红：改产品代码前 `$E $V tests/unit/policy.test.ts -t 'T7ce'` → 1 failed，失败在 `toMatchObject`（贴原样）。
2. 修后：`$E $V tests/unit/policy.test.ts` → 73 passed（基线 72 + 1）。
3. 回归（单套顺跑）：`$E $V tests/e2e/skill-write-card.test.ts` → 全绿（9 passed）；`$E $V tests/e2e/write-outside.test.ts` → 10 passed。
4. 变异 M1：把新加的 `for` 循环整段注释掉 → `-t 'T7ce'` 红（贴原样），还原。
5. 覆盖：`$E $V tests/unit/policy.test.ts --coverage --coverage.include=src/policy/shell-ask.mjs` → 贴 Uncovered Line #s 原样，标出落在 `git diff <起点>..HEAD -- src/policy/shell-ask.mjs` 改动行里的（`catch` 一行可不覆盖，其余必须覆盖）。
6. 改动面：`git diff --stat <起点>..HEAD` 只含 `shell-ask.mjs`、`policy.test.ts`、`receipts/T7ce.md`。

## 为什么这样验收
要保住的是「bot 改自己能做什么，必须过用户」：skill 根被链接改了位置、目录还没建，是第一次写 skill 最常见的样子，正好是当前漏的那一下。测试用门开态，漏卡时结果是直接 `next`（零卡写成），而不是换成另一张门卡——这样红绿之间区分的是「出没出 skill 卡」，不是「出了哪张卡」。普通文件正对照防止修法把整个工作区都判成 skill 根。M1 证明测试咬的是新加的根，而不是别的分支碰巧出卡。

## 产出
- `app/sdk/src/policy/shell-ask.mjs`、`app/sdk/tests/unit/policy.test.ts`
- `work/tickets/receipts/T7ce.md`（贴第 1 步红、验收 1-6 原样）
