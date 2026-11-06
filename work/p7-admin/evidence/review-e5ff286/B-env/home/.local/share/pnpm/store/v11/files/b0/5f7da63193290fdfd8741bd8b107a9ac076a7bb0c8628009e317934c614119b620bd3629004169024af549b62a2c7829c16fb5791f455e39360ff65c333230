import { mergeConfig, build as build$1 } from 'vite';
import { g as getElectronPath, r as resolveConfig, f as asyncFlatten } from './lib-DoUt4oMD.js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import 'picocolors';
import 'node:fs';
import 'node:crypto';
import 'node:fs/promises';
import 'magic-string';
import 'node:url';
import 'rolldown';

const require$1 = createRequire(import.meta.url);
const RPC_TIMEOUT = 30_000;
const SHUTDOWN_TIMEOUT = 3_000;
class BytecodeCompiler {
    ps;
    rpcMap = new Map();
    invocationId = 0;
    starting;
    stopping;
    ready = false;
    stderr = '';
    start() {
        if (this.stopping)
            return Promise.reject(new Error('BytecodeCompiler is stopping'));
        if (this.starting)
            return this.starting;
        if (this.ready)
            return Promise.resolve();
        if (this.ps)
            return Promise.reject(new Error('Previous Electron process has not closed; await stop() first'));
        this.starting = this.initialize().finally(() => {
            this.starting = undefined;
        });
        return this.starting;
    }
    async initialize() {
        const env = { ...process.env, ELECTRON_VITE_RPC: 'true' };
        delete env.ELECTRON_RUN_AS_NODE;
        this.stderr = '';
        const compilerPath = path.join(path.dirname(require$1.resolve('electron-vite/package.json')), 'bin', 'electron-bytecode-main.cjs');
        const ps = spawn(getElectronPath(), [compilerPath], {
            stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
            windowsHide: true,
            env
        });
        this.ps = ps;
        if (ps.stderr) {
            ps.stderr.setEncoding('utf8');
            ps.stderr.on('data', (chunk) => {
                if (this.ps === ps)
                    this.stderr = (this.stderr + chunk).slice(-64 * 1024);
            });
        }
        ps.on('message', (message) => {
            if (this.ps !== ps || !message || message.type !== 'response')
                return;
            const pending = this.rpcMap.get(message.invocationId);
            if (!pending)
                return;
            clearTimeout(pending.timer);
            this.rpcMap.delete(message.invocationId);
            if (message.error) {
                const error = new Error(message.error.message);
                error.name = message.error.name;
                if (message.error.stack)
                    error.stack = message.error.stack;
                pending.reject(error);
            }
            else
                pending.resolve(message.result);
        });
        ps.on('error', error => {
            if (this.ps === ps)
                this.rejectPending(error);
        });
        ps.on('disconnect', () => {
            if (this.ps === ps)
                this.rejectPending(new Error('Electron IPC disconnected'));
        });
        ps.on('exit', (code, signal) => {
            if (this.ps === ps)
                this.rejectPending(new Error('Electron exited (code ' + code + ', signal ' + signal + ')'));
        });
        ps.on('close', () => {
            if (this.ps === ps) {
                this.rejectPending(new Error('Electron process closed'));
                this.ps = undefined;
            }
        });
        try {
            await this.sendRequest('ready', []);
            if (!ps.connected || this.stopping)
                throw new Error('Electron stopped during initialization');
            this.ready = true;
        }
        catch (error) {
            await this.stop();
            throw error;
        }
    }
    compile(target, code) {
        return this.request('compile', target, code);
    }
    async request(cmd, ...args) {
        if (!this.ready || this.stopping)
            throw new Error('BytecodeCompiler is not ready; await start() first');
        return this.sendRequest(cmd, args);
    }
    sendRequest(cmd, args) {
        const ps = this.ps;
        if (!ps?.connected)
            return Promise.reject(new Error('Electron IPC is not connected'));
        const invocationId = this.invocationId++;
        return new Promise((resolve, reject) => {
            const fail = (error) => {
                const pending = this.rpcMap.get(invocationId);
                if (!pending)
                    return;
                clearTimeout(pending.timer);
                this.rpcMap.delete(invocationId);
                reject(this.withStderr(error));
            };
            const timer = setTimeout(() => fail(new Error('Electron RPC timed out: ' + cmd)), RPC_TIMEOUT);
            this.rpcMap.set(invocationId, { resolve, reject, timer });
            try {
                ps.send({ type: 'request', invocationId, cmd, args }, error => {
                    if (error)
                        fail(error);
                });
            }
            catch (error) {
                fail(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }
    rejectPending(error) {
        this.ready = false;
        if (this.rpcMap.size)
            this.withStderr(error);
        for (const pending of this.rpcMap.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.rpcMap.clear();
    }
    withStderr(error) {
        const stderr = this.stderr.trim();
        if (stderr) {
            const stack = error.stack;
            error.message += '\n' + stderr;
            if (stack)
                error.stack = stack + '\n' + stderr;
        }
        return error;
    }
    stop() {
        if (this.stopping)
            return this.stopping;
        this.rejectPending(new Error('BytecodeCompiler stopped'));
        const ps = this.ps;
        if (!ps)
            return Promise.resolve();
        this.stopping = new Promise(resolve => {
            const timer = setTimeout(() => ps.kill('SIGKILL'), SHUTDOWN_TIMEOUT);
            ps.once('close', () => {
                clearTimeout(timer);
                resolve();
            });
            if (ps.connected) {
                try {
                    ps.send({ type: 'shutdown' }, error => {
                        if (error)
                            ps.kill();
                    });
                }
                catch {
                    ps.kill();
                }
            }
            else
                ps.kill();
        }).finally(() => {
            this.stopping = undefined;
        });
        return this.stopping;
    }
}

async function usesBytecode(config) {
    if (!config)
        return false;
    if (config.build?.bytecode)
        return true;
    const plugins = await asyncFlatten(config.plugins || []);
    return plugins.some(plugin => plugin && typeof plugin === 'object' && plugin.name === 'vite:bytecode');
}
/**
 * Bundles the electron app for production.
 */
async function build(inlineConfig = {}) {
    process.env.NODE_ENV_ELECTRON_VITE = 'production';
    const bytecodeCompiler = new BytecodeCompiler();
    const config = await resolveConfig(mergeConfig(inlineConfig, {
        plugins: [{ name: 'vite:electron-bytecode-build', api: { compiler: bytecodeCompiler } }]
    }), 'build', 'production');
    if (!config.config) {
        return;
    }
    const hasBytecode = (await usesBytecode(config.config.main)) || (await usesBytecode(config.config.preload));
    const buildTargets = async () => {
        // Build targets in order: main -> preload -> renderer
        for (const target of ['main', 'preload', 'renderer']) {
            const viteConfig = config.config?.[target];
            if (viteConfig) {
                // Disable watch mode in production builds
                if (viteConfig.build?.watch) {
                    viteConfig.build.watch = null;
                }
                await build$1(viteConfig);
            }
        }
    };
    if (!hasBytecode)
        return buildTargets();
    try {
        await bytecodeCompiler.start();
        await buildTargets();
    }
    finally {
        await bytecodeCompiler.stop();
    }
}

export { build };
