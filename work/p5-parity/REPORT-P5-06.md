# REPORT · P5-06（W1-AP-0 合并验收矩阵）

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-06 @ c298eb2（基 7e7f267），worktree /tmp/bot-wt/P5-06。4 文件 +1391，只加测试不改产品。交付：w1ap0-matrix.test.ts、security/w1ap0-scan.test.ts、fake plugin toolResults 观测通道、evidence/P5-06/matrix.md（514 格结论表）。

## 矩阵口径
11 类凭证 × 10 入口 × 4 会话；差分 stock=后置 overlay 摘三层 P5 防线；四列相等（根列逐格映射证明，子列 77 deny+路径点名；bash 子列落 shell-ask 是 P5-05 设计行为）；顺序回归哨兵（P5-04f1）未触发——⑤ plugin_manager 三个 never 子会话全落 guard 字面串。

## 结果
**514 格全 PASS（399 主 + 115 差分），红格 0**；⑦ 含 WARN 恰 1 行与 MASK 根。两文件 12/12；sdk 全量 31 files/248 绿（首跑 /tmp handoff ENOENT 环境性 flake 复跑绿）。

## 发现与处置
1. **P5-01.f2（新开）**：文件根 --ro-bind /dev/null 遮蔽跨启动漂移（cat /etc/ppp/chap-secrets 不同 boot 间 rc 0↔1 均无内容；宿主恰 root:0600 才没漏）——全局可读的 HOME 外凭证文件场景即泄漏；矩阵对 ppp 断言「无内容」不变量
2. bash 侧 /proc 可见是设计边界（wrapper 不遮 procfs；KEY 族哨兵证明 scrubber 生效；R5 立约 P2SDK_* 不装凭证）
3. 测试侧新知识：runtime.ts 硬编码 P2SDK_PROVIDER='mock'（real e2e 须显式覆盖）；委派子会话 id 裸 uuid 且后台异步（识别用 prompt 标记+日志行边界）；fake toolResults 逐轮累积（按 toolCallId 去重）；ptc worker bootstrap 必须放会话工作区内；上游 write 有 read-before-write 规则
