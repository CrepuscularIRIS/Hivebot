# T88 step 0 闸门：通过（2026-11-13）

- bundle：index.eager-common-DbK3Oi_r.js (382,800B) + chunk-rolldown-runtime-BCiCTKAo.js (1,301B) 原样拷贝，ES module 直 import 无缺符号
- `T = p_`（引擎工厂）构造 props：`{id, body, appearance, state, size, fill, isPlaying}` → 返回 `{attach, blink, gaze, look, poke, restart, setBody, setExpression, setPlaying, setState, update}`（API 实测齐全）
- `E(shape)`：shape 名映射（blob→sphere/flower→starFlower/heart→heartChubby/star→star6，default 直传）
- `D(inkPaint[, spotPaint])`：appearance
- **attach 形态：`attach({ host, canvas })`**（host=容器 Element；canvas 可选——引擎默认在 host 里建 `<svg>` 直绘；canvas 路径需额外条件〔resolution/proof〕，SVG 直绘已完整可用）
- 判据实测：`state:'thinking'` → 400ms 两次 `svg.outerHTML` **DIFFERS（动画在跑）**；canvas 像素路径空白（不影响——用 SVG 帧差断言替代 canvas 像素差，更稳）
- 复现：`python3 -m http.server 8137 --directory 本目录 && node probe.mjs`（probe 里 playwright 用 app/ui 的安装路径）
- **结论：go**——整件集成成立，React 包装按 dT 复写，断言用 SVG 帧差+reduced-motion 降级（d_() 读 prefers-reduced-motion 即 isStatic）
