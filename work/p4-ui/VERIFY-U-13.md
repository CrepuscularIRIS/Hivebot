verdict: PASS
commit: 853f37566a79d5f91cffb35d90f0319e6bf9d787（2f87ef7 + 853f375，验收期间 HEAD 无漂移）

## 复跑（干净状态，worktree /tmp/bot-wt/U-13，verifier 亲跑）

| 命令（cd app/ui；HOME=PBOTS_DATA_DIR=/tmp/bot-p4-vfy-u13） | 结果 |
|---|---|
| `pnpm test` | 9 files / **67 passed**（Duration 1.10s） |
| `pnpm exec playwright test` | **9 passed**（8.4s，shell/origin-gate 全套） |
| `pnpm build` | 绿（main/preload/renderer 三段产物） |

## 验收项（PLAN U-13 行 ①–⑦ + D7/D8/D10 子项）

| 验收项 | 结果 | 证据（命令/文件/复现路径） |
|---|---|---|
| ① 原子写 + 单一队列，50 并发无丢更新（D10e） | PASS | `tests/unit/m3/store.test.ts`（30 recipe + 20 patch 并发全落盘、队列序 s-19、tmp 无残留、坏 JSON/version!=1 不静默重置）；突变 1（队列退化并行）verifier 亲验 → 2 红：`evidence/U-13/mutation-1-queue-red.txt` |
| ② renderer 只写 mainBotId；v1 盘上无 bots 字段（D10d） | PASS | `tests/unit/m3/index.test.ts` patch 形状 5 条 each（op 未知/缺 mainBotId/非 string/多余字段/非对象）→ invalid-args 且 dsh 计数 0；mainBotId 须在 #9 列表；`store.test.ts` 盘上形状恰 {version,mainBotId,recipes}；deriveBots runtime 恒 'dsh' |
| ③ defaultId 贯穿：省略与显式同 id 同值（D8 非[T-16]） | PASS | `orchestrate.test.ts`「省略与显式 defaultId 两次得同一 id」：两次 create 后盘上恰一条 recipe、两次 dsh 请求载荷同为 agentPreset:'p2-alpha'、缺省解析只调一次未过滤 #1；#1 失败 → pbots/unavailable 不写 recipe |
| ④ 孤儿不删共享 recipe（D7/D10b） | PASS | `orchestrate.test.ts`：#4 被调时 recipe 已在盘（mock 内同步读盘断言）、#4 挂起时 recipe 已落盘、#4 !ok 孤儿留盘；`restore.test.ts`「ensure 失败不删被两个 session 共用的 recipe」文件字节前后不变；突变 2（recipe 后写）亲验 → 3 红：`mutation-2-order-red.txt` |
| ⑤ D10a 并发同 id + Duplicate 文案 grep | PASS（带裁定 a） | `orchestrate.test.ts` 并发两次同 id：两次 #4 都成功、recipe 恰一条；`grep -rn "Duplicate agent preset" app/` 唯一命中 `app/sdk/tests/unit/p2temp.proc.mjs:65`——测试替身（文件头注明 Mirrors the real registry packages/preset/agent-preset-registry src/index.ts:97-136，T-18 引入于 50e8ac4，早于 U-13）；生产代码（app/ui/main/、app/sdk/src/）零命中 |
| ⑥ live = 未过滤 #1 含该 id，不写盘（C:92） | PASS | `index.test.ts`：registry 无此 id → live===false、get 前后 bots.json 字节相同；restore 标记的 failed set 并入 live 计算；#1 失败 → pbots/unavailable 不静默全 false |
| ⑦ PBOTS_TEST_GATE_4 屏障（env 门控） | PASS | `orchestrate.test.ts` 3 条：未设 env waitGate 不触发（注入即抛证明路径未达）、设 env 停在「recipe 已落盘 + #4 已返回 + 调用方未收到返回」touch 后放行、默认 waitGate 真实 fs 轮询文件出现；突变 3（屏障不看 env）亲验 → 4 红：`mutation-3-gate-env-red.txt` |

坏路径（每任务至少一条）：gate 文件永不出现（忘 touch）→ `defaultGate4Wait` 短超时兜底 resolve（fail-open 放行，不挂死不 reject），探针 1 passed 后即删：`evidence/U-13/badpath-gate-timeout.txt`。另 store 坏 JSON / version 2 路径已有单测覆盖。

## 突变验证复核

builder 的 3 组突变输出**未落盘**（worktree 无突变 commit，`work/p4-ui/evidence/` 当时只有 U-11）。verifier 亲做同 3 组突变，全部红、`git checkout` 还原后 m3 套件 **44/44 复绿**、worktree 干净（`git status` 空确认）：
1. 队列退化（enqueue 并行直跑）→ 2 红（50 并发丢更新、队列序）
2. 编排顺序对调（recipe 挪到 #4 后）→ 3 红（D10b 三条）
3. 屏障不看 env → 4 红（含「未设 env 不触发」直接红）

## 三处裁量裁定（派发步骤 4）

| # | 裁定 | 事实基础（verifier 核实） |
|---|---|---|
| a | **测试替身豁免成立**：D10a 文案判据适用于生产代码（src/），`app/sdk/tests/unit/p2temp.proc.mjs:65` 豁免，记 REVIEW-ALLOWLIST | 该文件是 SDK 单测的 mock registry（复刻上游 throw 文案供 in-flight 单飞测试断言），非生产判重；生产代码 grep 零命中 |
| b | **追认 preload 一行修正** | `work/p3-contract/CONTRACT.md:24` 明文 `invoke({op:'get'})`/`invoke({op:'patch',mainBotId})`；U-00 版（22f806f）发裸载荷（'get' 字符串、patch 无 op 包装），U-13 handler 收到字符串会 invalid-args——不修则 M3 全链路不通。一行最小改动，属 U-00 接缝 bug 修复。建议 LOG 记一行追认 |
| c | **tsc 基线缺失记档不阻塞** | `node_modules/@types/` 不存在，`tsc --noEmit` 报 TS2688（Cannot find type definition file for 'node'），package.json 无 typecheck script——U-00 遗留。建议开 U-00.f 或并入后续任务补 @types/node + typecheck script |

## 区域检查（派发步骤 5）

新文件全部在 U-13 区域 `app/ui/{main/m3-meta/, tests/unit/m3/}` 内：`main/m3-meta/{store,orchestrate,restore,preset-id.ts,preset-id.d.ts}`（index.ts 为 U-00 空注册上扩展）+ 4 个测试文件。区域外仅两处接缝，均为最小：
- `main/index.ts` 2 行：`registerM3Meta()` → `registerM3Meta({dsh, dataDir: env.PBOTS_DATA_DIR ?? app.getPath('userData')})`、`m3(req)` → `m3.handler(req)`——注入依赖的必要接线；
- `preload/index.ts` 1 行：裁定 b。

无其他越界（`git diff 22f806f..853f375 --stat` 全量核对）。注意：restore.ts 已内建 U-14 的 restoreRecipes 语义，但 **ready.ts 闸门未接**——属 U-14 范围，未开始，不算缺口。

新问题（每条一行，可直接成为修复任务）：
- [FIX] preload M3 载荷形状（{op:'get'} 包装）无任何测试覆盖，真通道回归只能等 U-23 ⑥ E2E | 复现：grep app/ui/tests 无 preload M3 载荷断言 | 疑似位置：app/ui/tests/e2e/（U-23 ⑥ 时补） | 严重度 LOW
- [FIX] builder 侧突变验证输出未落盘 evidence/（本验收已由 verifier 亲验替代，不阻塞本次） | 复现：查 work/p4-ui/evidence/U-13 builder 产物为空 | 疑似位置：流程（builder 派发词补「突变红输出 tee 到 evidence/」） | 严重度 LOW
