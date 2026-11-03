# VERIFY-U-33 · e2e 默认 Xvfb 虚拟显示 + evidence 不刷脏主仓

verdict: PASS
commit: a437d55efa63781adf67ce63ffca0e8db9b756cd（worktree /tmp/bot-wt/U-33，验收时实测 HEAD 与申报一致，基线 cc76af7，未漂移）

验收时间 2026-11-02 23:41。全程 HOME=/tmp/bot-vfy-u33，独立复跑（build → vitest → test:e2e → git 干净核对 → 逃生门 → 红演示复核）。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 0a build | PASS | `pnpm -C /tmp/bot-wt/U-33/app/ui build` → `✓ built in 1.10s` |
| 0b 单测 | PASS | `pnpm exec vitest run` → Test Files 27 passed (27)，Tests **224 passed (224)**，3.84s |
| 0c e2e 全量（新入口自带 Xvfb） | PASS | `pnpm test:e2e` → **54 passed (5.7m)**，exit 0，零失败零 flaky（NewBotDialog 族本轮未触发，无需单跑复核）；输出尾部见 tasks/b0y5ntm3z.output（54 passed, exited code 0） |
| 0c' Xvfb 真在跑、真实桌面零弹窗 | PASS | 运行中实测 `pgrep -ax Xvfb` → `587433 Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp -auth /tmp/xvfb-run.nw7IGO/Xauthority`；进程树：xvfb-run(587423) → playwright cli(587450, 实测 environ `DISPLAY=:99`) → 被测 electron@44.7.0 主进程(613939, 带 `--disable-gpu`)；测试代码 grep DISPLAY 零命中（环境全继承 :99）；跑毕 Xvfb 退出 |
| 0d 跑后主仓 evidence 0 刷脏 | PASS | 跑前快照与跑后 `git status --short -- work/p4-ui/evidence/` **完全一致**：仅 `?? work/p4-ui/evidence/U-33/`（builder 按新流程手动拷贝的报告证据，untracked 新目录，非 e2e 产物），无任何 M 行、无新增行；主仓其余变更（M SKILL.md/CLAUDE.md/work/LOG.md、?? .claude/hooks/ 等）为主会话先在，跑前后一致 |
| 0d' worktree 干净 | PASS | 跑完全量后 worktree `git status --short` 输出 0 行（44 张截图落 gitignored test-output/，不进 status） |
| ①脚本 | PASS | `app/ui/scripts/run-e2e.sh`（8 行）：默认 `exec xvfb-run -a --server-args="-screen 0 1600x1000x24" playwright test "$@"`，`PBOTS_E2E_NO_XVFB=1` 逃生；package.json `test:e2e` = `sh scripts/run-e2e.sh`。透传实证：`pnpm test:e2e --list` → Total: 54 tests in 21 files；`PBOTS_E2E_NO_XVFB=1 pnpm test:e2e --list` → 同 54；`pnpm test:e2e --list --grep "P-D"` → Total: 2（多参不丢） |
| ②evidence 落点 | PASS | `tests/support/ui.ts` `evidenceOut(sub)` = `app/ui/test-output/<sub>/`（mkdir recursive），EVIDENCE(PAB)/PDC_EVIDENCE(PDC)/visual OUT(U-27)/journeys EVIDENCE(U-31) 四处全部改走它；`.gitignore` 含 `test-output/`。产物实落：`test-output/` 下 **44 文件全 png**，4 子目录（PAB/PDC/U-27/U-31）。抽验 3 张：PDC/pd-info-pane.png 53816B、U-31/dialog-light.png 63353B、U-27/approval-dark.png 67369B，`file` 均报 `PNG image data, 1280 x 820, 8-bit/color`。视觉亲验：U-31/dialog-light.png 经视觉模型三轮描述稳定——深色侧栏（Bots/Market/Settings）+ 浅色主区 + Handle/API Key/Base URL 表单 + Connect 按钮 = 被测产品新建对话框，非白屏/非桌面。（注：本环境 Read 工具不回显图片内容，改用视觉模型代验 + file/尺寸核对，如实注明） |
| ③改动区域 | PASS | `git diff cc76af7..a437d55 --stat` 恰 6 文件 +28/−33：run-e2e.sh(新)、package.json、.gitignore、tests/support/ui.ts、tests/e2e/visual.spec.ts、tests/e2e/journeys/d11-d12.spec.ts；零产品代码（renderer/main/sdk 无一动） |
| ④红演示复核 | PASS（独立 detach worktree 真复跑） | `git worktree add --detach /tmp/bot-wt/U-33-red cc76af7` → build → `HOME=/tmp/bot-vfy-u33 xvfb-run -a --server-args="-screen 0 1600x1000x24" pnpm exec playwright test tests/e2e/settings.spec.ts` → **3 passed (20.5s)**，随后主仓 `git status --short -- work/p4-ui/evidence/` 出现 **7 张 PDC png 变 M**，文件名与 evidence/U-33/red-demo.txt 逐张一致（pd-c1-clone-missing/c1-readonly/clone-prefill/dialog-connectors/info-pane-dark/info-pane-overlay/info-pane）。已 `git checkout -- work/p4-ui/evidence/` 还原并删红 worktree（复核后主仓恢复仅 `?? U-33/` 一行） |

## 坏路径测试

- 逃生门本身即坏路径分支（`PBOTS_E2E_NO_XVFB=1` 无 Xvfb 直跑）→ 正常列出 54，不炸。
- 红演示＝对「改动不存在」的全量方向性验证（见④）。
- 另观察：sdk 依赖缺失场景（builder 首跑 3 failed）在本次独立环境未复现——worktree 依赖完好，settings.spec 3 passed。

新问题（每条一行，可直接成为修复任务）：
- [FIX] mutations.sh 残留写主仓 work/ 的路径常量（`EV=../../work/p4-ui/evidence/U-00/red-green`），手动执行会刷脏主仓已跟踪的 U-00 red-green 产物 | 复现：`bash app/ui/tests/support/mutations.sh` 后主仓 `git status -- work/p4-ui/evidence/` 出现 M | 疑似位置：app/ui/tests/support/mutations.sh:5 | 低（U-00 一次性突变脚本，不在 vitest/playwright 默认路径，不影响本任务「全量跑后零脏」结论；验收项②的 grep 字面因此未完全清零，其余命中均为注释）

附注：派发指令字面「跑完后 evidence/ 必须 0 行」，实测为 1 行 `?? work/p4-ui/evidence/U-33/`——这是 builder 手动拷贝的本任务报告证据（untracked），非 e2e 刷脏；e2e 对该目录零贡献（跑前后逐字一致），判实质满足。
