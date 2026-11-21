# T79d c · connector 行贴卡缝 + Models 断言回位（T79d 验收不过的返修）

> accepted：2026-11-16 feat/T79d @ c689fced（经理任务 B 续，T79d 链整体收口）
> 链：T79d 30bcec9f（四件；主单只在 queue 18d + 回执，无单独工单文件）→ b 872ce5a5（Sol M1/M2：copy 同行 grid 排位、connector 卡观感）→ c c689fced（本单：缝 28、边/底/radius 同真卡、类型断言回位）

## 验收记录（经理 2026-11-16 · HEAD c689fced）

- 复跑 `run-e2e.sh t79d-settings-tail.spec.ts settings.spec.ts t57-settings-layout.spec.ts` → 4 passed（/tmp/t79d-c-mgr.log）
- 探针实测：Timezone 卡 bottom 491.56 / connector top 519.56 → **缝 28px**（=分组间距）；亮 底#fff/边 rgba(28,28,28,.08)/r14 与真卡逐值相等；暗 底 rgb(31,31,31)/边 .12，spec 亮暗相等断言通过
- 截图亲检（evidence/T79d/settings-{light,dark,dark-hover}.png，经理按 c 产物重拍）：connector 行独立成组、与 Timezone 卡间空隙同其它组，边/底/圆角与上方卡观感一致；copy 钮与 email 同排；Models=layers
- settings-view.tsx:12 `as unknown as SettingsSection` 已在对象字面量后、注释前 ✓
- copy 段已无条件（count>0 断言），`if` 静默跳过分支删除 ✓
- 降级（追认，不返修）：未按单复用 `.sand-settings-group__card` 类，改为同 token 手写（单允许「或等价」；computed 相等断言已锁）；行 padding 13 vs 真行 14，文字左缘 435 vs 436，差 1px
- **测试债（记 queue 提议，不开单）**：spec 缝断言取的是**第一张**卡（账户卡）而非相邻 Timezone 卡、阈值 >0 非 ≥20——margin 删掉仍会绿（236px），属空断言；下次碰此 spec 时改成相邻卡（最后一张 `.sand-settings-group__card`）且 ≥20。回执缺 c 段与「先红」记录

- 来源: 经理任务 B 2026-11-16 验收 feat/T79d @ 872ce5a5 不过；证据 work/tickets/evidence/T79d/settings-{light,dark,dark-hover}.png
- 前序: T79d（30bcec9f）+ T79d b（872ce5a5）；第二次失败 → 走 C，不再开 d

## 失败点（经理亲测）

1. **connector 行与 Timezone 卡零缝相贴**（亮暗都有，截图一眼可见）：Timezone 卡 bottom≈491，connector 行 top=491.56——两张卡叠成「双边粘连」。根因：`.pb-settings-connector-preferences` 是 `<Upstream>` 的兄弟（settings-panels.tsx:34），落在 `.sand-settings-general { gap:28px }` 之外，无任何间距。另外手抄样式仍和真卡不一致：边 `--cursor-stroke-secondary`（亮 rgba(28,28,28,.12)）vs 真卡 `--sand-border-attachment-card`（.08）；padding 13 vs 行 10/14（文字左缘 435 vs 436）。
2. **settings-view.tsx:12 类型断言被注释吞掉**：`{ … icon: 'layers' } // T79d：… as unknown as SettingsSection`——`as unknown as SettingsSection` 现在在注释里。vite 不查类型所以没炸，但这是误改。

## 做法（最小）

1. connector 行**复用真卡类**，删 t57css 里手抄的那一整行规则：
   `<div className="sand-settings-group__card pb-settings-connector-preferences" data-connector-preferences><div className="sand-settings-row">…</div></div>`（或等价——要点：底/边/radius/行 padding 全走 `.sand-settings-group__card` / `.sand-settings-row` 现有规则，不再自己写色值）。
   与上方卡的间距用 `.pb-settings-connector-preferences { margin-top: 28px }`（= `.sand-settings-general` 分组间距；它无 h3，视为独立一组）。
2. 把 `as unknown as SettingsSection` 挪回对象字面量后、注释前。
3. t79d spec：
   - 新断言（先红）：connector 行 `top - 上一张 .sand-settings-group__card.bottom >= 20`；connector 行 computed `backgroundColor/borderTopColor/borderRadius` **等于**相邻 `.sand-settings-group__card` 的值，亮暗各断一次
   - copy 段去掉 `if (count > 0)`：改 `await expect(copyBtn).toHaveCount(1)` 再断重叠（测试环境有 email `pbots-local@pbots.local`，条件分支只会制造静默跳过）

## 边界

- 只动 settings-panels.tsx、settings-view.tsx（一行）、settings-view-t57.css、t79d-settings-tail.spec.ts
- 不碰 p5-55（暗 hover 已过）、不碰账户卡（copy 同行已过：email y213–229 / 钮 y209–233 重叠）

## 验收

- `cd /tmp/bot-wt/T79d/app/ui && PATH="$PWD/node_modules/.bin:$PATH" sh scripts/run-e2e.sh t79d-settings-tail.spec.ts --repeat-each=2` → 2 passed（新断言先红一次贴回执）
- `sh scripts/run-e2e.sh settings.spec.ts t57-settings-layout.spec.ts` → 3 passed
- 亮暗截图覆盖 evidence/T79d/ 三张（经理亲检：connector 与 Timezone 卡之间有分组空隙、边色一致）

## 为什么这样验收

T79d 的目的就是视觉收尾；「样式等价」靠手抄色值已经漂过两次（9px/10% 黑 → 12% 边/零缝）。断言「等于相邻真卡的 computed 值」才锁得住，不再靠回执口述。
