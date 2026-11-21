// B20: i18n 最小接线——语言偏好 → 显示 locale/dir 派生（0.78.1 Co/xo/ni 行为）
// 键规范：picker 值 system|en|zh|ja（B18 LANGUAGE_OPTIONS），locale 键 0.78.1 形如 zh-CN/ja/en

/** picker 值/语言偏好 → 文档显示 locale。system → navigator 语言；zh 规范化为 zh-CN。 */
export function resolveDisplayLanguage(preference: string, navigatorLanguage: string): string {
  if (preference === "system" || preference === "") {
    const nav = navigatorLanguage.trim();
    if (nav.length === 0) return "en";
    return nav;
  }
  if (preference === "zh") return "zh-CN";
  if (preference === "en" || preference === "ja") return preference;
  return "en";
}

/** 0.78.1 ni(e)：RTL locale 集（我们支持集全 ltr，但派生规则文档化在此）。 */
export function resolveTextDirection(locale: string): "ltr" | "rtl" {
  const rtlPrefixes = ["ar", "he", "fa", "ur"];
  const lang = locale.split("-")[0]?.toLowerCase() ?? "";
  return rtlPrefixes.includes(lang) ? "rtl" : "ltr";
}

/** 0.78.1 xo(e,t)：document.documentElement.lang/dir 更新。DOM 不可用环境（单测 node）为 no-op。 */
export function applyDocumentLanguage(preference: string): void {
  if (typeof document === "undefined" || document.documentElement == null) return;
  const locale = resolveDisplayLanguage(preference, typeof navigator !== "undefined" ? navigator.language : "en");
  document.documentElement.lang = locale;
  document.documentElement.dir = resolveTextDirection(locale);
}
