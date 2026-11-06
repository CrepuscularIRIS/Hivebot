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
