# T73a：探针——「Connect 后所有 bot 直接可用」在 dsh 上走哪条路（只取证，不改产品）

> 开单：manager (Opus 5.5) | 日期：2026-11-12 | 施工：main (GLM 5.3)
> 来源：Q-055-3（用户 2026-11-12 = A，REA 已查）；`work/grok-0.79.3-re/RE-CONNECTOR-GRANT-0.78.1.md` §0、§1、§3、§5-1
> 分支 / 作业目录：不建产品分支；探针脚本与输出放 `work/ui-borders-connect/evidence/T73a/`
> claimed：2026-11-12 main (GLM 5.3) @ evidence/T73a（P1/P3/P4 全取，P2 不再必要）
> accepted：2026-11-12 @3dcdac43（取证单，经理复核结论表↔原样输出；P2 未测与 p4 并入 p3.out 的偏差认可，见 receipts/T71-T71b.acceptance.md）

## 目标
回答一个问题并附实测输出：**装上一个连接器后，怎样让已有 bot 和新 bot 都拿到它的工具**，且一个坏连接器不拖垮所有 bot。答案决定 T73d 的方案（经理据此写 T73d）。

## 现状（经理核过，@8999af14）
- 装：renderer `market-store.ts:179` 固定 `installBundle {enabled:false}`；main `m1-api/index.ts:187` 强制 `enabled === false`。
- 用：bot = dsh session，建时 `createBotWithConnectors`（`main/m3-meta/orchestrate.ts:133-220`）→ SDK `p2temp/session.createWithConnectors`（`sdk/src/p2temp/index.mjs`）把「基础 preset 行 + 所勾连接器 bundle 的 insert 行」注册成内容寻址的临时 preset `p2temp-<hash>`，session 绑定该 preset；重启按 `bots.json` recipe 走 `preset.ensure` 重放。p2temp 头注释明说「不支持对已开聊 session 热启用」。
- dsh 无「改 session 的 agentPreset」接口（经理 grep `repos/deepseek-harness/packages` 无 setPreset 类方法）。

## 要测的四格（每格：脚本 + 原样输出 + 一句结论）
- **P1 profile 级启用**：隔离 HOME 起 SDK runtime，建 bot A（无连接器，走现行 #3/#4），然后对一个预置包走 `installBundle {enabled:true}`（直接打 dsh，绕过 M1 守卫，仅探针）。看：(a) A 不重启下一轮 tools 列表里有没有 `mcp__<server>__*`；(b) runtime 重启后 A 有没有；(c) 再建 bot B（同样无连接器）有没有；(d) 已经勾了该连接器的 p2temp bot C 是否出现**重复行 / broken**。
- **P2 同 id 重注册 preset**：用一个稳定 id（如 `p2temp-bot-<botId>`）`agentPresets.register` 两次（第二次多一个连接器行，必要时先 unregister）。看已开聊 session 下一轮是否拿到新 revision；不拿的话 runtime 重启后（recipe 重放）是否拿到。
- **P3 坏连接器的爆炸半径**：装一个需要参数却没配的包（零参数启动必挂的那类；可用 filesystem 去掉 launch 的副本 fixture），在 P1 / P2 两条路下各看：别的连接器、别的 bot、新建 bot 是否受影响（preset broken 是全挂还是只挂这一行）。
- **P4 卸载 / 关闭**：P1 路径下 `setBundleEnabled(false)` 或卸载后，已开聊 bot 下一轮工具是否消失。

## 边界
1. 不改 `app/**` 任何文件。探针脚本放 `work/ui-borders-connect/evidence/T73a/`，复用 `app/sdk/tests/support/runtime.ts` 的 `launchSdkRuntime` 与 `sdk/tests/e2e/market.test.ts` 的装包写法。
2. 隔离 HOME / TMPDIR，DBus 指向不存在路径；进程用 `~/bot/scripts/bot-reap` 清。
3. 一格测不出（接口不存在 / 报错）就照实记录原样报错，不绕。

## 验收（写命令，不写感觉）
1. `ls work/ui-borders-connect/evidence/T73a/` → 有 `p1.out p2.out p3.out p4.out` 与对应脚本
2. 回执 `receipts/T73a.receipt.md` 有一张表：格 × (热 / 重启后 / 新 bot / 坏包影响) × 实测值，每个值能在 `.out` 里 grep 到原样行
3. 回执末给出施工方倾向（P1 路 / P2 路 / 都不行）+ 理由；经理复核后定 T73d

## 为什么这样验收
T73d 是改 bot 拿工具的主链路，选错路会返工整条 #4 / #21 恢复链。这张单只买证据：每个结论必须对得上一行原样输出，不接受「应该可以」。

## 产出
- `work/ui-borders-connect/evidence/T73a/*`、`receipts/T73a.receipt.md`
