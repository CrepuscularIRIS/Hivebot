# REPORT · P5-H4 fake/ 临时目录清理

基点：b41121d（feat/P5-H4 @ /tmp/bot-wt/P5-H4，worktree 全程干净）
结论：**停止条件第 1 条触发（需动 fake/ 以外文件才能达成验收口径），fake/ 内无活可干——P5-H4 行描述的泄漏点已被 P5-H1 的 merge 顺手修复**。无代码改动、无 commit。

## 1. 事实链

### 1.1 fake/ 白名单内已无未登记的 mkdtemp
`tests/support/fake/` 共 3 文件，逐一核查：
- `harness.ts`：仅两处建 /tmp 目录（overlayEnv 的 `p2sdk-fake-patch-`、createSession 的 `p2sdk-work-`），均已是 `tmkdir`。文献证据：merge commit 783960c（H1，已在本基点历史内）diff 恰为
  `mkdtempSync(join(tmpdir(),'p2sdk-fake-patch-'))` → `tmkdir('p2sdk-fake-patch-')`（两处）。
- `plugin.mjs`：只 append/read `$DSH_HOME` 下文件（requests.jsonl、scripts/*.json、gates/*），不建 /tmp 目录。
- `relay.mjs`：纯 WebSocket 中继，无 fs 目录操作。

派发要求的 RED（「fake 目录用后残留计数 >0，在未修代码上真实失败」）**写不出来**：私有 TMPDIR 定向跑 harness 链测试，跑完非缓存残留 = 0（§2 命令 1）。

### 1.2 泄漏真实存在，但全部在白名单外
- 名为 `fakeOverlay`/`buildFakeOverlay` 的函数实为**各 e2e 测试文件里的本地副本**（sandbox-hardened.test.ts:49 注释自述「approval.test.ts buildFakeOverlay 同款」），共 10 处定义：approval:50、process-tiers:49、guard-escalation:63、sandbox-hardened:49、write-outside:64、interrupt:62、market:107、connector-restart:105、security:125、request-network:107，全部裸调 `mkdtempSync`，前缀 `p5-01-patch-`、`p2sdk-t07-patch-`、`p5-02-patch-` 等。
- 实测对照：interrupt.test.ts 跑完残留 `p5-27-patch-*` ×2（§2 命令 2）。
- /tmp 历史积压（2026-11-05 实数，均为此前运行累积）：p2sdk-work- 3268、p5-01-patch- 2443、p2sdk-fake-patch- 1014、p2sdk-t07-patch- 862。前两名的源头（harness.ts 两处）已停泄（1.1）；p5-01-patch-/p2sdk-t07-patch- 系 e2e 副本仍在泄（H5 范围）。

### 1.3 验收口径「全量后 /tmp/p2sdk-* 零新增」需要 wrap 的散点全在 fake/ 之外
带 `p2sdk-` 前缀的未 wrap 调用（部分清单）：approval.test.ts:51/78、connector-restart.test.ts:106/175/176/177、preset-broken.test.ts:31、subagent-policy.test.ts:166/169、config.test.ts:91 等——这正是 PLAN **P5-H5** 的白名单（`app/sdk/tests/e2e/*.test.ts 散点 mkdtempSync`，H5 描述「约 60 处」与实测吻合）。本任务白名单仅 `app/sdk/tests/support/fake/`，触碰上述任一文件即触发停止条件，故停。

## 2. 复测命令（全部真实执行，退出码见行尾）

```bash
# 1. harness 链定向（fake/ 唯一 /tmp 生产者）
cd /tmp/bot-wt/P5-H4/app/sdk
TMPDIR=/tmp/bot-h4-tmp/red-stream ./node_modules/.bin/vitest run tests/e2e/stream.test.ts
# → EXIT=0，1 file / 4 tests passed；ls 非缓存残留 = 0
# 2. e2e 本地副本链对照（泄漏存在性证明）
TMPDIR=/tmp/bot-h4-tmp/red-local ./node_modules/.bin/vitest run tests/e2e/interrupt.test.ts
# → EXIT=0，2 passed；残留 p5-27-patch-4POnpK、p5-27-patch-qV8W2J
# 3. 全量（私有 TMPDIR；maxWorkers=2：同机 P5-H3 builder 并行全量 + GPU 训练 load ~8）
TMPDIR=/tmp/bot-h4-tmp/full ./node_modules/.bin/vitest run --maxWorkers=2
# → 见 §3
```

## 3. 全量结果

命令：`TMPDIR=/tmp/bot-h4-tmp/full ./node_modules/.bin/vitest run --maxWorkers=2`（后台 1685.64s，期间同机 P5-H3 builder 也在跑另一份全量 + GPU 训练 load ~8）

- **Test Files 2 failed | 55 passed (57)；Tests 2 failed | 703 passed | 10 skipped (715)；EXIT=1**
- 失败明细（均为基点代码、本任务零改动，与 fake/ 无关——fake/ 全程零改动零残留）：
  - `tests/e2e/w1ap0-matrix.test.ts` ①（:718）与 ⑦（:1113）双双 `Test timed out in 600000ms`。复跑（H3 全量已结束、机器空闲后）① 仍 600s 超时（§3.1）——非单次抖动。
  - `tests/e2e/guard-fs.test.ts` 套件级 `Error: socket hang up`；单独复跑 1 failed | 8 passed（1011.92s，EXIT=1，§3.1）。
  - 关联线索：guard-fs / sandbox-hardened 系属 P5-H3 行所述「TEST_HOME 硬编码 .test-homes/p5-0X 并行互踩」文件族；本次全量恰与 H3 builder 的全量同机并行（两份全量都触这些共享路径），失败与 H3 正在修的问题同族。H1 VERIFY（11-04，无并行 builder）时全量绿。
- tmp-sweep 四条性质单测（tests/unit/tmp-sweep.test.ts）在 55 个 passed 文件内（绿）。
- **终态非缓存残留 235 个**（直方图摘要）：p2sdk-handoff ×34（w1ap0-matrix 超时用例 teardown 不完全 + examples/min-client.mjs 子进程建目录登记不可见，即 VERIFY-P5-H1 新问题 2）、p5-01-patch ×14、u25-home ×11、bot-p612-unit ×11、p2sdk-t08-* 系、p2sdk-t07-patch ×5、p2sdk-p505-* ×6、p2sdk-d4-patch/t15/t18/t20/t06/t03/t09/p521/main/slow/patch 等约 60 处散点——**全部位于 fake/ 之外**（tests/e2e/*.test.ts、examples/min-client.mjs、tests/unit 散点）。
- **fake/ 白名单内的判定**：
  - `p2sdk-fake-patch-`（harness.ts overlayEnv）终态残留 **0**；
  - `p2sdk-work-` 残留 3，但该前缀在 fake/ 外还有两个裸调生产者（`tests/e2e/mock-demo.test.ts:52`、`examples/min-client.mjs:28`），残留归于后者（harness.ts 的 tmkdir 调用在定向测试中已证零残留，且同文件的 p2sdk-fake-patch- 零残留证明登记簿工作正常）。
- 结论：**fake/ 路径在全量下同样零泄漏**；验收口径「全量后 /tmp/p2sdk-* 零新增」未达成，但达成所需全部改动（约 60 处散点 wrap + min-client 子进程登记 + w1ap0-matrix 超时用例 teardown）均在本任务白名单之外，恰为 P5-H5 的范围（其白名单含 examples/min-client.mjs）。

### 3.1 失败复跑（P5-H3 的全量结束后、机器空闲，仍失败）

```bash
# ① 复跑（-t 过滤）：
TMPDIR=/tmp/bot-h4-tmp/retry ./node_modules/.bin/vitest run tests/e2e/guard-fs.test.ts tests/e2e/w1ap0-matrix.test.ts -t "① stock"
# → Test Files 1 failed | 1 skipped (2)；Tests 1 failed | 18 skipped；Duration 609.18s——① 仍 600s 超时
# guard-fs 单独复跑（不带 -t）：
TMPDIR=/tmp/bot-h4-tmp/retry2 ./node_modules/.bin/vitest run tests/e2e/guard-fs.test.ts
# → Test Files 1 failed (1)；Tests 1 failed | 8 passed (9)；Duration 1011.92s；EXIT=1
# retry/retry2 终态残留：p5-06-patch×2、p5-06-pm×2 / p5-02-patch×3、p5-02-stock×1——全部为该测试文件自己的散点前缀，无 fake 前缀
```

复跑仍红 + 残留全为 w1ap0-matrix/guard-fs 自身散点 → 这两个失败是 fake/ 之外的现存问题（疑似与 P5-H3 的 TEST_HOME 并行互踩同族），交主会话归口，不在本任务范围。

## 4. 给主会话的建议

1. **P5-H4 按无 op 关闭**（建议标 `superseded-by-H1`）：行描述的「fakeOverlay mkdtemp 不清理」在 fake/ 内的源头已被 H1 修复；H4 立项时主会话可依据的是 H1 验收前的快照。
2. 验收口径「全量后 /tmp/p2sdk-* 零新增」整体落在 **P5-H5**（todo）：机械 wrap e2e 散点即达成；H5 白名单无需扩（p2sdk- 前缀散点全在 `tests/e2e/*.test.ts`）。
3. 新事实（不影响本任务）：unit 侧 `orchestration-report-live.test.ts` 等已自觉用 tmkdir（bot-p612-* 系中途快照有残留、文件结束即清，机制正常）。
