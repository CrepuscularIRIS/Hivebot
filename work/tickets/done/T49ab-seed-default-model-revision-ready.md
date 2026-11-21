# T49ab：T49a 返修——默认模型跟种子一致、种子带 revision、ready 行在种子之后（Sol M2/M3/M4）

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`review/T49-T49a.sol-review.md` M2/M3/M4（经理核实成立，见该文末）
> 分支 / 作业目录：feat/T49a @ /tmp/bot-wt/T49a（原分支追加提交）
> claimed：2026-11-11 @ 6da027de（返修完：Sol 脚本全转通过；launcher 回归在跑）
> accepted：2026-11-11 feat/T49a @ 84c43dc0（manager 任务 B 终验 T49a 线：start.test 58p、t49a e2e 1p 亲跑；对集成分支 diff 仅 4 文件；Sol M2/M3/M4 + 增量 CR/MINOR 均闭合）

## 目标
真实模式启动后，对外宣布 ready 的那一刻：默认路由已在、默认模型就是种子里的模型、且种子从不覆盖用户已存的路由。

## 三处（经理核实，`app/sdk/src/start.ts` @ ef030630）
- **M2**：`profile/patches/p2sdk.yml:30-33` 静态 `model: glm-5.3-flash`，种子用 `cfg.model` → `P2SDK_LLM_MODEL=x` 时默认选择指向不存在的模型。修：`writeRuntimePatch` real 分支也写 agent-default-model 行（provider litellm、model=cfg.model），与 mock 分支对称；p2sdk.yml 静态值留作兜底。
- **M3**：`seedDefaultRoute` describe 后 mutate 不带 `expectedRevision`。修：取 describe 中 llm-pi-ai 的 `revision` 随 mutate 发出（wire 形态照 dsh-settings / client.js:2071 `writeSettings(ns, ops, expectedRevision)` 核实后写回执）；revision 冲突 → 重读一次，已有 litellm 即放弃种子，否则再试一次，仍冲突则按「种子失败」处理。
- **M4**：child stdout 原样转发（:1104），`[p2sdk] ready` 早于种子（:1230）；launcher `app/launcher/hivebot:197` 正是等这行才起 UI → 窗口期内连上的客户端 `routableProviders: []`。修：ready 行暂扣，种子成功后（mock 直接）再写出；种子失败不写 ready、以非 0 退出。其余 stdout 照常转发，行格式不变。

注：M4 修好后真实消费者（launcher→UI）不可能在种子前连上，M3 只剩同机直连 handoff 的进程会触发；仍要修（一行参数的代价，且 DSH 自己就这么写）。

## 边界
只动 `app/sdk/src/start.ts`、`app/sdk/profile/patches/p2sdk.yml`（仅注释或兜底值）、`app/sdk/tests/unit/` 与 T49a 的 e2e spec。不碰 launcher 与 `app/ui/`。先写失败测试看红。

## 验收
1. 单测：①real 模式 runtime-patch 含 agent-default-model 且 model=cfg.model；②seed 发出的 mutate 带 describe 的 revision；③桩返回 revision 冲突且重读后已有 litellm → 不再写；④ready 行在 seed resolve 之前不出现在 stdout（桩控时序），seed reject → 无 ready 行且退出码非 0；⑤mock → ready 直出、不调 seed。
2. e2e（T49a spec 加断言）：`P2SDK_LLM_MODEL=<自定义>` 起实例 → 一见 ready 行立即 `session/modelCatalog`：litellm 组非空，且 default model = 自定义模型。
3. Sol 复现脚本 `/tmp/t49a-sol-race-probe.mjs` 与 `/tmp/t49-sol-review-probe.mjs` 的 M2/M4 段转为通过，回执贴原样输出。
4. 回归（低负载）：`app/sdk` 全量 vitest 不新增红；`app/ui` launcher.spec 不新增红。

## 为什么这样验收
用户看见的是「打开就能聊、选的是自己配的模型、改过的设置不被抹」。e2e 用「一见 ready 立刻查」而不是轮询，就是为了不再让轮询掩盖时序窗口（Sol 指出的盲点）。
