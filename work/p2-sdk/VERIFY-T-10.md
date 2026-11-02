verdict: PASS
commit: 8889e9d9cd60245f2db835263a7622564b11b816（worktree /tmp/bot-wt/T-10，验收时 HEAD 一致，工作区干净）
验收时间：2026-11-02 10:26–10:31（date 实测）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| ① README 三节齐全：setup / 启动（12 项 P2SDK_* 表 + LiteLLM 示例）/ 临时扩展（两方法签名 + P2-TEMP + connector-unavailable 形状） | PASS | `/tmp/bot-wt/T-10/app/sdk/README.md`：setup L7–21（一条命令 + 钉版 + devEngines Node）；启动 L23–65，LiteLLM 示例 L44–48，变量表 L52–65 恰 12 项；临时扩展 L67–88，签名 L72–73、P2-TEMP 标记 L69、错误形状 L83–85 |
| ① 抽查 3 个变量名与 src/start.ts 实际读取一致（超额查全 12 项） | PASS | 10 项在 `src/start.ts`：P2SDK_PROVIDER L49、P2SDK_LLM_API_KEY L50、P2SDK_READY_TIMEOUT_MS L65、P2SDK_PORT L63、P2SDK_LLM_BASE_URL/MODEL 默认值 L32–33 等；P2SDK_MARKET_INDEXES / P2SDK_MARKET_SOURCE_INDEXES 由 `profile/patches/market.yml` L24 / `market-source.yml` L18 读取（README 表描述与 yml 用法一致）。start.ts L127 的 `P2SDK_LLM_API_BASE` 是启动器写给子进程的内部变量、非输入，不入表正确 |
| ② INDEX.md D1–D8 链接逐条可达 | PASS | `evidence/` 下 D1.md D2.md D3.md D4.md D5.md D6.md D7.md D8-approval.md T-12.md 逐个 `[ -f ]` 全 OK（本 commit 新增 D3–D7+INDEX，D1/D2/D8-approval/T-12 为先前 commit）；表内 17 个 VERIFY-*.md 与原始输出（含 `setup-local.*`/`t06-badpath-restart.*` glob 与 T-01.f3/T-09/T-12-verify/T-12.f1/T-16 子目录）抽查 19 处全部存在 |
| ② 签名一致性自检复跑（应为空 diff） | PASS | `diff <(sed -n 's/^- \`(p2temp/[^\`]*)\`\$/\1/p' README.md) <(sed -n 's/^\/\/   (p2temp\/.*)\$/\1/p' src/p2temp/index.mjs)` → 空 diff，两侧各匹配 2 行（非空匹配）；留证 `work/p2-sdk/evidence/T-10/signature-diff.txt` |
| ③ 区域：纯新增 7 文件，不动 src/tests/profile | PASS | `git show --name-status 8889e9d`：7 文件全 A 状态（README.md + evidence/D3–D7 + INDEX.md），196 insertions / 0 deletions，无 src/tests/profile 路径 |
| ④ package.json scripts 存在性 | PASS | `package.json` scripts：setup=`pnpm install --frozen-lockfile`、start=`node scripts/start.mjs`、test=`vitest run`、test:coverage=`vitest run --coverage`，与 README 引用的 4 条命令一一对应 |
| 坏路径：文档-代码漂移（README 声称的默认值与错误形状 vs 实现） | PASS | 默认值 4 处实测一致（BASE_URL=127.0.0.1:4001、MODEL=glm-5.3-flash、PORT=0、READY_TIMEOUT=60_000，src/start.ts L32/33/63/65）；connector-unavailable 形状：`new RemoteError('p2temp/connector-unavailable', message, {connector: name})`（src/p2temp/index.mjs L98）与 README「details.connector = bundle 名」一致 |

新问题（每条一行，可直接成为修复任务）：
- [DOC] 签名自检命令未随仓记录：INDEX.md / README / work 均无该命令原文，本次按 PLAN T-03③ 口径重新构造，且首个正则版本两边 0 匹配产生假阴性空 diff | 复现：在 README 或 evidence/INDEX.md 搜「自检/diff」无果 | 疑似位置：app/sdk/evidence/INDEX.md（建议把 signature-diff.txt 中的命令抄进 INDEX 尾注） | LOW
- [DOC] INDEX「原始输出」列用 glob 记法（`setup-local.*`、`t06-badpath-restart.*`），机械按 .txt 拼接会 miss（实测存在 .out/.time/.mjs 后缀） | 复现：`ls work/p2-sdk/evidence/setup-local.txt` → 不存在 | 疑似位置：app/sdk/evidence/INDEX.md D1/D5 行 | LOW

备注：纯文档零代码改动，按派发指令未跑全量测试；证据目录 `work/p2-sdk/evidence/T-10/`（仅 signature-diff.txt）。本 VERIFY 写于主仓 work/，属验收员允许写入范围。
