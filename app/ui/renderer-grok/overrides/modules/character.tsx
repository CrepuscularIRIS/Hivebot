// 来源: grok-bot-0.18-reconstructed@a9f633e:frontend/src/recovered/features/onboarding/signed-in/character.tsx
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, type CSSProperties } from "react";
import type { OnboardingCharacterVisualProps } from "./view";
import type { OnboardingCharacterState } from "./scene";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523
// Shipped engine geometry is the inline 259px mark, not an image asset.
// T24 覆盖：整模块复制上游 character.tsx（OnboardingCharacter 内部直调本文件的
// personaShapePath，re-export 包一层替换不到），在副本上补 0.79.3 picker 的 7 个形状。
// 来源: grok-bot 0.18 reconstructed（本仓 frontend）+ grok-bot 0.79.3 renderer
// index.eager-common-B73tST-1.js@279662-299284（Hs 表 ws/Ts/ks 构造器、Es/Os/Ds path
// 字面量、Lc flower 生成器）。有意偏差：0.79.3 形状按钮用 hT 3D 引擎逐帧采样（点击后
// path 会变——T20b shapesSameOrder=false 的原因），我们保留静态 SVG 吉祥物，不移植 3D。
const VIEWBOX = "-15 -15 259 259";
const CENTER = 114.2705;
const BLOB_PATH = "M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z";
const COLORS: Record<string, { light: string; dark: string }> = {
  black: { light: "#000000", dark: "#FFFFFF" },
  brown: { light: "#A27952", dark: "#855C36" },
  red: { light: "#FF3E51", dark: "#E02135" },
  orange: { light: "#FF781C", dark: "#FF6700" },
  yellow: { light: "#FFAF38", dark: "#FF9800" },
  green: { light: "#00C972", dark: "#009957" },
  cyan: { light: "#1CC3B0", dark: "#00A592" },
  blue: { light: "#2A92FE", dark: "#0E74E0" },
  violet: { light: "#A97EFE", dark: "#804EE0" },
  magenta: { light: "#FF5EB1", dark: "#E02A88" },
  gray: { light: "#959595", dark: "#777777" },
};

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1412620
// Eee/Cee's deterministic fallback selectors, kept artifact-exact.
const SHIPPED_SHAPES = ["blob", "pebble", "squircle", "tablet", "wedge", "hex", "cloud", "teardrop"] as const;
function shippedRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = value + 1831565813 | 0;
    let next = Math.imul(value ^ value >>> 15, 1 | value);
    next = next + Math.imul(next ^ next >>> 7, 61 | next) ^ next;
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}
function shippedHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}
function shippedColorIndex(value: string): number {
  const seed = (shippedHash(value) ^ Math.imul(1, 2654435769)) >>> 0;
  return Math.floor(shippedRandom((seed ^ 2654435769) >>> 0)() * 10);
}
function shippedShapeHash(value: string): number {
  let hash = shippedHash(value);
  hash = Math.imul(hash ^ hash >>> 16, 73244475);
  hash = Math.imul(hash ^ hash >>> 13, 3266489909);
  return (hash ^ hash >>> 16) >>> 0;
}
export function resolvePersonaColor(agentId: string, color?: string | null): string {
  if (color != null && COLORS[color] != null) return color;
  return ["brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"][shippedColorIndex(agentId)] ?? "gray";
}
export function resolvePersonaShape(agentId: string, shape?: string | null): string {
  // T24：picker 的 13 形状全部可显式指定（8 ∪ 13 去重 = 15）；哈希回落仍只在原 8 个里
  if (shape != null && (Object.keys(ARTIFACT_SHAPE_PATHS) as readonly string[]).includes(shape)) return shape;
  return SHIPPED_SHAPES[shippedShapeHash(agentId) % SHIPPED_SHAPES.length] ?? "blob";
}

/** T24：picker 的 13 个形状（0.79.3 pn 的 DOM 序，每行 5 个 = 5/5/3）。 */
export const PICKER_SHAPES: readonly string[] = ["blob", "cloud", "square", "sparkle", "clover", "heart", "flower", "teardrop", "tablet", "wedge", "house", "star", "hex"];

/** T24：picker 的 11 个颜色 id（DOM 序，含 black；暗色渲染为白由 COLORS 自带）。 */
export const PICKER_COLORS: readonly string[] = ["black", "brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"];

/** T24：按主题取吉祥物墨色（色板底色/预览描边用；black 暗色为白）。 */
export function personaInk(color: string | null | undefined, theme: "light" | "dark"): string {
  const resolved = color != null && COLORS[color] != null ? color : resolvePersonaColor("persona", color);
  const entry = COLORS[resolved];
  return theme === "dark" ? entry?.dark ?? "#FFFFFF" : entry?.light ?? "#1C1C1C";
}

type Point = [number, number];

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=884671
// These are the shipped shape constructors (Yse/Ztt/Xtt/FBe/YJt/zBe/ZJt/r_t),
// kept local so the renderer remains dependency-closed without inventing geometry.
const TAU = Math.PI * 2;
const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, minimum: number, maximum: number) => value < minimum ? minimum : value > maximum ? maximum : value;

function smoothPath(points: readonly Point[]): string {
  const path = [`M${round2(points[0][0])} ${round2(points[0][1])}`];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const afterNext = points[(index + 2) % points.length];
    path.push(`C${round2(current[0] + (next[0] - previous[0]) / 6)} ${round2(current[1] + (next[1] - previous[1]) / 6)} ${round2(next[0] - (afterNext[0] - current[0]) / 6)} ${round2(next[1] - (afterNext[1] - current[1]) / 6)} ${round2(next[0])} ${round2(next[1])}`);
  }
  return `${path.join("")}Z`;
}

class ArtifactPath {
  d = "";
  x = 0;
  y = 0;
  move(x: number, y: number) { this.d += `M${round2(x)} ${round2(y)}`; this.x = x; this.y = y; return this; }
  line(x: number, y: number) { this.d += `L${round2(x)} ${round2(y)}`; this.x = x; this.y = y; return this; }
  curve(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    this.d += `C${round2(x1)} ${round2(y1)} ${round2(x2)} ${round2(y2)} ${round2(x)} ${round2(y)}`;
    this.x = x; this.y = y; return this;
  }
  corner(previous: Point, current: Point, next: Point, radius: number) {
    const unit = (from: Point, to: Point): Point => {
      const x = from[0] - to[0], y = from[1] - to[1], length = Math.hypot(x, y) || 1;
      return [x / length, y / length];
    };
    const before = unit(previous, current), after = unit(next, current);
    const start: Point = [current[0] + before[0] * radius, current[1] + before[1] * radius];
    const end: Point = [current[0] + after[0] * radius, current[1] + after[1] * radius];
    if (this.d) this.line(start[0], start[1]); else this.move(start[0], start[1]);
    this.d += `Q${round2(current[0])} ${round2(current[1])} ${round2(end[0])} ${round2(end[1])}`;
    this.x = end[0]; this.y = end[1]; return this;
  }
  arc(cx: number, cy: number, rx: number, ry: number, start: number, end: number) {
    const segments = Math.max(1, Math.ceil(Math.abs(end - start) / (Math.PI / 2)));
    const step = (end - start) / segments;
    const control = 4 / 3 * Math.tan(step / 4);
    let angle = start;
    for (let index = 0; index < segments; index += 1) {
      const nextAngle = angle + step;
      const from: Point = [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
      const to: Point = [cx + rx * Math.cos(nextAngle), cy + ry * Math.sin(nextAngle)];
      this.curve(from[0] - control * rx * Math.sin(angle), from[1] + control * ry * Math.cos(angle), to[0] + control * rx * Math.sin(nextAngle), to[1] - control * ry * Math.cos(nextAngle), to[0], to[1]);
      angle = nextAngle;
    }
    return this;
  }
  close() { return `${this.d}Z`; }
}

function sampledPath(generator: (angle: number) => Point, count = 128): string {
  const points: Point[] = [];
  for (let index = 0; index < count; index += 1) points.push(generator(index / count * TAU));
  return smoothPath(points);
}

function roundedPolygon(radius: number, sides: number, cornerRadius: number, start = 0): string {
  const points = Array.from({ length: sides }, (_, index): Point => {
    const angle = start + index / sides * TAU;
    return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius];
  });
  const path = new ArtifactPath();
  for (let index = 0; index < sides; index += 1) path.corner(points[(index - 1 + sides) % sides], points[index], points[(index + 1) % sides], cornerRadius);
  return path.close();
}

function cloudPath(points: readonly [number, number, number][], count = 160): string {
  return sampledPath((angle) => {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    let radius = 0;
    for (const [x, y, circleRadius] of points) {
      const dx = x - CENTER, dy = y - CENTER, projection = cos * dx + sin * dy;
      const discriminant = projection * projection - (dx * dx + dy * dy) + circleRadius * circleRadius;
      if (discriminant <= 0) continue;
      radius = Math.max(radius, projection + Math.sqrt(discriminant));
    }
    return [CENTER + cos * radius, CENTER + sin * radius];
  }, count);
}

function squirclePath(width: number, height: number, exponent: number): string {
  return sampledPath((angle) => {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return [CENTER + Math.sign(cos) * Math.pow(Math.abs(cos), 2 / exponent) * width, CENTER + Math.sign(sin) * Math.pow(Math.abs(sin), 2 / exponent) * height];
  });
}

function tabletPath(width: number, height: number): string {
  return new ArtifactPath().move(CENTER - width + height, CENTER - height).line(CENTER + width - height, CENTER - height)
    .arc(CENTER + width - height, CENTER, height, height, -Math.PI / 2, Math.PI / 2).line(CENTER - width + height, CENTER + height)
    .arc(CENTER - width + height, CENTER, height, height, Math.PI / 2, Math.PI * 3 / 2).close();
}

function teardropPath(width: number, top: number, bottom: number, cornerRadius: number): string {
  const ratio = clamp(width / (bottom - top), -1, 1), height = Math.sqrt(1 - ratio * ratio);
  const right: Point = [CENTER + width * height, bottom - width * ratio];
  const left: Point = [CENTER - width * height, bottom - width * ratio];
  const angle = Math.atan2(right[1] - bottom, right[0] - CENTER);
  return new ArtifactPath().corner(right, [CENTER, top], left, cornerRadius).line(left[0], left[1]).arc(CENTER, bottom, width, width, Math.PI - angle, angle).close();
}

function pathSamples(path: string): Point[] {
  const tokens = path.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const samples: Point[] = [];
  let index = 0, command = "", startX = 0, startY = 0, x = 0, y = 0;
  const number = () => Number(tokens[index++]);
  const addLine = (toX: number, toY: number) => {
    const length = Math.hypot(toX - x, toY - y), count = Math.max(2, Math.ceil(length / 4));
    for (let step = 1; step <= count; step += 1) samples.push([x + (toX - x) * step / count, y + (toY - y) * step / count]);
    x = toX; y = toY;
  };
  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++].toUpperCase();
    if (command === "Z") { addLine(startX, startY); continue; }
    if (command === "M") { x = number(); y = number(); startX = x; startY = y; samples.push([x, y]); command = "L"; continue; }
    if (command === "L") { addLine(number(), number()); continue; }
    if (command === "Q") {
      const x1 = number(), y1 = number(), endX = number(), endY = number(), fromX = x, fromY = y;
      const count = Math.max(2, Math.ceil((Math.hypot(x1 - x, y1 - y) + Math.hypot(endX - x1, endY - y1)) / 4));
      for (let step = 1; step <= count; step += 1) { const t = step / count, inverse = 1 - t; samples.push([inverse * inverse * fromX + 2 * inverse * t * x1 + t * t * endX, inverse * inverse * fromY + 2 * inverse * t * y1 + t * t * endY]); }
      x = endX; y = endY; continue;
    }
    if (command === "C") {
      const x1 = number(), y1 = number(), x2 = number(), y2 = number(), endX = number(), endY = number(), fromX = x, fromY = y;
      const count = Math.max(2, Math.ceil((Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(endX - x2, endY - y2)) / 4));
      for (let step = 1; step <= count; step += 1) { const t = step / count, inverse = 1 - t; samples.push([inverse ** 3 * fromX + 3 * inverse ** 2 * t * x1 + 3 * inverse * t ** 2 * x2 + t ** 3 * endX, inverse ** 3 * fromY + 3 * inverse ** 2 * t * y1 + 3 * inverse * t ** 2 * y2 + t ** 3 * endY]); }
      x = endX; y = endY; continue;
    }
    index += 1;
  }
  return samples;
}

function normalizeArtifactPath(path: string): string {
  const samples = pathSamples(path);
  const xs = samples.map(([x]) => x), ys = samples.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const offsetX = CENTER - (minX + maxX) / 2, offsetY = CENTER - (minY + maxY) / 2;
  const scale = clamp(228.44 / Math.max(maxX - minX, maxY - minY), .9, 1.35);
  if (Math.abs(scale - 1) < .005 && Math.abs(offsetX) < .5 && Math.abs(offsetY) < .5) return path;
  let numberIndex = 0;
  return path.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (value) => {
    const coordinate = Number(value) + (numberIndex++ % 2 === 0 ? offsetX : offsetY);
    return String(round2(CENTER + (coordinate - CENTER) * scale));
  });
}

// ── T24：0.79.3 picker 形状（fs=点集圆角多边形等价；Lc=flower 并集轮廓二分） ──
function roundedPointsPath(points: readonly Point[], cornerRadius: number): string {
  const n = points.length;
  let d = "";
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n]!, cur = points[i]!, next = points[(i + 1) % n]!;
    const v1x = cur[0] - prev[0], v1y = cur[1] - prev[1], l1 = Math.hypot(v1x, v1y);
    const v2x = next[0] - cur[0], v2y = next[1] - cur[1], l2 = Math.hypot(v2x, v2y);
    const r1 = Math.min(cornerRadius, l1 / 2), r2 = Math.min(cornerRadius, l2 / 2);
    const ax = cur[0] - v1x / l1 * r1, ay = cur[1] - v1y / l1 * r1;
    const bx = cur[0] + v2x / l2 * r2, by = cur[1] + v2y / l2 * r2;
    d += i === 0 ? `M${round2(ax)} ${round2(ay)}` : `L${round2(ax)} ${round2(ay)}`;
    d += `Q${round2(cur[0])} ${round2(cur[1])} ${round2(bx)} ${round2(by)}`;
  }
  return `${d}Z`;
}

/** 0.79.3 Lc()：中心圆 + 6 卫星圆的并集轮廓（240 角二分，22 次收敛）。 */
function flowerPath(): string {
  const cx = 0, cy = 0, cr = 0.36, ringR = 0.58, ringCr = 0.33;
  const balls: Array<[number, number, number]> = [[cx, cy, cr]];
  for (let i = 0; i < 6; i += 1) {
    const a = -Math.PI / 2 + i * TAU / 6;
    balls.push([ringR * Math.cos(a), ringR * Math.sin(a), ringCr]);
  }
  return sampledPath((angle) => {
    const i = Math.cos(angle), j = Math.sin(angle);
    let lo = 0, hi = 0.91;
    for (let k = 0; k < 22; k += 1) {
      const mid = (lo + hi) / 2, px = mid * i, py = mid * j;
      const inside = balls.some(([bx, by, br]) => (px - bx) ** 2 + (py - by) ** 2 <= br * br);
      if (inside) lo = mid; else hi = mid;
    }
    const r = lo * CENTER * 1.55; // 单位圆 → 259 系（normalizeArtifactPath 再校正）
    return [CENTER + i * r, CENTER + j * r];
  }, 240);
}

const HEART_PATH = "M79.4511 11.5693C94.8767 -3.85636 119.887 -3.85622 135.312 11.5693C150.738 26.995 150.738 52.0049 135.312 67.4306L129.302 73.4404L129.303 73.4414L83.7724 118.972C81.8111 120.933 79.4309 122.22 76.9199 122.833C76.463 122.944 76.0018 123.034 75.538 123.101C74.1477 123.301 72.734 123.301 71.3437 123.101C70.8802 123.034 70.4194 122.944 69.9628 122.833C69.8486 122.805 69.7347 122.776 69.621 122.745C69.3938 122.684 69.1679 122.616 68.9433 122.544C67.4837 122.073 66.0831 121.367 64.8017 120.426C64.6047 120.281 64.4108 120.13 64.2197 119.975C63.837 119.662 63.466 119.328 63.1093 118.972L11.5693 67.4306C-3.85643 52.0049 -3.85642 26.995 11.5693 11.5693C26.995 -3.85643 52.0049 -3.85643 67.4306 11.5693L73.4404 17.579L79.4511 11.5693Z";
const SPARKLE_PATH = "M93.9365 0.100586C98.4439 -0.387322 102.691 0.897134 106.341 4.03418C111.502 8.47087 114.842 16.0545 116.636 25.2725C118.36 34.1341 118.716 44.8177 117.701 56.4346L117.707 56.4375L117.706 56.4443C122.25 58.5638 126.519 60.8171 130.449 63.168C130.485 63.1891 130.52 63.2103 130.556 63.2314C131.25 63.6478 131.934 64.067 132.607 64.4893C132.68 64.5349 132.753 64.5813 132.825 64.627C133.074 64.7838 133.322 64.941 133.567 65.0986C133.692 65.1787 133.816 65.2596 133.94 65.3398C134.138 65.4676 134.335 65.5954 134.53 65.7236C134.653 65.8039 134.775 65.8844 134.896 65.9648C135.112 66.1073 135.325 66.2506 135.538 66.3936C135.625 66.4522 135.713 66.5106 135.8 66.5693C138.866 68.645 141.667 70.7792 144.163 72.9502C149.754 77.8126 153.981 83.0002 156.136 88.2578C156.159 88.3133 156.181 88.3693 156.203 88.4248C156.268 88.5868 156.332 88.749 156.393 88.9111C156.435 89.0226 156.475 89.1346 156.516 89.2461C156.541 89.3175 156.566 89.3895 156.591 89.4609C157.443 91.8917 157.839 94.3199 157.696 96.7109C157.522 99.7997 156.469 102.655 154.613 105.192C154.236 105.709 153.826 106.208 153.388 106.692C153.365 106.717 153.343 106.742 153.32 106.767C153.171 106.93 153.019 107.091 152.863 107.25C152.844 107.27 152.824 107.29 152.804 107.311C152.3 107.822 151.762 108.316 151.191 108.79C151.168 108.81 151.144 108.83 151.12 108.85C150.952 108.988 150.781 109.125 150.607 109.261C150.558 109.299 150.509 109.337 150.46 109.375C150.282 109.512 150.101 109.648 149.917 109.781C149.903 109.792 149.888 109.801 149.874 109.812C149.255 110.26 148.605 110.689 147.926 111.1C147.795 111.179 147.662 111.256 147.528 111.334C147.41 111.403 147.292 111.473 147.173 111.541C146.915 111.687 146.653 111.832 146.388 111.974C146.316 112.012 146.243 112.047 146.171 112.085C145.978 112.186 145.783 112.287 145.586 112.386C145.459 112.449 145.331 112.511 145.203 112.573C145.048 112.649 144.891 112.723 144.733 112.797C144.614 112.853 144.494 112.909 144.373 112.964C144.198 113.044 144.021 113.122 143.843 113.2C143.722 113.253 143.6 113.306 143.478 113.358C143.288 113.439 143.096 113.519 142.903 113.598C142.836 113.625 142.769 113.655 142.701 113.683C142.662 113.698 142.622 113.712 142.583 113.728C142.371 113.812 142.156 113.895 141.94 113.978C141.847 114.013 141.753 114.051 141.658 114.086C140.71 114.441 139.731 114.771 138.725 115.078C138.613 115.112 138.502 115.145 138.39 115.179C138.257 115.218 138.123 115.26 137.989 115.299C137.911 115.322 137.831 115.343 137.752 115.365C137.61 115.406 137.467 115.446 137.324 115.485C137.095 115.549 136.863 115.611 136.63 115.672C136.52 115.701 136.41 115.73 136.3 115.759C136.064 115.819 135.827 115.879 135.588 115.938C135.451 115.971 135.314 116.004 135.177 116.037C134.975 116.085 134.772 116.131 134.568 116.178C134.312 116.236 134.054 116.294 133.795 116.35C133.535 116.406 133.274 116.461 133.011 116.515C132.85 116.547 132.688 116.578 132.525 116.61C132.333 116.648 132.14 116.686 131.946 116.723C131.689 116.771 131.43 116.818 131.17 116.864C131.075 116.881 130.979 116.898 130.884 116.914C130.595 116.964 130.304 117.012 130.012 117.06C129.932 117.073 129.851 117.085 129.771 117.098C129.484 117.143 129.196 117.188 128.906 117.23C128.818 117.243 128.729 117.256 128.641 117.269C127.33 117.457 125.983 117.62 124.601 117.755C124.468 117.768 124.336 117.782 124.203 117.794C123.92 117.82 123.636 117.845 123.351 117.869C123.24 117.878 123.13 117.888 123.02 117.897C122.701 117.923 122.381 117.948 122.059 117.971C121.967 117.977 121.874 117.984 121.782 117.99C121.463 118.012 121.143 118.033 120.82 118.053C120.73 118.058 120.639 118.063 120.549 118.068C119.546 118.126 118.527 118.171 117.492 118.202C117.322 118.207 117.151 118.213 116.979 118.218C116.785 118.223 116.59 118.225 116.395 118.229C116.147 118.235 115.899 118.24 115.65 118.244C115.415 118.248 115.178 118.25 114.94 118.252C114.688 118.254 114.435 118.256 114.181 118.257C114.008 118.257 113.835 118.257 113.662 118.257C113.32 118.256 112.976 118.255 112.631 118.252C112.503 118.251 112.375 118.25 112.247 118.248C111.858 118.243 111.466 118.237 111.073 118.229C110.984 118.227 110.894 118.226 110.804 118.224C107.734 118.154 104.558 117.977 101.289 117.69C96.3593 128.261 90.7082 137.338 84.7832 144.151C78.6204 151.238 71.9357 156.137 65.2471 157.399C60.5179 158.292 56.1975 157.281 52.5381 154.604C48.9431 151.975 46.1246 147.845 44.0479 142.691C40.0321 132.725 38.5457 118.333 40.043 101.281C40.0382 101.279 40.0331 101.277 40.0283 101.274C39.6986 101.121 39.3711 100.965 39.0449 100.811C38.8351 100.711 38.6254 100.612 38.417 100.512C38.0794 100.35 37.7438 100.186 37.4102 100.023C37.2392 99.9399 37.0684 99.8563 36.8984 99.7725C36.5886 99.6196 36.2801 99.4663 35.9736 99.3125C35.7564 99.2034 35.5398 99.0939 35.3242 98.9844C34.9817 98.8104 34.6409 98.636 34.3027 98.4609C34.2424 98.4297 34.1823 98.3975 34.1221 98.3662C19.2858 90.6566 8.70839 81.8767 3.56055 73.3232C3.50461 73.2303 3.44926 73.137 3.39453 73.0439C3.37308 73.0075 3.35134 72.971 3.33008 72.9346C3.19352 72.7003 3.06142 72.4652 2.93262 72.2305C2.19429 70.8865 1.58552 69.5375 1.11816 68.1895C1.10444 68.1499 1.09161 68.1099 1.07813 68.0703C1.04009 67.9586 1.00191 67.847 0.96582 67.7354C0.954674 67.7009 0.943578 67.6663 0.932617 67.6318C0.823298 67.2877 0.723275 66.9435 0.632813 66.5996C-0.103732 63.8123 -0.218301 61.0433 0.402344 58.3643C1.34437 54.2986 3.89972 50.7745 7.875 47.9023C7.90661 47.8794 7.93796 47.8559 7.96973 47.833C8.12646 47.7208 8.2852 47.6092 8.44629 47.499C8.57825 47.4084 8.71216 47.3194 8.84668 47.2305C8.87052 47.2148 8.89404 47.1983 8.91797 47.1826C10.608 46.0723 12.497 45.0908 14.5547 44.2324C14.6355 44.1986 14.7165 44.1643 14.7979 44.1309C14.8508 44.1092 14.9038 44.087 14.957 44.0654L15.25 43.9482C15.3501 43.9084 15.4509 43.8694 15.5518 43.8301C15.6093 43.8078 15.6668 43.7848 15.7246 43.7627C23.7646 40.6682 34.1765 39.3165 45.6846 39.4756C45.8574 39.4779 46.0307 39.4814 46.2041 39.4844C46.4305 39.4884 46.6576 39.4909 46.8848 39.4961C47.3568 39.5065 47.8313 39.5207 48.3076 39.5361C48.4142 39.5397 48.5212 39.5441 48.6279 39.5479C51.1795 39.6366 53.791 39.7967 56.4512 40.0293C63.6811 24.5137 72.1655 12.7934 80.627 6.1709C85.0025 2.74635 89.5085 0.57999 93.9365 0.100586Z";
const STAR_PATH = "M58.9438 9.25323C63.2492 -3.08441 80.6974 -3.08441 85.0027 9.25322L91.7612 28.6207C94.0136 35.0751 100.652 38.9078 107.368 37.6311L127.52 33.8004C140.357 31.3602 149.081 46.4708 140.549 56.3681L127.156 71.9049C122.692 77.0827 122.692 84.748 127.156 89.9258L140.549 105.463C149.081 115.36 140.357 130.471 127.52 128.03L107.368 124.2C100.652 122.923 94.0136 126.756 91.7612 133.21L85.0027 152.577C80.6974 164.915 63.2492 164.915 58.9438 152.577L52.1853 133.21C49.933 126.756 43.2946 122.923 36.5788 124.2L16.4268 128.03C3.58942 130.471 -5.1347 115.36 3.39733 105.463L16.7908 89.9258C21.2543 84.748 21.2543 77.0827 16.7908 71.9049L3.39734 56.3681C-5.13469 46.4708 3.58941 31.3602 16.4268 33.8004L36.5787 37.6311C43.2946 38.9078 49.933 35.0751 52.1853 28.6207L58.9438 9.25323Z";

const ARTIFACT_SHAPE_PATHS: Record<string, string> = {
  // T24 新增（0.79.3 picker 13 形状里缺的 7 个；square/house 用 roundedPointsPath 复刻
  // ws(107,28)/Ts(100,110,78,29)，clover 用 cloudPath 复刻 ks(38,58)，flower 用 Lc）
  square: normalizeArtifactPath(roundedPointsPath([[CENTER - 107, CENTER - 107], [CENTER + 107, CENTER - 107], [CENTER + 107, CENTER + 107], [CENTER - 107, CENTER + 107]], 28)),
  house: normalizeArtifactPath(roundedPointsPath([[CENTER - 100, CENTER + 110], [CENTER + 100, CENTER + 110], [CENTER + 100, CENTER - 32], [CENTER, CENTER - 110], [CENTER - 100, CENTER - 32]], 29)),
  clover: normalizeArtifactPath(cloudPath([[CENTER - 38, CENTER - 38, 58], [CENTER + 38, CENTER - 38, 58], [CENTER + 38, CENTER + 38, 58], [CENTER - 38, CENTER + 38, 58]])), // ks(38,58)：圆心纵横均 ±38、半径 58（review M1 修正：原纵向误 58）
  heart: normalizeArtifactPath(HEART_PATH),
  sparkle: normalizeArtifactPath(SPARKLE_PATH),
  star: normalizeArtifactPath(STAR_PATH),
  flower: normalizeArtifactPath(flowerPath()),
  blob: normalizeArtifactPath(BLOB_PATH),
  pebble: normalizeArtifactPath(sampledPath((angle) => { const radius = 108 * (1 + .075 * (Math.sin(angle * 2 + 1.1) * .6 + Math.sin(angle * 3 - 1.1) * .4)); return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius * .98]; })),
  squircle: normalizeArtifactPath(squirclePath(107, 107, 4.2)),
  tablet: normalizeArtifactPath(tabletPath(114, 74)),
  wedge: normalizeArtifactPath(roundedPolygon(130, 3, 60, -Math.PI / 2)),
  hex: normalizeArtifactPath(roundedPolygon(114, 6, 20, Math.PI / 6)),
  cloud: normalizeArtifactPath(cloudPath([[CENTER - 62, CENTER + 26, 56], [CENTER + 62, CENTER + 26, 54], [CENTER, CENTER + 34, 62], [CENTER - 24, CENTER - 30, 62], [CENTER + 38, CENTER - 26, 54]])),
  teardrop: normalizeArtifactPath(teardropPath(88, CENTER - 114, CENTER + 26, 18)),
};
export const PERSONA_SHAPE_PATHS = ARTIFACT_SHAPE_PATHS;
export const personaShapePath = (shape: string) => ARTIFACT_SHAPE_PATHS[shape] ?? ARTIFACT_SHAPE_PATHS.blob;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

const MOTION: Record<OnboardingCharacterState, { amplitude: number; period: number; tilt: number; eye: number }> = {
  sleeping: { amplitude: 0, period: 6000, tilt: 0, eye: .12 }, waking: { amplitude: 2, period: 800, tilt: 0, eye: .35 }, idle: { amplitude: 1.5, period: 9000, tilt: 0, eye: 1 }, listening: { amplitude: 1.8, period: 2800, tilt: -2, eye: 1 },
  thinking: { amplitude: 1, period: 2000, tilt: 3, eye: .75 }, searching: { amplitude: 2, period: 1000, tilt: -4, eye: .9 }, working: { amplitude: 2, period: 1800, tilt: -3, eye: 1 }, loading: { amplitude: 2, period: 6000, tilt: 3, eye: .9 },
  excited: { amplitude: 5, period: 1100, tilt: 0, eye: 1.08 }, surprised: { amplitude: 3, period: 2500, tilt: 0, eye: 1.18 }, suspicious: { amplitude: 1, period: 2600, tilt: 7, eye: .75 }, angry: { amplitude: 1, period: 2200, tilt: -7, eye: .65 }, drowsy: { amplitude: .5, period: 4000, tilt: 0, eye: .25 },
  happy: { amplitude: 3, period: 2500, tilt: 0, eye: 1.08 }, curious: { amplitude: 2, period: 1800, tilt: 6, eye: 1 }, confused: { amplitude: 1, period: 2200, tilt: -5, eye: .8 }, bored: { amplitude: .4, period: 3500, tilt: -8, eye: .45 }, proud: { amplitude: 2, period: 3500, tilt: 4, eye: 1 }, shy: { amplitude: 1, period: 3000, tilt: -8, eye: .55 }, sad: { amplitude: 1, period: 4000, tilt: -4, eye: .6 }, laughing: { amplitude: 4, period: 1200, tilt: 0, eye: .8 }, scared: { amplitude: 3, period: 900, tilt: 0, eye: 1.1 }, playful: { amplitude: 4, period: 1500, tilt: 8, eye: 1.05 }, celebrate: { amplitude: 7, period: 1400, tilt: 0, eye: 1.12 },
  orbit: { amplitude: 2, period: 4000, tilt: 12, eye: 1 }, radar: { amplitude: 2, period: 4000, tilt: -12, eye: 1 }, progress: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, spawning: { amplitude: 5, period: 1200, tilt: 0, eye: 1 }, humming: { amplitude: 1.5, period: 5000, tilt: 0, eye: .9 }, dictating: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, writing: { amplitude: 2, period: 4000, tilt: -4, eye: 1 }, sending: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, receiving: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, uploading: { amplitude: 2, period: 4000, tilt: 0, eye: 1 }, notifying: { amplitude: 3, period: 1500, tilt: 0, eye: 1.1 }, alerting: { amplitude: 2, period: 2000, tilt: 0, eye: 1.1 }, dragging: { amplitude: 3, period: 1600, tilt: 5, eye: 1 }, bouncing: { amplitude: 7, period: 3000, tilt: 0, eye: 1 }, "powering-down": { amplitude: 0, period: 6000, tilt: 0, eye: .12 },
};

export interface OnboardingCharacterHandle { spin(): void; bounce(): void; burst(): void; }

export const OnboardingCharacter = forwardRef<OnboardingCharacterHandle, OnboardingCharacterVisualProps>(function OnboardingCharacter({ color, shape, sizePx, state, isFollowingPointer = false, paused = false, surfaceTheme, pointerShown = false, className, sourceId, emphasis = false, spinSignal = 0, followTarget = null }, ref) {
  const id = useId().replace(/:/g, "");
  const faceRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const gazeRef = useRef({ x: 0, y: 0 });
  const actionRef = useRef<"spin" | "bounce" | "burst" | null>(null);
  const resolvedColor = resolvePersonaColor(sourceId ?? "persona", color);
  const colors = COLORS[resolvedColor] ?? COLORS.black;
  const motion = MOTION[state] ?? MOTION.idle;
  useImperativeHandle(ref, () => ({
    spin: () => { actionRef.current = "spin"; },
    bounce: () => { actionRef.current = "bounce"; },
    burst: () => { actionRef.current = "burst"; },
  }), []);

  useEffect(() => {
    if ((!isFollowingPointer && followTarget == null) || typeof window === "undefined") return;
    const handlePointerMove = (event: PointerEvent) => {
      const node = faceRef.current?.ownerSVGElement;
      const rect = node?.getBoundingClientRect();
      if (rect == null || rect.width === 0 || rect.height === 0) return;
      gazeRef.current = {
        x: Math.max(-1, Math.min(1, (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2))),
        y: Math.max(-1, Math.min(1, (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2))),
      };
    };
    const clearPointer = () => { gazeRef.current = { x: 0, y: 0 }; };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", clearPointer);
    if (followTarget != null) {
      const node = faceRef.current?.ownerSVGElement;
      const rect = node?.getBoundingClientRect();
      if (rect != null && rect.width > 0 && rect.height > 0) gazeRef.current = {
        x: Math.max(-1, Math.min(1, (followTarget.x - (rect.left + rect.width / 2)) / (rect.width / 2))),
        y: Math.max(-1, Math.min(1, (followTarget.y - (rect.top + rect.height / 2)) / (rect.height / 2))),
      };
    }
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener("pointerleave", clearPointer);
      clearPointer();
    };
  }, [followTarget, isFollowingPointer]);

  useEffect(() => {
    const face = faceRef.current, eyes = eyesRef.current;
    if (spinSignal > 0) actionRef.current = "spin";
    if (face == null || eyes == null || reducedMotion() || paused) return;
    let frame = 0;
    const started = performance.now();
    const tick = (time: number) => {
      const elapsed = time - started;
      const action = actionRef.current;
      const phase = elapsed / motion.period * Math.PI * 2;
      const bounce = action === "bounce" ? Math.max(0, 1 - (elapsed % 700) / 700) * 8 : 0;
      const spin = action === "spin" ? (elapsed % 1000) / 1000 * 360 : 0;
      const bob = Math.sin(phase) * motion.amplitude;
      const gaze = gazeRef.current;
      face.setAttribute("transform", `translate(0 ${-bob - bounce}) rotate(${motion.tilt + spin} ${CENTER} ${CENTER})`);
      eyes.setAttribute("transform", `translate(${gaze.x * 4} ${gaze.y * 3}) scale(1 ${motion.eye})`);
      if (action === "bounce" && bounce === 0) actionRef.current = null;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [motion, paused, spinSignal, state]);

  const background = surfaceTheme === "light" ? "#fff" : "var(--cursor-bg-editor, #fff)";
  const rootStyle: CSSProperties = { display: "block", height: sizePx, overflow: "visible", userSelect: "none", WebkitUserSelect: "none", width: sizePx };
  const eyeHeight = state === "sleeping" ? 2 : 7;
  return <svg aria-hidden="true" className={className} data-emphasis={emphasis || undefined} data-grok-state={state} data-paused={paused || undefined} data-pointer-shown={pointerShown || undefined} data-reduced-motion={reducedMotion() ? "true" : "false"} data-source-id={sourceId || undefined} height={sizePx} style={rootStyle} viewBox={VIEWBOX} width={sizePx} xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id={`${id}-ink`} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor={colors.light} /><stop offset="1" stopColor={colors.dark} /></linearGradient></defs>
    <g ref={faceRef} transform="translate(0 0)">
      <path d={personaShapePath(shape)} fill={`url(#${id}-ink)`} />
      <g ref={eyesRef} fill={background} transform="translate(0 0)">
        <ellipse cx={CENTER - 29} cy={CENTER - 8} rx="10" ry={eyeHeight} />
        <ellipse cx={CENTER + 29} cy={CENTER - 8} rx="10" ry={eyeHeight} />
      </g>
      {state === "excited" || state === "happy" || state === "celebrate" ? <path d={`M${CENTER - 20} ${CENTER + 24} Q${CENTER} ${CENTER + 38} ${CENTER + 20} ${CENTER + 24}`} fill="none" stroke={background} strokeLinecap="round" strokeWidth="5" /> : null}
    </g>
  </svg>;
});

export function defaultOnboardingCharacterRenderer(props: OnboardingCharacterVisualProps) {
  return <OnboardingCharacter {...props} />;
}
