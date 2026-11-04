// M3 bots.json 存储（U-13）：原子写（tmp + rename）+ 单一 Promise 写队列（D10e）。
// v1 盘上形状 {version:1, mainBotId, recipes, bots?}——bots 为可选键（CONTRACT v1.5 §3.1，p6 决策 31）：
// 没有 worker 不写该键（字节与此前一致）；P6-15 只做读写透传（renderer 推导 worker 分组），写入方是 P6-10 的 ⑤ 编排。
// W1 R8：进程内单实例锁（双写者全量快照互覆）；W1 R9：flush 失败回滚内存态。
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** CONTRACT §3.1：recipes 按 presetId 存 {agentPreset, 规范化 connectors}。 */
export interface Recipe {
  agentPreset: string
  connectors: string[]
}

/** 盘上形状（version 1）。renderer 只写 mainBotId；recipes 只由 #4 编排写。 */
export interface BotsMeta {
  version: 1
  mainBotId: string | null
  recipes: Record<string, Recipe>
  bots?: Record<string, { createdBy: string }>
}

/** bots 可选键的校验：只留 {createdBy: 非空串}；空 → undefined（不写键）。 */
function botsOf(value: unknown): BotsMeta['bots'] {
  if (typeof value !== 'object' || value === null) return undefined
  const out: Record<string, { createdBy: string }> = {}
  for (const [id, v] of Object.entries(value)) {
    const by = (v as { createdBy?: unknown } | null)?.createdBy
    if (typeof by === 'string' && by !== '') out[id] = { createdBy: by }
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/** 落盘文件名（$PBOTS_DATA_DIR/bots.json，CONTRACT M3 行）。 */
export const BOTS_JSON = 'bots.json'

// 进程内单实例锁（W1 R8）：同 dataDir 双 store 全量快照互相覆盖（store.ts 旧 :71-77）。
// ponytail: 仅进程内锁，不跨进程；跨进程双开由 Electron app 级单实例兜底（未来需要再加锁文件）。
const openStores = new Map<string, BotsMetaStore>()

/** 单写者队列 + 原子写。所有变更先改内存、再串行落盘，读方永远看到完整 JSON。 */
export class BotsMetaStore {
  readonly file: string
  // 每实例独立空态（不得引用共享常量再突变——单测已抓过实例间串数据）。
  private meta: BotsMeta = { version: 1, mainBotId: null, recipes: {} }
  private loadError: Error | undefined
  private queue: Promise<unknown> = Promise.resolve()

  constructor(dataDir: string) {
    this.file = resolve(dataDir, BOTS_JSON)
    const held = openStores.get(this.file)
    if (held !== undefined) {
      throw Object.assign(
        new Error(`bots.json store already open: ${this.file} (single-writer; close() the first instance)`),
        { code: 'PBOTS_STORE_LOCKED' },
      )
    }
    openStores.set(this.file, this)
  }

  /** 释放单实例锁。生产进程内仅一个实例、随进程退出释放；测试模拟重启时调用。 */
  close(): void {
    if (openStores.get(this.file) === this) openStores.delete(this.file)
  }

  /** 启动读盘；ENOENT → 空 meta。坏 JSON / version 不符 → 记错，read() 抛。 */
  async init(): Promise<void> {
    let text: string
    try {
      text = await readFile(this.file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      this.loadError = error as Error
      return
    }
    try {
      const parsed = JSON.parse(text) as BotsMeta
      if (parsed.version !== 1 || typeof parsed.recipes !== 'object' || parsed.recipes === null) {
        throw new Error(`bots.json: unsupported payload (version=${JSON.stringify(parsed.version)})`)
      }
      const bots = botsOf(parsed.bots)
      this.meta = { version: 1, mainBotId: parsed.mainBotId ?? null, recipes: parsed.recipes, ...(bots === undefined ? {} : { bots }) }
    } catch (error) {
      this.loadError = error as Error
    }
  }

  /** 当前内存态深拷贝；init 时发现的坏文件在此抛出。 */
  read(): BotsMeta {
    if (this.loadError !== undefined) throw this.loadError
    const { bots } = this.meta
    return { version: 1, mainBotId: this.meta.mainBotId, recipes: structuredClone(this.meta.recipes), ...(bots === undefined ? {} : { bots: structuredClone(bots) }) }
  }

  /** 变更加入单一队列：改内存 → 串行原子落盘。后入队的看到先入队的内存态。 */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job)
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private async flush(): Promise<void> {
    const snapshot = JSON.stringify(this.read())
    const tmp = `${this.file}.tmp`
    await mkdir(join(this.file, '..'), { recursive: true })
    try {
      await writeFile(tmp, snapshot, 'utf8')
      await rename(tmp, this.file)
    } catch (error) {
      // W1 R9：失败时不留半写 tmp（固定名本会被下次覆盖，但失败可见性更差）
      await unlink(tmp).catch(() => undefined)
      throw error
    }
  }

  /** #4 编排写配方：同 key 同值幂等（CONTRACT §3.1「重复写无害」）。flush 失败回滚内存态（W1 R9）。 */
  putRecipe(presetId: string, recipe: Recipe): Promise<void> {
    return this.enqueue(async () => {
      const prev = this.meta.recipes[presetId]
      this.meta.recipes[presetId] = { agentPreset: recipe.agentPreset, connectors: [...recipe.connectors] }
      try {
        await this.flush()
      } catch (error) {
        if (prev === undefined) delete this.meta.recipes[presetId]
        else this.meta.recipes[presetId] = prev
        throw error
      }
    })
  }

  /** renderer 唯一可写字段（#20）。flush 失败回滚内存态（W1 R9）。 */
  patchMainBotId(mainBotId: string | null): Promise<void> {
    return this.enqueue(async () => {
      const prev = this.meta.mainBotId
      this.meta.mainBotId = mainBotId
      try {
        await this.flush()
      } catch (error) {
        this.meta.mainBotId = prev
        throw error
      }
    })
  }

  /**
   * ⑤ 建 bot 编排写 worker 身份（P6-10，CONTRACT §3.1/§2.4）：先落盘成功才建会话
   * / 返回成功——崩溃最多留下一条没有对应 session 的 createdBy（deriveBots 过滤）。
   * flush 失败回滚内存态（W1 R9）。幂等：同 id 重写同 createdBy 无害。
   */
  putBot(sessionId: string, createdBy: string): Promise<void> {
    return this.enqueue(async () => {
      const prev = this.meta.bots
      this.meta.bots = { ...(prev ?? {}), [sessionId]: { createdBy } }
      try {
        await this.flush()
      } catch (error) {
        this.meta.bots = prev
        throw error
      }
    })
  }
}
