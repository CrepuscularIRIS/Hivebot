import { createFilter } from 'vite';
export { createLogger, defineConfig as defineViteConfig, mergeConfig } from 'vite';
export { C as ConfigFactory, M as MainConfigFactory, P as PreloadConfigFactory, R as RendererConfigFactory, b as bytecodePlugin, d as defineConfig, e as externalizeDepsPlugin, l as loadConfigFromFile, a as loadEnv, r as resolveConfig } from './chunks/lib-DoUt4oMD.js';
export { createServer } from './chunks/lib-CLhLGLN3.js';
export { build } from './chunks/lib-DEbiQWuL.js';
export { preview } from './chunks/lib-BdmKdP2Y.js';
import { createRequire } from 'node:module';
import 'node:path';
import 'picocolors';
import 'node:fs';
import 'node:child_process';
import 'node:crypto';
import 'node:fs/promises';
import 'magic-string';
import 'node:url';
import 'rolldown';

async function transformWithSWC(code, id, options) {
    const { sourcemap = false, minify = false } = options;
    delete options.sourcemap;
    delete options.minify;
    const isTs = /\.tsx?$/.test(id);
    const require = createRequire(import.meta.url);
    let swc;
    try {
        swc = require('@swc/core');
    }
    catch {
        throw new Error('swc plugin require @swc/core, you need to install it.');
    }
    const jsc = {
        parser: {
            syntax: isTs ? 'typescript' : 'ecmascript',
            decorators: true
        },
        transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
            ...options
        },
        keepClassNames: true,
        target: 'es2022',
        minify: {
            format: {
                comments: false
            }
        }
    };
    const result = await swc.transform(code, {
        jsc,
        sourceMaps: sourcemap,
        minify,
        configFile: false,
        swcrc: false
    });
    const map = sourcemap && result.map ? JSON.parse(result.map) : { mappings: '' };
    return {
        code: result.code,
        map
    };
}
/**
 * Use SWC to support for emitting type metadata for decorators.
 * When using `swcPlugin`, you need to install `@swc/core`.
 */
function swcPlugin(options = {}) {
    const filter = createFilter(options.include || /\.(m?ts|[jt]sx)$/, options.exclude || /\.js$/);
    let sourcemap = false;
    let minify = false;
    return {
        name: 'vite:swc',
        config() {
            // Vite 8 defaults to Oxc for transform; `esbuild: false` is ignored and
            // warns. SWC replaces both paths when this plugin is active.
            // See https://github.com/alex8088/electron-vite/issues/916
            return {
                esbuild: false,
                oxc: false
            };
        },
        async configResolved(resolvedConfig) {
            sourcemap = resolvedConfig.build?.sourcemap === 'inline' ? 'inline' : !!resolvedConfig.build?.sourcemap;
            minify = resolvedConfig.build?.minify;
        },
        async transform(code, id) {
            if (filter(id)) {
                const result = await transformWithSWC(code, id, { sourcemap, ...(options.transformOptions || {}) });
                return {
                    code: result.code,
                    map: result.map
                };
            }
        },
        async renderChunk(code, chunk) {
            if (!minify || minify === 'terser' || minify === 'oxc') {
                return null;
            }
            const result = await transformWithSWC(code, chunk.fileName, {
                sourcemap,
                minify: true,
                ...(options.transformOptions || {})
            });
            return {
                code: result.code,
                map: result.map
            };
        }
    };
}

export { swcPlugin };
