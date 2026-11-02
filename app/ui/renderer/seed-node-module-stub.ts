// seed 闭包测量的 node:module 桩（apps/web/src/node-module-stub.ts 的最小版：
// 浏览器 boot 用 loader.internal 填充前，文件系统解析器不可达）。
export const createRequire = (): never => {
  throw new Error('node:module is not available in the renderer')
}
export const register = (): never => {
  throw new Error('node:module is not available in the renderer')
}
export default { createRequire, register }
