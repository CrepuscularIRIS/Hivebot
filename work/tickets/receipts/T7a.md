
## 附记：e2e 阻塞的完整诊断链（2026-11-06 05:46）

1. 现象：presets.yml 全产品组合（UI）下，bot 经 write 写 `<dataDir>/workspaces/<id>/.dsh/...` 被 `p2sdk-fs-guard: masked area (<HOME 或 dataDir 根>)` 拒；三种布局（dataDir 在 /dev/shm、$TMPDIR、$HOME 下）均复现，遮蔽根分别报 dataDir/HOME 根。
2. 豁免机制存在：`guard.mjs judgePath:165`——`opts.workspaceRoot !== undefined && under(workspaceRoot) → ok`（softRoots 分支内）。触发拒 ⇒ 调用时 workspaceRoot 为 undefined。
3. workspaceRoot 来源：`guard.mjs:284-295`——`ctx.get('sandboxPolicy').resolve({session: exec.agent.session}).workspaceRoot`，读不到/抛错 → 无例外全拒。
4. 对照组：T6（直连 SDK、同 runtime patch 含 guard、session/create 显式 cwd=WS、同绝对路径写）**成功零卡** ⇒ 该路径上 resolve 返回了正确 workspaceRoot。
5. 差异面只剩：UI 组合 = presets.yml + M1 包装（`orchestrate.ts:366` 确认 cwd 有传进 session/create request）+ launchSdkRuntime(cwd=workspaces)。断点在「policy.resolve 对该会话的返回」——需要插桩 guard/policy 打点定位（预期单：给 guard 加一次性诊断日志或写复现 spec 直连 vs M1 各建会话对比 resolve 结果）。
6. 影响：若确认 UI 组合下全部 bot 的 workspaceRoot 都解析失败，则**产品里所有 bot 都写不了自己工作区**（软遮蔽根覆盖 HOME/dataDir）——比 T7a 大得多的缺陷；若只是 presets.yml 某行遮住了 per-session 解析，改一行。

结论：e2e 与其 M1 变异格挂起（unit 侧 M1/M2/M3 已全验），交 manager 任务 B 裁决（开缺陷调查单 or 指 T9/T5 范围内处理）。

## 附记二：e2e 解阻与全链收口（2026-11-06 09:15）

阻塞根因=T14 同款（spec 数据根分叉，见 receipts/T14.md 结案附记）。按 launchAligned 对齐 + 信封拆包 + B 请求轮询后：**e2e 1 passed 全链绿**（A 存无卡→list/enable→改源→B 目录发现+加载旧文不含 BODY_R2→disable）。M1 e2e 变异（cp→symlink）红（EISDIR 于内容断言，同保证）；还原后复绿。**T7a 全部验收项达成**（验收 2 的 e2e、验收 3 的 M1 双侧、其余见正文）。

## 正文（T7a+T7ab 合并回执，补工单验收 6 要求的正文——经理指出原缺）

### 先红（T7a unit，实现为空导出时）
```
FAIL tests/unit/skills/index.test.ts > ① list…
TypeError: registerSkills is not a function → 8 格全红
```
### 先红（T7ab，⑨ 对旧实现）
```
× ⑨ 符号链接出界 … Error: expected error（errCode 收到 ok —— enable 对链接化 .dsh 返回 ok＝写出界实锤）
```
### 变异 → 红格对号（全部 cp 备份还原、未提交）
| 变异 | 红格 |
|---|---|
| M1 复制变符号链接 | ② ③ ④（unit）；e2e 侧 EISDIR 红（附记二） |
| M2 去源树符号链接检查 | ⑥ |
| M3 字符数按字节计 | ⑤ |
| M4 删「工作区本身非目录」判 | ⑩（首轮批跑假阴性＝bash 转义吞替换，单独重证） |
| M5 list 跳过 assertBotDir | ⑩ |
| M6 去逐层 lstat（本单修复） | ⑨ |
| M7 删 segments 的 staging 项（T7ac） | ⑪b/⑪c（原样：× ⑪ … 1 failed \| 10 passed） |
| M8 删 list 分支逐层检查（T7ac） | ⑪a（原样：× ⑪ … 1 failed \| 10 passed） |
### 分支 → 格名对号表
| 校验分支 | 格 |
|---|---|
| botId 正则 / 类型 / 穿越 | ⑥（'../x'）、⑩b、⑩c（botId:1） |
| 工作区 lstat 非目录（M4） | ⑩a（list/enable 源目标/disable 四路） |
| 工作区不存在 → not-found | ⑩b、⑥源缺、⑦ |
| botId===fromBotId | ⑥ |
| name slug / 类型 | ⑥（'A_B'、'../x'）、⑩c（name:1） |
| .dsh / .dsh/skills 逐层链接（M6） | ⑨a ⑨b ⑨c ⑨d + list 跳候选 |
| 源树含非常规项（M2） | ⑥ |
| 源 SKILL.md 非常规文件 + 目标无新增 | ⑥（per-case skillCount===0 已补，2026-11-06 09:41 更正虚记） |
| 256,000 字符按字符（M3） | ⑤（'中' 双口径） |
| 250 条上限 | ⑤ |
| 撞名 -2/-3 + frontmatter 改名 | ④ |
| 快照不联动（M1） | ③ + e2e「不含 BODY_R2」 |
| staging 不留半截 | ⑧ |
| 复制保真（含子目录文件，M1） | ② |
| 同名同字节候选剔除/异字节保留 | ① |
| disable 删副本源不动/不存在 | ⑦ |
| list 目标侧逐层（M8） | ⑪a |
| staging 层含悬空链接（M7） | ⑪b ⑪c |
| op 未知 | ⑩c |
### 收尾（验收 7）
三个施工残留（548446 dsh runtime 3h48m、两个 Xvfb）系此前多次失败快跑 e2e 的
electron/Xvfb 未随进程树退出——已 bot-reap 清零；本轮收尾 pgrep 净。

## 经理核实（任务 B，2026-11-06 @ d44ee165）
- 复跑：unit 10/10；m3 9 files/103；`pnpm build` + e2e skills-enable 1 passed；M6（三处 assertSkillLayers 调用全去）→ 仅 ⑨ 红；M4 → ⑩ 红；还原后 10/10、worktree 干净；`pgrep bot-T7a|bot-T14` 空。
- 探针（复制 index.ts 到隔离目录，node --experimental-strip-types）：P1 目标 `.dsh`→外部 enable 拒、外部空；P2/P2b disable 经链接化 skills（含 `.dsh`→vic→victim 链）拒、victim 原样；P3 源 `.dsh/skills`、源 `.dsh` 链接均不进 candidates、enable 拒、目标空。**成立。**
- 残留（→ T7ac）：P4 list 目标 `.dsh/skills` 链接 → `onBot:[{"name":"secret","description":"OUTSIDE-FRONTMATTER"}]`；P5 `.skills-staging`→外部 enable ok（瞬时出界写）；P6 `.skills-staging` 悬空 → `ENOTDIR` 未捕获 reject。
- 回执偏差：对号表「⑥（补断言）」不实（`index.test.ts:141` 后无断言）；变异只给表、无原样输出；M1 红格记 ②③④，上一任实测 ③⑤⑦（不影响结论，T7ac 回执按原样输出更正）。

## 附记三（T7ac，2026-11-06 09:41）

经理二验三发现全修：①list 目标侧过 assertSkillLayers（修前实测 onBot 吐 OUTSIDE-FRONTMATTER）；②staging 进 segments（悬空链接不再 ENOTDIR 逃逸、外部目录零写入）；③⑥ per-case「目标无新增」断言落盘、对号表补 ⑪/M7/M8 行并改正 ⑥ 虚记。⑪ 先红→11/11；M7/M8 各红⑪、M6 复证红⑨；e2e 1 passed、m3 103 绿、零残留。⑨d 测试补清 victim 链接（list 对链接化 bot 拒绝=新正确语义）。
