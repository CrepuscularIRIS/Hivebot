# Hivebot 工作流 · 轻量版（2026-11-18 起）

> 用户拍板：原来的工单制太 heavy。现在只用两条腿：**Superpowers**（流程技能）+ **Ponytail**（最小实现纪律）。
> 本文件取代旧工单制（CLAUDE.md §2 工作流程保留作历史参考，不再执行）。

## 1. 角色与分工

| 谁 | 做什么 |
|---|---|
| **主 agent（GLM 5.3）** | 开发、写测试、跑验证、合并、记 LOG。一切施工都在这里。 |
| **wish 出方案** | plan 环节用 `wish-intent` 技能（用户口中的「wish optimizer」）：把模糊愿望拆成可执行方案。**deepseek v4.1 flash 出 plan**（subagent）——desktop policy 已放行（见 §5），首会话探测确认后启用。 |
| **flash 调试** | `glm 5.3 flash`（subagent）用 ego browser 做视觉走查/调试。同 §5，desktop 已放行。 |
| 经理/审查（旧 manager/reviewer 工单制） | **停用**。安全单（T73d/T93 链）仍等经理终验——那是历史遗留承诺，处理完即清。 |

## 2. 每批怎么走（替代工单制）

1. **选材**：按 `work/grok110-parity/REQ-1.1.0-PARITY.md` 台账+候选清单，wish-intent 判断环选下一块。
2. **plan**（需要时）：`docs/superpowers/plans/<date>-<slug>.md`，writing-plans 骨架（Goal/Constraints/Review Focus/任务步）。小批次可跳过直接 TDD。
3. **施工**：worktree `/tmp/bot-wt/<B批号>`，TDD（先红后绿），Ponytail 纪律（最小 diff、复用优先、shortcut 注释）。
4. **验证**：单测 + e2e（真实浏览器 DOM 断言）+ 跨批回归；视觉面截图亲验。
5. **合并**：`--no-ff` 回主线，回测，`work/LOG.md` 记一行。
6. **节奏**：每批一个可演示闭环，批间不攒债。

## 3. 常用锚点

- 构建：`pnpm -C app/ui build`（worktree 里用 workdir=app/ui + `--config.verify-deps-before-run=false`）
- 单测：`pnpm -C app/ui test`（全量）/ `test tests/unit/grok-shim/`（shim 层）
- e2e：`pnpm -C app/ui test:e2e tests/e2e/<spec>`；exit 78=新鲜度守卫（先 build）
- 新 worktree 首跑前：app/ui + app/sdk 各 `pnpm install --prefer-offline`
- 合并：`git merge --no-ff`；回测绿才 push；`work/LOG.md` 一行记档
- 提交信息：中文、conventional commits、来源注明（RE 锚点写进正文）

## 4. 保留的硬约束

不重启机器、不用 pkill -f/sudo、多 worktree 禁 stash、凭证不进模型、repos/ 只读、合并 --no-ff、每合并必回测、e2e 隔离 HOME/死 DBus。完整清单见 CLAUDE.md §5。

## 5. 路由（2026-11-18 更新：宿主已切 desktop）

**dsh-cc（终端 CC 兼容层）已于 2026-11-18 全卸**——之前「not allowed for this Session」的根因是 dsh-cc 的 tui profile 从未配 model-selection policy（用户当时改的是 desktop 的配置，改错了地方）。

现宿主 **desktop（Electron/tauri）**：其 patch 早已配好 `subagent-model-selection-settings`（enabled，allowlist：`litellm/deepseek-v4.1-flash`、`litellm/glm-5.3-flash`）。注意 policy 只写入**新建**顶层 session——新开会话即生效。**首个 desktop 会话先探测一次**（subagent 带 provider/model 参数发一个字）；万一仍拒，先确认是新会话而非 resume，再查 desktop patch 是否被 Electron 端插件页覆盖。
