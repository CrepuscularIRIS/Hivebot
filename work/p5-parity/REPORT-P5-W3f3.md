# REPORT · P5-W3.f3（L-8 复审 FAIL 修复链）

2026-11-04 06:21 · worktree `/tmp/bot-wt/P5-W3f3` · 分支 `feat/P5-W3f3` · 基点 main@92cb6af
输入：`work/p5-parity/REVIEW-L-8.md` R1–R4（4 major）+ O2；任务行 PLAN.md:237

提交：
- `16029aa` fix(p5): P5-W3.f3 SDK 侧 L-8 R1+R4（产品 2 + 测试 2 文件）
- `6ffce9c` fix(p5): P5-W3.f3 UI 侧 L-8 R2+R3+O2（产品 2 + 测试 1 文件）

## 逐条 FIXED

### R1 · policy-state 曾 provision 后被删除 → 文件门静默开 · 已修
- **根因**：L-7 R6 的 `policyStateProvisioned` 只看当前 statSync，全候选 ENOENT 一律当「从未 provision」——paused/fault 状态文件在会话中被删除（清理/轮换/手工 rm/写端崩溃留空缺）后，`fileGateOpen` 下一次调用即放行，暂停/故障门被静默撤销（L-8 verifier 复现：ask 会话回 next、never 会话文件工具复活）。
- **修法**（`shell-ask.mjs` fileGateOpen）：记忆「曾 provision」两级——进程内 latch（本会话）+ 状态文件同目录伴生标记 `.p2sdk-policy-state-seen`（跨重启）。文件出现过的证据使删除后门保持关（文件工具回 ask / never 回 deny），直到出现有效状态。标记只写给当前真有状态文件的候选路径；写在 mask 根内（模型不可伪造/不可读，决策 13① 硬 NEVER 域）。**「从未存在 → 不门控」原样保留**（L-8 未否决 missing 语义）：新测试断言 never-provisioned 目录放行且零伴生文件。
- **已知上限**（代码注释已记）：数据目录整棵轮换清空时标记随状态文件一起消失 = 回到「从未存在」，由 P5-29 写端重连重写自愈。
- **证据**：单测 4 例（ask 会话删除后仍 ask / never 删除后仍 deny / 重启〔新 apply 闭包〕凭标记仍关门 / missing 语义不回归）。

### R2 · args=JSON null 结果卡投影抛异常整页挂 · 已修
- **根因**：`JSON.parse('null')` 返回 null 不抛，`as Record` 是编译期断言，`args[key]` 解引用在 try 外；f2 的聚合投影（feed/page）逐条走覆盖层投影但无隔离——一条坏实参让整页转录 load error 且刷新恒挂（L-8 verifier 实测形状）。
- **修法**（`overrides/modules/model.ts`）：三层——① parse 后守卫非 null/非数组才当实参表（shim `argText` 同款语义，'[1,2]'/'"s"'/'123' 一并回落空表）；② `projectTranscriptEntry` 附卡失败退回无卡投影（行仍可见）；③ 聚合入口走 `projectOne` per-entry try/catch，连上游投影自身抛错的条目也只跳过该条。
- **证据**：单测 3 例（'null'+failed result 附卡不抛、非对象 JSON 安全、毒条目〔args/kind getter 抛〕不杀 feed/page，好条目与游标存活）。

### R3 · decision='allowed-once' 遮住完整输出 · 已修
- **根因**：view.tsx:45 `detail = summary || diff || output`，无条件 `summary: decision ?? ''` 把已审批 bash 的完整 stdout/错误详情遮成一行 'allowed-once'（L-8 verifier 真投影复现）。
- **修法**：`summary` 仅 result 为空时回落 decision（报告给的形状 `(result === null || result === '') ? (decision ?? '') : ''`）——拒绝（result 空时 decision='rejected'）仍可见，成功路径 output 全文呈现。
- **证据**：单测 2 例（allowed-once+result → summary '' 且 detail 取到全文；rejected+无 result → summary 'rejected' 不回归）。

### R4 · 一次性联网许可被多个后台 bash 共享 · 已修
- **根因**：`hasLivePermit` 只读，第二次同命令 bash 的 pre-execute 在第一个 wrapper unlink 之前也能借同一许可 `next()`——两次都跳过审批；wrapper 侧 unlink 只保证一个联网，输家**断网照跑**，本地副作用（如 `printf x >> log.txt`）重复执行，卡面「单次使用」承诺被破。
- **修法**（`request-net.mjs`）：`hasLivePermit` → `claimLivePermit`，命中即**原子 rename** `permit-*.json` → `claim-<uuid>.json`——同一源文件只有一个赢家（并发 pre-execute / wrapper 争抢不破），输家落回出卡而非静默执行；改名产物仍是 `.json` 且 session/argvHash 不变，**wrapper 的 claim_permit 认领联网不失**（真 python3 importlib 加载 bwrap-wrap.py dry-run 对拍钉死）；过期 claim 文件由 wrapper 既有 TTL 清理收走（它对一切 `.json` 过期即删）。shell-ask.mjs 调用点与注释同步换语义。
- **兼容性核查**：e2e `request-network.test.ts` 全程 `provision()` 写有效 policy-state → `bashAlways` 为真、permit 分支被跳过，且 `permitCount()` 数的是目录全部文件（rename 前后都是 1）——该文件不受影响（留给 verifier 实跑确认）。
- **证据**：单测 5 例（第二次同命令出卡 / claim 产物 wrapper 可认领 / 两张许可授权两次第三次出卡 / 非本会话非本命令不消耗 / python3 dry-run 对拍）。

### O2 · CoordinatorPortBridge 类型悬空 · 已修
- 改从真正导出位置 `recovered/contracts/desktop-bridge`（:259）import；`production/coordinator-client` 只 import 不 re-export。
- **验证**：ad-hoc tsc（include overrides+shim，`types:[]` 绕开无关 TS2688，L-8 verifier 同法）——coordinator-client.ts / model.ts 零报错；`market-store.ts` 的 TS7016（.mjs 无声明）为基线既有，不在本链。

## 红基线（先红后绿）

- `policy.test.ts` 新 7 例：4 例先红（删除转移 ×3 + 标记缺失）；R4 3 例先红（第二次放行 / 未改名 / 第三次放行）
- `request-net.test.ts` 新 2 例：先红（claimLivePermit 不存在）
- `p5-w3f3.test.ts` 新 5 例：3 例先红（null 抛异常 / 聚合挂 / summary 遮输出），2 例为防过紧回归钉（非对象 JSON 安全、rejected 可见——基线即绿）
- 修复后全部转绿；断言走真实 apply 监听器 + 真实 fs + 真实投影函数，无硬编码。

## 回归（定向单测；load 高，全量与 e2e 留给 verifier）

| 范围 | 命令 | 结果 |
|---|---|---|
| app/sdk 全部单测 | `pnpm -C app/sdk vitest run tests/unit/` | **11 文件 205/205** |
| app/ui 全部单测 | `pnpm -C app/ui vitest run tests/unit/` | **37 文件 410/410**（基线 405 + 新 5） |
| overrides+shim 类型 | ad-hoc `tsc --noEmit`（O2 验证法） | 本链文件零报错 |

未跑（按负载约束 + 派发指示）：app/sdk 全量 `pnpm test`（含 e2e）、app/ui `pnpm build` + e2e、renderer-grok `pnpm check`。注意 LEARNINGS：e2e 前必须 `pnpm build` 重建 dist。

## 未完成 / 新发现

- L-8 的 O1/O3/O4/O5（minor）不在本链派发范围，未动，待派发者裁决。
- `market-store.ts` 在严格 tsc 下报 TS7016（.mjs import 无声明）——基线既有、运行时无影响，记录备查。
- R4 余量：wrapper 的 read→unlink 窗口与 SDK rename 竞争时，该 wrapper 错过那一张但 claim 文件仍留在目录里可被下一次 wrapper 认领——单次使用不变量不破，只是联网可能落在另一条等价调用上（同为用户已批过的同命令）。

待 verifier 验收。
