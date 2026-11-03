verdict: PASS
commit: fc41a8fdfeeb5a39c6618dcd40a83f9fc74404e4（feat/P5-01 @ /tmp/bot-wt/P5-01，基 9c89e64，5 commit；验收时 worktree 干净、HEAD 与申报一致）

复跑环境：HOME=/tmp/bot-vfy-p501（独立临时 HOME），bwrap 0.9.0，pnpm 管理的 node v24.22.2（系统 PATH 是 22，直接 `npx vitest` 撞 devEngines，必须走 `pnpm test/exec`）。

| 验收项 | 结果 | 证据（全部独立复跑，非 builder 输出） |
|---|---|---|
| ⑩ SDK 全量 | PASS | `HOME=/tmp/bot-vfy-p501 pnpm -C app/sdk test` → **23 files / 183 tests 全绿**（30.1s），与申报一致 |
| ① 网络三探针 errno | PASS | `tests/e2e/sandbox-hardened.test.ts` 逐断言核对：dns errno∈{-3,-2}（:321）、4001/gateway/20000/stub 全 errno111（:322-325，gateway 用真实 baseUrl 端口）；差分 stock stub/dns=ok（:333-334）。单跑 3 个 P5-01 文件 27 passed |
| ② 哨兵 test -s + 宿主 sha 不变 | PASS | 13 探针全 1（home_ssh/passwd_ssh/passwd_codex/data_token/data_otherbot/dsh_session/handoff/ppp_chap/ppp_pap/bus_sock + condarc_s/aau_s 用 `test -s` + tool_python_run=0 即 bin/python 可执行）；宿主 .condarc/aau_token sha256 前后相等（:361）；差分 stock 10 项=0、dsh_session/handoff=1 标「既有 --tmpfs /tmp」 |
| ⑤ fail-closed 两格 | PASS | 格 A 缺 wrapper：`can't open file`+`[Errno 2]`、标记不存在（:414-417），退出码 2 精确断言在直测 sandbox-wrapper.test.ts:35-41；格 B 内部错误（`--home` 缺值注入）：`bwrap: ` 前缀、标记不存在（:423-425），直测另覆盖未知 flag/缺 `--`/profile 漂移 4 格 |
| ⑥ 工具链 | PASS | `command -v python` 与宿主同算同断言（:430-432 宿主侧=TOOL_PY）、sys.prefix 相同（:445）、写 sys.prefix errno30（:446） |
| ⑨ 数据根（v2.1） | PASS | 未设 PBOTS_DATA_DIR：stderr 恰 1 行 WARN（:517-518）+ 启动成功；cwd=缺省数据根 `.test-homes/p5-01/.config/pbots-ui` → 授权哨兵 `test -s`=1，差分 stock=0（:527/:533）；bash env 无两变量（:528-529）；两变量相对路径 → spawnSync 非零退出 + stderr 点名变量（:535-548） |
| ⑦ 祖先工作区 | PASS | 写死实现 A（再遮）：cwd=TEST_HOME/rt7（DSH_HOME 之父）→ 哨兵 1 + marker7 落宿主（:449-461） |
| ⑧ 策略代码根 | PASS | cwd=PKG_ROOT：wrap/guard 追加 errno30、sha 不变、guard.mjs 未被创建、`.dsh` 哨兵 1；cwd=仓根：SKILL.md errno30、hooks(.claude/hooks 主仓在=EROFS/worktree 缺=ENOENT)、`.git/HEAD`（主仓 EROFS/worktree ENOTDIR=20）按布局写死、gitdir 解析后真实对象库 errno30；cwd=$HOME → `bwrap: ` 拒 + 标记不存在，差分 stock 照常执行（:463-513） |
| ③ 写边界 / ④ /tmp 哨兵 | PASS | ③ cwd 写宿主可见、$HOME 与 cwd 外写不落宿主、../outside 与 /var/tmp errno30（标既有）；④ 宿主 /tmp 哨兵=1（标既有） |
| P2SDK_SANDBOX_MASK 不入 env | PASS | childEnv 显式剔除两变量（start.ts diff）+ ⑨ env 探针 + start.test.ts:31 单测三重覆盖 |
| 凭证清单文件 | PASS | `evidence/P5-01/host-cred-paths.md` 在位；四项（/etc/ppp ×2、.condarc、aau_token）逐一对照 never-roots.mjs 常量（HOME_OUTSIDE_NEVER:21 / TOOLCHAIN_CREDENTIALS:18）一致 |
| 区域（12 文件 vs 申报） | PASS | `git diff --stat 9c89e64..fc41a8f` 恰 12 文件 +1352/-11，与申报清单逐一吻合，无区域外改动；start.ts 的 MASK 推导在位（PBOTS_DATA_DIR 同名读取、缺省双 HOME `.config/pbots-ui` + 恰 1 行 WARN、非绝对拒、childEnv 丢弃、computeRoots 显式列 policy-state.json/standing-grants.json） |
| 红基线 ×2 | PASS | ① 注释掉 `rows.push(sandboxRow(cfg))` 后单跑 ① → 立刻红：`AssertionError: dns 探针：ok: expected ['errno-3','errno-2'] to include 'ok'`（证明 ① 探的是本任务防线），跑完 git checkout 恢复；② 移走 never-roots.mjs → `ERR_MODULE_NOT_FOUND … never-roots.mjs` exit 1（fail loud），已恢复、worktree 干净 |
| app/ui 抽验（不传 dataDir） | PASS | 自建 `pnpm build` 后 `pnpm test:e2e tests/e2e/visual.spec.ts` → 2 passed（9.9s）；sdkDataDirEnv 单测 2 格在 unit（未传→{}、传了→PBOTS_DATA_DIR） |

新问题（每条一行，可直接成为修复任务）：
- [FIX] extraMaskRoots 缺 computeRoots 层单测（解析在 start.test.ts:274 有，但「追加根进 maskRoots/neverRoots」无断言；功能经手工 node -e 验证正确：maskroot 同时出现在 maskRoots 与 neverRoots） | 复现：`grep extraMaskRoots app/sdk/tests/unit/never-roots.test.ts` 零命中 | 疑似位置：app/sdk/tests/unit/never-roots.test.ts（line 65 用例内补一行） | 严重度：低（P5-06 ⑦ 的 e2e 会间接覆盖，可并入该任务）
- [备注] REPORT-P5-01 数字笔误：「P5-01 新增 26」但分项 9+8+9+9=35（实际新增 35 tests，183 全绿为准），不影响代码。

备注：本任务验收项无 UI 界面（SDK 沙箱），无浏览器截图要求；app/ui 侧仅抽验测试支撑链路。
