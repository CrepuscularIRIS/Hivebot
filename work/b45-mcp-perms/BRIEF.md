# B45 · per-tool MCP 四档权限（数据面）

## 需求（用户 goal-07175bd3 首轮竖切）

MATRIX.md B5/D3：0.78.1 per-tool 四档 `auto_review|always_allow|needs_approval|blocked`（RE-TOOL-PERMS-1.1.0 §1，两版同构锚 _Ne/MYe）。我方 sdk 只有 per-tier kinds（allow/ask/sandbox-allow/workspace-read/workspace-write），MCP 工具一律 ask（shell-ask.mjs:36）。

## 本批范围（差距清单#1，数据面先行）

1. **mcp-permissions.json 存储**（<dataDir>/ 下，与 standing-grants.json 同目录同模式）：`{version:1, servers:{<serverId>:{tools:{<tool>:<四档>}}}}`
2. **createMcpPermissions() 纯函数**（p2sdk/ 新模块）：read/set/judge API；judge(serverId, tool) → 'auto_review'|'always_allow'|'needs_approval'|'blocked'|null（null=无记录走默认链）
3. **shell-ask.mjs mcp 分支接线**：judge 优先于现有 grants 门——blocked→deny（reason mcp-blocked）、always_allow→next() 直放、auto_review/needs_approval/null→现有 ask 链不変
4. start.ts config 注入 mcpPermissionsPath（同 standingGrantsPath 模式）

## 非目标（后续批）

- 桥端点 setMcpToolPermissions/listMcpServerTools（差距#2）
- 设置 UI 四档选择器（差距#3）
- reads/writes 三档豁免层（1.1.0 增量）
- 本地工具三档设置卡恢复（差距#6，P5-31 决策重开）

## 验收

- 单测：存取/judge 四档/blocked deny 路径/always 放行/损坏文件回退空（fail-closed）
- e2e：blocked 工具调用出 deny transcript 行（fake overlay 场景）

## 原版锚

RE-TOOL-PERMS-1.1.0 §1（Gx/MYe schema + 0.78.1 tb/_Ne 同构）。
