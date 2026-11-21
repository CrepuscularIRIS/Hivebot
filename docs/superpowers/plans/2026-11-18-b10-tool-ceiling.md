# B10 · per-tool 权限档位（1.1.0 新面：LocalToolPermissionCeiling）

## Goal
工具级三档 ceiling（always/ask/never）+持久化+设置面。1.1.0 语义：ceiling 恒定档位决定审批卡是否出现（always 跳过、never 直拒、ask 出卡）；主线现状：内存态不落盘（data.ts:24 注释）。

## Architecture
- 存储：localStorage 键 `pbots-tool-ceiling`（Record<toolName, 'always'|'never'>——缺省=ask）。
- shim/src/data.ts：
  - 读档 readCeiling(toolName)；
  - approval/request 入列点（onEventsItem :570）前置判定：never→立即自动拒（$events/result rejected，不发卡）；always→立即自动过（allowed-once 语义），都不进 asks；
  - resolvePermission 审批卡上勾 always 时写档（connectorAlways 同点）；
  - ui 面加 toolCeiling(): Record（设置面读）+ setToolCeiling(tool, level)（写档+清内存 connectorAlways）。
- overrides/modules/agent-settings.tsx：ToolsSection——列档位表（工具名+三档 segmented）+改档即写。
- 命名对齐 1.1.0：LocalToolPermissionCeiling 枚举 ask/always/never（RE 实证 main-app.cjs）。

## Tasks
### B10.1 shim 档位+自动判定
- [ ] readCeiling/writeCeiling helper（localStorage JSON，读失败 {}）
- [ ] approval/request 前置判定（never 自动拒/always 自动过）
- [ ] resolvePermission always 勾选落档
- [ ] ui 面 toolCeiling/setToolCeiling
- [ ] 单测：档位读/写/前置判定（b10-tool-ceiling.test.ts）
### B10.2 设置面 ToolsSection
- [ ] agent-settings.tsx ToolsSection（列表+segmented 改档）
- [ ] e2e：审批卡勾 always→下次同工具调用不再出卡（自动过）→设置面改回 ask→再调用出卡
### B10.3 合并回测
- [ ] merge --no-ff + build + t73c/session 回归 + LOG

## Review Focus
1. never 自动拒不能误伤（toolName 精确匹配非前缀）。
2. 档位读写失败降级 ask（不 crash）。
3. e2e 假绿：自动过的验证必须断言「无新卡」而非「卡消失」（时序区分）。
4. connectorAlways 内存态与档位档的一致性（勾 always 后两处同步）。
5. 设置面空列表（无工具历史）不渲染空壳。
