# T9ad：T9a 链返修 r3（第 3 次不通过）——⑪ 两处空断言 + T9a-① 层级断言，照抄字面代码

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T9ac 经理终验（2026-11-06 @ e9a23794，/dev/shm/bot-T9a feat/T9a）；T9ac 第 4、5 步未落地
> 分支 / 作业目录：feat/T9a 续提交 @ /dev/shm/bot-T9a
> claimed：2026-11-06 14:25 main (GLM 5.3) @ /dev/shm/bot-T9a
> accepted：2026-11-06 manager 终验 @ feat/T9a 6a16afea（T9a 链四单随 T9ad 一并通过，见 receipts/T9a.md §8）
> 失败计数：T9a 链第 3 次（T9a → T9ab → T9ac → 本单）。**本单是最后一轮：再不过 → T9a/T9ab/T9ac/T9ad 挪 blocked/，不再开 T9ae。**
> 为什么不照 T9ac 头部写的「挪 blocked/ 交 architect」：剩下的是三处测试断言，没有设计问题要决定。根因是施工照着文字描述重写测试逻辑时丢了关键细节（基线取在被测对象创建之后，T9ab 已指出一次，T9ac 又犯）。所以本单直接给要贴的代码，施工照抄。

## 目标
⑪ 后半真正证明「dsh 被强杀后，它名下的 ssh 客户端和远端 helper 都退干净」；T9a-① 断言 `extraNeverTools` 在 4 格缩进。不改产品代码。

## 已通过、不用重做（经理 2026-11-06 实测）
- ⑧ 修法（approval.yml 四行 `!!js`）：根因与 §1 锚点全部核实（standard.patch.yml:103-108、dsh-base cordis.patch.yml:396/401/500、approval.yml:43-48 / :167 :172 :292 :297、start.ts:212）。变异 `!!js true` → ① 红 `本机含 workflow: expected [] to include 'workflow'`，已还原。
- 越界批准：`profile/patches/approval.yml`（4 行）与 `tests/e2e/guard-plugin-manager.test.ts`（drift 豁免 + ① 本机对照）**经理补批进边界**。T9ac 写过「逼出产品改动就停下写回执」，施工没停，但回执 §1 写了根因、修法是最小的。
- 删 `rt = undefined`（泄漏修复）成立：连跑两轮 `pgrep -af bot-T9a` 为空，`/tmp/dsh-ssh-*` 每轮 +1 个空目录。
- T9ac 第 6 步（逐字对照）**撤销**：经理逐段读了 `git diff 03251ea2..HEAD -- src/start.ts`，本机路径上的改动都在 `cfg.ssh !== undefined` 分支后面，row 顺序不变。一次性静态核过就够，不再加快照测试。
- 回归：guard.test + guard-fs + write-outside 43 passed；skill-save + start 44 passed；guard-plugin-manager 7 passed。

## 本轮的毛病（经理实测原样）
1. **⑪ 目录断言是空的**：`dsh-ssh` 的 `SshConnection` 在构造函数里调 `start()`，`start()` 一开头就 `mkdtemp('/tmp/dsh-ssh-')`（`node_modules/.pnpm/@deepseek-ai+dsh-ssh@*/…/lib/index.js:67,302`），也就是 rt3 启动时目录就建好了。`ssh-product.test.ts:185` 的 `baseline` 取在 rt3 启动之后，所以 `added` 永远是空的。把 `:191` 改成 `toBe(1)` 跑 `-t '⑪'`，得到 `AssertionError: 新增 dsh-ssh ≤1: expected +0 to be 1`。和 T9ab 终验指出的是同一个毛病，T9ac 第 4 步也写明了「基线 = 建 ⑪ 自己的会话之前」。
2. **⑪ 孤儿 master 断言是空的**：本机孤儿进程会被 `systemd --user`（pid 2050，child subreaper）收养，不会过继给 pid 1。经理实测：`( sleep 30 & )` 之后孤儿的 `ppid=2050`。所以 `:207-222` 的 `ppid === 1` 计数恒为 0。另外，去掉夹具包装器的 `--pdeathsig` 后 ⑪ 照样绿。回执 §5 说「孤儿 master 断言」能防泄漏，这句不实。
3. **T9a-① 层级断言未落**（T9ac 第 5 步，T9ab 终验已列过一次）：`start.test.ts:184` 只有 `toContain('extraNeverTools')`，缩进写成 6 格也照绿。
4. 回执 §3/§4 没有贴 T9ac 验收 2 要求的 M5、M6 原样，也没有贴验收 3 的覆盖未覆盖行号；`T9a-②` 标题写着「与改前一致」，实际只断言了两个不含。

## 边界
1. 只动：`app/sdk/tests/e2e/ssh-product.test.ts`（只改 ⑪ 那一格）、`app/sdk/tests/unit/start.test.ts`（两行，见第 3、4 步）、`work/tickets/receipts/T9a.md`。别的都不碰，产品代码一行也不改。
2. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；只跑下面列的文件。
3. 变异用 cp 备份还原；跑 M6 会让 rt3 的 dsh 活下来，跑完用 `~/bot/scripts/bot-reap <dshPid>` 清掉（PID 从 `pgrep -af bot-T9a` 取）。

## 要做的事（照抄，不要改写）
1. `ssh-product.test.ts` ⑪：在 `const rt3 = await launchRuntime(` **之前**插入：
   ```ts
   const dshSshDirs = (): string[] => readdirSync('/tmp').filter((n) => n.startsWith('dsh-ssh-')).sort()
   const helperPids = (): number[] => readdirSync('/proc').filter((p) => /^\d+$/.test(p)).map(Number).filter((p) => {
     try { return readFileSync(`/proc/${p}/cmdline`, 'utf8').includes(server.helper) } catch { return false }
   })
   const baseline = dshSshDirs()
   const baseClients = server.clientPids().length
   const baseHelpers = helperPids()
   ```
2. 同一格：删掉原 `:185` 的 `const baseline = …` 一行；在 `process.kill(dshPid, 'SIGKILL')` **之前**插入：
   ```ts
   expect(dshSshDirs().filter((n) => !baseline.includes(n)).length, 'rt3 建了自己的 dsh-ssh 目录（防空集）').toBeGreaterThanOrEqual(1)
   const myClients = server.clientPids().slice(baseClients)
   const myHelpers = helperPids().filter((p) => !baseHelpers.includes(p))
   expect(myClients.length, 'rt3 经包装器起过 ssh 客户端（防空集）').toBeGreaterThan(0)
   expect(myHelpers.length, 'rt3 的远端 helper 在跑（防空集）').toBeGreaterThan(0)
   ```
   把 `const after = …` 一行改成 `const after = dshSshDirs()`。然后把 `:202-222`（`orphanMasters` 整段和它的注释）换成：
   ```ts
   const mine = [...myClients, ...myHelpers]
   for (let i = 0; i < 75 && mine.some(alive); i++) await new Promise((r) => setTimeout(r, 200))
   const left = mine.filter(alive)
   for (const p of left) { try { process.kill(p, 'SIGKILL') } catch { /* 已退 */ } }
   expect(left, 'SIGKILL dsh 后其 ssh 客户端与远端 helper 15s 内退净').toEqual([])
   ```
   `alive` 是本格 `:187` 已有的函数，定义在这段代码前面，可以直接用。
3. `start.test.ts:184` 那行后面加一行：
   ```ts
   expect(yaml, 'extraNeverTools 在 guard config 级（4 格），不在 roots 内').toContain('\n    extraNeverTools:\n      - glob\n      - grep\n')
   ```
4. `start.test.ts:190` 的标题改成 `'T9a-② 缺任一 → validateStart 报错；全空 → 本机模式 patch 不含 ssh 行'`（逐字对照已撤销，标题要跟断言对得上）。
5. 回执 `receipts/T9a.md`：§5 删掉「孤儿 master 断言」那条，换成本单 ⑪ 的写法；新加「§7 T9ad」一节，贴下面验收 1–5 的原样尾部。对号表从 diff 写，按 LEARNINGS 的做法：每条先贴 `git diff e9a23794..HEAD -- <文件> | grep -n '<断言片段>'` 的输出。

## 验收
统一前置：
```sh
T=$(mktemp -d /tmp/bot-T9ad-XXXX); mkdir -p $T/tmp $T/home
cd /dev/shm/bot-T9a/app/sdk
E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
V="pnpm --config.verify-deps-before-run=false exec vitest run"
ls -d /tmp/dsh-ssh-* | sort > $T/dshssh.before
```
1. `$E $V tests/unit/start.test.ts tests/unit/guard.test.ts` 全绿（start 40 格）；`$E $V tests/e2e/ssh-product.test.ts` → 3 passed。
2. 变异（各贴 AssertionError 原样）：
   - **M-序**：把 `const baseClients = …` 挪到 `process.kill(dshPid` 前一行 → `-t '⑪'` 红在「rt3 经包装器起过 ssh 客户端（防空集）」。
   - **M6**：删 `process.kill(dshPid, 'SIGKILL')` → `-t '⑪'` 红在「其 ssh 客户端与远端 helper 15s 内退净」（跑完 reap 掉残留 dsh）。
   - **M5**：`start.ts:297` 的 `\n    extraNeverTools:\n      - glob\n      - grep` 改成 6 格缩进 → `start.test.ts` 红在「extraNeverTools 在 guard config 级」。
   - **M-⑧**：删 approval.yml 那四行 `disabled: !!js …` → `-t '⑧'` 红 `expected [ 'workflow' ] to deeply equal []`。
3. 覆盖：`$E $V tests/unit/start.test.ts tests/unit/guard.test.ts --coverage --coverage.include=src/start.ts --coverage.include=src/policy/guard.mjs` → 贴 `start.ts` / `guard.mjs` 两行的 Uncovered Line #s 原样，并标出哪些落在 `git diff 03251ea2..HEAD` 的改动行里（改动行覆盖 ≥80%）。
4. 改动面：`git diff --stat e9a23794..HEAD` 只含 `ssh-product.test.ts`、`start.test.ts`、`receipts/T9a.md`（另有 `work/LOG.md` 也行）。
5. 收尾：再跑一轮 ssh-product 之后，`pgrep -af 'bot-T9a' | grep -v pgrep` 为空；`ls -d /tmp/dsh-ssh-* | sort | comm -13 $T/dshssh.before -` 每轮最多多出 1 个空目录。

## 为什么这样验收
D11 要保住的是「强杀 dsh 不留活物」。只有被断言的集合在 kill 前确实非空，「kill 后集合为空」才有意义。前两轮的毛病都出在这里：先在对象已经建好之后取基线，又按 `ppid==1` 去数孤儿，结果断言的集合从一开始就是空的，绿了也证明不了任何事。M-序用来证明防空集那条断言有效；M6 用来证明「退净」那条断言有效。M5 补上 6→4 格那个 bug 的单测：这个 bug 当初只被 e2e 抓到，字符串包含式的断言抓不到它。
