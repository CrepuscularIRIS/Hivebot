# B26 · Routines 区接 dsh scheduled tasks（2026-11-18）

## 背景
0.78.1 Routines 管理面（eager-app 内联 ftt 区+EM 行）：行=toggle isEnabled+trigger/schedule 描述只读，编辑走对话种子；数据源 getAgentAutomations=云端 automation 引擎。B25 评估确认 dsh schedule/* 是唯一可接的本地等价（用户 goal-ed007eb1 自动续作授权下开工）。

## DSH schedule 契约（packages/schedule/schedule/src/types.ts 实锤）
- schedule/create：{request:{title≤120, prompt, timing:ScheduleTiming, target?}}——timing 是类型化对象（daily:{time:'HH:mm:ss', time_zone}），非 rrule 字符串
- schedule/list：{request:{active?, limit?, offset?}}→{items:ScheduleCatalogEntry[], shown, total}
- ScheduleCatalogEntry：{id, kind, title, prompt, time, timeZone, scheduledAt, target, involvedSessionIds, status:'active'|'paused'|'ended', createdAt, updatedAt}
- schedule/edit：{request:{id, action:'update', patch:{active:boolean}|…, expectedUpdatedAt?}}（action:'delete' 删除）
- envelope 一律 {request:{...}}（typert gateway 命名参数）

## 实现
- app/ui/renderer-grok/frontend/src/recovered/features/agent-info/settings/routines.ts：routineRowsFrom（title 优先/prompt 回落/Untitled；status paused/ended→enabled:false；describeTiming kind→频度词 daily→'Every day at HH:mm'）+describeRrule（保留）
- overrides/modules/agent-settings.tsx RoutinesSection：useEffect 加载 schedule/list→行（data-routine-row=id）；toggle=Pause/Resume（schedule/edit patch.active，乐观更新）；空态文案+Set up a routine 引导保留（行>0 时仍显示引导——0.78.1 空态在无行时）
- main/m1-api/index.ts：M1_ALLOW 加 schedule/list+view+edit；checkArgs 窄门（edit 只放 {id, action:'update', patch:{active:boolean}}，title/prompt/timing 编辑不开放）
- shortcut（routines.ts 头注）：dsh task 无 bot 绑定语义，全量展示不按 agentId 过滤；过滤需求出现时按 task.sessionId 接

## 验证
- vitest 838/838（b26-routines 4p 新+M1 白名单表 25→28 更新）
- e2e b26-routines.spec.ts：rt 造 schedule/create daily 09:00→UI 行渲染（title+Every day at 09:00）→Pause→按钮变 Resume→schedule/view status=paused（服务端真相）
- 回归 b24+b7 3/3（同设置面）；主线合并后 build+838/838+b26+b24 2/2
