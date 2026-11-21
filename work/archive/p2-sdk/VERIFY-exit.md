# VERIFY · p2-sdk 出口汇合（P2 唯一完成判定，PLAN 表下「出口汇合」）

verdict: PASS
commit: b634e9d0dc33e058e8bea83dd18f9ce95c16a366（main；验收开始与结束两次核对 HEAD 一致，`git status --porcelain -- app/sdk` 为空）

环境：2026-11-02 10:36–10:40，主仓工作区（app/sdk 无本地改动）；GPU 训练 load≈3.4–4.4 / iowait=0（30 核），三项运行全部串行执行；全程未打印任何 key。

| 验收项 | 结果 | 证据（命令/文件路径） |
|---|---|---|
| ① `$OFFLINE` 全绿（含 D3–D6 自动化版） | PASS | PLAN 原式（表下 $OFFLINE：unshare -rn + lo 拉起 + curl exit 6/7 判定 + lo-only 网卡检查 + 全量）在 main 实跑：**Tests 127 passed (127)，Test Files 18 passed (18)，EXIT=0**，13.58s。日志：`work/p2-sdk/evidence/exit/exit1-offline-full.txt`（测试能开跑即证明离线门全过：外网 curl 失败码 6/7 且命名空间仅 lo） |
| ② 覆盖率 ≥80%（src/ 四项） | PASS | `pnpm -C app/sdk test:coverage`：**Statements 92.98% (318/342) · Branches 86.88% (212/244) · Functions 96.49% (55/57) · Lines 94.94% (282/297)**，EXIT=0（vitest thresholds 生效下退出 0）；p2temp 单文件 100/95.23/100/100 ≥85%（T-11② 硬门槛）；同轮 127/127。日志：`work/p2-sdk/evidence/exit/exit2-coverage.txt` |
| ③ 复跑 T-03③ 方法差集 | PASS | `pnpm -C app/sdk exec vitest run tests/market/connectors.test.ts --reporter=verbose`：4/4 绿，含「the method table differs from the bare baseline by exactly the two p2temp methods」——差集恰为 **2**：`p2temp/preset.ensure` + `p2temp/session.createWithConnectors`（T-16 合并后口径；测试断言逐字核对，收集脚本 `tests/market/fixtures/methods-snapshot.mjs` 经 runtime 真实注册表运行）。日志：`work/p2-sdk/evidence/exit/exit3-methods-diff.txt` |
| ④ D1–D8 证据逐条核对（D6 为真实市场证据） | PASS | `app/sdk/evidence/`：D1.md(36 行)/D2.md(46)/D3.md(9)/D4.md(10)/D5.md(13)/D6.md(25)/D7.md(17)/D8-approval.md(71) 全在。INDEX.md 引用的原始输出抽查全部存在：`work/p2-sdk/evidence/{setup-local.out,d2-real.out,t04-verify-rerun.txt,t06-full-suite.txt,t07-verify-rerun.txt,t08-full-suite.txt,T-02-offline-equivalent.txt,T-01.f3/,T-11/,T-12-verify/,T-12.f1/,T-16/,T-03/,T-09/}`。**D6 = 真实市场证据**：registry.modelcontextprotocol.io 快照 sha256 与 refetch 逐字节一致（page 100 + search 11 = union 111，`T-09/registry-reverify.txt`），真实 npm 连接器 `@agent-infra/mcp-server-filesystem@1.2.29` + 真实 stdio 调用回读 hello.txt + X/Y 隔离（`tests/e2e/market.test.ts` 4 用例，fixtures plugins=111），VERIFY-T-09 verdict PASS。**每条 DONE 有 PASS**：22 份 `VERIFY-*.md` 逐一 grep `^verdict` 全 PASS（T-01–T-14、T-16 及全部 .f1/.f2/.f3；T-15 编号不存在；T-00 为文档任务，PASS 记录在 PLAN evidence 列 + G2 两轮 grep 复核） |

新问题：无（无 [FIX] 项）。

备注：
- 验收前发现 2 个 9 小时陈尸 dsh 进程（/tmp/bot-wt/T-13 已删 worktree 的孤儿，非本次运行产生），经 `scripts/bot-reap 800539 802184` 清理，属沙箱卫生，非产品缺陷（dsh 在 launcher 被 SIGKILL 后存活正是 T-13 验收点①的设计行为）。
- ①的 13.58s 与 T-09 时代 81–90s 的差异来自 vitest 缓存预热，tests 项占时长 99%、127 用例真实执行（日志含多处 `[p2sdk] ready` 真实 runtime 启动行）。

四项判定全 PASS：P2 出口汇合通过，可进 `mm-review L` / G3。
