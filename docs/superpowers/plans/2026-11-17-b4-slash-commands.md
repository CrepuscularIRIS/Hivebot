# 2026-11-17 · 批 4：A8 斜杠命令菜单（输入面）

## Goal

composer 输入 `/` 弹命令菜单（上下键+Enter 选中、Esc 关闭）——1.1.0 输入面 P0 缺口的第一块；命令框架对齐上游 `{id,label,icon,keywords}` 形态。

## 规格锚

- 1.1.0 prompt-editor（chunk-prompt-editor-DXgZfrbH.js）：flag `sand_hide_slash_commands` 门控——slash 菜单存在但命令清单运行时注册（静态只枚举出 10 条 dev 命令：feature-flags/experiments/import-template/rpc-trace）
- 0.18 suggestion 框架（rich-text-editor.tsx 四 PluginKey + editor-suggestion-provider.ts 三族）——slash 为第五类
- 命令对象形态：`{id, label, icon, keywords}`（1.1.0 index.eager-app 实证）

## Architecture

- rich-text-editor.tsx：新 SLASH_PLUGIN_KEY + slashSuggestion（'/' 触发，tiptap Suggestion 同款四插件模式）
- 命令源：overrides 侧静态注册表（首版 5 条：New bot / Search / Connector market / Keyboard shortcuts / Rollback last turn——全部对应 HiveBot 已有真实动作）
- 选中动作：insert 删除触发词并执行对应 UI 动作（与 CommandPalette 共用动作函数）
- flag 门控对齐：`sand_hide_slash_commands` 默认关（即显示）——我们无 flag 系统，直接常显

## Global Constraints

- 同批 2/3；e2e 前 build；不破坏 t90b/t90c 既有面板 spec（EMOJI/MENTION PluginKey 不动）

## 任务

### B4.1 slash 插件 + 5 命令

Files: app/ui/renderer-grok/overrides/modules/rich-text-editor.tsx, slash-commands.ts（新）, tests/e2e/b4-slash-commands.spec.ts（新）
- slashSuggestion：'/' 行首触发（query 过滤 keywords）；面板复用 suggestion renderer（同 mention 视觉）
- 5 命令：new-bot（createBots 同路）/search（CommandPalette open）/market（openMarket）/keys（keybinding help）/rollback（T93 链 dev 口）
- e2e：'/' 弹面板→上下键→Enter 执行（new-bot 打开创建对话框即证）
- commit: feat(b4.1): 斜杠命令菜单

## Review Focus

1. '/' 触发与 @/emoji 冲突（同字符位互斥）→ 单测/手测三态
2. 面板已开时切触发词（@→/）残留 → e2e 连续输入 '@/' 断言只一个面板
3. Enter 在 slash 面板=执行命令非发送（拦截序）→ e2e 断言编辑器清空且命令执行
4. readOnly 分支（连接器失效）面板不弹 → e2e
5. 命令动作与 CommandPalette 重复实现 → 共用动作函数（grep 验证无两份）
