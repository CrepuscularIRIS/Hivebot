// P5-57 覆盖：footer 市场入口文案 Plugins → Connect apps（A15：0.78.1 footer「Connect apps」药丸，R2 L43-48）。
// 只换这一条串；药丸几何在 p5-55-layout.css。
import { UI_TEXT as Upstream } from '../../frontend/src/production/evidence'

export * from '../../frontend/src/production/evidence'

export const UI_TEXT = { ...Upstream, plugins: 'Connect apps' } as const
