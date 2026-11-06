# T10：远端 bash 套 wrapper（sandbox-zone-ssh + wrapperArgv 抽取 + ④/③ 格）

> 开单：main 照 DESIGN-ssh-composition D3/D4（r2+r3）转实体 | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：DESIGN §D3 §D4 验证节（T10 先红格已逐格写明）；前置 T9a/T9b 均已合并
> 分支 / 作业目录：feat/T10 @ /tmp/bot-wt/T10
> claimed：2026-11-06 18:0x
> accepted：

## 目标
ssh 模式的 bash 与本机同等受 wrapper 约束：宿主+远端两套读遮蔽/写保护/恒断网（许可才通）；坏 wrapper → bash 执行失败（无「无卡裸跑」）；D3 档位语义不动。

## 施工面（D4 结论）
1. `src/start.ts`：抽 `wrapperArgv(cfg)`（:215-224 组 argv 段：--home/--mask/--never/--tool/--policy/--permit-root/--slirp），本机 sandboxRow 共用；导出供 sandbox-zone-ssh 行用。
2. 新建 `src/policy/sandbox-zone-ssh.mjs`：继承 SshSandboxProvider（上游 41 行类）；`confine()=super.confine()` → argv[0] 基名非 bwrap 或 enforcement!=='full' → 抛 SandboxUnavailableError → 改写 argv（前缀 `python3 -I <宿主 wrapper>` + wrapperArgv ∪ 远端根 [--home/--mask remoteHome、--never 远端硬根、--policy remoteRuntimeDir 缺省不传] + 原 argv 的 `--` 后段原样）。
3. start.ts sshRows：sandbox-ssh insert 换 sandbox-zone-ssh（带 config）；runnerFailureRules 追加 'bwrap: '（shell-ask 第 1 行档位的前提）。
4. 测试：`tests/e2e/ssh-bash.test.ts`（④a 先红=原版下读到宿主哨兵、④b 远端哨兵、④c /tmp/dsh-ssh-* 不可见+helper 包目录写保护、③a 门开 0 卡 marker 落远端、③b 门关出卡、③c 变异换回原版→④a 红）；`tests/unit/sandbox-zone-ssh.test.ts`（④e：stub confine 三态）。

## 边界
1. 只动上列文件 + 回执。shell-ask 档位表/permitDir/policy-state 不动（D3 选 3）。
2. helper 的 Hello.root 不当 --policy 传（bwrap-wrap.py:345-353 会露回 /tmp）。
3. danger-full-access 绕 confine 与本机同语义（不测不实现）。
4. 先红：④a 两段原样（原版读到正文）。

## 验收（写命令，不写感觉）
1. ④a 先红原样；修后 ssh-bash 全绿（格数照实）。
2. ④d 变异两刀：直通 super 不改写 → ④a/④b 红；只传远端根（r1 写法）→ ④a 红。
3. ④e 单测三态。
4. 回归：ssh-product 5 / guard-plugin-manager 7 / start+guard unit / ssh-fs-zone 9 全绿；跑后 pgrep 无残留。
5. 改动面 git diff --stat 只边界清单。
6. 回执 receipts/T10.md。

## 为什么这样验收
④a 的先红是整个 ssh 安全链的收口证明：原版 helper sandbox 只读不设防（D4 备选 1 复审核实——本机测试 bot 能 cat 宿主 ~/.ssh）；wrapper 参数集必须是宿主 ∪ 远端（r1 只传远端时宿主哨兵漏，复审发现的恒红陷阱）。③a/③b 保 D3 档位语义不被 wrapper 破坏。
