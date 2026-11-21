# REPORT · P5-51.f2 grok-shim 稳定红根因修复

2026-11-03 15:17 · 分支 feat/P5-51f2 @ e50f449（基 97f1f77 main 最新），1 文件 +13/-7（仅 e2e spec，产品代码零改动）。

## 结论（先取证再修，两问都有答案）

**不是产品 bug：wrapper 挂载序正确，工作区在 /tmp 下沙箱内可见可写。**
红根因是**测试级过时假象**：P5-25 起 `session/create` 由 main 强制
`cwd=$PBOTS_DATA_DIR/workspaces/<botId>`（shell 的 dataDir），**不再继承 runtime 进程 cwd**；
grok-shim e2e 仍把 canary 放在 runtime cwd（`/tmp/bot-p551-ws-*`，一个与工作区无关的 /tmp 目录）。
沙箱内 `/tmp` 是空 tmpfs，只有会话工作区被重 bind——canary 落在工作区外 → `touch` ENOENT →
line 109 `existsSync` 轮询稳定红。P5-51 分支基点（9e8cab3）早于 P5-25 合并（2f96a71），
当时「会话 cwd = runtime cwd」成立，故 builder 当轮绿；两任务合并后即红。

## ① 挂载序实证（方向①，BWRAP_WRAP_DRY_RUN 真实 argv）

取证链（脚本与输出：`evidence/P5-51f2/{dryrun.mjs,order.mjs,bwrap-argv-order.txt}`）：
- dryrun.mjs 起真实 SDK runtime（与 e2e 同 env 形状），在 ready 删除前抢读
  `runtime-patch.yml`，拿到**现 main 的真实 runnerCommand argv**（含 P5-22 的
  `--permit-root`/`--slirp`——**方向②排除：追加参数未打乱顺序**）；
- 拼上 dsh-sandbox-local 0.2.2-alpha.2 `bwrapProfileArgs`（lib/index.js:22-38 逐字）
  跑 wrapper dry-run：最终 bwrap argv 中 `--tmpfs /tmp` 在**参数位 38**，
  会话工作区 `--bind` 在**参数位 40**——bind 后挂，工作区可见（bwrap 后者覆盖前者）；
- 真实 exec 差分：`touch` 工作区内（dataDir 在 /tmp 下）→ rc=0、宿主可见；
  `touch` 工作区外 /tmp 目录 → rc=1，**与 e2e 同字** `cannot touch …: No such file or directory`。

## ② 修复（测试约定级，workspaces.spec 已立模式照搬）

`grok-shim.spec.ts` 对齐 P5-25 世界的 launchAligned 模式：shell `home`+`dataDir`
两侧同源（SDK 子进程 `PBOTS_DATA_DIR` === 壳 `shellChildEnv` 值），canary 改放
`join(dataDir,'workspaces',sid)`（会话工作区内）。dataDir 仍在 /tmp 下（tmkdir），
canary 经真实沙箱创建成功**兼作「dataDir 在 /tmp 下工作区仍可写可见」断言**——
产品级修复（wrapper 改序）不需要，证据见 ①。

同模式排查其余 e2e：只有 grok-shim 中招——
- `workspaces.spec`（P5-25 自带）本来就按 `$dataDir/workspaces/<id>` 取路径，绿；
- `d4-d5-d6-journey` 用 `devState(page).views[a].cwd` 派生 canary（正确姿势），其红=P5-21.f1 基线；
- `grok-persona` `cwd: ws` 只当 runtime 进程 cwd 用、无 bash canary，无害（未动，ponytail）。

## 复测

- 红：修复前单 spec 跑，line 109 poll 30s 超时红（与 P5-56 实锤同位）；
- 绿：修复后单 spec `playwright test tests/e2e/grok-shim.spec.ts` ✓ 1 passed (6.6s)；
- 全量 e2e（Xvfb，基 97f1f77）：**64 passed / 2 failed (9.4m)**——唯二红 = d4-d5-d6-journey + market
  （P5-21.f1 在修的既有基线，非本任务域）；grok-shim/grok-persona/workspaces 全绿；
  visual-hairline P5-14.f1 的 ✘ 是 test.fail 期望失败标记（计入 passed，playwright 流内渲染歧义）。

## 交后续（不扩范围）

- LEARNINGS 候选（主会话定夺）：P5-25 后凡 e2e 断言会话 cwd 相关路径，必须从
  `$PBOTS_DATA_DIR/workspaces/<sid>` 或 `devState().cwd` 派生，不得用 runtime 进程 cwd
  （与 P5-06 ④「ptc bootstrap 必须放会话工作区内」同类）；
- grok-persona.spec 的 `cwd: ws` 已无实际作用，可在下次动到该文件时顺手清理；
- 观测（非本任务域）：/tmp 下已堆积 **2335 个 `bot-U-00-*` 目录、共 6.4G**（历次 e2e 的 launchShell 临时 HOME；
  tmp-sweep 只清本进程登记的目录，进程崩溃/被 kill 的就漏）。建议立小任务：launchShell 默认 home
  改用统一前缀+启动时清扫超龄目录，或定期 bot-reap 类清扫（交用户/主会话定）。

状态：待 verifier 验收。
