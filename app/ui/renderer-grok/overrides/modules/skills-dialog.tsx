// T7b（L4-c）+ B24：「Add from your skills」对话框（T98：1.1.0 文案）+ custom skill 编辑器
// （0.78.1 chunk-bot-manage-knowledge-Cciz9jNH 规格：Add custom skill/编辑 SKILL.md 的 Name+Instructions）。
// 数据全走 pbotsUi.skills（main 侧 API list/enable/disable/create/update）；renderer 不碰文件。
// 文案取 0.78.1 en 键（76J7mZ/ggmjet/WnW32b/QIroEg/l9hqdu/MEJR0H/EBwmRD/NxHkkp/6YtxFj/GBQjiV/tfDRzk）。
import { useEffect, useState, type KeyboardEvent } from 'react'
import { SandButton, SandIconButton, SandIcon } from '../../frontend/src/recovered/ui/sand-kit-primitives'
import { skillEditorKeyboardAction, validateSkillDraft } from '../../frontend/src/recovered/features/agent-info/settings/knowledge'
import { ui, type SkillsApiResult } from './pbots-ui'

export interface SkillEntry { name: string; description?: string; body?: string }
export interface CandidateEntry extends SkillEntry { fromBotId: string }

/** B24：custom skill 编辑器（0.78.1 Ce）——new 建（Name 可输）、existing 改（锁名）。 */
function SkillEditor({ id, name, initialBody, onClose, onSaved }: { id: string; name: string | null; initialBody: string; onClose(): void; onSaved(): void }) {
  const [draftName, setDraftName] = useState(name ?? '')
  const [instructions, setInstructions] = useState(initialBody)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const validation = name === null ? validateSkillDraft(draftName, new Set()) : null
  const save = async (): Promise<void> => {
    const u = ui()
    if (u === null || validation !== null || instructions.trim().length === 0) return
    setBusy(true); setError(null)
    const slug = name === null ? draftName.trim().toLowerCase().replace(/\s+/g, '-') : name
    const r: SkillsApiResult = await u.skills(name === null
      ? { op: 'create', botId: id, name: slug, description: instructions.slice(0, 200), body: instructions }
      : { op: 'update', botId: id, name, description: instructions.slice(0, 200), body: instructions })
    setBusy(false)
    if (!r.ok) { setError(r.error.message); return }
    onSaved()
  }
  const keyAction = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    const a = skillEditorKeyboardAction(e)
    if (a === 'cancel') onClose()
    else if (a === 'submit') void save()
  }
  return (
    <div className="pb-skills-editor" role="dialog" aria-label={name === null ? 'New skill' : 'Editing skill'} data-skills-editor onKeyDown={(e) => { if (e.key !== 'Escape' || e.defaultPrevented) return; e.preventDefault(); onClose() }}>
      <div className="pb-skills-editor__head">
        <span>{name === null ? 'New skill' : 'Editing skill'}</span>
        <SandIconButton aria-label="Close" icon="close" onClick={onClose} shape="circle" size="md" variant="ghost" />
      </div>
      {name === null ? <label className="pb-skills-editor__field">Name
        <input data-skills-editor-name type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} onKeyDown={keyAction} placeholder="deploy-api" />
      </label> : <div className="pb-pane-row"><span className="pb-pane-key">Name</span><span className="pb-pane-val">{name}</span></div>}
      <label className="pb-skills-editor__field">Instructions
        <textarea data-skills-editor-body rows={6} value={instructions} onChange={(e) => setInstructions(e.target.value)} onKeyDown={keyAction} placeholder="What should this Bot do?" />
      </label>
      {validation !== null && <p role="alert" data-skills-editor-error>{validation === 'no-key' ? 'Use at least one letter (a–z) or number' : 'Give this skill a name'}</p>}
      {error !== null && <p role="alert" data-skills-editor-error>{error}</p>}
      <div className="pb-skills-editor__actions">
        <SandButton onClick={onClose} shape="pill" size="sm" variant="secondary">Cancel</SandButton>
        <SandButton data-action="skill-save" onClick={() => void save()} shape="pill" size="sm" variant="primary" disabled={busy || validation !== null || instructions.trim().length === 0}>
          {name === null ? 'Add skill' : 'Save'}
        </SandButton>
      </div>
    </div>
  )
}

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
    <div className="pb-skills-dialog" role="dialog" aria-label="Add from your skills" data-skills-dialog onClick={onClose} onKeyDown={(e) => { if (e.key !== 'Escape' || e.defaultPrevented) return; e.preventDefault(); onClose() }}>
      <div onClick={(e) => e.stopPropagation()}>
      <div className="pb-skills-dialog__head">
        <span className="pb-skills-dialog__title">Add from your skills</span>
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

/** bot 设置里的 Skills 段：Added skills 列表（可移除）+「Add from your skills」入口（T98）。 */
export function SkillsSection({ id, online }: { id: string; online: boolean }) {
  const [onBot, setOnBot] = useState<SkillEntry[] | 'error' | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<{ name: string | null; body?: string } | null>(null)
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
            <SandButton data-action="skill-edit" aria-label={`Edit ${sk.name}`} onClick={() => setEditing({ name: sk.name, body: sk.body ?? sk.description ?? '' })} shape="pill" size="sm" variant="secondary" disabled={!online}>Edit</SandButton>
            <SandButton data-action="skill-remove" aria-label={`Remove ${sk.name}`} onClick={() => void remove(sk.name)} shape="pill" size="sm" variant="secondary" disabled={!online}>Remove</SandButton>
          </div>
        ))}
      </div>
      <SandButton data-action="skills-pick" leadingIcon="plus" onClick={() => { setOpen(true) }} shape="pill" size="sm" variant="secondary" disabled={!online}>
        Add from your skills
      </SandButton>
      <SandButton data-action="skill-new" leadingIcon="plus" onClick={() => setEditing({ name: null })} shape="pill" size="sm" variant="secondary" disabled={!online}>
        Add custom skill
      </SandButton>
      {editing !== null && <SkillEditor key={editing.name ?? 'new'} id={id} name={editing.name} initialBody={editing.body ?? ''} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setTick(tick + 1) }} />}
      {open && <SkillsDialog botId={id} onClose={() => { setOpen(false); setTick(tick + 1) }} onChanged={() => setTick(tick + 1)} />}
      {removeError !== null && <div role="alert" data-skills-remove-error>{removeError}</div>}
    </>
  )
}
