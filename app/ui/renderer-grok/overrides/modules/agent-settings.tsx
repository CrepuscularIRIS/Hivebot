// P5-57 覆盖：View agent settings 的 info pane 在上游 Name / Description 之后追加 P-D 三段（定稿 P5-57-final ②；
// 语义复制改造自旧 renderer plugins/settings/InfoPane.tsx @4500cd2^）：
// 失效横幅（D10c）→ Configuration（preset / 连接器只读带锁，D11）+「New bot with this configuration」（D13–D15）
// → Model（#5 只影响本 bot、下一轮生效、失败显示回原值）→ Main bot（#20 成功才置顶；失效 bot 不可设）。
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { AgentSettingsPanel as Upstream, type AgentSettingsPanelProps } from '../../frontend/src/recovered/features/agent-info/settings/view'
import { SandButton, SandIcon } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import { openNewBot } from './new-bot-dialog'
import { SkillsSection } from './skills-dialog'
import { api, modelOptions, ui, useBotConfig, useOnline, type BotConfig, type ModelOption, type NewBotInit } from './pbots-ui'
import type { RoutineRow } from '../../frontend/src/recovered/features/agent-info/settings/routines'
import { routineRowsFrom } from '../../frontend/src/recovered/features/agent-info/settings/routines'

export * from '../../frontend/src/recovered/features/agent-info/settings/view'

/** 「New bot with this configuration」预填：未知配方不猜，要求重选；否则预填 preset / 连接器 / 当前模型。 */
export function cloneInit(name: string, config: BotConfig): NewBotInit {
  if (config.unknownRecipe) return { title: 'New bot with this configuration', note: "The original configuration can't be fully restored. Pick it again." }
  return {
    title: 'New bot with this configuration', note: `Prefilled from “${name}”.`,
    ...(config.preset !== null ? { preset: config.preset } : {}),
    connectors: config.connectors,
    ...(config.model !== null ? { model: config.model } : {}),
  }
}

let catalog: Promise<{ options: ModelOption[]; fallback: string }> | undefined
/** #2 一次拉取、各 pane 共用；失败不缓存（下次打开重试）。 */
function loadCatalog(): Promise<{ options: ModelOption[]; fallback: string }> {
  catalog ??= api('session/modelCatalog', {}).then((c) => {
    if (!c.ok) { catalog = undefined; throw new Error(c.error?.message ?? 'modelCatalog failed') }
    return modelOptions(c.value)
  })
  return catalog
}

type Phase = { kind: 'idle' | 'saving' | 'saved' | 'error'; value?: string; message?: string }

function ModelPicker({ id, config, online }: { id: string; config: BotConfig; online: boolean }) {
  const [cat, setCat] = useState<{ options: ModelOption[]; fallback: string } | 'error' | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  useEffect(() => { void loadCatalog().then(setCat, () => setCat('error')) }, [])
  useEffect(() => {
    if (phase.kind !== 'saved') return
    const t = setTimeout(() => setPhase({ kind: 'idle' }), 2000)
    return () => clearTimeout(t)
  }, [phase])
  const current = config.model
  const shown = phase.kind === 'saving' ? phase.value! : (current ?? '')
  const options = cat !== null && cat !== 'error' ? cat.options : []
  const pick = async (value: string): Promise<void> => {
    const opt = options.find((o) => o.value === value)
    const u = ui()
    if (opt === undefined || u === null) return
    setPhase({ kind: 'saving', value })
    const res = await u.selectModel(id, opt.provider, opt.model)
    setPhase(res.ok ? { kind: 'saved' } : { kind: 'error', message: res.error?.message ?? 'failed' }) // 失败：显示自然回到旧值
  }
  const danger = phase.kind === 'error' || cat === 'error'
  return (
    <div className="pb-pane-field">
      <select className="pb-select" data-pane-model aria-label="Model" value={shown}
        disabled={config.readOnly || !online || cat === null || cat === 'error' || phase.kind === 'saving'}
        onChange={(e) => void pick(e.target.value)}>
        {current === null && <option value="" disabled>Preset default{cat !== null && cat !== 'error' && cat.fallback !== '' ? ` (${cat.fallback})` : ''}</option>}
        {current !== null && !options.some((o) => o.value === current) && <option value={current}>{current}</option>}
        {options.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <span className={`pb-pane-status${danger ? ' pb-pane-status--danger' : ''}`} role="status" data-model-status={phase.kind}>
        {config.readOnly ? "The connector is unavailable, so the model can't be changed."
          : cat === null ? 'Loading…'
            : cat === 'error' ? "Couldn't load models."
              : phase.kind === 'saving' ? 'Switching…'
                : phase.kind === 'saved' ? 'Switched. Takes effect from the next reply.'
                  : phase.kind === 'error' ? `Couldn't switch: ${phase.message}` : 'Only this bot. Takes effect from the next reply.'}
      </span>
    </div>
  )
}

function MainBot({ id, config, online }: { id: string; config: BotConfig; online: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setError(null) }, [id])
  if (config.isMain) return <p className="pb-pane-text" data-main-note>This is the main bot. It stays at the top of the sidebar.</p>
  return (
    <div className="pb-pane-field">
      <SandButton data-action="set-main" disabled={!online || config.readOnly} leadingIcon="star" pending={busy} shape="pill" size="sm" variant="secondary"
        title={config.readOnly ? "A bot with an unavailable connector can't be the main bot" : undefined}
        onClick={() => {
          const u = ui()
          if (u === null) return
          setBusy(true)
          setError(null)
          void u.setMain(id).then((r) => { setBusy(false); if (!r.ok) setError(`Couldn't set: ${r.error?.message ?? ''}`) })
        }}>
        {busy ? 'Setting…' : 'Set as main bot'}
      </SandButton>
      {error !== null && <span className="pb-pane-status pb-pane-status--danger" role="alert">{error}</span>}
    </div>
  )
}

/** B7.1 Learnings（1.1.0 knowledge 区只读降级）：当前 bot 的 skills 只读列表。
 * DSH 无 review-item 审批 RPC（2026-11-18 六层探空），不呈现假 Approve/Reject；真审批记 Q-066。 */
function LearningsSection({ id, online }: { id: string; online: boolean }) {
  const [items, setItems] = useState<Array<{ name: string; description: string }> | 'error' | null>(null)
  useEffect(() => {
    setItems(null)
    const u = ui()
    if (u === null) return
    void u.skills({ op: 'list', botId: id }).then((r) => {
      if (!r.ok) { setItems('error'); return }
      setItems(r.value.onBot.map((s) => ({ name: s.name, description: s.description ?? '' })))
    }, () => setItems('error'))
  }, [id])
  return <>
    <div className="sand-info-pane__section-heading" data-learnings-heading>Learnings</div>
    {items === null && <div className="pb-pane-text" data-learnings-loading>Loading…</div>}
    {items === 'error' && <div className="pb-pane-text" role="alert" data-learnings-error>Couldn't load learnings.</div>}
    {Array.isArray(items) && items.length === 0 && <p className="pb-pane-text" data-learnings-empty>This Bot has no learnings yet. Skills it picks up will show here.</p>}
    {Array.isArray(items) && items.length > 0 && (
      <div role="list" data-learnings-list>
        {items.map((it) => <div key={it.name} role="listitem" className="pb-pane-row" data-learning-item><SandIcon name="book" size="xs" /><span className="pb-pane-key">{it.name}</span><span className="pb-pane-val">{it.description}</span></div>)}
      </div>
    )}
    {!online && <p className="pb-pane-text">Offline — showing the last known learnings.</p>}
  </>
}

/** B10：per-tool 权限档位（1.1.0 LocalToolPermissionCeiling——ask/always/never）。
 * 列表=已落档工具（审批卡勾 always 或手动设档）；档位改即写（'ask'=清除回默认）。 */
function ToolsSection() {
  const [rows, setRows] = useState<Array<[string, 'always' | 'never']>>([])
  useEffect(() => {
    const u = ui()
    if (u === null) return
    setRows(Object.entries(u.toolCeiling()))
  }, [])
  const set = (tool: string, level: 'always' | 'never' | 'ask'): void => {
    const u = ui()
    if (u === null) return
    u.setToolCeiling(tool, level)
    setRows(level === 'ask' ? rows.filter(([t]) => t !== tool) : rows.map(([t, l]) => t === tool ? [t, level as 'always' | 'never'] : [t, l]))
  }
  return <>
    <div className="sand-info-pane__section-heading" data-tools-heading>Tools</div>
    {rows.length === 0 && <p className="pb-pane-text" data-tools-empty>No tools have saved permissions yet. Approve a tool with "Always" to pin it here.</p>}
    {rows.length > 0 && (
      <div role="list" data-tools-list>
        {rows.map(([tool, level]) => (
          <div key={tool} role="listitem" className="pb-pane-row" data-tool-row={tool}>
            <span className="pb-pane-key">{tool}</span>
            <span className="pb-pane-val">
              <SandButton data-ceiling={level} shape="pill" size="sm" variant="secondary" onClick={() => set(tool, level === 'always' ? 'never' : level === 'never' ? 'ask' : 'always')}>
                {level}
              </SandButton>
            </span>
          </div>
        ))}
      </div>
    )}
  </>
}

/** B7.2 Routines（1.1.0 同款空态）：DSH 无 automation RPC（2026-11-18 探空），
 * 「Set up a routine」按上游 onAsk 模式（StuxPK）预填 composer，由 bot 对话创建。 */
// B26：Routines 区——dsh schedule/list 投影行（0.78.1 ftt/EM 同构：空态引导+行 toggle+描述只读）。
// shortcut: dsh scheduled task 是会话级定时投递，无 bot 绑定语义——这里按「主数据面」全量展示，
// 不按 agentId 过滤（0.78.1 per-bot automation 无本地等价）；过滤需求出现时再按 task.sessionId 接。
function RoutinesSection({ id }: { id: string }) {
  const [rows, setRows] = useState<RoutineRow[] | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const reload = useCallback(() => {
    void api('schedule/list', { request: {} }).then((r) => { if (r.ok) setRows(routineRowsFrom(r.value)) })
  }, [])
  useEffect(() => { reload() }, [reload])
  const toggle = (row: RoutineRow) => {
    setPendingId(row.id)
    // DSH schedule/edit 契约（packages/schedule types.ts ScheduleEditRequest）：{id, action:'update', patch:{active}}
    void api('schedule/edit', { request: { id: row.id, action: 'update', patch: { active: !row.enabled } } }).then((r) => {
      setPendingId(null)
      if (r.ok) setRows((cur) => cur === null ? cur : cur.map((x) => x.id === row.id ? { ...x, enabled: !row.enabled } : x))
    })
  }
  return <>
    <div className="sand-info-pane__section-heading" data-routines-heading>Routines</div>
    {rows !== null && rows.length > 0 && <div className="pb-pane-rows" data-routine-rows>
      {rows.map((row) => <div className="pb-pane-row" data-routine-row={row.id} key={row.id}>
        <span className="pb-pane-key">{row.name}</span>
        <span className="pb-pane-val">{row.schedule}</span>
        <SandButton aria-label={`${row.enabled ? 'Pause' : 'Resume'} ${row.name}`} data-action="routine-toggle" disabled={pendingId === row.id}
          onClick={() => toggle(row)} shape="pill" size="sm" variant="secondary">{row.enabled ? 'Pause' : 'Resume'}</SandButton>
      </div>)}
    </div>}
    <p className="pb-pane-text" data-routines-empty>Ask this Bot to set up a routine — it can run on a schedule.</p>
    <SandButton data-action="ask-routine" leadingIcon="calendar" shape="pill" size="sm" variant="secondary"
      onClick={() => { const u = ui(); if (u !== null) void u.sendPrompt(id, 'Set up a routine: ') }}>
      Set up a routine
    </SandButton>
  </>
}

function BotConfigSections({ id, name }: { id: string; name: string }) {
  const config = useBotConfig(id)
  const online = useOnline()
  if (config === null) return null
  return (
    <section className="pb-pane" aria-label="Bot configuration" data-pane-config={id}>
      {config.readOnly && (
        <div className="pb-pane-alert" role="status" data-pane-alert>
          <SandIcon name="warning" size="sm" />
          <span>This bot's connector is no longer installed. Its history stays readable; create a new bot to keep going.</span>
        </div>
      )}
      <div className="sand-info-pane__section-heading">Configuration</div>
      <div className="pb-pane-row" data-pane-preset><SandIcon name="lock" size="xs" /><span className="pb-pane-key">Preset</span><span className="pb-pane-val">{config.preset ?? (config.unknownRecipe ? 'Unknown' : '…')}</span></div>
      <div className="pb-pane-row" data-pane-connectors>
        <SandIcon name="lock" size="xs" /><span className="pb-pane-key">Connectors</span>
        <span className={`pb-pane-val${config.readOnly ? ' pb-pane-val--danger' : ''}`}>{config.connectors.length > 0 ? config.connectors.join(', ') : 'None'}</span>
        {config.readOnly && <span className="pb-pane-flag" data-connector-dead>Unavailable</span>}
      </div>
      <p className="pb-pane-text">Locked when the bot was created. To change it, create a new bot.</p>
      <SandButton data-action="clone-config" leadingIcon="copy" onClick={() => void openNewBot(cloneInit(name, config)).then((sid) => { if (sid !== null) ui()?.focus(sid) })} shape="pill" size="sm" variant="secondary">
        New bot with this configuration
      </SandButton>
      <div className="sand-info-pane__section-heading">Model</div>
      <ModelPicker key={id} id={id} config={config} online={online} />
      <div className="sand-info-pane__section-heading">Main bot</div>
      <MainBot id={id} config={config} online={online} />
      <SkillsSection id={id} online={online} />
      <LearningsSection id={id} online={online} />
      <RoutinesSection id={id} />
      <ToolsSection />
    </section>
  )
}

export function AgentSettingsPanel(props: AgentSettingsPanelProps) {
  const { controller } = props
  const agent = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot).agent
  return <>
    <Upstream {...props} />
    {agent.isGroup ? null : <BotConfigSections id={agent.id} name={agent.name} />}
  </>
}
