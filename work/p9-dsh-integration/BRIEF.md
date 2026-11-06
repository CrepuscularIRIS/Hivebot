# BRIEF · p9-dsh-integration（目标调整，草稿）

## 用户原话（2026-11-06）
> 这一次我们稍微修改一下项目的目标. 我们希望是Grok Bot的所有功能, DSH+SUperAgent去完成. 可行吗? 比如Grok Bot的功能, 其实REA出来后, 还不太一样……里面有很多, 是我们一开始没有考虑到的, 比如还可以控制远程的服务器. 现在我们要把远程连接灵魂, 还有一个之前cursor 员工的要求作为目标产物去做. 我们会鼓励glm用github mcp多去检索dsh的插件. 这块其实有很现成的, 可以集成到我们的Grok Bot中……dsh本来就是plugins为核心的. 难道我们一开始就搞错了? 复刻一个grok bot其实还是很简单的.现在可能是一个superagent+dsh的集成.

## 新目标
Grok Bot（0.78.1，以 RE 为准）的全部功能，用 **dsh 插件 + SuperAgent** 实现。项目性质从「复刻」改为「集成」：每个能力先找现成 dsh 插件（本地 `repos/deepseek-harness` 533 个包 + GitHub 上的第三方插件），再决定是否需要胶水代码。

## 已有证据（2026-11-06 主会话核对）
- dsh @ce7073d 已有与 Grok Bot 能力直接对应的插件组：`ssh`（ssh / fs-ssh / subprocess-ssh / sandbox-ssh / ssh-helper-runtime：远程文件、进程、终端、沙箱）、`computer-use`（+ cua-driver 两个实验 provider）、`browser-use`（Playwright MCP / Chrome DevTools MCP / Stagehand）、`api/gateway` + `remote-access` + `remotes`（多 Peer 远程接入与权限）、`plugin-market` / `plugin-manager`、`schedule`、`goal`、`subagent`、`webhook`、`voice-input`、`session-search`、`credentials`。
- RE 结论：Grok Bot 远程能力走云 box（SandBoxService）+ 本机 computer use，**没有 ssh 端点**（`RE-cloud-deps.md` #23–24）。所以「控制远程服务器」用 dsh `ssh` 插件做是超出原版的增强，不是 1:1。
- `work/p8-parity-full/SCOPE.md`：RE 缺口 153 面 / 16 簇，§0.4 已指出 computer-use / browser-use / ssh 上游有现成件。
- 已自建代码：`app/sdk/src`（policy / orchestration / admin / market）约 5.7k 行，`app/ui` main + shim + overrides 约 7.3k 行。

## 待用户澄清
1. 「远程连接灵魂」指什么？（a）远程连接是这次的核心目标；（b）「远程连接」+「灵魂 / soul」两项（soul = bot 人格与长期记忆？）；（c）其他。
2. 「之前 cursor 员工的要求」原文是什么？仓库文档里没有找到这条记录。

## 下一步（待澄清后）
派 `manager`（任务 A）：做「Grok Bot 能力 × dsh 插件」映射表（RE-COVERAGE 153 面 × 本地 533 包 + GitHub 检索第三方 dsh 插件），每行给出：直接用插件 / 插件 + 胶水 / 需自建 / 不做；并标出现有自建模块中哪些可被插件替代、哪些继续保留；据此重排 p5–p8 剩余任务。
