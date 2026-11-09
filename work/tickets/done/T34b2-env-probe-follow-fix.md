# T34b2：⑤ 环境泄漏探针跑通——修 follow 返回值用错

> 开单：manager (Opus 5.5) | 日期：2026-11-09 | 施工：main (GLM 5.3)
> 来源：`receipts/T34b.acceptance.md`（T34b 第 1 次不通过）
> 分支 / 作业目录：feat/T34b @ /tmp/bot-wt/T34b（在 ccf24084 上继续提交）
> claimed：2026-11-09 main (GLM 5.3) @ feat/T34b 续
> accepted：2026-11-09 feat/T34b @ 68e6ce96（经理任务 B，见 receipts/T34b2.acceptance.md）

## 目标
把 ⑤ 从 skip 变成真跑、真绿，并证明它在数据根泄漏时会红。

## 动手前先读
1. `receipts/T34b.acceptance.md`「⑤：真正卡点」
2. `app/sdk/examples/lib/client.mjs:42-58`：`follow(id, { awaitSnapshot: true })` 返回 `{ stream, snapshot }`
3. 同文件 `:60`、`:116` 的正确写法 `const { stream } = await rt.client.follow(...)`

## 边界
1. 只动 `app/sdk/tests/unit/orchestration-default-chain-live.test.ts` 与 `work/**`。
2. ⑤ 里改成取 `stream` 再迭代、再 cancel；`it.skip` 改回 `it`；删掉 skip 上面那段卡点注释。
3. ⑤ 里 follow 的那个 `.catch(() => {})` 不许再把异常吞掉——改成把错误存下来，超时报错时一起带出（这次就是被它藏了 60 秒）。
4. 先红（原单边界 2，必须做）：临时把 `src/start.ts` 里注入数据根那行改成 `P2SDK_PBOTS_DATA_DIR`（不提交），⑤ 应红（输出含数据根）；贴红尾，还原后 `git diff --stat src/` 为空。
5. 如果改完 follow 还是收不到 turn 事件，停下写回执，贴 follow 流前 10 帧原样，不许改测试对象、不许 skip。
6. 隔离 HOME / TMPDIR，DBus 指向不存在路径。

## 验收（app/sdk 下，`VR` = `pnpm --config.verify-deps-before-run=false exec vitest run`）
1. `VR tests/unit/orchestration-default-chain-live.test.ts --reporter=verbose` → `6 passed`，⑤ 在列（不是 ↓）。
2. 连跑 3 次都 6 passed（⑤ 依赖审批应答和时序，要证明不是偶尔绿）。
3. 回执贴边界 4 的先红输出 + 临时改动那一行 diff + 还原后 `git diff --stat src/` 为空。
4. `git diff ccf24084 --stat` 只有这一个测试文件。

## 为什么这样验收
⑤ 守的是 P5-01 决策 15：数据根不进模型能看到的环境。目前只有静态论证（上游擦 DSH_*）。「含 PATH=」防 bash 被拒或输出为空导致「不含」恒真；先红防探针是摆设；连跑 3 次防时序偶发。

## 产出
- 修改：`app/sdk/tests/unit/orchestration-default-chain-live.test.ts`
- 回执：`work/tickets/receipts/T34b2.receipt.md`
