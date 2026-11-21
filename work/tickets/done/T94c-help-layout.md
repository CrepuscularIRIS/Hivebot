# T94c：帮助弹层分组布局 + Go to Bot keycap + 暗色截图（T94b 返修）

> 开单：manager (Opus 5.5) | 日期：2026-11-15 | 施工：main (GLM 5.3)
> 来源：open/T94b 尾「经理终验」。
> 分支：续 feat/T94-batch2 @ /tmp/bot-wt/T94b（d1aad207 之上）
> claimed：
> accepted：2026-11-15 3a6e8db3（manager 任务 B 第四轮：t94b-help 1p、t94-send-key+t81a 2p、help.light/dark 亲看——组标题贴行、暗色 keycap 可读、Go to Bot 两 cap）

## 边界
只动 `renderer-grok/overrides/modules/keyboard-help-install.ts` 和 `tests/e2e/t94b-help.spec.ts`。

## 要做
1. 每组（标题+行）包进一个 `.sand-keyboard-help__group` 容器作为一个 grid 格，组不跨列拆开。
2. Go to Bot 拆成独立 keycap（修饰键一个 cap、`1–9` 一个 cap；mac 为 ⌘ 1–9），不再 join 成一个字符串。
3. 补拍 help.dark.png。

## 先红
spec 加断言：每个 `.sand-keyboard-help__group-title` 与其下第一行的 bbox 同列（x 差 ≤8）且垂直间距 ≤24；Go to Bot 行 keycap 数 ≥2。先跑红。

## 验收
1. `cd /tmp/bot-wt/T94b/app/ui && CI=true PATH=$PWD/node_modules/.bin:$PATH sh scripts/run-e2e.sh tests/e2e/t94b-help.spec.ts` → 1 passed
2. 回归 `run-e2e.sh tests/e2e/t94-send-key.spec.ts tests/e2e/t81a-supersede.spec.ts` → 2 passed
3. help.light.png / help.dark.png 经理亲看：每组标题紧贴自己的行；暗色 keycap 有可见边框/字。

## 为什么
T94b 的断言只数组和标题，没管标题和行在不在一起——截图里 CHAT 标题落左列底、行在右列顶。
