# T7a：L4-c main 侧 skill 启用 API（list / enable / disable；启用 = 复制快照到目标 bot 工作区）

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：p9 BRIEF 验收第 2 条后半（「另一个 bot 能启用并复用它」）；RE-skills Q2 / Q4 / Q7 与「对 T6/T7 的影响」第 1、2、4、7 条；T6 工单「为什么」末段（库位置约束）
> 分支 / 作业目录：feat/T7a @ /tmp/bot-wt/T7a（不涉 ssh，/tmp 可用）
> claimed：（施工开始时由主 agent 填：日期、起点 SHA）
> accepted：（经理验收通过时填：日期、HEAD）

## 目标
给 main 加一个窄 IPC `pbots:skills`：列出某个 bot 已有的 skill 和可以从别的 bot 拿来的候选；**启用 = 把源 bot 的 skill 目录复制一份快照**到目标 bot 的私有根 `<dataDir>/workspaces/<botId>/.dsh/skills/<name>/`（T6 已证该根按 bot 私有、dsh 下一次请求就能发现）；停用 = 删目标 bot 的副本。之后改源头，已启用的副本不跟着变（RE Q2「复制，不联动」、Q7「启用状态存 bot 侧，停用 = 删副本」）。

**本单的「账户库」是派生视图，不另存**：「你的 skills」= 全部 bot 私有根 `<dataDir>/workspaces/*/.dsh/skills/*/SKILL.md` 的并集，main 只读扫描。理由：
- BRIEF 的消费者只要「A 在对话里存的 → B 启用」；原版独立库的写入口（Add new skill、文件导入、workflows 发布）本期都不做，单独建库目录 = 没有写入方的存储。
- T6 给的约束（库不能放 `$DSH_HOME/skills`、`$DSH_HOME/agents/skills`，那是全员共扫根 = 全员自动启用）在派生视图下天然满足：本单不往任何共扫根写东西。
- 已知天花板（代码里写 `ponytail:` 注释）：A 删掉自己的 skill 后它就从「你的 skills」里消失（原版库独立存在）。独立库等做「Add new skill / 文件导入」时再加（queue 提议已记）。

不在本单：UI（T7b）；审阅链（Q-028）；扁平 `<name>.md` 形态（dsh 也能发现它，但 T6 存的是目录形态；扫描遇到扁平文件跳过，写 `ponytail:` 注释）；ssh bot（工作区在远端，T5 D9 定）。

## 接口（照这个写，T7b 按这个接）
渲染进程：`window.pbots.skills(req)`（preload 新增一个函数，照 `botsMeta` 的写法）→ `ipcRenderer.invoke('pbots:skills', req)`；main 侧 `ipcMain.handle('pbots:skills', …)` 先 `assertSender(event)`（照 `main/index.ts:266`）。回值信封与 M3 相同：`{ok:true,value}` / `{ok:false,error:{code,message,details:{}}}`。

| req | value | 错误码 |
|---|---|---|
| `{op:'list', botId}` | `{onBot:[{name,description}], candidates:[{fromBotId,name,description}]}`；candidates = 其他 bot 的 skill，去掉「与目标 bot 已有项同名且 SKILL.md 字节相同」的 | invalid-args / not-found |
| `{op:'enable', botId, fromBotId, name}` | `{name}`（最终名，可能带 `-2`） | invalid-args / not-found / too-large / limit |
| `{op:'disable', botId, name}` | `{}` | invalid-args / not-found |

错误码前缀 `pbots/`。校验（信任边界，全部要有测试格）：
1. `botId` / `fromBotId` 匹配 `^[A-Za-z0-9_-]{1,128}$`，且 `<dataDir>/workspaces/<id>` 经 `lstat` 是目录（不是符号链接）；`botId === fromBotId` → invalid-args。
2. `name` 匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$`（RE Q4 slug）。
3. 源 `<from>/.dsh/skills/<name>/` 必须是目录且含常规文件 `SKILL.md`；**整棵源树只允许常规文件和目录**，出现符号链接或其他类型 → invalid-args，目标不落任何东西（符号链接会把「复制」变成「引用」，还能指向 A 工作区外的文件）。
4. `SKILL.md` 按**字符**计（UTF-8 解码后的 `string.length`）> 256,000 → too-large（RE Q4：按字符不按字节）。
5. 目标 bot 已有 skill 数 ≥ 250 → limit（RE Q4 `MAX_BOT_SKILLS`）。
6. 目标已有同名目录 → 依次试 `<name>-2`、`<name>-3`…（RE Q4 函数 H），并把副本 frontmatter 里的 `name:` 行改成最终名（否则 B 的目录里出现两个同名 skill）；目标原有那份不动。
7. 写入不半截：先复制到 `<target>/.dsh/.skills-staging/<随机>/`（在扫描根之外），再 `rename` 进 `.dsh/skills/<最终名>`；rename 撞上已存在目录就换下一个后缀。成功和失败后 staging 下都不留东西。

frontmatter 只取 `name` / `description` 两个顶层标量（正则读首个 `---` 块即可，app/ui 没装 yaml 库，不加依赖；多行 description 取不全写 `ponytail:` 注释）。复制用 `node:fs/promises` 的 `cp`/`readdir`/`lstat`，不手写递归拷贝以外的东西。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md（P5-03 fake 游标坑：每个会话脚本一次写全；run-e2e 不重建 dist）
2. `work/p9-dsh-integration/RE-skills.md` Q2、Q4、Q7
3. 照抄的写法：`app/ui/main/m3-meta/index.ts`（handler + 信封 + invalidArgs）、`app/ui/main/index.ts:246-270`（dataDir 取法、IPC 注册、assertSender）、`app/ui/preload/index.ts`（`botsMeta`）
4. e2e 模板：`app/ui/tests/support/ui.ts`（`launchProduct` / `createBots` / `api` / `toolCall`）、`app/ui/tests/e2e/grok-persona.spec.ts`（fake 脚本 + sdk runtime）；fake 请求记录读法照 `app/sdk/tests/e2e/skill-save.test.ts:122,212-244`（`<runtime home>/fake/requests.jsonl` 的 `userTexts` / `toolResults`）
5. `app/ui/main/m3-meta/orchestrate.ts:80-91`（bot 工作区 = `<dataDir>/workspaces/<botId>`）

## 边界
1. 只动：新建 `app/ui/main/skills/index.ts`（超 300 行再拆一个 `fs.ts`）、`app/ui/main/index.ts`（注册 IPC，几行）、`app/ui/preload/index.ts`（暴露 `skills`）、新建 `app/ui/tests/unit/skills/index.test.ts`、新建 `app/ui/tests/e2e/skills-enable.spec.ts`。renderer-grok、app/sdk、preset、profile 都不碰。
2. 先写失败测试：先写 unit 全部格子，`main/skills/index.ts` 只放空导出时跑一次看红（贴原样输出），再实现；e2e 在实现完、`pnpm build` 后首跑。
3. 测试走隔离 HOME / TMPDIR（`/tmp/bot-T7a-*`），建目录用 `tests/support/tmp-sweep.ts` 的 `tmkdir`；DBus 指不存在路径（run-e2e.sh 已处理）；只跑下面列的文件。
4. 机器在跑训练：load > 20 时等一等再跑 e2e。

## 验收（写命令，不写感觉）
统一前置：
```sh
T=$(mktemp -d /tmp/bot-T7a-XXXX); mkdir -p $T/tmp $T/home
cd /tmp/bot-wt/T7a/app/ui
E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
```
1. 单测：`$E pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/skills/index.test.ts` → 全绿，至少含下列格（格名照写，便于经理对号）：
   - ① list：两个源 bot 各一个 skill、目标 bot 一个 → onBot/candidates 正确；与目标同名同字节的候选被去掉，同名不同字节的保留
   - ② enable 复制：目标 `SKILL.md` 与源字节相同（含子目录里的附带文件），返回 `{name}`
   - ③ 快照：enable 后改源 `SKILL.md` → 目标内容不变
   - ④ 撞名：目标已有同名不同内容 → 新副本落 `<name>-2` 且其 frontmatter `name: <name>-2`，原有那份字节不变；再来一次 → `-3`
   - ⑤ 上限：256,000 个 `中`（> 256,000 字节）通过；256,001 字符 → `pbots/too-large`；目标已有 250 个 → `pbots/limit`
   - ⑥ 拒绝：`botId:'../x'`、`name:'../x'`、`name:'A_B'`、`botId===fromBotId`、源树内有符号链接、源 `SKILL.md` 是符号链接 → 全部 `pbots/invalid-args` 且目标 `.dsh/skills` 无新增；源不存在 → `pbots/not-found`
   - ⑦ disable：删目标副本，源不动；`name:'../x'` 拒；不存在 → not-found
   - ⑧ 不半截：每次成功 / 失败后 `.dsh/.skills-staging` 为空或不存在
2. e2e：`pnpm build && $E sh scripts/run-e2e.sh tests/e2e/skills-enable.spec.ts` → 1 passed（app/ui 的 `build` 已含 electron-vite + renderer-grok + stage；run-e2e 不重建 dist，改了 main/preload 必须先 build）。场景（一个 spec 一条链）：
   - `createBots` 建 A、B；A 的 fake 脚本：`write` 写 `.dsh/skills/t7-flow/SKILL.md`（合法 frontmatter，正文含随机串 BODY_R）→ 文本收尾；给 A 发一条消息驱动它；等文件出现在 `workspaces/<A>/.dsh/skills/t7-flow/SKILL.md`
   - B 此前**一次都没发过消息**。`pbots.skills({op:'list',botId:B})` → onBot 空、candidates 含 `{fromBotId:A,name:'t7-flow'}`
   - `enable` → `{name:'t7-flow'}`；随后测试直接把 A 的 SKILL.md 里 BODY_R 换成 BODY_R2（模拟「改库」）
   - B 的 fake 脚本：`skill {name:'t7-flow'}` → 文本收尾；给 B 发一条消息。断言：B 首次请求 `userTexts` 含 `t7-flow`（目录发现）；后续请求 `toolResults` 里该调用 `isError === false`、含 BODY_R、**不含** BODY_R2；A 的文件确实含 BODY_R2（改动是真的）
   - `disable` B 的 `t7-flow` → B 目录没了，A 的还在
3. 变异各红（贴原样输出，改完 cp 备份还原，不提交）：
   - M1：enable 改成在目标处建指向源目录的符号链接（引用而非复制）→ unit ③ 红、e2e「不含 BODY_R2」红
   - M2：去掉源树符号链接检查 → unit ⑥ 的符号链接格红
   - M3：上限按 `Buffer.byteLength` 计 → unit ⑤ 的 `中` 格红
4. 覆盖：app/ui 未装覆盖插件，不加依赖。以「每个错误码、每个校验分支至少一格」代替：回执列一张表「分支 → 格名」，经理对号。
5. 收尾：`ls -A $T/tmp | grep -v node-compile-cache | wc -l` → 0；独立 shell `pgrep -af 'bot-T7a' | grep -v pgrep` → 空；真实 `~/.agents` 仍不存在（`test -e "$(getent passwd $USER | cut -d: -f6)/.agents" && echo LEAK || echo ok` → ok）。
6. 改动面：`git diff --stat <起点>..HEAD` 只含边界第 1 条的文件。
7. 定向回测不坏：`$E pnpm --config.verify-deps-before-run=false exec vitest run tests/unit/m3` → 与起点同数全绿。

## 为什么这样验收
用户要的是「A 存的流程，B 能拿来用」，且原版语义是**复制**：真正要保住的是 ① B 拿到的是能被 dsh 发现并加载的 skill（e2e 看目录消息 + `skill` 加载，不是看文件在不在）；② 是快照不是引用（e2e 在 B 首次加载前先改 A 的源，B 仍读到旧正文；M1 用符号链接冒充复制，必须让这格红）；③ 这个 IPC 是渲染进程能调的写文件入口，路径穿越、符号链接、超大内容都要在 main 拦住（⑥ 每条拒绝都断言「目标无新增」，不是只看错误码）；④ 「按字符不按字节」「250 条」「-2 去重」是原版硬数字，M3 保证字符口径不是碰巧过的。B 在启用前不发消息，是为了让「首请求目录」这条断言不依赖 dsh 的增量刷新（那不是本单要测的）。

## 风险
- e2e 里给 A 发消息、读 fake 请求记录，app/ui 现有 support 可能没现成的读法：在 spec 内写一个小读取函数（照 sdk `skill-save.test.ts:122`），不改 support 文件；改 support 就停下写存疑。
- 若 B 首请求目录里没有 `t7-flow`（main 复制后 dsh 没发现），停下贴 B 首请求原始记录，不要改成「先发一条再查」绕过。
- bot 工作区祖先若有 `.git`，project 根会上移、多 bot 共享 skill（T6 风险项）；测试数据根在 /tmp 下无此问题，本单不处理。

## 产出
- 新建：`app/ui/main/skills/index.ts`、`app/ui/tests/unit/skills/index.test.ts`、`app/ui/tests/e2e/skills-enable.spec.ts`
- 修改：`app/ui/main/index.ts`、`app/ui/preload/index.ts`
- 回执：`work/tickets/receipts/T7a.md`（含先红输出、M1–M3 输出、分支 → 格名表）
