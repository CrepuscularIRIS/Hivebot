# VERIFY-U-18（store 加固 + cursor 壳，W1 预审 R8+R9+R4）

verdict: PASS
commit: 57d5c42cb5faa0f46bd4e92bcc8b43fd7248abd1
验收时间：2026-11-02 14:20–14:25（时间戳 `date +%H:%M` 实测区间）
方法：builder worktree /tmp/bot-wt/U-18（验收时 git status 干净）自跑全量；红基线与
基线复现用独立 detach worktree（/tmp/vfy-U-18-base=1608d10、/tmp/vfy-U-18-head=57d5c42，
验收后已删除）。detach 仓 node_modules 以符号链接复用（1608d10↔57d5c42 的
package.json + pnpm-lock.yaml diff 为空，依赖等价成立）。

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| 全量复跑 167/167 | PASS | `cd app/ui && vitest run` → 19 files 167 passed，1 unhandled rejection（见发现 1）。evidence/U-18/full-suite-57d5c42.txt |
| m3 单独 | PASS | `vitest run tests/unit/m3` → 6 files 54 passed。evidence/U-18/m3-only-57d5c42.txt |
| ① 锁语义：同 dataDir 二实例抛 PBOTS_STORE_LOCKED、close() 释放 | PASS | store-lock-flush.test.ts:27-49 两条用例；实现 store.ts:35-50（key=resolve 后路径的进程内 Map，构造抛结构化错 code=PBOTS_STORE_LOCKED，close 条件释放）。另加探针：同目录尾斜杠/相对路径写法也锁住（锁 key 归一化），evidence/U-18/vfy-probe.test.ts |
| ② rename 失败回滚：内存与磁盘一致、半写清除、失败操作不被后续成功提交落盘 | PASS | store-lock-flush.test.ts:53-91 两条用例（断言 rejects + read() 回滚 + 磁盘字节级等于先前好状态 + `bots.json.tmp` 不存在 + 后续 patchMainBotId 成功后盘上无失败 recipe）；实现 store.ts:96-100（unlink 半写）+ :108-114/:121-127（prev 恢复）。探针另证无 mock 真路径：chmod 0o555 → 真实 EACCES → 回滚/磁盘原样/无 tmp/队列不毒化/权限恢复后可续写，evidence/U-18/badpath-probe.txt |
| ③ cursor 壳 {_request:{}} 真调用 | PASS | index.test.ts 新增「patch · wire 壳」：经 `m3.handler({op:'patch'})` 真调用，fake gateway 对无 `_request` 键的参数回 arguments-invalid，断言 `result.ok===true` 且 `dsh.calls` 里 session/list 的 args `toEqual({_request:{}})`。实现 index.ts:84（`{cursor:null}`→`{_request:{}}`，一行） |
| 红基线 5 红 | PASS | 1608d10 detach 仓叠 57d5c42 测试文件：恰好 5 新用例红且原因对位——壳用例 `expected false to be true`（真被 gateway 拒）；锁 1/2 缺 close/锁特性不存在；回滚 1 收到含 p2temp-bad 的内存态（未回滚）、回滚 2 收到 's-new'（未回滚）——全是 R4/R8/R9 特性缺失本身，无 import/环境假红。evidence/U-18/red-baseline.txt。附注：适配的 store.test.ts「重启」用例在基线也红（base 无 close()，属新锁语义所需适配，非第 6 条新红） |
| 区域恰 5 文件 | PASS | `git show 57d5c42 --stat`：恰 5 文件（main/m3-meta/store.ts、index.ts + tests/unit/m3/{index,store,store-lock-flush}.test.ts），165+/10-；worktree 无未提交改动 |
| 发现 1 独立确认（wire.test unhandled rejection 基线既有） | PASS | 1608d10 detach 仓干净树全量：18 files 162 passed + 同一 unhandled rejection（`TypeError: deps.dsh.ready is not a function`，wire.test.ts:107 → m2-mux/index.ts:222），与 57d5c42 处签名一致、不失败文件。确非 U-18 引入。evidence/U-18/base-1608d10-full.txt |

## 新问题（每条一行）

- [WATCH] 跨进程双开仍无锁（两进程各持 BotsMetaStore 仍互覆）——复现：两个 Electron 进程指同一 $PBOTS_DATA_DIR | 疑似位置：app/ui/main/m3-meta/store.ts:24（ponytail 注已声明上限，待 app 级 requestSingleInstanceLock 兜底，app/ui 现无此调用） | 严重度：低（单进程生产形态下不可达，属 R8 声明的递延项）
- [已知·归口 m2-mux] wire.test.ts unhandled rejection（deps.dsh.ready is not a function，m2-mux/index.ts:222）——1608d10 基线既有，本任务禁碰区域，归口 R2/R3 的 dsh-connect 修复任务，勿再单开 | 严重度：低（不失败用例，不污染结果）

## 备注

- 本任务无 UI 面，不适用截图规则。
- vi.mock fs 透传的 teardown 零参调用坑已在 work/LEARNINGS.md 2026-11-02 条目，本次交付的 mock 写法符合该规则（store-lock-flush.test.ts:14-15）。
