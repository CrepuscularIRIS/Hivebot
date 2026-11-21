// B43：shiki 代码块双主题（github-dark / github-light 跟随 data-theme 切换）。
// 0.78.1 对齐：Theme picker 三态（Follow System/Light/Dark）下代码块底色随全局主题，
// 不出现 Light 页面挂暗色代码块的割裂。
// 纯函数：data-theme 字符串 → shiki CSS 变量启用侧。渲染层据此切换 --shiki-light/--shiki-dark。

export type ShikiThemeSide = "light" | "dark";

/** html[data-theme] 值（cursor-light/cursor-dark，见 B38a t56）→ shiki 侧。未知值回退 dark（0.78.1 主视觉暗色）。 */
export function shikiSideForDataTheme(dataTheme: string | null | undefined): ShikiThemeSide {
  if (typeof dataTheme !== "string") return "dark";
  return dataTheme.includes("light") ? "light" : "dark";
}

/** 双主题 CSS：shiki 双主题输出携带 --shiki-dark/--shiki-light 变量组；按侧启用其一。 */
export const SHIKI_DUAL_THEME_CSS = [
  // 暗色页：dark 为默认色，light 变量备用
  `html[data-theme*='dark'] .sand-code-highlighted pre,`,
  `html[data-theme*='dark'] .sand-code-highlighted pre span {`,
  `  color: var(--shiki-dark) !important;`,
  `  background-color: transparent;`,
  `}`,
  // 亮色页：light 为默认色
  `html[data-theme*='light'] .sand-code-highlighted pre,`,
  `html[data-theme*='light'] .sand-code-highlighted pre span {`,
  `  color: var(--shiki-light) !important;`,
  `  background-color: transparent;`,
  `}`,
  // 容器底色随侧（pre 背景由 shiki 内联 style 带，需覆盖）
  `html[data-theme*='light'] .sand-code-highlighted pre { background-color: #f6f8fa !important; }`,
  `html[data-theme*='dark'] .sand-code-highlighted pre { background-color: #24292e !important; }`,
].join("\n");
