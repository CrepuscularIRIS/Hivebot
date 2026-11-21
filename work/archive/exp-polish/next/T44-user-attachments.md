# T44：给 bot 发图片 / 文件（composer Attach、粘贴、拖放）

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> **草稿，等 Q-039**（M1 白名单增 `session/attachment` 等行）。Q-039 答 A 后先做 §探针，探针过了再挪 `open/`。
> 来源：`work/exp-polish/AUDIT-0.79.3.md` C3 / 场景 5（queue E8）
> 分支 / 作业目录：feat/T44 @ /tmp/bot-wt/T44
> claimed：
> accepted：

## 目标
composer 的 Attach 钮回来；选图 / 粘贴截图 / 拖文件进输入框，发出去 bot 能看到图、能读到文件；发出的那条消息上显示缩略图 / 文件条，重启后历史里还在。

## 原版与零件
- 0.79.3：`x9ecE4` Attach file、`N7m8E+` Attach files、`Couldn't upload an attachment. Try again.`；staging 管线 stage→commit/discard（RE-FULL §3「附件」）。
- 0.18 树：composer 附件 + draft `attachments`（`recovered/features/conversation/workspace/model.ts:31`）、桥 `stageAttachmentBytes / commitStagedAttachments / discardStagedAttachment`（`contracts/desktop-bridge.ts`）、用户侧画廊 `media-viewer.tsx:237`（`role:'user'`）、`user-attachment` 投影（`production/model.ts:419-431`）。
- dsh：`dsh-attachment` + `dsh-attachment-local`（默认组合已挂）：prompt 里放**编码图片**直接收（PNG/JPEG/WebP/GIF，拒一张整条失败）；历史图片经 `session.attachment {sessionId, attachment: ImageAttachmentRef}` 读回（`dsh-api-session-controller` README :77）；非图片文件走 `fileUploads` 收据（README :36）。

## 现状
1. Attach 钮被 `overrides/dead-entries.css:17` 藏；`desktop.ts:272` stage 恒 `{ok:false}`；`data.ts:545` prompt 只发 `[{type:'text'}]`。
2. M1 白名单（`main/m1-api/index.ts:12-29`）有 `session/prompt`，**没有** `session/attachment`、没有 file upload——历史图片读不回来、非图片文件发不出。这是 Q-039 要定的。

## 探针（Q-039=A 后、开工前，主 agent 做，结果贴回执头部；任一条不成立就停，回经理任务 C）
- P1：dsh `session/prompt` 编码图片块的确切形状（`dsh-llm` 的 `ImageBlock` / admission 入口 `ctx.attachments.admitPromptContent`，读 `types.d.ts` 不猜）；用 SDK 测试 harness（`app/sdk/tests/support/fake/harness.ts`）发一张 8×8 png，看 `user/message` 事件里留下的引用形状。
- P2：生产模型能不能收图：`session/modelCatalog` 里当前默认模型的输入模态字段。不收图 → 只做「文件」半边，图片钮置灰并提示，回执记。
- P3：`session.attachment` 经 M1 透传读回 P1 那张图，字节一致。

## 边界（探针过后）
1. 只动：`renderer-grok/shim/src/{desktop.ts,data.ts,entries.ts}`、`renderer-grok/overrides/dead-entries.css`（删 Attach 那一条，语音钮保留）、`main/m1-api/index.ts`（只加 Q-039 批准的行，带参数校验）；新测试 `tests/unit/grok-shim/attachments.test.ts`、`tests/unit/m1/attachment-rows.test.ts`、`tests/e2e/grok-attachments.spec.ts`；`tests/e2e/grok-dead-entries.spec.ts:141` 改为 Attach 可见（本单授权只改这一行）。
2. 先红：
   - ① stage 一张 png → `sendPrompt` 发出的 content 恰为 `[text?, <P1 的图片块>]`（形状按 P1 逐字写断言）。**施工前必红**。
   - ② 大于部署上限 / 非四种格式 → stage 返回失败原因，composer 显示原版错误串，不发。
   - ③ 历史里的 user 消息带图片引用 → transcript 条目 `attachments.length===1`，`resolveAttachmentMedia` 经 `session/attachment` 拿到 dataUrl。
   - ④ M1 新行参数校验：`session/attachment` 缺 sessionId / 引用不是对象 → `pbots/invalid-args`；D9 拒绝层不受影响（`d9DeniedReason` 现有格全绿）。
3. 隔离 HOME / TMPDIR；动 M1 白名单 = 契约 / 鉴权单 → 施工完单独派 reviewer。

## 验收
1. `VR tests/unit/grok-shim/attachments.test.ts tests/unit/m1 --reporter=verbose` → 全 passed
2. e2e `grok-attachments.spec.ts`：fake 模型回合里断言收到的 prompt 含图片块；页面上用户消息有 `img`（naturalWidth>0）；`page.reload()` 后仍在。截图 `work/exp-polish/evidence/T44/*.png`
3. 变异：V1 不带图片块 → ① 红；V2 M1 去掉参数校验 → ④ 红
4. 生产旁证：给普通 bot 贴一张截图问「图里写了什么」→ 回答对得上图；重启后历史缩略图在。

## 为什么这样验收
- 用户要「发得出、bot 看得见、回头还看得到」三件；①③ + 生产旁证各守一件。P2 先查模型能不能看图，免得做完 UI 发现模型瞎。
- M1 白名单是安全边界，④ 守「开了新行，参数校验和 D9 永拒层都还在」。

## 产出
- 见边界第 1 条；`work/tickets/receipts/T44.receipt.md`
