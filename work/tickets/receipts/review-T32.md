# T32 经理终验（2026-11-07，feat/T32 @ 42be0b33）

结论：**不通过 → T32b**（`open/T32b-choreo-assert-fix.md`）。

## 经理重跑与查看
- `renderer-grok pnpm check` → `upstream diff=0: 332 files`（亲跑）
- 没有重跑 e2e 和 unit：不通过的结论来自读代码，与 e2e 是否绿无关（断言本身是空的）。T32b 验收时一并重跑。
- 改动范围：`33f0ccce..HEAD` 改了 3 个覆盖层文件、onboarding.spec 和新增的 shot-t32.spec，外加 work/。上游零改动 ✓

## 施工随修（cast 覆盖语义）的裁定：不认可
- 0.79.3 的 cast 容器是 pointer-events:none（@13822）；角色只有在 `opacity>0 && isGazing` 时才接收指针（@11376 `sand-67bb7w`）。三页上没有 gazing 角色，所以角色**不挡点击**。我们的 `view.css:20` 写死了 auto，隐形 hero 挡在卡片中心，用户点那个位置会落空。真因在 CSS，不在断言该怎么写。
- 「role 侧 visCheck 仍咬」不成立：豁免写在 visCheck 本体里。
- 744→624 是没有依据的偏差（施工自己也说改了照样盖），退回 744。

## 逐条
| 项 | 结论 |
|---|---|
| M1 JSX `//` 幽灵行 → `{/* */}` | 成立且已修。`<SceneCast/> {/*…*/}` 之间留了一个空格文本节点，但在 grid 容器里纯空白文本不生成格子，不影响 ✓ |
| M2 geo 回视口基准 + section 满视口 | 成立且已修 ✓ |
| castOk overlap | **写死成 false**（spec:141），恒过 → T32b F1 |
| ⑩a / ⑩b | 回执称已做，spec 里没有 → T32b F3 |
| connect geo/castOk、meet→demo 退场、退场层归 0、侧栏 meet 页、character-state、cast 标记 meet→connect、:81 旧注释 | 缺 → T32b F4 |
| 回执存疑 3（state 在容器上） | 不成立，`view.tsx:96` 中属性在角色 div 自身 |
| shot-t32.spec.ts 在白名单外 | 有条件追认：改成仓内相对路径 → T32b F6 |
| 截图 12 张 | 拍在 M1 修复前，作废，T32b 重拍 |
