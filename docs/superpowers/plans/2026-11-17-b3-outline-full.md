# 2026-11-17 · 批 3：A3 outline 全量化（聊天收尾）

## Goal

「Full conversation」侧板从「当前窗口」升级为「全量会话」——翻页加载的历史也进 outline（A3 P0 收尾，覆盖矩阵 111 行缺口：shim/outline.ts「部分」→「全」）。

## 规格锚

- work/grok-0.79.3-re/RE-FULL-0.79.3.md 题 1(e)（outline 行为）
- outline.ts:9-11 ponytail 注释（升级路径：复用 view.items 的 hasMore 游标翻页）
- 上游行为：0.79.3 outline 显示全部历史（非仅当前窗口）

## Architecture

- 数据流：transcriptWindow（data.ts）翻页取回 records → olderItemsOf → **并进 view.items**（按 id 去重前插）→ push.outline(id) 推全量 outline
- 上游 transcript 显示不受影响（本来就按 id 合并显示旧页）
- outline.ts toOutlineItems 不变（读 view.items 自然全量）

## Global Constraints

- 同批 2：--no-ff 合并、e2e 前 build、隔离 HOME、每批合并后定向回测记 LOG
- 不动 view 的 firstSeq/hasMore 语义（那是分页游标，与 items 累积正交）

## 任务

### B3.1 view.items 累积 + outline 推送

Files: app/ui/renderer-grok/shim/src/data.ts, tests/unit/grok-shim/b3-outline-full.test.ts（新）
- transcriptWindow 取页成功后：olderItems 去重前插进 view.items；outline?.(id) 推送
- 单测：①翻页后 getConversationOutline 含旧页条目 ②同页重取不重复 ③live 条目不受旧页插入影响
- e2e：翻页后 outline 面板条目数 > 窗口内条目数（复用 #11 分页 rig——session.spec ④同款）
- commit: feat(b3.1): outline 全量化

## Review Focus

1. id 去重边界（旧页与 live 窗口重叠区）→ 单测②
2. firstSeq 语义漂移（前插是否动 view.firstSeq——不动，它只由 snapshot 定）
3. 翻页失败不污染 view（api 失败 throw 前不并）→ 单测④（新增）
4. outline 推送时机（push.outline 与 pushTranscript 同刻）→ 代码走读
5. e2e 假绿（outline 面板未开就断言）→ 先开面板再翻页再断言
