/** Normalizes zod JSON Schema documents for registration as tool `parameters`. */
import { z } from 'zod'

/**
 * zod attaches a non-enumerable `~standard` payload (a vendor object holding a `validate`
 * function) to `z.toJSONSchema` output. The engine's schema projection requires parameters to be
 * lossless JSON — every own key enumerable and no functions — so a raw document fails with
 * `tool "<name>" parameters must be lossless JSON before schema projection` the first time a
 * scope projects tool schemas (for example DS-Bot's computer-use masking calling
 * `ctx.tools.restrict`). A JSON round-trip keeps the schema itself (stringify skips the
 * non-enumerable payload) and drops anything JSON cannot carry losslessly.
 */
export const jsonSchemaParameters = <S extends z.ZodType>(schema: S): Record<string, unknown> =>
  JSON.parse(JSON.stringify(z.toJSONSchema(schema))) as Record<string, unknown>
