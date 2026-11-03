# REPORT-U-33 · e2e 默认 Xvfb 虚拟显示 + 证据截图不刷脏 work/

分支 `feat/U-33`（worktree /tmp/bot-wt/U-33），基线 main=cc76af7，commit **a437d55**。
零产品代码，全部改动在测试基建（6 文件 +28/−33，净删）。证据：`work/p4-ui/evidence/U-33/`。

## 改动

1. **默认虚拟显示**：`app/ui/package.json` `test:e2e` → `sh scripts/run-e2e.sh`（新文件，8 行）：
   - 默认 `exec xvfb-run -a --server-args="-screen 0 1600x1000x24" playwright test "$@"`；
   - 逃生门 `PBOTS_E2E_NO_XVFB=1` 直接跑当前显示（调试看真实窗口用）；
   - `"$@"` 透传，`pnpm test:e2e --list` / `--grep` 可用（两分支均已验证）。
2. **evidence 不再刷脏主仓**：`tests/support/ui.ts` 新增 `evidenceOut(sub)`（写本 checkout 的 gitignored `app/ui/test-output/<sub>/`，mkdir recursive），替换原 4 处写 `work/p4-ui/evidence/` 的路径常量：
   - `ui.ts` `EVIDENCE`(PAB)、`PDC_EVIDENCE`(PDC)——6 个消费 spec 文件 import 名不变、零改动；
   - `visual.spec.ts` `OUT`(U-27)、`journeys/d11-d12.spec.ts` `EVIDENCE`(U-31)——顺带删掉 git-common-dir 定位间接层与多余 import（execFileSync/dirname/mkdirSync）。
   - `app/ui/.gitignore` +`test-output/`。
   - work/ 留证流程变化：**e2e 截图现在落 `app/ui/test-output/<任务子目录>/`，需要留证时由人/verifier 手动拷贝到 `work/p4-ui/evidence/`**（本报告证据已照此拷贝）。
3. GL 软渲染（PLAN ③）：playwright 启动 Electron 自带 `--disable-gpu`（evidence/U-33/xvfb-proof.txt 进程实测），全量零 GL 异常，未加额外代码。

## 红绿记录（TDD）

- **红**：stash 全部改动后跑旧代码 `settings.spec`（经 git-common-dir 直写主仓 work/）→ 3 passed 且主仓 **7 张 PDC png 变 M**（evidence/U-33/red-demo.txt），还原后 pop。
- **绿**：恢复改动跑全量 → 主仓与 worktree `work/` **零脏**，44 张截图落 test-output（evidence/U-33/gitstatus-clean.txt + test-output-filecount.txt）。

## 验收自跑（全在 worktree，HOME=/tmp/bot-u33）

| 项 | 结果 |
|---|---|
| `pnpm -C app/ui build` | ✓ built in 1.10s |
| `pnpm -C app/ui exec vitest run` | **224/224**（27 文件，4.00s） |
| `pnpm -C app/ui test:e2e`（新脚本自带 Xvfb） | **54 passed (5.0m)**，零失败零 flaky（NewBotDialog 族本轮未触发）；运行中 `pgrep -ax Xvfb` 实测 `Xvfb :99 -screen 0 1600x1000x24`，Electron 全在 xvfb-run 会话内，**真实桌面零弹窗**（xvfb-proof.txt） |
| 全量跑后 `git -C ~/bot status --short -- work/p4-ui/evidence/` | **0 行**；work/ 下仅主会话先在的 `M work/LOG.md`（与本任务无关，未动） |
| worktree `git status`（commit 前） | 仅本任务 5 改 + scripts/ 新增 |
| 逃生门 `PBOTS_E2E_NO_XVFB=1 pnpm test:e2e --list` | ✓ Total: 54 tests（两分支均通） |

环境备注：worktree 需 `pnpm -C app/ui setup` + `pnpm -C app/sdk setup`（首跑 settings.spec 3 failed 即 sdk 的 dsh bin.js 未装，装后复跑 3 passed，非产品问题）。

## 复跑命令

```
git -C /home/lingxufeng/bot worktree add /tmp/bot-wt/U-33 feat/U-33   # 已存在则跳过
HOME=/tmp/bot-u33 pnpm -C /tmp/bot-wt/U-33/app/ui setup
HOME=/tmp/bot-u33 pnpm -C /tmp/bot-wt/U-33/app/sdk setup
HOME=/tmp/bot-u33 pnpm -C /tmp/bot-wt/U-33/app/ui build
HOME=/tmp/bot-u33 pnpm -C /tmp/bot-wt/U-33/app/ui exec vitest run
HOME=/tmp/bot-u33 pnpm -C /tmp/bot-wt/U-33/app/ui test:e2e            # 自己进 Xvfb
```

## 未完成项 / 新发现

- 无未完成项。
- 新发现（不扩范围，仅记录）：① 旧 evidence 下已跟踪截图从此静止（不再被刷新），将来 UI 改版需重录时跑完从 `app/ui/test-output/` 手动拷贝；② e2e 全量 5.0m 中 journeys 占大头，如需提速可并行 workers，但与 NewBotDialog 族 flaky 权衡，维持 `workers:1`。

待 verifier 验收。
