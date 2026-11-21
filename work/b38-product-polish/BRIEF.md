# B38 产品级打磨批（planner: deepseek-v4.1-flash）

## 工单序（planner 回报 2026-11-19）
1. **T-A 亮色主题硬编码清扫** ✅（B38a，main 9f949657）
2. T-B transcript content-visibility 性能预算
3. T-C 首启空态→第一个 bot 旅程
4. T-D 多 bot 快速切换压测

## B38a 记录（T-A）
- 病根三处：①view.css --cursor-color-* 6 处 var() 引用全 codebase 无定义（静默空值）②view.css 56 处 0.18 港口树遗留暗色 hex（#20231f 浮起面/#343832 边/#d9ded4 文字等，0.78.1 资产零锚点=非原版值）③t56 块 @media(prefers-color-scheme) 跟 OS 不跟应用主题（Light+OS Dark 错乱）
- 修法：语义映射表批量换 --sand-* token（installer 双态定义）；t56 改 html[data-theme='cursor-light'/'cursor-dark']（注意 data-theme 值带 cursor- 前缀——Bzn 写入的是 cursor-light 不是 light，第一版选择器因此空匹配）
- 守卫：tests/unit/b38a-theme-tokens.test.ts ①组件 CSS 每个 var() 都在 installer 有定义（提取器要抓 `--x:` 字面量+"--x" 对象 key 双形态，bzn() 的 RUNTIME_PALETTE 是 cssVar 对象）②零 prefers-color-scheme
- 视觉锁：tests/e2e/b38a-visual.spec.ts 亮色态 hover 按钮背景亮度>0.5（原 #20231f≈0.13）+data-theme=cursor-light
- 环境性：theme-dual 市场空态挂=基线环境性（主仓同 commit 同挂，34.7m 全量轮过过）；worktree vitest 环境性失败=三处 node_modules symlink（app/ui、renderer-grok、app/sdk）

## T-B 结论（2026-11-19 07:00 实测，不施工）
- 原版核查：0.78.1 资产无 transcript 行级 content-visibility（`ui-1lzgia1` 是 stylex CSS var 组 hash，c-v 声明挂在 var 组容器上非 transcript 行）；原版同款普通滚动容器
- 我方实测（临时探针 spec，已删）：30 轮对话=34 消息/2695px scrollHeight，强制布局 0.2ms——无性能问题
- `.sand-virtual-transcript` 命名误导：类名是 0.18 树遗产（0.78.1 类名 sand-jm9jq1 系），非 virtual list 承诺；不改名（改名破坏全链 e2e 选择器，收益为零）
- **判定：跳过 T-B 施工**（原版无此优化+实测无问题；真到千条规模再议，shortcut: 长会话卡顿出现时引入行级 content-visibility:auto+contain-intrinsic-size）

## T-C 记录（B38c ✅）
- 调研：0.78.1 空态引导属 onboarding-flow 云端向导（yvjVU9 'Welcome to Grok Bot' 在 chunk-onboarding-flow，配 Intl.Segmenter 逐字动画）——B29 已定性不接；个人空会话无独立引导组件证据
- 落地：transcript.tsx 空 entries 渲染欢迎块（yvjVU9 文案+快捷键 hint）——最小非侵入；e2e 锁可见性+消失时机
- 坑：改 tsx 后必须 pnpm run build 再跑 e2e（rig 吃 dist 产物不是源码）

## T-D 记录（B38d ✅ 纯验证批，无产品改动）
- 结果：12 bot×3 轮 200ms 连切零错投（每 bot 末条 assistant 均为自身 MARKER）+草稿跨切换还原——通过，无修复需求
- spec 沉淀坑：①writeScriptCalls 需要 patch: fakeOverlayPath()（undefined 时无 overlay，回复来自 shim start.ts:627 内置 mock——表面症状同 script miss）②tiptap 输入用 composer() helper+keyboard.type 非 fill ③send 前即时写 script（cursors per-session 消耗语义）
