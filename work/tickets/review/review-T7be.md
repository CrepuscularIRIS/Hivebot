# T7be Sol 审查代录（2026-11-07 20:22，主会话机械代录）

范围：01a5e63f；纯静态阅读，未改文件、未跑构建/e2e。
总评：高 0、中 1（静态确认，未实测）；撤除已开引导的修法合理，但「删除独立哨兵等价」的依据不成立，D10c1 尚不能定责。

## CONFIRMED
- 中｜ui.ts:110-112：独立哨兵删除并不等价。ready:false 时既不执行 waitProductReady，也不再检查引导计零，削弱已有验收保护；应保留 !onboardingFirst 路径的独立哨兵。
- 同条证据：提交内确有 resilience.spec.ts:16 和 theme-flash.spec.ts:172 两个 ready:false、未设 onboardingFirst 的调用；后者随后自行调用 helper，前者没有。回执 T7be.md:31 的 grep 结论错误。

## REFUTED
- 「onboardingFirst:true 被强制跳过引导」：ui.ts:110 明确绕过 ensureOnboardingSeen；onboarding.spec 六处均带 ready:false。
- 「吞错后引导残留也能直接绿」：ui.ts:94-95 仍要求侧栏首行可见、引导节点为零。
- 「新 spec 等引导出现是无意义脆弱性」：spec:17 是工单明确要求的竞态前置条件。

## UNKNOWN
- 超时吞错：ui.ts:77-80 确会在等待超时后继续写 storage、reload；:88-93 也会吞 reload 失败。建议让同步失败直接抛出，保留根因。
- D10c1：data.ts:338-365 支持「成功但缺失 main 的 roster 导致补建」，不证明 SDK 启动曾返回空列表；另一候选在 shell1（__pbotsDev 在 index.ts:73-74 start 前发布，旧文档 seen 写入后建 main+紧接 reload；data.ts:331-335 单飞只覆盖单文档）。运行证据缺。
- 回执真实性：计数内部一致（9=2+1+6、每批5=1+2+2、11=3+8）、先红行对应新 spec:19；但回执只有节选无逐轮日志；验收 3 未达工单要求全绿。

## 施工修复（同轮）
- 哨兵恢复（CONFIRMED 中1）→ 提交见 receipts/T7be.md「review 修复」节；grep 结论更正；D10c1 候选补充。
