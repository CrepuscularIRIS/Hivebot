// P5-55 · u1-diff app-vs-ref 行的处置规则（逐行判定，理由可审）。
// 未命中任何豁免规则的差异 = open（可行动），P5-55 验收要求 open = 0。
// 新增豁免必须在 REPORT-P5-55 说明并带证据；规则只按「视图 / 部位 / 属性 / 值形态」匹配，不按具体数值放水
// （例外：subpixel 规则是 |Δ| ≤ 1px 的数值容差，量的是字形取整，不是版式）。
const px = (v) => (/^-?[\d.]+px$/.test(v) ? parseFloat(v) : null)
const isElem = (r) => r.prop === '(element)'

export const WAIVERS = [
  {
    tag: 'waived:arch',
    reason: 'R10：0.78.1 会话流对 tool-call / thinking 零渲染（行只在 Full conversation outline 面板），0.18 直渲；按 outline 锚 sand-outline-item 的 0.78.1 值换皮，不改架构',
    match: (r) => r.part === 'transcript.thinking-row' || r.part === 'transcript.tool-row',
  },
  {
    tag: 'waived:arch',
    reason: '审批卡：0.18 = dock 单容器（inline style 的一块 div）；0.78.1 = transcript 内 send-message 卡，section 分段（标题条「Computer」+ 关闭钮 + target 代码块 + 按钮段，内边距在子段上）。外壳（r24 / elevated 底 / 阴影 / 宽）已对齐，分段结构与内容属 P5-31（L-AP 卡适配）',
    match: (r) => r.part === 'permission.card' && ['height', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap', 'margin-top'].includes(r.prop),
  },
  {
    tag: 'waived:arch',
    reason: '0.18 折叠 rail 不含搜索入口（sidebar.tsx 折叠分支只出 rail-new）；加入口要改模块结构，非换皮',
    match: (r) => r.view.startsWith('sidebar-collapsed') && r.part === 'sidebar.search-entry' && isElem(r),
  },
  {
    tag: 'waived:arch',
    reason: '折叠态 New / Connect apps：0.78.1 是 rail 底部独立的 28 ghost icon 钮（头部钮与药丸隐藏），0.18 复用头部 rail-new 与 footer 药丸元素；覆盖已把两者挪到 rail 底部同位置同形态（截图对齐），探针按选择器仍取到 0.18 的原元素',
    match: (r) => r.view.startsWith('sidebar-collapsed') && (r.part === 'sidebar.header-first-btn' || r.part === 'sidebar.footer-pill'),
  },
  {
    tag: 'waived:fixture',
    reason: '对照台 sidebar-collapsed 视图 ref 侧不 openAgent（views.mjs clickAgent:false，0.78.1 不点不出会话），ref 的会话部位是空态；app 侧开着会话',
    match: (r) => r.view.startsWith('sidebar-collapsed') && (r.part.startsWith('chat.') || r.part.startsWith('transcript.') || r.part.startsWith('permission.')),
  },
  {
    tag: 'waived:data',
    reason: 'app 列 conv-running 打开的是 Ops Bot 的挂起回合（主 bot 有待决审批时 fake LLM 不能再起一轮），ref 是主 bot 会话；会话内容部位按数据缺席',
    match: (r) => r.view.startsWith('conv-running') && isElem(r) && (r.part.startsWith('transcript.') || r.part.startsWith('permission.')),
  },
  {
    tag: 'waived:data',
    reason: '文本宽度随数据：app 侧边栏按最近活动排序首项是 Ops Bot（ref 首项 Main Bot）、conv-running 头部名字是 Ops Bot；字体字号字重一致（同行其余属性 0 差）',
    match: (r) => (r.part === 'sidebar.item-name' || (r.part === 'chat.header-name' && r.view.startsWith('conv-running'))) && r.prop === 'width',
  },
  {
    tag: 'waived:computed-equiv',
    reason: 'min-height:auto 在非 flex/grid 子项（或绝对定位）上计算值为 0px：两侧都是「无最小高约束」，版式等价',
    match: (r) => r.prop === 'min-height' && ['auto', '0px'].includes(r.ref) && ['auto', '0px'].includes(r.app),
  },
  {
    tag: 'waived:subpixel',
    reason: '|Δ| ≤ 1px：字形宽度 / 行盒取整（同字体同字号，排版引擎小数位差），非版式差',
    match: (r) => ['width', 'height'].includes(r.prop) && px(r.ref) !== null && px(r.app) !== null && Math.abs(px(r.ref) - px(r.app)) <= 1,
  },
]

export function dispose(row) {
  for (const w of WAIVERS) if (w.match(row)) return { disposition: w.tag, reason: w.reason }
  return { disposition: 'open', reason: '' }
}
