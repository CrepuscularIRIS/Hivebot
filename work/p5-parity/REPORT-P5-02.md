# REPORT · P5-02（0b 文件工具凭证 NEVER，默认拒）

- 分支：`feat/P5-02`（worktree `/tmp/bot-wt/P5-02`，基点 main@93cbc7b；主会话合并时只取 `app/sdk/` 下文件清单，`work/` 的 diff 差异来自其后合并的 P5-01.f1，不属本任务）
- commits（3，前缀 `feat(p5)`）：`e0975a7` guard.mjs 判定核心 + containment.mjs → `dd6b5a2` guard 行接线（never-roots guardRoots + runtime patch + approval.yml 插序）→ `e0f6b01` 验收 ①-⑨ e2e + 启动 fail loud + 三处接缝更新
- 改动（app/sdk，11 文件 +1264/-56）：
  - 新：`src/policy/guard.mjs`（pre-execute 插件）、`src/policy/containment.mjs`（isPathUnder 复制，文件头注明 `来源: deepseek-harness@ce7073d5:packages/fs/fs-sandbox/src/containment.ts`）、`tests/unit/{guard,containment}.test.ts`、`tests/e2e/guard-fs.test.ts`
  - 改：`src/policy/never-roots.mjs`（computeRoots 增 `guardRoots {hardRoots, dataMaskRoots}`，`/proc` 进 guard 硬 NEVER——不进 wrapper 清单，遮掉 /proc 会砸沙箱自己的 procfs）、`src/start.ts`（writeRuntimePatch 增 guard 行；dsh stderr 改 pipe 转发 + 激活失败签名监测）、`profile/patches/approval.yml`（insert `p2sdk-fs-guard` 排在 `p2sdk-shell-ask` 之前，决策 2）、`tests/unit/{start,never-roots}.test.ts`、`tests/e2e/{mock-demo,sandbox-hardened}.test.ts`（接缝，见下）
- 复用（REUSE 行）：`ctx.fs.resolve`（第 1 级运行时服务，决策 3——**实证 pre-execute ctx 可拿 `fs` / `workingDirectory` / `sandboxPolicy`**）；isPathUnder 第 3 级复制；`tools/pre-execute` 扩展点第 1 级；NEVER 清单与 wrapper 单源 `never-roots.mjs`（决策 6，未抄第二份）

## 实现口径（决策 13 ①-④ 的 guard 侧划分）

- **① hardRoots**（读写拒、例外不越过）= 凭证实根（computeRoots credentialConcrete，含工具链内 .condarc/aau_token）+ 整个 `/proc` + `/run/user/<uid>` + DSH_HOME + handoff（含宿主 siblings）+ `/etc/ppp` 两项 + 数据根的 policy-state/standing-grants（显式，不依赖存在）
- **① 的「mask 根顶层条目」**：非 HOME 的数据 mask 根（dataDirs、P2SDK_SANDBOX_MASK、DSH_HOME、handoff、run/user）的顶层直接子条目除 `workspaces` 外全部硬 NEVER（guard 侧 `expandTopEntries`，apply 时展开一次；启动后新建顶层文件由 ③ 整棵软遮蔽兜底）。**HOME 不做顶层展开**——HOME 整棵走 ③（否则 ⑥ 的生产布局 `~/.config/<app>/workspaces/X` 与 HOME 下普通工作区会被 ① 卡死，例外不越过 ①）
- **③ softRoots** = homes ∪ dataMaskRoots 整棵；例外两种：`sandboxPolicy.resolve({session}).workspaceRoot` 子树（= 会话创建时 header.cwd，不可被 working_directory 改动；v2.1 不取 /tmp、os.tmpdir()、additionalWritableRoots）读写放行；工具链白名单只读。例外不越过 ①②
- **② policyRoots** 写拒读放行；判定序 ①→②(write)→③
- **决策 7 祖先判定**：target 与任一 ①③ 根做双向 isPathUnder（`grep path=$HOME`、`grep path=/` 由此被拒）
- 路径一律先 `ctx.fs.resolve(raw, {cwd})` 取 targetKey（realpath 解符号链接 → ②的两格；含 `~` 展开）；cwd 取当前会话工作目录（可被 cd 改动），例外用不可变 header.cwd 投影——cd 不扩大例外（④ 的两格）
- 入口：read/read_image/write/edit（file_path）、grep（path，缺省 `.`）、glob（path + pattern 静态目录前缀候选：`..` 段/绝对前缀归一到搜索根外）、present（files[].path）。guard 内无任何 approvalPolicy 分支；TOCTOU 窗口已写 `ponytail:` 注释

## 验收 ①-⑪（`tests/e2e/guard-fs.test.ts` 逐 it；真实 launcher + fake LLM，HOME=.test-homes/p5-02）

| # | 结果 | 要点 |
|---|---|---|
| ① | PASS | 9 类哨兵（HOME 凭证/.codex 点目录/另一 bot 工作区/数据根顶层/DSH_HOME/handoff//proc//run/user//etc/ppp）× 7 入口：全 deny（isError + `p2sdk-fs-guard:` 原因 + asked===0）、写类 sha256 不变；逐格 stock 差分。**差分口径**：read/glob/grep/present 断「stock 成功且读到哨兵」；write/edit 是既有防护命中（§2——上游 workspace-write fence 两侧同拦，差分只证错误不来自 guard，不落盘）；read_image 受模型图像能力校验影响（r4 #4），只证不被 guard 拦；真凭证类别不读内容 |
| ② | PASS | 两格：加固会话 bash（审批 allowed-once 后）`ln -s $HOME/.ssh k` → read `k/sentinel-key` deny；宿主预置 `masklink -> DATA_DIR` → read `masklink/top-sentinel` deny |
| ③ | PASS | grep path=$HOME、glob path=$HOME、grep path=/ → deny；grep path=$CWD 正常返回（命中 marker） |
| ④ | PASS | `read ~/.ssh/x`（~ 展开到 env HOME）、`working_directory` cd $HOME 后 read `.ssh/x`、cd `~/.codex` 后 read `x` → 都 deny；glob `../.ssh/*` 与绝对 pattern 指向哨兵 → deny |
| ⑤ | PASS | env 注入 `P2SDK_X_AUTH`（P2SDK_ 前缀经 childEnv 白名单透传）；grep `/proc/self/environ`、`/proc/<dsh pid>/environ` → deny、asked 0；差分 stock grep runtime pid environ **输出含哨兵值** |
| ⑥ | PASS | workspaceRoot=$DATA/workspaces/X：read/write 本工作区成功；同级 other-bot、数据根顶层、policy-state.json → deny；工具链白名单内非凭证文件 read 成功、write deny（sha 不变）；`.condarc` read deny；数据根在 /tmp（mkdtemp）下：本工作区 read 成功、`workspaces/Y` deny（例外只取 header.cwd 子树，P5-06 ⑦ 两格已自查） |
| ⑦ | PASS | cwd=PKG_ROOT：edit `src/policy/guard.mjs`、write `sandbox/bwrap-wrap.py` → deny、sha256 不变；read 二者成功（② 硬写保护只拒写） |
| ⑧ | PASS | read 普通工作区相对路径与 `/etc/hostname` 成功（不越界收紧） |
| ⑨ | PASS | 后置 overlay 把 guard 行 config 覆盖为空 → **launcher 1.6s 非零退出**，stderr `p2sdk: guard plugin failed to activate; not serving: p2sdk-fs-guard (...) Error: config.roots is required...` |
| ⑩ | PASS | `tests/unit/containment.test.ts`：`..`（非 canonical 保守 lexical + 符号链接身份比对）、大小写、末尾斜杠、缺失目标 |
| ⑪ | PASS | `pnpm -C app/sdk test` 27 files / **223 tests 全绿**；app/ui build ✓ + 单测 28 files / 245 ✓ + e2e **61 passed**（6.7m） |

## 接缝更新（main 已有测试随行为更新）

1. `mock-demo.test.ts` ①：env-derive 读 `$DSH_HOME/launch-token` 原靠「文件不存在」（FS_NOT_FOUND），现被 guard 先拒（DSH_HOME 是 hardRoot）——防御更强，断言改为「相对读仍 FS_NOT_FOUND + env-derive 读含 p2sdk-fs-guard」，token/handoff 路径仍不进 transcript。
2. `sandbox-hardened.test.ts` ⑧：P5-01 的「guard.mjs 未被创建」断言随文件落地失效，删该行（写保护由同用例 sha 断言 + guard-fs ⑦ 共同证明）。注：P5-01.f1（main@0b730c8）也改了该用例的布局分支断言，不同行，可自动合并。
3. `never-roots.test.ts` 增 guardRoots 划分断言（含「HOME 不进 dataMaskRoots」）。

## 坑与取舍（给后续任务）

1. **cordis 对插件激活失败只 warning 继续跑**（`dsh: warning: 1 entry did not activate`）：guard 行缺失的 fail loud 无法在插件层实现——落在 launcher（start.ts 把 dsh stderr 从 inherit 改 pipe，监测 `p2sdk-fs-guard (...) Error:` 签名，ready 后 3s 窗口查到即 SIGTERM + 退出码 1 + 原因进 stderr）。P5-03/P5-04 若有「行缺失 → 启动失败」验收，同机制可用（签名可扩）。
2. **判定输入是 resolve 后的 targetKey**（realpath）：真实路径优先正合决策 3；副作用是 read 不存在路径会 realpath 到最近存在祖先（`/tmp/launch-token` 判 `/tmp/launch-token`，不误伤）。
3. **guard 侧 /proc 与 wrapper 侧清单分离**：`/proc` 只进 `guardRoots.hardRoots`（bwrap 的 `--proc` 挂的是沙箱自己的 procfs，遮宿主 /proc 会把沙箱内 /proc 一起砸掉）；neverRoots（wrapper 消费）未动。
4. **write/edit 差分是既有防护命中**：stock 的 fs-sandbox workspace-write fence 本来就拒工作区外写——两侧各自断错误来源即可，别为差分去关上游 fence。
5. flake 备注：`never-roots.test.ts`「本机真实布局」在全量并发时偶发一次红（宿主 /tmp 现存 handoff 目录数变化）、复跑两次均绿；与 P5-01 报告的 launcher-lock 并发 flake 同类，未再追。

状态：待 verifier 验收。
