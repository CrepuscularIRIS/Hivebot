# REPORT-P5-51.f1 · e2e 持久条目侧别断言（盲区修复）

- 分支：`feat/P5-51f1`（基点 0c2aefb）· commit `4e47b15`
- 改动：仅 `app/ui/tests/e2e/grok-shim.spec.ts`（+21 -6）。产品代码零改动（`renderer-grok pnpm check` upstream diff=0）。

## f1 段（新断言）

D9 断言后（`window.__pbotsShim.answers` 读内存，reload 即清，故置于其后）：

1. `page.reload()` → boot（`.sand-agent-item` 计 1）
2. `.sand-virtual-transcript .sand-message[data-role="assistant"]` filter hasText「收工。」→ `toHaveCount(1)`（持久条目侧别；transcript.tsx:776 渲染 `data-role={entry.role}`，缺 role 落 user 侧 → 0 条）
3. 该消息内 `pre` `toHaveCount(1)`（markdown 代码块；UserMessageContent 纯 `<p>` 无 pre；scope 限定消息内，避开 tool/thinking 卡的 `sand-outline-item__detail-text` pre）
4. reload 后 live-stream 条目（entries.ts:88）不存在，判侧全靠 entries.ts:71 持久序列化的 `role:'assistant'`——盲区即被封死

## 红基线（双循环，均在正式 spec 上）

| 轮 | 操作 | 结果 |
|---|---|---|
| 1 | 摘 entries.ts:71 `role:'assistant'` → rebuild → 跑 spec | spec:140 红（persisted toHaveCount got 0）；**流式段 spec:107 pre=1 仍绿**——精确复现 VERIFY 描述的盲区 |
| 1' | 恢复 → rebuild | 1 passed (6.6s) |
| 2（探针 spec 先行验证，同款） | 同摘/恢复 | 同红/绿 |

## 附带修（同 spec 内，f1 段能跑通的前提）

**现象**：动 f1 前先复跑原 spec，既有断言 spec:109（okCanary 落地）在当前 main 稳定红（4 次，>120s 不落地），verify P5-51 时（40bcab8）是绿的。

**排查链**（探针实证，非推测）：sdk 直连探针（同 patch/preset）3s 全通 → Electron 场景 shim 观测面 dump：作答 `$events/result` **res.ok=true**、tool item `decision:"allowed-once"`、`status:"done"`、result=`touch: cannot touch '<ws>/p551-ok': No such file or directory`——bash 真执行了，但沙箱内看不到 ws。

**根因**：P5-25（41dccbe，**在 40bcab8 之后合并**，verify P5-51 时树上没有）把 #3/#4 的 cwd 强制为 `$PBOTS_DATA_DIR/workspaces/<botId>`（`app/ui/main/m3-meta/orchestrate.ts:4/45/67`；shellChildEnv 设 `PBOTS_DATA_DIR=<home>/data`）。沙箱只 bind 数据根（沙箱内 `ls /tmp` 实证：只有 `<home>` 与 `bot-wt`），runtime cwd（ws=/tmp/bot-p551-ws-*）沙箱内不可见 → touch 失败。属 P5-51.spec × P5-25 的合并接缝（LEARNINGS「两分支各自绿 ≠ 合并后绿」又一例）。

**修法**：spec 内 canary 改 `join(shell.home,'data','workspaces',sid)`（P5-25 的产品语义路径），bash 用相对路径 `touch p551-ok`（cwd=workspace）。修复后整条 spec 回到 6.6s 全绿。

## 测试

- `pnpm test:e2e tests/e2e/grok-shim.spec.ts` → **1 passed (6.6s)**
- 红基线摘/恢复两轮如上
- `vitest run tests/unit/grok-shim` → 29 passed
- `renderer-grok pnpm check` → upstream diff=0: 332 files
- **全量 e2e：63 passed + 2 failed**——`market.spec.ts:175` 与 `journeys/d4-d5-d6-journey.spec.ts:37`，失败点同为 MCP filesystem `read_file` 读 `rt.home/workspace/*`（沙箱不可见，P5-25 同根因接缝）。**非本改动引入**：主仓 main（97f1f77，P5-56 已并）复跑 market.spec 同样 `1 failed`；本 worktree 仅改 grok-shim.spec.ts 一个文件。

## 新问题（建议派发，不在本任务范围）

- [FIX-candidate] P5-25 接缝存量：`market.spec.ts:263` 与 `journeys/d4-d5-d6-journey.spec.ts:90`（X 实调 filesystem `read_file`）把测试文件写 `rt.home/workspace`，沙箱内不可见 → tool-row 永不 done。修法同款：文件落 session workspace（d4-d5-d6 的 canary 段已用 `devState(page).views[a].cwd` 的正确姿势，D5 段照搬即可）。另：P5-51 verify 后 main 上无全量 e2e 记录，两 spec 红了至少一个合并窗口未被发现。

## 备注

- P5-51 的 OBS 项（user 消息投影 assistant 侧）不影响本断言：断言按「含『收工。』的 message 条目」过滤，摘 role 时该条目落 user 侧 → 0 条，差分成立。
- 全量 e2e 里的 2 个既有红若按上面 FIX 修复后，全量应回到 65 全绿。
