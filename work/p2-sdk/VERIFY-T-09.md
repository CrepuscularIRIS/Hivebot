# VERIFY-T-09 · D6 市场连接器验收（真实源 + 真实连接器 + X/Y 隔离）

verdict: **PASS**
commit: `4240ab44118160db567dae4c66797ecf5d189de6`（feat/T-09 head，= 32bec17 + 4240ab4，基 d0a8008）

- 验收人：verifier（GLM 5.3），2026-11-02 10:02–10:17
- 验收方式：独立 detach worktree（/tmp/bot-wt/T-09-vfy @4240ab4，验收后已删）干净 setup + 全量；builder 现场 /tmp/bot-wt/T-09 全程未动（收尾复核仍 clean @4240ab4）。GPU 训练约束下全串行 `--no-file-parallelism`，测试 HOME 走 /tmp 临时目录。无 UI 环节，无截图需求；未手工杀任何进程。
- 在线复核（registry/npm refetch）在宿主网做；测试运行在 netns 隔离内做，两不相扰。

## 连接器替代裁定（重点项）

**换选正当，证据链完整，裁定接受。**

1. **可复现性（字节级）**：复跑两条查询，`?limit=100&version=latest` → sha256 `cac24c56…`（count 100）、`+&search=filesystem` → `85538caa…`（count 11），与 `fixtures/market/source.json` 记录**逐字节一致**；并集去重 100+11=111 = pluginCount。再用仓内原脚本 `node scripts/fetch-market-fixture.mjs --force` 对活源重放，生成的 index.json 与 committed fixture **diff 为空**（INDEX-REGEN-IDENTICAL）。N=111 是实测值不是手挑。
2. **条目真实 + stdio + 官方**：registry 条目 `io.github.bytedance/mcp-server-filesystem` 在 search 响应内；packages[0] = npm `@agent-infra/mcp-server-filesystem`、transport `stdio`、packageArguments 命名参数 `--allowed-directories`（与测试启动参数一致）；`_meta…official` **status=active**。npm 侧：包真实存在，latest=1.2.29=devDep 钉版，maintainers 含 bytedance 域（zhaoheh@bytedance.com），repo=bytedance/UI-TARS-desktop；已装包自身 package.json 带 `mcpName: "io.github.bytedance/mcp-server-filesystem"`（npm 包↔registry 条目直接绑定）。
3. **偏离正当**：任务预设 `@modelcontextprotocol/server-filesystem` 在 page ∪ search 全集 **0 命中**（任何含 filesystem+modelcontextprotocol 的变体都没有）——预设名不在源中，D6 R-5「真实存在于源中」强制换选；换选过程有 source.json 核实记录且本次独立复现吻合。

## 验收项

| 验收项 | 结果 | 证据（evidence/T-09/） |
|---|---|---|
| ① 干净全量 119/119（--no-file-parallelism） | PASS | `full-4240ab4.log`：空 node_modules 起步，`pnpm setup`（frozen，exit 0，"Lockfile is up to date"）→ 18 文件 / **119 用例全绿，EXIT=0**（90.7s） |
| ② $OFFLINE 等价式复跑 | PASS | `offline-4240ab4.log`：`unshare -rn` 内 `ip link set lo up` → **CURL-RC=6**（只认 6/7，断网实锤）+ 仅 lo 网卡（NETNS-ONLY-LO-OK）→ **119/119，OUTER-EXIT=0**。连接器包、fixture、市场索引全部本地供给 |
| ③-1 替代复核·可复现性 | PASS | `registry-reverify.txt`：refetch sha256 与 source.json 两条全对上；100+11=111；原脚本 --force 重放 index.json 与 committed **逐字节一致** |
| ③-2 替代复核·条目/npm/stdio | PASS | `registry-reverify.txt` [3] + `npm-reverify.txt`：stdio、identifier=钉版包、official active、bytedance 官方、latest=1.2.29 |
| ③-3 替代复核·偏离正当 | PASS | `registry-reverify.txt` [2]：预设 @modelcontextprotocol/server-filesystem 全集 0 命中 → 按规则必换 |
| ④-1 ①语义：search 分页 ≥111 且条目在列 | PASS | `market.test.ts` ①（`verbose-market.log` 绿 464ms）：offset 0+100 两页取回，total≥111、entries≥111、connector 在列且 **title=原始 registry 名**（源身份不被映射改写）、listIndexes=[indexUrl] |
| ④-2 ②语义：installBundle enabled:false | PASS | `verbose-market.log` 绿 97ms：install options `{enabled:false}`、listBundles 行 `@p2sdk-real/filesystem` enabled=false |
| ④-3 ③语义：X 工具表/Y 隔离/真实调用 | PASS | `verbose-market.log` 绿 880ms：X request/header 工具表含 `mcp__filesystem__read_file`；Y 两次探测 mcp__* 全空；X 流中 tool/call（含工具名）+ tool/result（含 `p2sdk-d6-connector-evidence`——该串只写进 hello.txt，fake 脚本只引用路径不含内容，结果里的内容必来自 stdio server 真读文件） |
| ④-4 preset.ensure 重建 id === X 冻结 id | PASS | `verbose-market.log` 绿 13ms：X header agentPreset 匹配 `^p2temp-`，`p2temp/preset.ensure` 返回 presetId 与冻结值全等（T-16 锚点） |
| ⑤ devDep 取舍：无新增 setup 步骤、vendor 不进 git | PASS | `setup.log` + `area-check.txt`：package.json 仅 +1 行 devDep（scripts 未动，setup 仍单条 `pnpm install --frozen-lockfile`，干净树 exit 0）；`git ls-files` node_modules 0 条、.gitignore 覆盖；diff 无 vendor 目录（23MB vendor 方案确未采用） |
| ⑥ 区域：diff=申报 7 文件 + 映射确定性说明 | PASS | `area-check.txt`：`git diff d0a8008..4240ab4` 恰 7 文件（package.json、pnpm-lock.yaml、fetch-market-fixture.mjs、index.json、source.json、market-source.yml、market.test.ts）；toNpmName 确定性说明在 script :52-68（小写→scoped→非法字符折叠→dsh regex 校验，抓取时另有碰撞 guard :93-95，原始名保留在 title）；静态核对 111 名全 unique、全过 npm regex、0 碰撞 |
| 坏路径：真实连接器包缺失必须红 | PASS | `red-no-connector.log`：改名移除 node_modules 内真实包 → market.test.ts **EXIT=1**（realpathSync dist ENOENT，4 用例全挂/跳过）；恢复后绿。测试不可能在无真实包时假绿 |

## 结论

①–⑤ + 替代复核（3 子项）+ devDep 取舍 + 区域 + 坏路径全部 PASS，verdict: **PASS**。

## 新问题（不阻塞合并）

- [记录] 派发与 LOG 中「npm 2026-05 发版」表述不准：1.2.29 实际发布 **2025-12-15**，2026-05-14 是 npm 元数据 modified 时间；「active」的准确出处是 registry `_meta official.status=active`（本次已核实为真）。不影响判定：包为 bytedance 官方、钉版=latest、e2e 实测可跑。
- [记录] 快照可复现性依赖上游当日未变——本次恰逢逐字节吻合；日后 regen 若源漂移，fetch 脚本的 connector-absent guard（fetch-market-fixture.mjs:88-90）与测试 ① 的 title 断言都会显式红，属预期防线，无需修复。

## 证据清单（work/p2-sdk/evidence/T-09/）

- `full-4240ab4.log` — 干净 detach 全量 119/119，EXIT=0
- `offline-4240ab4.log` — $OFFLINE 等价式 119/119（CURL-RC=6、仅 lo）
- `red-no-connector.log` — 坏路径：缺真实包全红 EXIT=1
- `setup.log` — 空 node_modules 冻结安装 exit 0（devDep 1.2.29 就位）
- `registry-reverify.txt` — registry 复现（sha256/计数/条目明细/重放一致）
- `npm-reverify.txt` — npm 包核实（latest=钉版、维护者、仓库）
- `verbose-market.log` — market.test.ts 四用例逐条绿
- `area-check.txt` — 7 文件 diff、node_modules 零跟踪、映射确定性
