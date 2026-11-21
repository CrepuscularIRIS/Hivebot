# T7b 参照（降级：静态读 CTX/DIA 布局，未 R3 渲染——入口只在 team 设置面，R3 未覆盖）

## 文案（0.78.1 en 字典，键→串）
| 键 | 串 |
|---|---|
| 76J7mZ | Pick from your skills |
| IYyHwi | Added skills |
| ggmjet | All skills |
| y0eCAK | {#} suggested（复数） |
| WnW32b | {#} file was skipped because this Bot already has {MAX_BOT_SKILLS} skills |
| YNjRIY | {name} is already listed |

## 布局事实（chunk-team-setup-new-skill-dialog-DwGXKoR0.js / chunk-team-bot-context-dialog-BhePh4Ev.js）
- 布局全用 `sand-*` 原子类（sand-78zum5=flex 列、sand-dt5ytf/1qjc9v5=间距、sand-1s85apg=列表滚动区、sand-11wthnw+d4r4e8+tyxrsu=列表项行）。
- readListing 从 team 状态对象 `n.known` 读（非直连 RPC）；Add/Remove 才发 RPC（AddGrokBotAgentSkill 族）。
- 容器差异（已知，不为此改我们的 pane）：原版是弹窗，我们是设置 pane 里的段+内嵌展开，记「已知差异」。

## 截图对照的降级口径
ref 一栏以本笔记 + CTX/DIA 源码布局为准，compare 图里 ref 侧放本笔记要点拼版，标「未验证（降级）」。
