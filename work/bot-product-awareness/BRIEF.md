# BRIEF：bot 的产品生态认知（2026-11-08 01:4x）

## 用户原话
> 他看不到其他的bot, 我说创建其他的bot他都不知道, dsh的superagent也不知道在哪里

（用户在真实产品实例中与主 bot 对话时发现——01:3x，实例刚重启后测试）

## 现象拆解（三条）
1. **bot 看不到其他 bot**：侧栏的模板 bot/其他 bot 对 AI 不可见——它不知道自己运行在多 bot 环境里，也不知道有哪些同伴
2. **bot 不知道怎么创建 bot**：用户对 bot 说「创建一个新的 bot」，bot 无从知道产品面有「New → 创建对话框」这条路径，也无法代用户创建
3. **superagent 缺位**：dsh 的 subagent/编排能力（0.18 生态的 superagent 概念）在 bot 侧既无工具也无认知——与 T27（用户编排研究：跨 bot 交流/subagent 呈现）直接相关

## 初步定位（待经理探针核实）
- 主 bot 的系统提示是 dsh 通用 agent 提示，**未注入 hivebot 产品生态**（多 bot/侧栏/创建路径/模板/superagent）
- kickstartPrompt（T25）只管新 bot 自我介绍，不含产品认知
- T27 编排研究等用户结论——本 BRIEF 第 3 条是 T27 的输入之一

## 期望
用户能与 bot 用自然语言完成「看看其他 bot / 建一个新 bot / 调 superagent」，bot 要么知道并指路，要么有工具能做。
