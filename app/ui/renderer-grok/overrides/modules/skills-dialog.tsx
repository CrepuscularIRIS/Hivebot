// T7b（L4-c）：「Pick from your skills」对话框——从其他 bot 的 skill 勾选添加到当前 bot。
// 数据全走 pbotsUi.skills（T7a 的 main 侧 API）；renderer 不碰文件。文案取 0.78.1 en 键
// （76J7mZ/ggmjet/WnW32b，ref/skills-ref-notes.md）。
import { useEffect, useState } from 'react'
import { SandButton, SandIcon } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import { ui, type SkillsApiResult } from './pbots-ui'

export interface SkillEntry { name: string; description?: string }
export interface CandidateEntry extends SkillEntry { fromBotId: string }

/** 勾选列表 + Add；逐个 enable，-2 后缀照实显示；250/too-large 错误可见。 */
export function SkillsDialog({ botId, onClose, onChanged }: { botId: string; onClose(): void; onChanged(): void }) {
  const [candidates, setCandidates] = useState<CandidateEntry[] | 'error' | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    const u = ui()
    if (u === null) { setCandidates('error'); return }
    void u.skills({ op: 'list', botId }).then((r) => {
      if (!r.ok) { setCandidates('error'); return }
      const v = r.value as { candidates: CandidateEntry[] }
      setCandidates(v.candidates)
    })
  }, [botId])
  const key = (c: CandidateEntry): string => `${c.fromBotId}/${c.name}`
  const add = async (): Promise<void> => {
    const u = ui(); if (u === null || candidates === 'error' || candidates === null) return
    setBusy(true); setNotice(null)
    const problems: string[] = []
    let added = 0
    for (const c of candidates) {
      if (!picked.has(key(c))) continue
      const r: SkillsApiResult = await u.skills({ op: 'enable', botId, fromBotId: c.fromBotId, name: c.name })
      if (r.ok) added++
      else problems.push(`${c.name}: ${r.error.code === 'pbots/limit' ? `this Bot already has 250 skills` : r.error.code === 'pbots/too-large' ? `exceeds 256,000 characters` : r.error.message}`)
    }
    setBusy(false)
    if (added > 0) onChanged()
    if (problems.length > 0) setNotice(problems.join('\n'))
    else onClose()
  }
  return (
    <div className="pb-skills-dialog" role="dialog" aria-label="Pick from your skills" data-skills-dialog onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--sand-bg-elevated, #fff)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.3)' }}>
      <div className="pb-skills-dialog__head">
        <span className="pb-skills-dialog__title">Pick from your skills</span>
        <SandIconButton aria-label="Close" icon="close" onClick={onClose} shape="circle" size="md" variant="ghost" />
      </div>
      <div className="pb-skills-dialog__list" role="list">
        {candidates === null && <div data-skills-loading>Loading…</div>}
        {candidates === 'error' && <div data-skills-error role="alert">Couldn't load skills.</div>}
        {candidates !== null && candidates !== 'error' && candidates.length === 0 && <div data-skills-empty>No skills from other bots yet.</div>}
        {candidates !== null && candidates !== 'error' && candidates.map((c) => (
          <label key={key(c)} className="pb-skills-dialog__item" data-skill-candidate={c.name}>
            <input type="checkbox" checked={picked.has(key(c))} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(key(c)); else n.delete(key(c)); setPicked(n) }} />
            <span className="pb-skills-dialog__name">{c.name}</span>
            <span className="pb-skills-dialog__from" data-skill-from>{ui()?.agentName(c.fromBotId) ?? c.fromBotId.slice(0, 8)}</span>
            {c.description !== undefined && <span className="pb-skills-dialog__desc">{c.description}</span>}
          </label>
        ))}
      </div>
      {notice !== null && <div className="pb-skills-dialog__notice" role="alert" data-skills-notice>{notice}</div>}
      <div className="pb-skills-dialog__foot">
        <SandButton data-action="skills-add" onClick={() => void add()} disabled={busy || picked.size === 0} shape="pill" size="sm">{busy ? 'Adding…' : 'Add'}</SandButton>
      </div>
      </div>
    </div>
  )
}

/** bot 设置里的 Skills 段：Added skills 列表（可移除）+「Pick from your skills」入口。 */
export function SkillsSection({ id, online }: { id: string; online: boolean }) {
  const [onBot, setOnBot] = useState<SkillEntry[] | 'error' | null>(null)
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const u = ui()
    if (u === null) { setOnBot('error'); return }
    setOnBot(null)
    void u.skills({ op: 'list', botId: id }).then((r) => {
      setOnBot(r.ok ? (r.value as { onBot: SkillEntry[] }).onBot : 'error')
    })
  }, [id, tick])
  const [removeError, setRemoveError] = useState<string | null>(null)
  const remove = async (name: string): Promise<void> => {
    const u = ui(); if (u === null) return
    setRemoveError(null)
    const r = await u.skills({ op: 'disable', botId: id, name })
    if (!r.ok) { setRemoveError(r.error.message); return }
    setTick(tick + 1)
  }
  return (
    <>
      <div className="sand-info-pane__section-heading" data-skills-heading>Skills</div>
      <div data-skills-added>
        {onBot === null && <div className="pb-pane-text">Loading…</div>}
        {onBot === 'error' && <div className="pb-pane-text" role="alert">Couldn't load skills.</div>}
        {onBot !== null && onBot !== 'error' && onBot.length === 0 && <div className="pb-pane-text" data-skills-empty>None yet.</div>}
        {onBot !== null && onBot !== 'error' && onBot.map((sk) => (
          <div key={sk.name} className="pb-pane-row" data-skill-row={sk.name}>
            <span className="pb-pane-key">{sk.name}</span>
            <span className="pb-pane-val">{sk.description ?? ''}</span>
            <SandButton data-action="skill-remove" aria-label={`Remove ${sk.name}`} onClick={() => void remove(sk.name)} shape="pill" size="sm" variant="secondary" disabled={!online}>Remove</SandButton>
          </div>
        ))}
      </div>
      <SandButton data-action="skills-pick" leadingIcon="plus" onClick={() => { setOpen(true) }} shape="pill" size="sm" variant="secondary" disabled={!online}>
        Pick from your skills
      </SandButton>
      {open && <SkillsDialog botId={id} onClose={() => { setOpen(false); setTick(tick + 1) }} onChanged={() => setTick(tick + 1)} />}
      {removeError !== null && <div role="alert" data-skills-remove-error>{removeError}</div>}
    </>
  )
}
