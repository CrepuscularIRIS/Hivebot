// @vitest-environment happy-dom
// B24：learnings 审核纯函数（0.78.1 chunk-bot-manage-knowledge 规格）
import { describe, expect, it } from 'vitest'
import {
  LEARNINGS_PAGE_SIZE,
  learningRowLocked,
  mergeLearningQueue,
  reviewedByLabel,
  skillEditorKeyboardAction,
  validateSkillDraft,
  type LearningItem,
} from '../../renderer-grok/frontend/src/recovered/features/agent-info/settings/knowledge'

const item = (id: string, createdAtMs: number, over: Partial<LearningItem> = {}): LearningItem => ({
  itemId: id,
  summary: `summary ${id}`,
  kind: 'skill',
  createdAtMs,
  proposedByUserId: null,
  reviewedByUserId: null,
  ...over,
})

describe('learningRowLocked（0.78.1 He）', () => {
  it('busy/decided 锁定，其余可点', () => {
    expect(learningRowLocked('busy')).toBe(true)
    expect(learningRowLocked('decided')).toBe(true)
    expect(learningRowLocked('failed')).toBe(false)
    expect(learningRowLocked(undefined)).toBe(false)
  })
})

describe('mergeLearningQueue（0.78.1 Je 主体）', () => {
  it('队列+乐观项合并、createdAtMs 倒序、decided 滤除', () => {
    const q = [item('a', 100), item('b', 300)]
    const opt = [item('c', 200), item('a', 100)]
    const out = mergeLearningQueue(q, opt, new Map([['b', 'decided' as const]]))
    expect(out.map((x) => x.itemId)).toEqual(['c', 'a'])
  })
  it('乐观项不覆盖队列同 id 项', () => {
    const q = [item('a', 100, { summary: 'queue' })]
    const opt = [item('a', 100, { summary: 'optimistic' })]
    const out = mergeLearningQueue(q, opt, new Map())
    expect(out[0].summary).toBe('queue')
  })
})

describe('LEARNINGS_PAGE_SIZE', () => {
  it('0.78.1 We 初始 5 条', () => {
    expect(LEARNINGS_PAGE_SIZE).toBe(5)
  })
})

describe('reviewedByLabel（0.78.1 We 文案）', () => {
  it('self→Approved by you；他人→Approved by {name}；null→null', () => {
    const it0 = item('a', 1, { reviewedByUserId: 7 })
    expect(reviewedByLabel(it0, 7, new Map())).toBe('Approved by you')
    expect(reviewedByLabel(it0, 3, new Map([[7, 'Ada']]))).toBe('Approved by Ada')
    expect(reviewedByLabel(item('b', 1), 7, new Map())).toBeNull()
  })
})

describe('validateSkillDraft（0.78.1 Ce/_e 校验）', () => {
  it('空名→empty；无字母数字→no-key；重名→taken；否则 null', () => {
    expect(validateSkillDraft('  ', new Set())).toBe('empty')
    expect(validateSkillDraft('!!!', new Set())).toBe('no-key')
    expect(validateSkillDraft('deploy', new Set(['deploy']))).toBe('taken')
    expect(validateSkillDraft('Deploy v2', new Set(['deploy']))).toBeNull()
  })
})

describe('skillEditorKeyboardAction（0.78.1 ye）', () => {
  it('Escape=cancel；Cmd/Ctrl+Enter=submit；isComposing 忽略', () => {
    expect(skillEditorKeyboardAction({ isComposing: false, key: 'Escape', metaKey: false, ctrlKey: false })).toBe('cancel')
    expect(skillEditorKeyboardAction({ isComposing: false, key: 'Enter', metaKey: true, ctrlKey: false })).toBe('submit')
    expect(skillEditorKeyboardAction({ isComposing: false, key: 'Enter', metaKey: false, ctrlKey: true })).toBe('submit')
    expect(skillEditorKeyboardAction({ isComposing: true, key: 'Enter', metaKey: true, ctrlKey: false })).toBeNull()
    expect(skillEditorKeyboardAction({ isComposing: false, key: 'a', metaKey: false, ctrlKey: false })).toBeNull()
  })
})
