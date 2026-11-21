# T7bec 回执：settle 参数化（GU-1 必现超时修）（2026-11-07 22:3x）

提交：cdab3a4d（ui.ts settle 参数化+launchProduct 传 ready+spec 注释 ×5→×10 一行）；起点 87e517c0。

## 验收 1–5 原样输出
```
1 改前 resilience.spec.ts：
  ✘ 1 [GU-1] pbots:api 全路径注入抛错：roster 重试循环活着、页面不崩 (32.2s)
  Error: expect(received).toBe(expected) // Object.is equality   1 failed
  ——与经理 evidence/T7beb/final/acc4.log 同形态（ui.ts:89 轮询超时）
2 改后 resilience+theme-flash+onboarding 连跑 2 次：16 passed (1.9m) / 16 passed (1.9m)
  GU-1 单跑时长抽验：✓ [GU-1] … (3.1s) —— <15s 门槛过（不再白等 30s；GU-2 的 32.9s 是它自身的重连等待，与本单无关）
3 wait-product-ready 连跑 2 次：2 passed (33.0s) / 2 passed (31.9s)
4 三 spec 批 1 轮：5 passed (1.9m)
5 git status --short app/ui → 空；git diff 87e517c0..HEAD --stat -- app/：
  ui.ts（+18-9…实为 settle 参数化）+ wait-product-ready.spec.ts（注释一行）恰两文件
```

## 改法
- `ensureOnboardingSeen(page, settle = true)`：settle=false 时跳过 expect.poll 落定段（写 seen/reload/等 __pbotsDev 照旧；settle=true 超时照抛不吞）
- `launchProduct`：`ensureOnboardingSeen(shell.page, ready)`——ready:false（GU-1 注入 api 抛错、roster 故意起不来）不再等主 bot
- `waitProductReady` 内调用不变（默认 settle=true——裸壳路径 D10c1 防护保留）
- 施工侧自纠记录：首轮参数化写成「poll 第四参 undefined」错误形态，当场废弃重写为 if(settle) 包裹（未提交）

## 证据沿用说明
ready:true 与裸壳路径 settle 行为不变——T7beb 终验的 wpr 100 home + 10 轮批 0 红证据直接沿用；本单验收 3/4 为冒烟确认（2/2 与 5 passed）。
