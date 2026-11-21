# VERIFY · P5-22 受控联网升权（安全深验）

verdict: PASS
commit: d957d1748ddd656ee7f058cc51fabb837f81c6d5（feat/P5-22 @ /tmp/bot-wt/P5-22，基 03910c4，worktree 验收后已复原干净）
验收时间：2026-11-03 14:41–15:05 · verifier 独立复跑，不采信 builder 输出

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 全量回归 37 文件/304 用例 | PASS | 自跑两次绿 + 非原子破坏下 1 次（见红基线 B）；`node_modules/.bin/node node_modules/vitest/vitest.mjs run`（v24.22.2） |
| request-network e2e 5/5、request-net 单测 7/7、wrapper 新增 3 | PASS | 单文件复跑：5/5、7/7；三文件合跑 25/25（wrapper 共 13，含新增 3） |
| 2a 许可伪造：哈希不对/过期/别会话/version≠1 → wrapper 拒 | PASS | 亲测 4 例全部离线（lan=errno 101，命令照常断网执行）；wrong-hash/other-session/version2 许可不消耗、expired 被清理。evidence/P5-22/deep-vfy-run.log + deep-vfy-results.json（手写许可 JSON 直打 bwrap-wrap.py，不经 SDK 签发） |
| 2a 重放同一许可第二次 → 拒 | PASS | run1 lan=conn（真 slirp4netns 联网，resolv=1.1.1.1、DNS 真解析）且许可文件消失；run2 同命令 lan=101 离线。deep-vfy-run.log `=== replay ===` |
| 2b slirp4netns sha256 对官方 | PASS | 本仓 `1c177694…d53e70` == 官方 v1.3.7 SHA256SUMS 的 `slirp4netns-x86_64` 行（curl 亲取 release 附件）。evidence/P5-22/slirp4netns-local.sha256 + SHA256SUMS-v1.3.7-official.txt；git 模式 100755 |
| 2c 网关探针差分两态 | PASS | guard-on：gw(10.0.2.2→宿主 lo stub)=errno 101 且 lan=conn（出网通、回环堵）；guard-off（P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD=1）：gw=conn——探针有效性成立。另联网态 lh/d127=111（自身 lo）、断网态 4 项全失败。deep-vfy-run.log `gw-guard-on/off` |
| 2d fail closed（SLIRP_BIN 指向不存在） | PASS | rc=1、命令未跑（out.json 不存在）、stderr `bwrap: ` 前缀、无 resolv 临时文件泄漏。deep-vfy-run.log `=== fail-closed ===`（stderr 第二行为孤儿 bwrap 子进程与 finally unlink 的毫秒竞态痕迹，方向仍收紧，builder 已自报） |
| 3 红基线 A：摘 shell-ask 硬分支 → 「恒 ASK」用例红 | PASS | 摘掉 `exec.name === 'request_network'` 分支 → 用例① 红：`approval card emitted: expected undefined to be truthy`（根本没出卡：落入档位表 default 直行——证明硬分支是唯一审批闸且在表前）。evidence/P5-22/red-baseline-shellask.log；测后 git checkout 复原 |
| 3 红基线 B：claim_permit 改非原子 → 并发用例红 | **无并发用例**（记新问题①） | unlink-first 改 match-then-unlink 后**全量 37/304 仍绿**——原子性无回归保护。evidence/P5-22/red-baseline-claim-atomic.log |
| 4 通道判断论证复核（「签发侧滥用 wrapper 仍兜底」） | 成立 | 见下方论证段；全部环节有实测对应 |
| 5 区域 vs 申报 | PASS | `git diff 03910c4..d957d17 --stat`：10 文件 +995/−1，与报告逐项对账一致（request-net.mjs/bwrap-wrap.py/slirp4netns+README/shell-ask.mjs/approval.yml/start.ts/3 测试文件）；2.3MB（2391416B）二进制入库，README 记来源 URL/版本/sha256（已亲核）/GPL-2.0 私用声明/升级路径 |
| PLAN ① dfa 照拒 | PASS | guard-escalation.test.ts 单跑 7/7（含 danger-full-access 拒），全量亦绿 |
| PLAN ④ 卡片 toolName/完整命令可见 | PASS（协议级） | e2e 断言 $events approval 帧 toolName='request_network'、reason 含完整命令+reason 文本+single use；「DOM 无始终允许」属 P5-31 卡 UI 验收，本 slug 语义上审批仅 allowed-once/rejected（硬分支每次 ASK，无 always 通路） |
| PLAN ⑤ 许可过期断网/他会话不受影响/许可文件 bash 不可见 | PASS | e2e 用例③ + 我的直打：联网/断网/伪造各态 `permits_visible=false`（数据根 --tmpfs 遮蔽联网态也成立），e2e `permits=1` |

## 通道判断论证复核（签发侧 = SDK 受信 execute，偏离 D1-r1「main 签发」字面）

结论：**论证成立**。批准→出卡链路未变（shell-ask 硬分支恒 ASK → dsh 审批 waterfall 把用户决定带回 SDK），变的只是「批准后谁写许可文件」。wrapper 校验链与签发方完全无关、逐环独立：
1. **argvHash = sha256(command 全文)**（跨语言 JSON 规范单测对拍 + 我的手写 wrong-hash 离线）——给 A 命令签的许可可不了 B 命令；
2. **session 绑定**：wrapper 按被包裹 bash 的 `DSH_SESSION_ID` 校验（别会话许可实测离线且不消耗）；
3. **TTL 60s**（过期即删+离网，实测）+ **O_EXCL 随机名**（签发侧不覆盖不碰撞）；
4. **unlink 抢占一次性**（重放第二次离线；同刻双 wrapper 6/6 恰好一次联网，concurrent-atomic.log）；
5. **模型侧写不了许可**：许可根在数据根下——bash 视角整棵 tmpfs 遮蔽（实测联网态也 test -e=1）、文件工具视角 guard dataMaskRoots 拒（P5-01 面，全量绿）；
6. **--unshare-net 恒保留**（联网来自宿主侧 slirp 接管新 netns，loopback 防护是结构性开关、不随许可变化，差分两态实测）。
即使签发侧被滥用（未来插件 bug 乱签），可放行范围仍被 1/2/3 钉死在「用户所见的那条命令、那个会话、60 秒内、一次」。测试钩子（P2SDK_TEST_SLIRP_*）仅 launcher env 可达、模型 bash 改不了父进程环境。偏离已在 builder 报告写明并留 director 复核口，属「已论证偏离」。

本任务无 UI 交付（卡 UI 属 P5-31），无浏览器截图项；卡内容经 $events 帧断言。

## 新问题（每条一行，可直接成为修复任务）

- [FIX] claim_permit 并发原子性无回归用例 | 复现：bwrap-wrap.py claim_permit 的 unlink-first 改为「先 matched 后 unlink、OSError 不 continue」，跑全量 → 37/304 仍绿，原子性破坏静默通过 | 疑似位置：app/sdk/tests/e2e/sandbox-wrapper.test.ts（应补并发格：同刻双 wrapper 抢同一许可断言恰好一次联网；我的黑盒对照 6 对两侧均 0 双占——µs 竞窗进程外难命中，属防线深度缺口而非可利用洞） | 严重度 M
- [OBS] fail-closed 路径 stderr 第二行「bwrap: Can't get type of source /tmp/bwrap-wrap-resolv-*」是孤儿 bwrap 子进程与 finally unlink 的竞态痕迹（builder 已自报①）；语义收紧不受影响、无文件泄漏 | 严重度 LOW
- [OBS] P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD / P2SDK_TEST_SLIRP_BIN 仅凭 env 存在性生效，生产位无防误设（env 面受信、模型不可达，风险低；可并入 P5-31 前的加固小任务加显式 dev 标志） | 严重度 LOW
- [OBS] P2SDK_TEST_NET_TTL_MS 已接线 start.ts requestNetRow 但无任何测试使用（builder 自报⑤「留未用」），属死测试面 | 严重度 LOW

## 证据清单（work/p5-parity/evidence/P5-22/）

deep-vfy-run.log（8 例直打 wrapper 全记录）· deep-vfy-results.json · SHA256SUMS-v1.3.7-official.txt · slirp4netns-local.sha256 · concurrent-atomic.log / concurrent-nonatomic.log（6 对同刻双 wrapper）· red-baseline-shellask.log · red-baseline-claim-atomic.log
