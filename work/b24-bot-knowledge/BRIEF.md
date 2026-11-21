# B24：Bot Knowledge 面（skills 管理 + learnings 审核队列壳）

日期：2026-11-18（goal-ed007eb1 自动化续作，B23 台账 C 域第一项）

## 0.78.1 规格（chunk-bot-manage-knowledge-Cciz9jNH.js 全解）

### 入口
- Ae（入口组件）：props {agent, skills, page:{isLibrary?, onBack?}, onClose}；blurb=nYwHT5「Add skills from your library that {agentName} …」
- 壳 ke：{title, blurb, surfaceStyle, onBack, onClose, footer, children}——Close on mount false→onClose；header 布局 Ee.header

### Skills 管理区
- 列表：je({agent}, {writtenByBot:Set})——librarySkills（De）+ custom；空态 l9hqdu「No skills yet」
- 行：name（空=wja8aL Untitled）+Written by {bot}（xFRlhB，bot 习得的标记）
- 新建：Ce 编辑器 {subject:{kind:'new'|'existing'}, botName, access, onClose}——Name(6YtxFj)/Instructions(NxHkkp) 两字段；校验 MEJR0H「Use at least one letter (a–z) or number」/key 冲突 taken/no-key；标题 MdpSC1「New skill」/Uqy4he「Editing skill」；按钮 GBQjiV「Add skill」/tfDRzk「Save」/dEgA5A「Cancel」
- 键盘：ye——Escape=cancel、Cmd/Ctrl+Enter=submit（isComposing 忽略）
- 添加路径：EBwmRD「Add custom skill」+c4iggE「Import existing skill」

### Learnings 审核队列（written-by-bot 学到的 skill 变更）
- 行 Ue：{item:{summary, change:{kind:'skill'|'memory', action}}, source, when, outcome, onDecide, onReview}——icon=kind==='skill'?'book':'brain'；按钮 Z7ZXbT「Approve」/5k0NLb「Review」；decide→busy→decided（grid-template-rows 离场过渡）→failed 回滚；reviewedByUserId===self→1rL5Ox「Approved by you」else ms8qVW「Approved by {name}」
- 列表 We：初始 5 条+「show more」；排序 Ye（createdAtMs 倒序）
- Review all 按钮（hb2uBH）：onClose 后 onSeedDraft(51Mhfc lead「Summarize and walk me through the following items for review:」+items+HnEFE3 nudge「Use your provided team review tools」)——种进 composer 草稿
- 空态：PK3+Q2「You're all caught up」+/H16QE「New learnings show up here before {botName} …」
- 团队 roster 加载 Ke（teamId→load）

## 我方映射判定

- **Skills 管理区=做**：DSH 有真实 skills 后端（shim skills 面，B 系列已有 skills-enable/skills-picker e2e）——列表/新建（Name+Instructions）/编辑/删除映射 DSH skill
- **Learnings 队列=壳+空态**：shim 无学习数据源（同 B21 判定）——落 caught-up 空态+Approve/Review 行渲染路径（纯函数+测试），无数据恒空
- **Review all→onSeedDraft=接**：种草稿进 composer（我方已有 composer 种子机制 b7-knowledge? 需查）——若无则落 TODO

## 验收
1. 单测：learnings 纯函数（排序/过滤/审核状态机 busy|decided|failed）
2. e2e：开 bot Knowledge 面→空态文案（No skills yet/You're all caught up）→Add custom skill→填 Name+Instructions→Add skill→列表出现→编辑→Save
3. 视觉：壳 title/blurb 布局+行结构对照 0.78.1 sand-* anchor
