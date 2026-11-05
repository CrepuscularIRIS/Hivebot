// P7-F2 H1 核对（BRIEF v2.4 §6.1）：仅是 needs_approval 档的一种检查，
// 不是 always_allow / auto_review 的逐词原文引擎；原版分层接线另有任务。
// 核对（动作，精确目标，受限参数）；复用本回合人类原文或现有 grant 字段，
// 未能核验则 handoff 给现有审批，不增设 Mandate 格式或数据库。
// 不用 LLM 判断「像不像授权」；语义不清也不猜意图。
//
// 证据来源边界（H2/H4）：本函数只吃宿主传入的 humanUtteranceOfGrant（人类
// 来源原文）与 Mandate 的 grantUtterance（授予回合人类原文）。worker 回报、
// 事件正文、同回合工具结果永远不进这两个参数——它们的过滤是宿主采集侧
// （D-1 后接线）的职责，这里无从伪造也无需识别。
//
// 来源: 语义与词表 = 本仓 BRIEF v2.3 §6.1.1 / PLAN §3.3（决策已定）；
// 实现为 P7-F2 新增。文字 stop 是 P7-L4 的单独入口（只收紧不授权），不进
// 本词表。

/** §3.3 动作规范名/词表（规范名 → 中英动作词）。 */
export const ACTION_WORDS = {
  create: ['建', '创建', '新建', 'create'],
  modify: ['改', '修改', '改名', '设置', '更换', 'rename', 'modify', 'set', 'change'],
  archive: ['删', '删除', '归档', 'delete', 'archive'],
  install: ['装', '安装', 'install'],
  disable: ['卸', '卸载', '停用', 'uninstall', 'disable'],
  dispatch: ['派', '派工', '委派', 'dispatch', 'delegate'],
  restart: ['重启', 'restart', 'relaunch'],
}

/** 动作的目标在 Mandate 哪个范围桶（null = 无目标：restart）。人类回合的
 * create 不做目标匹配（§3.3：新对象无名可对），Mandate 路径的 create 按工
 * 作区桶核对（BRIEF §6.1.1 create_bot 非人类回合：目标工作区/仓 ∈ Mandate）。 */
export const ACTION_SCOPE = {
  create: 'workspaces',
  modify: 'bots',
  archive: 'bots',
  install: 'plugins',
  disable: 'plugins',
  dispatch: 'workspaces',
  restart: null,
}

/** §3.3 否定词：CJK 子串命中；拉丁整 token 命中（含 do not 二连）。 */
const CJK_NEGATIONS = ['别', '不要', '不许', '禁止', '先别', '暂不', '勿再', '勿', '不']
const LATIN_NEGATION_TOKENS = ['no', 'not', 'never', "don't", 'without']

/** §3.3：bot 名最短码点（ponytail 常量）——短名一律要求 id，不按名匹配。 */
export const MIN_BOT_NAME_CODEPOINTS = 2

/** §3.1/§6.2 禁区参数键（凭证 / 账号 / 权限 / 审批档位 / configForms）：
 * 出现即拒绝，无论授权原文怎么写。键归一 = 小写 + 去 -_ 。 */
export const PROHIBITED_PARAM_KEYS = [
  'account', 'accounts', 'accesstoken', 'apikey', 'approval', 'approvals',
  'approvaltiers', 'approvalyml', 'auth', 'authorization', 'configforms',
  'cookie', 'credential', 'credentials', 'passwd', 'password', 'permission',
  'permissions', 'pid', 'ppid', 'privatekey', 'processid', 'refreshtoken',
  'secret', 'secrets', 'sessiontoken', 'tier', 'tiers', 'token',
]
const PROHIBITED_KEY_SET = new Set(PROHIBITED_PARAM_KEYS)

const ZERO_WIDTH_RE = /[​-‏‪-‮⁠﻿]/g
const CLAUSE_SPLIT_RE = /[。；;！？!?\n，,]+/
const LATIN_TOKEN_RE = /[a-z0-9_.:/-]+/g
const LATIN_WORD_RE = /[a-z0-9_']+/g

/** 引号/代码块 span（指令被引用不授权；目标值被引用仍是完整值）。
 * stripQuoted 只用于动作词识别——否定词与目标匹配用全子句（宁可多拒，不多放）。 */
const QUOTE_SPANS = [/「[^」]*」/g, /『[^』]*』/g, /“[^”]*”/g, /‘[^’]*’/g, /"[^"]*"/g, /'[^']*'/g, /`[^`]*`/g]

/**
 * NFKC、Unicode case-fold（近似：toLowerCase）、去零宽/方向控制符、空白归一。
 * 连字符变体（U+2010/2011/2012/2212）折成 ASCII '-'：目录 id 只含 ASCII
 * '-'，折错方向也只是把同一 id 的变体拼写对齐，不会折叠成另一个 id。
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(ZERO_WIDTH_RE, '')
    .replace(/[‐‑‒−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripQuoted(clause) {
  let s = clause
  for (const re of QUOTE_SPANS) s = s.replace(re, ' ')
  return s
}

/**
 * 子句切分（§3.3）：`。；;！？!?\n` 划分指令子句，`，,` 可切分并列指令
 * （目标不从否定子句借到肯定子句）。先切分再归一空白，保住换行边界。
 * @param {string} text @returns {string[]}
 */
function splitClauses(text) {
  const base = String(text ?? '').normalize('NFKC').toLowerCase().replace(ZERO_WIDTH_RE, '')
  return base.split(CLAUSE_SPLIT_RE).map((c) => c.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

const wordRegexCache = new Map()
/** 动作词命中：拉丁词按词边界（installation 不算 install），CJK 词子串。 */
function wordPresent(clause, word) {
  if (/^[a-z]+$/.test(word)) {
    let re = wordRegexCache.get(word)
    if (!re) { re = new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`); wordRegexCache.set(word, re) }
    return re.test(clause)
  }
  return clause.includes(word)
}

/** 子句里是否出现该动作的动作词（引号/代码块内的指令不授权 → 用 stripQuoted 后的子句）。 */
function clauseHasAction(clause, action) {
  const bare = stripQuoted(clause)
  return ACTION_WORDS[action].some((w) => wordPresent(bare, w))
}

/** 子句里是否出现任一动作词（Mandate 范围项证据的共现要求）。 */
function clauseHasAnyAction(clause, actions) {
  const bare = stripQuoted(clause)
  return actions.some((a) => ACTION_WORDS[a].some((w) => wordPresent(bare, w)))
}

/** 子句是否含否定词。用全子句（未剥引号）：被引用的否定宁可多拒（否定优先）。 */
function clauseNegated(clause) {
  if (CJK_NEGATIONS.some((w) => clause.includes(w))) return true
  const tokens = clause.match(LATIN_WORD_RE) ?? []
  return LATIN_NEGATION_TOKENS.some((t) => tokens.includes(t))
    || tokens.some((t, i) => t === 'do' && tokens[i + 1] === 'not')
}

/**
 * 目标匹配（§3.3 token 相等，非子串）：拉丁/数字目标必须整 token 相等
 * （id 内 `-_.:/` 保留）；CJK/混合目标在子句内匹配（名称是汉字串，无空格
 * 可分词，靠 MIN_BOT_NAME_CODEPOINTS 与动作子句共现兜底）。
 * @param {string} clause 已归一子句（引号内的目标值可作完整值 → 不剥引号）
 * @param {string} target
 */
function targetMatches(clause, target) {
  const t = normalizeText(target)
  if (t === '') return false
  if (/^[\x20-\x7e]+$/.test(t)) return (clause.match(LATIN_TOKEN_RE) ?? []).includes(t)
  return clause.includes(t)
}

/**
 * 禁区参数扫描：plain object / array 深扫，键归一后命中即拒。
 * @param {unknown} params
 */
export function hasProhibitedParam(params, seen = new Set()) {
  if (params !== null && typeof params === 'object') {
    if (Array.isArray(params)) return params.some((p) => hasProhibitedParam(p, seen))
    if (seen.has(params)) return false
    seen.add(params)
    for (const [key, value] of Object.entries(params)) {
      if (PROHIBITED_KEY_SET.has(key.toLowerCase().replace(/[-_]/g, ''))) return true
      if (hasProhibitedParam(value, seen)) return true
    }
  }
  return false
}

const allow = (evidenceRef) => ({ decision: 'allow', code: 'allowed', reason: 'authorized', evidenceRef })
const deny = (code, reason) => ({ decision: 'deny', code, reason })
const handoff = (code, reason) => ({ decision: 'handoff', code, reason })

function allowWithParams(evidenceRef, action, target, params, utterance) {
  if (params == null) return allow(evidenceRef)
  const keys = Object.keys(params)
  if (!Array.isArray(params) && typeof params === 'object' && keys.length === 0) return allow(evidenceRef)
  // ponytail: H1 仅识别明确改名的单个 name 值；其他参数交回现有审批，
  // 不从值的“出现”推导字段授权，也不扩建通用原文解析引擎。
  if (action === 'modify' && keys.length === 1 && keys[0] === 'name' && typeof params.name === 'string') {
    const matched = String(utterance).split(CLAUSE_SPLIT_RE).some((clause) => {
      const match = clause.trim().match(/^rename\s+(\S+)\s+to\s+(.+)$/i)
      return match !== null && normalizeText(match[1]) === normalizeText(target) && match[2] === params.name
    })
    if (matched) return allow(evidenceRef)
  }
  return handoff('params-uncovered', 'H1 cannot verify the requested restricted parameters; route to existing approval')
}

/**
 * 人类原文路径（只对 turnClass 'user' 调用）。
 * @returns {{decision,code,reason,evidenceRef?} | null} null = 本路径无证据
 * （动作没提 / 目标没提），继续尝试 Mandate 路径。
 */
function humanPath(action, target, utterance, params) {
  const clauses = splitClauses(utterance)
  const actionClauses = clauses.filter((c) => clauseHasAction(c, action))
  if (actionClauses.length === 0) return null
  const negated = actionClauses.filter((c) => clauseNegated(c))
  const positive = actionClauses.filter((c) => !clauseNegated(c))
  // 人类回合 create 不做目标匹配；restart 无目标（§3.3）
  if (action === 'create' || action === 'restart') {
    if (negated.length > 0) return deny('negated', 'human explicitly negated this action')
    return allowWithParams({ source: 'human-utterance', clause: positive[0] }, action, target, params, utterance)
  }
  if (target == null || normalizeText(target) === '') return deny('target-required', 'action requires an exact target')
  if ([...normalizeText(target)].length < MIN_BOT_NAME_CODEPOINTS) {
    return deny('target-too-short', `target under MIN_BOT_NAME_CODEPOINTS=${MIN_BOT_NAME_CODEPOINTS}; use an id`)
  }
  // 否定优先：同动作同目标的正负冲突、目标只在否定子句出现 → 拒
  if (negated.some((c) => targetMatches(c, target))) return deny('negated', 'human explicitly negated this action+target')
  const hit = positive.find((c) => targetMatches(c, target))
  if (hit !== undefined) return allowWithParams({ source: 'human-utterance', clause: hit }, action, target, params, utterance)
  return null // 动作在、目标不在：不短路，Mandate 还可能覆盖
}

/**
 * Mandate 路径（单 Mandate 原则：一次一份，无并集入口——要 A 的动作 + B 的
 * 目标只能各自失败）。授予本身受 H1：逐动作、逐范围项都要在授予回合人类
 * 原文找到非否定且与动作共现的证据。
 */
function mandatePath(mandate, action, target, now, params) {
  const malformed = typeof mandate !== 'object' || mandate === null
    || !Array.isArray(mandate.actions) || mandate.actions.length === 0
    || mandate.actions.some((a) => typeof a !== 'string' || !Object.hasOwn(ACTION_WORDS, a))
    || typeof mandate.grantUtterance !== 'string' || normalizeText(mandate.grantUtterance) === ''
    || typeof mandate.scopes !== 'object' || mandate.scopes === null || Array.isArray(mandate.scopes)
    || Object.values(mandate.scopes).some((v) => !Array.isArray(v) || v.some((s) => typeof s !== 'string' || s === ''))
  if (malformed) return deny('malformed-mandate', 'mandate is not {actions[], scopes{bucket[]}, grantUtterance}')
  if (mandate.revoked === true) return deny('mandate-revoked', 'mandate was revoked by the human')
  if (mandate.deadline != null && now >= mandate.deadline) return deny('mandate-expired', 'mandate deadline passed')
  const clauses = splitClauses(mandate.grantUtterance)
  for (const a of mandate.actions) {
    if (!clauses.some((c) => clauseHasAction(c, a) && !clauseNegated(c))) {
      return handoff('mandate-grant-unevidenced', `mandate action ${a} has no non-negated evidence in the granting human turn`)
    }
    // 授予同样否定优先；只匹配该动作的范围桶，restart 无目标。
    const bucket = ACTION_SCOPE[a]
    if (clauses.some((c) => clauseHasAction(c, a) && clauseNegated(c)
      && (bucket === null || (mandate.scopes[bucket] ?? []).some((v) => targetMatches(c, v))))) {
      return deny('negated', 'human explicitly negated this mandate action+target')
    }
  }
  for (const values of Object.values(mandate.scopes)) {
    for (const value of values) {
      const evidenced = clauses.some((c) => !clauseNegated(c) && clauseHasAnyAction(c, mandate.actions) && targetMatches(c, value))
      if (!evidenced) return handoff('mandate-grant-unevidenced', `mandate scope ${value} has no grant evidence; item must not be written`)
    }
  }
  if (!mandate.actions.includes(action)) return handoff('mandate-action-uncovered', 'action not covered by this mandate (no union across mandates)')
  const bucket = ACTION_SCOPE[action]
  if (bucket !== null) {
    const allowed = mandate.scopes[bucket] ?? []
    const normalized = normalizeText(target)
    if (!allowed.some((v) => normalizeText(v) === normalized)) {
      return handoff('mandate-target-uncovered', 'target not covered by this mandate (no union across mandates)')
    }
  }
  // 桶成员资格不能把 install X / disable Y 交叉组合为 disable X。
  if (!clauses.some((c) => clauseHasAction(c, action) && !clauseNegated(c)
    && (bucket === null || targetMatches(c, target)))) {
    return handoff('mandate-pair-uncovered', 'requested action+target has no matching grant clause')
  }
  return allowWithParams({ source: 'mandate', mandateId: typeof mandate.id === 'string' ? mandate.id : null }, action, target, params, mandate.grantUtterance)
}

/**
 * H1 授权判定。输出 allow / deny（拒绝执行）/ handoff（未授权，转「需要你
 * 处理」，P6-18 通道）。
 * @param {{
 *   turnClass?: 'user' | 'delegated' | 'tainted',
 *   humanUtteranceOfGrant?: string,      // 宿主传入的本回合人类来源原文（唯一人类证据入口）
 *   mandate?: object | null,             // 单份 Mandate（K3：按 goalId/routineId 定位）
 *   action?: string, target?: string, params?: object,
 *   now?: number,                        // deadline 判定的时钟（测试注入）
 * }} input
 * @returns {{ decision: 'allow'|'deny'|'handoff', code: string, reason: string, evidenceRef?: object }}
 */
export function authorize(input = {}) {
  const { turnClass, humanUtteranceOfGrant, mandate, action, target, params, now = Date.now() } = input
  if (turnClass === 'tainted') return deny('tainted-turn', 'turn claimed pbots-worker; P6 guard rejects everything')
  if (typeof action !== 'string' || !Object.hasOwn(ACTION_WORDS, action)) {
    return deny('unknown-action', `unknown action ${JSON.stringify(action ?? null)}; F2 action table is closed`)
  }
  if (hasProhibitedParam(params)) return deny('prohibited-param', 'params touch a prohibited zone (credentials / permissions / approval tiers)')
  if (turnClass === 'user' && typeof humanUtteranceOfGrant === 'string' && normalizeText(humanUtteranceOfGrant) !== '') {
    const human = humanPath(action, target, humanUtteranceOfGrant, params)
    if (human !== null) return human // 显式否定在此短路，压过 Mandate
  }
  if (mandate !== null && mandate !== undefined) return mandatePath(mandate, action, target, now, params)
  return handoff('no-human-source', 'no human source in this turn and no mandate; route to 需要你处理')
}
