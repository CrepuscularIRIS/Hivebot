// P2-TEMP：P3 可推翻 — R14 fixture plugin: inserted through the RELATIVE
// specifier './lib/index.mjs' from this bundle's JSON patch, exactly the input
// class upstream anchorInsertedPluginNames supports and the SDK must anchor
// beside the patch file. Registers exactly one model tool so the connectors
// test can see it in the request tool table. A plain definition object goes
// straight to ctx.tools.register (no defineTool): the bundle workspace cannot
// resolve '@deepseek-ai/dsh-tools', and register()'s own checks accept
// { name, description, parameters, output { schema, render }, execute }.
export const name = 'p2sdk-fixture-relative-tool'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register({
    name: 'relative_ping',
    description: 'Fixture tool proving a relative-path connector patch loads.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
      required: [],
    },
    output: {
      schema: {
        type: 'object',
        properties: { pong: { type: 'string' } },
        additionalProperties: false,
        required: ['pong'],
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute() {
      return { pong: 'pong' }
    },
  })
}
