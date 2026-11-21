# T98 · skill 入口文案换 1.1.0（R1 映射定案，机械小改）

- claimed: 2026-11-15 主 agent（GLM 5.3）· 分支 feat/T98
- accepted: 2026-11-15 manager 任务 B @ feat/T98 cd2968d1（skills-picker.spec 复跑 2 passed (8.1s)；改动面 skills-dialog.tsx 5 行+spec 2 断言；截图 work/ui-quality/evidence/T98/ 亮暗入口钮单行 nowrap 134.7×24、scrollWidth=clientWidth 无溢出）
- 来源: queue「1.1.0 基线迁移」M5 行 + R1（RE-BOT-MANAGE-1.1.0.md §7 映射表）

## 范围（3 处字面量）

`renderer-grok/overrides/modules/skills-dialog.tsx`：
- L44 `aria-label="Pick from your skills"` → `"Add from your skills"`
- L47 title span 同换
- L109 入口钮文本同换

不动（R1 判定 1.1.0 不变/未做）：Skills/Remove/Close 三串；Write a new skill / Search your skills（未做的新能力，不进本单）。

## 验收

- skills-picker.spec 追加断言（入口钮 text + 对话框 aria-label）先红后绿
- 既有 skills-picker.spec 全量绿（断言走 data-action/data-* 不碰文案）

## 锚

- 1.1.0 en 表（RE-BOT-MANAGE §1/§7）：「Add from your skills」为 bot-manage-knowledge 菜单 `pick` 项文案；aria 同串
