# T51/T51b 审查报告（reviewer 6.1 Sol）

审查：6.1 Sol @ 2026-11-11 07:58 EST；范围：8146cba0..02ee677d；工单：T51、T51b。
总评：**4 条 major、1 条 minor，均由隔离探针复现；建议返修后再合并。**

| 严重级 | 文件:行号 | 问题与实测证据 | 建议修法 |
|---|---|---|---|
| major，已复现 | `/tmp/bot-wt/T51/app/sdk/src/start.ts:975-990` | **追加种子会破坏合法 YAML。** 首次无 env 启动生成 `[]\n`，之后带 seed 启动得到 `[]\n- id: plugin-market…`，解析报 `Unexpected seq-item-ind`。已有非空块序列但末尾无换行，同样损坏。当前五格测试漏掉默认骨架后补 seed 的路径。 | 区分空数组、块序列及其它合法序列表示；安全处理空数组，追加前保证正确分隔；不能安全追加时 WARN 且不写。补这两格测试。 |
| major，已复现 | `/tmp/bot-wt/T51/app/ui/renderer-grok/overrides/modules/market-store.ts:125-134` | **新增源成功后又选中未规范化地址。** 输入 `https://EXAMPLE.com:443/a/../index.json`，上游保存为 `https://example.com/index.json`；`enterMarket(true)` 已成功搜索规范地址，随后 `setSource(trimmed)` 又搜索原地址，最终 `state.url` 不在 sources 中并报 `Index is not configured`。探针运行实际 store，上游规范化复用已装 DSH 函数。 | 从刷新后的 sources 中选择与输入规范形式匹配的实际 URL，不使用原始 trimmed 地址。 |
| major，已复现 | `/tmp/bot-wt/T51/app/sdk/src/start.ts:936-944` | **manifest 解析失败被当成文件不存在，随后整写丢配置。** 隔离 fixture 的 package.json 仅缺最后一个 `}`，仍含用户 dependency 和 bundle；调用后被静默替换为 `dependencies:{}` 与三个默认 bundles。无需并发即可触发。 | 仅 ENOENT 可创建默认 manifest；读取或解析已有文件失败应保留原件并明确报错，不覆盖。 |
| major，已复现 | `/tmp/bot-wt/T51/app/sdk/src/start.ts:950-958` | **链接位置已有真实包目录时，每次启动直接失败。** 将 `node_modules/@deepseek-ai/dsh-plugin-market` 设置为含 package.json 的普通目录，`rmSync` 非递归删除失败被吞，紧接着 `symlinkSync` 抛 `EEXIST`；调用位于 spawn 前，SDK 无法启动。 | 用 lstat 区分链接与目录；可用包目录应保留或明确兼容迁移，不能吞删除异常后继续假定路径为空，也不要盲目递归删用户目录。 |
| minor，已复现 | `/tmp/bot-wt/T51/app/ui/main/m1-api/index.ts:104-105` | **`undefined` 元素穿过 main 类型守卫。** `{urls:[undefined,'https://a.example/index.json']}` 的 `find` 返回 undefined，与"未找到坏项"混淆；实际 handler 探针显示 upstreamCalls=1。上游还有字符串 schema，因此不是 D9 或权限绕过。 | 改为 `some` 或 `findIndex`；补 undefined 元素拒绝且 upstreamCalls=0 的断言。 |

核查过无问题：D9 实际先于白名单和参数检查；新增视图没有 dangerouslySetInnerHTML，错误文本由 React 转义，表单已 preventDefault；正常单视图连续操作有 busy 禁用保护；生产启动有 HOME 锁，未据 TOCTOU 推测另报竞态。
测试真实性：338–347 行确实停止旧 runtime、同 HOME 启动新 runtime 和 shell；固定 ASCII fixture 的 includes 能检查原段逐字保留，但不能覆盖上述 YAML 边界。范围核对未发现与工单无关的产品功能夹带。
重跑结果：SDK 五格 **5 passed**、M1 **71 passed**；未重跑 e2e/build。复现脚本：`/tmp/t51-review-probe.mjs`、`/tmp/t51-review-manifest.mjs`、`/tmp/t51-review-m1.mjs`；仓内无修改。

## 经理核实（manager 任务 B，2026-11-11）
三份复现脚本经理亲跑（`node --experimental-strip-types /tmp/t51-review-{probe,manifest,m1}.mjs`），并对照 `start.ts:918-990`、`market-store.ts:125-134`、`m1-api/index.ts:101-105` 读码：
- major① **成立**。输出 `empty BROKEN YAML: Unexpected seq-item-ind`、`no-eol BROKEN YAML`。且这是生产常见路径（首启无 env 写 `[]\n`，日后 env 文件加目录源 → 追加 → 用户补丁层坏，dsh 读不了用户设置）。→ T51c R1。
- major② **成立**。输出 `"url":"https://EXAMPLE.com:443/a/../index.json","error":"Index is not configured…"`，两次搜索；`addIndex` 末行 `setSource(trimmed)` 即根因。→ T51c R2。
- major③ **成立**。输出 `afterDependencies:{}`、bundles 被重置；`catch {}` 不分 ENOENT。概率低（manifest 损坏才触发）但后果是已装连接器从 profile 消失，保留 major。→ T51c R3。
- major④ **成立**。输出 `EEXIST`；`rmSync({force:true})` 对目录抛错被吞后 `symlinkSync` 必炸，位置在 spawn 前 = SDK 起不来。→ T51c R4。
- minor⑤ **成立**。输出 `upstreamCalls:1`；`find` 返回被找到的元素本身（undefined）与未找到同值。上游 schema 兜底，非安全问题。→ T51c R5。
- 「核查过无问题」各项未复核（审查员已给依据，与经理 T51 验收所见一致）。
结论：五条全部成立，合并开 `open/T51c-market-bundle-hardening.md`。计 T51 线第 2 次失败；经理按任务 C 复核了路线（bundle 层挂载仍是 DSH 正路，问题都在文件手工改写的边角），不重拆，T51c 再失败则转 blocked 交用户决定是否保留 env 种子。

---

## 复审报告（reviewer 6.1 Sol，2026-11-11 08:20 EST，范围 02ee677d..fdb3bf7c）

总评：原五条对应场景已修复；新增 2 major + 1 minor（均已复现），建议继续返修。
- major（故障注入）：`start.ts:1004` 整文件截断写在 try 外——ENOSPC 部分写把完整 llm-pi-ai 配置截成半行且无恢复（改整写引入的回归）。建议非空分支保持追加；确需整写时临时文件完整写入校验后原子替换。
- major：`start.ts:1032` 循环 YAML 锚点（`&cfg/*cfg`）令 JSON.stringify 抛 TypeError，applySeed 内不受写后 catch 保护，启动失败。建议比较不了的值 WARN+不写。
- minor：`start.ts:1007-1010` 空文档（只有注释）落盘链：before=null → 前缀校验失败 → 种子被撤销（纯函数测试过但落盘链没测）。建议空文档按零前缀校验+补集成单测。
原问题核查过无问题：默认 `[]`/无尾换行块/流式不再破坏；规范地址成为当前源；坏 manifest 不覆盖；真实包目录保留不抛；undefined 被 main 拒（upstreamCalls=0）。旧探针重跑与修复行为一致。定向单测 16p/73p。新复现脚本 `/tmp/t51-review2-probe.mjs`。

### 三条已修（main 同日，见 T51c 回执补记）：tmp+rename 原子替换（ENOSPC 结构性消灭）/prefixKept 吞比较异常（循环锚点不抛 WARN 跳过）/空文档零前缀（注释空文档真落盘）；19p+复现脚本两段转正确+回归 3p/8p。
