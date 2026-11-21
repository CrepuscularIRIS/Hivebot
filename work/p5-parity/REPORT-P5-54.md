# REPORT · P5-54 切换：Electron 加载 renderer-grok、删除旧 renderer

> 主会话代录（builder 写报告被拦），2026-11-03

分支 feat/P5-54（基 8e94b67），3 commits：fe84bbd 切换 / 177957e 迁移 / 4500cd2 删除（-3898）。上游树 diff=0。vitest 356/356 + 全量 e2e 61/61（含真模型）。e2e 66→61、vitest 365→356=旧 UI 专属用例随树删，每条 D 条款有新对应用例。

## 方案
加载=renderer-grok 拷进 out/renderer（main appRoot 不改、打包单目录、e2e 免 PBOTS_APP_ROOT；build 三步：electron-vite→renderer-grok→stage-renderer 拷贝）；CSP 取响应头与上游 meta 交集（更严者）；preload pbots.window={platform:'win32' 恒定,zoom:webFrame 实值}，titleBarOverlay 38→51 对齐 0.18；删除 plugins/shell/index.html/main.tsx/seed/theme.tsx/dsw.css+旧单测，保留 carrier/fold/session（shim 数据层，reduce.ts 移位）+theme/{sand-tokens.css,fonts}（P5-55 用）；根依赖去 react/shiki 等 5 个。

## 切换中修的 6 个产品缺陷（旧 renderer 测不到）
F1 切非主 bot composer 无效（上游 rich-text-editor 作用域栅栏只放行 uiEvent meta——覆盖按 scopeKey 重挂）｜F2 长历史永不翻页（fetchPage 路由+游标+transport 世代三处）｜F3 deadline 代答后 dock 挂着（follow 定局收卡）｜F4 暗色不跟随（preference=system 监听推送）｜F5 时间分隔/未读线从不出现（0.18 只渲染不生成——覆盖 markers.ts 按 0.78.1 vmt/UR/Emt 语义，12 单测）｜F6 外链（window.open 走 setWindowOpenHandler）

## D1-D12+P5-11/12 → 新 renderer 映射（全文见 e2e 与本报告 git 版）
全有覆盖；不等价归口：选 preset/连接器 UI+市场页 P-C+配置面板 P-D+停止钮+启动封面→**新任务（契约测试已在 M1 层，缺 UI）**；Always allow 可见禁用+Execution 下拉→P5-31；字体/色板/88→78/未读滚动→P5-55。不回归：single-instance/restore/origin-gate/load-abort/cold-start 全绿。

## U2′
27 锚点 66 属性亮暗 264 断言（对 visual-baseline.json=0.18 现值；PBOTS_UPDATE_VISUAL_BASELINE=1 重写）；5 个旧构件 0.18 无对应（B3/A13/C2/D4/D6）进差异表；diff.tsv 32 行交 P5-55。

## 对照台第三列
harness/compare/app-column.spec.ts：fake 会话 4 视图×亮暗+PARTS 采样；三联拼图 REF|OURS|APP 10 张；u1-diff +122 行 app-vs-ours。

## 发现（范围外）
①live 连接器 bot 标题（#rename）重启丢失（普通 bot 不丢）——FIX 候选 ②上游：仅首次打开的 bot 能翻更早页（setScope 重置游标）③工具行结果内容未映射（P5-51⑧，D5 断言在 shim view 上做）
