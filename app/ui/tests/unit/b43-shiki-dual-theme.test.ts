// @vitest-environment happy-dom
// B43: shiki 双主题——data-theme → 高亮侧映射 + 双主题 CSS 常量形状。
import { describe, expect, it } from "vitest";
import { SHIKI_DUAL_THEME_CSS, shikiSideForDataTheme } from "../../renderer-grok/frontend/src/recovered/features/conversation/workspace/shiki-theme";

describe("B43 shikiSideForDataTheme", () => {
  it("cursor-light → light", () => {
    expect(shikiSideForDataTheme("cursor-light")).toBe("light");
  });
  it("cursor-dark → dark", () => {
    expect(shikiSideForDataTheme("cursor-dark")).toBe("dark");
  });
  it("null/undefined/空串 → dark 回退（0.78.1 主视觉暗色）", () => {
    expect(shikiSideForDataTheme(null)).toBe("dark");
    expect(shikiSideForDataTheme(undefined)).toBe("dark");
    expect(shikiSideForDataTheme("")).toBe("dark");
  });
  it("未知值 → dark 回退", () => {
    expect(shikiSideForDataTheme("whatever")).toBe("dark");
  });
});

describe("B43 SHIKI_DUAL_THEME_CSS", () => {
  it("包含亮暗两侧的 pre 背景覆盖", () => {
    expect(SHIKI_DUAL_THEME_CSS).toContain("html[data-theme*='light'] .sand-code-highlighted pre");
    expect(SHIKI_DUAL_THEME_CSS).toContain("html[data-theme*='dark'] .sand-code-highlighted pre");
  });
  it("颜色变量按侧启用（--shiki-light / --shiki-dark）", () => {
    expect(SHIKI_DUAL_THEME_CSS).toContain("var(--shiki-light)");
    expect(SHIKI_DUAL_THEME_CSS).toContain("var(--shiki-dark)");
  });
});
