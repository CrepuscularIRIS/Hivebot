// D3（1.1.0 锚）：MCP 连接器错误文案分类器。原版锚 deb110 asar index.eager-app-DNSDeodN.js：
// ZLt（原始错误串→类型）+ $Lt（handshake 类需 stderr 佐证）+ sRt（类型→六条 i18n 文案，
// technicalDetail 插值）；spawn_other/exited/无类型 → 原样返回（不映射）。
// 文案键（index.eager-common-DcDxc78C.js）：cBTI3L / /B+gxB / 3eqnoK / yLbbUN / cvDf3B / Qqs4I4。

/** 原版 YLt：spawn/spawnSync 错误串里提 errno（如 "spawn node ENOENT"）。 */
const ERRNO_RE = /(?:^|[\s(:;])spawn(?:Sync)? \S+ (E[A-Z0-9]+)\b/

/** 原版 QLt：handshake 类认定的佐证（stderr 尾巴或明确的 load/connection 超时串）。 */
const HANDSHAKE_EVIDENCE_RE = /; stderr: |\bMCP server (?:load|connection) timed out\b/

export type ConnectorErrorKind =
  | 'spawn_enoent' | 'spawn_permissions' | 'spawn_other'
  | 'handshake_closed' | 'handshake_timeout'
  | 'stdout_noise' | 'mcp_remote_upstream' | 'exited' | 'other'

/** 原版 ZLt：原始错误串 → 类型。 */
export function classifyConnectorError(raw: string): ConnectorErrorKind {
  const t = raw.trim()
  if (t === 'MCP server exited' || t.startsWith('MCP server exited;')) return 'exited'
  if (t.includes('non-JSON-RPC output on stdout before initialize')) return 'stdout_noise'
  const errno = ERRNO_RE.exec(t)?.[1]
  if (errno !== undefined) {
    if (errno === 'ENOENT') return 'spawn_enoent'
    if (errno === 'EACCES' || errno === 'EPERM') return 'spawn_permissions'
    return 'spawn_other'
  }
  if (/\bmcp-remote\b/i.test(t)) return 'mcp_remote_upstream'
  if (/\bConnection closed\b/i.test(t)) return 'handshake_closed'
  if (/\btimed out\b/i.test(t)) return 'handshake_timeout'
  return 'other'
}

/** 原版 $Lt：ZLt + handshake 佐证；其余 other 不给映射。返回 null = 无类型（文案层原样透传）。 */
function errorKindForCopy(raw: string): ConnectorErrorKind | null {
  const kind = classifyConnectorError(raw)
  if (kind === 'other') return null
  if ((kind === 'handshake_closed' || kind === 'handshake_timeout') && !HANDSHAKE_EVIDENCE_RE.test(raw)) return null
  return kind
}

/** 原版 sRt 的六条文案（technicalDetail 尾接）。null = 原样返回 raw。 */
const COPY: Record<Exclude<ConnectorErrorKind, 'spawn_other' | 'exited' | 'other'>, string> = {
  spawn_enoent: "Command not found on Grok Bot's computer. Use the command's full path, or set PATH in the connector's env. Details: ",
  spawn_permissions: "The command can't run on Grok Bot's computer. Make the script executable (chmod +x), or run it through its interpreter. Details: ",
  handshake_closed: 'The connector stopped while starting. Its error output usually names a missing package, credential, or environment variable. Details: ',
  handshake_timeout: 'The connector started but never answered. Make sure it starts within a minute and writes only MCP messages to stdout. Details: ',
  stdout_noise: 'The connector printed other output on stdout before starting. Send its logs to stderr. Details: ',
  mcp_remote_upstream: 'The remote server behind mcp-remote returned an error. Check its URL and credentials. Details: ',
}

/** 市场/安装失败文案入口：可识别类型 → 六条之一（附 technicalDetail）；否则 null（调用方走原兜底）。 */
export function connectorErrorCopy(raw: string): string | null {
  const kind = errorKindForCopy(raw)
  if (kind === null || kind === 'spawn_other' || kind === 'exited') return null
  return COPY[kind] + raw
}
