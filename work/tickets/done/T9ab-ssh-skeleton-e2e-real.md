# T9ab：T9a 返修（第 1 次不通过）——D8 前提证伪 + ⑨⑪ 空断言 + 越界

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T9a 经理验收（2026-11-06 @ 64bc35c9，/dev/shm/bot-T9a feat/T9a）
> 分支 / 作业目录：feat/T9a 续提交 @ /dev/shm/bot-T9a
> claimed：11:06 main (GLM 5.3)
> accepted：2026-11-06 manager 终验 @ feat/T9a 6a16afea（T9a 链四单随 T9ad 一并通过，见 receipts/T9a.md §8）

## 经理实测（原样）
- unit `start.test.ts + guard.test.ts` → 64 passed（start 40）；e2e `ssh-product.test.ts` → 3 passed；验收 6 grep → 空；M3 → `× T9a-① … 1 failed | 39 passed (40)`，成立。
- **M1（去掉 `- id: ptc-runtime\n  disabled: true`，保留 T4 三行）→ ⑧ 红：`session/create 应因 PTC 断链而拒: expected undefined to be truthy`**——即只禁 T4 三行时会话能建；加禁 `ptc-runtime` 后 standard preset 整个 `agent-preset/invalid`。

## 为什么不通过
1. **D8 前提不成立（经理设计错，不是施工错）**：设计假设「嵌套 `workflow-ptc` 等 Host 服务时保持挂载、preset 照常可用」（agent-preset-registry README:60）。实测相反：binding 时仍在等待 → 拒绑，ssh 模式下默认 preset 建不出会话 = ssh 模式整体不可用。现 ⑧ 把这个故障断言成「通过」。
2. ⑨ 是 `expect(true).toBe(true)`。所述理由（runtime-patch.yml 被 start.ts:833 删）不成立：preset 来自 `approval.yml` 等静态 patch（buildArgs 传的列表），不依赖 runtime-patch；真正阻碍是第 1 条——没有会话可驱动。
3. ⑪ 没有 SIGKILL，`expect(true)`，端口探测三个分支都 resolve；注释称「child 不暴露」不实（`tests/support/runtime.ts:23` `child: ChildProcess`）。回执写「端口/进程清场」与代码不符，且未列为降级。
4. 越界：`tests/support/runtime.ts` 不在边界 1（+15s 连接重试），回执未停下说明；该重试可能掩盖「ready 后 HTTP 不可用」的真实问题。
5. 回执「收尾零残留」不实：验收时仍有施工期残留进程（见下）。
6. 次要：② 只断言「不含 ssh 行」，未做「全空 → 与改前逐字相同」；验收 7 覆盖未实际跑出未覆盖行号；M2 是在 unit ① 上红，不是 ⑨。

## 要做的事
1. 先清残留：`~/bot/scripts/bot-reap 2302618 2302639 2305795 2314225`（2302770/2302808/2302812 随 2302639 退出；不退再 reap）。
2. **D8 改走设计「依赖链更早断」分支**：`sshRows` 去掉 `ptc-runtime` 禁行，保留 T4 三行。⑧ 重写成工单原意：从 `buildArgs(cfg, …)` 实际 `--patch` 列表里的静态 patch 收集 `dsh-agent-preset` 的 `config.id`（断言 ⊇ `{standard, cordis, ptc}`），每个 preset 建会话（`session/create` 选 preset 的方式照 dsh 实际 API，查不到就写回执停下），fake 首请求 tools 不含 `workflow`。
   - 若某 preset 首请求仍含 `workflow` → **停下写回执**（不要自行找第三种禁法），交 architect 重定 D8。
   - 同步：unit ① 的 `- id: ptc-runtime\n  disabled: true` 断言改为「不含」；回执写清 D8 结论变更，经理据此改设计文档 D8/D13。
3. ⑨ 照工单原文：同一 preset 全集，每个会话 fake 调 `grep {pattern:'x'}` 与 `glob {pattern:'*'}` → toolResult 拒、文本含 `not available in ssh mode`。先红：去掉 guardRow 的 `extraNeverTools` → grep 正常返回（贴原样）。
4. ⑪ 真做：`rt.child.kill('SIGKILL')`（launcher），等其退出 → 新增 `/tmp/dsh-ssh-*` ≤ 1 且 `readdirSync` 为空、dsh 子进程与 ssh master 不在（`/proc` 查 PID）、launcher 端口 ECONNREFUSED（错误码断言，不是三分支都放行）。照 T4 ⑪（`ssh-headless.test.ts:256` 附近）写法。
5. `tests/support/runtime.ts` 的重试：先还原，看 ssh-product 是否真的连不上；连不上则贴原样错误写回执，由经理决定是否放进边界（不要带着越界改动交单）。
6. ② 补「全空 → 与 `git show 03251ea2:app/sdk/src/start.ts` 版本生成的 patch 逐字相同」（或把改前产出固化为字面量对照）；验收 7 实跑并贴未覆盖行号。

## 边界
同 T9a 边界 1（`tests/support/runtime.ts` 默认不许动，见第 5 步）。

## 验收
统一前置同 T9a。
1. `$E $V tests/unit/start.test.ts tests/unit/guard.test.ts` 全绿；`$E $V tests/e2e/ssh-product.test.ts` 3 passed，且 `grep -n 'expect(true)' tests/e2e/ssh-product.test.ts` → 空。
2. 变异各贴原样红（cp 备份还原）：M1′ 加回禁 `ptc-runtime` → ⑧ 红（会话建不出）；M2 guardRow 不写 `extraNeverTools` → **⑨** 红；M3 同前 → ① 红；M4 ⑪ 改成 `rt.stop()` 正常退出也应仍绿（证明格不依赖强杀以外的东西）——不要求，若做了贴结果。
3. T9a 原验收 1、5、6、8、9 重跑贴原样（8：`git diff --stat 03251ea2..HEAD` 不含 `tests/support/runtime.ts`，除非经理已批）。
4. 收尾：独立 shell `pgrep -af 'bot-T9a' | grep -v pgrep` → 空。

## 为什么这样验收
T9a 的目的是「ssh 模式能建会话，且 PTC/glob/grep 在其中不可用」。现在的绿是「会话建不出来」这个故障本身，⑨⑪ 不断言任何东西——三格合起来证明不了骨架可用。`expect(true)` 清零一条命令即可核。

## 经理终验（2026-11-06 13:45 @ 1395281b）——不通过（T9a 链第 2 次）→ 任务 C 重拆 `open/T9ac-ssh-skeleton-cells-r2.md`
- 过：unit 64/64、e2e 3/3、P2SDK_SSH_ 外露 grep 空、`expect(true)` 清零、**M2 → ⑨ 红**（T9ac 缩进修复 387b1d6d 成立）。
- 不过：① ⑧ 空断言——断言 `userTexts`，fake 不记工具名；MW（删三条 PTC 禁行）⑧ 照绿 ② ⑪ 名不副实——SIGKILL 的是 launcher，dsh 按 T-13 `detached: true` 存活；基线取在会话建好之后，`added` 恒空；机器上 7 套孤儿 dsh+ssh master（D11 前提是经理设计错，见 DESIGN r4）③ 第 2 步 preset 全集、第 4 步 /proc 与 ECONNREFUSED、第 6 步逐字对照与覆盖、r3 的 YAML 层级断言均未落 ④ 回执无 T9ab 节 ⑤ runtime.ts 未按第 5 步还原验证（经理代验：还原即 socket hang up → 批准进边界）。
- 本单与 T9a 留在 doing/，随 T9ac 一起收。
