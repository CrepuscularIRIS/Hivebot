# C3 · Markdown 渲染与代码高亮反向确认

调研日期为 2026-11-02；本次只做依赖决策，不改产品代码、不安装依赖、不改 `repos/`。结论是选型建议，不代表已在 Electron 中完成接入验收。

## 1. 候选盘点

### 本地复用先行

- `repos/MANIFEST.tsv:4` 已登记 `deepseek-ai/deepseek-harness@ce7073d512`，最近维护为 2026-10-30；U-21 的 `app/ui/package.json:45` 已链接 `@deepseek-ai/dsh-client-ui-primitives`，所以高亮不必另造一套。该包的 `src/code-highlighting.ts:15-22` 提供不依赖 Cordis boot 的 `useCodeHighlighter(language)`，其实现只使用 React 和高亮模块；`src/index.ts:93` 有公开导出，`package.json:21` 也允许源码子路径导入。
- 这套现有高亮实际使用 `shiki/core`、JavaScript 正则引擎及按需语言，初始只有 TypeScript、Shell、JSON；它不需要 Oniguruma WASM，未知或未加载语言返回纯文本回退，`highlightLines` 返回文本 token 与颜色而非必须注入 HTML。证据为 `repos/deepseek-harness/packages/client/ui-primitives/src/markdown/highlight.ts:21-26,81-94,631-647`。
- 同包也导出完整 `MarkdownText`，但其模块无条件导入 KaTeX CSS，且包含数学、文件引用、脚注与增量缓存等功能；本任务暂不把整个 dsh Markdown 呈现层作为默认接入，避免同时承接其样式和标签接口，优先复用高亮这一较小出口。这是适配成本判断，不是认定它不能运行。证据为同包 `src/markdown/MarkdownText.tsx:14-27,30-59,62-83`；完整组件的宿主接入成本尚未实测。

### npm 发布与 GitHub 维护

以下 release 指 npm 最新正式发布，日期和版本来自 registry 的 `dist-tags.latest` 与 `time[version]`，并用 `npm view <pkg> version time.modified repository` 交叉查询；不是把仓库星标或 npm 修改时间当作发布日。周下载为 npm Downloads API 的 **2026-10-26 至 2026-11-01** 实测窗口，只表示采用规模，不证明安全。

| npm 包 / GitHub 仓库 | 最新 npm release | 最近 GitHub commit | 周下载量级 | 许可证 |
|---|---|---|---|---|
| `react-markdown` / [remarkjs/react-markdown](https://github.com/remarkjs/react-markdown) | 10.1.0，2025-03-07 | [f9ca66e，2026-10-03](https://github.com/remarkjs/react-markdown/commit/f9ca66ec73d218127bff56b41a583bba1fb96125) | 53,088,838，约 5300 万 | [MIT](https://github.com/remarkjs/react-markdown/blob/f9ca66ec73d218127bff56b41a583bba1fb96125/license) |
| `rehype-highlight` / [rehypejs/rehype-highlight](https://github.com/rehypejs/rehype-highlight) | 7.0.2，2025-02-03 | [76af420，2025-02-21](https://github.com/rehypejs/rehype-highlight/commit/76af420fc0cd8e10a40aca5f2994c25c67871931) | 3,728,836，约 370 万 | [MIT](https://github.com/rehypejs/rehype-highlight/blob/76af420fc0cd8e10a40aca5f2994c25c67871931/license) |
| `shiki` / [shikijs/shiki](https://github.com/shikijs/shiki) | 4.6.0，2026-11-02 | [de15fd2，2026-11-02](https://github.com/shikijs/shiki/commit/de15fd2efb709ea4528d894ab857ac145f3dc277) | 36,118,163，约 3600 万 | [MIT](https://github.com/shikijs/shiki/blob/de15fd2efb709ea4528d894ab857ac145f3dc277/LICENSE) |
| `marked` / [markedjs/marked](https://github.com/markedjs/marked) | 18.1.3，2026-11-02 | [ba50aa9，2026-11-02](https://github.com/markedjs/marked/commit/ba50aa95636ac8f97f46446bbfeb04592ed22216) | 121,056,817，约 1.21 亿 | [MIT，附历史 Markdown 许可](https://github.com/markedjs/marked/blob/ba50aa95636ac8f97f46446bbfeb04592ed22216/LICENSE) |
| `highlight.js` / [highlightjs/highlight.js](https://github.com/highlightjs/highlight.js) | 11.12.0，2026-08-12 | [60e0920，2026-11-01](https://github.com/highlightjs/highlight.js/commit/60e092057673595fa542db0bc2b13a99df5d0551) | 50,571,312，约 5100 万 | [BSD-3-Clause](https://github.com/highlightjs/highlight.js/blob/60e092057673595fa542db0bc2b13a99df5d0551/LICENSE) |
| `streamdown` / [vercel/streamdown](https://github.com/vercel/streamdown) | 2.7.1，2026-10-19 | [1f96b30，2026-11-02](https://github.com/vercel/streamdown/commit/1f96b3031842931baadb6da3beb290731bf62e87) | 10,481,774，约 1000 万 | [Apache-2.0](https://github.com/vercel/streamdown/blob/1f96b3031842931baadb6da3beb290731bf62e87/LICENSE) |
| `markdown-to-jsx` / [probablyup/markdown-to-jsx](https://github.com/probablyup/markdown-to-jsx) | 9.10.4，2026-10-28 | [ea7e823，2026-11-01](https://github.com/probablyup/markdown-to-jsx/commit/ea7e8238924186a81a3298f985bf0ab105aa1e6a) | 6,209,166，约 620 万 | [MIT](https://github.com/probablyup/markdown-to-jsx/blob/ea7e8238924186a81a3298f985bf0ab105aa1e6a/lib/LICENSE) |

上表每个包的原始数据均可从 `https://registry.npmjs.org/<包名>` 与 `https://api.npmjs.org/downloads/point/2026-10-26:2026-11-01/<包名>` 复查，例如 [react-markdown 发布记录](https://registry.npmjs.org/react-markdown) 与 [该周下载](https://api.npmjs.org/downloads/point/2026-10-26:2026-11-01/react-markdown)。GitHub commit 是通过 MCP `list_commits` 获取，而源码和许可证通过 `get_file_contents` 阅读。

**不能把 rehype-highlight 标为“在维护的首选依赖”：其 commit 与 release 均超出本项目六个月门槛。** react-markdown 虽然 release 较旧，仍有六个月内的维护提交，且维护成员 wooorm 在 [PR #946 的 2026-10-03 回复](https://github.com/remarkjs/react-markdown/pull/946#issuecomment-5970424154)确认接收贡献；Shiki 最新 commit 合并社区性能修复 #1328，Marked 最新 release 列出多个 issue 对应修复。其他备选满足近期提交条件，但本次未逐仓审计 issue 回复速度，不能以此保证长期维护 SLA。

### 浏览器 bundle 体积

Bundlephobia 与 deno.bundlejs.com 的查询均返回 HTTP 403，因此没有使用记忆中的“几 KB”数字。下表改为**本次实测固定版本 esm.sh 浏览器 bundle 入口**：请求 `https://esm.sh/<包与子路径>?bundle&external=react,react-dom&target=es2022`，跟随响应 `X-ESM-Path` 下载 JS，以字节长度和 Python `gzip.compress(body, mtime=0)` 计量。React 为外部依赖；这些是入口产物，不是本应用 tree-shaking 后的增量，也不包含额外语言、主题、CSS、外部模块或后续动态 chunk；不得把各行简单相加当作最终安装成本。

| 固定版本入口 | JS 字节 | gzip 字节 | 解释 |
|---|---:|---:|---|
| [react-markdown@10.1.0](https://esm.sh/react-markdown@10.1.0?bundle&external=react,react-dom&target=es2022) | 117,555 | 36,157 | 约 35.3 KiB gzip，含该入口打入的解析链。 |
| [rehype-highlight@7.0.2](https://esm.sh/rehype-highlight@7.0.2?bundle&external=react,react-dom&target=es2022) | 179,143 | 54,826 | 约 53.5 KiB gzip；默认 common 语言组不是一个零成本插件。 |
| [shiki@4.6.0/core](https://esm.sh/shiki@4.6.0/core?bundle&external=react,react-dom&target=es2022) | 136,474 | 43,488 | 约 42.5 KiB gzip，不含语言和引擎。 |
| [shiki@4.6.0/engine/javascript](https://esm.sh/shiki@4.6.0/engine/javascript?bundle&external=react,react-dom&target=es2022) | 58,947 | 20,697 | 约 20.2 KiB gzip；采用现有 dsh 高亮时应看共享 chunk，不能再算一份。 |
| [marked@18.1.3](https://esm.sh/marked@18.1.3?bundle&external=react,react-dom&target=es2022) | 49,364 | 14,799 | 约 14.5 KiB gzip，但没有 sanitizer 和高亮。 |
| [highlight.js@11.12.0/lib/core](https://esm.sh/highlight.js@11.12.0/lib/core?bundle&external=react,react-dom&target=es2022) | 21,429 | 8,637 | 约 8.4 KiB gzip，不含语言与主题。 |
| [streamdown@2.7.1](https://esm.sh/streamdown@2.7.1?bundle&external=react,react-dom&target=es2022) | 538,333 | 162,393 | 约 158.6 KiB gzip；代码高亮插件仍须另计。 |
| [markdown-to-jsx@9.10.4/react](https://esm.sh/markdown-to-jsx@9.10.4/react?bundle&external=react,react-dom&target=es2022) | 78,676 | 28,434 | 约 27.8 KiB gzip，不含高亮。 |

Shiki 的 `bundle-web` 源码明确提示它会打包所有该 bundle 的语言与主题，并动态加载 WASM，所以不要用 `import ... from 'shiki'` 的方便入口代替已有细粒度配置。证据为 [packages/shiki/src/bundle-web.ts@de15fd2](https://github.com/shikijs/shiki/blob/de15fd2efb709ea4528d894ab857ac145f3dc277/packages/shiki/src/bundle-web.ts)。最终 Electron renderer 的 gzip、语言 chunk 与是否去重，仍须接入后实测，当前未验证。

### 安全面与适配决策

| 能力 / 候选 | 阶梯级别 | 决策 | 理由与必要适配 |
|---|---|---|---|
| Markdown：`react-markdown@10.1.0`；高亮：已有 dsh `useCodeHighlighter`（Shiki） | 1 / 2 | **集成** | 推荐。Markdown 直接生成 React 元素；高亮复用已有依赖的 token API，无需拥有解析器或添加第二套高亮。设置 `skipHtml`、不注册 `rehype-raw`，并覆写链接和图片组件；小包装层是策略接线，不是自写 Markdown。源码证据见下文。 |
| `react-markdown + rehype-highlight@7.0.2` | 3（高亮插件只符合复制改造档） | **改造** | 可用，但不选。插件超出六个月维护门槛，而且本地已存在活跃 Shiki 路径；若日后确需搬用，来源为 `https://github.com/rehypejs/rehype-highlight@76af420fc0cd8e10a40aca5f2994c25c67871931:lib/index.js`。当前不复制。 |
| `marked@18.1.3 + highlight.js@11.12.0` | 1 | **集成** | 可集成的轻量备选，但本次不选。HTML 字符串输出要求额外 sanitizer、raw HTML renderer 覆写、链接点击代理和 HTML 注入接线，复用 React AST 路径更省安全维护工作。 |
| `markdown-to-jsx@9.10.4/react + 高亮组件` | 1 | **集成** | 可集成的较小备选，并非劣质库；要求显式 `disableParsingRawHTML: true`，保留默认 URL sanitizer，覆写 `a`、`img`、`code`。比 react-markdown 入口约少 7.5 KiB gzip，但尚不足以为了这点差额换用另一套解析与覆写约定。 |
| `streamdown@2.7.1` | 1 | **集成** | 若需要未闭合 Markdown 修复与分块流式呈现，可直接集成；当前纯文本流只需最小 Markdown 接入，额外 raw/sanitize/harden 插件链和较大入口没有必要，故不选。 |

1. **raw HTML 必须默认关闭，而不是“sanitize 过就允许”。** react-markdown 的 `post()` 将 raw 节点转为文本，`skipHtml: true` 则直接删除；因此不要误读其内部 `allowDangerousHtml: true` 为“会执行 HTML”，这个选项是在 AST 中保留原始节点。严禁加 `rehype-raw`，也不使用 `dangerouslySetInnerHTML` 渲染模型内容。证据为 [lib/index.js@f9ca66e 的 createProcessor/post/defaultUrlTransform](https://github.com/remarkjs/react-markdown/blob/f9ca66ec73d218127bff56b41a583bba1fb96125/lib/index.js)。
2. **sanitizer 的要求取决于插件链，不是见到 rehype 就机械加包。** 无 raw HTML、无修改树的插件且使用 React 文本 token 的推荐路径，不要求再加 sanitizer；一旦引入会生成任意元素、属性或 HTML 的不可信插件，必须在最后一个不安全变换后做 schema 白名单 sanitize，且不能随后再运行不安全变换。若 sanitize 高亮后的树，还需只放行已知高亮 class，不能为保留颜色开放任意属性。react-markdown 官方明确警告 `urlTransform`、插件、components 可能破坏默认安全，并建议用 `rehype-sanitize` 约束最终内容，见 [Security](https://github.com/remarkjs/react-markdown#security)。sanitizer 也不能替代本项目的外链、图片和 IPC 策略。
3. `rehype-highlight` 实际读取 `pre > code` 的文本，再用 lowlight 产生 HAST；它默认 `detect: false`、默认加载 common 语言，未知语言保留回退，不是 HTML sanitizer。证据为 [lib/index.js@76af420](https://github.com/rehypejs/rehype-highlight/blob/76af420fc0cd8e10a40aca5f2994c25c67871931/lib/index.js)。
4. Marked 的 `_Renderer.html()` 原样返回输入，`code()` 才做代码转义，所以不能把“代码块已 escape”推导成“全文安全”；若选择手挂方案，必须禁用其 HTML renderer，并在任何 innerHTML 入口前完成 HTML sanitize，保留本项目的链接与图片拦截。证据为 [src/Renderer.ts@ba50aa9](https://github.com/markedjs/marked/blob/ba50aa95636ac8f97f46446bbfeb04592ed22216/src/Renderer.ts)。
5. markdown-to-jsx 的 React emitter 对链接、图片调用 URL sanitizer，代码块走 React 元素；应使用 `markdown-to-jsx/react`，因为根入口的 React exports 已标 deprecated。HTML 解析默认开启，仍必须显式关闭，不因库自带 HTML 清理而放宽本项目策略。证据为 [lib/src/react.tsx](https://github.com/probablyup/markdown-to-jsx/blob/ea7e8238924186a81a3298f985bf0ab105aa1e6a/lib/src/react.tsx)、[lib/src/index.tsx](https://github.com/probablyup/markdown-to-jsx/blob/ea7e8238924186a81a3298f985bf0ab105aa1e6a/lib/src/index.tsx) 与 [options 表](https://github.com/probablyup/markdown-to-jsx#options)。
6. Streamdown 源码支持 raw 插件分支，其底层默认 URL transform 是恒等函数；其安全性需要连同顶层的 sanitize/harden 配置审，而不能只孤立使用该底层实现。package.json 已显示 raw/sanitize/harden 依赖，因而本次不声称它“不安全”，只判定其安全接线比推荐方案多。证据为 [lib/markdown.ts](https://github.com/vercel/streamdown/blob/1f96b3031842931baadb6da3beb290731bf62e87/packages/streamdown/lib/markdown.ts) 与 [package.json](https://github.com/vercel/streamdown/blob/1f96b3031842931baadb6da3beb290731bf62e87/packages/streamdown/package.json)。

## 2. 反向确认：几百行自写是否更好

| 维度 | 几百行自写 Markdown 渲染 | 用库的实际取舍 |
|---|---|---|
| 维护性 | 做“标题、粗体、围栏”的明确子集确实可短，但不是同等 CommonMark：嵌套列表、转义、反引号长度、引用链接与未闭合流式输入都成为本方长期测试与修复责任。 | 上游仍在修这些边界，不能认为成熟解析器已无维护价值；例如 Marked 18.1.3 本次发布就修复未闭合 emphasis 二次扫描、围栏关闭字符与链接转义，markdown-to-jsx 的最新提交也修复流结束后保留 opener 的呈现说明，见各自上表 commit。 |
| 安全 | 自写且只输出 React 文本、完全不解析链接或 HTML，可以很安全；所以“用库一定更安全”不成立。但一旦做真正 Markdown 的 URL、图片和属性处理，就需要自己维护全部策略和编码边界。 | react-markdown 已有 URL 协议处理与安全默认，仍需我们的 U-00 链接门控、禁图、禁 raw 与短策略测试；Shiki 只提供 tokens，避免新增 HTML 字符串注入面。依据是上述已读源码，而非下载量。 |
| 体积 | 在相同打包方式下，受限子集有望明显小于 35.3 KiB gzip 的 react-markdown，但没有实现就不能捏造“几百行 = 几 KB”的测量，更不能把不支持高亮的子集拿来与完整栈比较。 | 库并不在体积上全胜：Marked 与 markdown-to-jsx 更小，Shiki 还要语言与引擎；但本地已经有 Shiki 高亮依赖，优先共享，最终增量需由构建证据确定。当前没有体积硬预算迫使我们承担一个新解析器。 |

**结论一行：集成 `react-markdown@10.1.0`，代码高亮复用已有 dsh 的 Shiki `useCodeHighlighter`，不自写 Markdown 解析器；理由是它保留安全的 React 元素路径并把语法维护交给活跃上游，虽然不保证 bundle 最小，但比本项目新养几百行解析器及第二套高亮更稳、更少工作。**

这里不宣称“GitHub 所有库都比自写好”：rehype-highlight 已不符合维护门槛，streamdown 对本次需求偏重；只有当用户明确把产品降为受限语法子集并提出经实测无法满足的体积硬预算时，才有重新讨论自写的依据。目前第 1/2 级已有可用候选，不需要走第 5 级；也不需要逆向。

## 3. 与 U-21 的最小接入路径

在 U-21 `app/ui/renderer/plugins/session/Conversation.tsx:149,153` 把 assistant 完整文本和 streaming 累积文本各替换为同一个 `react-markdown` 小包装组件，设置 `skipHtml`、不加 raw 插件、`a` 点击只走 U-00 的门控外链接口、`img` 输出 alt 文本而不挂载图片，并以已有 `useCodeHighlighter` 的 tokens 渲染代码；不动 store/IPC/user 气泡，未知语言回退纯文本即可（现状证据取自 `/tmp/bot-wt/U-21` 的 `e55ad0d`，对应 `Conversation.tsx:147-153`）。

接入前仍须在目标 Electron renderer 验证真实 boot、一次逐块回复、未知语言回退、恶意 HTML/URL 无执行、图片零请求与门控外链；本次没有跑这些产品验收，不能用 npm/CDN 调研冒充完成。该限制也遵守 `work/LEARNINGS.md:41` 的集成 spike 规则。
