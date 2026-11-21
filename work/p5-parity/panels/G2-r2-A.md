# G2-r2 · 席 A（Opus 5.5）· p5-parity PLAN v2（终轮）

```
seat: A
verdict: REVISE
confidence: high
findings:
- [HIGH] PLAN:77 P5-04 ④ × PLAN:78 P5-05 ② — 两条任务对同一场景断言了不同的拒绝原因，P5-04 合入时 P5-05 的用例必红，而且这个文件不在 P5-04 的区域里 — 证据: P5-05 ② 规定在 `DSH_PERMISSION_MODE=danger-full-access` 下，普通 bash 的「tool/result 带上述原因」，即 shell-ask 的 'approval unavailable in this session'；P5-04 ② ④ 让 guard 对「会话有效模式 = danger-full-access」的 bash 直接 deny，原因是「该部署模式不受支持」。guard 排在 shell-ask 之前（决策 2），shell-ask 根本轮不到执行。P5-05 是 ready，属于首批；P5-04 要排在 P5-03 后面，必然后合。§2「合并」规定两个包全量绿才算合并完成，而 P5-04 的区域（PLAN:77）不含 `approval.test.ts`，builder 要么越区改测试，要么卡住 — 建议: 一行修。P5-05 ② 的原因断言改成枚举集 {shell-ask 原因, guard 模式原因}；或者把 `approval.test.ts:398-433` 加进 P5-04 的区域，在 P5-04 里把原因改成 guard 的原因
- [HIGH] PLAN:74 P5-01 挂载顺序、决策 6 / §2「清单闭环」 — never-roots 并没有在结构上覆盖 wrapper 这一侧：「再 tmpfs 一次」只对「落在工作区或策略代码根之下」的硬 NEVER 根做，工具链白名单的只读挂回漏掉了。一条凭证路径如果在 `~/miniconda3`、`~/.local/bin`、`~/.npm-global` 之下，加进 never-roots 之后，guard 会拒，bash 却仍然能经只读挂回读到。§2 承诺的「只改 never-roots.mjs，两边同时生效」在这里不成立 — 证据: 本机 `ls -d` 存在 `~/miniconda3/.condarc`、`~/miniconda3/etc/aau_token`；P5-01 交付物要求把「HOME 内非点目录」的凭证路径列进 never-roots，miniconda3 正属此类，P5-01 自己的 ②「清单每一项 → 退出码 1」就可能在执行时撞上；决策 13 写的是「例外不越过 ①②」（guard 侧），wrapper 侧没有对应的规则 — 建议: 把挂载顺序的最后一步改成「落在**任何**挂回或重新 bind 的目录（工具链、工作区、策略代码根）之下的硬 NEVER 根，再 tmpfs 一次」；P5-01 ② 加一格：在测试 HOME 的工具链目录里放哨兵并登记进 never-roots，断言 bash 侧 `test -e` 退出码为 1、guard 侧 deny
- [HIGH] PLAN:135 D-1 约束 ④、PLAN:99 P5-22 ② — loopback 的验收在约束 ④ 指定的两种实现下都证伪不了：用了用户态网络栈之后，沙箱内的 `127.0.0.1` 是新 netns 自己的 loopback，连 4001 必然 111，测试必绿；真正的宿主 loopback 走的是网关地址。slirp4netns 默认把 `10.0.2.2` 映射到宿主 127.0.0.1，要加 `--disable-host-loopback` 才关；pasta 默认把网关地址映射到宿主 loopback，要加 `--no-map-gw`。出口代理方案还可以经 `CONNECT 127.0.0.1:4001` 绕过去 — 证据: P5-22 ② 只测「`127.0.0.1:4001`、gateway、`127.0.0.1:20000` errno 111」；§2 的网络探针口径也只写了 127.0.0.1（PLAN:60）；B A4b 要求 bash 连不上宿主服务 — 建议: 约束 ④ 补一句「宿主 loopback 经 netstack 网关地址或代理 CONNECT 都不可达」；P5-22 ② 加三格：连 netstack 网关地址（slirp `10.0.2.2:4001` / pasta 网关:4001）→ 失败；代理 `CONNECT 127.0.0.1:4001` 和 `CONNECT localhost:4001` → 被拒；解析 `localhost` 后连宿主端口 → 失败；差分：把 `--disable-host-loopback` / `--no-map-gw` 去掉时这几格必须命中
- [MEDIUM] PLAN:24 决策 13 ③ 例外「会话创建时的 sandbox writableRoots 子树」— 上游 fs fence 的可写集合不止工作区，还包括 `/tmp`、`os.tmpdir()` 和 additionalWritableRoots（`reuse/r4-tool-gates.md:102`）。builder 如果照字面取 writableRoots，数据目录在 `/tmp` 下时（app/ui e2e 用 mkdtemp，P5-06 ⑦ 也要求「数据目录放 HOME 外」），`workspaces/Y` 会落进例外，跨 bot 读隔离对文件工具就失效了 — 建议: 例外写死为「header.cwd（workspaceRoot）子树」，明确排除 /tmp、os.tmpdir() 和 extra roots；P5-02 ⑥ 加一格：数据目录在 /tmp 下时 read `workspaces/Y` → deny
- [MEDIUM] PLAN:26 决策 15（关注点①）— 论证在缺省布局、缺省 cwd 下成立，但有一个残余缺口没写：cwd 等于或包含数据目录时（如 `~/.config`、`~/.config/pbots-ui`），wrapper 会把这个目录整个重新 bind 回来；没有 MASK，就没有「mask 根下除 workspaces 之外硬 NEVER」这一层，于是 bash 和文件工具都能读到授权文件、policy-state 和其他 bot 的工作区。决策 13 ④ 只在 cwd 是 HOME 的祖先时作废例外 — 证据: main 的缺省数据目录 = `app.getPath('userData')`（main/index.ts:232），`app/ui/package.json` 只有 `"name": "pbots-ui"`，没有 productName，也没有 setName / setPath，所以就是 `~/.config/pbots-ui`；本机这个目录还不存在，也没有在跑的 SDK，说明今天还没有生产部署，不设 env 时 WARN 不会打挂现有用户 — 建议（一行）: 未设时 launcher 把 MASK 缺省为 `<passwd home>/.config/pbots-ui`，仍打 WARN。这样缺省布局完全闭合，「HOME 外且没设 env」仍然是唯一的已知缺口，取舍不变
- [MEDIUM] PLAN:27 决策 16（关注点②）— 故障通道本身是闭环的（env 未设 / 文件缺失 / 损坏 / paused / fault 五态都收窄，main 单写者，跨进程的损坏与恢复都由 P5-29 ②③④ 证伪），但有两处会让它在生产里白做：(a) 生产由谁设 `P2SDK_POLICY_STATE` 没写，决策 15 写了 MASK 由谁设，16 没有对应；没设就静默失去全部自主，P5-42 用测试夹具，测不出来；(b) policy-state 文件只靠「在数据目录内」得到保护，MASK 未设、数据目录又在 HOME 外时，这个文件不在任何硬 NEVER 里 — 建议: 未设时同样打一行 WARN；生产设置方与 MASK 写在一处（或者两者都从一个 `P2SDK_DATA_DIR` 派生，少一个 env）；`computeRoots` 显式把 `P2SDK_POLICY_STATE` 所在的目录列为硬 NEVER
- [MEDIUM] PLAN:98 P5-21 × PLAN:106 P5-29 ① — P5-21 没写 policy-state 多久读一次。P5-29 ① 要求「打开暂停 → 每步出卡」，这不重启就要生效，必须每次调用都读（或按 mtime 缓存）；P5-29 的区域又不含 `app/sdk/src/policy/`，P5-21 如果只在启动时读，P5-29 执行时就会卡住 — 建议: P5-21 写明每次 pre-execute 读（mtime 缓存可以），并加一格：会话进行中把文件改成 `paused:true` → 下一次 ALWAYS 调用出卡
- [MEDIUM] PLAN:135、142 D-1（关注点④）— 选项完备，措辞基本中立，②标为不可行的理由成立（ask 是终态，插件拿不到批准结果，②会退化成⑤）。但代价描述有两处不准：(a) 「安装要用户 sudo」不准确，slirp4netns 有静态二进制，可以免 sudo 放进 `~/.local/bin`，pasta 也可以从源码在用户态编译，这会改变 ①⑤ 和 ③ 之间的代价对比；(b) ⑤ 的许可文件「放 mask 根内」依赖 MASK 已设，决策 15 允许不设 — 建议: 约束 ④ 改成「apt 安装需 sudo；静态二进制免 sudo（派 scout 核实）」；⑤ 的许可文件改放 DSH_HOME 下由启动器算出的子目录，或者放 handoff 同类目录（永远是硬 NEVER）
- [LOW] PLAN:79 P5-06 ⑦「未设 + HOME 外 → 记录实际结果」证伪不了 — 建议: 把这个已知缺口的期望写死（bash `test -e` 其他 bot 的哨兵退出码为 0、文件工具 allow），缺口一旦被意外关闭或者变化，这一格就会变红，提醒去更新决策 15
- [LOW] PLAN:91 P5-16 deps 与 PLAN:90 P5-15 `.f` — `.f` 排在拥有该区域的任务之后，P5-16 只依赖 P5-15 本身，所以 P5-15.f（侧栏）和 P5-16（侧栏 A4/A15）可能同时派到 `plugins/bots/` — 建议: P5-16 派发前，要求它区域内的 P5-15.f 全部关闭，或者把这些 `.f` 并入 P5-16
- [LOW] PLAN:111 P5-31 deps 含 P5-22 — D-1 选 ③ / ④ 时 P5-22 是 skipped — 建议: 写明「skipped 视为满足」
- [LOW] PLAN:27 决策 16 — main 写 policy-state 失败时（数据目录只读 / 磁盘满），SDK 会读到上一次留下的 `paused:false`，fault 传不过去 — 建议: 接受，写一行 `ponytail:`；或者 main 写失败时把它当启动错误，在 UI 上显式提示
- [LOW] 决策 14 代价 — 本机没有 `~/.config/pbots-ui`，也没有在跑的 SDK，「cwd=PKG_ROOT 的旧 bot 写不了」实际只影响开发期的 bot，Q-013 (e) 的措辞可以降级为提示，不用当成用户的取舍题
reverse_take: 三个月后最可能出问题的地方：清单是单源了，但 wrapper 一侧还有一层只读挂回不在「再遮一次」的规则里；联网升权的验收测的又是沙箱自己的 127.0.0.1，于是测试全绿，凭证和宿主服务却从工具链目录和 netstack 网关漏出去。更笨也更稳的做法：「再遮一次」对所有挂回目录一视同仁；loopback 探针改测网关地址和代理 CONNECT。
```

## 九条 HIGH 与 MEDIUM 处置行逐条核验

| # | 结论 | 说明 |
|---|---|---|
| 1 A-H1 | 已回应，有一处 MEDIUM | 决策 13 的默认拒、`/proc` 硬 NEVER、P5-02 ④⑤⑥ 和 P5-06 ② 都落到了。例外「writableRoots」的口径太宽（/tmp），见 MEDIUM |
| 2 A-H2 | 已回应 | 决策 14 + P5-01 ⑧ + P5-02 ⑦；start.ts:56 的默认 DSH_HOME = `PKG_ROOT/.dsh`，「重新 tmpfs」已覆盖；`.git` 是增补项，合理 |
| 3 A-H3 | 已回应 | 接口定死，P5-02 deps = P5-01，sdk-env / sdk-runtime 进了区域；e2e 用 mkdtemp 作 cwd（sdk-runtime.ts:67-73），不会因为决策 14 变红 |
| 4 A-H4 | 题干已回应，验收没有 | 见 HIGH-3 |
| 5 B-H1 | 已回应 | 补全依赖后无环；29 / 8 / 6 / 15 计数核对无误 |
| 6 B-H2 | 已回应 | P5-22 按选项分写，① 要求 P5-04 全部格照绿 |
| 7 B-H3 | 已回应 | 故障通道闭环；生产设置方和读取频率是缺口，见 MEDIUM |
| 8 B-H4 | 已回应 | §0.1 覆盖表 + P5-15 减 4 项、只加测试；A6 不覆盖的取舍正确 |
| 9 B-H5 | 结构上大部分成立，工具链一侧有缺口 | 见 HIGH-2 |
| MEDIUM 行 10–27 | 已核 | P5-03 出处已在已装产物上复核：presets/standard:122-123、presets/cordis:130、presets/ptc:126 的嵌套行属实；web-app cordis.patch.yml:480 的顶层 host 行本来就是 `disabled: true`，不需要另行覆盖。顺序格移到 P5-04 ⑤ 成立。#14、#15 的改动引入了 HIGH-1 |
| 28 不采纳 MASK fail closed | 论证成立，有残余 | 见 MEDIUM（决策 15），一行缺省值就能闭合 |

## 关注点结论
1. **MASK 未设时 WARN**：在缺省布局下安全。今天没有生产部署，所以 fail closed 换不来什么，打挂 e2e 的代价却是真的。残余缺口是「cwd 包含数据目录」，用缺省值兜底就能补上。
2. **决策 16**：故障通道在跨进程层面是闭环的。生产设置方、读取频率、policy-state 自身的硬 NEVER 这三处要补，都不是安全方向的回退。
3. **never-roots 单一清单**：guard 一侧完整；wrapper 一侧的工具链挂回不在「再遮一次」的规则里（HIGH-2）。`/proc` 在 bash 一侧由上游 profile 的 `--unshare-pid --proc /proc` 隔离（`D/sandbox/sandbox-local/src/profiles.ts:17`），不需要 wrapper 再处理。
4. **D-1**：五个选项完备，②不可行的判断成立，评判维度齐全。loopback 约束在用户态网络栈下的验收口径有洞（HIGH-3），sudo 代价不准（MEDIUM）。
5. **依赖补全后的新问题**：HIGH-1（P5-04 和 P5-05 断言的原因冲突）、P5-21 × P5-29 的读取频率、P5-16 × P5-15.f 的区域重叠、P5-31 遇到 skipped 时的语义。
