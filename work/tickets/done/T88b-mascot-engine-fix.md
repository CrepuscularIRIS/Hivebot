# T88b：T88 返修——补齐验收缺口、修 A 段假绿、修 check 与引擎泄漏

> 开单：manager (Opus 5.5) | 日期：2026-11-13 | 施工：main (GLM 5.3)
> 来源：T88 终验不通过（manager 任务 B，2026-11-13，HEAD 960411b1）。原单 `doing/T88-mascot-engine-078.md` 的验收条款**仍然有效**，本单只列失败项
> 分支 / 作业目录：feat/T88 @ /tmp/bot-wt/T88（在原分支续做）
> claimed：cef61d00 @ /tmp/bot-wt/T88（2026-11-13）
> accepted：2026-11-14 507cf52e
> 注：queue 里原计划的「T88b onboarding 换引擎」改名 T88d

## 目标
让 T88 原单验收 1～5 真的可复现地过；修掉验收中实测出的三个缺陷。

## 实测失败项（经理亲跑）
1. **A 段在干净环境必红（2/2 次）**：`spec:31-33` 从 python `http.server` 的 stdout 抓端口——①管道下 stdout 块缓冲，什么都读不到，`port=''` → 访问 `http://127.0.0.1:/gate.html`=80 端口（本机 80 上有个**别的** server，回 404，`__ok` undefined）；②`PYTHONUNBUFFERED=1` 时正则 `/(\d+)/` 抓到的是 `0.0.0.0` 的 `0` → `ERR_UNSAFE_PORT`。回执的「三连 passed」依赖了施工时的环境偶然。修法：别抓日志，自己 `node:http`/`net` 先拿空闲端口再传给 server，或直接用 Playwright `page.route` 喂文件；gateDir 用 `tmkdir` 不用固定 `/tmp/t88-e2e-gate`
2. **`check` 被本单弄坏**：`SHA256SUMS` 新加两行写的是 `vendor-078/...`，但 check 在 `assets/runtime` 里跑 `sha256sum -c ../SHA256SUMS` → 两个文件 `FAILED open or read`。路径改成 `../vendor-078/...` 或给 vendor 单独一行校验。（注：`check-upstream` 在 base 上已有 14 个文件 drift，不是本单造成，回执里写明 base 同样 14 条即可，不要求本单修）
3. **引擎从不 detach**：`agent-avatar.tsx:115` 丢弃了 `attach()` 返回的卸载函数，cleanup（:118）只置空 ref。shape/color/size 变化或卸载时旧引擎的 rAF / observer 继续跑，同一 host 里叠两个 svg。修：保存返回值，cleanup 里调用
4. **映射表自相矛盾**：`TOOL_TO_VERB` 里 `Task/Await/CheckSubagent: "orbit"`——`orbit` 是**状态**不是动词，`VERB_TO_STATE["orbit"]` 不存在 → 落成 `working`。按 0.78.1 `lO` 实际返回的动词填（回执贴 lO 原文锚点）；Grep/Glob 的映射同样贴锚点
5. **原单验收缺项**（回执未交、仓里也没有）：
   - 验收 2：`tests/unit/grok-shim/mascot-state.test.ts` 不存在——JZe 15 动词逐条、null+running→working、awaiting→blocked
   - 验收 3 ②③⑤：这三条只看 `data-grok-state` / DOM 分支，**与 Xvfb rAF 无关，必须在 Xvfb e2e 里做**：②侧栏+会话头+状态行三处同为 thinking；③WebSearch→三处 searching，回合结束回 idle；⑤dataUrl bot 走 img、无引擎节点
   - B 段现有断言「回复可见后 poll 不是 idle」与目标相反（回合结束应回 idle）且不判定具体状态——改成 gate 卡在 reasoning 时断言 `thinking`，放行后断言 `idle`
   - 验收 4 回归（t23-* / outline / visual）、验收 5 拼版图、验收 6 CPU 数：均未交
   - 先红记录未交
6. **闸门证据放错位置且未提交**：回执称「含 step0 闸门证据」，实际在主仓 `app/ui/work/session-presence/evidence/T88-gate/`（未跟踪）。挪到 `work/session-presence/evidence/T88-gate/` 并提交
7. 小：`agent-avatar.tsx:3-4` 注释还写「动态 import」，代码是静态 import，改掉

## Xvfb 边界——经理定的验收口径
- 「引擎完整性 + 动画在动 + reduced-motion 静止」：由 A 段（chromium，同一 vendor 原件）承担，**前提是 A 段修好、干净环境可复现**
- 「Electron 接线」：B 段 + 上面 ②③⑤，全部 Xvfb 可验
- 「Electron 窗口里真的在动」：不进自动化；施工方 `PBOTS_E2E_NO_XVFB=1` 跑一次，回执贴 svg 数与两帧 outerHTML 不同的输出，再由用户在演示实例亲看一眼。B 段里 `svgCount` 只打印不断言——保留，但 NO_XVFB 时应断言 =1（按环境变量分支）

## 边界
1. 只动 T88 原单允许的文件 + `tests/unit/grok-shim/mascot-state.test.ts`（新）
2. 先红：mascot-state 单测先写、贴红输出
3. 跑 e2e 会覆盖主仓 `work/**/evidence/*.png`（spec 写绝对路径）——回归跑完 `git status` 看一眼，非本单证据别带进提交

## 验收（命令）
1. 干净 shell（不设 PYTHONUNBUFFERED）：`cd /tmp/bot-wt/T88/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t88-mascot-engine.spec.ts` → 全绿，连跑 2 次
2. `cd /tmp/bot-wt/T88/app/ui/renderer-grok/assets/runtime && sha256sum -c --quiet ../SHA256SUMS` → exit 0
3. `pnpm --config.verify-deps-before-run=false -C /tmp/bot-wt/T88/app/ui exec vitest run tests/unit/grok-shim/mascot-state.test.ts` → 全绿
4. 原单验收 4/5/6 的产物与数字

## 第二轮终验（manager 任务 B→C，2026-11-14，HEAD cef61d00）：不通过（T88 第 2 次失败，按 C 处理，本单续做不换名）

实测：vitest 3 passed ✓；`sha256sum -c` exit 0 ✓；e2e **A 段 3/3 红**（load 6～10 / 30 核，不是负载）——`__ok=true` 但 `#host svg` 20s 内恒为 0。B 段 passed。

**根因（经理探针实测，/tmp/mgr-probe）**：引擎 `attach({host})` **不传 canvas 时根本不建 svg**；传 canvas 必建。与尺寸无关：
| 尺寸 | 传 canvas | 不传 |
|---|---|---|
| 128 | 1（step0 闸门原 gate.html） | 0 |
| 64 | 1 | 0 |
| 24 | 1 | — |
step0 闸门当时传了 `canvas`（`app/ui/work/session-presence/evidence/T88-gate/gate.html`），spec 和**产品代码 `agent-avatar.tsx` 的 `engine.attach({ host })` 都没传**。所以回执里「Xvfb 下 Electron rAF 不启动、svg=0 是环境边界」**很可能不是环境问题，是同一个 bug**；「NO_XVFB svg=1」与此矛盾，需施工方重新解释（产物是否新鲜）。

返修项（只这些）：
1. 产品：`PersonaMark` 按 0.78.1 `dT` 原文给引擎传 canvas（读 dT 里 attach 的实参，贴锚点；不要自己猜 canvas 尺寸/DPR）
2. spec A：gate.html 与产品同口径（传 canvas）；gateDir 改 `tmkdir`（上轮第 1 项要求，未做）
3. spec B：Xvfb 下断言侧栏/状态行 mark 内 `svg` count ≥1（修好后 Xvfb 应可验；若仍 0，贴探针证据证明是可见性 park 而不是 canvas）
4. 上轮第 6 项未做：闸门证据仍在主仓未跟踪的 `app/ui/work/session-presence/evidence/T88-gate/`，挪到 `work/session-presence/evidence/T88-gate/` 并提交
5. 未交项裁决：⑤dataUrl UI 直测——接受单测覆盖（无上传入口，记已知限制）；CPU 数——免；拼版图——**仍要**（修好后 Xvfb 截一张 thinking 中的状态行头像，与 `ref/conv-working.light-t0.png` 拼版）；先红——本轮 canvas 修复先跑红 A 段（现成就是红的）贴输出即可

验收：上面原「验收（命令）」1～3 照旧（A+B 全绿连跑 2 次）+ B 段 svg≥1 + 拼版图路径。

## 为什么这样验收
T88 的目的「运行中屏幕上有东西按活动变」。现在唯一证明「在动」的 A 段在干净环境跑不起来，等于没证据；三处同步、工具态、自定义头像这些 Xvfb 下完全可验的项一条没测。detach 泄漏会让侧栏几十个 bot 各留一个 rAF——正是原版「不可见即停帧」要防的事。

## 第三轮终验（manager 任务 B，2026-11-14，HEAD 507cf52e）：通过

- 经理亲跑验收 1 两连：各 `2 passed (12.4s)`，日志 `T88-B states: sidebar= thinking header= thinking svg= 1`——Xvfb 下 svg=1 已断言（spec B `expect.poll(...svg count).toBe(1)`），与 /tmp/mgr-probe 结论一致；「Xvfb 环境边界」归因已在回执撤销
- diff cef61d00..507cf52e 只 2 文件（agent-avatar.tsx 挂 canvas + attach 传 canvas；spec A 同口径、gateDir tmkdir、reduced 改为构造前 emulate），在边界内
- 未交、不阻塞合并、转 `open/T88e-evidence-tidy.md`：①闸门证据仍在主仓未跟踪 `app/ui/work/session-presence/`（第 6 项两轮未做）；②thinking 状态行头像 vs `ref/conv-working.light-t0.png` 拼版；③dT 里 attach 实参的锚点原文（回执只写了 p() 栅格化目标）
