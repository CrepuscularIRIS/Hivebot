# EVAL · dsh 0.2.2-alpha.2 → 0.2.2-rc.1 升级评估（T15，只评估不升级）

> manager (Opus 5.5) 执笔 · 2026-11-06 · 起点 HEAD 588d3d1e · 工单 `work/tickets/open/T15-dsh-rc1-upgrade-assessment.md`
> 实物：`work/tickets/evidence/T15/packages.txt` 所列 49 个包，alpha.2 与 rc.1 两版用 `npm pack` 下载后各自解到 `/dev/shm/bot-T15/{a2,rc1}/<pkg>/`，只读、未执行、未 install；cordis `4.0.6-alpha.1` / `4.1.0` 解到 `/dev/shm/bot-T15/cordis/`。提交清单来自 GitHub compare `dsh-v0.2.2-alpha.2...dsh-v0.2.2-rc.1`。本地参考仓 `repos/deepseek-harness@ce7073d` 版本夹在两者之间，没有拿它当任何一方的实物。
> 一句话：**T14 与 `8f798da97d` 无关**。**升级时机维持「T14 + T7a + T7b 落地后，专单升级」，顺序微调为插在 T9a 之后、T9b 之前。** 升级单有三件必做的安全修补：`apply_patch` 入口、schedule 工具改名、ssh 写入口 2→5。漏任何一件都是安全层被静默放宽。

## 1 结论与时机建议

**规模**：compare 共 466 个提交，其中非 merge **333 个**（`work/tickets/evidence/T15/compare.txt`；含 merge 的全量见 `compare-all.txt`；`compare-meta.txt`：`ahead=466 behind=0`）。我们用到的 49 个包两版全部有差异，但多数只是版本号和 cordis/schemastery 依赖范围变了（`evidence/T15/pkg-diffstat.txt`）。代码有实质变化的是：`dsh-tool-fs`（新增 `apply_patch`）、`dsh-tool-schedule`（工具改名）、`dsh-fs-sandbox` / `dsh-fs-ssh` / `dsh-ssh`（新增 patch/delete/move 三个写入口）、`dsh-plugin-manager`、`dsh-web-app`、`dsh` 本体，以及 cordis 4.1.0。

**对我们的影响，按危险度排**：
1. **新工具 `apply_patch`**（`dsh-tool-fs`，`evidence/T15/s4b-coupling.txt`）：rc.1 默认关（base 与四个 web preset 都写 `applyPatch: false`）。但上游这期间开关反复了好几次（按 `compare.txt` 顺序：`483d3f8eff` 开 → `b4d425a532` 关 → `aabf588a75` 开 → `fe5450b152` / `d8243a3f52` / `14d3e53c19` 在 web 与 base 正式打开 → `e1609fe164`「temporarily disable apply_patch in shipped defaults」关）。提交标题写的是「temporarily」，下一版很可能默认打开。
   - 我们的 guard 只认 `read/read_image/write/edit/grep/glob/present`（`app/sdk/src/policy/guard.mjs:257`），shell-ask 的写判定只认 `write/edit`（`app/sdk/src/policy/shell-ask.mjs:326`），不认识的工具落到档位表 `default: allow`（`app/sdk/profile/tiers.json:2`）。
   - **只要某一层把 `apply_patch` 打开，它就绕过预执行层的 NEVER 判定和区外写拒绝。**
   - 执行层还兜得住一半（见 §4：rc.1 的 fs-sandbox 把新写入口都路由到 `checkedTarget`，我们的 `ZoneCheckedFileSystem` 覆盖了它）。但 T7c「写 skill 根出卡」只做在预执行层，会被 `apply_patch` 整个绕过。
2. **schedule 工具改名**：`schedule_update` / `schedule_delete` 改成了 `schedule_edit` / `schedule_view`（`evidence/T15/s4b-coupling.txt`）。P6 的 worker 信封按旧名拦后台作业入口（`app/sdk/src/orchestration/envelope.mjs:48-51`）——**升级后 worker 能改定时任务，信封静默失效**。L5-a（定时投递 e2e）也按工具名写脚本。
3. **ssh 写入口从 2 个变 5 个**（`7bd189b3b5`）：rc.1 的 `SshFileSystem` 多了 `patchText/deleteFile/moveFile`（`evidence/T15/s6-anchors.txt`）。T5 DESIGN D1「`fs-zone-ssh` 只覆盖 writeText/editText」的前提在 rc.1 下不成立。D1 已预埋「上游新增写入口就红」的防漏格，会当场抓到。
4. **cordis 4.1.0 只能一次全升**：rc.1 的 45 个包 peer 全是 `~4.1.0`，alpha.2 全是 `~4.0.6-alpha.1`，两个范围不相交（`evidence/T15/s5-cordis-peers.txt`）。9 个直接依赖必须同一次一起升，不能分批。
5. **会话日志格式迁移**（`dffda31215 fix(session): migrate format v0 logs …`）：升级后首次启动会迁移已有 jsonl。升级单必须先备份 `$DSH_HOME` 下的会话目录，并验证能回退。

**rc.1 修了我们踩过的坑吗**：没有。§7 的 23 条里「修了」是 0 条。我们组合里依赖的上游行为在 rc.1 原样：宿主 rg 路径、写死的 `/tmp/dsh-ssh-*`、helper 无配置挂沙箱、fs-sandbox 围栏含 `/tmp`、plugin-manager 拒裸 MCP 包。

**时机建议：维持经理默认判断，顺序微调。**
- **维持**「T14 + T7a + T7b 落地后，专开一张升级单 + 全量回归」。理由一（§2）：rc.1 不修 T14，提前升级换不来任何东西。理由二：锚点。DESIGN 与 T2/T4/T9a 的证据大量指向 alpha.2 装包行号（rc.1 下 `fs-ssh` 行号整体前移 14 行，`schemas.js:125` 变成 `:161`，见 `evidence/T15/s6-anchors.txt`），中途升级会让在途单的验收命令失效。
- **微调**：升级单插在 **T9a 之后、T9b 之前**。
  - T9a 只动行 id，而这些 id 在 rc.1 里全都还在（§3），不受影响。
  - T9b 的 `fs-zone-ssh` 如果先在 alpha.2 上写两个入口、升级后再补三个，就是返工；不如对着 rc.1 一次写五个。
  - T7c（写 skill 根出卡）同理，应排在升级单之后，或者在升级单里同步补上 `apply_patch` 的判定。
- 前提：升级单开工时，GPU 训练的负载要允许跑全量回归（两套全量不同时跑）。

## 2 T14 关系

**结论：无关。**

- **`8f798da97d` 改了什么**（`evidence/T15/commit-8f798da97d.txt`）：删掉 tool-fs 层的预检沙箱围栏。提交说明原话：那个围栏「在本地进程里推导可写根，所以在 SSH provider 下……把远端目标和本地临时根比较」。改为由 provider 在提交时拒绝。另外还改了 apply_patch 的 diff 上界与预览。改动文件全在 `packages/fs/{tool-fs,fs-local,fs,fs-patch,fs-sandbox README}` 和 `client/ui-tool` 下，**没有一处涉及 sandbox-policy、session、working-directory 或会话创建路径**。
- **T14 的失败点**：拒绝串 `masked area` 出自**我们自己的 guard**（`app/sdk/src/policy/guard.mjs:171`）。guard 在 `tools/pre-execute` 里从 `ctx.get('sandboxPolicy').resolve({session}).workspaceRoot` 取例外根（`app/sdk/src/policy/guard.mjs:284-295`），拿到 undefined 才拒。
- **`8f798da97d` 碰不到这条取值路径**，证据（`evidence/T15/s2-t14.txt`）：
  1. `dsh-sandbox-policy` 的 lib 两版**逐字节相同**（`diff lib/index.js` 0 行，只有 package.json 的依赖范围变了）。也就是说，`resolve()` 的实现在 rc.1 没动。
  2. `dsh-working-directory` 同样只有 package.json 变了。
  3. alpha.2 的 `dsh-tool-fs` 里根本没有 `writableRoots`（计数 0）。这个提交删掉的预检围栏是 alpha.2 之后才加进来、在 rc.1 前又删掉的，对我们这一版的 write/edit 路径是净零变化。
  4. 我们挂的扩展点 `tools/pre-execute` / `tools/execute` 所在的 `dsh-tools/lib/pipeline.js` 两版 0 行差异（`evidence/T15/s4-internal-api.txt`）。
- **对 T14 走向的意义**：升级不会让 T14 自愈，T14 继续在 alpha.2 上查。T14 回执已证伪 SDK 层的 claim 建会话嫌疑；剩下的差异面在 UI 侧的启动与环境（`work/tickets/receipts/T14.md`「供根因排查的剩余差异面」），与本次升级无交集。

## 3 我们的 patch 行对照表

范围：五个主 patch 文件（`approval` / `market` / `presets` / `p2sdk` / `orchestration`）里出现的全部 110 个不同行 id（机器比对结果 `evidence/T15/row-ids.json`），加上 `start.ts` 生成的行（`evidence/T15/start-ts-ids.txt`）。比对法：在 alpha.2 与 rc.1 的 `dsh-base/cordis.patch.yml`、`dsh-web-app/cordis.patch.yml`、`dsh-web-app/presets/{standard,cordis,ptc,minimal}.patch.yml` 里按 id 取整块文本比较。**被删或改名的 id：0 个。**

**93 个 id 两版块文本完全相同**（只有行号平移，我们的 patch 按 id 匹配，不受影响）：

| 行 id | 上游所在（两版同） | 状态 | 影响 |
|---|---|---|---|
| `agent-default-model` `llm-pi-ai` `session-title-llm` | dsh-base/cordis.patch.yml | 两版块文本相同 | 无 |
| `command-compact` `compaction-basic` | base + web-app 根 + presets/{cordis,minimal,ptc,standard} | 两版块文本相同 | 无 |
| `agent-instructions` `command-goal` `plan-mode` `skill-filesystem` `tool-bash` `tool-fs-search` `tool-goal` `tool-jobs` `tool-plugin-manager` `tool-pwsh` `tool-result-pruner` `tool-skill` `tool-subagent` `tool-subagent-control` `tool-subagent-fork` `tool-todo` `tool-web` `tool-workflow` `workflow-ptc` | base + web-app 根 + presets/{cordis,ptc,standard} | 两版块文本相同 | 无（`tool-workflow`/`workflow-ptc` 仍在，DESIGN D8 的禁用法不变） |
| `tool-executor-ptc` | base + presets/ptc | 两版块文本相同 | 无 |
| `client-hmr` `cordis-client-runner` `locale` `message-quotes` `resources` `shortcuts` `ui-agent-preset` `ui-approval` `ui-attachment` `ui-brand-official` `ui-chat` `ui-commands` `ui-conversation` `ui-cordis` `ui-deliverables` `ui-file-drag` `ui-goal` `ui-input-trigger` `ui-jobs` `ui-layout` `ui-message-feedback` `ui-model-selection` `ui-open-in-app` `ui-permission` `ui-plan` `ui-plugin-manager` `ui-reference` `ui-renderer` `ui-schedule` `ui-secret-mask` `ui-session` `ui-settings` `ui-settings-account` `ui-settings-agent-loop` `ui-settings-general` `ui-settings-models` `ui-settings-plugin-inventory` `ui-settings-plugins` `ui-settings-session-log` `ui-settings-shell` `ui-settings-subagent` `ui-settings-web-search` `ui-shortcuts` `ui-sidebar` `ui-sidebar-browser` `ui-sidebar-documentpreview` `ui-sidebar-files` `ui-sidebar-right` `ui-sidebar-terminal` `ui-skill` `ui-subagent` `ui-theme` `ui-tool` `ui-trajectory` `ui-user-questions` `ui-workflow-run` `ui-workspace` `web-runtime` | dsh-web-app/cordis.patch.yml | 两版块文本相同 | 无（rc.1 在同文件另加了 `ui-file-actions`、`ui-context-menu` 两行，我们不引用；我们用的是 renderer-grok，不用 dsh web UI） |
| `tool-cordis` | presets/cordis | 两版块文本相同 | 无 |
| `compaction` `persona` | presets/{cordis,minimal,ptc,standard} | 两版块文本相同 | 无 |
| `delegation` `planning` `present` `time-context` `tool-ask-user` `tool-plugin-market` `tool-schedule` | presets/{cordis,ptc,standard} | 两版块文本相同 | `tool-schedule` 行文本没变，但包内工具改名了（§1 第 2 条、§4） |

**7 个 id 块文本有变化**：

| 行 id | 我们引用处 | 上游（a2 → rc1） | 变化 | 影响 |
|---|---|---|---|---|
| `preset-standard` `standard` | `approval.yml:62`、`:65` | presets/standard.patch.yml :5/:8 → :5/:8 | 嵌套 `tool-fs` 加了 `config: applyPatch: false` | 我们的 approval.yml 是这三个 preset 的整段逐字副本，会**整块覆盖**上游。副本里没有 `applyPatch`，而 tool-fs 的缺省本来就是 `false`，所以语义等价。升级单要同步复制（保持与上游逐字一致的约定），并显式写 `applyPatch: false` |
| `preset-cordis` `cordis` | `approval.yml:191`、`:194` | presets/cordis.patch.yml :5/:8 → :5/:8 | 同上 | 同上 |
| `preset-ptc` `ptc` | `approval.yml:323`、`:326` | presets/ptc.patch.yml :5/:8 → :5/:8 | 同上 | 同上 |
| `tool-fs` | `approval.yml:89`、`:216`、`:345`，`presets.yml:21`、`:36` | base :295→:296；web-app 根 :502→:506；四个 preset 同行 | base 与三个 preset 加 `applyPatch: false` | 同上。`presets.yml` 两个测试 preset 里的 `tool-fs` 没写 config，取缺省 false |

**10 个 id 是我们自建的，上游没有**（不受升级影响，只看它们依赖的服务与 API，见 §4）：`p2-alpha` `p2-beta` `p2sdk-fs-guard` `p2sdk-request-net` `p2sdk-shell-ask` `p2temp-connectors` `pbots-orchestration` `plugin-market` `preset-p2-alpha` `preset-p2-beta`。其中 `plugin-market` 是我们插入的上游包行；`p2-alpha` / `p2-beta` 是测试 preset 的 config id。

**start.ts 生成行与 T4/T5 引用的 base 行**（`evidence/T15/start-ts-ids.txt`，全部仍在、只是行号平移）：`sandbox` 240→240，`fs-sandbox` 520→524，`subprocess` 234→234，`sandbox-policy` 243→243，`bash-sandbox` 249→249，`ptc-runtime` 393→397，`workflow-ptc` 396→400，`tool-workflow` 401→405，`tool-executor-ptc` 500→504，`session-title-llm` 67→67，`skill-filesystem` 311→315，`tool-fs-search` 298→302，`agent-instructions` 303→307，`attachment-local` 146→146，`spill-local` 407→411，`shell-env` 278→278，`working-directory` 166→166，`agent-default-model` 90→90。另外 rc.1 base 新把 `fs-observation-policy` 设为 `disabled: true`；我们不引用这一行。

## 4 内部 API 依赖

证据：`evidence/T15/s4-internal-api.txt`、`evidence/T15/s4b-coupling.txt`。

| 我们依赖的东西 | 位置 | rc.1 | 影响 |
|---|---|---|---|
| `SandboxedFileSystem`（fs-zone 继承它） | `app/sdk/src/policy/fs-zone.mjs:16-19`、`:91` | 方法从 `writeText/editText/checkedTarget` 增加到再加 `patchText/deleteFile/moveFile`，**三个新方法全部经 `this.checkedTarget()`** | 我们覆盖了 `checkedTarget`（`app/sdk/src/policy/fs-zone.mjs:207`），所以新写入口在执行层自动过 zoneGuard（NEVER 与区外写拒都在）。升级单要加格证明这一点，不能只靠读码 |
| `workspaceWritableRoots` / `canonicalPath`（dsh-sandbox） | `app/sdk/src/policy/fs-zone.mjs:18` | dsh-sandbox 导出表 md5 两版相同，lib 0 行差异 | 无 |
| `FsError`（dsh-fs） | `app/sdk/src/policy/fs-zone.mjs:19` | 导出表多了 `FS_ERROR_CODES`，`FileSystem` 与 `FsError` 仍在 | 无 |
| `tools/pre-execute` / `tools/execute` 扩展点 | guard、shell-ask、fs-zone、orchestration envelope | `dsh-tools/lib/pipeline.js` 0 行差异（两版都在 :386 / :492） | 无 |
| `isPathUnder`（containment 的复制源） | `app/sdk/src/policy/containment.mjs:1-3` | fs-sandbox 里该函数体 md5 两版相同 | 无，复制件不需要同步 |
| 模型可见工具名 | guard `known` 集、shell-ask 写判定、envelope 名单 | 18 个 tool 包里 16 个名字不变；**`dsh-tool-fs` 多了 `apply_patch`**；**`dsh-tool-schedule` 的 `schedule_update/schedule_delete` 改成 `schedule_edit/schedule_view`** | 见 §1 第 1、2 条。升级单必做：envelope `JOB_TOOLS` 换新名（`app/sdk/src/orchestration/envelope.mjs:48-51`、`:71-74`）；`apply_patch` 要么由 guard 按工具名硬拒（`NEVER_TOOLS`，`app/sdk/src/policy/guard.mjs:38`），要么把它的路径解析补进 guard 和 shell-ask。推荐先拒、等有需要再补 |
| bash-sandbox confine 的 argv 形状（request-net 钉住了它） | `app/sdk/src/policy/request-net.mjs:52` | `dsh-bash-sandbox` lib 0 行差异 | 无 |
| `AgentPresetRegistry.definitions`（p2temp 读它） | `app/sdk/src/p2temp/index.mjs:74-78` | `definitions` 用法计数两版相同；内部从 `impl.fiber` 改成 `impl.ctx.fiber`（cordis 4.1 的 Impl 形状），`write()` 改名 `commit()` | p2temp 只读 `definitions.get(id).config.plugins`，不碰 Impl。预计无影响，升级单跑 p2temp 单测 + market e2e 确认 |

## 5 cordis 4.1.0 波及

**peer 范围**（`evidence/T15/s5-cordis-peers.txt`）：49 个包里，45 个在 rc.1 的 `peerDependencies` 写 `~4.1.0`（alpha.2 全是 `~4.0.6-alpha.1`）；`dsh` 本体以 `dependencies: ~4.1.0` 带 vendor cordis；其余几个不声明。两个范围不相交 → **9 个直接依赖必须同次升级**，混装会让 pnpm 装出两份 cordis、服务注入失败（T4 风险项「cordis 双实例」的同类问题）。

**我们自己的插件用到的 cordis API**（`app/sdk/src/**`、`app/sdk/profile/plugins/**` 的调用计数：`ctx.get` 28、`ctx.on` 21，其余都是 dsh 服务）与 4.0.6-alpha.1 → 4.1.0 的对照（`/dev/shm/bot-T15/cordis/*/package/lib/types/*.d.ts`）：

| 4.1.0 变更 | 我们是否命中 | 结论 |
|---|---|---|
| `ctx.on(name, listener, options?: boolean \| EventOptions)` 签名不变；`prepend` 仍是 `unshift`（`src/events.ts` 两版都在 :142-143） | guard 靠 prepend 钉在 waterfall 最外层（LEARNINGS P5-04.f1） | 无影响，升级单重跑 P5-04 ⑤ 顺序证明格 |
| `Events.register/unregister` 变 private | 我们的 `.register(` 全是 `ctx.tools.register` / `ctx.agentPresets.register`（dsh 服务） | 无 |
| `Fiber` 去掉 `_config` / `store`，改为 `committed` / `provisions` | 我们没用到 Fiber 内部 | 无 |
| Impl 去掉 `fiber`，改为 `ctx` + `dependents`（`reflect.d.ts`） | 我们不碰；上游 agent-preset-registry 自己适配了（§4） | 无 |
| `Logger` 级别枚举 `INFO`/`WARN` 互换数值 | 我们只调 `ctx.logger` 一次，没有按数字设级别 | 无；升级单 grep 一遍确认 |
| 新事件 `internal/service` | 不用 | 无 |

## 6 ssh 族变更与 T5 设计

**`7bd189b3b5`**（`evidence/T15/commit-7bd189b3b5.txt`）：fs-ssh 的 `src/index.ts` +26 行，helper +23 行、schemas +26 行，新增 RPC `fs.patch` / `fs.delete` / `fs.move`（rc.1 的 helper 里各有字面，alpha.2 为 0）。rc.1 的 `SshFileSystem` 写入口从 2 个变 5 个，**仍然没有 `checkedTarget`**（`evidence/T15/s6-anchors.txt`）。

**对 DESIGN D1 的影响**：D1「覆盖面 = writeText/editText」只对 alpha.2 成立。对着 rc.1 写的话：
- `fs-zone-ssh` 要覆盖五个入口；`moveFile` 的源和目标都要过 zoneGuard（与 rc.1 本地 fs-sandbox 的写法一致，它对源和目标各调一次 `checkedTarget`）。
- D1 的防漏格（枚举原型方法名与白名单比对）在升级时会红，正好起作用。
- **D4（helper 无配置挂沙箱，读不设防）在 rc.1 下仍成立**：helper 里 `ctx.plugin(LocalSandboxProvider))` 计数两版都是 1，`runnerCommand` 两版都是 0。

**DESIGN 装包锚点在 rc.1 下的位置**（按锚点所指代码的字面串重新定位；DESIGN 里写的是 alpha.2 行号）：

| DESIGN 锚点 | a2 实测 | rc1 | 备注 |
|---|---|---|---|
| `dsh-ssh/lib/helper.js:535` SandboxPolicyService | 535 | 535 | 不变 |
| `dsh-ssh/lib/helper.js:541` LocalSandboxProvider | 541 | 541 | 不变 |
| `dsh-ssh/lib/helper.js:557` mkdtemp `/tmp/dsh-ssh-` | **558** | 558 | **DESIGN 勘误**：两版实际都在 558 行（DESIGN 与复审都写的 557，差 1 行） |
| `dsh-ssh/lib/schemas.js:125` `root: remotePath` | 125 | **161** | 前移 36 行（新增 patch/move 的 schema） |
| `dsh-sandbox-ssh/lib/index.js:16`、`:34` | 16 / 34 | 16 / 34 | 不变（包内只有依赖范围变化） |
| `dsh-fs-ssh/lib/index.js:25` class | 25 | **11** | 整体前移 14 行 |
| `dsh-fs-ssh/lib/index.js:30` resolve | 30 | 16 | 同上 |
| `dsh-fs-ssh/lib/index.js:93` writeText | 93 | 79 | 同上 |
| `dsh-fs-ssh/lib/index.js:102` editText | 102 | 88 | 同上 |
| （新）patchText / deleteFile / moveFile | — | 97 / 106 / 114 | D1 覆盖面要加这三行 |

上表之外，DESIGN 引的 `repos/` 源码锚点不受升级影响（引的是 repos 仓，不是装包）。D7 的断连固定串两版都在：`SSH connection is closed`（dsh-ssh index.js 各 1 次）、`outcome is unknown`（protocol.js 各 1 次），T12 识别逻辑不受影响。

## 7 踩坑对照表

证据：`evidence/T15/s7-pits.txt`（两版 tarball 里的字面计数）。「没修」= 相关代码两版相同或计数相同。

| # | 坑（来源） | rc.1 相关提交 | 结论 |
|---|---|---|---|
| 1 | dsh-ssh 用 `execFile("ssh")` 且不传 `-F`，隔离 HOME 挡不住真实 `~/.ssh`（PLAN §3-1） | 无相关提交（`execFile("ssh"` 两版各 1，`'-F'` 两版各 0） | 没修 |
| 2 | 私有 sshd 夹具（PLAN §3-2） | 我们的夹具，不涉上游 | 不适用 |
| 3 | 测试目录要在 bot-reap 白名单下（PLAN §3-3） | 我们的工具 | 不适用 |
| 4 | 客户端控制目录写死 `/tmp/dsh-ssh-*`（PLAN §3-4、§3-10） | 无（index.js 字面两版各 1） | 没修 |
| 5 | helper 必须在 bwrap 私有 `/tmp` 之外（PLAN §3-5） | 无（README 同句两版各 1） | 没修（是部署约束） |
| 6 | helper 用 Node 24、`--disable-sigusr1`（PLAN §3-6） | 无（两版各 2） | 没变 |
| 7 | 不重连、不重放（PLAN §3-7） | 无（README 同句两版各 1） | 没变（是设计） |
| 8 | Web workspace 视图假定宿主 fs（PLAN §3-8） | 无（README 同句两版各 1） | 没修 |
| 9 | `AllowTcpForwarding` 与 streamlocal 耦合（PLAN §3-9） | OpenSSH 行为 | 不适用 |
| 10 | 硬杀留空目录（PLAN §3-10） | 同第 4 条 | 没修 |
| 11 | 断连形态 = 整轮终止（T4 §5-1） | 无（两个固定串计数两版相同） | 没变 |
| 12 | 插件激活失败只报 warning 不致命（T4 §5-2） | 未定位到 loader 实现 | 看不出 |
| 13 | tool-fs-search 用宿主 rg 路径（T4 §5-3、DESIGN D9） | 无（`@vscode/ripgrep` 两版各 7） | 没修 |
| 14 | spill-local 落宿主 tmpdir（DESIGN D9） | 无（base 行两版各 2） | 没修 |
| 15 | skill-filesystem 宿主 chokidar、远端无 watch（DESIGN D9） | 无（chokidar 两版各 2） | 没修 |
| 16 | helper 无配置挂 LocalSandboxProvider，读不设防（DESIGN D4） | 无（两版各 1） | 没修 |
| 17 | fs-sandbox 围栏用含 `/tmp` 的 `writableRoots`（P6-25 决策 37） | 无（fs-sandbox `writableRoots(policy)` 两版各 1；dsh-sandbox `canonicalPath("/tmp")` 两版各 1） | 没修，我们的 zoneGuard 仍然必要 |
| 18 | `agentsHome` 缺省取真实 `~/.agents`（T6） | 无（skill-filesystem `agentsHome` 两版各 4） | 没修，`childEnv` 的收口仍然必要 |
| 19 | approval.yml 插入行加载顺序不可靠，要靠 prepend（LEARNINGS P5-04.f1） | cordis 4.1.0 的 prepend 实现不变（§5） | 没变 |
| 20 | llm-replay 的 ReplayEntry 形状 `{kind:'chunks',…}`（T4 回执 R2） | 无（`"chunks"` 两版各 11） | 没变 |
| 21 | plugin-manager 要求 `dsh.bundle`，裸 MCP 包装不上（`app/sdk/src/market/wrapper.mjs:1-10`、PLAN §5-7） | `e2025b16b3` 等 plugin-manager 提交只改安装失败归因；`not-bundle` 计数两版各 6 | 没修，`wrapper.mjs` 继续保留 |
| 22 | T7a/T14：产品组合下 `sandboxPolicy.resolve` 无 workspaceRoot | sandbox-policy lib 两版逐字节相同（§2） | 无关 |
| 23 | schedule 工具名（`app/sdk/src/orchestration/envelope.mjs:46-51` 注释里早有「repos HEAD 已改名」的提醒） | rc.1 落地改名 | **反向：rc.1 引入新问题**（§1 第 2 条） |

## 8 升级单草案（只写草案，不开单）

**前置**：T14、T7a、T7b 已合并且验收；T9a 已合并；T9b、T7c 未开工（或者在升级单里一起改）。机器负载允许跑全量回归。

1. **备份与回退**：备份测试用与本机产品的 `$DSH_HOME`（会话 jsonl 会被 `dffda31215` 迁移）；写清回退步骤（恢复 lockfile + 恢复备份）。
2. **一次升齐**：`app/sdk/package.json` 的 9 个 `@deepseek-ai/*` 依赖一起改到 `0.2.2-rc.1`，在主仓 worktree 里 `pnpm install` 更新 lockfile；用 `pnpm why @deepseek-ai/cordis` 确认只有一份 4.1.0。
3. **三件安全修补（先写会红的测试）**：
   - envelope `JOB_TOOLS` 换成 `schedule_edit` / `schedule_view`，同步改 `ENTRY_ANNOTATIONS`（`app/sdk/src/orchestration/envelope.mjs:48-51`、`:71-74`）。先红格：worker 会话调 `schedule_edit` 被放行。
   - `apply_patch`：guard `NEVER_TOOLS` 加入它（`app/sdk/src/policy/guard.mjs:38`）。approval.yml 的三个 preset 副本按上游逐字同步，并显式写 `applyPatch: false`。先红格：一个测试 overlay 打开 `applyPatch`，调用 `apply_patch` 写 `/tmp/x`，修补前不被预执行层拦。
   - 执行层：加一格证明 `patchText/deleteFile/moveFile` 经我们的 `checkedTarget` 拒区外写和 NEVER（目标 `/tmp` 与测试 HOME 的 `.ssh`）。
4. **approval.yml 副本同步**：preset-standard / preset-cordis / preset-ptc 三段照 rc.1 逐字重抄（只差 `applyPatch: false`）。
5. **锚点重定**：
   - 代码注释里写死的 `0.2.2-alpha.2 lib/index.js:<行>`（`app/sdk/src/orchestration/envelope.mjs:71-74`、`app/sdk/src/policy/request-net.mjs:10`、`:52`、`app/sdk/src/p2temp/index.mjs:74`）改指 rc.1 实际行。
   - DESIGN-ssh-composition 装包锚点按 §6 表改，并把 D1 覆盖面改为五个入口（同时把 T9b 工单的验收改成五入口）。
   - `p9-dsh-integration/PLAN.md` 头部的钉版说明改为 rc.1。
6. **全量回归**：app/sdk 全量 vitest（unit + e2e，含 guard-fs、w1ap0-matrix、write-outside、tiers-policy、sandbox-*、request-network、ssh-host、ssh-headless、skill-save）；app/ui unit + e2e 全量；P5-04 ⑤ 顺序证明格单独确认绿。以升级前基点同一组的结果作对照（P5-H8 的已知超时格按基点同格同结果判）。
7. **验收要点**：上面三个先红格先红后绿；`pnpm why` 只有一份 cordis；全量回归与基点同数；`git diff` 只含 package.json、lockfile、approval.yml、envelope.mjs、guard.mjs、新测试，以及注释和文档里的锚点。

## 附：本次没核实到底（如实）

1. §7 第 12 条（插件激活失败只报 warning）没在 loader 里定位实现，标「看不出」。
2. §4 p2temp 的「预计无影响」只基于 `definitions` 用法计数相同与读码，没有在 rc.1 下实跑。
3. `dsh` 本体（273 行差异）与 `dsh-web-app`（317 行，其中 cordis.patch.yml 的变化已在 §3 列出）的其余差异没有逐行审；与我们的耦合面（CLI `web`/`headless` 子命令、`--patch` 语义）的回归交给升级单第 6 步。
4. 主 agent 派发消息写的报告路径是 `work/p9-dsh-rc1-upgrade/`，工单与验收命令写的是 `work/p9-dsh-integration/EVAL-dsh-rc1.md`。按工单路径交付。
