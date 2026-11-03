# P5-06 · W1-AP-0 合并验收矩阵 · 结论表（⑧）

- 运行：`pnpm -C app/sdk exec vitest run tests/e2e/w1ap0-matrix.test.ts tests/e2e/security/w1ap0-scan.test.ts`（分支 feat/P5-06，main@7e7f267 之后）→ 12/12 全绿；`pnpm -C app/sdk test` 全量另见 REPORT
- 测试 HOME：`.test-homes/p5-06`（矩阵）/ `.test-homes/p5-06-scan`（扫描），决策 8
- 差分（stock）定义：后置 overlay 同时摘掉三层 P5 防线 —— `sandbox` 行复原（无 runnerCommand → 上游缺省沙箱）、`p2sdk-fs-guard` 禁用、`p2sdk-shell-ask` 禁用。/tmp 下的 DSH_HOME 与 handoff 在 stock 侧仍被上游缺省沙箱 `--tmpfs /tmp` 遮住（既有防护命中，两侧同拦，P5-01 ② 同款注记）。
- 每格期望写死：文件工具 → deny（isError + `p2sdk-fs-guard` 原因）+ `approval/asked === 0`；bash → 不可见（`test -e/-s/-S` 退出码 1、cat 无内容）。唯二注记：ppp 文件根 cat 的 rc 跨启动漂移（P5-01.f2，断言不变量「无内容」）；`/proc` 在 bash 侧按设计可见（wrapper 不遮 procfs，敏感名由上游 scrubber 挡——② 的 P2SDK_LLM_API_KEY 格为证），guard 只把 /proc 列入文件工具硬根。
- 「四会话列相等」口径：子会话列与根会话跑**完全相同**的 77+3 个调用（同一生成函数）；根会话侧逐格 toolCallId→7 结果映射在 ①-file 证明，子会话列断言 77 个 guard deny + 每类哨兵路径点名（proc 类用 resolve 后的 `/proc/<dsh pid>/environ`）。bash 列在 never 子会话落 shell-ask 的 `approval unavailable in this session` 是 **P5-05 的设计行为**（guard 对普通 bash 无路径规则）；bash 类「guard 先行」的证明格在 P5-04 ⑤（dfa 组合会话）与本矩阵 ⑤（plugin_manager 在 never 子会话必须落 guard 字面串，顺序回归哨兵，实测全过）。

## 结论总表：514 格全 PASS（主格 399 + 差分 115），红格 0

| 验收项 | 格数 | 结果 |
|---|---|---|
| ① 入口×会话×凭证 · 根会话文件格（11 类 × 7 入口） | 77 主格 | PASS：逐格 deny + guard 原因 + asked 0，写类哨兵 sha256 不变 |
| ① 根会话 bash（cat 9 + 存在性 10 + find 1 + env 1） | 21 主格 | PASS：目录根 rc=1:empty、ppp 无内容（rc 漂移见 P5-01.f2）、find 0 命中、env 无哨兵值 |
| ① 子会话列 ×3（subagent/subagent_fork/workflow 各 77 文件 + 3 bash） | 240 主格 | PASS：77 guard deny/列、类别路径点名、bash 落 shell-ask（P5-05 设计）、0 出卡、无哨兵值 |
| ① stock 差分（根会话逐格 77 + bash 存在性 11 + find 1 + 子会话 bash/read ×3） | 115 差分 | PASS：读到哨兵内容 / 上游 fence 错（无 guard 前缀）；子会话 bash 真执行读到哨兵（P5-05 ④ 红基线等价）；dsh-home/handoff 为既有防护命中（两侧同拦，标注） |
| ② env 三哨兵 + /proc grep | 4 主 + 1 差分 | PASS：X_AUTH/X_CREDENTIALS 靠 launcher 白名单、P2SDK_LLM_API_KEY 靠上游 scrubber，均不入 bash env；grep `/proc/<runtime pid>/environ` deny，stock 能 grep 到 |
| ③ T-08 扫描 0 命中 + 正对照（security/w1ap0-scan.test.ts） | 2 用例 | PASS：全被 deny 的矩阵缩影跑完后 $DSH_HOME（.zstd 会话存储全帧）/ 日志 / 进程 cmdline 扫描 CLEAN（前提：.zstd 会话文件确实存在）；zstd 第 2 帧 + 明文植入 → 扫描器 FAIL 并只报路径+前缀 |
| ④ A4b loopback（LiteLLM/gateway/20000/stub） | 4 主 + 1 差分 | PASS：加固侧全 errno 111；stock stub 可连（差分命中） |
| ⑤ plugin_manager 三 action × 四会话 + profile 哈希 | 12 主格 | PASS：全部 guard 字面串（含三个 never 子会话——顺序回归哨兵未触发），asked 0，profiles 树与 runtime-patch.yml sha256 不变 |
| ⑥ 外发链（real provider + loopback LLM stub） | 1 主 + 1 差分 | PASS：read 哨兵 deny 后 stub 收到的全部请求体哨兵值 0 次（≥2 轮请求）；stock 差分请求体 ≥1 次 |
| ⑦ 数据根三格（a=HOME 内非点目录 / b=HOME 外 / c=未设缺省+WARN 恰 1 行）+ MASK 追加根 | 40 主 + 17 差分 | PASS：三格期望逐字相同——bash 三目标不可见、read/write/grep × 三目标全 deny、哨兵 sha 不变；stock 可见/读到/命中，cwd=数据根时同轮 read+write 落盘成功（guard 才是防线；上游 write 有 read-before-write 规则）；MASK 根同期望 |

## 会话列相等（PLAN ① 收尾断言）

根 / subagent / subagent_fork / workflow 四列：文件工具 77 格同判定签名（guard 前缀 + 路径点名）；bash 列根会话「执行但不可见」、子列「拒绝（P5-05）」，两态均无哨兵可达——子列更强。

## 发现（非红格）

1. **P5-01.f2（新开）**：文件根 `--ro-bind /dev/null` 的遮蔽效果跨启动漂移——`cat /etc/ppp/chap-secrets` 在不同 boot 间 rc=0（覆盖生效，读到空）/ rc=1（未生效，宿主文件 root:0600 → EACCES）。两种都无内容，但若 HOME 外凭证文件是全局可读，未生效侧即泄漏；需在 P5-01 区域定位（wrapper argv 顺序 / bwrap 挂载序）。复现：`tests/e2e/w1ap0-matrix.test.ts` ①-bash 的 ppp 格断言（正则 `[01]:empty`）+ 本文注记。
2. bash 侧 `/proc` 可见是设计边界（never-roots 只把 /proc 进 guard 的文件工具硬根；wrapper 不遮 procfs）：P2SDK_X_AUTH 这类不匹配上游 scrub 正则的 P2SDK_* 名可经 `cat /proc/self/environ` 看到——R5 已立约「P2SDK_* 不得装凭证」，② 的 KEY 族哨兵证明 scrubber 生效。未开 .f（设计内），建议知悉。
3. 无凭证路径缺口（§2 清单闭环零未关 .f）：11 类哨兵在四会话全部拒/不可见。
