import colors from 'picocolors';
import { createLogger } from 'vite';
import { s as startElectron } from './lib-DoUt4oMD.js';
import { build } from './lib-DEbiQWuL.js';
import 'node:path';
import 'node:fs';
import 'node:module';
import 'node:child_process';
import 'node:crypto';
import 'node:fs/promises';
import 'magic-string';
import 'node:url';
import 'rolldown';

async function preview(inlineConfig = {}, options) {
    if (!options.skipBuild) {
        await build(inlineConfig);
    }
    const logger = createLogger(inlineConfig.logLevel);
    startElectron(inlineConfig.root);
    logger.info(colors.green(`\nstarting electron app...\n`));
}

export { preview };
