# G2-r2 · 席 B（6.1 Sol）

> 主会话代录：本席运行约束禁止写文件，以下为其回报原文，未经改写。

seat: B
verdict: REVISE
confidence: high
findings:
- [MEDIUM] /home/lingxufeng/bot/work/p4-ui/REUSE.md:16 — 汇总文件仍指示复用完整 `connect()`，与 v2 已修正的 socket 方案冲突，重新引入 A-M1 的错误捷径 — 证据: REUSE:16 写「只复用 client.mjs:66-81 的 connect()」；/home/lingxufeng/bot/work/p4-ui/PLAN.md:34 则明确「cookie 交换只抄 :67-75，socket 自建」，并说明原 connect 在 :77 使用的 MuxSocket 会丢未知 streamId 帧 — 建议: 作为 W0 派发附加要求，将 REUSE 此行同步为「只复制 cookie 交换 :67-75；U-00 自建 tap socket、重连与 generation；W1 只消费」，不要 import 原 connect。
reverse_take: 最可能失败在两个派发依据互相矛盾，使 builder 按旧 REUSE 搬回会丢帧的 connect；更笨更稳的是只保留 PLAN 已明确的 cookie 交换复制方案。
核对：两条原 HIGH 已完整落到计划：PLAN:15,34 明确 pbots-app://、file:// 不获桥权限与五组红绿测试；PLAN:20,45 固定 P4-BASE..当前 main HEAD，已无聚合分支引用。
核对：U-24/U-12 依赖、REUSE 文件、socket 归 U-00、U-13⑥⑦、U-14 超时、U-16、W2 测试区域及 D12①均已有明确落点；除上述 REUSE 残留冲突外，未发现新增 HIGH/BLOCKER。
落盘：运行约束禁止写评审 Markdown；以上为完整原文，请主会话代录至 work/p4-ui/panels/G2-r2-B.md。
