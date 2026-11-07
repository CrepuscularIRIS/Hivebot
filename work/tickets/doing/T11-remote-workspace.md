# T11：main 侧远端工作区（workspace.ensure RPC + mintWorkspace 分支 + Q-029 旧会话格 + P2 收口）

> 开单：main 照 DESIGN-ssh-composition D5/D6（r2+r3）转实体 | 日期：2026-11-06 | 施工：main (GLM 5.3)
> 来源：DESIGN §D5 §D6 验证节（⑤a-d + ⑥）；queue 5c 行（含经理核实时加的 P2 收口格）
> 分支 / 作业目录：feat/T11 @ /tmp/bot-wt/T11
> claimed：2026-11-06 19:3x
> accepted：（2026-11-07 终验不通过第 1 次 @ 1f659cfe → T11b；第 4 条拆 T11c）

## 目标
ssh 模式下 bot 工作区落在远端：SDK 新 RPC `p2sdk/workspace.ensure`（subprocess mkdir -p，词法校验 <remoteRoot>/workspaces/ + botId 形状）；main `mintWorkspace` 按模式分支（#3/#4/worker 共同入口）；远端会话 cwd 可用；Q-029=A 旧 bot 工具调用拒+提示；T7a skills API 在 ssh 模式拒。

## 施工面（D5 结论）
1. SDK `src/p2sdk/workspace.mjs`（或并入现有 RPC 面）：`p2sdk/workspace.ensure` —— `ctx.subprocess.spawn({argv:['mkdir','-p','--',path]})`（ssh 下远端执行，固定 argv 无 shell），执行前词法校验 path 在 `<remoteRoot>/workspaces/` 下且末段 botId 形状；返回远端 canonical 路径（**P2 收口**：guard 判定用 canonical——manager 核实口径，替代 guard 每调用重 resolve 的错误修法）。
2. app/ui `main/m3-meta/orchestrate.ts` `mintWorkspace`（:80-91、createWorkerBot :344）：ssh 模式（main 如何得知——SDK 握手/启动配置面，D5 写明「写明 main 如何得知 ssh 模式与 remoteRoot」）分支到远端路径；worker cwd 同源（P6-24 blocked 则 worker 自建工作区同经 mintWorkspace 已覆盖）。
3. Q-029 ⑥：header.cwd 不在远端 root 下的旧会话发 bash → 拒+固定提示串（先红=现状报 cwd 不存在类错）。
4. T7a skills API ssh 模式拒（复制路径在宿主——ssh 下禁用，提示切回本机）。
5. 测试 `app/ui/tests/e2e/ssh-workspace.spec.ts`（⑤a-d+⑥，产品+夹具 sshd，参照 ssh-bash/T10 的组合形态）；SDK 侧 RPC 单测（词法校验格）。

## 边界
1. 只动上列文件 + 回执。P6-24 仍 blocked——⑤c 的「继承发起者 cwd」格不做（工单注明）。
2. 先红：⑤a（现状宿主 mkdir）与 ⑥（现状 cwd 错误非提示串）两段原样。
3. ui e2e 隔离 HOME/TMPDIR + PLAYWRIGHT_BROWSERS_PATH；与 sdk e2e 错开。
4. 超出边界停下写回执（尤其 main 得知 ssh 模式的机制若与 D5 预案不符）。

## 验收
1. 先红两段原样。
2. ssh-workspace.spec.ts ⑤a-d+⑥ 全绿（格数照实）。
3. SDK RPC 单测：路径词法校验（越界/非 botId 形状/正常）三态。
4. 回归：skills-enable/w1ap0-matrix 相关不破（宿主路径行为零变化——mintWorkspace 本机分支逐字不变）；ssh-product 5、ssh-bash 5。
5. 改动面 + 回执。

## 为什么这样验收
⑤a 的先红是「远端电脑」语义的落地证明（工作区不在宿主=bot 的电脑真的是远端那台）；⑥ 是 Q-029=A 的用户决策兑现（整机切换，旧 bot 拒+提示）；P2 收口让 guard 的远端判定从「每调用重 resolve 的错误修法」换成「建 ws 时存 canonical」。
