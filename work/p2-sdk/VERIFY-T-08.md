# VERIFY-T-08 · D8 端口 / 鉴权 / 凭证不落盘

verdict: PASS
commit: 4d13242594c098cca8864e54c8ee5e2d2304319d（1dea373 + 4d13242，分支 feat/T-08，worktree /tmp/bot-wt/T-08）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 干净复跑：单跑 security（7 用例） | PASS | `pnpm exec vitest run tests/e2e/security.test.ts --no-file-parallelism` → 7/7（58.06s；verbose 复跑再 7/7，122.68s，①1607ms ②1475ms ③3683ms ④727ms ④b64ms ⑤25447ms ⑥2056ms，⑤ 真跑非 skip，输出仅 `hits=0`）。evidence/t08-rerun.out |
| 干净复跑：全量 61/61 | PASS | `pnpm test --no-file-parallelism` → 12 files / 61 tests 全过（77.73s；复跑 108.59s）。evidence/t08-rerun.out |
| ① ss 进程树判据（T-01②） | PASS | security.test.ts L207-214：`treeListenerEndpoints(rt.child.pid)` ≥1 且逐个 `isLoopback`；③ 内 L263-265 对 fake-driven runtime 复检。机制亲读：harness.ts L214-232 用 `ss -ltnp` 按行解析 + `pid=` 匹配 processTree（/proc/<pid>/task/<pid>/children 递归）——确按进程树过滤（G2-r1-A 要求），isLoopback 只认 127.0.0.1/[::1]，通配地址会判 FAIL（保守） |
| ② 无 cookie 401 + 跨站拒 + /connect 正例 | PASS | L218-250：无 cookie POST /api/session/list → 401；有效 cookie + `sec-fetch-site: cross-site` → 403；有效 cookie + `origin: https://evil.example` → 403；`/connect?token` → 302 + Set-Cookie → 新 cookie 调用 → 200。测试 PASS |
| ③ 哨兵注入 + 全扫描 0 命中 | PASS | L254-298：哨兵 `sk-canary-p2sdk-<uuid>` 注入 P2SDK_LLM_API_KEY；L261 `childEnvHas` 读 /proc/<pid>/environ 只查 `name=` 前缀（机制亲读 harness.ts L65-67，不打印值）证实到位；建 session→对话→kill -9 树→同 env 重启→list 含 sid（重启存续）；L279-282 格式探测 walkFiles 后缀集合含 `.zstd`；扫描覆盖 home（strict）+ 两 boot 日志（--file）+ cmdline（--pid=processTree）+ --tracked → exit 0 CLEAN 且 stdout 不含哨兵 |
| ④ 正对照三路 | PASS | L302-332：zstd 双帧（哨兵在第 2 帧）→ exit 1 + HIT 路径；普通日志 → HIT；gzip 放 home → exit 2 + UNRECOGNIZED + 路径。verifier 另做独立正对照（比测试更深）：哨兵藏 zstd **第 3 帧** → HIT；同目录 JPEG（二进制+NUL）strict 域 → UNRECOGNIZED exit 2、raw 域（--file）→ HIT exit 1。evidence/t08-positive-control.out |
| GUARD：node22 与伪造 UA 均 exit 3 | PASS | 亲跑两路：Node 22.23.4 + 伪造 `pnpm/11.0.9` UA → exit 3（版本 guard）；Node 24.22.2 裸跑（空 UA / npm UA）→ exit 3（UA guard）；正路 `pnpm exec node` → 24.22.2 放行 CLEAN。技术前提亲验：两帧拼接 zstd，v24.22.2 解出 43/61 字节（全帧），v22.23.4 只解 17/61（第一帧）。evidence/t08-rerun.out、t08-zstd-frames.out。注：`pnpm exec` 会自己注入 pnpm UA，故 guard 放行正确 |
| ⑤ 可达性门（无 key / 端点不可达） | PASS | 三态齐验：a) 本机有 LITELLM_MASTER_KEY + 端点可达 → ⑤ 真跑：先 D2 冒烟（min-client exit 0）再扫 home+boot log+D2 输出+cmdline+tracked → CLEAN，全程不打印 key；b) `unshare -rn`（lo only）内端点不可达 → fetch 抛 → console.log skip 分支用例仍绿（1 passed | 6 skipped，147ms），离线门不红（commit 4d13242 的行为）；c) 无 key → `it.skipIf(!REAL_KEY)` 整用例跳过。evidence/t08-rerun.out |
| ⑥ 真实 provider 路径哨兵（R-5） | PASS | 代码路径亲验：`P2SDK_LLM_BASE_URL` → start.ts L90 `childEnv` 桥成 `P2SDK_LLM_API_BASE`（normalizeApiBase 补 /v1）→ p2sdk.yml L26-35 `llm-pi-ai` 行：`api: openai-completions` + `apiKeyEnv: P2SDK_LLM_API_KEY`（key 值不进 config）+ baseURL ← env——真实 pi-ai HTTP 路由，非 fake。行为证据 L398-464：loopback stub 在 60s 内收到 `authorization === "Bearer <哨兵>"`（轮询断言）**之后**才扫描；所有请求 URL 不含哨兵；随后扫 home+log+cmdline+tracked → CLEAN。测试 PASS（2056ms） |
| 区域检查 | PASS | `git diff main...HEAD --stat` = 恰 2 个新文件：tests/e2e/security.test.ts（+464）、tests/e2e/security/scan.mjs（+171），共 +635；工作树干净。boot plumbing 为 T-06 模式的本地复制（L55-56 注释言明），未触碰 tests/support / examples 共享区 |
| builder 披露复核：tracked JPEG 口径 | PASS，与 PLAN 一致、不漏检 | PLAN ③ 原文「对受跟踪文件、运行日志等普通文件、/proc/<pid>/cmdline 直接搜，遇到不认识的压缩/二进制格式判 FAIL 不跳过」；G2-r1 HIGH-4 的语境是**压缩会话漏检**（存储根）。scan.mjs L44-48/L58-64 落实为两域：`--home`（dsh 存储根）strict——zstd 全帧解码或 UTF-8 文本，认不出 → UNRECOGNIZED exit 2（gzip/JPEG 亲验）；`--tracked`/`--file` raw——原始字节搜，字面 key 在任何文件类型（含二进制 JPEG）都可检（亲验 HIT），且不被无关二进制 veto。两域均无「字面 key 不可检」的盲区。当前仓库 tracked 二进制 = 0（`git ls-files` grep 计数 0），JPEG 口径系防御未来tracked 资产。minor 备注：raw 域中 ZSTD_MAGIC 开头的文件只搜解码后内容不搜原始字节——zstd raw-block 语义下解码内容 ⊇ 明文，可接受 |

新问题（每条一行，可直接成为修复任务）：

- [FIX] UA guard 可被环境变量伪造绕过（`npm_config_user_agent` 是普通 env，非 pnpm 调用者可自设 `pnpm/` 前缀） | 复现：`env npm_config_user_agent='pnpm/9 npm/? node/v24 x64' node scan.mjs …` 在 Node 24 下不触发 UA guard | 疑似位置：app/sdk/tests/e2e/security/scan.mjs L28 | 严重度：LOW（版本 guard 用 process.versions.node 不可伪造，守住多帧解码正确性；UA guard 仅防误用非安全边界，且绕过后 Node 24 解码仍正确）

补充说明：
- 本任务无 UI，不涉及浏览器截图。
- 全程未打印任何哨兵/key 值（独立正对照的哨兵经 shell 变量传递，证据文件已核对不含值）。
- 无 FIX 级以上问题；LOW 一条已列。
