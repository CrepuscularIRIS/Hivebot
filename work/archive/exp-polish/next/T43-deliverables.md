# T43：bot 交付的文件在聊天里直接看、能下载（present → 消息附件条）

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> **草稿**：T42 回执后挪 `work/tickets/open/`。
> 来源：`work/exp-polish/AUDIT-0.79.3.md` K4 / 场景 4（queue E7）；用户原话「他会交付电脑」「computer use, browser use 的显示回传」；CU 清单 B5。
> 分支 / 作业目录：feat/T43 @ /tmp/bot-wt/T43
> claimed：
> accepted：

## 目标
bot 用 `present` 交付文件后，它那一轮的回答下面出现原版的附件条：图片是缩略图（点开大图）、PDF 点开内嵌查看、其他文件是带名字和大小的条，都能 Download（另存一份到你选的位置）。现在交付只在 outline 里一行字。

## 原版（规格）与零件
- 0.79.3：附件条 + 全屏查看器 + 「Download file」/「Download all」（`/tmp/grokbot-0.79.3/i18n-en.json`；chunk `fullscreen-file-viewer-body`、`text-viewer`、`pdf`、`xlsx`）。
- 0.18 树已挂：`recovered/features/conversation/workspace/transcript.tsx:788` 消息带 `entry.attachments` 就渲染 `TranscriptAttachmentGallery`（`media-viewer.tsx:237`：`role` 决定左右、图片走 `resolveMedia`、PDF 走 `readAttachmentBytes` + `PdfAttachmentViewer`、chip 走 `downloadAttachment`）；`spreadsheet-viewer*` 同族。
- dsh：`dsh-tool-present`（生产工具表有 `present`）：`files:[{path, description?}]`，记绝对路径，可以是工作区外（`/tmp`、Downloads）。

## 现状（经理探针）
1. `shim/src/entries.ts:124-128` 普通工具行不进主聊天（T22），present 也被吞。
2. `production/model.ts:445-463`（上游投影）的文本消息不带 `attachments`；只有 `kind:'attachment'|'user-attachment'` 带，且一律当用户侧（`role:'user'`）。我们已有覆盖 `overrides/modules/model.ts`。
3. 桥全是桩：`shim/src/desktop.ts:261-264` `resolveAttachmentMedia/readAttachmentText/readAttachmentBytes→null`、`downloadAttachment→true`（假成功）。
4. main 已有一个带围栏读 bot 工作区的先例：`main/skills/index.ts`（`<dataDir>/workspaces/<botId>`，逐层 lstat 拒链接，`assertBotDir`）。

## 定案（自定）
- **呈现位置**：一轮里所有成功的 present 文件，挂在该轮**终答消息**的 `attachments` 上（按调用顺序去重）；该轮没有终答文本时，单出一条只有附件的 assistant 消息。改 `overrides/modules/model.ts`：raw 是 assistant 消息且带 `attachments`（`[{path, name, size?}]`）时原样带进投影。
- **读文件围栏（main，新 IPC）**：preload 加窄函数 `pbots.files({op:'media'|'bytes'|'download', botId, path, maxBytes?})`。main 校验顺序：botId 合法（复用 skills 的 bot 目录校验）→ `realpath(path)` 必须在 `realpath(<dataDir>/workspaces/<botId>)` 之内 → 是普通文件 → 大小 ≤ 上限（media 25MB、bytes 用调用方 maxBytes 但封顶 50MB）。任何一步不过 → 返回 null（renderer 显示为不可预览的 chip），不抛内容。
  - `media`：按文件头魔数判图片（png/jpeg/gif/webp），回 `{kind:'image', dataUrl, width?, height?}`；不是图片 → null。
  - `bytes`：回 bytes（PDF 查看器用）。
  - `download`：`dialog.showSaveDialog`（默认 `~/Downloads/<name>`）→ `copyFile`；用户取消回 false。**不提供「用默认程序打开」**（打开任意类型文件 = 执行面，越过审批语义，不做）。
- 工作区外的交付（`/tmp` 等）：chip 照常显示名字 + 路径 tooltip，预览 / 下载不可用（null）。回执记一条。ssh bot 的远端文件同理不可用。
- renderer 不接触 dataDir 路径：shim 只传 botId + present 记录的原始 path。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/ui/main/skills/index.ts`（围栏写法照抄思路）、`preload/index.ts` 文件头规矩
3. 上面「原版与零件」列的 0.18 文件（只读）；`overrides/modules/model.ts`；`shim/src/entries.ts:95-150`；`renderer/session/reduce.ts` 里 tool 条目的 `args/result/status` 形状
4. `dsh-tool-present` README（`app/sdk/node_modules/.pnpm/@deepseek-ai+dsh-tool-present@0.2.2-alpha.2*/…/README.md`「Use this package」段）

## 边界
1. 只动：`preload/index.ts`（加 `files`）、`main/` 新文件 `main/files/index.ts` + `main/index.ts` 接线、`renderer-grok/shim/src/{entries.ts,desktop.ts,data.ts}`、`renderer-grok/overrides/modules/model.ts`；新测试 `tests/unit/files/fence.test.ts`、`tests/unit/grok-shim/deliverables.test.ts`、`tests/e2e/grok-deliverables.spec.ts`。recovered 不动。
2. 先写失败测试：
   - ① **present → 终答带附件**（entries 纯函数）：一轮 = user → tool present `{files:[{path:'/w/a.png'},{path:'/w/b.pdf'}]}` done → message「Done」→ 序列化后「Done」那条 `attachments` 逐字 `[{path:'/w/a.png',name:'a.png'},{path:'/w/b.pdf',name:'b.pdf'}]`。**施工前必红**。
   - ② **无终答**：只有 present 没有文本 → 恰 1 条只有附件的 assistant 消息。
   - ③ **失败的 present 不挂**：status failed → 无附件。
   - ④ **投影**（model 覆盖）：assistant raw 带 attachments → 投影条目 `attachments.length===2`、`role==='assistant'`。**施工前必红**。
   - ⑤ **围栏**（`fence.test.ts`，tmp 目录造 `<dataDir>/workspaces/B/`）：工作区内普通文件 → 读到；`../` 越界、工作区外绝对路径、工作区内指向外部的 symlink、目录、超上限文件、非法 botId（`../x`、空串）→ 全部 null。**施工前必红**（模块不存在）。
   - ⑥ **media 魔数**：`.png` 扩展名但内容是文本 → null；真 png → `kind:'image'` 且 `dataUrl` 以 `data:image/png;base64,` 开头。
   - ⑦ **download 取消**：fake dialog 回 canceled → false，目标目录无新文件。
   - 先跑红 ①④⑤，贴原样输出。
3. 隔离 HOME / TMPDIR，DBus 指向不存在路径；只跑下面列的 e2e。
4. 只在 feat/T43 提交；**新开 main 读文件口 = 安全 / 存储单 → 施工完单独派 reviewer**。

## 验收（写命令，不写感觉）
（`app/ui` 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`）
1. `VR tests/unit/files/fence.test.ts tests/unit/grok-shim/deliverables.test.ts --reporter=verbose` → 全 passed（①–⑦）
2. 回归：`VR tests/unit` → 全绿（基线贴回执）
3. 变异（贴红后 cp 还原）：V1 围栏去掉 realpath 只比字符串前缀 → ⑤ 的 symlink 格红；V2 去掉魔数判定只看扩展名 → ⑥ 红；V3 entries 不过滤 failed → ③ 红
4. e2e `pnpm --config.verify-deps-before-run=false test:e2e tests/e2e/grok-deliverables.spec.ts` → passed：fake 回合里 bash 在工作区写一张小 png 和一个 txt → `present` 两个 → 页面上 `[aria-label="Agent attachments"]` 内有 1 个 `img`（naturalWidth > 0）+ 1 个文件 chip；点 chip Download（测试里把 `dialog.showSaveDialog` 桩成固定路径）→ 目标文件字节与源相同。截图 `work/exp-polish/evidence/T43/{strip,lightbox}.{light,dark}.png`（亲眼确认）
5. 定向回归：`test:e2e tests/e2e/grok-shim.spec.ts tests/e2e/p6-fold.spec.ts` → 与施工前同
6. 改动行覆盖 ≥80%：`VR tests/unit/files tests/unit/grok-shim/deliverables.test.ts --coverage --coverage.include='main/files/**' --coverage.include='renderer-grok/shim/src/entries.ts'`
7. **生产旁证**：对一个普通 bot 说「用 python 画一张 sin 曲线 png，再写一份 summary.md，用 present 交给我」→ 终答下有缩略图 + md 条；点图看大图，点 Download 存到 ~/Downloads 打开确认。记 LOG。

## 为什么这样验收
- 用户要的是「bot 交的东西我在聊天里就能看到、能拿走」。①④ 是数据到画面的两段，e2e 第 4 条用真图片 `naturalWidth>0` 防「条出来了、图是裂的」。
- ⑤⑥ 是这张单的主要风险：renderer 能让 main 读文件，围栏错一点就是任意读。symlink、`..`、魔数三格各配一个变异，保证测试不是摆设。
- 不做「默认程序打开」是安全取舍，不是遗漏；回执里写明，用户要再议。

## 用户补充

## 产出
- `preload/index.ts`、`main/files/index.ts`（新）、`main/index.ts`、`shim/src/{entries,desktop,data}.ts`、`overrides/modules/model.ts`
- `tests/unit/files/fence.test.ts`、`tests/unit/grok-shim/deliverables.test.ts`、`tests/e2e/grok-deliverables.spec.ts`（新）
- `work/tickets/receipts/T43.receipt.md`、`work/exp-polish/evidence/T43/*.png`
