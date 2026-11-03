// P5-22（PLAN p5-parity，D-1 定稿 ⑤ 会话级联网许可 + 席 A 收紧）：受控升权
// 路径的签发侧。模型可见工具 `request_network{reason, command}`，每次 ASK、无
// 始终允许（shell-ask.mjs 的硬分支在档位表判定之前，不经表、不可经 overlay 配置
// 放宽；审批本身只有 allowed-once / rejected 语义）。用户批准后本插件的 execute
// 才会运行：向 mask 根内的许可目录写一个**一次性许可文件**——
//   {version, session, argvHash, issuedAt, expiresAt, nonce}
//   argvHash = sha256(JSON(['bash','-c',command]))——与 sandbox/bwrap-wrap.py 侧
//   json.dumps(…, separators=(',',':'), ensure_ascii=False) 跨语言同一规范
//   （tests/unit/request-net.test.ts 对拍真实 python3；e2e 用 mjs 签发、python
//   wrapper 命中双向证明）。bash-sandbox 0.2.2-alpha.2 confine 恒以
//   ['bash','-c',command] 为沙箱内 argv（bash-sandbox/src/index.ts 私有 confine），
//   wrapper 对 `--` 后收到的该 argv 算同一哈希。
//   TTL≈60s（D1-r1；config.ttlMs 仅 runtime patch / 测试注入，生产 60000）。
//   session = exec.agent.session.header.id——与 shell-env 注入 bash 的
//   DSH_SESSION_ID 同一访问面（shell-env/src/index.ts:162），wrapper 按环境里的
//   DSH_SESSION_ID 校验：另一会话的 bash 拿不到网络。
// 许可目录在数据根（mask 根）下：bash 视角整棵 tmpfs 遮蔽（`test -e` 退出码 1，
// 验收 ⑤）；文件工具视角由 guard 的 dataMaskRoots 软遮蔽兜底。文件 0600、O_EXCL
// 随机名（不覆盖、不碰撞）。用后即删 / 过期即删由 wrapper 侧承担（unlink 抢占）。
//
// 通道判断（任务要求在报告写明）：不走 D-2 p6 的 S-2(h) 自定义 stream。审批经
// dsh 既有 approval waterfall（$events → UI / 测试客户端代答）已把用户决定带回
// SDK，「签发」无需 main 参与业务逻辑；许可通道复用决策 16 的文件模式（方向相
// 反：受信的 SDK 侧签发、宿主侧 wrapper 读取校验），两侧路径同源于数据根推导。
export const name = 'p2sdk-request-net'
export const inject = ['tools']

import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 许可文件 schema 版本（与 wrapper 侧一致；不符即无效）。 */
export const PERMIT_VERSION = 1

/** 生产 TTL（D1-r1 ≈60s）；测试经 config.ttlMs 注入短值。 */
const DEFAULT_TTL_MS = 60_000

/** command 长度上限：与 bash 工具自身的命令上限同量级，超长直接拒绝。 */
const MAX_COMMAND_CHARS = 8192

/**
 * argv 规范哈希：sha256(JSON.stringify(argv))。与 bwrap-wrap.py 的
 * json.dumps(argv, ensure_ascii=False, separators=(',',':')) 同一规范（跨语言
 * 对拍钉死）；JSON 数组的纯字符串元素两侧序列化逐字节一致。
 * @param {readonly string[]} argv
 * @returns {string} hex
 */
export function hashArgv(argv) {
  return createHash('sha256').update(JSON.stringify(argv)).digest('hex')
}

/** bash-sandbox confine 的沙箱内 argv 形状（0.2.2-alpha.2 钉住）。 */
export function bashArgv(command) {
  return ['bash', '-c', command]
}

/**
 * 校验模型参数（信任边界：模型可控输入，全部 fail closed）。
 * @returns {null | string} null=合法；string=拒绝原因。
 */
export function validateRequest(args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return 'request_network: arguments must be an object'
  if (typeof args.reason !== 'string' || args.reason.trim().length === 0) return 'request_network: "reason" must be a non-empty string'
  if (typeof args.command !== 'string' || args.command.length === 0) return 'request_network: "command" must be a non-empty string'
  if (args.command.length > MAX_COMMAND_CHARS) return `request_network: "command" is too long (>${MAX_COMMAND_CHARS} chars)`
  return null
}

/**
 * 签发一次性许可文件（O_EXCL 随机名，0600；目录不存在则创建）。
 * @param {{dir: string, session: string, command: string, ttlMs?: number}} req
 * @returns {{file: string, name: string, permit: object}}
 */
export function issuePermit(req) {
  mkdirSync(req.dir, { recursive: true, mode: 0o700 })
  const issuedAt = Date.now()
  const permit = {
    version: PERMIT_VERSION,
    session: req.session,
    argvHash: hashArgv(bashArgv(req.command)),
    issuedAt,
    expiresAt: issuedAt + (req.ttlMs ?? DEFAULT_TTL_MS),
    nonce: randomUUID(),
  }
  const name = `permit-${issuedAt.toString(36)}-${randomUUID()}.json`
  const file = join(req.dir, name)
  writeFileSync(file, JSON.stringify(permit) + '\n', { mode: 0o600, flag: 'wx' })
  return { file, name, permit }
}

/**
 * 宿主平面注册一次：模型可见工具 + pre-execute 恒 ASK。工具 execute 只在用户
 * 批准后运行——此处即「签发点」。config.permitDir / config.ttlMs 由
 * src/start.ts 的 runtime patch 行注入（同 shellAskRow 机制）；缺失 → fail loud，
 * 与 guard 决策 6 同一取向（不静默退化为「工具存在但永不签发」的半吊子态）。
 */
export function apply(ctx, config = {}) {
  const permitDir = config !== null && typeof config === 'object' ? config.permitDir : undefined
  if (typeof permitDir !== 'string' || permitDir.length === 0) {
    throw new Error('p2sdk-request-net: config.permitDir is required — the launcher writes the request-net row (permit dir derived from the data root) into the runtime patch; a missing row is a misconfiguration')
  }
  const ttlMs = typeof config.ttlMs === 'number' && Number.isFinite(config.ttlMs) && config.ttlMs > 0 ? config.ttlMs : DEFAULT_TTL_MS

  const dispose = ctx.tools.register({
    name: 'request_network',
    description: 'Request one-time network access for exactly one bash command. Shows the full command to the user for approval; after approval, run the SAME command with the bash tool immediately (the permit is single-use and expires in ~60 seconds). Network access still blocks host loopback (gateway alias, localhost, 127.0.0.1).',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why network access is needed (shown to the user).' },
        command: { type: 'string', description: 'The exact bash command that needs network. Must be run verbatim with the bash tool after approval.' },
      },
      required: ['reason', 'command'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          command: { type: 'string' },
          expiresInSeconds: { type: 'number' },
          notice: { type: 'string' },
        },
        required: ['status', 'command', 'expiresInSeconds', 'notice'],
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    timeoutMs: 15_000,
    async execute(args, exec) {
      const bad = validateRequest(args)
      if (bad !== null) throw new Error(bad)
      const session = exec.agent !== undefined ? exec.agent.session?.header?.id : undefined
      if (typeof session !== 'string' || session.length === 0) {
        throw new Error('request_network: cannot identify the calling session; refusing to issue a network permit')
      }
      const { permit } = issuePermit({ dir: permitDir, session, command: args.command, ttlMs })
      return {
        status: 'granted',
        command: args.command,
        expiresInSeconds: Math.round((permit.expiresAt - permit.issuedAt) / 1000),
        notice: `Permit issued for this session and this exact command. Run it with the bash tool NOW (single use, expires in ~${Math.round(ttlMs / 1000)}s). Host loopback stays blocked.`,
      }
    },
  })
  ctx.effect(() => dispose)
}
