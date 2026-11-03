# P5-53 对照台（BRIEF §12.7）

一份 fixture、两个渲染器：左 = 原版 0.78.1（协议 v3 桩），右 = 0.18 移植树 build（协议 v1 桩）。
全部 headless Chrome（CDP 驱动），无 X、无外联（仅 127.0.0.1 静态服务）。

## 一条命令

```bash
node run.mjs
```

产物写 `work/p5-parity/evidence/compare/`：

| 产物 | 内容 |
|---|---|
| `singles/<view>.<theme>.<side>.png` | 每侧每视图截图（ref = 0.78.1，ours = 移植树） |
| `pairs/<view>.<theme>.png` | 「REF 0.78.1 \| OURS 0.18-port」并排拼图，亮暗各一套 |
| `u1-diff.tsv` / `u1-diff.md` | U1′ 差异表初版：视图/部位/属性/左值/右值/差异类型 |
| `persona/<state>/<shape>-<color>.png` | 头像抽帧：8 形 × 11 色 × 3 状态（thinking/searching/working）关键帧 |
| `styles/styles.json` | 每视图每部位的 computed-style 原始 dump |
| `run-summary.{json,md}` | boundary 计数、渲染标记、覆盖度、issue 清单 |

视图（fixture 变体）：`conv-rest`（会话静息 + 待决审批卡）、`conv-running`（主 bot 思考中）、
`sidebar-collapsed`（折叠态 88px）、`info-pane`（设置/info pane）；`market` 为尝试项
（0.78.1 footer「Connect apps」/ 0.18 footer「Plugins」，点击成功才产出截图）。

## 环境变量

- `COMPARE_RIGHT_DIST`：右侧 build 目录。默认 `/tmp/bot-s0-build/.build/frontend-shell`（S0 的
  隔离构建，重启即失）。P5-50 落地后改指 `app/ui/renderer-grok` 的 vite build。重建方法见
  `RE-s0-portability.md` §构建要点（pnpm + vite，@tiptap 全家钉 3.14.0）。
- `LEFT_ROOT`：0.78.1 解包树。默认 `/dev/shm/grok-re/0.78.1/app/dist/renderer`，丢失时按
  RE-unpack §0 重建。
- `EVID_DIR`：输出目录（默认 `work/p5-parity/evidence/compare`）。

## 文件

- `fixture.mjs`：统一 fixture（roster / transcript / 权限卡 / 提问场景数据）+ v1、v3 序列化器。
  两侧 entry 形状差异（用户消息、thinking、tool 状态枚举、权限卡 ask、头像字段、布局持久化键）
  全部在这里吸收，字段差异的依据见文件头注释。
- `stub-v3.js`：0.78.1 桩（泛化 R3 `harness/grok-r3/stub-init.js`，fixture 驱动 + 布局持久化）。
- `stub-v1.js`：0.18 桩（泛化 S0 `evidence/s0-portability/stub-init.js`，fixture 驱动 + ui-layout 持久化）。
- `views.mjs`：视图清单 + computed-style 采集部位（两侧选择器，共用 sand-* 命名）。
- `cdp.mjs`：Chrome + CDP 客户端（随机调试端口、每 run 独立 profile——R3 踩坑吸收）。
- `serve.mjs`：loopback 静态服务（照搬 grok-r3）。
- `probe.mjs`：单侧调试探针（`node probe.mjs <v1|v3> [theme] [variantJson]`）。

## 已知坑（P5-53 实测，2026-11-03）

1. **0.78.1 会话面板 boot 不开**：transcript 只在显式 openAgent（点击侧栏项）后渲染；
   两个桩都保持 R3/S0 的 boot 流程，run.mjs 对 ref 侧每视图点击第一个条目。
2. **0.78.1 权限卡 ask 必须带全三字段**：`description` + `action:'run-command'` + `target`，
   只给 description 会 row 级 boundary（TypeError → "Couldn't render this"）。
3. **0.18 权限卡需要 `permissionScope`/`permissionScopeRevision`**（= 账号 authId + 非负整数），
   缺了卡片静默不渲染（ProductionRenderer.tsx:1766-1773 的硬门槛）。
4. **0.18 clientPersistence.read 实参是位置参数 key**（不是 `{key}` 对象）。
5. **0.18 时间分隔无 producer**：renderer 支持 `time-separator` kind（transcript.tsx:701）但整树
   没有任何代码生成它——fixture 跨 16 分钟的两条消息在移植版不出现分隔行，记 U1′ 差异。
6. **0.78.1 tool-call 行在桩下静默不渲染**：R3 已提交 harness（grok-r3 原样）今日复跑同样不渲染
   行（entry 不进 row 队列，非 boundary）——R3 归档截图与已提交桩不一致（更早迭代产物），
   非本对照台回归；待 RE 跟进。
