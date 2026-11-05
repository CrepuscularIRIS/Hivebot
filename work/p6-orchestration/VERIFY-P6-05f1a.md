# VERIFY-P6-05f1a

> 转正自 evidence/P6-05f1/VERIFY-f1a.txt。

verdict: PASS
commit: 5cc11841d8fe215c18b87906cb1dd4dc08b144e9
任务：P6-05.f1a 复验；P6-05.f1 整体判定：PASS。
分支 feat/P6-05f1；工作树 /tmp/bot-wt/P6-05f1。
报告遵循本会话禁止写报告 .md 的约束，落到派发指定的备用 evidence/P6-05f1/VERIFY-f1a.txt。未声称 Write .md 曾实际被拒。

以下证据均在当前 HEAD 独立重跑，不采用 builder 输出，也不将旧 HEAD 的通过项直接沿用。
证据文件统一前缀目录：/home/lingxufeng/bot/work/p6-orchestration/evidence/P6-05f1/

| 验收项 | 结果 | 证据（命令/文件/输出尾部） |
|---|---|---|
| 1a. persona 下增加 suffix 键必须 drift 红 | PASS | python3 -I /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-05f1/vfy-f1a-probe.py，在 SDK 临时副本真实修改 approval.yml，在 standard persona.config prefix 后加 10 空格缩进 suffix: UNAPPROVED-BY-VERIFIER。vfy-f1a-suffix.log：preset-standard 内容对比 AssertionError，差异清楚保留新增 suffix；1 failed / 6 skipped，EXIT 1。只选 ^drift：，不依赖 builder 新增的 expect(toThrow) 回归用例。 |
| 1b. 只改 prefix 值仍绿 | PASS | 同一脚本在全新原内容上仅将 standard prefix 基础句改成 Independent verifier prefix value mutation.；vfy-f1a-prefix.log：1 passed / 6 skipped，EXIT 0。 |
| 1c. 改 persona.name 必须 drift 红 | PASS | 同一脚本在原内容上仅将 standard persona 的 name 改成 verifier-unapproved-persona；vfy-f1a-name.log：preset-standard 内容对比 AssertionError，差异指向 name；1 failed / 6 skipped，EXIT 1。 |
| 2. config.test.ts 独立断言仍在且独立：删段落 config 红、drift 绿 | PASS | config.test.ts:220–235 经真实默认 standard 会话回合，在 llm/stream 请求边界取 system 文本，计算固定段落 hash。git diff 4a3d96f..5cc1184 -- app/sdk/tests/e2e/config.test.ts 无改动。同一变异脚本仅删 approval.yml 中 Replying 段落，不改断言：vfy-f1a-section-deleted-drift.log 为 1 passed / 6 skipped，EXIT 0；vfy-f1a-section-deleted-config.log 为 1 failed / 1 skipped，EXIT 1，明确因实际空段落 hash e3b0c442…b855 不等于 c7c53cd4…b356，非启动失败。副本控制组 vfy-f1a-copy-control.log 原内容两项均通过。 |
| 3. 指定两份 spec 9/9 | PASS | HOME=/tmp/bot-p605f1a-vfy/home TMPDIR=/tmp/bot-p605f1a-vfy/tmp PBOTS_DATA_DIR=/tmp/bot-p605f1a-vfy/data DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/bot-p605f1a-vfy/no-bus pnpm -C /tmp/bot-wt/P6-05f1/app/sdk test tests/e2e/guard-plugin-manager.test.ts tests/e2e/config.test.ts --maxWorkers=1；vfy-f1a-baseline.log：Test Files 2 passed (2)，Tests 9 passed (9)，Duration 16.00s；shell exit 0。 |
| 4. f1a 增量仅 guard-plugin-manager.test.ts | PASS | vfy-f1a-hygiene.log：git diff --name-only 4a3d96f..5cc1184 仅 app/sdk/tests/e2e/guard-plugin-manager.test.ts。整体分支仍仅 approval.yml、config.test.ts、guard-plugin-manager.test.ts 三文件；git diff --check 无输出，最终 status 干净，HEAD 未变化。 |

P6-05.f1 整体补充复验（同为当前 HEAD 新证据）：
- 段落逐字节对照 git show 8973a67:app/sdk/profile/patches/approval.yml：vfy-f1a-hash.json，equal=true、639 UTF-8 bytes、sha256=c7c53cd4e281e361191cbdecf873d2c6c5a5d9d7e56277091bf0d54a9734b356。
- 其他字段 drift 保护不退化：临时副本仅将 standard agent-instructions.config.maxBytes 65536 改成 65537，运行同一真实 drift 用例；vfy-f1a-maxBytes.log：AssertionError 精确显示该差异，1 failed / 6 skipped，EXIT 1。
- 无额外 P2SDK_PATCH 的默认链实证：/tmp/bot-wt/P6-05f1/app/sdk/node_modules/node/bin/node /home/lingxufeng/bot/work/p6-orchestration/evidence/P6-05f1/vfy-f1a-default-no-patch.mjs；vfy-f1a-default-no-patch.log/json：patchEnvPresent=false、preset=standard；real adapter 向本机临时 HTTP stub 发出 1 个 /v1/chat/completions 请求，实际 system 文本 6156 字符，段落 hash=c7c53cd4…b356、turnEnded=true、responseObserved=true，DEFAULT NO PATCH PASS，exit 0。未调用真实模型/付费服务，使用本机 stub 占位 key，不读取真实凭证。
- 额外坏路径：上述完全无额外 patch 的 runtime 中请求 p6-reply，得到 agent-preset/not-found；available 只有 standard/ptc/minimal/cordis。防止独立 insert preset 掩盖默认链回退。

执行与卫生：
- 开工已读 work/LEARNINGS.md、PROTOCOL Verify；本任务无 UI，不涉及截图；未跑 SDK 全量或全套 e2e。
- 正常两 spec 用指定 worktree；变异只写 SDK 临时副本，不修改 worktree 产品代码或测试代码。副本复用已安装 node_modules，不重新装依赖。
- 副本首次通过 pnpm 启动会触发不必要的安装检查并以 ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY 退出，不作为验收证据；随后改用已安装 Node 24.22.2 + Vitest 5.0.5。有效变异每份日志均列完整 COMMAND 和 CWD；控制组通过，排除副本环境本身导致红灯。
- 所有运行使用临时 HOME/TMPDIR/PBOTS_DATA_DIR；临时副本 /tmp/bot-p605f1a-vfy 已删除。默认无补丁探针自己的随机临时根在 finally 删除。
- 未运行 shell kill/pkill/killall；测试 teardown/finally 仅结束自己 spawn 的 SDK 子进程。无需手工清理进程。
- 结束前 /home/lingxufeng/bot/scripts/bot-reap --dry-run --match p605f1 无匹配输出，exit 0（vfy-f1a-hygiene.log）。

新问题（每条一行，可直接成为修复任务）：
- 无。上一轮唯一 [FIX] 已实证关闭。

结论：P6-05.f1a PASS；P6-05.f1 整体 PASS。此判定仅绑定以上完整 HEAD；HEAD 变化须重新验收。SDK 合并后全量回归仍由主会话按项目规则执行，本报告不替代它。
