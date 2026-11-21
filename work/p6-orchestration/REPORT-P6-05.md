# REPORT · P6-05 preset 段落接入默认链

分支 feat/P6-05（基 main 6abbbc0）。

## 交付（diff 摘要）

1. **app/sdk/profile/patches/approval.yml**（唯一产品改动，一个字符串）：
   `preset-standard` 行 persona 的 `prefix` 由裸标量改为 literal block，值 =
   上游基础句 `You are a coding agent powered by the {{model}} model.` +
   空行 + P6-02 定稿三段式段落，与 `profile/patches/p6-reply-style.yml` 的
   p6-reply prefix **逐字节一致**（探针断言）。段落 sha256 =
   `c7c53cd4e281e361191cbdecf873d2c6c5a5d9d7e56277091bf0d54a9734b356`
   （= evidence/D3/raw/run-meta.json 的 presetSectionSha256；REPORT-P6-02
   正文缩写 c7c53c4e…356 系代录笔误，以 result.json 为准）。另有 5 行注释
   记录该偏差与出处（纯注释）。`p6-reply-style.yml` 的 insert preset 未动，
   保留给 D3 复跑。
2. **app/sdk/tests/e2e/guard-plugin-manager.test.ts**（drift 用例对齐，无行为）：
   drift 用例对 approval.yml 三个覆盖块与上游逐行比对；persona prefix 改动必红，
   故为 `standard` 增加 persona **prefix 值**的豁免（两侧同替换为一行占位），
   persona 行 id/name 与块内其余全部行（含 disabled 翻转）仍逐字比对。测试数
   不变（该文件仍 4 个）。**这是对「只改 approval.yml」字面约束的一处偏离**，
   依据 PLAN P6-05 验收 ②「drift 与 sdk 全量绿」——不改它则验收 ② 与 persona
   改动互斥。段落内容与 sha256 的独立校验在探针，不在 drift 用例。
3. **work/p6-orchestration/evidence/P6-05/**（新）：`probe.mjs`（验收探针）+
   `result.md`（红/绿运行记录）。

## 验收证据

- **探针红→绿（TDD）**：改动前 `node probe.mjs` exit=1（static：
  standard prefix 无段落）；改动后 PASS，动态段 spawn `scripts/start.mjs`
  （P2SDK_PROVIDER=mock，P2SDK_PATCH 只挂 recorder、不挂 p6-reply-style.yml）
  默认链建会话（session/create 不带 agentPreset）：header.agentPreset=
  `standard`，llm/stream 记录的 systemTexts 含段落全文（6148 字符系统提示）。
  运行时布局 /tmp/bot-p6-05 用后即删。
- **guard-plugin-manager.test.ts**：改前 drift 红（预期）；改后全文件
  4/4 绿（`HOME=/tmp/bot-p6-05-t2 pnpm vitest run tests/e2e/guard-plugin-manager.test.ts`）。
- **sdk 全量**：改动后 `HOME=/tmp/bot-p6-05-full pnpm test` →
  `Test Files 37 passed (37) / Tests 305 passed (305)`，exit=0。
- **计数不降**：干净基线（同 worktree、改动前）`pnpm test` = 305 个测试
  （304 过 + 1 红：sandbox-hardened ④「宿主 /tmp 哨兵」并发 flaky，单跑
  `pnpm vitest run tests/e2e/sandbox-hardened.test.ts` 9/9 绿，与 P6-02 记录的
  w1ap0-matrix 并发 flaky 同型；改动后全量该文件亦绿）。改动前后均 305。
- **git diff 范围**：`git diff main --name-only` =
  approval.yml、guard-plugin-manager.test.ts、evidence/P6-05/{probe.mjs,result.md}、
  本报告。产品 diff 中值级改动仅 persona prefix 一处（见交付 1）。
- **三方对照**：approval.yml 在 main 最近一次改动 = 01fea38（P5-22 合并），
  早于本分支基点；feat/P5-W3f1 不改 approval.yml（`git diff main...feat/P5-W3f1
  --name-only | grep approval.yml` = 0）→ 无合并窗口冲突。

## 未完成项 / 新问题

- 无阻塞项。两点提请派发者注意：
  1. drift 用例的豁免偏离「只改 approval.yml」字面（见交付 2 理由）；
  2. sandbox-hardened ④ 在全量并发下偶红（单跑恒绿，本任务两次全量一红一绿），
     属既有 flaky，未处理（不在本任务范围）。
- 行为面：默认链 standard 会话的系统提示自此含三段式段落——这是任务本身
  的预期行为变化；除此之外无行为变化（工具表、插件列表、审批链均未动，
  guard-plugin-manager / config / approval 等 e2e 全绿）。

待 verifier 验收。
