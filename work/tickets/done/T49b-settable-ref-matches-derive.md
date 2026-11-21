# T49b：T49 返修——credentials 可写引用名与 mutate 派生规则同源（Sol M1）

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`review/T49-T49a.sol-review.md` M1（经理核实成立，见该文末）
> 分支 / 作业目录：feat/T49 @ /tmp/bot-wt/T49（在原分支上追加提交）
> claimed：2026-11-11 @ 9d13a770（返修完：Sol 脚本全转通过；launcher 回归在跑）
> accepted：2026-11-11 feat/T49 @ 9d13a770（manager 任务 B；deriveKeyRef 两守卫共用，route 字母开头与 DSH client.js:1664-1672 ROUTE_PATTERN 注释一致）

## 目标
凡是 `settings/mutate` 允许写进 profile 的 `apiKeyEnv`，`credentials/set|unset` 都必须能写；反之不多放。

## 问题（经理核实，`app/ui/main/m1-api/index.ts`）
- `SETTABLE_REF_RE = /^(P2SDK_LLM_API_KEY|[A-Z][A-Z0-9]*_API_KEY)$/` 不许中间下划线；mutate 的派生 `route.toUpperCase().replace(/[^A-Z0-9]+/g,'_') + '_API_KEY'` 对 `my-route` / `my_route` 得 `MY_ROUTE_API_KEY` → 存得进路由、存不进 key。
- 同类边角（经理补）：route 正则 `^[a-z0-9][a-z0-9_-]{0,63}$` 允许数字开头，`1abc` 派生 `1ABC_API_KEY`，`REF_NAME_RE`（`^[A-Z]…`）与 SETTABLE 都拒。

## 修法
1. 派生函数抽成一个（`deriveKeyRef(route)`），mutate 守卫与 set/unset 守卫共用；set/unset 判定改为「`P2SDK_LLM_API_KEY`，或形如 `^[A-Z][A-Z0-9_]*_API_KEY$` 且不以 `DSH_` 开头」。
2. route 正则改字母开头 `^[a-z][a-z0-9_-]{0,63}$`（派生名必然过 REF_NAME_RE；DSH Models 页新建路由名若允许数字开头，回执写明锚点再定，别猜）。
3. 不放宽别的：DSH_* 照拒；`GITHUB_TOKEN` 等不以 `_API_KEY` 结尾的照拒。

## 边界
只动 `app/ui/main/m1-api/index.ts`、`app/ui/tests/unit/m1/api.test.ts`（加格，不删不弱化）。先写失败测试看红。

## 验收
1. 新格：`my-route`、`my_route`、`a-b-c` 三个 route——mutate 成功后同一派生名 `credentials/set` 不被 forbidden（桩计数 1）；`1abc` route 的 mutate → forbidden；`DSH_X_API_KEY` set → forbidden。再加一格性质测试：对一组 route 样本，`deriveKeyRef(route)` 必过 set 守卫。
2. `cd /tmp/bot-wt/T49/app/ui && pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/m1` → 全绿（原 81 格 + 新格）。
3. Sol 复现脚本 `/tmp/t49-sol-review-probe.mjs` 的 M1 段转为通过，回执贴原样输出。

## 为什么这样验收
守卫两处各写一条规则，迟早再分叉；同源函数 + 性质测试让「能存路由就能存 key」成为结构保证。
