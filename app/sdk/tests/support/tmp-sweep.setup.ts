// P5-H1 vitest 安装点：每个测试文件结束时清扫该文件登记的临时目录。
// vitest 5 worker 不执行 process 'exit' 钩子（实测），必须走 vitest 原生 afterAll。
import { afterAll } from 'vitest'
import { sweepTmpDirs } from './tmp-sweep.ts'

afterAll(() => sweepTmpDirs())
