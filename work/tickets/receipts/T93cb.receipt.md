# T93cb 回执：T93 链验收返修四点 + 第 5 格

> 安全单（T93 链）——等经理终验。施工在 worktree /tmp/bot-wt/T93 @ feat/T93，commit 730af624。

## 四点对照（经理验收意见 → 修复）

| # | 验收意见 | 修复（commit 730af624） | 验证 |
|---|---|---|---|
| ① | modelOf 读持久快照（非只内存） | data.ts 抽 `currentModel(id) = models.get(id) ?? views.get(id)?.model ?? null`；configOf 与 dev 口 rollBackLastTurn 的 modelOf 共用 | 单测第 5 格：models 空、view 快照有 → 仍对子 selectModel ✅ |
| ② | dev 口 roster 重拉走 loadRoster() | `void doLoadRoster().catch(()=>{})` → `void loadRoster().catch((e)=>log('[t93cb] ...'))`（单飞防双建主 bot，错误记日志不吞） | 代码审 + 360 回归 ✅ |
| ③ | 探针 selectModel 预置失败=无效对照 | T93-fork-facts.mjs：F2 预置 selectModel p2fake/p2fake 失败即 FACTS_ABORT exit 3（不打 FACTS_OK） | 探针 EXIT=0 FACTS_OK ✅ |
| ④ | 边界算法用 rollback.ts 导出函数 | rollback.ts 导出 `rollbackBoundary(records, lastUser)`（-1→0 兜底在内）；rollBackLastTurn 的 atSeq 改调它；探针 F1 段同源调用 | 探针输出 16 与产品一致 ✅ |

## 第 5 格单测（新增）

`tests/unit/grok-shim/t93-rollback.test.ts` 尾新 describe「T93cb dev 口：模型口径走快照回落（重启后 Edit 不回默认模型）」——rig=createShimData({authId,api,metaApi}) + stubGlobal window + 内存 store；`data.dev.testFollowItem` 灌快照帧 `{type:'snapshot', projections:{values:{modelSelection:{lastUsed:{provider:'p2fake',model:'big'}}}}}`；断言 dev.rollBackLastTurn 后 selectCalls 含 `{provider:'p2fake', model:'big', sessionId:'child-1'}`。

## 验证（原样命令与结果）

```
# workdir=app/ui（/tmp/bot-wt/T93）
$ pnpm vitest run tests/unit/grok-shim/t93-rollback.test.ts
Tests  14 passed (14)

$ pnpm vitest run tests/unit/grok-shim tests/unit/m1
Tests  360 passed (360)
```

## 坑（调试记录）

- 测试报 `rebind: rec is not defined` 排查两小时——根因是**测试代码自身**用了未定义的 `rec`（照抄 rollback.ts 内部习惯名），被 rebind catch 包装后误导向模块排查。独立探针（node 直调 rollback.ts / vitest 内直调 / createShimData 全链）逐层排除后锁定。
- python heredoc 写 TS 时 `src + "\\n" + addition` 写入字面量 `\n` 致 esbuild Syntax error "n"——必须用真换行拼接。
- reduce.ts modelOf 取 `pending ?? lastUsed` 嵌套——灌裸 `{provider,model}` 不生效；帧须 `type` 非 `kind`。

## 探针改造（work/tickets/evidence/T93-fork-facts.mjs）

- node 22 strip-types 直 import rollback.ts 源（rollbackBoundary/lastUserMessage）——探针与产品同源，不再复制算法。
- F2 预置 selectModel 失败即 abort；F1 段先打 rollbackBoundary（产品函数）结果 16。
- 终态 EXIT=0 FACTS_OK（输出 work/tickets/evidence/T93-fork-facts.out）。
