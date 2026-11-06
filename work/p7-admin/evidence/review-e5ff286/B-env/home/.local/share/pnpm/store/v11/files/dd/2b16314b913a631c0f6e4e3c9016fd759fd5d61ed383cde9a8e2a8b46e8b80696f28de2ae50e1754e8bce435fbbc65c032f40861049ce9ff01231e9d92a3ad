import { NextFunction, Request, Response } from 'express';
import { Logger, BaseLogger } from '@agent-infra/logger';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
export { BaseLogger };
export interface RoutesConfig {
    /** Route prefix for all endpoints. Default is '/' */
    prefix?: string;
    /** MCP endpoint path. Default is '/mcp', really means '/${prefix}/mcp' */
    mcp?: string;
    /** Message endpoint path for SSE. Default is '/message', really means '/${prefix}/message' */
    message?: string;
    /** SSE endpoint path. Default is '/sse', really means '/${prefix}/sse' */
    sse?: string;
}
export interface McpServerEndpoint {
    url: string;
    sseUrl: string;
    port: number;
    close: () => void;
}
export interface RequestContext extends Pick<Request, 'headers'> {
}
export type MiddlewareFunction = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;
interface StartSseAndStreamableHttpMcpServerParams {
    port?: number;
    host?: string;
    /** Enable stateless mode for streamable http transports. Default is True */
    stateless?: boolean;
    /** Custom middlewares */
    middlewares?: MiddlewareFunction[];
    /** Routes configuration */
    routes?: RoutesConfig;
    logger?: Logger;
    createMcpServer: (req: RequestContext) => Promise<McpServer | Server>;
}
export declare function startSseAndStreamableHttpMcpServer(params: StartSseAndStreamableHttpMcpServerParams): Promise<McpServerEndpoint>;
//# sourceMappingURL=startServer.d.ts.map