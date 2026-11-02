// U-15 dev-min 临时最小页面（PLAN U-15：D1 出口）：preset 下拉建 bot（勾选连接器时经
// M1 #4 → main 编排写 recipe，CONTRACT §3.1；否则 #3）、输入框 + 发送按钮（#7）、
// 流式气泡渲染（carrier 的 session/follow assistantStream）。U-22 done 时随目录删除。
import { useEffect, useState } from 'react'
import { devBots, followBot, installDevSurface, subscribe } from './carrier'

interface Preset { id: string; isDefault?: boolean }
/** listBundles 行的最小面；连接器候选只来自已装列表（installed === true，U-23 ① 口径）。 */
interface Bundle { name?: string; installed?: boolean }

const api = (method: string, args?: unknown) =>
  window.pbots!.api(method, args)

export function DevMinApp(): JSX.Element {
  const [, force] = useState(0)
  useEffect(() => {
    const off = subscribe(() => force((n) => n + 1))
    return off
  }, [])
  const [presets, setPresets] = useState<Preset[]>([])
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [presetId, setPresetId] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { installDevSurface() }, [])
  useEffect(() => {
    let stopped = false
    // dsh 就绪前 M1 会拒（forbidden not configured）：dev-min 临时页用重试兜底（产品壳走 ready 闸门，U-14）
    void (async () => {
      for (let attempt = 0; ; attempt += 1) {
        const roster = await api('agentPresets/list', {})
        if (roster.ok) {
          const list = ((roster.value as { presets?: Preset[] }).presets ?? []).map((p) => ({ id: p.id, isDefault: p.isDefault }))
          setPresets(list)
          setPresetId((prev) => prev || list.find((p) => p.isDefault)?.id || list[0]?.id || '')
          const bundlesRes = await api('pluginManager/listBundles', {})
          // 返回形状：BundleInfo[]（数组；name = 包名，上游 plugin-manager index.ts:489）
          if (bundlesRes.ok) {
            const rows = Array.isArray(bundlesRes.value) ? (bundlesRes.value as Bundle[]) : []
            setBundles(rows.filter((b) => b.installed === true))
          }
          return
        }
        if (attempt === 0) setError(`agentPresets/list: ${roster.error?.code} ${roster.error?.message}（重试中）`)
        if (stopped) return
        await new Promise((r) => setTimeout(r, 500))
      }
    })()
    return () => { stopped = true }
  }, [])

  const bots = devBots()
  const bot = bots.find((b) => b.sessionId === current) ?? null

  async function createBot(): Promise<void> {
    setError(null)
    const method = checked.length > 0 ? 'p2temp/session.createWithConnectors' : 'session/create'
    const request = checked.length > 0
      ? { connectors: checked, agentPreset: presetId }
      : { agentPreset: presetId }
    const res = await api(method, { request })
    if (!res.ok) { setError(`${method}: ${res.error?.code} ${res.error?.message}`); return }
    const sessionId = (res.value as { sessionId: string }).sessionId
    followBot(sessionId)
    setCurrent(sessionId)
  }

  async function send(): Promise<void> {
    if (bot === null || draft.trim() === '') return
    const text = draft
    setDraft('')
    setError(null)
    const res = await api('session/prompt', {
      request: {
        requestId: crypto.randomUUID(), sessionId: bot.sessionId, mode: 'queue',
        content: [{ type: 'text', text }],
      },
    })
    if (!res.ok) setError(`session/prompt: ${res.error?.code} ${res.error?.message}`)
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', height: '100vh', margin: 0 }}>
      <aside style={{ width: 260, borderRight: '1px solid #ccc', padding: 12, overflowY: 'auto' }}>
        <h2 style={{ fontSize: 14, margin: '4px 0' }}>bots（dev-min）</h2>
        {bots.map((b) => (
          <button
            key={b.sessionId}
            className="bot-row"
            data-session={b.sessionId}
            data-preset={b.preset ?? ''}
            data-running={b.running}
            onClick={() => setCurrent(b.sessionId)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', margin: '4px 0', cursor: 'pointer',
              background: b.sessionId === current ? '#e8f0fe' : 'transparent', border: '1px solid #ddd', borderRadius: 6 }}
          >
            {b.sessionId.slice(0, 8)} · {b.preset ?? '…'}{b.running ? ' · 运行中' : ''}
          </button>
        ))}
        <hr style={{ border: 'none', borderTop: '1px solid #ddd' }} />
        <label style={{ display: 'block', fontSize: 12 }}>preset</label>
        <select id="preset-select" value={presetId} onChange={(e) => setPresetId(e.target.value)} style={{ width: '100%', padding: 4 }}>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.id}{p.isDefault ? '（默认）' : ''}</option>)}
        </select>
        {bundles.length > 0 && (
          <>
            <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>连接器（经 #4 编排建 bot）</label>
            {bundles.map((b) => {
              const name = b.name ?? '?'
              return (
                <label key={name} style={{ display: 'block', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    value={name}
                    checked={checked.includes(name)}
                    onChange={(e) => setChecked((prev) => (e.target.checked ? [...prev, name] : prev.filter((c) => c !== name)))}
                  />
                  {name}
                </label>
              )
            })}
          </>
        )}
        <button id="create-bot" onClick={() => void createBot()} style={{ width: '100%', marginTop: 8, padding: 6 }}>
          建 bot
        </button>
        {error !== null && <p id="dev-error" style={{ color: '#b00', fontSize: 12 }}>{error}</p>}
      </aside>
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div id="messages" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {bot === null && <p style={{ color: '#888' }}>左侧建 bot 后开始对话</p>}
          {bot?.bubbles.map((b) => (
            <div key={b.id} className={b.role === 'user' ? 'bubble user final' : 'bubble assistant final'}
              style={{ margin: '8px 0', padding: '8px 12px', borderRadius: 8, background: b.role === 'user' ? '#dcedc8' : '#eee', whiteSpace: 'pre-wrap' }}>
              {b.text}
            </div>
          ))}
          {bot?.streaming !== null && bot?.streaming !== undefined && (
            <div className="bubble assistant streaming" data-chunks={bot.chunkCount}
              style={{ margin: '8px 0', padding: '8px 12px', borderRadius: 8, background: '#f5f5f5', whiteSpace: 'pre-wrap' }}>
              {bot.streaming.text}
            </div>
          )}
        </div>
        <form style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #ccc' }}
          onSubmit={(e) => { e.preventDefault(); void send() }}>
          <input id="composer" value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={bot === null ? '先建 bot' : '发消息'}
            style={{ flex: 1, padding: 8 }} />
          <button id="send" type="submit" disabled={bot === null}>发送</button>
        </form>
      </section>
    </main>
  )
}
