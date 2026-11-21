# T86：发送钮按压 spring + notice 进出场（G4 P0）——经理补单 + 验收不过

> 开单：manager (Opus 5.5) | 2026-11-15（施工先行，补单）| 施工：main (GLM 5.3)
> 分支：feat/T86 @ /tmp/bot-wt/T86 @ a48e4420
> 依据：RE-MOTION-0.78.1.md §2.2（sand-a3n0u-B）、§4.7（ui toast tray ui-1ci7j24-B、.2s transform/opacity）
> claimed：a48e4420
> accepted：2026-11-15 8451ba3f

## 经理验收（2026-11-15，HEAD a48e4420）——不通过
- 重跑：t86-press-toast 1 passed（3.8s）；回归 1 passed（t85-scroll 不在该 worktree，实际只跑了 t94-send-key）。check 14 未重跑（只改 css+spec）。回执 receipts/T86.receipt.md **不存在**。
1. **toast 选择器全落空**：`.sand-message[data-kind="notice"]`、`.sand-notice-card`、`.pbots-notice`、`[data-leaving]` 在 app/ui 源码里 grep 都是 0 处（只有这条 css 自己），进出场动画打不到任何元素。真正的 tray 是 `frontend/src/recovered/features/window-chrome/notification-host.tsx:202 .sand-tray`，另有 `settings/overlay/notice.tsx:113 .sand-settings-toast`。spec ② 只断言 keyframes 存在，测不出这个问题。
2. **按压挂在 `:active` 上**：鼠标一松开 :active 就失效，0.5s 的 spring 在约 100ms 的点击里被截断、回弹缺失。应改为按下时挂 class/data 属性，animationend 再移除（或用其他办法保证整段播完）。
3. 线性近似：Chromium 原生支持 CSS `linear()`，43 档字符串可以从 0.78.1 index.eager-app offset 434091 原样搬过来。我**不接受**近似记档，原值照搬也不更费事。
4. reduced 降级：方向可以；toast 换成真选择器后，reduced 规则要一起换。

## 返修验收
1. `cd /tmp/bot-wt/T86/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t86-press-toast.spec.ts` 1 passed，且：
   - 按压：click（down+up）后 100ms 和 400ms 两次读 animationName，都含 press；timing-function 含 `linear(`
   - toast：真实触发一个 `.sand-tray`（或 settings toast），断言该元素 computed animationName/transition 生效，不只查 keyframes 存在
   - reduced：同一元素 animationName 为 reduced 版，且无 transform
2. 回归 t94-send-key 1p；补写 receipts/T86.receipt.md

## 经理验收（2026-11-15，HEAD 8451ba3f）——通过
- 重跑 `run-e2e.sh t86-press-toast t94-send-key` → **2 passed (9.3s)**，与回执 1p+1p 一致。spec 读 100ms/400ms 两次 animationName 含 t86-press、timing 含 `linear(`。check 14 未重跑（frontend/ 零改动，同 T90/T94 先例）。
- 改动范围：p5-55-layout.css / press-feedback-t86.ts / shim index.ts / spec，四文件，无删弱测试。
- ① pointerdown capture 挂 `.t86-pressing` + animationend once 自摘，成立。② linear() 与 0.78.1 原产物 index-Dh7EWA8t.css 同为 **32 档**（回执「43 档」是口误，原串一致）；keyframes 1→1.06@40%→1 .5s。③ `.sand-tray`/`.sand-settings-toast` 真选择器。④ reduced 同步。
- 小瑕（不挡）：shim index.ts:T81 行注释被拆到 T86 行尾；连按时 class 已在不会重播。并入下次碰 shim 的单顺手修。
