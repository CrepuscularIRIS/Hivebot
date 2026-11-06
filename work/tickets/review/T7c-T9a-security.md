# Sol 审查：T7c→T9a 安全面（b0ee442a^..cdae96a5）

> 代录：reviewer（Sol 6.1）2026-11-06 15:0x 完成，零落盘探针；主会话代录入库。
> 范围澄清：区间实含 91 个 commit（非派发词写的 9 个），实审聚焦四个安全面文件。
> 结论：CONFIRMED 4 条（高 0 / 中 3 / 低 1）；REFUTED 2 条；PLAUSIBLE 无额外。

## CONFIRMED

1. 【中】`app/sdk/src/policy/shell-ask.mjs:392-396`：只规范化 workspaceRoot，未规范化**尚不存在的 skill 根**。若 `ws/.dsh → ws/config`、`ws/config` 存在而 `skills` 不存在，目标解析为 `ws/config/skills/new/SKILL.md`；skill 根 stat ENOENT → 包含判定 false → **首次写入漏卡**。监听器探针实测：普通路径 ask、该 canonical 目标 allow；node_modules 符号链接实测确认「链接父目录＋缺失后缀」判定 false。终验覆盖「链接指向已有 skills」与「工作区链接＋缺失 skills」，未覆盖此组合。建议：两个 skill 根同样经 fs.resolve 规范化（保留缺失后缀）。
2. 【中】`app/sdk/src/policy/guard.mjs:40,244-258`：extraNeverTools 是模块级可变集合，**后一次 apply 会改变先前实例的策略**。探针：`apply(A,{roots,extraNeverTools:['grep','glob']})` → A.grep ssh-mode deny；再 `apply(B,{roots})` → 同一 A.grep 变 allow。限同进程多上下文（测试/热重载），不跨进程。终验逐实例验证、重配后只查新监听器，未查旧监听器。建议：集合移入 apply 局部闭包。（主会话注：这正是 T9ac「未配置重置空 Set」修复的副作用——重置共享 Set 把 A 的策略也清了。）
3. 【中】`app/sdk/src/start.ts:444-448,457`：SSH 五参数直接拼接 YAML，未用已有 `yamlScalar`。内存求值实测：remoteRoot=`/srv/O'Brien/work`（合法路径）→ `Unexpected scalar at node end`；host=`true`（合法别名）→ 解析成 boolean，上游 SSH 配置要求 string。终验参数均不含 YAML 特殊字符。建议：五参数统一走 yamlScalar。
4. 【低】`app/sdk/src/start.ts:184-212`：本机模式不清除**继承的** `P2SDK_SSH_MODE`。实测 `childEnv({ssh:undefined,…},{P2SDK_SSH_MODE:'1'})` 仍返回 MODE=1 → approval.yml 条件禁用误伤本机 workflow。终验本机对照只在未设该变量的环境跑。建议：先删继承信号，再按 cfg.ssh 设置。

## REFUTED
- skill 判定无「先 fileGateOpen 放行、再判 skill」分支；已有 skill 根的链接/大小写等价别名可由 inode 身份回退识别；非数组 extraNeverTools 在监听器注册前确实抛错。
- 上游 loader 对 disabled 用 Boolean 求值，false ≙ 缺省；默认四棵 preset 树（standard/cordis 条件禁、ptc 原 disabled:true、minimal 无 workflow 行）无漏禁。

## 覆盖声明
实读四个产品文件全部改动区及上下文、containment.mjs、resolve.mjs、上游 loader/preset/技能扫描代码、新增单测、skill-write-card 与 SSH 工具面用例、drift 豁免、两份回执。未把测试写法单列为产品缺陷。审查期间新增提交仅涉 T16 工单（/tmp/bot-wt/T16），四个已审文件无变化。

## 经理核实（manager Opus 5.5，2026-11-06 15:0x，主线 35a235c6，隔离 HOME/TMPDIR/DBus，零落盘探针于 /tmp/mgr-probe）

基线：`vitest run tests/unit/{policy,guard,start}.test.ts` → 72 / 24 / 40 passed。四条全部 **CONFIRMED**，无驳回。

| # | 结论 | 原样证据 | 处理 |
|---|---|---|---|
| C1 | **CONFIRMED（中）** | 真 tmp 树 `W/.dsh → W/config`、无 `skills`，照 shell-ask.mjs:392-395 原式判定（`containment.mjs` 真 isPathUnder）：`W/.dsh/skills/new/SKILL.md -> target W/config/skills/new/SKILL.md \| current inSkill= false \| fix inSkill= true`；直写 `W/config/skills/new/SKILL.md` 同为 `false/true`；`W/notes.md` `false/false`；建出 `config/skills` 后 `current inSkill= true`（inode 回退）——只漏首次。根因：skill 根字面拼接，root stat ENOENT 时 isPathUnder 直接 false。 | `open/T7ce-skill-root-canonical.md`：skill 根经同一 `fs.resolve` 规范化（只增不减），门开态先红 |
| C2 | **CONFIRMED（中；生产影响低）** | 真 `apply` + 假 ctx：`A.grep after apply(A): deny "…not available in ssh mode…"` → `A.grep after apply(B): deny "…filesystem resolution service unavailable"`（ssh 拒消失）；反向 `C(local).grep after apply(D ssh): deny "…not available in ssh mode…"`。两个方向都串。生产单进程通常只 apply 一次、旧 ctx dispose 撤监听器，影响限于重载重叠与测试。 | `blocked/T9af-guard-extra-never-closure.md`（等 T16 合并：同文件 :38/:255 正被 T16 改） |
| C3 | **CONFIRMED（中）** | `writeRuntimePatch` 真生成后解析：`quote PARSE ERROR: Unexpected scalar at node end at line 87, column 28`（yaml 2.9.1）；js-yaml 4.3.2 `bad indentation of a mapping entry`；`bool-host host= true boolean`；`num-host host= 1000 number`。上游 dsh-ssh schema `host: z.string()`（lib/index.js:52）→ 合法值导致启动失败（fail loud）。原理上值含 `'` + 换行即可闭合标量后续写新行（如追加一行 `disabled: true` 关掉 guard 行）——结构可被改写；来源是 launcher 运营方环境变量（可信侧），故定中不定高。**补充同类**：`start.ts:324 :381 :384 :397 :399` 同样 `'${…}'` 裸拼（含 handoff `dir:`，而 :346 同一值已走 yamlScalar），一并收。 | `open/T9ae-start-yaml-scalar-ssh-mode.md`（与 C4 同文件合一张） |
| C4 | **CONFIRMED（低）** | `childEnv(本机cfg, {PATH, HOME, P2SDK_SSH_MODE:'1'})` → `cfg.ssh = undefined`、`child.P2SDK_SSH_MODE = "1"`。`approval.yml:167,172,292,297` 在 dsh 子进程按它禁 workflow-ptc / tool-workflow；T9b containment 也将读它。根因：白名单保留全部 `P2SDK_*`，`start.ts:209` 删除表漏了 MODE。 | 并入 T9ae（`sshKeys` 加 `'P2SDK_SSH_MODE'`，一个 token） |

REFUTED 两条（skill 判定分支序、disabled 布尔求值）经理未复核，按 Sol 原结论存档。

排期：T7ce、T9ae 现在就做，与 T16 并行（T16 未碰 shell-ask.mjs / start.ts，`git -C /tmp/bot-wt/T16 status` 实看），合并不等 T16，须在 T9b 前。T9af 等 feat/T16 合并后从主线切，合并顺序 **T16 → T9af → T9b**。
