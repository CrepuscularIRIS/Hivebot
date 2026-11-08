# T7be 回执：waitProductReady 裸壳兜底竞态根修（2026-11-07 19:5x–20:1x）

提交：`01a5e63f`（20:15:25，集成分支）。改动恰边界两文件（ui.ts + 新 spec）；回执为第三件。

## 先红（旧 helper，原样输出）
```
$ env HOME=$T/home TMPDIR=$T/tmp DBUS=… PATH=本地bin … run-e2e.sh tests/e2e/wait-product-ready.spec.ts
  ✘ 1 wait-product-ready.spec.ts:9:5 (7.9s)
  Error: expect(locator).toHaveCount(expected) failed
  Locator: locator('.sand-onboarding')  Expected: 0  Received: 1
  > 19 |     await expect(page.locator('.sand-onboarding')).toHaveCount(0)
  ——旧 helper 下引导层残留（reloadRoster 关不掉已开的引导），先红钉死竞态
```

## 修后（新 helper）
- 新 spec 连跑 3 次：`1 passed (3.9s / 3.8s / 3.3s)`——引导已开也必被撤
- 验收 4：`skills-picker + t7b-shot + onboarding` → **9 passed (34.0s)**（onboarding 6 全过=onboardingFirst 不受影响）
- 验收 5：`git diff 起点..HEAD --stat` 恰 `tests/support/ui.ts` + `tests/e2e/wait-product-ready.spec.ts`
- 验收 6：提交后 `git status --short app/ui` 空

## 验收 3 的 flake 记录（如实，交经理裁定）
`grok-dead-entries + settings + market` 同批共 **11 轮**：D10c1 红 3 次（3/11 ≈27%）、其余 8 轮全绿（5 passed）。
- 红形态：`openBot(MAIN_TITLE)` strict mode violation——`.sand-agent-item[aria-label="New chat"]` resolved to **2 elements**（roster 双未命名 main）；单跑 D10c1 稳绿（探针：order=[main, C1-X] 正常 2 项）。
- 旧 helper 对照同批 1 轮 5 passed（样本不足，不能证明旧版无此 flake）。
- **机制候选（未定责）**：shell2（close→launch 同 home）启动窗口 SDK 持久层未加载完 → renderer doLoadRoster 读到空 roster + seen=1 → 补建第二个 main；随后 SDK 加载完 roster 变 3 行。这是**产品侧补建竞态**（shim doLoadRoster），T7be 边界禁改产品代码。
- 新 helper 关联假说：整页 reload 路径比 devCall reloadRoster 更改时序，使该窗口更易暴露（而非引入）。无低成本实验可定责——是否算 T7be 验收 3 通过、D10c1 竞态是否开新单（建议并入 T7bg 扫描轮一起看），请经理裁定。

## 改法摘要
- `ensureOnboardingSeen(page)`（ui.ts）：置 seen → 整页 reload → 等 __pbotsDev——launchProduct（原 :102-105 四行）与 waitProductReady 共用
- `waitProductReady`：seen 判定前先等 __pbotsDev（避免在应用加载前读到别的文档）；seen 未置走 ensureOnboardingSeen；末尾 `expect(.sand-onboarding).toHaveCount(0)` 哨兵；不再调 reloadRoster（reload 后 gate 自然建 main）
- `launchProduct`：原独立哨兵（:108）与 waitProductReady 内哨兵等价，删（grep 证无 `ready:false + !onboardingFirst` 调用方组合）
