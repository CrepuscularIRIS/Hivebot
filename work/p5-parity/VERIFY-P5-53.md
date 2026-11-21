verdict: PASS
commit: b964c76b76aa1bce1baff88897cee9a7e215fd0b（worktree /tmp/bot-wt/P5-53，基 677015e，验收时 HEAD 与申报一致，工作树干净）
验收时间：2026-11-03 14:13–14:31（本地实测，亲跑，未采信 builder 输出）

| 验收项 | 结果 | 证据（命令/文件/截图路径） |
|---|---|---|
| PLAN P5-53：同 fixture 两侧完成渲染 boundary=0 | PASS | 亲跑 `node run.mjs`（14:13:21–14:17:49，238s，exit 0）：16 视图全部 `boundary=0/0`，ref 侧 items=3 card=true，ours 侧 items=3 card=true；run-summary.md 判定 PASS。日志 `/tmp/bot-vfy-p553-run.log` |
| PLAN P5-53：输出 U1′ 差异表初版 | PASS | `evidence/compare/u1-diff.tsv` 1143 行 = 表头 + 1142 数据行（value 1106 / 单侧缺失 36），与申报 1142 一致；md 版自报 `差异行数：1142` |
| 拼图产物 | PASS | `pairs/` 10 张（conv-rest / conv-running / sidebar-collapsed / info-pane / market × 亮暗），mtime 14:17 本次刷新；`conv-rest.light.png` 1440x960，左右两半独立渲染（像素分布不同，非复制帧） |
| persona 264 帧非空 | PASS | `find persona -name '*.png' | wc -l` = 264，size 0 的 0 张；抽 2 帧像素级核验：`thinking/blob-black.png`（112x112，212 色，灰阶字形）、`working/wedge-yellow.png`（112x112，主色 255,164,29 = 黄，223px+），均为真实渲染非空白。CDN 图像通道 400 解析失败，改用像素统计 + PNG 头核验 |
| 差异值对账 styles.json | PASS | 抽 3 行全部 MATCH：`conv-rest.light/sidebar.root/height` ref=900px ours=288px；`conv-running.light/permission.card-primary-btn/width` 95.7031px/97.2344px；`conv-running.dark/composer/border-top-right-radius` 22px/16px——tsv 值与 `styles/styles.json` 原始 dump 逐字段相等 |
| 双桩独立性（v3 卡三字段 / v1 scope+revision） | PASS | `fixture.mjs`：toV3 ask=`{status,requestId,description,action:'run-command',target:'~/q3'}`（action 是字符串，:167）；toV1 ask=`{status,requestId,action:{kind:'run-command',command},target:{kind:'local-computer'}}` + `permissionScope:'stub-auth', permissionScopeRevision:0`（:106-110）；两侧同吃 `semanticFixture()`，run.mjs:23-24 分别接 toV3/toV1。与报告发现 1 一致 |
| 区域：全在 work/，产品零改动 | PASS | `git diff --name-only 677015e..b964c76 | grep -vc '^work/'` = 0（308 文件，+11514 行全在 work/） |
| 发现 4 复核：0.18 无 time-separator producer | PASS | `grep -rn 'time-separator' /tmp/bot-s0-build/frontend/src` 仅 3 处：view.css:194（样式）、transcript.tsx:701（渲染分支，支持点确认）、model.ts:288（interface 类型声明）；构造点 `kind: "time-separator"` 赋值在 model.ts 外 = 0。0.78.1 bundle（index.eager-app）含该字符串（自动生成侧成立） |
| 坏路径：boundary=0 非空转 | PASS | LEFT_ROOT 指向 0.18 树 + v3 桩（协议错配，EVID_DIR 重定向）：错配侧 items=0 card=false，判定降级为「见 issues」+ 4 条「单侧缺用户消息」——内容标记把关，boundary=0 不会假绿；缺根目录路径 run.mjs:75-79 throw exit 1 |

新问题（每条一行，可直接成为修复任务）：
- [FIX] run.mjs 判定 FAIL 时退出码仍为 0 | 复现：坏路径跑完 `echo $?` = 0，仅 summary 文本见 issues | 疑似位置：work/p5-parity/harness/compare/run.mjs main() 末尾（无按 summary.pass 设 exit code） | O4 低（人工读 summary 的流程不受影响，接入 CI 前修）

备注：报告称「8 文件」实为 9（含 probe.mjs），口径差不构成缺陷；R3 遗留 server（8877-8879）仍在，报告已申报待用户清，本次验收两次 run 无残留进程。
