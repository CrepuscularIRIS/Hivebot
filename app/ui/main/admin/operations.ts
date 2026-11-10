// P7-F1 操作账本：一个 append-only jsonl（${PBOTS_DATA_DIR}/admin-operations.jsonl），
// 承担持久意图 / 审计 / 撤销句柄 / 代际回执 + 恢复投影（PLAN §3.2「操作账本」行）。
//
// 幂等与先落盘模式来源（第 3 级改造，非逐行复制）：
// - 本仓 app/ui/main/m3-meta/store.ts（U-13/D10e/W1 R8-R9）：单写队列、进程内单实例锁、
//   loadError fail-closed、close() 释放锁。
// - 本仓 app/sdk/src/orchestration/delivery.mjs，其上游
//   https://github.com/deepseek-ai/dsh-superagent-prototype@6337fc823ce20251c8de8085948165c81aaa701e:src/app/delivery.ts
//   （MIT）：稳定 id 至多一次 + flush 之后才算送达（P6-21.f1 接管语义：在途失败后来者可重试）。
// - SA stored work 语义（BRIEF §6.2 共同约束 ①，精确文本由 P7-R2 回填）：先写操作记录再执行，
//   读不到状态按未完成处理 → beginOperation 落盘成功才返回；finish 未落盘的操作重启后一律
//   inProgress（未知不判成功）。
//
// 失败语义（验收行）：append/flush 失败 → 副作用 0（begin 抛错，调用方不得执行）；同 key
// 并发仅 1 占位（去重检查在写队列位内做，无 TOCTOU）；丢文件/外部截短（append 前 stat 与
// 记账 size 不符）拒收不重建；版本未知/中段坏行整册 fail closed（读写都拒）。尾行撕裂按
// 行原子性修复：按字节保留完整 UTF-8 行，与持久 repaired 审计事件一并原子替换，失败则
// 保留原撕裂供重启重试；readOperations 永久置 tailTruncated（跨重启可读，不静默）。
import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'

/** 落盘文件名（$PBOTS_DATA_DIR/admin-operations.jsonl，PLAN §3.2）。 */
export const OPERATIONS_JSONL = 'admin-operations.jsonl'
/** 行版本；未知版本整册 fail closed。 */
export const OPERATIONS_VERSION = 1

/** 回合来源三分类（BRIEF §6.1.0：人类 / 受托（goal、schedule 等非人类不污染来源）/ 污染）。 */
export type TurnCategory = 'user' | 'delegated' | 'tainted'
const TURN_CATEGORIES: readonly TurnCategory[] = ['user', 'delegated', 'tainted']

export type Outcome = 'completed' | 'failed'
export type OperationStatus = 'inProgress' | 'completed' | 'failed' | 'undone'

/** 回合/会话引用（F2 负责分类与取证；本层只存）。 */
export interface SessionRef {
  sessionId?: string
  turnId?: string | number
  sourceKind?: string
}

/** 授权依据（H1 三元组的溯源引用；goalId/routineId/assignmentId 任选）。 */
export interface Authority {
  basis: string
  goalId?: string
  routineId?: string
  assignmentId?: string
}

/** 撤销句柄：opaque handle + 调用方为撤销所需的受限数据（不含凭证，深层扫描拒收）。 */
export interface UndoHandle {
  handle: string
  restore?: Record<string, unknown>
}

export interface BeginOperationRequest {
  /** 规范动作词（§3.3 词表，F2/执行器侧判定；本层只存非空串）。 */
  action: string
  actor: string
  turnCategory: TurnCategory
  /** 宿主当前代（重启类操作的回执以它为基线）。 */
  generation: number
  /** 精确目标（新建类操作可缺省）。 */
  target?: string
  /** 参数摘要（非全量参数；凭证样字段名拒入账）。 */
  params?: Record<string, unknown>
  authority?: Authority
  session?: SessionRef
  /** 去重键：全局唯一、跨重启持久；同 key 已存在（进行中或已终态）不建第二条。 */
  dedupeKey?: string
  /** 操作前业务状态投影（BRIEF §6.2「业务状态投影」列的观察面）。 */
  before?: Record<string, unknown>
  /** 本操作是 undoOf 所指操作的撤销（完成即翻转原操作到 undone）。 */
  undoOf?: string
}

export interface BeginOperationResult {
  operationId: string
  /** false = dedupeKey 已有操作（并发撞键或重放）：调用方不得再执行副作用。 */
  created: boolean
  status: OperationStatus
}

export interface FinishOperationResult {
  outcome: Outcome
  /** 操作后业务状态投影。 */
  after?: Record<string, unknown>
  undo?: UndoHandle
  error?: string
}

export interface GenerationReceipt {
  generation: number
  ts: number
}

export interface OperationProjection {
  operationId: string
  dedupeKey?: string
  ts: number
  generation: number
  turnCategory: TurnCategory
  actor: string
  action: string
  target?: string
  params?: Record<string, unknown>
  authority?: Authority
  session?: SessionRef
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  undo?: UndoHandle
  undoOf?: string
  status: OperationStatus
  error?: string
  receipt?: GenerationReceipt
}

/** 恢复投影（P7-F3 恢复 owner 与 P7-M/U 系列读这个接口）。 */
export interface OperationsView {
  inProgress: OperationProjection[]
  completed: OperationProjection[]
  failed: OperationProjection[]
  undone: OperationProjection[]
  /** 撕裂尾行曾发生（持久 repaired 事件在案）；读侧可见、不静默。 */
  tailTruncated: boolean
}

/** jsonl 行（判别字段 type；version 未知 → 整册 untrusted）。 */
type LedgerLine =
  | { version: number; ts: number; type: 'begin' } & Omit<BeginOperationRequest, 'action' | 'actor' | 'turnCategory' | 'generation'> & { operationId: string; action: string; actor: string; turnCategory: TurnCategory; generation: number }
  | { version: number; ts: number; type: 'finish'; operationId: string; outcome: Outcome; after?: Record<string, unknown>; undo?: UndoHandle; error?: string }
  | { version: number; ts: number; type: 'receipt'; operationId: string; generation: number }
  | { version: number; ts: number; type: 'repaired'; droppedBytes: number }

/** 凭证样字段名（词元级匹配：驼峰/连字符/下划线切词后比对；误伤如 maxTokens 按设计接受——
 * 审计边界宁拒勿漏，调用方应只传参数摘要）。 */
const CREDENTIAL_WORDS = new Set([
  'token', 'tokens', 'secret', 'secrets', 'password', 'passwords', 'passwd', 'passwds',
  'credential', 'credentials', 'apikey', 'apikeys', 'privatekey', 'authorization', 'cookie', 'cookies',
])

/** 键名切词（驼峰/分隔符）后按单词与相邻词对匹配：apiKey→apikey、x-api-key→apikey。 */
function credentialWordHit(key: string): boolean {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w !== '')
  const candidates = [...words]
  for (let i = 0; i + 1 < words.length; i += 1) candidates.push(words[i] + words[i + 1])
  return candidates.some((w) => CREDENTIAL_WORDS.has(w))
}

/** 深层扫描 value 里第一个凭证样字段路径；无则 undefined。只看键名，不看值。 */
function credentialKeyPath(value: unknown, path: string): string | undefined {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = credentialKeyPath(value[i], `${path}[${i}]`)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  for (const [key, v] of Object.entries(value)) {
    if (credentialWordHit(key)) return path === '' ? key : `${path}.${key}`
    const hit = credentialKeyPath(v, path === '' ? key : `${path}.${key}`)
    if (hit !== undefined) return hit
  }
  return undefined
}

function opsError(code: string, message: string): Error {
  return Object.assign(new Error(`${code}: ${message}`), { code })
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v !== ''
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** begin 请求形状校验（凭证扫描之外的显式字段）。 */
function invalidBeginReason(req: BeginOperationRequest): string | undefined {
  if (!isNonEmptyString(req.action)) return 'action must be a non-empty string'
  if (!isNonEmptyString(req.actor)) return 'actor must be a non-empty string'
  if (!TURN_CATEGORIES.includes(req.turnCategory)) {
    return `turnCategory must be one of ${TURN_CATEGORIES.join('/')}`
  }
  if (!Number.isInteger(req.generation) || req.generation < 0) return 'generation must be a non-negative integer'
  if (req.target !== undefined && !isNonEmptyString(req.target)) return 'target must be a non-empty string when present'
  if (req.undoOf !== undefined && !isNonEmptyString(req.undoOf)) return 'undoOf must be a non-empty string when present'
  if (req.dedupeKey !== undefined && !isNonEmptyString(req.dedupeKey)) return 'dedupeKey must be a non-empty string when present'
  if (req.params !== undefined && !isPlainObject(req.params)) return 'params must be a plain object when present'
  if (req.before !== undefined && !isPlainObject(req.before)) return 'before must be a plain object when present'
  if (req.session !== undefined && !isPlainObject(req.session)) return 'session must be a plain object when present'
  if (req.authority !== undefined && (!isPlainObject(req.authority) || !isNonEmptyString(req.authority.basis))) {
    return 'authority must be {basis: non-empty string, …} when present'
  }
  return undefined
}

/** finish 结果形状校验。 */
function invalidFinishReason(result: FinishOperationResult): string | undefined {
  if (result.outcome !== 'completed' && result.outcome !== 'failed') {
    return "outcome must be 'completed' or 'failed'"
  }
  if (result.after !== undefined && !isPlainObject(result.after)) return 'after must be a plain object when present'
  if (result.error !== undefined && typeof result.error !== 'string') return 'error must be a string when present'
  if (result.undo !== undefined && (!isPlainObject(result.undo) || !isNonEmptyString(result.undo.handle))) {
    return 'undo must be {handle: non-empty string, restore?} when present'
  }
  return undefined
}

/** 读侧行形状校验（版本未知/类型未知/必填缺失 → 整册 untrusted，不静默降级）。 */
function isTrustedLine(line: unknown): boolean {
  if (!isPlainObject(line)) return false
  if (line.version !== OPERATIONS_VERSION) return false
  if (typeof line.ts !== 'number') return false
  switch (line.type) {
    case 'begin':
      return isNonEmptyString(line.operationId) && TURN_CATEGORIES.includes(line.turnCategory as TurnCategory)
        && isNonEmptyString(line.action) && isNonEmptyString(line.actor) && Number.isInteger(line.generation)
    case 'finish':
      return isNonEmptyString(line.operationId) && (line.outcome === 'completed' || line.outcome === 'failed')
    case 'receipt':
      return isNonEmptyString(line.operationId) && Number.isInteger(line.generation)
    case 'repaired':
      return Number.isInteger(line.droppedBytes)
    default:
      return false
  }
}

/** 纯折叠：行序重放出每操作的投影与撕裂标记（导出供测试；读侧唯一语义源）。 */
export function foldOperations(lines: readonly LedgerLine[]): { entries: Map<string, OperationProjection>; tailTruncated: boolean } {
  const entries = new Map<string, OperationProjection>()
  let tailTruncated = false
  for (const line of lines) {
    if (line.type === 'repaired') { tailTruncated = true; continue }
    if (line.type === 'receipt') {
      const entry = entries.get(line.operationId)
      // 回执幂等：只认第一条（双回执在写侧已拒；撕裂重放场景后到的忽略）
      if (entry !== undefined && entry.receipt === undefined) {
        entry.receipt = { generation: line.generation, ts: line.ts }
      }
      continue
    }
    if (line.type === 'finish') {
      const entry = entries.get(line.operationId)
      if (entry !== undefined && entry.status === 'inProgress') {
        entry.status = line.outcome
        if (line.after !== undefined) entry.after = line.after
        if (line.undo !== undefined) entry.undo = line.undo
        if (line.error !== undefined) entry.error = line.error
      }
      continue
    }
    if (entries.has(line.operationId)) continue // 同 opId 重复 begin：保留首见
    const entry: OperationProjection = {
      operationId: line.operationId,
      ts: line.ts,
      generation: line.generation,
      turnCategory: line.turnCategory,
      actor: line.actor,
      action: line.action,
      status: 'inProgress',
    }
    if (line.dedupeKey !== undefined) entry.dedupeKey = line.dedupeKey
    if (line.target !== undefined) entry.target = line.target
    if (line.params !== undefined) entry.params = structuredClone(line.params)
    if (line.authority !== undefined) entry.authority = structuredClone(line.authority)
    if (line.session !== undefined) entry.session = structuredClone(line.session)
    if (line.before !== undefined) entry.before = structuredClone(line.before)
    if (line.undoOf !== undefined) entry.undoOf = line.undoOf
    entries.set(line.operationId, entry)
  }
  // 撤销翻转：一个 completed 的 undoOf 操作把目标（也 completed）翻到 undone
  for (const undoOp of entries.values()) {
    if (undoOp.undoOf === undefined || undoOp.status !== 'completed') continue
    const target = entries.get(undoOp.undoOf)
    if (target !== undefined && target.status === 'completed') target.status = 'undone'
  }
  return { entries, tailTruncated }
}

// 进程内单实例锁（同 m3 store.ts W1 R8：双实例的内存索引互不见 → 撞键双占位）。
// ponytail: 仅进程内锁；跨进程双开由 Electron 单实例兜底。
const openLedgers = new Map<string, OperationsLedger>()

/**
 * 操作账本：append-only jsonl + 内存行镜像。beginOperation 先落盘意图再返回（SA stored
 * work）；所有写经单一队列串行，去重检查在队列位内做；append 前 stat 校验记账 size，
 * 不符（丢文件/外部改动）即拒收。
 */
export class OperationsLedger {
  readonly file: string

  private lines: LedgerLine[] = []
  private size = 0
  private fileAbsent = true
  private loadError: Error | undefined
  private queue: Promise<unknown> = Promise.resolve()
  private closed = false
  private pending = 0

  constructor(dataDir: string) {
    this.file = resolve(dataDir, OPERATIONS_JSONL)
    const held = openLedgers.get(this.file)
    if (held !== undefined) {
      throw opsError('PBOTS_OPS_LOCKED', `operations ledger already open: ${this.file} (single-writer; close() the first instance)`)
    }
    openLedgers.set(this.file, this)
  }

  /** 永久停写；在途任务完成，未启动任务拒绝，全部结算后才释放锁。idle 时同步释放。 */
  close(): void {
    this.closed = true
    this.releaseIfClosed()
  }

  private releaseIfClosed(): void {
    if (this.closed && this.pending === 0 && openLedgers.get(this.file) === this) openLedgers.delete(this.file)
  }

  /** init 也可能修复写盘，必须参与同一队列与 close 的锁交接。 */
  async init(): Promise<void> {
    return this.enqueue(() => this.load())
  }

  /** 启动读盘建内存镜像。ENOENT → 新账本；版本未知/中段坏行 → loadError（读写全拒）。 */
  private async load(): Promise<void> {
    let bytes: Buffer
    try {
      bytes = await readFile(this.file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.fileAbsent = true
        return
      }
      this.loadError = error as Error
      return
    }
    this.fileAbsent = false
    if (bytes.length === 0) return // 0 字节（建后崩溃）：空账本
    // 换行位置与修复切片都按字节算；完整行必须是有效 UTF-8，不能用替换字符蒙混过关。
    const dropFrom = bytes.lastIndexOf(0x0a) + 1
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, dropFrom))
    } catch {
      this.loadError = opsError('PBOTS_OPS_UNTRUSTED', `invalid UTF-8 in ${this.file}`)
      return
    }
    const text = bytes.toString('utf8')
    const chunks = text.split('\n')
    const endsWithNewline = text.endsWith('\n')
    if (endsWithNewline && chunks[chunks.length - 1] === '') chunks.pop()
    let torn: string | undefined
    if (!endsWithNewline) {
      // 末块缺换行：能解析即完整记录（写侧带换行原子追加，缺的只是框架字节）；否则撕裂
      let parses = false
      try {
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(dropFrom)))
        parses = true
      } catch { parses = false }
      // 可解析与可信是两回事；完整的未知版本/形状仍须交给下方硬拒绝，不能当撕裂删掉。
      if (!parses) torn = chunks.pop()
    }
    const parsed: LedgerLine[] = []
    for (const [index, chunk] of chunks.entries()) {
      let line: unknown
      try {
        line = JSON.parse(chunk)
      } catch {
        this.loadError = opsError('PBOTS_OPS_UNTRUSTED', `corrupt line ${index + 1} in ${this.file}`)
        return
      }
      if (!isTrustedLine(line)) {
        this.loadError = opsError('PBOTS_OPS_UNTRUSTED', `untrusted line ${index + 1} (version/type/shape) in ${this.file}`)
        return
      }
      parsed.push(line as LedgerLine)
    }
    this.lines = parsed
    if (torn === undefined) {
      this.size = Buffer.byteLength(text, 'utf8')
      if (!endsWithNewline) {
        // 尾行完整但缺换行（外部编辑/撕裂恰好可解析）：补一个换行再续写，
        // 否则下一次 append 会与尾行拼接成坏行
        try {
          await this.appendLine('\n')
        } catch (error) {
          this.loadError = error as Error
        }
      }
      return
    }
    // 复用 m3-meta/store.ts 的 tmp + rename：完整字节前缀与 repaired 一起原子替换。
    // 追加/flush/rename 失败或中途崩溃时原撕裂仍在，下次 init 会重试；不留截断后无审计的窗口。
    const repaired: LedgerLine = {
      version: OPERATIONS_VERSION, ts: Date.now(), type: 'repaired', droppedBytes: bytes.length - dropFrom,
    }
    const replacement = Buffer.concat([bytes.subarray(0, dropFrom), Buffer.from(`${JSON.stringify(repaired)}\n`)])
    const tmp = `${this.file}.${randomUUID()}.tmp`
    try {
      const handle = await open(tmp, 'wx', 0o600)
      try {
        await handle.appendFile(replacement)
        await handle.sync()
      } finally { await handle.close() }
      await rename(tmp, this.file)
      const directory = await open(resolve(this.file, '..'), 'r')
      try { await directory.sync() } finally { await directory.close() }
      this.size = replacement.length
      this.lines.push(repaired)
    } catch (error) {
      this.loadError = error as Error // 修复失败仍整册关闭，不准执行副作用。
    } finally {
      await unlink(tmp).catch(() => undefined)
    }
  }

  /** 恢复投影（三类视图 + failed 分桶 + 撕裂标记）；loadError 时抛（fail closed）。 */
  readOperations(): OperationsView {
    if (this.loadError !== undefined) throw this.loadError
    const { entries, tailTruncated } = foldOperations(this.lines)
    const view: OperationsView = { inProgress: [], completed: [], failed: [], undone: [], tailTruncated }
    for (const entry of entries.values()) view[entry.status].push(structuredClone(entry))
    return view
  }

  /** 已完成（或已撤销）操作的撤销句柄；无句柄/未完成/未知操作 → undefined；loadError 抛。 */
  readUndo(operationId: string): UndoHandle | undefined {
    if (this.loadError !== undefined) throw this.loadError
    const entry = foldOperations(this.lines).entries.get(operationId)
    if (entry === undefined) return undefined
    if (entry.status !== 'completed' && entry.status !== 'undone') return undefined
    return entry.undo !== undefined ? structuredClone(entry.undo) : undefined
  }

  /**
   * 先落盘意图再执行（SA stored work）：append 成功返回 created:true，调用方此后才可执行
   * 副作用；append 失败抛错（副作用 0）。dedupeKey 已存在 → 不建第二条，返回既有操作
   * （created:false；并发撞键、重放、跨重启重开都走这里）。
   */
  async beginOperation(request: BeginOperationRequest): Promise<BeginOperationResult> {
    const bad = invalidBeginReason(request)
    if (bad !== undefined) throw opsError('PBOTS_OPS_BAD_REQUEST', bad)
    const cred = credentialKeyPath(request, '')
    if (cred !== undefined) throw opsError('PBOTS_OPS_CREDENTIAL_FIELD', `credential-like field rejected: ${cred}`)
    const frozen = structuredClone(request)
    return this.enqueue(async () => {
      this.assertHealthy()
      if (frozen.dedupeKey !== undefined) {
        const existing = this.findByKey(frozen.dedupeKey)
        if (existing !== undefined) {
          return { operationId: existing.operationId, created: false, status: existing.status }
        }
      }
      const operationId = randomUUID()
      const line: LedgerLine = {
        version: OPERATIONS_VERSION, ts: Date.now(), type: 'begin', operationId,
        action: frozen.action, actor: frozen.actor, turnCategory: frozen.turnCategory, generation: frozen.generation,
        ...(frozen.target !== undefined ? { target: frozen.target } : {}),
        ...(frozen.params !== undefined ? { params: frozen.params } : {}),
        ...(frozen.authority !== undefined ? { authority: frozen.authority } : {}),
        ...(frozen.session !== undefined ? { session: frozen.session } : {}),
        ...(frozen.dedupeKey !== undefined ? { dedupeKey: frozen.dedupeKey } : {}),
        ...(frozen.before !== undefined ? { before: frozen.before } : {}),
        ...(frozen.undoOf !== undefined ? { undoOf: frozen.undoOf } : {}),
      }
      await this.appendLine(`${JSON.stringify(line)}\n`)
      this.lines.push(line)
      return { operationId, created: true, status: 'inProgress' as OperationStatus }
    })
  }

  /** 追加终态事件（append-only，不改写既有行）。未知操作/已终态拒；凭证字段拒入账。 */
  async finishOperation(operationId: string, result: FinishOperationResult): Promise<void> {
    const bad = invalidFinishReason(result)
    if (bad !== undefined) throw opsError('PBOTS_OPS_BAD_REQUEST', bad)
    const cred = credentialKeyPath(result, '')
    if (cred !== undefined) throw opsError('PBOTS_OPS_CREDENTIAL_FIELD', `credential-like field rejected: ${cred}`)
    const frozen = structuredClone(result)
    return this.enqueue(async () => {
      this.assertHealthy()
      const entry = this.findEntry(operationId)
      if (entry === undefined) throw opsError('PBOTS_OPS_NOT_FOUND', `unknown operation: ${operationId}`)
      if (entry.status !== 'inProgress') throw opsError('PBOTS_OPS_INVALID_STATE', `operation already ${entry.status}: ${operationId}`)
      const line: LedgerLine = {
        version: OPERATIONS_VERSION, ts: Date.now(), type: 'finish', operationId,
        outcome: frozen.outcome,
        ...(frozen.after !== undefined ? { after: frozen.after } : {}),
        ...(frozen.undo !== undefined ? { undo: frozen.undo } : {}),
        ...(frozen.error !== undefined ? { error: frozen.error } : {}),
      }
      await this.appendLine(`${JSON.stringify(line)}\n`)
      this.lines.push(line)
    })
  }

  /**
   * 代际回执（BRIEF M6：完成由新代 restore 写回执）。generation 必须新于 begin 的代
   * （旧代/同代注入拒，§3.4「generation 不匹配的 receipt 拒绝」）；每操作至多一条。
   */
  async recordReceipt(operationId: string, generation: number): Promise<void> {
    if (!Number.isInteger(generation) || generation <= 0) {
      throw opsError('PBOTS_OPS_BAD_REQUEST', 'generation must be a positive integer')
    }
    return this.enqueue(async () => {
      this.assertHealthy()
      const entry = this.findEntry(operationId)
      if (entry === undefined) throw opsError('PBOTS_OPS_NOT_FOUND', `unknown operation: ${operationId}`)
      if (entry.receipt !== undefined) throw opsError('PBOTS_OPS_INVALID_STATE', `operation already has a receipt: ${operationId}`)
      if (generation <= entry.generation) {
        throw opsError('PBOTS_OPS_INVALID_STATE', `receipt generation ${generation} not newer than begin generation ${entry.generation}`)
      }
      const line: LedgerLine = { version: OPERATIONS_VERSION, ts: Date.now(), type: 'receipt', operationId, generation }
      await this.appendLine(`${JSON.stringify(line)}\n`)
      this.lines.push(line)
    })
  }

  /** 队列位内的状态查找（P6-10.f2 B-3：读判与写入同一队列位，无 TOCTOU）。 */
  private findEntry(operationId: string): OperationProjection | undefined {
    return foldOperations(this.lines).entries.get(operationId)
  }

  private findByKey(dedupeKey: string): OperationProjection | undefined {
    for (const line of this.lines) {
      if (line.type === 'begin' && line.dedupeKey === dedupeKey) return this.findEntry(line.operationId)
    }
    return undefined
  }

  private assertHealthy(): void {
    if (this.loadError !== undefined) throw this.loadError
  }

  /** close 后拒绝新任务和未启动任务；已启动任务（含 init 修复）结算前仍独占锁。 */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(opsError('PBOTS_OPS_CLOSED', 'operations ledger is closed'))
    this.pending += 1
    const run = this.queue.then(() => {
      if (this.closed) throw opsError('PBOTS_OPS_CLOSED', 'operations ledger is closed')
      return job()
    })
    const settled = (): void => {
      this.pending -= 1
      this.releaseIfClosed()
    }
    this.queue = run.then(settled, settled)
    return run
  }

  /**
   * 追加一行并 fsync。append 前 stat 校验：文件存在且 size 等于记账值，否则（被删/被
   * 外部改动）PBOTS_OPS_LOST 拒收、不重建（丢文件失败关闭）。写失败 → PBOTS_OPS_APPEND_FAILED，
   * 行不入内存镜像（begin 抛错，调用方副作用 0）。只有确认零字节追加才允许重试；
   * 部分追加或 sync 失败使读写 fail closed，须 close + 新实例 init 重读，未知意图不重放。
   */
  private async appendLine(line: string): Promise<void> {
    if (this.fileAbsent) {
      await mkdir(resolve(this.file, '..'), { recursive: true })
    } else {
      const st = await stat(this.file).catch(() => undefined)
      if (st === undefined || st.size !== this.size) {
        throw opsError('PBOTS_OPS_LOST', `ledger file missing or externally changed (expected ${this.size} bytes): ${this.file}`)
      }
    }
    const handle = await open(this.file, 'a')
    let appended = false
    try {
      await handle.appendFile(line)
      appended = true
      await handle.sync()
    } catch (error) {
      const failure = opsError('PBOTS_OPS_APPEND_FAILED', `append failed: ${(error as Error).message}`)
      // 只有能确认未追加字节时才允许重试；sync 失败永远不能证明意图未落盘。
      const unchanged = !appended && await stat(this.file).then(
        (st) => st.size === this.size,
        (cause: NodeJS.ErrnoException) => this.fileAbsent && cause.code === 'ENOENT',
      )
      if (!unchanged) this.loadError = failure // 必须 close + 新实例 init 重读；不删除/重放未知意图。
      throw failure
    } finally {
      await handle.close().catch(() => undefined)
    }
    this.fileAbsent = false
    this.size += Buffer.byteLength(line, 'utf8')
  }
}
