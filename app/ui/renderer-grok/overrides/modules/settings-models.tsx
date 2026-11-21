// T50：Settings → Models 区（Hivebot 自有——0.78.1 无此区，RE-SETTINGS-0.78.1）。
// 交互复制改造（搬运阶梯第 3 级）: @deepseek-ai/dsh-client-ui-settings-models@0.2.2-rc.1:lib/client.js
//   - ProviderEditor 的 key 字段语义（只写不读、type=password + autoComplete="new-password" :173 附近）
//   - describe 只看 redacted 元数据（configured/source/writable），任何方法不回 key 值
// 状态圆点语义: configured 绿 / 未配红; source:'env' 行尾注 "from environment"。
// key 泄漏守卫: key 只存在于受控 input 的 value(React state)——不进 localStorage/URL/console/错误文本;
//   Apply 成功即清空。后端 m1 白名单(T49): credentials/describe|set|unset + settings/describe。
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SandButton, SandIconButton } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import './settings-models.css'
import { api } from './pbots-ui'

/** 来源: grok-bot-0.18-reconstructed panels.tsx:654 SettingsGroup（未导出,同款复制——外观与 General 同体系）+ T57c 卡层 */
function SettingsGroup({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return <section><h3>{title}</h3><div className="sand-settings-group__card">{children}</div></section>
}

interface RouteRow {
  route: string
  baseURL: string
  models: string[]
  apiKeyEnv: string | null
  configured: boolean
  source: string | null
}

const LABELS: Record<string, string> = { litellm: 'LiteLLM' }

type ApiResult = { ok: true; value: unknown } | { ok: false; error: { code?: string; message?: string } }
const unwrap = <T,>(r: ApiResult): T => (r.ok ? (r.value as T) : (() => { throw new Error(r.error.message ?? r.error.code ?? 'api failed') })())

async function loadRoutes(): Promise<RouteRow[]> {
  const described = unwrap<{ namespaces?: Array<{ ns?: string; user?: { providers?: Record<string, { baseURL?: unknown; apiKeyEnv?: unknown; models?: unknown }> } }> }>(await api('settings/describe', {}))
  const ns = (described.namespaces ?? []).find((n) => n.ns === 'llm-pi-ai')
  const providers = ns?.user?.providers ?? {}
  const rows: RouteRow[] = Object.entries(providers).map(([route, v]) => ({
    route,
    baseURL: typeof v.baseURL === 'string' ? v.baseURL : '',
    models: Array.isArray(v.models) ? v.models.map((m) => (typeof m === 'object' && m !== null ? String((m as { id?: unknown }).id ?? '') : '')).filter((id) => id !== '') : [],
    apiKeyEnv: typeof v.apiKeyEnv === 'string' ? v.apiKeyEnv : null,
    configured: false,
    source: null,
  }))
  const refs = [...new Set(rows.map((r) => r.apiKeyEnv).filter((e): e is string => e !== null))]
  if (refs.length > 0) {
    const cred = unwrap<Record<string, { configured?: boolean; source?: string }>>(await api('credentials/describe', { refs }))
    for (const row of rows) {
      const c = row.apiKeyEnv !== null ? cred[row.apiKeyEnv] : undefined
      row.configured = c?.configured === true
      row.source = typeof c?.source === 'string' ? c.source : null
    }
  }
  return rows
}

function RouteKeyRow({ row, onRefresh }: { row: RouteRow; onRefresh(): void }): React.JSX.Element {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback(async (): Promise<void> => {
    if (value === '' || busy || row.apiKeyEnv === null) return
    setBusy(true); setError(null)
    try {
      const r = await api('credentials/set', { ref: row.apiKeyEnv, value })
      if (!r.ok) throw new Error(r.error.message ?? r.error.code ?? 'credential write failed')
      setValue('') // 只写不读:成功即清空（DSH Models 页同语义）
      onRefresh()
    } catch (e) {
      setError(String((e as Error).message ?? e)) // 不含输入值——上游错误不含 key（T49 ⑧ 断言）
    } finally { setBusy(false) }
  }, [value, busy, row.apiKeyEnv, onRefresh])

  const clear = useCallback(async (): Promise<void> => {
    if (busy || row.apiKeyEnv === null) return
    setBusy(true); setError(null)
    try {
      const r = await api('credentials/unset', { ref: row.apiKeyEnv })
      if (!r.ok) throw new Error(r.error.message ?? r.error.code ?? 'credential clear failed')
      onRefresh()
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally { setBusy(false) }
  }, [busy, row.apiKeyEnv, onRefresh])

  return (
    <div className="sand-settings-row t50-models__row" data-model-route={row.route}>
      <span className="sand-settings-copy">
        <strong>{LABELS[row.route] ?? row.route}</strong>
        <small>
          {row.baseURL}{row.models.length > 0 ? ` · ${row.models.join(', ')}` : ''}
          {row.source === 'env' ? ' · from environment' : ''}
        </small>
      </span>
      <span className="t50-models__dot" data-key-dot={row.configured ? 'on' : 'off'} aria-label={row.configured ? 'API key configured' : 'No API key'} />
      <span className="t50-models__controls">
        <input
          aria-label={`API key for ${LABELS[row.route] ?? row.route}`}
          autoComplete="new-password"
          onChange={(e) => setValue(e.target.value)}
          placeholder={row.configured ? 'Replace key' : 'Paste API key'}
          type={show ? 'text' : 'password'}
          value={value}
        />
        <SandIconButton aria-label={show ? 'Hide' : 'Show'} icon={show ? 'eye-closed' : 'eye'} onClick={() => setShow(!show)} shape="square" size="sm" title={show ? 'Hide' : 'Show'} />
        <SandButton disabled={value === '' || busy} onClick={apply} size="sm" variant="secondary">Apply</SandButton>
        {row.source === 'file' ? <SandButton disabled={busy} onClick={clear} size="sm" variant="secondary">Clear key</SandButton> : null}
      </span>
      {error !== null ? <span className="t50-models__error" role="alert">{error}</span> : null}
    </div>
  )
}

export function ModelsSettingsPanel(): React.JSX.Element {
  const [rows, setRows] = useState<RouteRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback((): void => {
    loadRoutes().then(setRows, (e) => setError(String((e as Error).message ?? e)))
  }, [])
  useEffect(refresh, [refresh])
  const empty = useMemo(() => rows !== null && rows.length === 0, [rows])
  return (
    <div className="sand-settings-general t50-models" data-settings-panel="models">
      <SettingsGroup title="Models">
        {error !== null ? <p className="t50-models__error" role="alert">{error}</p> : null}
        {empty ? <p className="t50-models__empty">No model routes configured. Routes appear here after the runtime seeds one or you add a provider.</p> : null}
        {(rows ?? []).map((row) => <RouteKeyRow key={row.route} row={row} onRefresh={refresh} />)}
      </SettingsGroup>
    </div>
  )
}
