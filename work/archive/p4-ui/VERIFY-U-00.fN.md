verdict: PASS
commit: 07d88d6ad54be0be96af2aeeff5d9712137c266a（= 5c6af7a 删依赖装 markdown + 07d88d6 loadURL 修复；worktree /tmp/bot-wt/U-00.fN，clean tree）

验收日期 2026-11-02 15:20–15:32（全部命令本机实测，时间戳取自 evidence 文件内 `date`）。
无 UI 截图：本任务不改 renderer 外观（markdown 已装未接，改动全在 main 进程与依赖清单），按派发口径不适用截图项。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 复跑：install + build 绿 | PASS | `pnpm install` Done in 303ms（首跑 5.1s）+ `pnpm build` ✓ built in 417ms（30 modules，renderer 247.79 kB）→ `evidence/U-00.fN/01-install-build.txt` |
| 复跑：单测 185/185 | PASS（带基线注记） | `pnpm test` → Test Files 20 passed (20)、Tests 185 passed (185)、Errors 1 error → `evidence/U-00.fN/02-unit.txt`。该 error 为 wire.test 的 unhandled rejection（`deps.dsh.ready is not a function`，m2-mux/index.ts:222）：`git diff --stat f40847f..07d88d6 -- wire.test.ts m2-mux/index.ts` 为空（两文件未被本任务触碰）+ detach 5c6af7a 基线复现同一 error → **f40847f 基线固有属实**，非本任务引入；缺点是使 `pnpm test` 退出码非零，归属 U-21（e55ad0d 在途修测试桩） |
| 复跑：e2e 22/22 | PASS | `pnpm test:e2e` → 22 passed (1.2m)，含新增 load-abort 用例 → `evidence/U-00.fN/03-e2e.txt`（附 HEAD 单跑 load-abort e2e 1 passed 7.0s、单测 3 passed） |
| ① 零引用核实 | PASS | grep `@deepseek-ai\|deepseek-harness`（ts/tsx/mjs/json/yaml/html，排除 node_modules/lock）命中 10 行：9 行为注释「来源:」标注；唯一非注释代码引用 `tests/unit/m3/ensure.test.ts:29` 经 `createRequire(…sdk/node_modules/@deepseek-ai/dsh-plugin-market/…)` 锚定 **sdk 侧** node_modules（R0 §1：sdk 侧第 1/2 级不动），与 builder 声明一致 → `evidence/U-00.fN/06-zero-refs-and-deps.txt` |
| ① .gitmodules/gitlink 删除干净 | PASS | `.gitmodules` 文件不存在（仓根与 app/ui 均无）；`git ls-files -s | grep -c ^160000` = 0（无 gitlink）；`app/ui/vendor/` 目录不存在；worktree `git submodule status` 无条目 → evidence 06 |
| ① 29 条 link 删 + markdown 装入 | PASS | `git show 5c6af7a^:app/ui/package.json | grep -c link:./vendor` = 29；5c6af7a 删除 `@deepseek-ai` 条数 = 29；package.json/pnpm-lock.yaml 现存 `link:` = 0；devDependencies 新增 `react-markdown ^10.1.0`、`rehype-highlight ^7.0.2`，lock 解析条目 react-markdown@10.1.0 / rehype-highlight@7.0.2 均在 → evidence 06 |
| ② loadURL ERR_ABORTED 红绿 | PASS | **红**：`git worktree add --detach /tmp/bot-wt/U-00.fN-red 5c6af7a`（修复父提交），仅拷入新用例 → `Target page, context or browser has been closed`，1 failed（进程 exit(1) 与 PAB-final §4 现象一致）→ `evidence/U-00.fN/04-red-baseline.txt`。**绿**：HEAD 07d88d6 同用例 1 passed (7.0s)，断言进程存活、单窗、停在 `pbots-app://app/index.html`（不重载）→ evidence 03。修复实现核对：`isTolerableLoadError` 只认 promise reject 的字符串 `'ERR_ABORTED'`（数字 -3 与其他 code 均不容忍），`.catch` 后非容忍错误 rethrow 保持 `app.exit(1)` 路径，与上游 dsh main.ts:506-512 口径一致（main/index.ts:54-62,185-189） |
| ②（附加坏路径）非 ERR_ABORTED 仍退出 | PASS | 临时用例（验收产物，跑后即删）：`PBOTS_APP_URL=http://127.0.0.1:9/`（连接拒绝）→ 进程 **exit(1) 在 540ms 内**，未挂死未容忍 → `evidence/U-00.fN/05-badpath.txt` |
| ③ markdown 已装未接 | PASS（记档） | 渲染产物 `out/renderer/assets/*.js` 中 react-markdown/rehype 引用计数 = 0（未接入，符合「只装不接」）→ evidence 06。**scout 出入记档**见下 |
| 遗留③ U-00 ⑥ submodule SHA 断言位置 | 已核实记档 | **无可执行 verify 脚本含该断言**：`scripts/` 仅 bot-reap，app/ui 无 verify-\*，全仓 grep `rev-parse` 无脚本/测试命中。断言仅存于两处文档：`work/p4-ui/PLAN.md` U-00 行 ⑥ 验收文本（`git -C app/ui/vendor/deepseek-harness rev-parse HEAD === ce7073d…`）与 `work/p4-ui/SPIKE.md` §6 bootstrap 命令块——两者随 vendor/ 删除均已不可执行。PLAN §6-4 修订账（line 61）已记「submodule 与 29 条 link 依赖在 U-00.fN 删除」。核减动作 = 主会话在 PLAN U-00 行 ⑥ 与 SPIKE §6 标「已作废（U-00.fN）」，无代码改动 |
| 区域白名单 | PASS | 两 commit `--stat` 恰好只动：`.gitmodules`（删）、`app/ui/package.json`、`app/ui/pnpm-lock.yaml`、gitlink（删）、`app/ui/main/index.ts`、两个新测试文件，无越界 |

## ③ scout 出入记档（U-22 落实依据）

对照 `work/p4-ui/reuse/markdown-rendering.md`（C3 反向确认，2026-11-02）：

1. `react-markdown@10.1.0`：scout 决策「集成」（第 1 级，维护内：commit 2026-10-03，周下载约 5300 万）——与装入一致，无出入。
2. `rehype-highlight@7.0.2`：scout 决策「**可用，但不选**」——超出 6 个月维护门槛（release 2025-02-03 / 最后 commit 2025-02-21），且本地已有活跃 Shiki 路径。**本任务先装它是任务指示的过渡态**（builder commit 已注明 scout 在途、结论矛盾再调），未接无运行时影响；U-22 接入时按 scout 换掉。
3. **追加发现（scout 结论本身需随本任务更新）**：scout 推荐高亮路径「复用已有 dsh `useCodeHighlighter`（Shiki）」的前提是「U-21 的 package.json:45 已链接 `@deepseek-ai/dsh-client-ui-primitives`」——该 link 依赖已被本任务（R0 §2-3）删除，U-22 **不能**再走「复用已链接包」。替代：`shiki@4.6.0` npm 第 1 级（scout 表：维护活跃 2026-11-02、`shiki/core`+`engine/javascript` 合计约 62.7 KiB gzip，勿用 `bundle-web` 方便入口），或从 `repos/deepseek-harness`（MANIFEST 已登记的只读参考）复制高亮适配层第 3 级并注来源。主会话派 U-22 时附本条。

新问题（每条一行，可直接成为修复任务）：
- [FIX] pnpm-workspace.yaml 注释仍描述「link: 指向 vendor/deepseek-harness 的 bootstrap」机制（已删，误导后来者）| 复现：`cat app/ui/pnpm-workspace.yaml` 第 6-9 行 | 疑似位置：app/ui/pnpm-workspace.yaml（不在本任务白名单故未动）| 严重度 LOW
- [FIX] 主仓本地 `.git/config` 残留 `submodule.app/ui/vendor/deepseek-harness.{url,active}` 段 | 复现：`git config --get-regexp '^submodule\.'` | 疑似位置：~/bot/.git/config（本机元数据，非 git 历史；清理 `git config --remove-section submodule.app/ui/vendor/deepseek-harness`）| 严重度 LOW
- [FIX] wire.test.ts unhandled rejection（桩缺 `dsh.ready`）使 `pnpm test` 退出码非零 | 复现：`pnpm -C app/ui test`（185 过但 ELIFECYCLE failed）| 疑似位置：app/ui/tests/unit/shell/wire.test.ts 假 dsh 桩 | 严重度 LOW（f40847f 基线固有已实证，U-21 e55ad0d 在途修，勿重复派）
- [FIX] rehype-highlight@7.0.2 与 scout「不选」结论相悖，且 scout 的 Shiki 复用前提已失效 | 复现：对照 reuse/markdown-rendering.md 决策表 + 本报告 ③ 记档第 3 条 | 疑似位置：app/ui/package.json devDependencies | 严重度 LOW（已装未接；并入 U-22 选型调整，不单开任务）
