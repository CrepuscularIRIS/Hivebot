# T8：P5-H5b e2e 散点 mkdtemp → tmkdir

> claimed：11:36 main (GLM 5.3)
> 来源：queue 第 8 行；T1 同族（e2e 侧）
> 分支：feat/T8 @ /tmp/bot-wt/T8（已移除，代码在分支上）

## 验收
1. 22 文件 ~74 处 mkdtempSync(join(tmpdir(),'X-')) → tmkdir('X-')；6 处保留（非 tmpdir 模式）
2. 抽验 mock-demo 9 绿残留 0、config+preset-broken 3 绿
3. 全量 e2e 147 passed / 2 failed（3 个失败文件=guard-fs+w1ap0-matrix 超时族，P5-H8 已知）
4. 静态门：grep 裸 mkdtemp 残留=6 处（全部为工单预期保留的非 tmpdir 模式）
