# T90：输入面 `:` emoji 补全和 `@` 提及 Bot 真能用（A8 P0）

> 开单：manager (Opus 5.5) | 日期：2026-11-14 | 施工：main (GLM 5.3)
> 来源：`work/grok-0.79.3-re/RE-UI-FACES-0.78.1.md` §2（L86-149），差距表 L137-139，施工建议 L149；覆盖度地图 A8 P0（`RE-COVERAGE-MAP-0.78.1.md:113`）
> 分支 / 作业目录：feat/T90 @ /tmp/bot-wt/T90
> claimed：收窄段 f213010b @ /tmp/bot-wt/T90n（面板/提及=T90b）
> accepted：2026-11-14 f213010b（收窄段；经理任务 B 重跑 1p / check 14 / compact-DCKl25B_.js）
> **2026-11-14 经理裁决：本单收窄为只合 emoji 目录数据，验收见 `receipts/T90.progress.md` 尾「经理裁决」节；下文验收第 3-5 条（e2e ①-⑤、截图、回测）与 `@` 提及移到 T90b。**

## 目标
用户在输入框打 `:smi` 能选 emoji，打 `@` 能选到自己的 Bot 并插入提及块。这是每天都会用的交互。

## 经理已查清的现状（RE 报告写的「无」不完全对，施工第 0 步先实测）
编辑器管线 0.18 重建树里**已经全有，也已接线**，缺的只是 emoji 数据：
- TipTap 扩展：`@` mention（`rich-text-editor.tsx:451-490`，空态 `Nothing to mention yet`、无匹配 `No matches for "…"` 与原版 APP 键 `vI1YCx`/`NQSKOV` 同文案）、`:` emoji（`:545-570`）。发送时 mention 序列化为 `@<label>` 纯文本（`:680`）。
- 数据源：`ProductionRenderer.tsx:817-830` 建了 `createComposerEditorSuggestionAdapter`，Bot 列表走 `client.call("listAgents")`（shim `data.ts:610` 有实现），emoji 走 `createEmojiCatalogStore()`；`:1441-1455` 把 providers 交给编辑器。
- **emoji 数据缺**：`emoji-catalog.ts:20-40` 要加载 0.18 原产物的四个 chunk（`compact-C8-lyxgK.js` / `messages-ByIkiGdI.js` / `iamcal-CEyh6ide.js` / `emojibase-Bc-csq5x.js`），`assets/runtime/` 里一个都没有 → 目录永远加载失败。与 T89 同一个根因。
- 这四个文件的数据形状就是 npm 包 `emojibase-data` 的 `en/compact.json`、`en/messages.json`、`en/shortcodes/iamcal.json`、`en/shortcodes/emojibase.json`（字段 `hexcode/label/group/order/tags/unicode/emoticon/skins` 对得上，`emoji-catalog.ts:43-57`）。

## 方案（搬运阶梯第 1 级）
- 依赖 `emojibase-data`（npm，在维护，最近发版 2026-10），锁精确版本（发布满 14 天的最新版）。
- 加载器换成 Vite 动态 `import('emojibase-data/en/….json')`，交给上游已有的 `buildEmojiCatalog`/catalog store。上游零改动：走 `overrides/modules/` + `MODULE_OVERRIDES`。`createEmojiCatalogStore` 支持传 `loader`（`emoji-catalog.ts:279`），优先包一层「默认 loader 换成 npm 版」再 re-export；够不到才整模块复制（文件头写来源）。
- `@` 提及：第 0 步实测。能弹出 Bot 列表、能插入块就**只补 e2e 钉住，不改代码**；不能用就查断点（scope 未设、listAgents 形状、shim 未答），修在覆盖层或 shim，回执写根因。
- 提及的语义只做到「插入块 + 发出 `@名字` 文本」。被 @ 的 Bot 要不要真的收到 / 接手，原版语义没取证，**不在本单**，记 queue 提议。
- 范围外：`/` 命令菜单（P1）、emoji 右键 pin、Skill/Plugin 类提及、消息 Add reaction（T91，复用本单的目录数据）。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. 上面列的文件和行号；RE-UI-FACES §2.2-2.3（L96-108）
3. `app/ui/tests/e2e/markdown.spec.ts` 的造 bot / 发消息写法；`app/ui/tests/support/ui.ts`

## 边界
1. 只动：`app/ui/renderer-grok/package.json`（+ lockfile）、`overrides/vite.config.ts`（MODULE_OVERRIDES 加行）、`overrides/modules/` 下新建 emoji 目录覆盖模块；`@` 真不通时允许改 `shim/src/` 对应处（回执写明）。新 e2e `app/ui/tests/e2e/t90-composer-suggest.spec.ts`。别的不碰。
2. **先写失败测试**：t90 spec 先在当前主线跑，① emoji 格应红（`.sand-emoji-listbox` 不出现或无 `.sand-emoji-option`），贴原样输出；② `@` 格如果当前就绿，回执照实写「已通，仅补测试」。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径。只跑下面列的 spec。
4. 与 T89 同改 `MODULE_OVERRIDES` 和 `package.json` 相邻行：后合并的那张三方合并。
5. 只在 feat/T90 提交。

## 验收（写命令，不写感觉）
1. `cd app/ui/renderer-grok && pnpm check` → `upstream diff=0`，exit 0
2. `cd app/ui/renderer-grok && pnpm build` 后 `grep -rl '"hexcode"' .build/frontend-shell/assets | head -1` → 有输出（emoji 数据进了产物）
3. `cd app/ui && npx playwright test tests/e2e/t90-composer-suggest.spec.ts` → 全部 passed：
   - ① 输入框打 `:smile` → `.sand-emoji-listbox` 可见、`.sand-emoji-option` ≥1；按 Enter → 编辑器文本含 `😄`（或列表首项对应的 unicode，断言取首项的值，不硬编码），且 `:smile` 字样消失
   - ② 先建两个 bot（`Alpha-T90`、`Beta-T90`），在 Alpha 里打 `@Be` → `.sand-mention-listbox` 里有 `Beta-T90`；Enter → 编辑器内出现 `span[data-type="mention"]` 文本 `@Beta-T90`
   - ③ 接 ②发送 → 用户气泡文本含 `@Beta-T90`；`rt` 侧收到的 prompt 文本含 `@Beta-T90`（证明发出去的不是空或 `[object Object]`）
   - ④ 打 `@zzzz` → 出现 `No matches for "zzzz"`；Esc → 列表关闭、输入框文本保留
   - ⑤ 输入法保护回归：`page.keyboard` 模拟 composition 期间按 Enter 不选中、不发送（照上游 IME 判据写；上游没有对应钩子就删这格并在回执说明）
4. 亮暗各一张 DPR2 截图：emoji 列表展开态、mention 列表展开态，存 `work/grok-0.79.3-re/evidence/T90/`（目录不存在就建），回执写确认点（列表贴在光标附近、不越出窗口、暗色可读）
5. 回测：`npx playwright test tests/e2e/markdown.spec.ts tests/e2e/session.spec.ts` → passed（发送主路径不回退）

## 为什么这样验收
- 真目的是「打字时能选、选了能发出去」。所以断言覆盖 列表出现 → 选中进编辑器 → 发出去的文本，三段都要；只看列表出现不够（插入或序列化坏了一样过）。
- ① 断言取列表首项而不是写死 😄，防止数据版本升级把测试变脆；但必须断言 unicode 真进了编辑器。
- 第 2 条证明数据是打包进产物的，不依赖 DEV 服务器。
- ④⑤ 保护已有的键盘行为（Esc、中文输入法），这类回归用户一碰就会发现。

## 产出
- emoji 目录覆盖模块、`MODULE_OVERRIDES` 一行、`package.json` 一个依赖；（`@` 不通时）shim 修复
- `app/ui/tests/e2e/t90-composer-suggest.spec.ts`
- `work/tickets/receipts/T90.receipt.md`（第 0 步实测结论、先红后绿原样输出、截图确认点）
