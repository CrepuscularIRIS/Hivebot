import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { jsonSchemaParameters } from '../src/app/json-schema.ts'

/**
 * Exact snapshot predicate the DSH engine applies to registered `parameters` whenever a scope
 * projects tool schemas (dsh-tools projectToolSchema → snapshotJsonValue → walkJsonValue).
 * Extracted verbatim from the engine bundle: rejects -0, non-finite numbers, functions, class
 * instances, and any non-enumerable or non-string own key such as the `~standard` payload zod
 * attaches to `z.toJSONSchema` output.
 */
function hasIntrinsicConstructor(prototype: object, name: string): boolean {
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value
  if (typeof constructor !== 'function') return false
  try {
    return constructor.name === name && constructor.prototype === prototype &&
      Function.prototype.toString.call(constructor) === `function ${name}() { [native code] }`
  } catch {
    return false
  }
}
function isIntrinsicObjectPrototype(prototype: object): boolean {
  return Object.getPrototypeOf(prototype) === null && hasIntrinsicConstructor(prototype, 'Object')
}
function hasPlainArrayPrototype(value: unknown[]): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown[]
  if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, 'Array')) return false
  const objectPrototype = Object.getPrototypeOf(prototype)
  return typeof objectPrototype === 'object' && objectPrototype !== null && isIntrinsicObjectPrototype(objectPrototype)
}
function hasPlainObjectPrototype(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || typeof prototype === 'object' && isIntrinsicObjectPrototype(prototype)
}
function snapshotJsonValue(value: unknown): unknown {
  if (value === null) return value
  if (typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0) ? value : undefined
  if (typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    if (!hasPlainArrayPrototype(value) || Reflect.ownKeys(value).length !== value.length + 1) return undefined
    const copy: unknown[] = []
    for (let index = 0; index < value.length; index++) {
      const item = snapshotJsonValue(value[index])
      if (item === undefined) return undefined
      copy.push(item)
    }
    return copy
  }
  if (!hasPlainObjectPrototype(value)) return undefined
  const keys = Reflect.ownKeys(value)
  if (keys.some(key => typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(value, key))) return undefined
  const copy: Record<string, unknown> = {}
  for (const key of keys as string[]) {
    const item = snapshotJsonValue((value as Record<string, unknown>)[key])
    if (item === undefined) return undefined
    copy[key] = item
  }
  return copy
}

describe('registered tool parameters stay lossless JSON under the engine snapshot', () => {
  it('raw zod toJSONSchema output is rejected (regression guard for the zod ~standard payload)', () => {
    const raw = z.toJSONSchema(z.string())
    expect(snapshotJsonValue(raw)).toBeUndefined()
  })

  it('jsonSchemaParameters strips the payload and passes the engine snapshot', () => {
    const parameters = jsonSchemaParameters(z.object({
      resource: z.string().min(1),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(8000).optional(),
    }).strict())
    expect(snapshotJsonValue(parameters)).toBeDefined()
    expect(parameters).not.toHaveProperty('~standard')
  })

  it('the orchestrator_read schema survives the engine snapshot for main and executor scopes', () => {
    // Mirrors readTool in src/app/tools/tool.ts (imported lazily there to avoid the
    // tool.ts ↔ resources.ts module cycle under vitest).
    const readSchema = (executor: boolean) => z.object({
      resource: z.string().min(1).describe(`The resource, one of: ${executor ? 'tickets' : 'threads, tickets'}.`),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(8000).optional(),
    }).strict()
    for (const executor of [false, true]) {
      const parameters = jsonSchemaParameters(readSchema(executor))
      expect(snapshotJsonValue(parameters), `executor=${executor}`).toBeDefined()
    }
  })

  it('nested defaults and enum schemas stay lossless', () => {
    const parameters = jsonSchemaParameters(z.object({
      kind: z.enum(['create', 'update']),
      ids: z.array(z.string()),
      meta: z.record(z.string(), z.number()).optional(),
      note: z.string().default(''),
    }).strict())
    expect(snapshotJsonValue(parameters)).toBeDefined()
  })

  it('round-trip preserves every JSON-visible value (审查 F1：语义零损失)', () => {
    // toJSONSchema 的输出本身就是给 JSON 消费方（引擎投影）的纯 JSON 文档。
    // 断言：round-trip 结果与原输出在 JSON 可见内容上 deepEqual——唯一差异只能是非 JSON 的
    // 不可枚举 ~standard（上面已有 guard 证明它会被引擎拒）。
    const schemas = [
      z.string(),
      z.object({ resource: z.string().min(1), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(8000).optional() }).strict(),
      z.object({ kind: z.enum(['create', 'update']), ids: z.array(z.string()), meta: z.record(z.string(), z.number()).optional(), note: z.string().default('') }).strict(),
    ]
    for (const schema of schemas) {
      const original = JSON.parse(JSON.stringify(z.toJSONSchema(schema)))  // JSON 可见内容的真值基准
      expect(jsonSchemaParameters(schema)).toEqual(original)
    }
  })

  it('round-trip is idempotent (no hidden non-JSON state leaks back)', () => {
    const once = jsonSchemaParameters(z.object({ a: z.string().default('x') }).strict())
    expect(JSON.parse(JSON.stringify(once))).toEqual(once)
  })
})
