# Hivebot 配置指南（三层总览）

> 目标读者：想自己跑通、自己改配置、自己验证的人。
> 每项配置写明：**改什么行为 / 默认值 / 重启还是热生效 / 怎么判断已生效**。
> 状态标注：✅ = 运行时实证过；⚠️ = 代码推断未实证；❌ = 已知不完整。

## 全景：三层配置架构

```
┌─ 第 1 层：DSH 引擎 profile（模型路由 + 插件装载）
│   cordis.patch.yml —— 模型从哪来、SuperAgent 插件怎么挂
├─ 第 2 层：SuperAgent 插件（编排行为）
│   stateDir 里的 orchestrator.sqlite + 运行时设置（policy/eval）
└─ 第 3 层：安装与运维（provision.sh / engine.sh / health-check.sh）
```

---

## 第 1 层：DSH 引擎 profile（必填）

**文件**：`<home>/.ds-bot/profiles/ds-bot/cordis.patch.yml`
**改完要重启引擎**（patch 只在启动时读）。
**生效判据**：引擎日志无 `ValidationError`，且 web UI 模型选择器出现你的模型。

### 1.1 模型路由（llm-pi-ai + agent-default-model）

没有这两块，引擎不知道模型从哪来——所有 bot 发消息都会报
`model-unavailable` 或 `no API key for provider route`。

```yaml
- id: llm-pi-ai
  config:
    providers:
      litellm:                      # ← 你的 provider 名，可自定义
        apiKeyEnv: DSH_LITELLM_API_KEY   # ← 从哪个环境变量读 key
        api: openai-completions          # OpenAI 兼容接口用这个
        baseURL: http://127.0.0.1:4001/v1  # ← 你的网关地址
        models:
          - id: glm-5.3-flash            # ← 模型 id，与网关侧一致
            contextWindow: 1000000
- id: agent-default-model
  config:
    provider: litellm                # ← 对应上面的 provider 名
    model: glm-5.3-flash             # ← 对应上面的模型 id
```

- **key 放环境变量**（`DSH_LITELLM_API_KEY=sk-xxx`），不写进 yml。
- `compat` 四项（supportsDeveloperRole/supportsStore/maxTokensField/requiresReasoningContentOnAssistantMessages）按网关实测调；上面模板已按 LiteLLM+GLM 验过。
- **怎么验**：起引擎 → 开 web UI → 给 bot 发一条消息 → bot 正常回复 = 路由通。
  若报 `model-unavailable`，九成是 yml 缩进或 provider 名不一致。

### 1.2 SuperAgent 插件装载（bundle 层单一权威）

插件 insert 条目和 worker/router preset **只在 bundle 层**（插件包内
`cordis.patch.yml`，引擎经 `dsh.bundle.patch` 自动加载，先于本层应用）。
profile 层只补静态配置——preset 不要在 profile 里重复定义（旧模板曾整段抄录，
改 bundle 层会被 profile 副本静默覆盖，2026-11-22 已收敛）：

```yaml
- id: dsh-superagent
  config:
    stateDir: /path/to/sa-state      # ← 编排数据库目录（可任意）
    dataDir: /path/to/.ds-bot        # ← 引擎数据目录（发现 Chief 用）
```

- `dataDir` 指对了，SuperAgent 才能自动发现主 bot（Chief）。
- github/feishu 监听源 bundle 层默认 `disabled: true`；要启用写
  `- id: dsh-superagent-github` + `disabled: false`（Feishu 还需配 bot CLI）。
- 要改 preset（工具集/超时/插件清单）→ 改 `app/superagent/cordis.patch.yml`
  并重建插件，不要在 profile 层抄副本。
- **怎么验**：`curl -H 'x-orchestrator-request:1' -b <cookie> http://127.0.0.1:<port>/orchestrator/api/state`
  回 `setup.problem: null` + `masterId` 是 Chief 会话 id = 插件活着；
  开 ticket 报 `Unknown agent preset` = bundle 层没加载（查引擎日志
  `declares no dsh.bundle` 警告——插件被装成普通依赖了）。

---

## 第 2 层：SuperAgent 运行时设置（可选调优）

**改法**：HTTP 面（要 cookie + `x-orchestrator-request:1` 头），改完**热生效**（不用重启）。
**生效判据**：`GET /orchestrator/api/settings` 回显新值。

| 块 | 改什么 | 默认 | 备注 |
|---|---|---|---|
| `policy` | 谁的消息可进编排（allowedSender） | 本地 owner 自动放行 | 显式配了表就按表来；显式空表=全拒 ✅ |
| `eval` | observe（只看）/ auto（自动决策） | observe | auto 靠主会话 LLM 评估，120s 超时是已知边界 |
| `executor.maxWorkers` | ticket worker 并发上限 | 3 | 只管 SuperAgent ticket 工人；TEAM_TOOLS 副手 fan-out 走 dsh-subagent（默认 8），两个旋钮各管一条路径 |
| `executor.blockedCommands` | worker shell 禁用命令名 | 空 | 与 DSH 审批是**叠加**关系：两层都放行才放行，只会更严不会更松 |
| ticket 兜底 | 异步工单队列 | 实验性 | TEAM_TOOLS 是主编排路径，ticket 是兜底 ⚠️ |

- 会话段轮转自动重绑（60s 巡检）+ 崩溃残锁自愈已内置，无需配置 ✅。
- **怎么验**：`GET /orchestrator/api/state` 的 `health` 全 ready。

---

## 第 3 层：安装与运维脚本

| 脚本 | 功能 | 用法 |
|---|---|---|
| `scripts/dsbot-provision/provision.sh` | 对解包的 DS-Bot AppImage 一键注入以上全部配置 | `provision.sh <appimage-root> <home>`（`--superagent-src` 指源码）✅ |
| `engine.sh`（trial 内） | 幂等起/停引擎 | `engine.sh start\|stop\|url`——**端口每次启动会变**，用 `url` 取当前值 |
| `scripts/health-check.sh` | 四段读数：引擎进程/web 端口/Chief 绑定/编排面 | 全绿=链路健康；`DRIFTED`=绑定漂移 |
| `scripts/fresh-boot.sh` | 干净 home 全链回归（预配置→kickoff→编排落盘） | exit 0 = 全过 ✅ |
| `scripts/phone-link/fake-phone.mjs` | 协议级假手机（配对/收发验证） | 见 `scripts/phone-link/README.md` ✅ |

**端口提醒**：引擎 URL 每次启动变——别抄固定地址，`engine.sh url` 或
`ls -t host*.log | head -1` 里 grep `dsh web` 取当前值。

---

## 实验性：手机链（当前状态 ❌ 未完成）

- **协议层已验 ✅**：本地 relay + 假手机 Noise IK 配对 + 发消息 + 读回复全通
  （`scripts/phone-link/fake-phone.mjs`，复跑即验）。
- **APK 层不成立 ❌**：官方 APK 只有 arm 库，x86_64 emulator 上必崩；
  本地重打包版（`/tmp/apk-repack/final4.apk`）可安装可启动，但**真 UI 配对未走通**
  （深链送达后 app 内确认流没完成）。配方已存档 `work/phone-link/APK-BUILD-NOTES.md`。
- 手机端要继续：优先直接拿 arm 真机装官方 APK，跳过 emulator 层。

---

## 快速上手（一台干净机器）

```sh
# 1. 解包 AppImage（或装好任意 DS-Bot 0.3.8+）
./DS-Bot-*.AppImage --appimage-extract

# 2. 一键注入配置（模型网关地址 + key 环境变量按需改 provision.sh 头部变量）
DSH_LITELLM_API_KEY=sk-xxx scripts/dsbot-provision/provision.sh <root> <home>

# 3. 起引擎 + 验证
engine.sh start && scripts/health-check.sh
```

三段全绿后，浏览器开 `engine.sh url` 给的地址（token 在引擎日志里），
就能建 bot、对话、看编排了。
