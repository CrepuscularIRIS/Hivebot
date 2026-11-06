# T5：L8-c ssh 族 × 我们安全层的组合设计（设计单，产出 DESIGN-ssh-composition.md）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：**manager (Opus 5.5) 亲自执笔**（设计单，原 architect 活，该角色已并入 manager）
> 审：reviewer (6.1 Sol) 只读核 → `work/tickets/review/T5-design.md` | 验收：manager 任务 B（逐条核实 Sol 意见）
> 来源：p9 BRIEF 目标 3 / L8 / 验收第 1 条；PLAN §2 fs-zone 行、§3 十条事实、§5-1/§5-4/§5-6；receipts/T4.md §5；queue 提议「T4 残留」
> 分支 / 作业目录：文档直接写集成分支 `work/**`（不写代码）；只读探针目录 `/dev/shm/bot-T5-*`（ssh helper 要在 bwrap 私有 /tmp 之外，PLAN §3-5；在 bot-reap 白名单内）
> claimed：2026-11-06 05:18 manager (Opus 5.5) @ b3983512；交稿 05:55（未提交，待主 agent commit）
> accepted：（任务 B 验收通过时填：日期、HEAD）

## 目标
T4 证明了「上游 headless + ssh 族」能跑通；但产品组合里 fs / subprocess / sandbox 三个挂点上已经各挂了我们的安全层（fs-zone 替 fs-sandbox、guard 最外层拦 NEVER、shell-ask 档位、bwrap wrapper 作 sandbox runner、request-net），ssh 族在**同一批挂点**做进程级替换。本单出一份可直接拆成实现单的设计：每道题给结论、被拒备选、锚点、以及实现单要先跑红的那个测试。不出设计就接产品 = 安全层在 ssh 模式下悄悄失效。

当前消费者只有一个：BRIEF 验收第 1 条「工程 bot 在 ssh 主机（先是本机）上改代码跑测试，结果回到对话」。不为它以外的场景预留。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（ssh 本机测试的坑）、p9 `PLAN.md` §2 全表、§3 十条、§5
2. `work/tickets/receipts/T4.md` §5（断连形态 = 运行整体终止；宿主直连清单；PTC 禁用四行；插件 warning）与其「经理核实」第 5 条（重复 llm-replay 是死代码，别据 warning 下普遍结论）
3. 我们的挂点：`app/sdk/src/start.ts` `sandboxRow`（:196-232，bwrap wrapper）、`guardRow`（:234-260，guard 钉最外层）、fs-sandbox 禁用 + fs-zone 插入（:262-291）、shell-ask 行（:293-322）、request-net 行（:324-）、`writeRuntimePatch`；`app/sdk/src/policy/*.mjs` 文件头；`app/sdk/profile/patches/approval.yml`
4. 上游 ssh 族：`repos/deepseek-harness/docs/subsystems/ssh.md`（§Composition scope、§Process lifetime）、`packages/ssh/ssh/README.md`（§Deployment prerequisites、:50 `ctx.ssh.ptcLaunch`、§Known Limitations）、`packages/ssh/{fs-ssh,subprocess-ssh,sandbox-ssh}/README.md`
5. preset 隔离：`repos/deepseek-harness/docs/user/develop/framework/service.md` §Service isolation（:113-130）、`repos/deepseek-harness/packages/bundle/web-app/presets/standard.patch.yml:51`
6. P6 worker cwd：`app/ui/main/m3-meta/orchestrate.ts:1-7,80-91`（cwd 由 main 强制为 `$PBOTS_DATA_DIR/workspaces/<botId>`，header.cwd 不可变）
7. T4 的测试生成 patch（产品化起点）：`app/sdk/tests/e2e/ssh-headless.test.ts`（含 :111-122 重复 llm-replay 死代码）

## 要回答的题（文档里每题一节，标题 `## D<n> <题名>`）
- **D1 fs 层**：ssh 模式下 fs-zone 是换成 fs-ssh（写侧围栏交给 fs-ssh 送远端的 policy / sandbox-ssh），还是包一层（fs-zone 判定包在 fs-ssh 外）？写明 fs-zone 现有哪些性质（区内写零卡、区外写出卡 P6-25 ⑤；Linux fd 绑定）在 ssh 下保留 / 丢失 / 换实现。
- **D2 guard NEVER**：宿主 NEVER 根在 ssh 模式下的语义。两种情形分开答：远端 = 本机（本机测试，NEVER 必须仍拒）；真实远端（远端自己的 `~/.ssh` 等算不算 NEVER）。guard 现在做本机 realpath，远端路径不能本机 realpath——判定放哪一侧。
- **D3 shell-ask 档位**：档位判定在工具层，与执行位置无关时是否原样保留；`permitDir` 等路径类推导指向远端 ws 时怎么改。
- **D4 sandbox runner 与 request-net**：本机 bwrap wrapper（`sandboxRow`）在 ssh 模式下不再包远端命令；远端用 sandbox-ssh 的什么后端（远端有无 bwrap）；单次联网升权在远端怎么落。
- **D5 P6 worker cwd**：ssh bot 的工作区在远端；main 强制的宿主 cwd、session header.cwd 不可变、远端 `ws` 三者关系；主 bot 委派给 ssh bot 时写什么。
- **D6 进程级 vs preset `isolate`**（PLAN §5-1）：只给部分 bot 远端电脑能否靠 isolate 做到——bash-sandbox / sandbox-policy / working-directory 是否跟着切，用源码或探针证明；做不到则写清「每台 ssh 主机一个 dsh 进程」的代价。
- **D7 断连「结果未知」的 UI**：按 T4 实测形态（在跑工具 `SSH helper disconnected; outcome is unknown`，随后 turn/final `reason.kind:"error"` `SSH connection is closed`）定：shim 序列化成什么 entry、用户看到什么、能否重试；上游不重连不重放，产品要不要重建连接、谁触发。
- **D8 PTC**：接 `ctx.ssh.ptcLaunch` 还是继续禁用；按当前消费者是否需要 workflow / PTC 判。
- **D9 宿主直连行去留**：`tool-fs-search`、`attachment-local`、`spill-local`、`agent-instructions`、`skill-filesystem`（产品组合若有 `shell-env` 一并）逐行：读写什么、ssh 下留 / 禁 / 换远端版。**skill-filesystem 必答**：ssh bot 的 project skill 根在远端，T7a「启用 = 复制到 `workspaces/<botId>/.dsh/skills`」在 ssh bot 上落点不对，给 T7a 后续的约束。
- **D10 真实远程装 helper**（PLAN §5-4）：先核 GitHub release 是否附 `dsh-ssh-helper-*` 包（`list_releases` / `gh release view` 看 assets，不只看标签），有则用、无则给方案（推 node-script + hash 校验等）；远端 Node 版本要求。
- **D11 宿主强杀残留**：`/tmp/dsh-ssh-*` 空目录（PLAN §3-10）在产品侧怎么办（维持不扫、或产品自有目录可归属后再扫）。
- **D12 一台电脑每账户还是每 bot**（PLAN §5-6）：0.78.1 补一句锚点或标「未找到」，与 D6 合并给结论。
- **D13 产品化形态**：ssh 行从测试生成搬到 `start.ts` `writeRuntimePatch` 还是 `profile/patches/ssh.yml`；ssh 目标配置来自哪（设置 / bots.json recipe）；私钥不进模型不进容器；**删 T4 重复 llm-replay（`ssh-headless.test.ts:111-122`）并入第一张实现单**。

## 文档写法（验收按这个查）
- 开头 `## 0 结论表`：D#｜一句结论｜落到哪张实现单。
- 每节 `## D<n>` 含五个粗体小标题：`**原版**`（0.78.1 怎么做，带锚点；原版是云 box 无对应就写明）、`**备选**`（≥2 个，含被拒理由）、`**结论**`、`**锚点**`（`path:line`，相对仓根；0.78.1 用 `LC_ALL=C grep -a -c '<字面串>' <文件>` 可复核的字面串）、`**验证**`（实现单要先跑红的测试：文件 + 格 + 预期怎么红）。
- 凡写「实测」的，命令与原样输出落 `work/tickets/evidence/T5/<名>.txt`，正文引用该路径。
- 末尾 `## 实现单拆分`：按「写两张开一张」，写进 `queue.md` 当计划行（只标一张可开）；每行引用对应 D#。
- 需要用户拍板的（需求、品味、越过硬约束）写 `work/QUESTIONS.md` 新编号（接现有最大号），选项 + 推荐；正文引用编号。行为语义题按「原版即规格」自己定，不问。

## 边界
1. 只写：`work/p9-dsh-integration/DESIGN-ssh-composition.md`（新）、`work/tickets/evidence/T5/*`、`work/tickets/queue.md`（实现单计划行）、`work/QUESTIONS.md`（新 Q）、`work/p9-dsh-integration/PLAN.md`（T5 行状态、§5 已答项）、`work/LOG.md`。`app/**`、`repos/**` 只读。
2. 探针只在 `/dev/shm/bot-T5-*` 下、隔离 HOME/TMPDIR、DBus 指不存在路径；要起 sshd 就复用 `app/sdk/tests/support/ssh-host.ts` 的 `startSshServer()`（按绝对路径 import，T4 经理核实同法），不另写夹具；不碰真实 `~/.ssh`。
3. 不起 Electron、不跑全量；load > 20 等一等。
4. 不扩范围：设计中冒出的新想法写进 queue 提议，不进 D 题。

## 验收（写命令，不写感觉）
统一：`cd /home/lingxufeng/bot && D=work/p9-dsh-integration/DESIGN-ssh-composition.md`
1. 题目齐：`grep -cE '^## D(1[0-3]|[1-9]) ' $D` → `13`；`grep -c '^## 0 结论表' $D` → `1`。
2. 每节五件套齐（输出为空）：
   ```sh
   awk 'BEGIN{n=split("原版 备选 结论 锚点 验证",k," ")} /^## D[0-9]+ /{chk();s=$2;delete f} s{for(i=1;i<=n;i++)if(index($0,"**"k[i]"**"))f[i]=1} END{chk()} function chk(){if(s)for(i=1;i<=n;i++)if(!(i in f))print "MISSING",s,k[i]}' $D
   ```
   （经理开单时已用合成样本自测：缺项能报出、齐全不报。）
3. 锚点都能解析（输出为空）：
   ```sh
   grep -oE '(^|[^A-Za-z0-9_./-])(app|repos|work)/[A-Za-z0-9_./@+-]+:[0-9]+' $D | sed -E 's/^[^arw]//' | sort -u | while IFS=: read f l; do [ -f "$f" ] && [ "$l" -le "$(wc -l <"$f")" ] || echo "BAD $f:$l"; done
   ```
4. 实测证据都在（输出为空）：`grep -oE 'evidence/T5/[A-Za-z0-9_.-]+' $D | sort -u | while read p; do test -s "work/tickets/$p" || echo "MISSING $p"; done`
5. D10 有 release assets 的原样输出：`ls work/tickets/evidence/T5/ | grep -i release` 非空，且文件里有 asset 名列表（或「0 assets」原文）。
6. 实现单进了 queue：`grep -c 'DESIGN-ssh-composition' work/tickets/queue.md` ≥ 2，其中标「可开」的恰 1 行；第一张实现单写明删 `ssh-headless.test.ts:111-122`。
7. 文档引用的 Q 编号都在 QUESTIONS：`[open]` 的段内带「推荐」，已答复的「答复：」行非空（输出为空）。r2（2026-11-06，复审建议）：原口径对已答复的引用（如 Q-024）字面误报，改为下式：
   ```sh
   grep -oE 'Q-0[0-9]{2}' $D | sort -u | while read q; do sec=$(awk -v q="$q" '$0 ~ "^## "q" "{f=1;print;next} /^## Q-/{f=0} f' work/QUESTIONS.md); [ -n "$sec" ] || { echo "NOQ $q"; continue; }; if printf '%s\n' "$sec" | head -1 | grep -q '\[open\]'; then printf '%s\n' "$sec" | grep -q '推荐' || echo "NOREC $q"; else printf '%s\n' "$sec" | grep -qE '^- 答复：.*[^[:space:]]' || echo "NOANS $q"; fi; done
   ```
8. 探针收尾：独立 shell `pgrep -af 'bot-T5' | grep -v pgrep` → 空；`/tmp/dsh-ssh-*` 相对执笔前无新增（执笔前先 `ls -d /tmp/dsh-ssh-* | sort > /dev/shm/bot-T5-dshssh.before`）。
9. Sol 只读审：`work/tickets/review/T5-design.md` 存在；任务 B 时经理逐条写 CONFIRMED / REFUTED 理由，CONFIRMED 的改进文档后再验 1–7。

## 为什么这样验收
设计单的产物是给 GLM 施工用的，过关标准是「施工时不用再做设计决定、而且每个决定都有一个会红的测试守着」。所以：五件套强制每题都有被拒备选（防止只写一个看似合理的答案）和先红测试（防止结论无法证伪）；锚点脚本让 Sol 和经理能复核而不是相信；实测必须落证据文件。最怕的失败是 D1–D4 在 ssh 模式下把 NEVER / 区外写出卡 / 档位悄悄削弱——这几节的 `**验证**` 必须点名 P5/P6 里现有的哪条安全回归（guard-fs、A4 凭证矩阵、P6-25 ⑤ 等）在 ssh 模式下要有对应格。

## 风险
- D6 若证明 isolate 跟不全，产品形态会变成「每台 ssh 主机一个 dsh 进程」，牵动 P6 编排与 main 的连接管理——这种结论要写进 Q（越过既定架构），不自己拍板。
- 远端 = 本机的测试环境里，「远端路径」和「宿主路径」是同一棵树，D2 的验证必须用 marker / 差分区分执行位置（照 T4 的 marker 法），否则测不出判定放错侧。
- D10 不核 assets 就写方案 = 凭记忆，验收 5 卡住。

## 产出
- 新建：`work/p9-dsh-integration/DESIGN-ssh-composition.md`、`work/tickets/evidence/T5/*`
- 修改：`work/tickets/queue.md`（实现单计划行）、`work/QUESTIONS.md`（若有新 Q）、`work/p9-dsh-integration/PLAN.md`、`work/LOG.md`
- 回执：`work/tickets/receipts/T5.md`（执笔人自填：用了哪些探针、哪些题没核实到底）
