# B28：bot 模板面评估（agentPresets ↔ bot-template）

**日期**：2026-11-18
**结论**：**已等价实装，无需施工**（评估批，不产生代码改动）

## 一、0.78.1 规格（挤出锚）

- `createAgent({templateId?})`（eager-app @2804900）——创建时可带模板
- `createAgentFromTemplate({shareId, agentId, name, avatarShape, avatarColor, expectedActiveVersion:1, isAutomatic, creatorContext})`（@4183022）——从分享模板实例化
- `publishBotTemplate` / `getBotTemplateVersion` / `getBotTemplateForSourceAgent` / `deleteBotTemplate` / `setBotTemplateVisibility`（Id 组 @253317）——模板 CRUD，全云端
- 市场：`Mpe(e,t)=[...e.featuredListings,...e.listings].find(slug===t)`（@327561）——listing 由 slug 索引，点击创建走 createAgentFromTemplate
- bot-template-details-dialog chunk（35 id：Publish/Publishing/Copy link/Memories/Skills/Context/Routines/Integrations）——发布/分享面

## 二、DSH 实底与我方现状

| 0.78.1 面 | 我方现状 | 判定 |
|---|---|---|
| createAgent({templateId}) | `new-bot-dialog.tsx:135 createBot({preset: presetId, ...})`——Preset radio 组在 More options（:180 `<legend>Preset</legend>`，isDefault 预选） | **等价**：preset=模板最小等价（prompt 模板+model 绑定） |
| createAgentFromTemplate（listing→实例化） | `market-surface.tsx:225 newWith(bundle)`——市场 listing 点击→openNewBot({connectors:[bundle]})→createBot | **等价**：入口已有（P5-41 时代），listing 预填 connectors 而非 templateId |
| 模板 CRUD（发布/分享/可见性） | 无——云端依赖（publishBotTemplate 是 xAI 云端契约） | **deferred 维持**（同 B25 C 域定案） |
| featuredListings 云端目录 | pluginMarket（M1 白名单，本地目录） | 语义不同的等价物，维持 |

## 三、判定依据

1. **RPC 面**：agentPresets/list 在 M1 白名单（main/m1-api/index.ts:13）+filterP2tempPresets 过滤（:412）；m3-meta liveView 拼 recipes.live（index.ts:88）——预设链路健康
2. **UI 面**：对话框 More options 折叠里有完整 preset radio 组（id+description+isDefault 预选）；市场页有 newWith 创建入口——「从模板创建」的两条路径都已实装
3. **语义差**：0.78.1 模板=云端全量配置快照（Memories/Skills/Routines/Integrations）；dsh preset=本地 prompt 模板——后者是前者可落地的最小子集，发布/分享无本地后端可接
4. **摆位差**：0.78.1 模板在市场页直接可见可点；我方 preset 藏在 More options 折叠——这是有意设计（dsh 用户 preset 少，折叠省空间；e2e b18/b24 均覆盖此面）

## 四、不做清单

- 不把 preset 提升到市场页（pluginMarket 语义=插件目录，混入 preset 反而错位）
- 不做模板发布/分享（云端 deferred 维持）
- 不动 new-bot-dialog 现有结构（P5-57 定稿+T24/T30 对齐过 0.78.1）
