/**
* Copyright (c) 2025 Bytedance, Inc. and its affiliates.
* SPDX-License-Identifier: Apache-2.0
*/
"use strict";
var __webpack_require__ = {};
(()=>{
    __webpack_require__.n = (module)=>{
        var getter = module && module.__esModule ? ()=>module['default'] : ()=>module;
        __webpack_require__.d(getter, {
            a: getter
        });
        return getter;
    };
})();
(()=>{
    __webpack_require__.d = (exports1, definition)=>{
        for(var key in definition)if (__webpack_require__.o(definition, key) && !__webpack_require__.o(exports1, key)) Object.defineProperty(exports1, key, {
            enumerable: true,
            get: definition[key]
        });
    };
})();
(()=>{
    __webpack_require__.o = (obj, prop)=>Object.prototype.hasOwnProperty.call(obj, prop);
})();
(()=>{
    __webpack_require__.r = (exports1)=>{
        if ('undefined' != typeof Symbol && Symbol.toStringTag) Object.defineProperty(exports1, Symbol.toStringTag, {
            value: 'Module'
        });
        Object.defineProperty(exports1, '__esModule', {
            value: true
        });
    };
})();
var __webpack_exports__ = {};
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
    startSseAndStreamableHttpMcpServer: ()=>startSseAndStreamableHttpMcpServer,
    BaseLogger: ()=>logger_namespaceObject.BaseLogger
});
const external_express_namespaceObject = require("express");
var external_express_default = /*#__PURE__*/ __webpack_require__.n(external_express_namespaceObject);
const external_node_crypto_namespaceObject = require("node:crypto");
const types_js_namespaceObject = require("@modelcontextprotocol/sdk/types.js");
const logger_namespaceObject = require("@agent-infra/logger");
const sse_js_namespaceObject = require("@modelcontextprotocol/sdk/server/sse.js");
const streamableHttp_js_namespaceObject = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
async function startSseAndStreamableHttpMcpServer(params) {
    const { port, host, createMcpServer, stateless = true, middlewares, routes = {}, logger = new logger_namespaceObject.ConsoleLogger() } = params;
    const routesConfig = {
        prefix: routes.prefix || '/',
        mcp: routes.mcp || '/mcp',
        message: routes.message || '/message',
        sse: routes.sse || '/sse'
    };
    const buildPath = (routePath)=>{
        const prefix = routesConfig.prefix.endsWith('/') ? routesConfig.prefix.slice(0, -1) : routesConfig.prefix;
        const normalizedPath = routePath.startsWith('/') ? routePath : `/${routePath}`;
        return '/' === prefix ? normalizedPath : `${prefix}${normalizedPath}`;
    };
    const transports = {
        streamable: new Map(),
        sse: new Map()
    };
    const app = external_express_default()();
    app.use(external_express_default().json());
    app.use((err, _req, res, next)=>{
        if (err instanceof SyntaxError && (null == err ? void 0 : err.status) === 400 && 'body' in err) {
            res.status(400).send({
                jsonrpc: '2.0',
                error: {
                    code: types_js_namespaceObject.ErrorCode.ParseError,
                    message: err.message
                }
            });
            return;
        }
        next();
    });
    if (middlewares) middlewares.forEach((middleware)=>app.use(middleware));
    app.get(buildPath(routesConfig.sse), async (req, res)=>{
        const mcpServer = await createMcpServer({
            headers: req.headers
        });
        logger.info(`New SSE connection from ${req.ip}`);
        const sseTransport = new sse_js_namespaceObject.SSEServerTransport(buildPath(routesConfig.message), res);
        transports.sse.set(sseTransport.sessionId, sseTransport);
        res.on('close', ()=>{
            transports.sse.delete(sseTransport.sessionId);
        });
        await mcpServer.connect(sseTransport);
    });
    app.post(buildPath(routesConfig.message), async (req, res)=>{
        const sessionId = req.query.sessionId;
        if (!sessionId) {
            res.status(400).send('Missing sessionId parameter');
            return;
        }
        const transport = transports.sse.get(sessionId);
        if (transport) await transport.handlePostMessage(req, res, req.body);
        else res.status(400).send('No transport found for sessionId');
    });
    app.post(buildPath(routesConfig.mcp), async (req, res)=>{
        const mcpServer = await createMcpServer({
            headers: req.headers
        });
        let transport;
        if (stateless) transport = new streamableHttp_js_namespaceObject.StreamableHTTPServerTransport({
            enableJsonResponse: true,
            sessionIdGenerator: void 0
        });
        else {
            const sessionId = Array.isArray(req.headers['mcp-session-id']) ? req.headers['mcp-session-id'][0] : req.headers['mcp-session-id'];
            if (sessionId && transports.streamable.has(sessionId)) transport = transports.streamable.get(sessionId);
            else if (!sessionId && (0, types_js_namespaceObject.isInitializeRequest)(req.body)) {
                transport = new streamableHttp_js_namespaceObject.StreamableHTTPServerTransport({
                    sessionIdGenerator: ()=>(0, external_node_crypto_namespaceObject.randomUUID)(),
                    onsessioninitialized: (sessionId)=>{
                        transports.streamable.set(sessionId, transport);
                    }
                });
                transport.onclose = ()=>{
                    if (null == transport ? void 0 : transport.sessionId) transports.streamable.delete(transport.sessionId);
                };
            } else {
                res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: types_js_namespaceObject.ErrorCode.ConnectionClosed,
                        message: 'Bad Request: No valid session ID provided'
                    },
                    id: null
                });
                return;
            }
        }
        await mcpServer.connect(transport);
        logger.log('Received MCP request:', req.body);
        try {
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            logger.error('Error handling MCP request:', error);
            if (!res.headersSent) res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: types_js_namespaceObject.ErrorCode.InternalError,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    });
    app.get(buildPath(routesConfig.mcp), async (req, res)=>{
        logger.info('Received GET MCP request');
        res.writeHead(405).end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: types_js_namespaceObject.ErrorCode.ConnectionClosed,
                message: 'Method not allowed.'
            },
            id: null
        }));
    });
    app.delete(buildPath(routesConfig.mcp), async (req, res)=>{
        logger.info('Received DELETE MCP request');
        res.writeHead(405).end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: types_js_namespaceObject.ErrorCode.ConnectionClosed,
                message: 'Method not allowed.'
            },
            id: null
        }));
    });
    const HOST = host || '::';
    const PORT = Number(port || process.env.PORT || 8080);
    return new Promise((resolve, reject)=>{
        const appServer = app.listen(PORT, HOST, (error)=>{
            if (error) {
                logger.error('Failed to start server:', error);
                reject(error);
                return;
            }
            const address = appServer.address();
            const actualHost = ((null == address ? void 0 : address.family) === 'IPv6' ? `[${address.address}]` : null == address ? void 0 : address.address) || HOST;
            const endpoint = {
                url: `http://${actualHost}:${PORT}${buildPath(routesConfig.mcp)}`,
                sseUrl: `http://${actualHost}:${PORT}${buildPath(routesConfig.sse)}`,
                port: PORT,
                close: ()=>appServer.close()
            };
            logger.info(`Streamable HTTP MCP Server listening at ${endpoint.url}`);
            logger.info(`SSE MCP Server listening at ${endpoint.sseUrl}`);
            resolve(endpoint);
        });
        appServer.on('error', (error)=>{
            logger.error('Server error:', error);
            reject(error);
        });
    });
}
var __webpack_export_target__ = exports;
for(var __webpack_i__ in __webpack_exports__)__webpack_export_target__[__webpack_i__] = __webpack_exports__[__webpack_i__];
if (__webpack_exports__.__esModule) Object.defineProperty(__webpack_export_target__, '__esModule', {
    value: true
});
