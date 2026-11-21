# B20: i18n 框架评估（结论批次——不做全量复刻）

日期：2026-11-18
性质：评估批次（REQ-1.1.0-PARITY §5 列「i18n 框架评估」——本批产出结论+最小接线，非翻译工程）

## 0.78.1 i18n 架构（产物实锤）

- **体系**：FormatJS（`$a` 翻译组件、message-id→text catalog）
- **语言集**：en 默认 + 36 lazy locale（hi zh-CN zh-TW pl es ko pt ja fr de ru tr ar it sv uk nl el af he vi id ur th bn cs hu nb da fi mr te sw ha ta pt-PT）
- **catalog 分域**：每语言 5 chunk（core/agents/chat/settings/shared）→ `uo()` 合并器（防重复 id，冲突即 invariant 报错）
- **切换机制**（Co）：setLanguagePreference → lazy 加载 catalog → `_i.loadAndActivate({locale, messages})` → `document.documentElement.lang/dir` 更新（RTL：ni(e)）
- **存储**：language preference 走 DesktopBridge GJn face（getLanguageState/setLanguagePreference）
- **picker 文案**：Follow System（Ea4oxV）/Search language（RNnopd）

## 我方现状

- **零 i18n 基础设施**：recovered 源英文硬编码（上游 reconstructed 本就无翻译层）、无 react-intl 依赖
- **B18 已做**：Language picker UI（4 项代表：system/en/zh/ja）+ shim localStorage 落盘 + bridge face（API 名对齐 0.78.1 GJn）

## 差距与决策

| 维度 | 0.78.1 | 我方 | 决策 |
|---|---|---|---|
| 语言集 | 37 | 4 代表 | 保持 4（中文用户主力场景 en/zh/ja + system；36 语言无翻译资产可复用——recovered 源是英文，做全量=自建 36 套翻译，非复刻） |
| catalog | 5 域 chunk lazy | 无 | **不做**——recovered 源即英文原文，message-id 抽取+37 catalog 是新翻译工程，超出 1:1 复刻范围（复刻=行为对齐，非本地化资产重建） |
| 切换行为 | loadAndActivate + html lang/dir | picker 落盘但无消费 | **最小接线**：html lang/dir 更新（含 RTL）+ Electron spellcheck locale 联动 |
| picker 项 | Follow System + 全语言表 + Search | Follow System + 4 项 | 保持 |

## 改动面（最小集）

1. **语言切换消费端**：shim language preference 变更 → `document.documentElement.lang` / `.dir` 更新（0.78.1 xo 行为；zh 系 → zh-CN、其余 → locale 原值、system → navigator.language）
2. **picker 与 system 语义**：value=system 时 lang 取 navigator.language（0.78.1 Follow System 行为）
3. **单测**：resolveDisplayLanguage('system') → navigator.language；('zh')→'zh-CN'；dir 派生（ar→rtl，仅文档化——我们不做 ar locale）
4. **e2e**：General→Language 切 zh → documentElement.lang 变 zh-CN；回 system → 跟随浏览器 locale

## 不做（记录在案）
- 36 locale catalog 重建（无资产可复用，属新翻译工程）
- recovered 源字符串 message-id 化（结构性改造，风险大收益小——英文用户不受影响）
- RTL 布局镜像（ar/he 不在支持集）
