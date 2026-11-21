# 集成重建：两框架隔离试跑结论（goal-126bc430 步骤②）

日期：2026-11-20
状态：试跑完成，结论已足够支撑步骤③（功能对照+基底定案）

## DS-Bot（Fei2411，Apache-2.0，v0.3.8）——独立 App 形态，全链已通

### 隔离试跑结果（零安装污染：全部在 /tmp/dsbot-trial/）
- AppImage 371MB 解包即用（无 FUSE 时 --appimage-extract）
- GUI 全链：start window → 引擎 spawn → team window → 主界面（whale）→ Add a member 表单（Bot name / Which model / How should it behave / What should it never do / Should it open the conversation）→ #team 群聊视图
- 引擎 headless 全链（**关键验证**）：
  - host.mjs 直跑（bundled node v24.21.0）→ dsh web 起在随机端口（token URL）
  - WebSocket 客户端（复用我方 app/sdk/examples/lib/client.mjs）→ session/create / session/prompt / session/list / follow 全应答
  - **模型绑定攻克**（详见下）→ 首条真模型回复 '4'（litellm glm-5.3-flash）

### 模型绑定三层攻克（pinned DSH 0.2.2-rc.1）
1. settings.json 无效：strace 实证引擎从不读该文件（新版 dsh 才用）
2. .credentials.yaml records 段格式错（key 要 `<scope>/<id>`）→ **正解=refs 段**：`version:1\nrefs:\n  DEEPSEEK_API_KEY: <key>` → credentials 链通（错误从 no API key 变 401）
3. **终解=profile patch 层**：`profiles/ds-bot/cordis.patch.yml` 写 `- id: llm-pi-ai` providers.litellm 段（apiKeyEnv/api/baseURL/models）+ `- id: agent-default-model`（provider litellm/model glm-5.3-flash）→ selectModel 成功 + 真模型回复

### 架构要点（对我们的价值）
- 每 bot = dsh root Session（Chief 主 bot 有 create_bot/stop_bot/post_to_group 特权）
- kickoff 主动开场（首条 greeting）——用户在意的「打开先回复我」在位
- SuperAgent 接缝=local-agents ACP stdio 层（engines.js KINDS=['acp','codex','claude']）
- 独立 app 形态（pinned DSH 自带，不污染系统 dsh）——满足用户「独立 deb/app」要求
- 引擎可脱离 GUI headless 驱动（我们的 e2e/CDP 测试体系可直接复用）

## Tobs（BotHarness/DeepSeekBot，MIT）——插件形态，web 起不来（本环境）

### 隔离试跑结果（DSH_HOME=/tmp/tobs-trial/dsh-home）
- 安装成功（npmmirror 镜像 1m9s）；tobs CLI create/list/show 全通
- **卡点：dsh --profile tobs-trial web --port 3199 在本 headless 环境冷启动 >5 分钟且 UP 后瞬态消失**
- 基线对照：纯净 dsh web 60s 内 UP——dsh 本身没问题，是 tobs profile 的 web app 在此环境起不来
- 无独立 app 形态（DSH 桌面插件）；tobs send 等 live 命令要 Tobs Connect 远程配对（非本地路径）
- 用户倾向项（重构友好：PersonaBot+orchestrator 双角色+SQLite 记忆库），但「跑起来」在本环境未验证

## 结论（进步骤③的输入）
- **DS-Bot 满足可运行性硬门槛**（独立形态+引擎全链+真模型），Tobs 在本环境不可运行验证
- 功能对照表（步骤③）将基于 DS-Bot 实跑 + Tobs 源码静态分析双源
