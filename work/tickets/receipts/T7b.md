# 回执 T7b：bot 设置 Skills 段 +「Pick from your skills」对话框

> 施工：main (GLM 5.3) | 完成时间：10:23（实测）| feat/T7b @（见分支头）
> 工单：留在 doing/ 等经理验收

## 1. 参照图（第 1 步）

**走了止损降级**（工允许）：R3 桩渲不了 Context 对话框——入口只在 0.78.1 的 team 设置面（`chunk-team-bot-context-dialog` 由 team-surface lazy 载入），R3 已渲染面（侧栏/会话）里无触发点。降级产物：`work/p9-dsh-integration/ref/skills-ref-notes.md`（六文案键→en 串、sand-* 类名布局骨架、容器差异口径——原版弹窗 vs 我们 pane 内嵌=已知差异）。**标「未验证」**。经理验收时按该笔记对照我们四张截图（`ref/skills-{added,pick}.{light,dark}.png`，ours 侧原样归档在 ref/ 供并排）。

## 2. 实现

- `shim/src/bots.ts`：`PbotsUi.skills(req)` 接口 + `SkillsApiResult/SkillsReq` 类型。
- `shim/src/data.ts`：实现=透传 `window.pbots.skills`（preload 桥缺失时 `{ok:false,pbots/unavailable}`）。
- `overrides/modules/skills-dialog.tsx`：
  - `SkillsSection`（agent-settings 里 Main bot 段后追加）：Added skills 列表（名字+描述+Remove）+「Pick from your skills」按钮（离线禁用）。
  - `SkillsDialog`：候选（名字+**来源 bot 显示名**+描述）+勾选+Add；逐个 enable；`pbots/limit`→"this Bot already has 250 skills"、`pbots/too-large`→"exceeds 256,000 characters"、其他→原 message；成功后 `onChanged` 刷新列表。`-2` 后缀名照实显示（enable 回值 name）。
- `agent-settings.tsx`：追加 `<SkillsSection id online/>`。
- 文案对齐：标题/按钮用原版键 76J7mZ/IYyHwi/ggmjet 对应的 en 串；上限提示措辞按 WnW32b 语义。

## 3. 先红

首跑（UI 已建但 pane 打开方式不对的中间态）：
```
TimeoutError: locator.waitFor: Timeout 30000ms exceeded — [data-pane-config] not visible
```
修正打开路径（settings.spec:76 的「View agent settings」按钮）后，真功能性红在来源名断言（对话框缺 fromBotId→显示名解析）：
```
Expected substring: "T7b-A" — Received: "t7b-flowT7b ref flow"
```
修（`data-skill-from` 显示 `agentName(fromBotId)`）后 2 passed。

## 4. 验收证据

### 4.2 e2e（2 passed）
```
✓ Skills 段：Added 空 → Pick 勾选 Add → 磁盘副本字节等于源 → 移除双清 (3.2s)
✓ 250 上限：Add 显示可读提示、磁盘无新增 (3.2s)
```
全链磁盘断言：副本存在且**字节等于源**→Remove→B 副本删+**A 原件在**；250 格 `[data-skills-notice]` 含 "250"、`skillsB/t7b-flow` 不存在。

### 4.3 截图（4 张，ours 原样）
`test-output/T7b/skills-{added,pick}.{light,dark}.png` → 归档 `work/p9-dsh-integration/ref/`。**compare 拼版未做**（ref 侧为降级笔记而非渲染图，拼 ours|ref 无像素可对——对照按笔记逐项：标题「Skills」对 IYyHwi 域、按钮「Pick from your skills」=76J7mZ 原文、上限措辞按 WnW32b。容器差异：弹窗 vs pane 段，已记）。逐张结论：四张 ours 截图与笔记要点**文字级对齐**（标题/按钮/来源名/描述/Remove/Add 可见），布局细节（sand 原子类间距）**未对齐**（我们用 pb-pane 行样式，pane 容器差异已知）——**标未验证**。

### 4.4 定向回测
```
settings.spec.ts + grok-dead-entries.spec.ts → 3 passed (1.4m)
```
### 4.1 上游未动
```
renderer-grok pnpm check → upstream diff=0: 332 files
```
### 4.5 变异 M1
enable 调用替换为恒 ok 假对象（不调 main）：
```
✘ 1 … Error: B 的磁盘副本存在（toBe(true) 收到 false——磁盘断言红）
✘ 2 … 250 格红（notice 不出现）
还原后 2 passed
```

### 4.6/4.7 收尾与改动面
`pgrep -af 'bot-T7b'` → 空（本轮无残留）；R3 未起 chrome/server（止损未启用）。改动面=边界清单文件 + t7b-shot.spec.ts（截图 spec，与工单「e2e 里截」合并实现）。

## 5. 风险与存疑

1. **参照降级**：像素级对照本轮没有（R3 染不出入口）；T16 升级 rc.1 后若 team 面可达，可补 R3 渲染重做 compare——列入 queue 提议。
2. `-2` 后缀显示：enable 回 `{name}` 带 -2 时对话框关闭后列表按最终名显示（实测路径未构造撞名场景——T7a unit ④已锁该行为，UI 侧只透传）。
3. 并发：两个 pane 同时对同一 bot enable 同名——T7a 的 rename 撞名并发分支兜底（staging+rename EEXIST→-N）。
