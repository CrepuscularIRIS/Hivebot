# REPORT · P5-12.f1（GU-P5-12 清单第 1 条）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-12f1 @ 2472126（基 main bd05fab），worktree /tmp/bot-wt/P5-12f1。改动：Conversation.tsx、visual-session.spec.ts。

## 根因
live「思考中」行渲染在 items 数组之外（key=live-thinking），定稿行在数组内（key=item.id）——React key 只在同子数组内匹配，统一 key 也不够，定稿时节点卸载重挂（展开复位/焦点丢/正文跳）。live 期拿不到 turn/step（start 帧不带），无法直接用定稿 id。

## 修法
live 行并入同一 keyed 数组；两态 key 都取「前一条 timeline item 的 id」（定稿 thinking item 恰追加在 live 期最后一条之后 → key 相同 → React 复用同一节点）。不改 store 不加状态。已知上限（代码有 ponytail: 注释）：「加载更早」后窗口首条恰为 thinking 行时会收起一次（消除需按 id 存展开态）。

## TDD
新 e2e ⑤（第三问带 reasoning，pace 1500）：live 期 focus+Enter 展开+节点打标，定稿后断言同节点/aria-expanded/activeElement/detail 全文/标签「思考」。修前 sameNode/expanded/focused 全 false；修后 spec 2/2。

## 自验
build ✓；vitest 243/243；e2e（Xvfb）58 passed/2 failed：A1（已立案接缝归 P5-15.f1，本基线早于其合并）+ d1-real-model 真 LiteLLM 超时（单跑过，环境波动）；hairline ✘ 为 test.fail 预期失败。TS2688 环境问题与改动无关。
