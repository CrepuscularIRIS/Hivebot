# VERIFY-U-21（主会话据 verifier 回报重建——原报告随 U-21 worktree 删除丢失，2026-11-02 15:35）

verdict: PASS（commit e55ad0d，验收期 head 无漂移）
- 复跑：build 绿、单测 183/183、e2e 30/30（15:00–15:02 真跑；HOME 隔离、runtime 临时 cwd、仓内零副作用）
- ①P-A：冷启动两分支、主 bot 首位+星标+排序冻结（order 仅首载/新建两处变更）、对话框全旅程（默认预选→创建→插主 bot 下→选中→composer 焦点、Esc 回焦）、侧栏 280/240-400/重载记忆全绿
- ②P-B：流式 ≥3 增量同节点原位+定稿替换（d1.spec 节点打标校验）、tool 行常驻、审批卡 inline/两按钮/决议收行、Enter/IME/停止(aborted)/黄点/草稿隔离全绿；缺 callId 流末尾独立卡（静态渲染探针 15/15）
- ③token：7 对 --dsw-* == theme-tokens.css × 亮暗（e2e 真断言）；截图目检：封面与原版几乎逐像素一致（side-by-side 亲验 + 独立截图交叉）；R15 Sign in→启动文案、R14 黑白单色、R16 38px WCO 与原版气质吻合
- ⑤抽查 R1-R6/R14/R16/R17/R19/R20 落实现 + 四核实项 #2/#3/#4 代码对照吻合；⑥ window.ts 仅 titleBarOverlay、wire.test ready() 恰一行
- 坏路径（引擎死亡）：审批出清+composer 不锁死 ✓；新问题 2：[FIX][M] 断线发送失败静默丢草稿+停止永久 disabled（send 先清草稿只处理 !res.ok、stop 无 catch；另一半根因 rpcRaw 裸抛 R13）；[FIX][L] 回合中引擎死亡 turn/end 缺失致永久停止态（重连自愈）
- 证据：evidence/PAB/ 截图组（本人重跑生成）、probe-a-render.tsx、probe-b-offline.mjs、offline-light.png（在 main 4f0b404 已入库）
