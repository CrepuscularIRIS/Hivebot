# T100b：e2e 宿主键 ELECTRON_RUN_AS_NODE 剥离 + 过时 Enter 断言修正 + 产物新鲜度守卫

> 开单：main (GLM 5.3，代偿路 A-1：纯机械修复类直接开单) | 日期：2026-11-17 | 施工：main (GLM 5.3)
> 来源：work/resume-c-polish/BRIEF.md（稳定基线①②）；T100（同类过时 spec 清理）
> 分支 / 作业目录：docs/rebuild-p6-p5-plan 集成分支（小改动直接提交）
> claimed：2026-11-17 06:02、起点 4572efd5（工作区）
> accepted：（待验收）

## 目标
恢复 DSH 会话内跑 e2e 的能力（宿主注入 ELECTRON_RUN_AS_NODE=1 使被测 Electron 以纯 node 模式启动，全线 "Process failed to launch!"），并完成 T100 审计出的唯一过时 Enter 断言修正与 t90b 假绿加固。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. app/ui/tests/support/sdk-env.ts、launch.ts；tests/e2e/session.spec.ts:105-107；t90b-composer-suggest.spec.ts ④段

## 根因（先证据后修复）
- 会话 env 带 `ELECTRON_RUN_AS_NODE=1`（DSH 宿主自身跑在 Electron 里注入）：`env | grep -i electron` 实测。electron 二进制正常（`electron --version` → v24.21.0）。
- 最小复现：`ELECTRON_RUN_AS_NODE=1` 时 `require('electron')` 返回路径字符串、`app` undefined（纯 node 模式，开不了窗）；`env -u ELECTRON_RUN_AS_NODE` 同脚本 READY_OK。
- 因此 playwright `_electron.launch` 全部 "Process failed to launch!"（session.spec 4/4 挂、t90b 挂）。昨天 e2e 绿是在无此变量的终端跑的，与 06:54 的 build 无关。

## 边界
1. 只动：app/ui/tests/support/sdk-env.ts（HOST_ONLY_ENV_KEYS + 两处 delete）、tests/unit/support/sdk-env.test.ts（新用例）、tests/e2e/session.spec.ts:107（Enter→ControlOrMeta+Enter）、tests/e2e/t90b-composer-suggest.spec.ts ④段（补 2 断言）。别的不碰。
2. 先写失败测试：sdk-env.test.ts 新用例先跑（修复前 ELECTRON_RUN_AS_NODE='1' 断言红）。
3. 测试走隔离 HOME / TMPDIR，DBus 死总线（run-e2e.sh 默认）。
4. 凭证不进代码、文档和日志。
5. 直接提交集成分支（纯机械修复类，代偿路 A-1）；Sol 审在批审时一并做。
6. **范围追加（2026-11-17，Sol 审⑥后补记）**：本单并稳定基线③ run-e2e.sh 产物新鲜度守卫（cf09ac16）；并 Sol 审返修四条（t90b/t90c 断言真锚、single-instance.spec 走 shellChildEnv、哈希/文件名更正）——同链交付，不再拆单。

## 验收（写命令，不写感觉）
1. `pnpm -C app/ui vitest run tests/unit/support/sdk-env.test.ts` → 5 passed
2. `pnpm -C app/ui test:e2e tests/e2e/session.spec.ts` → 4 passed
3. `pnpm -C app/ui test:e2e tests/e2e/t90b-composer-suggest.spec.ts` → 1 passed
4. `pnpm -C app/ui test:e2e tests/e2e/t90c-panel-style.spec.ts tests/e2e/t94-send-key.spec.ts tests/e2e/bots-search.spec.ts` → 全 passed（相邻防回归）

## 为什么这样验收
e2e 是所有 UI 单的验收通道——通道本身被宿主环境变量废掉，一切后续单都没法跑。单测锁语义（宿主键不继承、worker env 不动），e2e 证链路恢复，相邻 spec 证修改无外溢。

## 产出
- app/ui/tests/support/sdk-env.ts：HOST_ONLY_ENV_KEYS=['ELECTRON_RUN_AS_NODE']，sdkChildEnv 剥副本（launchShell/sdk-runtime 双路径受益）
- app/ui/tests/unit/support/sdk-env.test.ts：新 describe（宿主键用例，保存/恢复 worker env）
- app/ui/tests/e2e/session.spec.ts:107：ControlOrMeta+Enter（T94 后纯 Enter=换行）
- app/ui/tests/e2e/t90b-composer-suggest.spec.ts：④段 Enter 后补面板 hidden + editor 含文本两断言（对齐 t90c 真④）
- app/ui/scripts/run-e2e.sh：产物新鲜度守卫（源比 out/main/index.js 新 → exit 78；SKIP 逃生门）——稳定基线③并单交付（cf09ac16）
