// D3 单测：MCP 连接器错误文案分类器（1.1.0 锚 ZLt/$Lt/sRt 逐分支）+ outcomeText 接线。
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { classifyConnectorError, connectorErrorCopy } from '../../renderer-grok/overrides/modules/connector-error'

describe('D3 classifyConnectorError（ZLt 锚）', () => {
  it('MCP server exited 前缀 → exited', () => {
    expect(classifyConnectorError('MCP server exited')).toBe('exited')
    expect(classifyConnectorError('MCP server exited; code 1')).toBe('exited')
  })
  it('stdout 噪声串 → stdout_noise', () => {
    expect(classifyConnectorError('Error: non-JSON-RPC output on stdout before initialize')).toBe('stdout_noise')
  })
  it('spawn errno：ENOENT/EACCES/EPERM/其他', () => {
    expect(classifyConnectorError('spawn node ENOENT')).toBe('spawn_enoent')
    expect(classifyConnectorError('error: spawnSync /x/y.sh EACCES')).toBe('spawn_permissions')
    expect(classifyConnectorError('spawn foo EPERM')).toBe('spawn_permissions')
    expect(classifyConnectorError('spawn foo EISDIR')).toBe('spawn_other')
  })
  it('无 errno：mcp-remote/Connection closed/timed out/other', () => {
    expect(classifyConnectorError('upstream via mcp-remote failed')).toBe('mcp_remote_upstream')
    expect(classifyConnectorError('Error: Connection closed')).toBe('handshake_closed')
    expect(classifyConnectorError('request timed out after 30s')).toBe('handshake_timeout')
    expect(classifyConnectorError('something odd')).toBe('other')
  })
})

describe('D3 connectorErrorCopy（$Lt+sRt 锚）', () => {
  it('六类可识别 → 人工文案 + technicalDetail', () => {
    expect(connectorErrorCopy('spawn node ENOENT')).toMatch(/^Command not found on Grok Bot's computer\..*Details: spawn node ENOENT$/)
    expect(connectorErrorCopy('spawnSync x EACCES')).toMatch(/^The command can't run on Grok Bot's computer\./)
    expect(connectorErrorCopy('Error: non-JSON-RPC output on stdout before initialize')).toMatch(/^The connector printed other output on stdout before starting\./)
    expect(connectorErrorCopy('mcp-remote upstream error')).toMatch(/^The remote server behind mcp-remote returned an error\./)
  })
  it('handshake 类需佐证（QLt）：无 stderr/超时串 → null', () => {
    expect(connectorErrorCopy('Connection closed')).toBeNull()
    expect(connectorErrorCopy('MCP server load timed out')).toMatch(/^The connector started but never answered\./)
    expect(connectorErrorCopy('Connection closed; stderr: boom')).toMatch(/^The connector stopped while starting\./)
  })
  it('spawn_other/exited/other → null（原样透传兜底）', () => {
    expect(connectorErrorCopy('MCP server exited; code 1')).toBeNull()
    expect(connectorErrorCopy('spawn foo EISDIR')).toBeNull()
    expect(connectorErrorCopy('weird failure')).toBeNull()
  })
})
