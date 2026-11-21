# REPORT · P6-02 冻结提示集 + p6-reply preset + D3 事件采集

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P6-02（基 98c433d），三 commit：ef89307 冻结提示集 / 797e38e p6-reply preset / 1a86006 采集器。9 文件 ⊆ 区域列（yml 新 + evidence/D3 + fixtures/prompts.md）；未动 approval.yml/start.ts/tests。

## 交付
①prompts.json（D3 10 条=5 multi+5 simple held-out + dev 3 条；全文唯一数据源在 json 防双写）②p6-reply-style.yml（insert preset order 22，plugins 逐 id 复制 22 个含三 cordis:group，plugin-manager/market 保持 disabled；persona=standard 前缀+三段式段落，来源 0.18 project-prompt.ts:110-119 + superagent replies.md:13-27，段落 sha256 c7c53c4e…356）③run.mjs 采集器（spawn start.mjs 真实 SDK；--check/--mock/real 10×3/--dev；llm/stream recorder overlay 只记元数据不记消息凭证；bash 审批经 $events 真实链路自动作答）

## 验收 ①-⑥ 全 PASS
冻结顺序（json commit 早于 yml）；--check 22/22；mock 干跑与 standard 工具表 30/30 一致无 plugin_manager；真模型冒烟 2 条（s5 恰一气泡；m3 实际 ack→bash→write→result 三段式，agentPreset=p6-reply）；无凭证无残留。sdk 全量 250 绿（w1ap0-matrix 首跑并发 flaky 单跑恒绿=H2 同型既有）。

## 偏差（verifier 裁点）
③字面不可行（测试自建 P2SDK_PATCH 无注入口）→ 等价实证同断言方法；区域按 PLAN 只读复用 start.mjs；temperature/topP null=dsh 不传采样的事实；.prevN 全记录机制实据。

## 后序输入
P6-04：node evidence/D3/run.mjs 即 30 回合，计分消费 raw/*.jsonl（reduce.ts 可归约）；P6-05：定稿段落=yml persona literal block 首空行后，sha256 校验。
