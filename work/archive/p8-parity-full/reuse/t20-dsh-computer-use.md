# T-20 · dsh computer-use 平台与复用边界

调研日：2026-11-05。只读源码、已装产物及 npm 元数据；未启动 CU、未接触真实桌面或凭证。以下是选型建议，不是可运行验收，也不替代 T-30/T-31 护栏批准。

| 能力 | 候选 | 阶梯（1～5） | 许可证 | 维护 | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| Linux computer-use 接入 dsh | 已装 @deepseek-ai/dsh-computer-use / dsh-cua 0.2.2-alpha.2；Linux 驱动候选 @trycua/cua-driver 0.38.0 | 1（暂定，维护响应和实机兼容待核） | MIT / MIT | dsh commit 2026-11-04；trycua commit 2026-11-05、npm modified 2026-10-28；issue 维护者回应未验证 | 集成 | 复用 registry、工具生命周期与现成 Linux 驱动，禁止重写全套驱动；dsh 当前 bundle 仅接 macOS，不能直接打开即用。 |

## 已装与平台事实

- 本机 pnpm 产物中，computer-use、cua、cua-bundle 都是 0.2.2-alpha.2。已装 cua 的 lib/index.js 导出 installCua；bundle 是配置组合，不是跨平台驱动。
- `repos/deepseek-harness/packages/experimental/cua-bundle/cordis.patch.yml:6` 明确 `process.platform !== 'darwin'` 时禁用 macOS 组合；该快照未找到 cua-linux / cua-windows 实现。GitHub 对 deepseek-ai/deepseek-harness 的 `cua-linux` 搜索零结果。结论限于查到的快照，不等于未来或所有上游都不支持 Linux。
- `packages/computer-use/computer-use/src/index.ts` 的 ComputerUseRegistry 只排他注册 provider 名及 disposer，不定义 screenshot/click 接口，也不限制平台。
- `packages/experimental/cua/src/index.ts:145-159` 的后端是 helperPath、NativeChannelFactory、guidance、description。installCua 复用 per-Agent client、授权与清理；不是传入两个截图/点击回调即可。
- `packages/experimental/cua/src/protocol.ts:34-72` 包含 listApps/findApps/getApp、activate、listWindows、getState、snapshot 定位、输入、拖拽、截图等。`native-client.ts:1-200` 是 JSONL 请求/响应、取消、超时和单活动请求协议。

以上相对路径均基于只读参考仓 `/home/lingxufeng/bot/repos/deepseek-harness/`，固定 SHA `ce7073d51254c26cd63b22a60835b8f948deb447`。

## 最短路径与工作量

两条接法必须区分，不能将低配原型冒充完整对齐：

1. 若只要独立隔离屏的 screenshot/click/type/scroll/key/drag：独立 Linux provider，复用 dsh 注册/工具作用域，用 trycua 现有 SDK 或 MCP；不用伪造 macOS app/window 语义。估计 1～3 人日做接线与定向验证，安全审批、UI 展示及完整验收另计；该估计尚未实测。
2. 若要求与 dsh-cua 全套 API 同构：把 trycua 的应用/窗口/可访问性及像素坐标翻译成 dsh NativeChannel JSONL，保留权限、窗口身份、取消、释放、输出上限和审计。估计至少数人日至一周级，AT-SPI、Xvfb WM、中文输入与陈旧 snapshot 都有验证成本；不能称为几十行胶水。

对照候选 TideSparrow/computer-use-dsh 的 Linux helper 已用 xdotool，但 host 是旧式 harness.registerTool，且全局 lastShot、固定 /tmp、无显式显示边界。只能三级复制改造后备，不宜整仓直接装进当前 dsh；详见 T-23。

trycua 本身已存在 Linux 实现，不能把 dsh 当前 macOS-only 推广到它：
- https://github.com/trycua/cua/tree/814ee18f14f0607341690c8fa2a49814a9fc3fbd/libs/cua-driver/rust/crates/platform-linux/src
- https://github.com/trycua/cua/blob/814ee18f14f0607341690c8fa2a49814a9fc3fbd/libs/cua-driver/typescript/src/index.ts
- dsh macOS 来源账：`packages/experimental/cua-macos/native/upstream.json`，引用 trycua tag cua-driver-rs-v0.28.0、SHA 1b50c02e2d34734f64d2d22f54eb76cc97b4a663，但不是当前 Linux 包可无缝兼容的证明。

## 未验证与启用前门槛

trycua Linux 原生二进制在本机加载、Xvfb+WM 的窗口枚举/截图/点击、AT-SPI 与中文输入均未运行。Issue #3894 读到的是外部 contributor 评论，未证维护者回应，故严格“在维护”认定未闭环；这影响一级依赖批准，不构成改为自建的理由。需先完成定向验证，再定最终驱动与版本，不安装浮动 latest。

本次搜索覆盖 MANIFEST、本地 packages 与已装 node_modules、work/*/REUSE.md、GitHub dsh/trycua/TideSparrow 源码及 LICENSE、npm。未修改参考仓或产品代码。
