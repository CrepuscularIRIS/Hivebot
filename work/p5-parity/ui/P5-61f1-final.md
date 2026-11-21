# P5-61.f1 定稿（frontend-dev · Opus 5.5）

输入：DIAG-P5-61 拆分 ①②③（无 ux-proposer 双提案——修复类任务，分歧点对照诊断建议与 0.18 参照源 `repos/grok-bot-0.18-reconstructed/source/electron-main/{prefs/theme-controller,window-chrome}.ts`）。

| # | 分歧点 | 取舍 | 理由 |
|---|---|---|---|
| ① | 封面颜色来源：A 封面自读 localStorage / B 封面吃 desktop 桥 `theme.initial.resolved` | 自定 B | 与正文同一读链同一时机（`installShim` 先建 desktop 再挂封面），不复制解析逻辑；封面期间系统切换经 `theme.onChanged` 同步 |
| ① | 封面 CSS 是否保留 `prefers-color-scheme` | 删除，改 `#pbots-boot[data-tone=dark]` | media 是反色根因，不能留第二个来源 |
| ② | 过渡：A 缩短/删 p5-55-layout.css 三处过渡 / B 主题切换那一帧全局禁过渡（next-themes `disableTransitionOnChange` 同款） | 自定 B，CSS 不动 | 三处只是诊断看到的，0.18 上游与 p5-57.css 还有同类过渡；B 在 desktop 桥唯一推送点一次修全，悬停 120ms 动效保留（原版观感）；data-theme 与全部颜色同帧到位 → bothThemes 的 600ms 等待只是冗余不打架 |
| ② | 禁过渡选择器权重 | `:not(#\#)` 抬到 (1,0,0)+!important | override 用 `.class !important`，裸 `*` 压不住 |
| ③ | 原生控件着色：A 实现 `setTitleBarOverlayTone` / B 主题偏好下沉宿主 `nativeTheme.themeSource`（0.18 theme-controller 同构） | 自定 B，tone 仍空实现 | tone 是 computer-use 遮罩色调（43px 暗化，只有 teach-recording 传 true，本产品无此功能）；白块根因是宿主不知道 preference。B 后现有 `nativeTheme.updated → setTitleBarOverlay` 自动生效 |
| ③ | 宿主是否持久化 | 是：`<dataDir>/theme-source` 镜像，建窗前应用；`backgroundColor` 同步 | 冷启首帧（shim 跑之前）原生件/窗口底色就对；renderer localStorage 仍是权威，启动即回推纠偏 |
| ③ | IPC 形状 | `pbots:theme` 单向 send `{preference, resolved}`，preload 窄函数 `pbots.window.setTheme` 只转两字段，main 校验 sender + 枚举 | 不扩白名单之外的能力 |
| ③ | overlay 按什么着色（实测修订） | 按 renderer 推来的 `resolved`，推到前按 `nativeTheme` | Xvfb 实测 `system` 下宿主 `shouldUseDarkColors=true` 而页面 media=light，两源会分叉；以页面实际所画为准 |
| ③ | 何时写 themeSource（实测修订） | 只在 preference 相对上次推送变了才写 | 每次回推都写会把外部设的 themeSource 改回（theme-dual 路径 B 红过一次） |
| ① | 冷启首帧（残留，未修） | 豁免开头至多 1 帧 GTK 窗底 #fafafa | 窗口映射到 Chromium 首次 present 之间的 X 窗底，与偏好无关、`backgroundColor` 管不到；Xvfb 无合成 WM 才拍得到，真实桌面是否可见待用户目检 |
| 测 | 「media 相反」怎么造 | DOM trace 用 emulateMedia（DIAG 同法），录像逐帧不用 | 修后宿主 themeSource=偏好，产品里 media 不会与偏好相反；emulateMedia 造出的不可达态下上游 `color-scheme: light dark` 画布在封面淡出时露暗底（亮 2/7 次），真实 reload 0/20 |
