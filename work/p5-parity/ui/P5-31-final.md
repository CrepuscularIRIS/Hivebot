# P5-31 定稿（v3 改范围，frontend-dev，无 ux-proposer 提案：v3 派发直接定范围）

| 分歧点 | 定稿 | 理由 |
|---|---|---|
| ① Always allow 怎么藏 | 模块覆盖 `permissions/local-tool/view.tsx` → `overrides/modules/local-tool-view.tsx`，卡里不渲染该钮（DOM 数 0） | 上游 Prompt 无条件渲染四钮、没有可剥的 prop；CSS display:none 仍留 DOM（违背 A9④「DOM 中该按钮数 === 0」）。作答仍走上游 `resolveLocalToolPermissionAction` |
| Never 钮 | 一并不渲染（自定，派发未点名） | L-AP 卡片三态 = 允许一次 / 拒绝 /（仅连接器）始终允许；NEVER 是 sdk 代码常量。shim 里没有任何东西执行 renderer 的 `never`，coordinator 把它映射成 rejected，点了只等于拒绝一次，还在设置里留下一个假的「Never allow」 |
| 卡片文案 | 标题「Allow Grok Bot to run this on your computer?」+ 说明「Only this time. Grok Bot will ask again next time.」 | 上游是全局开关口吻（all agents / can be changed in Settings），与「仅一次、下次仍问」（A5）相反 |
| 主按钮 | Allow once 用原 Always 的绿色主样式 | 去掉 Always 后两钮同灰，没有主操作；卡壳其余数值不动（r24 等归 P5-55） |
| ② 设置 Execution 下拉 + 团队文案 | 隐藏整卡（settings-panels 覆盖多剥一个 prop） | 不做只读展示：renderer 读不到真实档位（bash 在 policy-state 有效时是 ALWAYS），写死「Ask every time」会说错 |
| ③ 完整命令 | shim `askText`：bash / 文件取同 callId 工具行实参全文（不截断）；request_network 一律显示 reason 全文（含命令 + 范围 + 期限）；卡上 `<pre data-pbots="ask-command">`，可选中、超 160px 滚动 | bash 的 approval reason 是通用策略句，不含命令；request_network 的实参 command 不带范围和期限，reason 两者都有 |
| shim `localToolPermission` | get/set 恒 `ask`（删 never 内存态） | 卡和设置都不再发 always/never；拒存只做兜底 |
