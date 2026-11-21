// P5-53 对照台 · 视图与样式采集部位定义（BRIEF §12.7 第 4、6 条）。
// 两侧同源命名（sand-*）的部位共用选择器；结构不同的部位各写定位式，
// 定位式返回 null 时该部位记「单侧缺失」，本身就是 U1′ 差异表的行。

export const THEMES = ['light', 'dark'];

// 视图 = fixture 变体 + 打开动作（§12.7 第 6 条的子集；市场/设置按初版覆盖度记录）
export const VIEWS = [
  { id: 'conv-rest', variant: {}, clickAgent: true },        // 会话静息 + 待决审批卡（boot 主 bot）
  { id: 'conv-running', variant: { running: true }, clickAgent: true }, // 会话运行中（头像状态动起来）
  { id: 'sidebar-collapsed', variant: { sidebarCollapsed: true }, clickAgent: false }, // 侧栏折叠
  { id: 'info-pane', variant: { infoPaneOpen: true }, clickAgent: true }, // 设置 / info pane
];

// computed-style 采集部位：part → 每侧一个定位表达式（返回 element 或 null）
// 共用选择器直接写一个字符串；分侧写 { ref, ours }。
export const PARTS = [
  { part: 'sidebar.root', sel: { ref: "document.querySelector('.sand-agents-sidebar')", ours: "document.querySelector('.sand-agents-sidebar')" } },
  { part: 'sidebar.header', sel: { ref: "document.querySelector('.sand-agents-sidebar__header')", ours: "document.querySelector('.sand-agents-sidebar__header')" } },
  { part: 'sidebar.header-first-btn', sel: { ref: "document.querySelector('.sand-agents-sidebar__header')?.querySelector('button')", ours: "document.querySelector('.sand-agents-sidebar__header')?.querySelector('button')" } },
  { part: 'sidebar.search-entry', sel: { ref: "[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Search') || null", ours: "document.querySelector('.sand-agents-sidebar__search')" } },
  { part: 'sidebar.item', sel: { ref: "[...document.querySelectorAll('.sand-agent-item')].find(e => (e.getAttribute('aria-label')||'').includes('Research Bot')) || null", ours: "[...document.querySelectorAll('.sand-agent-item')].find(e => (e.getAttribute('aria-label')||'').includes('Research Bot')) || null" } },
  { part: 'sidebar.item-name', sel: { ref: "document.querySelector('.sand-agent-item__name')", ours: "document.querySelector('.sand-agent-item__name')" } },
  { part: 'sidebar.item-time', sel: { ref: "document.querySelector('.sand-agent-item__time')", ours: "document.querySelector('.sand-agent-item__time')" } },
  { part: 'sidebar.footer-pill', sel: { ref: "[...document.querySelectorAll('button,[role=button]')].find(e => (e.textContent||'').includes('Connect apps')) || null", ours: "document.querySelector('.sand-agents-sidebar__plugins')" } }, // P5-57：文案改 Connect apps，按类取（上游桩构建与 app 同元素）
  { part: 'chat.header', sel: { ref: "document.querySelector('.sand-chat-header')", ours: "document.querySelector('.sand-chat-header')" } },
  // P5-55：以下 4 个部位改为两侧同构锚（原 ref 选择器落在行容器 / 按钮行 / 头像 span 上，与 ours 不是同一构件，差异不可行动）
  { part: 'chat.header-name', sel: { ref: "document.querySelector('.sand-chat-header__name')", ours: "document.querySelector('.sand-chat-header #sand-conversation-heading') ?? document.querySelector('.sand-chat-header__name')" } },
  { part: 'transcript.user-message', sel: { ref: "[...document.querySelectorAll('.sand-message')].find(m => m.textContent.includes('quarterly numbers')) || null", ours: "[...document.querySelectorAll('.sand-message')].find(m => m.textContent.includes('quarterly numbers')) || null" } },
  { part: 'transcript.assistant-message', sel: { ref: "[...document.querySelectorAll('.sand-message')].find(m => m.textContent.includes('Revenue is up')) || null", ours: "[...document.querySelectorAll('.sand-message')].find(m => m.textContent.includes('Revenue is up')) || null" } },
  { part: 'transcript.thinking-row', sel: { ref: "null", ours: "document.querySelector('[data-kind=thinking]') || null" } },
  { part: 'transcript.tool-row', sel: { ref: "[...document.querySelectorAll('.sand-virtual-transcript__row')].find(r => r.textContent.includes('analyze.py')) || null", ours: "document.querySelector('[data-kind=tool-call]') || null" } },
  { part: 'permission.card', sel: { ref: "document.querySelector('section[aria-label=\"Local tool permission\"]')", ours: "document.querySelector('[aria-label=\"Local tool permission\"]')" } },
  { part: 'permission.card-primary-btn', sel: { ref: "[...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Allow once') || null", ours: "[...document.querySelectorAll('[aria-label=\"Local tool permission\"] button')].find(b => (b.textContent||'').trim() === 'Allow once') || null" } },
  { part: 'composer', sel: { ref: "document.querySelector('.sand-prompt-shell')", ours: "document.querySelector('.sand-prompt-shell')" } },
];

// 每个部位采集的 computed 属性集（数值/颜色/字体的核心面，R2 具名数值全覆盖的初版集）
export const STYLE_PROPS = [
  'width', 'height', 'min-height', 'max-height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-bottom',
  'border-top-width', 'border-bottom-width', 'border-left-width', 'border-right-width',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'background-color', 'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'gap', 'box-shadow', 'opacity',
  'transition-property', 'transition-duration', 'transition-timing-function',
];
