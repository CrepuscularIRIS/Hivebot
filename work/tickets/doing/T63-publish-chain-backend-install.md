# T63：发布链修漏——公开仓 clone 后 `./install.sh` 一条命令让 `hivebot serve` 起得来

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`work/install-oneclick/BRIEF.md` 要点 2（「start mjs 都是没有的」）；`work/install-oneclick/PLAN.md` I1
> 分支 / 作业目录：feat/T63（只改两个脚本 + 一份 README，可直接在集成分支旁开小分支，不需 worktree）
> claimed：2ea6491c（feat/T63，2026-11-11 验收 1-7 全过待批审）
> accepted：

## 目标
公开仓少文件的根因是 `scripts/publish-hivebot.sh` 的 rsync 排除项**没锚定**：`--exclude=scripts` 匹配任意层级的 `scripts/` 目录，于是 `app/sdk/scripts/start.mjs`（launcher 第 21 行要的 SDK 启动器）、`app/ui/scripts/{stage-renderer,check-win-package}.mjs`、`app/ui/renderer-grok/scripts/*` 全被吃掉（公开仓 main e21b6312 的树里确实都没有，gh api 已核）。`docs` / `work` / `out` / `evidence` 同病。修好它，并让 `install.sh` 默认走「后端可用」这条真能跑通的路。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `scripts/publish-hivebot.sh`（全文 47 行）、`install.sh`（全文 56 行）、`docs-public/LICENSE-SCOPE.md`（法律排除的依据，**排除范围一条都不许少**）
3. `app/launcher/hivebot`（serve 只需 SDK，84-85 行跳过 UI 产物检查）、`app/ui/tests/e2e/launcher-serve.spec.ts`（起 serve 的隔离 env 照抄这里）

## 方案（定死，不另选）
1. **只发 git 跟踪的文件**：rsync 改用 `--files-from=<(git -C "$SRC" ls-files)`（或等价的 `git ls-files` 管道），根目录杂物（x-*、vfy-*、*.log、panels、.vendor-tmp）自然不进，删掉那段杂物排除清单。
2. 剩下的排除**全部锚定**（rsync 以 `/` 开头 = 相对源根）：法律四项照旧 + `/work` `/docs` `/repos` `/scripts` `/.claude` `/.codegraph` `/CLAUDE.md` `/docs-public`；另把跟踪中的内部目录 `app/ui/work/`、`app/sdk/evidence/` 显式排除（原来是被未锚定规则「顺手」排掉的，锚定后要补上）。
3. `--delete` 目标侧行为不变（保留 `.git`）。
4. `install.sh`：默认路径 = 后端可用——检查 node/pnpm → `pnpm -C app/sdk install --frozen-lockfile` → `ln -sfn "$PWD/app/launcher/hivebot" ~/.local/bin/hivebot`（`mkdir -p` 先）→ 打印下一步（`hivebot serve`；Windows 侧见 README）。原「2/4 外部资源」「3/4 壳依赖」移到 `--full` 参数后（公开仓 clone 拉了 0.18 也拼不出 UI，见 PRIVATE-LAYER.md；默认不拉无许可证的树）；删掉「4/4 构建检查」那条跑 live 单测再吞错误的步骤（它什么都没检查）。
5. `docs-public/README.md` 的安装段改成上面这条路径（Linux / Ubuntu 后端）；Windows 段留一行「见 T65，开发中」占位即可。

## 边界
1. 只动：`scripts/publish-hivebot.sh`、`install.sh`、`docs-public/README.md`。别的不碰；**不 commit 到公开仓、不 push**（CLAUDE.md 硬约束），发布由用户跑。
2. 先红：在改脚本前跑验收 1，`start.mjs` 那条必须 FAIL，原样贴进回执。
3. 冒烟走隔离 HOME / TMPDIR / XDG_*，DBus 指向不存在路径；`~/.local/bin` 是隔离 HOME 下的。起的进程用 `~/bot/scripts/bot-reap` 收。
4. 凭证不进日志：冒烟里 `serve --connect` 的输出只断言前缀 `HIVEBOT-CONNECT`，回执里把 token 字段打码。

## 验收（写命令，不写感觉）
设 `T=$(mktemp -d)`；`bash scripts/publish-hivebot.sh $T/pub`。
1. **必需文件在**：`for f in app/sdk/scripts/start.mjs app/ui/scripts/stage-renderer.mjs app/ui/scripts/check-win-package.mjs app/ui/renderer-grok/scripts/inject-shim.mjs app/sdk/pnpm-lock.yaml install.sh scripts/publish-hivebot.sh LICENSE README.md; do test -f $T/pub/$f || echo MISSING $f; done` → 无输出。
2. **法律排除仍在**：`find $T/pub \( -path '*renderer-grok/frontend*' -o -path '*renderer-grok/source*' -o -path '*renderer-grok/assets*' -o -path '*renderer-grok/harness*' -o -path '*pet/assets/fish/*.webm' -o -name CLAUDE.md -o -path "$T/pub/work*" -o -path '*app/ui/work*' -o -path '*app/sdk/evidence*' -o -path "$T/pub/repos*" \) | wc -l` → `0`。
3. **只有跟踪文件**：`comm -13 <(git ls-files | sort) <(cd $T/pub && find . -type f | sed 's,^\./,,' | sort) | grep -vE '^(README|CHANGELOG|DEVLOG|LICENSE)(\.md)?$|^docs/'` → 无输出（顶层面板文件之外，没有任何未跟踪文件混进去）。
4. **与现公开仓对比**：`gh api 'repos/CrepuscularIRIS/Hivebot/git/trees/main?recursive=1' --jq '.tree[]|select(.type=="blob").path' | sort > $T/old; (cd $T/pub && find . -type f | sed 's,^\./,,' | sort) > $T/new; comm -23 $T/old $T/new; echo ---; comm -13 $T/old $T/new | head -50` → 回执原样贴两段。「旧有新无」那段**每一行都要在回执里说明为什么该删**（预期只有因 HEAD 演进而删的文件）；「新有」段应能看到第 1 条那些 scripts 文件。
5. **端到端冒烟**（隔离 env 照 launcher-serve.spec.ts）：`cd $T/pub && HOME=$T/home ./install.sh` → exit 0 且 `test -L $T/home/.local/bin/hivebot`；随后 `$T/home/.local/bin/hivebot serve` 后台起 → 60s 内 `hivebot serve --status` exit 0；`hivebot serve --connect | cut -c1-16` → `HIVEBOT-CONNECT…`；TERM serve 后 `bot-reap` 收尾，`pgrep -f $T/pub` 为空。
6. **变异**：把 `/scripts` 改回不锚定的 `scripts` → 验收 1 报 `MISSING app/sdk/scripts/start.mjs`；回执贴红输出后改回。
7. `bash -n scripts/publish-hivebot.sh install.sh` → exit 0；`shellcheck`（若本机有）无 error 级。

## 为什么这样验收
用户的原话是「clone 下来装不起来」——过了第 1 条但第 5 条起不来，等于没修。第 2 条防止修漏的同时把不能分发的 0.18 树和 CC BY-NC-SA 形象带出去（这比少文件严重得多）。第 3、4 条防止换成「全推」后把工作区杂物或内部文件推上去，也防止悄悄删掉公开仓现有内容。第 6 条确认第 1 条真的会因为这个 bug 变红，而不是恰好过了。

## 不在本单
- Windows 一键（T64 / T65）；`--full` 的 UI 拼装能否真拼出来（PRIVATE-LAYER 的 patch 化，未排）。
- 公开仓上 83 个开发分支的处理（Q-053，等用户）。

## 产出
- `scripts/publish-hivebot.sh`、`install.sh`、`docs-public/README.md`
- 回执 `work/tickets/receipts/T63.receipt.md`（贴 1–7 原样输出，token 打码）
