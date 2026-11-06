# T10b：ssh-bash 探针移出 /tmp（变异不咬合的根因）+ ③a 回到设计形态 + 回执

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T10 终验不通过（第 1 次，@ 9e43562c）；receipts/T10.md「## 终验（经理）」
> 分支 / 作业目录：feat/T10 @ /tmp/bot-wt/T10（同分支续提交）
> claimed：
> accepted：

## 目标
让 `ssh-bash.test.ts` 在**标准跑法**（TMPDIR 在 /tmp 下）里真能区分「有 wrapper / 没 wrapper」。产品代码 T10 已对，本单基本只改测试。

## 根因（经理实验已坐实，不用再诊断）
上游 helper 的 bwrap profile 在 workspace-write 档自带 `--tmpfs /tmp`（`node_modules/.pnpm/@deepseek-ai+dsh-sandbox-local@*/…/lib/index.js:34-35`）。测试的宿主哨兵 HOME（`TEST_ROOT`）和远端夹具（`ssh-host.ts:82` 的 `tmkdir` → `os.tmpdir()`）都在 /tmp 下，所以**原版 helper 沙箱也看不见它们**——挡住哨兵的是 /tmp 被私有 tmpfs 盖掉，不是读遮蔽。HEAD~1 能先红，是因为当时 mode 丢了、落在 read-only 档（read-only 不加 tmpfs /tmp）。
实测（同一 HEAD，只换 TMPDIR）：

| 变异 | TMPDIR=/tmp/… | TMPDIR=/var/tmp/… |
|---|---|---|
| 无（HEAD） | 5 绿 | 5 绿 |
| ③c 换回原版 sandbox-ssh | 5 绿（不咬合） | ④a ④b 红（读到 `HOST-KEY-SENTINEL-T10rc=0`） |
| ④d-2 confine 直通 `return plan` | 5 绿（不咬合） | ④a ④b 红 |
| r1 只传远端根 | — | ④a 红、④b 绿（如设计） |
| Hello.root 当 `--policy` | ④c 红（计数 43） | — |
| 删 mode 补丁行 | ③a ④c 红 | — |

结论：wrapper 的必要性不受损（真实部署 HOME 在 /home/<user>，不在 /tmp）。是探针位置太弱。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md 最后一条（本单的教训）
2. `app/sdk/tests/e2e/ssh-bash.test.ts`、`app/sdk/tests/support/tmp-sweep.ts:16-28`、`app/sdk/tests/support/ssh-host.ts:80-90`

## 施工面
1. `ssh-bash.test.ts` 顶部（`TEST_ROOT` 之前）把本文件的临时根挪出 /tmp，夹具跟着走（`tmkdir` 每次调用都读 `os.tmpdir()`）：
   ```ts
   // T10b：④ 探针必须在 /tmp 之外——上游 workspace-write profile 自带 --tmpfs /tmp
   // （dsh-sandbox-local lib/index.js:34-35），夹具在 /tmp 下时原版 helper 也"挡住"，变异不咬合。
   const OUTSIDE_TMP = trackTmpDir(mkdtempSync('/var/tmp/bot-T10-'))
   process.env.TMPDIR = OUTSIDE_TMP
   ```
   并在 `beforeAll` 里 `startSshServer()` 之后加前提断言（防以后有人挪回 /tmp 让 ④ 变成空测）：
   ```ts
   for (const p of [TEST_HOME, server.remoteHome]) expect(p === '/tmp' || p.startsWith('/tmp/'), `探针必须在 /tmp 外：${p}`).toBe(false)
   ```
2. ④a 命令保留 `; echo rc=$?`，加断言 `toMatch(/rc=[1-9]/)`（DESIGN「退出非零」，也证明 bash 真跑了）；④b 命令改 `cat ${sentinel}; echo rc=$?`，同样加 `toMatch(/rc=[1-9]/)`。
3. ④c 计数断言改精确：`expect(r.toolResults[0]!.text.trim()).toBe('0')`（现在的 `toContain('0')` 遇到 10/20/30 也绿）。
4. ③a 回到 DESIGN D3 形态：第一个工具调用改成 bash 直写
   `toolCall('bash', { command: \`printf %s '${server.mark}' > mark.txt\`, description: 'T10 3a write' })`，第二个保留 `cat mark.txt` 读回；断言加 `readFileSync(join(ws, 'mark.txt'), 'utf8') === server.mark`，并断言本会话 0 张卡：`eventsFrames.filter((f) => f.event === 'approval/request' && f.agentId === sessionId).length === 0`。
   理由：「bash 直写被 read-only 挡」是 mode 补丁前的现象，补丁后已不成立（经理探针：直写形态在 HEAD 两种 TMPDIR 下都绿）；直写形态才证明 wrapper 保留了 profile 的 `--bind <ws>` 写通路，读回形态靠 `--ro-bind / /` 也能过。
5. （一行，可选但推荐）`sandbox-zone-ssh.mjs:42` 的 `new SandboxUnavailableError(\`…\`)` 改成 `new SandboxUnavailableError(policy.mode, \`…\`)`——上游构造签名是 `(mode, detail)`（dsh-sandbox lib/index.js:343-345），现在把说明文字塞进了 mode 槽，报错文案成了 `sandbox mode "p2sdk sandbox-zone-ssh: …" is requested…`。④e 单测断言类型不变即可。
6. 写 `work/tickets/receipts/T10.md` 正文（T10 原本就欠的验收 6）：施工节 + T10b 节，贴原样命令与输出尾部；经理的终验节已在文件里，往上插，别删。

## 边界
1. 只动 `app/sdk/tests/e2e/ssh-bash.test.ts`、（第 5 条）`app/sdk/src/policy/sandbox-zone-ssh.mjs` 一行、`work/tickets/receipts/T10.md`。`ssh-host.ts` / `tmp-sweep.ts` 不改（别的测试共用）。
2. 先红：第 1 条落地后、第 4 条之前，先跑一次 ④d-2 变异（`sandbox-zone-ssh.mjs` confine 里 `super.confine` 后直接 `return plan`）在**默认 TMPDIR（/tmp 下）**下 → ④a ④b 红，贴输出；再撤变异。
3. 不改 shell-ask / policy-state / guard / start.ts。

## 验收（写命令，不写感觉）
（cd /tmp/bot-wt/T10/app/sdk；隔离 HOME，**TMPDIR 在 /tmp 下**〔如 `/tmp/<x>/tmp`〕，DBus 指不存在路径；e2e 同刻一套）
1. `vitest run tests/e2e/ssh-bash.test.ts` → 5 passed。
2. 变异五刀，每刀单跑上面那条，撤后 `git status` 干净：
   - ③c：`start.ts` 删 `p2sdk-sandbox-zone-ssh` 行块 + 去掉 `sandbox-ssh` 的 `disabled: true` → ④a ④b 红
   - ④d-2：confine 直通 `return plan` → ④a ④b 红
   - r1：`argv: [...this.p2sdkWrapperArgv.slice(0, 3), ...extra, ...remote]` → ④a 红、④b 绿
   - Hello.root：`extra` 里追加 `/tmp/dsh-ssh-*` 每个目录作 `--policy` → ④c 红
   - 删 `sandbox-policy` 覆盖行的 `mode:` → ③a 红
3. `vitest run tests/unit/sandbox-zone-ssh.test.ts tests/unit/start.test.ts tests/unit/guard.test.ts` → 2 + 42 + 26 passed。
4. 回归：`tests/e2e/ssh-product.test.ts` 5、`tests/e2e/guard-plugin-manager.test.ts` 7、`tests/e2e/ssh-fs-zone.test.ts` 9；跑后 `pgrep -af bot-wt/T10` 空、`ls -d /var/tmp/bot-T10-*` 空（trackTmpDir 清扫）。
5. `git diff --stat 9e43562c..HEAD` 只含边界第 1 条的文件。

## 为什么这样验收
T10 的 ④a 是 ssh 安全链收口的证明格；它若在标准跑法下对「删掉 wrapper」不敏感，合进去就是一张永远绿的空测——以后 sandbox-zone-ssh 被改坏也没人知道。所以本单的验收核心是第 2 条：在 /tmp 下的默认环境里五刀各红。

## 产出
- `app/sdk/tests/e2e/ssh-bash.test.ts`（改）
- `app/sdk/src/policy/sandbox-zone-ssh.mjs`（一行，第 5 条）
- `work/tickets/receipts/T10.md`（施工节 + T10b 节）
