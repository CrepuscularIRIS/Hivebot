# G1-r2 · p5-parity BRIEF v2 · 席 A（Opus 5.5）

审查对象：`work/p5-parity/BRIEF.md` v2（226 行，修订账 L184-210）
方法：逐条对照 r1 必须回应清单（`panels/G1-r1.md` 7 条 HIGH）与 v2 修订账；读 R4 `reuse/r4-tool-gates.md`、R5 `reuse/r5-sandbox-probe.md`、R6 `reuse/r6-grant-format.md`、R7、R8，再回到上游源码和本机环境核对 v2 没吸收的部分。只读，未运行产品代码。

```
seat: A
verdict: REVISE
confidence: high
findings:
- [HIGH] §6 A9 L102、A4 L96、§7 第 1 行「现状」L115 — 子代理会话把 approvalPolicy 钉成 'never'，而现有 shell-ask 遇到 never 直接放行；照这个骨架泛化出来的档位策略，会在子代理里绕过 NEVER 常量和「目录外读 ASK」，A4 只测根会话，必然全绿 — 证据: `D/packages/subagent/subagent/src/child-agent.ts:243-254`「the approval policy is pinned to 'never' regardless of the parent's own policy」；`app/sdk/src/policy/shell-ask.mjs:45` `if (approvalNever(ctx, exec)) return next()`；R4 L78 已指出「子代理普通 bash 不经本策略 ask」；standard 默认带 subagent / subagent_fork / workflow 且都不问（R4 表 #23/#24/#26）。所以今天的「每条 bash 都要问」也不成立：模型调一次 subagent，子会话里的 bash 就无卡执行 — 建议: A9 判定顺序写成「NEVER 常量 > approvalPolicy=never 放行 > 档位 …」，NEVER 与凭证拒读在任何 approvalPolicy 下都生效；ASK 类在 never 会话里是拒绝，不是放行；A4 矩阵加一列「子代理会话」（subagent、subagent_fork、workflow 各发起一次 bash 和 read），并断言 wrapper 对子会话 bash 同样生效；§7 第 1 行「现状」和 Q-013 的说明改写为「根会话每条都问；子代理里 bash 今天不问」
- [HIGH] §7 第 10 行 L124、A10 L103 — `plugin_manager` 在 standard 默认启用，一次「仅批准这一次」就能永久改 profile（停用 shell-ask / 沙箱 wrapper / 档位插件、装任意 bundle，宿主代码跑在沙箱外）；v2 的 NEVER 清单和 D9 都没覆盖它，自主化以后用户对卡片的警惕更低，这是最短的升权逃逸路径 — 证据: `D/packages/bundle/web-app/presets/standard.patch.yml:125-127`；`D/packages/boot/plugin-manager/src/tools.ts:87-104`，工具描述原文「Changes affect every session in this profile」「installed Host code runs outside the workspace sandbox」，execute 只请求一次 danger-full-access 单次升权；R4 L25「UI/RPC 的 D9 白名单限制不等于模型工具被移除或设为 NEVER」 — 建议: 第 10 行加入 `plugin_manager`（全部 action，含 list）= NEVER，用代码常量拒绝，或者在我们的 profile patch 里直接移除这个工具；A10 加一格「fake 调 plugin_manager → 不出卡、报错、profile 不变」；这是纯收紧，放进 W1-AP-0，不等 Q-013
- [HIGH] §7 表（缺行）、§7 后果说明 L111、附 Q-013 第 2 点 L214、§11 W1-AP L180 — v2 只围着 bash 设防，但 R4 证实进程内工具今天零审批：read / glob / grep 可读任意路径，web_fetch / web_search 可出公网。「bash 读 → 进模型上下文 → web_fetch 把内容放进 URL 发出去」这条外发链不经过 wrapper；对用户说「ALWAYS 下无网络」是错误陈述，这和 r1 A-H1 是同一类知情同意问题。另外，修复它的文件工具 NEVER 拒读清单是纯收紧，却被排进了等 Q-013 的 W1-AP — 证据: R4 表 #3 read「包括工作区外读取，没有 read-approval 门」、#7 glob、#8 grep、#29 web_search、#30 web_fetch 都是「否」；`D/packages/bundle/base/cordis.patch.yml:459-460` web_fetch「accepts only public HTTP(S) destinations」（loopback 进不去，公网可以）；launch token 默认放在宿主 `/tmp/p2sdk-handoff-*`（`app/sdk/src/start.ts:62`），bwrap 遮得住 bash，进程内 read / glob 遮不住；§7 第 4-9 行「现状」仍写「待 R4」（L118-123），R4 其实已经有答案 — 建议: ① §7 加一行「web_fetch / web_search」，由用户定档（推荐 ASK，或至少写进后果说明）；② §7 后果说明和 Q-013 第 2 点改成「bash 无网络；bot 仍可经 web_fetch 访问公网，被它读到的内容都可能被发出去」；③ 文件工具的 NEVER 拒读常量（realpath + 凭证清单 + handoff glob）移到 W1-AP-0 或单独一个不等 Q 的收紧任务，A4 的文件工具格随之提前；④ §7 第 4-9 行「现状」按 R4 填实
- [HIGH] §3 代价 L53、§7 第 1 行 L115 例「`python x.py`」、旅程 2 L71、A6 L99 — wrapper 遮蔽整个 passwd home 后，本机的解释器和工具链也一起消失：`python`、`pip`、`conda` 都在 `~/miniconda3`，`pnpm` 在 `~/.npm-global`，`uv` 在 `~/.local/bin`。沙箱里 `python` 直接 command not found，`python3` 落到不带用户包的 /usr/bin/python3.12。旅程 2「建个脚本、跑一下」按原样做不成，模型会转去升权，卡片照样一张接一张（死因 3 当场兑现）；§3 代价只写了「git 用户配置、用户级 pip」，用户确认 Q-013 时看不到这一条 — 证据: 本机 `command -v python` → `/home/lingxufeng/miniconda3/bin/python`，`/usr/bin/python` 不存在，`/usr/bin/python3 -> python3.12`；`command -v pnpm` → `~/.npm-global/bin/pnpm`，`uv` → `~/.local/bin/uv`；PATH 原样透传给 dsh（`app/sdk/src/start.ts:118`）；wrapper 遮蔽 passwd home（BRIEF L51、L209） — 建议: wrapper 在遮蔽之后，把工具链白名单（`~/miniconda3`、`~/.local/bin`、`~/.npm-global`，清单放 profile 配置）`--ro-bind` 回来，并且排在 home 遮蔽之后、凭证遮蔽之前；R5 / A0 加一个探针：沙箱内 `command -v python` 与宿主一致、`python -c 'import numpy'` 成功；A6 的 fake 脚本用 `python`，不用 `sh`。如果决定不放回，§3 代价和 Q-013 说明必须写明「沙箱里没有你的 conda 环境」
- [MEDIUM] L152、L156-158、L51 — R4/R5/R6 已经落盘（文件时间早于 BRIEF 最后一次写入，commit e7b1c51 也写了「R6 landed」），但 v2 正文仍写「R1–R6 仍在跑」，表格仍是「待 R4」。另有具体偏差：L51 写「sandbox-local 配 `runnerCommand`」，R5 实测配置 id 是 `sandbox`，用错 id 时 overlay 静默不生效（r5 L62、L151）；R4 ④（升权拿到什么权限）和 ⑤（工具调用上限 / 打断时限）R4 没有回答，第 2 行和 A12 仍悬空 — 建议: 出 v2.1，只把 R4/R5/R6 的结论填进表和条款，L51 改成 `id: sandbox`；R4 ④⑤ 重新派
- [MEDIUM] §7 第 7-9 行 L121-123、A10 L103、§7(b) L131 — R4 证实 MCP 的 readOnlyHint / destructiveHint 不会桥接到 pre-execute（`D/packages/mcp/mcp-client/src/tools.ts:131-142,229-246`；R4 L21），所以第 9 行「destructive 不可 always」实现不了，main 也认不出哪个是「连接器写工具」。用户在 Q-013 里选了第 9 行「否」，删除类工具照样会落到第 8 行，拿到 always，用户的选择被悄悄违背。另外，工具名经过归一化并带 hash，同名不同 server 时会继承授权（R4 L84；R6 L200） — 建议: 写明回退规则：桥接元数据没做出来之前，所有连接器都按「未标注」处理；用户如果对第 9 行选了「否」，则任何连接器都不给 always。授权键改为 main 侧的稳定身份（serverName + rawName），不用归一化后的工具名
- [MEDIUM] A4 L96「连接器工具（待 R4）」 — R4 L89：MCP 服务器进程不继承 bash 的 OS 沙箱，所以 A4 的连接器格按现在的写法不可能通过，执行期要么卡住，要么被悄悄放宽 — 建议: 在 BRIEF 里定死：连接器服务器进程不在 NEVER 保证范围内（由用户安装时决定是否信任），A4 只测「连接器的工具结果不含哨兵」；Q-013 后果说明加一句
- [MEDIUM] §3 做法 ①（先遮蔽、再重新 bind 工作区） — 工作区如果是某个被遮蔽路径的祖先，重新 bind 时会把遮蔽掉的东西重新以可写方式暴露出来。旧 bot 的 cwd 是 runtime 启动目录（R4 §4：不是 HOME，可能是 `~/bot` 或 `app/sdk`），而 DSH_HOME 默认就在 `app/sdk/.dsh`（`app/sdk/src/start.ts:56`），里面有 profile 和全部 bot 的会话日志 — 建议: wrapper 加一条规则：重新 bind 之后，凡是落在任一工作区根之下的遮蔽路径再遮蔽一次，否则拒绝运行（fail closed）；A0 加一格「cwd = DSH_HOME 祖先」的探针
- [MEDIUM] §7 第 6 行 L120 — NEVER 清单缺 DSH_HOME（会话日志、profile、runtime-patch；R5 L119-124：DSH_HOME 由 shell-env 主动注入 bash 环境）；文件工具对宿主 `/tmp` 可写（R4 L102：fence 的可写集合包含 /tmp），handoff 目录只防读不防写，launch token 可被覆盖 — 建议: 第 6 行加 DSH_HOME；NEVER 常量对凭证路径同时拒读、拒写
- [LOW] U2 L83 — R8 规则表另有 fixed 3 项（RE-visual-residual.md L10），不在「19 fixed + 6 in」的断言范围里；需要确认它们有数值，没有的话写明不需要断言
reverse_take: 最可能的失败方式：wrapper 把 bash 封得很好，A0 全绿，但 bot 从 bash 以外的侧门出去：子代理里的 NEVER 被 never 钉住后放行；plugin_manager 一次批准就永久改掉 profile；read + web_fetch 零卡外发。与此同时，用户发现沙箱里 python 不见了，开始批一张又一张升权卡。更笨更稳的做法：第一波只做「全入口纯收紧」（文件工具 NEVER 常量、plugin_manager NEVER、子代理与根会话同一套判定、工具链只读放回），全部不等 Q-013、带正对照落地；之后再把第 1 行改成 ALWAYS。
```

## r1 七条 HIGH 逐条核验

| r1 编号 | v2 回应位置 | 判定 | 说明 |
|---|---|---|---|
| A-H1 沙箱不拦读 / 网 | §1 L20-22、§3 L51-59、A0 L92、§7 L111、修订账 L188 | **充分** | 路线 1′ + wrapper + A0 带正对照 + fail-closed ⑥，后果说明要求原样带给用户。R5 实测（`r5-run-qXloBM`）证实 `--unshare-net` 和 tmpfs 遮蔽可行。遗留：配置 id 应为 `sandbox`（MEDIUM）；工具链被遮蔽（新 HIGH-4） |
| A-H2 用例空过 | §6 L76-77、A3 L95、A4 L96、修订账 L189 | **充分** | 测试 HOME 移出 /tmp、正对照规则、错误码断言、env 哨兵走 real + stub。R5 证实 real-fake 模式可用。Landlock 双跑改为「wrapper 失效时 fail closed」，理由成立（index.ts:46-55） |
| A-H3 主 bot 永远全 ASK | A11 L104、§7(e) L134、旅程 2 L71、修订账 L190 | **充分** | 用户触发迁移、不搬文件、不自动迁移，并有反向断言（重启 3 次不迁移）。注意 R4 §4：旧 cwd 是 runtime 启动目录，不是 HOME，这影响 wrapper 的重新 bind（MEDIUM） |
| A-H4 token 被拿去用 | A4b L97、§4 死因 1 L64、R5 ③、修订账 L191 | **充分（bash 维度）** | `--unshare-net` 从根上断掉 loopback。web_fetch 只放行公网（cordis.patch.yml:459-460），连不上 gateway；但进程内 read 能读到宿主 /tmp 里的 handoff，并入新 HIGH-3 |
| B-H1 NEVER 降级 | A9 L102、§7 L127、修订账 L192 | **充分（根会话）** | 判定顺序和损坏态断言都对。漏了 approvalPolicy=never 会话（子代理），见新 HIGH-1 |
| B-H2 缺文件工具入口 | A4 矩阵 L96、§3 L61 containment 复用、修订账 L193 | **结构充分，内容待填** | 矩阵结构正确，复用 containment.ts 也正确；R4 已给出入口全表，但 v2 没填，而且漏了子代理列和 plugin_manager（新 HIGH-1、HIGH-2） |
| B-H3 always 语义冲突 | §7 第 2/3/5/8/9 行、A10 L103、C2 ①③、修订账 L194 | **充分** | always 只给连接器写工具；bash、文件、提问事件在方法层拒绝写盘，自洽。遗留：MCP hint 拿不到，第 9 行无法区分（MEDIUM） |

结论：7 条 HIGH 全部有实质回应，没有敷衍。问题出在新输入：R4/R5/R6 在 v2 定稿前已经落盘，但 v2 只吸收了 R7/R8，R4 揭示的几个「非 bash 入口」没进入设计。

## 新输入吸收检查

- **R7**：A14、W1-AP-q、C2 ⑥ 与 R7 ③（ledger :34-39、deadline :63-74、M1 :97-108）一一对应，没有引入新问题。
- **R8**：U1/U2 的计数与 RE-visual-residual.md L10 一致（主表 59 = fixed 19 · 等价 24 · open 6 · waived 10；规则表 24；合计 83）。规则表 fixed 3 的断言归属见 LOW。
- **R4（未吸收）**：工具全表（32 + 条件）、MCP 不桥接 hint、MCP 进程不在沙箱、子代理 never、plugin_manager 升权、cwd 缺省 = runtime 启动目录，分别对应上面的 HIGH-1/2/3 和三条 MEDIUM。
- **R5（部分吸收）**：v2 引用的是早期草稿 `r5-run-5lSrb9`（L22、L157），最终证据是 `r5-run-qXloBM`；配置 id 是 `sandbox`；DSH_HOME 被主动注入 bash 环境；Landlock 下 /tmp 是宿主共享的。前两点要改正文，后两点归入 MEDIUM。
- **R6（未吸收，但与 v2 一致）**：自建最小 `{version, grants:[{botId, toolName}]}`，坏文件不加载任何授权、NEVER 不受影响、写盘成功再生效，与 A7-A10 吻合。PLAN 直接引用即可；授权键的身份问题见 MEDIUM。

## 给 PLAN 的首批任务（按本席发现）

1. W1-AP-0 扩为「全入口纯收紧」：wrapper（含工具链只读放回、遮蔽后的祖先重遮蔽）+ 文件工具 NEVER 常量（读写都拒）+ plugin_manager NEVER + 子代理判定一致。都不等 Q-013。
2. BRIEF v2.1：吸收 R4/R5/R6，§7 加 web 行、填「现状」列，后果说明改正（web_fetch、conda、子代理），配置 id 改正。
3. 再派 R4 ④⑤（升权语义、打断时限）。
