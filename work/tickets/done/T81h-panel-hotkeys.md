# T81h：面板热键三件（RE-KEYBINDINGS 第二批 P1）

> 开单：补记（原单未落盘，范围以 receipts/T81h.receipt.md 为准，T76 先例；编号 T81 已被 stop 取证单占用，热键单改记 T81h，原 T81 回执被 f7131243 覆盖，已从 66f1c141 复原）| 施工：main (GLM 5.3)
> 分支：feat/T81 @ /tmp/bot-wt/T81（78139268→183280af）
> accepted：2026-11-15 183280af

## 经理验收（2026-11-15）
- 改动范围：新增 `overrides/modules/panel-hotkeys-t81.ts`(+33)、`shim/src/index.ts` 接线(+3/-1)、新 spec `t81-panel-hotkeys.spec.ts`(+40)；frontend/ 零改动，check differs=14 不变。
- 重跑：t81-panel-hotkeys → **1 passed (9.3s)**；回归 t90b-composer-suggest + t94-send-key + t94b-help → **3 passed (24.6s)**（回执写 2p，glob 多带了 t94b，均绿）。
- settings 非 toggle：认可。ProductionRenderer.tsx:3508 `onToggleSettings` 末尾恒 `setAgentSettingsOpen(true)`；开=`[data-info-row="settings"]`、关=面板 `Close details` 双路，不动锁树，合理。
- info 降级：认可记档。DSH 无 computer bridge 时 `.sand-chat-header__computer` 不渲染，spec `hasComputer` 分支保留，接 bridge 后自动生效（届时该格须真跑一次）。
- newGroupChat：认可不做（无实底，YAGNI）。
- 遗留小毛（不返修，后续热键单顺带）：
  1. settings 键判 `ev.key === "<"` 依赖 US 布局，`ev.code === "Comma"` 更稳。
  2. 关路选择器 `aside.sand-info-pane[data-open] button[aria-label="Close details"]` 与 info pane 同类名——有 computer 时 info 开着按 mod+shift+comma 会关 info 而非开 settings；spec 的 settings 断言也不区分两种 aside。接 computer bridge 时一并收窄。
  3. `shim/src/index.ts` 注释错位：T94 行的说明（mod+/ 帮助 + mod+l）被挪到 T81 行尾。
