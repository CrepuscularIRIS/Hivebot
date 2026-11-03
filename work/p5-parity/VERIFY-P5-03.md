# VERIFY · P5-03（0c plugin_manager 移除）

verdict: PASS
commit: 1ff7c17（worktree /tmp/bot-wt/P5-03，验收时 HEAD 无漂移，worktree pristine）

## 验收环境

独立复跑，HOME=/tmp/bot-p503-vfy（临时）；复跑前清空 builder 留下的 `/home/lingxufeng/bot/.test-homes/p5-03`（决策 8 固定路径约定，P5-01/P5-02 同款）。所有红基线实验后已用 `git checkout 1ff7c17 --` 精确恢复，worktree 终态干净。

| 验收项 | 结果 | 证据 |
|---|---|---|
| ① 每个会加载的 preset 默认会话工具表不含 plugin_manager | PASS | 亲跑单文件 `pnpm exec vitest run tests/e2e/guard-plugin-manager.test.ts` 4/4 绿。断言在 llm/stream 记录侧（approval.yml 自带 recorder overlay），standard（默认）/cordis/ptc/minimal 四会话全覆盖。红基线：approval.yml 截回基点 a3ccb97 状态 → ① 红，报 `expected [ 'ask_user_question', 'bash', …(29) ] to not include 'plugin_manager'`（31 工具含之，与 REPORT 申报一致），drift 同时红（摘块变体）；恢复后绿 |
| ② 后层 patch 重启用后三 action（list_plugins / 停 p2sdk-shell-ask / install_bundle）全拒 | PASS | 断言抽读（test.ts:315-333）：`asked === 0`、`results.size === 3`、每个 result `isError === true` 且原因同时含 `p2sdk-fs-guard` 与 `plugin_manager`、`$DSH_HOME/profiles` 树 + `runtime-patch.yml` sha256 前后相等；且前提自证（test.ts:330）：reenable 后工具表确实出现 plugin_manager → 拒绝来自 guard 而非工具缺席。亲跑 4/4。快照非空证明：runtime home（mkdtemp p2sdk-runtime-*）实测含 `profiles/web/` 树与 `runtime-patch.yml`，非空集恒等的假绿。PLAN 写 `$DSH_HOME/profile`，实际路径为 `profiles/web`（REPORT 已注明，快照取整个 profiles 树为超集，覆盖成立）。红基线期间 ②③ 在摘块状态下仍绿——两道防线独立 |
| ③ 差分：stock（禁 p2sdk-fs-guard）下同一 list_plugins 产生 approval/asked | PASS | test.ts:335-369：stock+reenable 下 `approval/request` 出现、作答 rejected、`asked ≥ 1`、turn 结束后快照不变。亲跑 4/4 |
| drift 用例有效性（覆盖块=上游文件仅翻一键） | PASS | 改键变体亲测：preset-standard 块 `maxBytes: 65536→65535`（sed 单点改）→ drift 红（`覆盖块与上游一致` 断言失败）；`git checkout` 恢复 → drift 绿。摘块变体见 ① 红基线（同用例第二路径） |
| 机制抽验（--dump-config 亲自跑） | PASS | `DSH_HOME=/tmp/bot-p503-vfy/dshhome pnpm exec dsh web --dump-config` 基线 vs `--patch approval.yml` 各跑一次，diff 全量核对：preset-standard 与 preset-cordis 各恰一行 `disabled: !!js '!ctx.get(''profileContext'')'` → `disabled: true`，块内其余零差分；preset-ptc 上游本就 `disabled: true`（ptc.patch.yml:128），覆盖为 no-op（合成树保持 true）；preset-minimal 无 tool-plugin-manager 行、未覆盖（正确）；顶层 dsh-base 行（dump 第 4 行）web bundle 本就 `disabled: true`——实证「裸 id 覆盖只够到顶层行」的机制论述。dump 落 /tmp/bot-p503-vfy/dump-{base,patched}.txt |
| 区域与顺序 | PASS | `git diff --stat a3ccb97..1ff7c17`：恰 3 文件 +819（approval.yml +398、guard.mjs +11、guard-plugin-manager.test.ts +410），与申报一致，无越界。guard.mjs:193 NEVER_TOOLS 判定是 `tools/pre-execute` handler 第一条语句；approval.yml:22-25 p2sdk-fs-guard 挂在 p2sdk-shell-ask 之前（waterfall 最前，P5-02 既有排布未动） |
| 全量回归（不信 builder 输出） | PASS | `HOME=/tmp/bot-p503-vfy pnpm test`（清空测试 HOME 后）：**28 files / 227 tests 全绿**，37.7s，与申报一致 |

## 独立性/坏路径补充

- 摘掉第一道防线（approval.yml 覆盖块）后 ②③ 仍绿：guard 名字 NEVER 单独扛住重启用后的三 action——两道防线互为冗余得证。
- 全量跑出现一行 `WARN p2sdk: PBOTS_DATA_DIR unset, assuming /home/lingxufeng/.config/pbots-ui`：仅 stderr WARN，`/home/lingxufeng/.config/pbots-ui` 不存在（未写真实 HOME），系 launcher 既有缺省行为（P5-06 ⑦ 专测项），非 P5-03 引入。

新问题（每条一行，可直接成为修复任务）：
- [FIX] e2e 套件从不清理 /tmp/p2sdk-runtime-*、/tmp/p2sdk-handoff-*，/tmp 已积 3020 个残留目录（本验收另产生 122 个，已自清） | 复现：跑任一 sdk e2e 后 `ls -d /tmp/p2sdk-runtime-* \| wc -l` | 疑似位置：app/sdk/tests/support/runtime.ts（afterAll 只 stop 不 rm） | 严重度 LOW
