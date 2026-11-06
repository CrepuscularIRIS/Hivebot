# T8b：T8 返修——interrupt.test.ts 解析错 + security/ 子目录 3 处漏改

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：T8 终验不通过 第 1 次（`doing/T8-p5h5b-e2e-mkdtemp.md` 末尾「终验」节）
> 分支 / 作业目录：在 feat/T8 上续提交（同一 worktree 重建即可：`git worktree add /tmp/bot-wt/T8 feat/T8` + `pnpm setup`）
> claimed：
> accepted：

## 目标
把 T8 改坏的一个文件修回来，补上漏掉的子目录，让「全 e2e 能收集、私有 TMPDIR 零残留」真成立。

## 经理发现（均已在 feat/T8 @ 883617d9 实证）
1. **`app/sdk/tests/e2e/interrupt.test.ts:20-21` 解析错**：`import { tmkdir } …` 被插进了多行 `import {` 块里面。`vitest list tests/e2e/interrupt.test.ts` → `Transform failed … PARSE_ERROR`，整个文件 0 测试。T8 全量里「3 个失败文件」的第 3 个就是它，回执归进 guard-fs / w1ap0-matrix 超时族是错的。
2. **`tests/e2e/security/w1ap0-scan.test.ts:37,194,204` 三处 `mkdtempSync(join(tmpdir(),…))` 没改**，也没 rm（afterAll 只删 TEST_HOME）→ 每跑一次漏 3 个目录。T8 用的是顶层 glob，没进子目录。
3. （顺手，低优先）17 个文件替换后 `mkdtempSync` import 已无用；不碰也不阻塞验收，愿意删就一起删。

## 边界
1. 只动 `app/sdk/tests/e2e/interrupt.test.ts`、`app/sdk/tests/e2e/security/w1ap0-scan.test.ts`（以及第 3 条的 import 行）。别的不碰。
2. 先红：先跑验收 1 贴出 interrupt 的 PARSE_ERROR，再改。
3. 隔离 HOME / TMPDIR / DBus（同 T1）；不跑全量 e2e。

## 验收
统一前置：`T=$(mktemp -d /tmp/bot-T8b-XXXX); mkdir -p $T/tmp $T/home; export HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent; cd /tmp/bot-wt/T8/app/sdk`
1. `pnpm --config.verify-deps-before-run=false exec vitest list tests/e2e > $T/list.log 2>&1; echo rc=$?` → `rc=0`，log 里无 `Transform failed`。（注意 `--config.verify-deps-before-run=false` 是 pnpm 参数，必须写在 `exec` 前面。）
2. `git grep -nE "mkdtempSync\((join\()?tmpdir\(\)" -- tests/e2e` → 空（全目录递归）。
3. `git grep -n "mkdtempSync(" -- tests/e2e | grep -v "^[^:]*:[0-9]*:import"` → 恰好 6 行：sandbox-hardened:28、sandbox-wrapper:151（/var/tmp）、skill-save:93、write-outside:109、ws-write-claim:66（TEST_ROOT）、ssh-headless:197（server.dir）。
4. `pnpm --config.verify-deps-before-run=false exec vitest run tests/e2e/interrupt.test.ts tests/e2e/security/w1ap0-scan.test.ts` → 全 passed；随后 `ls -A $TMPDIR` 只剩 `node-compile-cache`。
5. 回执贴 1–4 的原样输出；interrupt 若在本机负载下有红，贴失败原因并 solo 复跑一次。

## 为什么这样验收
T8 的目的不是「换了 74 处」，是 e2e 跑完不漏目录、且一个文件都没被改坏。机械替换最容易出的错就是插 import 插歪——所以 `vitest list` 全目录收集是必过门；grep 必须递归，否则子目录永远漏。
