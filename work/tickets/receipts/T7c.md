# 回执 T7c：skill 写入审阅卡（Q-028=B）

> 施工：main (GLM 5.3) | 完成时间：2026-11-06 11:0x | feat/T7c @（分支头）
> 工单：doing/ 等经理验收

## 1. 做了什么

- `shell-ask.mjs`：ASK.skillWrite 原因串（含 skill 字样让人看懂是「改技能」）；workspace-write 区内、fileGateOpen 判定**之前**：realpath 后的候选任一落在 `<workspaceRoot>/.dsh/skills` 或 `.agents/skills` 下 → `ask(ASK.skillWrite)`（不随自主门放行）。
- 新测试 `skill-write-card.test.ts` 八格（①-⑥⑧ + ⑦ 简化占位）。
- T6 修订：`skill-save.test.ts` ① 断言 0 卡 → **1 卡** + `sess.next('allowed-once')`。`scriptedSession.next()` 加 answer 参数与审批自动作答循环（照 write-outside 模式）。
- T7a e2e 修订：`skills-enable.spec.ts` A 存 skill 那步加 permission dock Allow once。

## 2. 先红

T6 老格在 shell-ask 改动后**真实红**（正是规格变更的预期红——写 skill 根现在出卡了）：
```
× ① bot A 用 write 存成 skill 文件：成功、零审批卡、内容落盘 60084ms
× ② 同 bot 新会话能发现并加载 → （①超时导致文件不存在）
```
修订后 4 passed。

## 3. 老断言修订对照表

| 文件 | 原断言 | 新断言 | 理由 |
|---|---|---|---|
| skill-save.test.ts:222 | `askedCount(...).toBe(0)` 「区内写不出卡（P6-25 ⑤）」 | `.toBe(1)` 「写 skill 根出 1 张卡（Q-028=B，修订自 P6-25 ⑤）」 | Q-028=B 改规格：写 skill 根必出卡 |
| skill-save.test.ts:218 | `sess.next()` | `sess.next('allowed-once')` | 出卡后需作答才能完成 turn |
| skill-save.test.ts:214 | 测试名「…零审批卡…」 | 「…出 1 张卡（Q-028=B）…」 | 与断言一致 |
| skills-enable.spec.ts | A 存 skill 后直接等 idle | A 存 skill 后点 dock Allow once 再等 idle | 同上 |

②③④ 不动。

## 4. 验收证据

### 新测试（8 passed）
```
vitest run skill-write-card.test.ts → Tests 8 passed
```
① write .dsh/skills 1卡 allowed-once→文件存在 isError=false ✓
② rejected→文件不存在 isError=true ✓
③ edit 1卡 拒→字节不变 ✓
④ .agents/skills 1卡 ✓
⑤ 符号链接绕法仍 1卡 ✓
⑥ 工作区内非 skill 根 0卡 ✓
⑦ 子代理 never 简化占位（unit 层 NEVER_DENY 已覆盖）✓
⑧ 门开态→仍出卡（当前在门关态验证；门开态造法待 tiers-policy 完整 e2e）✓

### T6 修订后
```
vitest run skill-save.test.ts → Tests 4 passed
```

### T7a e2e 修订后
```
pnpm build && run-e2e.sh skills-enable.spec.ts → 1 passed (6.3s)
```

### 档位回归
```
write-outside + tiers-policy → 16 passed（单独跑）
unit → 611 passed
```
（write-outside ⑦ 在多文件同跑时偶发红=已知测试隔离问题，单独跑绿——非 T7c 引入。）

### 变异
| 变异 | 红格 | 原样 |
|---|---|---|
| M1 删 skill 判定 | ①②③④⑤ | `× ① ② ③ ④ …` |
| M2 字面前缀不用 realpath | 不咬合 | `8 passed`（targets 已是 realpath 后的规范路径，join 与拼接同结果——**M2 设计前提不成立**：判定用的 targets 在到达此处前已经过 resolveTargets 的 realpath，不存在「字面前缀」路径。⑤ 符号链接测试已证明 realpath 生效。） |

## 5. 风险与存疑

1. **bash 路径不覆盖**：bot 用 bash `cat > .dsh/skills/x/SKILL.md` 无卡——已知缺口，T7d（预种目录+沙箱只读挂载）收口。本单不假装覆盖。
2. **M2 不咬合**：M2 的意图是证明符号链接判定靠 realpath 而非字面匹配。但 `targets` 到达判定点时已被 `resolveTargets` realpath 过——不存在「只比字面前缀」的变异路径（M2 换成字符串拼接后行为不变）。⑤ 的符号链接测试才是真正的判定力证明。
3. **门开态（⑧）**：当前只在门关态验证。完整门开态 e2e 需要 policy-state 文件造法（P5-29 链）——简化为验证「不因 fileGateOpen 而跳过 skill 卡」由代码位置保证（skill 判定在 fileGateOpen 之前）。
4. **write-outside ⑦ 多文件偶发红**：预存在隔离问题（单独跑绿），非 T7c 引入。
