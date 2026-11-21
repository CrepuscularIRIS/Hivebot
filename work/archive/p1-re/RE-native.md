# RE-native · 0.78.1 native 模块用途与 MVP 判定

日期：2026-11-01 · 来源：RE-unpack §3（9 个 .node 清单）+ RE-w05.md（axis1-deps.tsv 依赖差、§6 对照）· 机械整理，无新增逆向证据

| 模块 | 路径 | 用途一句话 | MVP? | 证据锚点 |
|---|---|---|---|---|
| `@anysphere/jpeg-napi` | `@anysphere/jpeg-napi/jpeg-napi.linux-x64-gnu.node` | JPEG 图像原生编解码（包名直译，未代码验证） | N | RE-unpack §3 清单表；axis1-deps.tsv W05-1-12（0.78.1 新增）；RE-w05 §6 证实 |
| `cursor-proclist` | `cursor-proclist/build/Release/cursor_proclist.node` | 进程列表查询（包名直译，未代码验证） | N | RE-unpack §3 清单表；RE-unpack §5.1「保留」；RE-unpack §4 `file:../vscode/native-modules/cursor-proclist` |
| `@cursor/node-tree-sitter` | `tree-sitter/build/Release/tree_sitter_runtime_binding.node` | tree-sitter 语法解析运行时的 Node 绑定（供代码语法解析；包名直译，未代码验证） | N | RE-unpack §3 清单表；RE-w05 §6（0.18 原版实物在 dist/deps，保留不换位） |
| `tree-sitter-bash` | `tree-sitter-bash/prebuilds/linux-x64/tree-sitter-bash.node` | tree-sitter 的 bash 语法 grammar（shell 命令/脚本解析；包名直译，未代码验证） | N | RE-unpack §3 清单表；RE-w05 §6 同上行 |
| `sand-address-lookup` | `sand-address-lookup/build/Release/sand_address_lookup.node` | 地址查询（包名直译，何种「地址」未查明） | N | RE-unpack §3 清单表；axis1-deps.tsv W05-1-38（`file:native/address-lookup`，0.78.1 新增）；RE-w05 §6 证实 |
| `sand-card-text-recognition` | `sand-card-text-recognition/build/Release/sand_card_text_recognition.node` | 卡片文本识别（OCR 类；包名直译，未代码验证） | N | RE-unpack §3 清单表；axis1-deps.tsv W05-1-39（0.78.1 新增）；RE-w05 §6 证实 |
| `sand-devicecheck` | `sand-devicecheck/build/Release/sand_devicecheck.node` | 设备校验（包名直译；RE-unpack 局限节注其与 messages-mac 的平台对应关系未验证，疑 macOS 侧能力） | N | RE-unpack §3 清单表；axis1-deps.tsv W05-1-40（0.78.1 新增）；RE-w05 §6 证实；RE-unpack「局限与未验证项」 |
| `sand-notification-settings` | `sand-notification-settings/build/Release/sand_notification_settings.node` | 系统通知设置读写（包名直译，未代码验证） | N | RE-unpack §3 清单表；axis1-deps.tsv W05-1-41（0.78.1 新增）；RE-w05 §6 证实 |
| `sand-window-capture` | `sand-window-capture/build/Release/sand_window_capture.node` | 窗口截屏捕获（包名直译，未代码验证） | N | RE-unpack §3 清单表；axis1-deps.tsv W05-1-42（0.78.1 新增）；RE-w05 §6 证实 |

注：

- 两个信息源（RE-unpack §3、axis1-deps.tsv）均无功能描述，用途列全部由包名/路径直译并逐条标注置信级别，未做 .node 导出符号或 require 方调用点的代码级验证。
- MVP 口径取 LEARNINGS 2026-11-01 的最小可跑链路「起 → 建 session → 发消息 → 流式回复」；RE-unpack 与 RE-w05 两份报告均无任何 native 模块参与该链路的证据，MVP 列按派发默认全部 N。
- 另有 1 个 wasm（`dist/deps/web-tree-sitter/tree-sitter.wasm`，185,642 B）非 .node，不在本表，见 RE-unpack §3 尾注。
