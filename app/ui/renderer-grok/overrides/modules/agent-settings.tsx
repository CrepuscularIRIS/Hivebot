// P5-57 覆盖：View agent settings 的 info pane 在上游 Name / Description 之后追加 P-D 三段（定稿 P5-57-final ②；
// 语义复制改造自旧 renderer plugins/settings/InfoPane.tsx @4500cd2^）：
// 失效横幅（D10c）→ Configuration（preset / 连接器只读带锁，D11）+「New bot with this configuration」（D13–D15）
// → Model（#5 只影响本 bot、下一轮生效、失败显示回原值）→ Main bot（#20 成功才置顶；失效 bot 不可设）。
import { useEffect, useState, useSyncExternalStore } from 'react'
import { AgentSettingsPanel as Upstream, type AgentSettingsPanelProps } from '../../frontend/src/recovered/features/agent-info/settings/view'
import { SandButton, SandIcon } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import { openNewBot } from './new-bot-dialog'
import { SkillsSection } from './skills-dialog'
import { api, modelOptions, ui, useBotConfig, useOnline, type BotConfig, type ModelOption, type NewBotInit } from './pbots-ui'

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
