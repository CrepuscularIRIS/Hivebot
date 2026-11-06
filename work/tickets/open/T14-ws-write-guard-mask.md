# T14：缺陷——产品组合下 bot 用 write 写自己的工作区被 guard 软遮蔽拒（`sandboxPolicy.resolve` 拿不到 workspaceRoot）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：`work/tickets/receipts/T7a.md`「附记：e2e 阻塞的完整诊断链」；T5 复审附带初判（`work/tickets/review/T5-design.md` 末节：像产品缺陷，建议单开、不并 T9）
> 分支 / 作业目录：feat/T14 @ /tmp/bot-wt/T14
> claimed：（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：（经理验收通过时填：日期、HEAD）

## 目标
T7a 的 e2e 里，bot 用 `write` 写 `<dataDir>/workspaces/<botId>/.dsh/...`（它自己的工作区）被 `p2sdk-fs-guard: masked area` 拒，三种数据根布局都复现。guard 的软遮蔽例外只认 `sandboxPolicy.resolve({session}).workspaceRoot`（`app/sdk/src/policy/guard.mjs:284-295`、例外判定 `guard.mjs:165`），拒 = 这里拿到的是 undefined。T6 用同一套 guard 却成功。如果这是产品组合的通病，**产品里所有 bot 都写不了自己的工作区**（现有 UI e2e 只测过 bash，`app/ui/tests/e2e/workspaces.spec.ts:1-6`，文件工具在 UI 组合下可能从没被测过）。本单：最小复现 → 找根因 → 在根因处修 → 回归。

## 已知差异面（T6 成功 vs T7a 失败）
- **建会话方式**：T6 `session/create {request:{cwd}}`，id 由上游铸造（`app/sdk/tests/e2e/skill-save.test.ts:140`）；产品 M1 是 `{request:{sessionId:<main 铸的 session-uuid>, cwd}}`，走上游「claim 不存在的 id 即按该 id + cwd 新建」（`app/ui/main/m3-meta/orchestrate.ts:222`、`orchestrate.ts:366`、`orchestrate.ts:166-171` 注释）。**首要嫌疑**。
- patch 链：产品多链 `profile/patches/presets.yml`（UI e2e 用 `PRESETS_PATCH`）。
- 启动 cwd：UI 的 `launchSdkRuntime` 与 sdk 的 `launchRuntime` 不同。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（P5-03 fake 游标坑）
2. `work/tickets/receipts/T7a.md` 附记全文
3. `app/sdk/src/policy/guard.mjs:145-175`（judgePath）、`:280-295`（取 workspaceRoot）
4. 模板：`app/sdk/tests/e2e/skill-save.test.ts`（launch / fake 脚本 / `readRequests`），建目录用 `tests/support/tmp-sweep.ts` 的 `tmkdir`
5. 上游会话创建与 sandboxPolicy 的会话绑定：`repos/deepseek-harness/packages/` 下 session-controller 与 sandbox-policy 的 README（按需 grep `resolve(`、`claim`）

## 边界
1. **先写失败测试**（不改产品代码前跑红，贴原样输出）：新建 `app/sdk/tests/e2e/ws-write-claim.test.ts`，一个 runtime、产品 patch 链（与 `start.ts` `buildArgs` 相同 + `presets.yml`），三格：
   - ① claim 建会话：`session/create {request:{sessionId:'session-'+randomUUID(), cwd:<ws>}}`，fake 脚本 `write` 相对路径 `probe.txt`（内容随机串 R）再 `write` 绝对路径 `<ws>/probe2.txt` → 断言两条 toolResult `isError === false`、两文件在 ws 且内容对、0 张审批卡。**预期红**（复现 T7a）。
   - ② 对照：只给 `{cwd}` 建会话，同脚本 → 预期绿。
   - ③ 定位格：claim 建会话但不链 `presets.yml` → 结果如实记录（红绿都算，用于定位）。
   - 若 ① 在 sdk 层是绿的（复现不了），说明差异在 UI 侧启动：改在 `app/ui/tests/e2e/ws-write.spec.ts` 用 `launchSdkRuntime` + `createBots` + 同一脚本复现，回执写明。两处都复现不了就停下写回执，不修。
2. **根因先于修复**：回执写根因（文件:行 + 一句话），以及为什么 T6 那条路没踩到。
3. 只在根因处修：预计在 `app/sdk/src/policy/guard.mjs`（取 workspaceRoot 的方式）或 `app/ui/main/m3-meta/orchestrate.ts`（建会话参数）其一。若根因在上游行为（例如 claim 建的会话不登记 sandboxPolicy 会话绑定），修法是我们这一层改为从可靠来源取工作区（例如会话 header.cwd），**不改上游、不放宽遮蔽**；需要在两种修法间做取舍时停下写回执，由经理定。
4. 严禁用「去掉软遮蔽 / 给数据根整体开例外」之类放宽来让测试变绿。
5. 测试走隔离 HOME / TMPDIR（`/tmp/bot-T14-*`），DBus 指不存在路径；只跑下面列的文件。load > 20 等一等。

## 验收（写命令，不写感觉）
统一前置：
```sh
T=$(mktemp -d /tmp/bot-T14-XXXX); mkdir -p $T/tmp $T/home
cd /tmp/bot-wt/T14/app/sdk
E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
V="pnpm --config.verify-deps-before-run=false exec vitest run"
```
1. 先红：修前 `$E $V tests/e2e/ws-write-claim.test.ts` → ① 红，错误含 `masked area`（贴原样）；② 绿。
2. 修后：同命令 → 3 passed。
3. 安全回归不坏：`$E $V tests/e2e/guard-fs.test.ts tests/e2e/write-outside.test.ts tests/e2e/skill-save.test.ts tests/unit/start.test.ts` → 与起点同数全绿（起点数先跑一次记下；guard-fs 若在基点就有已知超时格（P5-H8），以基点同格同结果为准）。
4. 变异：撤销修复 → 验收 2 的 ① 红（贴原样输出，cp 备份还原，不提交）。
5. 遮蔽没被放宽：在 ① 的会话里再 `write <dataDir>/bots.json`（数据根顶层、非本 bot 工作区）→ 仍被拒（加成 ① 的子断言）。
6. T7a 解阻：在 feat/T7a worktree 合入本单后 `pnpm build && sh scripts/run-e2e.sh tests/e2e/skills-enable.spec.ts` → 1 passed（若 T7a 另有失败与本缺陷无关，回执写明，不在本单修）。
7. 改动面：`git diff --stat <起点>..HEAD` = 新测试文件 + 根因处一个产品文件（+ 必要时其单测）。
8. 收尾：`ls -A $T/tmp | grep -v node-compile-cache | wc -l` → 0；独立 shell `pgrep -af 'bot-T14' | grep -v pgrep` → 空。

## 为什么这样验收
要保住的是「bot 能写自己的工作区、仍写不了别处」两件事同时成立。① 用产品真实的建会话方式（带 sessionId 的 claim）复现，② 用 T6 的方式做对照，二者只差一个变量，能把根因钉在建会话路径上而不是猜；③ 排除 presets.yml。验收 5 防止用放宽遮蔽的方式修好（那会把 P5-02 的凭证保护拆掉）。验收 6 是这张单存在的直接原因。

## 风险
- 若根因在上游 claim 路径，修法涉及「guard 改从 header.cwd 取工作区」——header.cwd 不可被 working_directory 改动（`guard.mjs:13-15` 注释已以它为准），语义一致；但要确认取 header 的 API 对子代理会话同样有效，回执写明。
- fake 游标坑：每个会话脚本一次写全。

## 产出
- 新建：`app/sdk/tests/e2e/ws-write-claim.test.ts`（或 UI 侧 `app/ui/tests/e2e/ws-write.spec.ts`，按边界 1）
- 修改：根因处一个产品文件
- 回执：`work/tickets/receipts/T14.md`（先红输出、三格结果矩阵、根因、变异输出、T7a 解阻结果）
