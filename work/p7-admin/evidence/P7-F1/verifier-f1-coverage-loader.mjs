import { registerHooks } from 'node:module';
const provider='file:///tmp/bot-wt/P7-F1/app/ui/node_modules/.pnpm/@vitest+coverage-v8@5.0.5_vitest@5.0.5/node_modules/@vitest/coverage-v8/dist/';
registerHooks({resolve(specifier,context,nextResolve){if(specifier==='@vitest/coverage-v8')return {url:provider+'index.js',shortCircuit:true};if(specifier==='@vitest/coverage-v8/browser')return {url:provider+'browser.js',shortCircuit:true};return nextResolve(specifier,context);}});
