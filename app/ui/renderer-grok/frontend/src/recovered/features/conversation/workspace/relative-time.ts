// B40-B：侧栏相对时间——0.78.1 chunk-view Fn 同构（Intl.RelativeTimeFormat(numeric:auto) 七档阈值表）。
// 原实现 "{n}d" 无上限（5000 天直出）；本档 year 封顶。formatter 按 locale 缓存避免每行新建。
export const RELATIVE_TIME_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400],
  ["hour", 3_600], ["minute", 60], ["second", 1],
];

const formatters = new Map<string, Intl.RelativeTimeFormat>();

export function formatRelativeTime(updatedAt: number, now: number, locale = "en"): string {
  const rawSeconds = Math.floor((now - updatedAt) / 1000);
  if (rawSeconds > -60 && rawSeconds < 60) return "now"; // <1 分钟（含未来 1 分钟内）保留我方 "now" 惯例
  const formatter = formatterFor(locale);
  for (const [unit, threshold] of RELATIVE_TIME_UNITS) {
    if (Math.abs(rawSeconds) >= threshold) return formatter.format(-Math.trunc(rawSeconds / threshold), unit);
  }
  return formatter.format(-rawSeconds, "second");
}

function formatterFor(locale: string): Intl.RelativeTimeFormat {
  let formatter = formatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    formatters.set(locale, formatter);
  }
  return formatter;
}
