# REPORT · P5-01（0a bash wrapper「全入口纯收紧」+ 共享根清单）

- 分支：`feat/P5-01`（worktree `/tmp/bot-wt/P5-01`，基点 main@9c89e64）
- commits（5，前缀 `feat(p5)`）：`b25790b` never-roots.mjs → `5a4cc21` 决策 15/4 launcher+runtime patch → `a3bb118` bwrap-wrap.py → `71ec84f` 验收 ①-⑨ e2e → `fc41a8f` app/ui dataDir 参数
- 改动 12 文件 +1352/-11：`.gitignore`（+`.test-homes/`）、`app/sdk/sandbox/bwrap-wrap.py`（新，167 行）、`app/sdk/src/policy/never-roots.mjs`（新）、`app/sdk/src/start.ts`、`app/sdk/tests/{unit/never-roots,unit/start,e2e/sandbox-wrapper,e2e/sandbox-hardened}.test.*`（新）、`app/sdk/tests/support/runtime.ts`、`app/ui/tests/support/{sdk-env,sdk-runtime}.ts`、`app/ui/tests/unit/support/sdk-env.test.ts`
- 复用（REUSE 第 1 行）：第 2 级 dsh `runnerCommand` 接缝（R5 实证）+ 第 3 级改造 R5 wrapper（文件头已注明原型出处）；`P2SDK_POLICY_STATE` 未做（按派发）

## 验收 ①-⑩（全部经真实 launcher + fake bash，HOME=/home/lingxufeng/bot/.test-homes/p5-01）

| # | 结果 | 证据（`app/sdk/tests/e2e/sandbox-hardened.test.ts` 逐 `it`；直测在 `sandbox-wrapper.test.ts`） |
|---|---|---|
| ① 网络 | PASS | dns gaierror（errno-3/-2）；4001/gateway/20000/stub 全 errno111；差分 stock stub=ok、dns=ok |
| ② 遮蔽 | PASS | 13 探针全 1（工具链/HOME 外文件根用 `test -s`，/dev/null 覆盖口径）；`bin/python` 可执行；宿主 sha256 前后不变；差分 stock 全 0，其中 DSH_HOME/handoff 标「既有」（stock `--tmpfs /tmp` 同遮，R5 §①） |
| ③ 写 | PASS | cwd 宿主可见；`$HOME/outside`、`$CWD/../outside` 宿主不存在；`../outside`/`/var/tmp` errno30（既有，已标注；stock 的 workspace-write 同拦，无差分对） |
| ④ /tmp 哨兵 | PASS | 退出码 1（既有 `--tmpfs /tmp`，标注不计入） |
| ⑤ fail closed | PASS | 两格：缺 wrapper → `can't open file`+`[Errno 2]`、标记不存在（退出码 2 的精确断言在直测）；内部错误 → `bwrap: ` 前缀、标记不存在 |
| ⑥ 工具链 | PASS | `command -v python`=`/home/lingxufeng/miniconda3/bin/python` 与宿主同；sys.prefix 同；写 sys.prefix errno30 |
| ⑦ DSH_HOME 祖先 | PASS | 写死实现 A：cwd=TEST_HOME/rt7（DSH_HOME 之父）→ 哨兵退出码 1、命令照常执行（marker 落宿主） |
| ⑧ 策略代码 | PASS | cwd=PKG_ROOT：wrap/guard 追加 errno30、sha 不变、`PKG_ROOT/.dsh` 哨兵 1；cwd=仓根：SKILL.md errno30+sha 不变，hooks/`.git/HEAD` 按布局写死（worktree=ENOENT/ENOTDIR，主仓=EROFS；gitdir 解析后真实对象库 errno30）；cwd=$HOME → wrapper 拒绝、标记不存在；差分 stock 照常执行 |
| ⑨ 数据根 | PASS | 未设 `PBOTS_DATA_DIR`：stderr 恰 1 行 WARN、启动成功；cwd=缺省数据根 → 授权哨兵 `test -s`=1（差分 stock=0）；bash env 无两变量；二者相对路径 → launcher 非零退出报原因 |
| ⑩ 全量 | PASS | `pnpm -C app/sdk test`：23 文件/183 tests 全绿；app/ui：build ✓ + 单测 27 文件/226 tests ✓ + e2e 54 passed（未传 dataDir） |

测试数字合计：SDK 183 全绿（P5-01 新增 26：never-roots 9 + start 增 8 + wrapper 直测 9 + hardened e2e 9 个 it 内含全部差分格）；UI 单测 +2（sdkDataDirEnv）。

## 交付与实现要点

- `evidence/P5-01/host-cred-paths.md` 已交付（只 ls -d/stat 不读内容；清单项全部进 `never-roots.mjs`）。
- 挂载序按 PLAN v2.1：base → `--unshare-net` → 遮蔽 → 工具链挂回 → 工作区重 bind（含 HOME 即拒）→ 策略代码根 → 挂回/重 bind 目录下的硬 NEVER 再遮（目录 tmpfs、文件 `/dev/null`）。
- 差分对照的实现：P2SDK_PATCH 后置 overlay 把 `id: sandbox` 行 config 整体替换回缺省（`probeTimeoutMs`-only）→ 无 runnerCommand 的 stock 链。
- 决策 15：launcher 读 `PBOTS_DATA_DIR`（未设 → 双 HOME 缺省 + 恰 1 行 WARN，不 fail）；`P2SDK_SANDBOX_MASK` 追加根；二者 launcher-only（childEnv 丢弃）；`computeRoots` 显式列 `<dataDir>/policy-state.json` 与 `standing-grants.json`。

## 坑与取舍（给后续任务）

1. **bwrap argv 上限 9000**：历史测试残留的 5658 个 `/tmp/p2sdk-handoff-*` 曾把 runnerCommand 撑爆。`handoffSiblings` 只收最近修改的 32 个（ponytail 注明：其余靠 `--tmpfs /tmp`；read-only 会话里更旧的可见，需要时按 liveness 过滤）。已清理本项目 >10 分钟残留约 9000 个。
2. **文件根遮蔽的探针口径**：`--ro-bind /dev/null` 后 `test -e` 仍 0，HOME 外清单与工具链凭证一律 `test -s`（与 v2.1 工具链口径一致）。
3. **launchRuntime 的 env 覆盖序**：`opts.env` 现在可覆盖 `P2SDK_HOME`（⑦⑧ 需要），`rt.home` 与子进程 env 同源（否则 fake 脚本写错目录，approval 30s 超时）。
4. **worktree 与主仓布局差异**：`.git` 指针文件（ENOTDIR）、`.claude/hooks` 未跟踪（ENOENT）两探针按布局写死；真实保护由 gitdir 解析后的只读挂载验证（两布局都是 errno30）。
5. 提醒（主会话事项，PLAN §1 #7 / 决策 7）：P5-01 合入前需写一行 LOG 告知用户新 NEVER 行为（目录类读入口拒祖先、HOME 点目录默认拒的代价）。

状态：待 verifier 验收。
