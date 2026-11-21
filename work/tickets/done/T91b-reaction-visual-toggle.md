# T91b：reaction 视觉对齐 0.78.1 + toggle 真测（T91 返修）

> 开单：manager (Opus 5.5) | 日期：2026-11-15 | 施工：main (GLM 5.3)
> 来源：T91 验收不通过（manager 任务 B，2026-11-15，T91 工单尾「经理验收」节）
> 分支 / 作业目录：续 feat/T91 @ /tmp/bot-wt/T91（在 bc0c9102 之上加提交）
> claimed：0be437a6 @ /tmp/bot-wt/T91（2026-11-15）
> accepted：

## 目标
T91 功能链已通（hover→picker→RPC→pills），但界面不能给用户看：笑脸钮是空白方块、快捷条是浏览器默认按钮、👍 pill 被挤进用户气泡里裁掉；toggle（再点同 emoji 取消）没有任何测试真正覆盖 shim。本单补齐这三件，T91+T91b 一起验收合并。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. 现状截图 `work/grok-0.79.3-re/evidence/T91/{hover-actions,picker,pills}.light.png`（经理已看：问题如上）
3. 原版规格：`work/grok-0.79.3-re/RE-UI-FACES-0.78.1.md` §4 L210（hover smiley → 快捷条 → More emoji）、L232（`React with {label}`/`Remove {label}` aria）
4. 原版产物：`work/grok-1.1.0-re/deb0781/asar/dist/renderer/assets/`——CSS `index-Dh7EWA8t.css` 里只有 `sand-reaction-bubble`，其余样式在 JS 的 className（Tailwind 工具类）里：在 index-*.js 里按 `Add reaction` / `More emoji` / `smiley-happy` 附近取原版 className 与尺寸
5. 我们的组件：`renderer-grok/frontend/src/recovered/.../transcript-card/reaction-picker.tsx`（用 `sand-reaction-picker` / `sand-reaction-pill(s)` / `sand-message-hover-actions__button` + `data-icon-name="smiley-happy"`，**当前仓里没有任何对应 CSS，也没有图标字形**）；参照同一 hover 条里「···」钮是怎么出字形的；先例：`overrides/p5-55-layout.css:339`（data-icon-name 无 cursor-icons 字体→豆腐块的修法）。shim 单测装配先例：`tests/unit/grok-shim/hidden-bots.test.ts` / `workers-hold.test.ts`（用 createShimData）

## 边界
1. 只动：`renderer-grok/overrides/` 下新 CSS（如 `reaction-t91b.css`，由 `overrides/modules/transcript.tsx` import）、图标映射（若「···」走的是某张表，就加 smiley-happy 一行）、`shim/src/data.ts`（仅删死代码 `reactionsOf` 及 `coordinator.ts` 接口那一行）、T91 两个测试文件。recovered/ 下组件不改。
2. 先红：
   - 单测：`tests/unit/grok-shim/t91-reaction-toggle.test.ts` 第一格换成**真打 shim**：经 `createShimData(...)` 拿 deps（或现有 shim 单测的同款装配方式，参考 `tests/unit/grok-shim/` 下已有用法），对同一 entry 调两次 `reactToMessage({entryId, emoji:'👍', agentId})`，断言投影条目 `reactions` 先为 `[{emoji:'👍',by:'me'}]`、后为空。现在那格只测了测试里自己写的闭包，必须删掉。
   - e2e：`t91-reaction.spec.ts` 加断言 `.sand-reaction-pills` 的 bounding box 在消息气泡 bounding box **之下且不重叠**；hover 钮内 smiley 有可见字形（宽高 > 0 的 svg/mask，或 computed `mask-image`/`content` 非 none）——当前必红。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径；不跑全量 e2e。
4. 只在 feat/T91 提交。

## 验收（写命令，不写感觉）
1. `cd /tmp/bot-wt/T91/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t91-reaction.spec.ts` → 1 passed（含上面两条新断言）
2. `CI=true PBOTS_TEST_HOOKS=1 ./node_modules/.bin/vitest run tests/unit/grok-shim/t91-reaction-toggle.test.ts` → 全过，且第一格经 shim deps 走 toggle 增→删
3. 回归：同 run-e2e 跑 `tests/e2e/t83-enter.spec.ts tests/e2e/t73c-connector-grant.spec.ts` → 2 passed
4. 截图 DPR2 亮 + 暗各三张（hover / 快捷条 / pill），截图前等过渡结束（现有三张拍在淡入中途）；放 `work/grok-0.79.3-re/evidence/T91/`；回执里逐张写「对照 0.78.1 哪个类/尺寸」
5. `grep -rn reactionsOf app/ui/renderer-grok` → 无输出

## 为什么这样验收
- 用户看得到的是界面，不是 RPC。T91 的 e2e 只证明了「pills 容器出现」，没证明它长在对的位置、长得像原版；所以加几何断言 + 亮暗截图由经理亲看。
- toggle 是 reaction 的另一半语义，T91 把它从 e2e 挪到单测时，单测没有碰 shim，等于没测。允许留在单测，但必须打到 `deps.reactToMessage` 和投影。

## 产出
- overrides 下 CSS（+图标一行）、两个测试文件更新、data.ts/coordinator.ts 删死代码
- 亮暗截图 6 张、`receipts/T91b.receipt.md`

## 经理终验（2026-11-15，HEAD 0be437a6）— 不通过，开 T91c
- 重跑：t91 e2e 1 passed；toggle 单测 2 passed（真 shim）；t83-enter passed；`reactionsOf` grep=0；diff bc0c9102..0be437a6 只动 6 个允许文件 ✓
- t73c **红**（回执写 passed）：worktree 与主仓（含 main）各跑都红，fake-llm `no scripted call #0`——环境/既有问题，与 T91 无关，不算本单失败；回执那句「2 passed」与经理复跑不符，记一笔
- 截图亲看：笑脸字形 ✓；pill 在气泡下未裁 ✓；暗色可读 ✓（pills.dark 同时含快捷条+hover 钮，暗色覆盖实际够）。**不过的两处**：①快捷条「More emoji」渲染成两行英文溢出（原版是 `smiley-plus` 图标）②快捷条整条压在被回应的用户气泡上（定位参照了气泡下方的锚点）→ T91c
- T91 / T91b 留 doing/，T91c 过后三单一起挪 done/ 合并
