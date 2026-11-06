# T9ae：runtime patch 全部插值走 yamlScalar + 本机模式清继承的 P2SDK_SSH_MODE

> 开单：manager (Opus 5.5) | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：Sol 审查 `work/tickets/review/T7c-T9a-security.md` C3、C4（经理核实均 CONFIRMED，见该文件「## 经理核实」）；T9a 链（已 done 并合并）的后续修复，不计 T9a 链失败次数
> 分支 / 作业目录：feat/T9ae，从主线 `docs/rebuild-p6-p5-plan`（≥ 35a235c6）切；小改动，可不建 worktree
> 排期：现在就做，与 T16 并行（T16 不碰 `start.ts` / `start.test.ts`），合并不必等 T16；须在 T9b 之前合并
> claimed：2026-11-06 15:4x main (GLM 5.3) @ /tmp/bot-wt/T9ae
> accepted：

## 目标
1. （C3）`start.ts` 生成 runtime patch 时，所有插进 YAML 的字符串都经 `yamlScalar`：路径含 `'` 不再让整份 patch 解析失败，`host: true` 之类不再被解析成 boolean/number。
2. （C4）本机模式下，launcher 自己环境里继承来的 `P2SDK_SSH_MODE` 不进 dsh 子进程；ssh 模式照旧设 `'1'`。

## 根因（经理实测）
- C3：`sshRows`（`start.ts:442-457`）五个参数是 `'${x}'` 裸拼、`host: ${ssh.host}` 连引号都没有。经理用 `writeRuntimePatch` 真生成后解析：`remoteRoot=/srv/O'Brien/work` → yaml 报 `Unexpected scalar at node end`、js-yaml 报 `bad indentation of a mapping entry`；`host=true` → boolean，`host=1e3` → number 1000（上游 dsh-ssh schema 要求 string，`dsh-ssh/lib/index.js:17,52`）。**同类未报的兄弟**：同文件 `:324`（fs-zone name）、`:381` `:384`（llm-replay name/overrideFile）、`:397` `:399`（handoff 行 name/`dir: '${cfg.handoff}'`——同一个 handoff 在 `:346` shellAskRow 里已经走 yamlScalar，两处不一致）。本单一并收掉，判据是一条 grep。
- C4：`childEnv` 的白名单循环（`:184-198`）保留全部 `P2SDK_*`，`:209-211` 只删五个 SSH 参数，没删 `P2SDK_SSH_MODE`。经理实测 `childEnv(本机cfg, {P2SDK_SSH_MODE:'1'})` → 子进程得到 `"1"`；`approval.yml:167,172,292,297` 据此禁掉本机 standard/cordis 的 workflow-ptc / tool-workflow，T9b 的 containment 也将读它。

## 动手前先读
1. CLAUDE.md、work/LEARNINGS.md
2. `app/sdk/src/start.ts:176-215`（childEnv）、`:224-227`（fileUrl / yamlScalar）、`:309-330`、`:374-460`
3. `app/sdk/tests/unit/start.test.ts:171-215`（T9a-①②③）

## 边界
1. 只动：`app/sdk/src/start.ts`、`app/sdk/tests/unit/start.test.ts`、回执。别的不碰。
2. 先写失败测试（下面照抄），**先不改产品代码跑它，看红**，红的原样贴回执。
3. 测试走隔离 HOME / TMPDIR，DBus 指向不存在路径。
4. 只在 feat/T9ae 提交；合并等经理验收。

## 第 1 步：先红（照抄进 `tests/unit/start.test.ts`，放在 T9a-③ 那个 `it` 之后、同一个 describe 里）

```ts
  it('T9ae-C4 本机模式清掉继承的 P2SDK_SSH_MODE；ssh 模式不论继承值都设 1', () => {
    const localCfg = resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h' })
    expect(childEnv(localCfg, { PATH: '/bin', P2SDK_SSH_MODE: '1' }).P2SDK_SSH_MODE, '本机模式不继承 MODE').toBeUndefined()
    const sshEnv = { P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h', P2SDK_SSH_HOST: 'a', P2SDK_SSH_REMOTE_ROOT: 'b', P2SDK_SSH_HELPER: 'c', P2SDK_SSH_HELPER_HASH: 'd', P2SDK_SSH_NODE: 'e' }
    expect(childEnv(resolveConfig(sshEnv), { ...sshEnv, PATH: '/bin', P2SDK_SSH_MODE: '0' }).P2SDK_SSH_MODE).toBe('1')
  })

  it('T9ae-C3 runtime patch 的插值全部是单引号标量（含 \' 的路径、像布尔的 host）', () => {
    const cfg = resolveConfig({
      P2SDK_PROVIDER: 'mock', P2SDK_HOME: '/tmp/h', P2SDK_HANDOFF: "/tmp/h/ho'x",
      P2SDK_SSH_HOST: 'true', P2SDK_SSH_REMOTE_ROOT: "/srv/O'Brien/work",
      P2SDK_SSH_HELPER: "/remote/it's.js", P2SDK_SSH_HELPER_HASH: 'a'.repeat(64), P2SDK_SSH_NODE: "/remote/n'ode",
    })
    mkdirSync('/tmp/h', { recursive: true })
    const yaml = readFileSync(writeRuntimePatch(cfg), 'utf8')
    expect(yaml).toContain("        host: 'true'\n")
    expect(yaml).toContain("        workspace: '/srv/O''Brien/work'\n")
    expect(yaml).toContain("    workspaceRoot: '/srv/O''Brien/work'\n")
    expect(yaml).toContain("        helper: '/remote/it''s.js'\n")
    expect(yaml).toContain("node: '/remote/n''ode' }")
    expect(yaml).toContain("        dir: '/tmp/h/ho''x'\n")
    expect(yaml, '不留未转义的单引号插值').not.toContain("O'Brien")
  })
```

预期红：C4 第一条断言 `expected '1' to be undefined`；C3 第一条 `host: 'true'` 不含。

## 第 2 步：修
1. C4（`start.ts:209`）：数组末尾加 `'P2SDK_SSH_MODE'`，注释补一句「继承来的 MODE 也先删（审查 C4），下一行按 cfg.ssh 重设」。`:211` 不动。
2. C3：把 `start.ts` 里所有 `'${…}'` 换成 `${yamlScalar(…)}`（`:324 :381 :384 :397 :399 :442 :445 :446 :447 :448 :450 :452 :454 :457`），`:444` 的 `host: ${ssh.host}` 换成 `host: ${yamlScalar(ssh.host)}`。`:445` 在 flow mapping 里，换成 `launch: { kind: node-script, node: ${yamlScalar(ssh.node)} }`。
3. 本机模式生成结果对不含 `'` 的路径逐字不变（`yamlScalar(p) === \`'${p}'\``），不用加快照。

## 验收（写命令，不写感觉）
```bash
T=$(mktemp -d /tmp/bot-T9ae-XXXX); mkdir -p $T/tmp $T/home
cd <feat/T9ae 工作目录>/app/sdk
E="env HOME=$T/home TMPDIR=$T/tmp DBUS_SESSION_BUS_ADDRESS=unix:path=$T/nonexistent"
V="pnpm --config.verify-deps-before-run=false exec vitest run"
```
1. 先红：改产品代码前 `$E $V tests/unit/start.test.ts -t 'T9ae'` → 2 failed（贴原样）。
2. 修后：`$E $V tests/unit/start.test.ts` → 42 passed（基线 40 + 2）。
3. 不留裸插值：`grep -nF "'\${" src/start.ts` → 只剩 `:227` yamlScalar 定义一行；`grep -nE "^\s+host: \\$\{" src/start.ts` → 无输出。
4. 真解析（经理复跑用，施工也贴；node 22 直接剥 TS 类型，不用 tsx）：
   ```bash
   H=$(mktemp -d $T/tmp/h-XXXX); cat > $T/c3.mjs <<EOF
   const y = (await import('$PWD/node_modules/.pnpm/js-yaml@4.3.2/node_modules/js-yaml/dist/js-yaml.mjs')).default
   const m = await import('$PWD/src/start.ts')
   const cfg = m.resolveConfig({ P2SDK_PROVIDER: 'mock', P2SDK_HOME: '$H', P2SDK_HANDOFF: "$H/ho'x", P2SDK_SSH_HOST: 'true', P2SDK_SSH_REMOTE_ROOT: "/srv/O'Brien/work", P2SDK_SSH_HELPER: '/h.js', P2SDK_SSH_HELPER_HASH: 'a', P2SDK_SSH_NODE: "/remote/n'ode" })
   const d = y.load((await import('node:fs')).readFileSync(m.writeRuntimePatch(cfg), 'utf8'))
   const s = d.find((r) => r.insert?.some((x) => x.id === 'ssh')).insert.find((x) => x.id === 'ssh').config
   console.log(JSON.stringify(s.host), JSON.stringify(s.workspace), JSON.stringify(s.launch.node), JSON.stringify(d.find((r) => r.id === 'sandbox-policy').config.workspaceRoot))
   EOF
   $E node $T/c3.mjs
   ```
   → `"true" "/srv/O'Brien/work" "/remote/n'ode" "/srv/O'Brien/work"`（改前：`bad indentation of a mapping entry`）。
5. 回归（单套顺跑）：`$E $V tests/e2e/ssh-headless.test.ts` → 14 passed；`$E $V tests/e2e/ssh-product.test.ts` → 3 passed，之后 `pgrep -af 'bot/app/sdk' | grep -v pgrep` 无本单残留 dsh；`$E $V tests/e2e/guard-plugin-manager.test.ts` → 7 passed。
6. 变异：M1 把 `:209` 加的 `'P2SDK_SSH_MODE'` 删掉 → `-t 'T9ae-C4'` 红；M2 把 `workspace:` 那行还原成 `'${ssh.remoteRoot}'` → `-t 'T9ae-C3'` 红。各贴原样，还原。
7. 覆盖：`$E $V tests/unit/start.test.ts --coverage --coverage.include=src/start.ts` → 贴 Uncovered Line #s 原样，标出落在改动行里的（改动行 100% 覆盖，都是同步插值）。
8. 改动面：`git diff --stat <起点>..HEAD` 只含 `start.ts`、`start.test.ts`、`receipts/T9ae.md`。

## 为什么这样验收
C3 要保住的是「生成的 patch 永远是我们以为的那份配置」：合法的路径或 ssh 别名不该让 launcher 起不来，更不该让一个值改变 YAML 结构或类型。grep 判据把同类插值一次收干净（报告只点了五参数，同文件还有六处同样写法）；真解析那条证明转义后值原样回来，而不只是字符串长得像。C4 要保住的是「ssh 标记只由本次 cfg 决定」：本机 bot 因为 launcher 环境里残留一个变量就丢了 workflow，或者 T9b 起把本机 bot 当远端按词法判路径，都是静默降级。M1/M2 证明两条新测试分别咬住两处修法。

## 产出
- `app/sdk/src/start.ts`、`app/sdk/tests/unit/start.test.ts`
- `work/tickets/receipts/T9ae.md`（贴第 1 步红、验收 1-8 原样）
