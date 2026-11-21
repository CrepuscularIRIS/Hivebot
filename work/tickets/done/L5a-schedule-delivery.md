# L5-a：定时投递 e2e（BRIEF 验收③）

> claimed：12:31 main (GLM 5.3)
> accepted：12:33 main — 1 passed（after_seconds=60 → 定时到达 → userTexts 含标记）

## 验收
- `schedule_create({title, prompt, after_seconds: 60})` → 60 秒后投递到本会话
- fake 驱动两轮（初始调度 + 定时到达回复）
- userTexts 含 `L5A_FOLLOWUP_DELIVERED` 断言通过
- 安装版 API：不用 rrule/target（参考仓源码与安装版 schema 不同）
