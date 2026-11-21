# T100：t73c-connector-grant.spec 主线红——二分找回归点、修根因（T73d e2e 的前置）

> 开单：manager (Opus 5.5) | 日期：2026-11-16 | 施工：main (GLM 5.3)
> 来源：queue.md:543 经理 2026-11-15 提议（未开单）+ 主 agent 2026-11-16 在 T73d worktree / 纯 main 源码复现「连接器卡弹出」挂（market.spec P-C② 同点挂）
> claimed：
> accepted：

## 已知事实（文件为据）
- **最后一次绿**：2026-11-12 T73c 合并 `6cfa1b58`（`done/T73c-approval-card-ui.md:80,91` 经理亲跑 1 passed）；同日 T75 合并回测含 t73c 2 passed（LOG.md:1318）。
- **首次记红**：2026-11-15 经理在 T91 worktree 与主仓各跑都红，症状 fake-llm `no scripted call #0`（`done/T91b-…md:44`，LOG.md:1347）。今天症状是「card not found」——可能是同一根因的下游表现，先别假设。
- T93 链验收**从未跑过 t73c**（只跑 grok-shim 单测与探针），「T93 链判过 t73c 9/9 绿」查无记录；之后 T81a/T91 回执写的 t73c passed 与经理复跑不符（T91b 已记一笔）。

## 要做
1. 二分：好 = `6cfa1b58`（或其后 T75 合并点），坏 = 当前 main；每步 build + `run-e2e.sh tests/e2e/t73c-connector-grant.spec.ts`（负载高时暂停）。产出第一个坏提交。
2. 按根因最小修（产品回归修产品；fake 脚本/夹具问题修 spec 与夹具——若是 spec 过时，按 T69 后真实市场形态改，不是放宽断言）。
3. 同根因若也解释 market.spec P-C②，一并绿。

## 边界
只动二分定位到的文件 + 两个 spec；不碰 T73d 改动面（M1 守卫 / 迁移 / 建 bot 连接器栏）。超出写存疑。

## 验收
1. 回执贴二分记录（每步 SHA + passed/failed）和第一个坏提交的 diff 要点。
2. 修后在 main 基线：`run-e2e.sh tests/e2e/t73c-connector-grant.spec.ts` 两连 passed；`market.spec` P-C② passed。
3. 修前形态同命令红（贴一次）。

## 为什么
t73c 是连接器授权卡唯一的端到端证明，T73d（安全单）的核心验收「新 bot / 旧 bot 调 mcp 都出 T73c 卡」就建在它上面。基线红时 T73d 的 e2e 什么也证明不了——不能记「基线已红」放行。
