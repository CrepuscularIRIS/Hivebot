# Scout G：各家 AI 形象资产与桌宠前端标尺

调研日期：2026-11-09。范围：只读研究，不改产品代码，不运行参考仓程序，不读取凭证；新增浅克隆已登记 `repos/MANIFEST.tsv`。维护与数量均为本次快照，不作未来保证。

**结论先行**：大肥鱼是现成素材最完整、动作和交互最值得借鉴的一条；Claude 与 GLM 确有社区精灵包，但不能称官方，授权尚不足以随 exe 分发。Grok 在本仓已有 SVG avatar，而不是待找的视频包。dots 与 Meta Muse 有官方/媒体视觉材料，尚未找到可再分发的角色运行包。代码开源、角色授权、品牌权利必须分账。

## 一、各家形象：身份、资产与证据边界

### 1. Claude / Anthropic

- **官方品牌**：Claude 的星形标志属于品牌标识，不等于开放桌宠角色。官方品牌入口访问出现 404/403，本轮没有取得完整使用条款，不据此推断可改造或打包。
- **Clawd / Claude Code Crab**：橘色像素蟹是 Claude Code 常见社区称呼与形象线索；[第三方实际使用记述](https://www.starkinsider.com/2025/10/clawd-ai-retro-mascot-command-line.html)可支持产品内出现的说法，但不是 Anthropic 对二创/再分发的正式授权。
- **可下载社区包 A：Claude Code Crab**，Petdex slug `claude-code-crab`，署名 `文涵 汪.`，v1 atlas。[sprite](https://assets.petdex.dev/pets/claude-code-crab-53bb6247d262/sprite.webp)、[pet.json](https://assets.petdex.dev/pets/claude-code-crab-53bb6247d262/petjson.json)、[zip](https://assets.petdex.dev/pets/claude-code-crab-53bb6247d262/zip.zip)。本轮核了 manifest，未目视这个蟹包，不判断其像素质量。
- **可下载社区包 B：Claude酱**，slug `claude-opus-scholar`，署名 `lakeofsky347`，v2 atlas。[sprite](https://assets.petdex.dev/pets/claude-opus-scholar-88dade9b63fd/sprite.webp)、[pet.json](https://assets.petdex.dev/pets/claude-opus-scholar-88dade9b63fd/petjson.json)、[zip](https://assets.petdex.dev/pets/claude-opus-scholar-88dade9b63fd/zip.zip)。作者自述“基于现有形象以及Claude自述的形象设计，沉静的高级研究员一枚”。已目视：棕橙长发、持书、白金黑服饰的 Q 版研究员，有走路/挥手/读书等帧；这是作者创作，不是官方 Claude 人设。
- 两包的公共 manifest 不能提供清楚的资产许可；实取 Claude酱 pet.json 也没有 license。可作私用调研候选，外发前向作者取得明确授权并核品牌/底层形象权。

### 2. ChatGPT / OpenAI 与 dots

- **ChatGPT/OpenAI**：可核的品牌线索是 Blossom 几何 logo，未核到可作为通用开放桌宠分发的独立 ChatGPT 吉祥物。[品牌页](https://openai.com/brand/)本轮 403；搜索摘要提到不要修改标志、不要暗示背书，正式使用必须回核原文，不能当已读许可。
- **dots 是另一条产品形象线索**，不应直接用 ChatGPT logo 替代。[TechCrunch 报道](https://techcrunch.com/2026/09/29/openai-launches-dots-its-bubbly-agentic-avatar/)描述为 bubbly、cartoonish、floating cartoons，并附 OpenAI 署名截图。
- 已目视[报道配图](https://techcrunch.com/wp-content/uploads/2026/09/Screenshot-2026-09-29-at-1.16.22-PM.jpg?w=988)：右下是黄色圆润角色、突出的大眼和眼镜，左侧 Alfred 小头像同样为黄色形象。**这是静态宣传截图，只能确认这一款外观，不能推断所有 dots 都长这样，也不能据此复原动作。**
- [官方 dots 公告入口](https://openai.com/index/introducing-dots/)在既有侦察中受 403 限制；未取得 SVG/WebM/Live2D/atlas 的正式下载包或再分发授权。可参考漂浮、轻量陪伴的方向；原创 bubble 只是待制作替代，不是现成已授权 dots pack。

### 3. Grok / xAI

- 不混淆 **xAI/Grok 品牌标志**、社区同名角色与 **Grok Bot 产品内 avatar**。
- 本仓 `/home/lingxufeng/bot/app/ui/renderer-grok/assets/MANIFEST.json` 明示：bot avatar 由代码绘制 SVG，8 种 shape × 11 种 color，rAF 驱动状态；runtime 18 项资产主要是应用图标、连接器 logo、壁纸，不是桌宠 sprite pack。
- 已读组件 `/home/lingxufeng/bot/app/ui/renderer-grok/frontend/src/recovered/features/onboarding/signed-in/character.tsx:1–150`，来源头指向重构仓 `a9f633e`。8 个 shape：blob、pebble、squircle、tablet、wedge、hex、cloud、teardrop；颜色 black/brown/red/orange/yellow/green/cyan/blue/violet/magenta/gray。优先复用已有组件与状态，而非寻找不存在于该清单的 PNG 动画。
- 既有 MANIFEST 留有 0.78.1 原始资产目录 `/dev/shm/grok-re/0.78.1/app/dist/renderer/assets` 的出处记录；**本轮未重新解包 0.78.1，也未直接核查 0.79.3，不能把 0.18/当前重构组件的结论扩写成两版产物完整资产审计**。0.79.3 形象变化仍是证据缺口。
- Petdex 还出现 `psychegrok`，但名称相近不证明 xAI 官方或等同 Grok Bot。既有 SVG 重构资产仍为私用参照；重构仓无 LICENSE，不宜直接计入公开发行的干净素材库。

### 4. GLM / 智谱

- 未核到智谱对某一吉祥物的官方形象包和开放再分发条款；这不等于“没有社区素材”。
- Petdex **GLM**，slug `glm`，署名 `beichenhaoyu`，v1。[sprite](https://assets.petdex.dev/pets/glm-bc99b7ece6a5/sprite.webp)、[pet.json](https://assets.petdex.dev/pets/glm-bc99b7ece6a5/petjson.json)、[zip](https://assets.petdex.dev/pets/glm-bc99b7ece6a5/zip.zip)。JSON 只有 id/displayName/description/spritesheetPath，描述“AI助手GLM”，没有 license。
- 已目视：黑蓝长发、猫耳/尾巴、黑白女仆裙的 Q 版角色，具走路、挥手、跳跃、闭眼等帧。**仅能称“作者自标 GLM 的社区形象”**；其更早角色来源、作者权利链与商业再分发均待核，不得贴“智谱官方”。

### 5. DeepSeek / dsh：大肥鱼

- [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) README 明确：鲸鱼娘“大肥鱼”是**社区二创，非 DeepSeek 官方**。原型“溟月”来自 B 站 [上善无形](https://space.bilibili.com/4456176)，DeepSeek 女仆版设计来自 [ZipZipPipe](https://space.bilibili.com/4168597)。DeepSeek 鲸鱼品牌 logo 与该拟人形象不是一个授权对象。
- 当前 README 约 327–331 行区分代码 MIT 与形象 **CC BY-NC-SA 4.0**，引用[形象声明](https://www.bilibili.com/opus/1247156596114456581)：“不可以以任何形式商业化”；署名、非商业、相同方式共享条件不能被下游代码 LICENSE 覆盖。
- 有三条现成载体：dsh-pet 原始动作 WebM、big-blue-fish 的增强/兼容视频、[QCYTSN/dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu) 的 WebP 帧包。优先复用 pack，不另造 LLM/runtime。

### 6. Muse 必须消歧

- **Meta Muse**：[官方介绍](https://about.fb.com/news/2026/09/introducing-muse/)与[voice / expressive avatars 公告](https://about.fb.com/news/2026/11/introducing-muse-ai-voice-expressive-avatars/)有效，后者讲 listening/speaking 时的表情手势和 avatar 界面。官方页面有[宣传视频](https://about.fb.com/wp-content/uploads/2026/09/Introducing-Muse_Sizzle-Video.mp4)及[avatar 视频](https://about.fb.com/wp-content/uploads/2026/11/Were-rolling-out-voice-and-expressive-avatars-in-the-Muse-app_Header.mp4)，但新闻素材下载不等于可再分发运行模型。页面没有核到固定角色“Jolly”的命名；第三方 fuzzy/rosy-cheeks 描述暂不当官方结论。本轮未逐帧查看视频，不作具体角色外观定论。
- **yejiming/MuseAI / DSH 插件**：[MuseAI 仓](https://github.com/yejiming/MuseAI)是另一产品。目录/API 检查中 assets 主要是聊天、背景、角色卡等 UI 截图，public 为 icon.png、tauri.svg、vite.svg；递归路径检索没有发现专用 model3/moc3/vrm/webm 宠物包。这不是完整源码审计，也不证明用户不能导入自己的角色卡。
- `dsh-museai-tavern` 的 MIT 不自动覆盖 MuseAI 本体、用户角色卡插画或 Meta Muse。当前将两类分列，不替用户决定“Muse”指哪一家。

## 二、big-blue-fish-desktop-pet：值得照着打磨，但不搬整套栈

### 定位与维护

- 仓库：[Bai-Cute/big-blue-fish-desktop-pet](https://github.com/Bai-Cute/big-blue-fish-desktop-pet)，本轮浅克隆 SHA `6281a90d91e5507debe3da02b853ebc9c932b0fa`，最近提交 2026-11-06。
- README 标示 v1.1.2：Windows **WPF**，Linux **Avalonia**，不是 Electron/React 工程；106 条透明动画，增强视频 1280×720 / 60 fps，兼容视频 640×360 / 24 fps。视觉有立体感不代表实时 3D。
- [#19](https://github.com/Bai-Cute/big-blue-fish-desktop-pet/issues/19)报告 Windows 1.1.1 透明画布挡鼠标，owner 2026-11-06 回复“1.1.2已经修复”，11-07 回复“已修复，感谢反馈”。这满足最近半年有提交且有 owner issue 回应的维护证据；**不是本轮运行验证**。
- 代码 Apache-2.0；`code/THIRD-PARTY.md` 对引入的旧 dsh-pet 动画写 MIT，但当前上游明确 NC-SA。不能把整个 fish 包笼统标 Apache 可商用。

### 可转成 Hivebot 验收点的细节

| 打磨点 | 已读源码/材料 | 值得借的规格，不是本轮实现 |
|---|---|---|
| 不硬切动作 | `code/BigBlueFish.Windows/Companion/CompanionAnimations.cs:42–141` | greeting 起播，在 `AnimationFinished/AnimationBoundary` 再选下一片；拖动、移动、回归有优先级 |
| 拖拽有身体反馈 | 同上 | drag 截取 1.5–6 秒，保持悬空尾帧、松手走后续，不是窗口位移而角色一直 idle |
| 透明区不挡桌面 | `CompanionAnimationMask.cs` | 320×180、20Hz、压缩位图 mask 随视频时间取命中区域；Electron 要适配，不是直接复制 C# |
| 气泡是完整视觉组件 | `CompanionBubble.cs` | 奶油白 RGB(255,251,244)、蓝紫 RGB(80,96,152)、1.5 描边、圆角 24、尖角高 9；body 与三角做 Union 避免接缝 |
| 打字不切坏字符 | `CompanionSpeech.cs` | 28 字符/秒、25ms tick，`StringInfo.ParseCombiningCharacters` 按 grapheme 渐显；先用完整回复测尺寸，再逐字显示，完成后回调 |
| 跟随显示器而不乱跳 | `CompanionEdgeLayout.cs:1–180` | 气泡为独立透明 owned/topmost/no-activation 窗；监听位置/尺寸/DPI，按 WorkArea 限宽，最大 300 DIP、边距 16，避免打字中不断改大小 |
| 日常感不必烧模型 | `CompanionAnimationPolicy.cs` | 纯 policy 处理昼夜、三餐、季节、农历节日和动作加权；正确跳闰月，不抓屏、不调用模型；加载校验重复名/目录逃逸/文件缺失 |
| 不打扰是功能 | README | 全屏隐藏、离电暂停推理、50–200% 缩放；标准 ACP 与编译剔除 ACP 的 Safe 版有边界 |

已亲眼查看仓内 `docs/images/bigbluefish-speaking-transparent.png`：蓝发鲸鱼女仆、奶油白大圆角气泡、蓝紫字体/描边、尖角及关闭按钮。它是作者仓库配图，不是本轮真实运行截图。**评价：可作为动画调度、拖动、气泡、透明命中的高质量产品标尺；不宜为此引入 C#/.NET、本地 4B、OCR 与第二套 Agent 宿主。** Hivebot 复用既有 Electron/dsh 会话，只借展示与交互规格。

## 三、素材库、pack 格式与许可筛选

### 1. Petdex：目录好用，但不是统一“全库 MIT”

- [仓库](https://github.com/crafter-station/petdex)，本轮 SHA `31c0aee7f4fb387774b87d40e8047dc0f9cea94b`，代码 MIT，最近 commit 2026-10-10。README 的 Pet IP and takedowns 明示 fan art、不主张底层 IP、投稿者逐包授权；本轮未逐条核 issue 回复，因此不把代码维护状况等同全库版权审核。
- [公共 manifest](https://petdex.dev/api/manifest)本次快照 5,208 条，含 slug/displayName/kind/submittedBy/spritesheetUrl/petJsonUrl/zipUrl/spriteVersionNumber。数量大不代表都有清楚商业授权。
- 本地 `src/lib/public-manifest.ts:4–61` 的类型与构造函数**未输出 license**。实取 GLM、Claude酱、Blue Boba Axolotl 的 pet.json 也未给 license；“可以下载”不等于“可以随 exe 再分发”。
- 格式是 `pet.json + spritesheet.webp/png`，通常每格 192×208，v1 8 列×9 行，v2 8×11。常见前九行：idle、running-right、running-left、waving、jumping、failed、waiting、running、review；v2 多两行不能在所有 consumer 上擅自假定同一语义。运行器还要处理每行有效帧数，不能把空白格也播进去。
- 实际 pet.json 可能只有最小元数据，没有完整逐状态定义；导入应根据 spriteVersionNumber 与默认 atlas 约定适配，而非假设 JSON 一定列出 clips。
- 其他特色候选有 Blue Boba Axolotl、Mariachi Clawd、Clawbox Crab；仍逐包核底层角色与作者授权，不凭目录收录过审。Blue Boba Axolotl [sprite](https://assets.petdex.dev/pets/blue-boba-axolotl-95e9366e6389/sprite.webp)可直取，但本轮没有确认其授权，不列为可公开捆绑素材。

### 2. dsh-pet 与 dsh-dafeiyu：两种格式，不要混成一种

- dsh-pet SHA `c25386848f70f6e40902e4376f6e7b1e196bc326`，最近提交 2026-11-09。`dsh-pet/src/host/config/read.ts:38–98` 扫 `pet/<名>-config.json/jsonc`；文件名前缀也是条目 key 与素材根，继承全局偏好。
- `dsh-pet/assets/config.jsonc:265–365` 以 `main-animation/webm` 或 `pet/<root>-animation/` 配动作池，含 idle/turn/drag/clicks/moves/categories/events；不同 species 不应跨角色 fallback，`noMirror` 避免带字动画被镜像。这**不是** Petdex pet.json。
- [自制 pack 说明](https://github.com/PC2005-cloud/dsh-pet/blob/main/MAKE-YOUR-OWN-PET.md)约定 10 秒绿幕动作、16:9、角色位置与大小固定、首尾正面站姿；sleep start/loop/end 有接缝例外。原始 MP4 需去背景/转透明视频，不能把绿幕源当透明成品；macOS 还有 MOV 路线。
- dsh-dafeiyu SHA `084323845ab82b68d5388d5c638bec09d8544a8a`，最近 commit 2026-10-29；README 标 16 clips / 3,444 WebP 帧、24 fps、412×344。
- `assets/pet-manifest.json:1–80` 有 formatVersion、characterId、maxFrameWidth/Height、clips 帧路径，assetSource 明记 dsh-pet commit `549fff2ea33c2acfb16612c76912c6137da4a758`、24 fps、crop `[100,0,412,344]`、WebP quality 68，便于复现来源。
- [ASSET_LICENSE.md](https://github.com/QCYTSN/dsh-dafeiyu/blob/main/ASSET_LICENSE.md)把当前运行帧称为上游 MIT，另将 legacy/dafeiyu 与社区拖拽姿势排除/单审。此声明与当前上游的基础形象 NC-SA 条款存在实质冲突；可能牵涉历史版本授权，**本轮不能裁定旧素材是否另有有效授权**。公开分发前需核历史授权及角色权利人确认，不能挑宽松的一条写进清单。

### 3. 低风险特色素材与 Live2D

- [Kenney Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon)：官方页标 CC0、16×16 tiles、130 files。适合作为非品牌特色像素角色的来源。当前未下载包、未确认具体角色/动作和图片布局，因此 v1 写“CC0 包中待挑选的实际角色”，不捏造已有完整 slime/knight 动画。
- [OpenMoji robot](https://openmoji.org/library/emoji-1F916/)：官方提供 [彩色 SVG](https://openmoji.org/data/color/svg/1F916.svg)、[黑白 SVG](https://openmoji.org/data/black/svg/1F916.svg)与 PNG；艺术 CC BY-SA 4.0。署名与对改编作品的 SA 要保留，不能说 CC0；静态 icon 不等于现成多动作桌宠，呼吸/眨眼等需制作。
- Live2D 官方 [Sample Model Terms](https://www.live2d.com/eula/live2d-sample-model-terms_en.html)和 [Free Material License v1.6](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html)已读：Original Characters 与 Collaboration Characters 条款不同，前者个人/小企业的使用范围较宽，但存在用户规模/下载页条件/署名要求；后者商业、改动、分发限制更严。通用协议 §4.1.1 对向第三方提供 Material 有限制，不是随便把 raw 模型打进应用。
- 原创样例、联名角色、Miku/Unity-chan 等外部授权角色须分别核；不以“官网免费下载”推出 CC0/无限再分发。Cubism Core/SDK、Web wrapper 与模型素材是不同许可层，本轮未完成 SDK 发布许可审核。**v1 暂不引入 Live2D**，已有 WebM/atlas 能满足需求时不加 WebGL runtime 与许可负担。

## 四、Electron 接入判断、汇总表与形象库 v1

### 接入难度：优先复用宿主，不复用第二套 Agent

现有 Hivebot 是 Electron 主壳 + 自有 renderer-grok + backend-only dsh；DSH 的 `shell.overlay` 插件并不自动接进这个 renderer。下表是基于格式和现有架构的技术判断，不是完成了集成测试。

| 格式 | 进入透明 Electron 窗的难度 | 最小路线与明确限制 |
|---|---|---|
| 现有 Grok inline SVG | 低 | 复用 character 组件、CSS/rAF；轻、可换色。重构来源许可与外发另审 |
| Petdex WebP/PNG atlas | 低 | `<div background-position>` 或 Canvas 按 clip 行推进；适配版本、有效帧数、缩放与 alpha；不是普通 animated-WebP |
| VP9 alpha WebM | 低至中 | `<video muted playsinline>` + 透明背景，边界后切片；必须在目标 Electron/OS 验证 alpha、解码与功耗。高分辨率 60 fps 不一定值得默认全开 |
| WebP 独立帧目录 | 中 | Canvas/ImageBitmap 按 clips 预载相邻帧；24 fps 可复用既有帧包，但数千文件、解码内存和安装体积需量测，不一次全解码 |
| 普通 animated WebP | 低显示/中控制 | `<img>` 能播，但精确暂停、跳转、状态边界较弱；不误当 Petdex atlas |
| Live2D | 高 | 新增 Cubism/WebGL 和模型状态适配，Core/SDK/模型分开许可；首版无必要 |
| WPF/Avalonia 完整应用 | 高且不推荐 | 不是可直接挂载 Electron 的组件；只移植行为规格/素材，不带入本地模型、OCR、ACP 的整套宿主 |

透明渲染 ≠ 透明区域点击穿透。Electron 需要明确窗口级穿透与角色命中策略、拖拽命中区、DPI/多屏坐标，不应在每帧无条件切整个窗口忽略鼠标。气泡与角色若分窗，要验不抢焦点、屏边避让与窗口生命周期。状态最少映射 idle / working / waiting-user / success / error / drag；缺片就回退同角色 idle，不跨角色拼凑。包导入仅接资源和数据，不执行下载包脚本，校验相对路径/体积/格式，保持 renderer 无宿主执行能力。

### 形象 × 来源 × 格式 × 许可 × 获取方式汇总

| 形象/素材 | 身份与来源 | 格式 | 已核许可/缺口 | 获取与 v1 决策 |
|---|---|---|---|---|
| Claude Code Crab | Petdex，社区像素蟹；非官方授权声明 | v1 atlas WebP + JSON | 公共元数据无 license，品牌/作者权待核 | 第一节直链；私用候选，公开包暂缓 |
| Claude酱 | Petdex / lakeofsky347，持书研究员 | v2 atlas WebP + JSON | 无 license；底层来源与作者授权待核 | 第一节直链；私用可选风格，不称官方 |
| ChatGPT Blossom | OpenAI 品牌标志 | 品牌图形 | 品牌页本轮受限；非开放角色包 | 仅品牌线索，不当桌宠包 |
| dots 黄色眼镜角色 | OpenAI 署名媒体图 | JPG 宣传截图 | 未见开放动画包/再分发条款 | 第一节媒体链接；视觉参考，不打包截图作宠物 |
| Grok Bot 几何 avatar | 现有本仓重构组件 | inline SVG + rAF | 重构仓无 LICENSE；私用参照 | 第一节绝对路径；私用 v1 直接复用 |
| GLM 社区猫耳女仆 | Petdex / beichenhaoyu | v1 atlas WebP + JSON | 无 license、非已证官方；底层 IP 待核 | 第一节直链；私用候选，外发暂停 |
| 大肥鱼 / 鲸鱼娘 | dsh-pet，溟月/DeepSeek 女仆二创 | 透明 WebM + JSONC 动作池 | 代码 MIT；角色 CC BY-NC-SA 4.0 | 第三节原仓；私用 v1 主力，保留作者/来源 |
| big-blue-fish 增强大肥鱼 | Bai-Cute，下游播放器/加工 | 106 视频；增强/兼容两档 | 代码 Apache-2.0，素材继承链须核 | 第二节原仓；UX 标尺，不能整体当 Apache 资产 |
| dsh-dafeiyu 帧包 | QCYTSN，转制 dsh-pet | WebP frames + manifest | 代码 MIT；帧素材 MIT 声明与角色 NC-SA 冲突待核 | 第三节原仓；私用技术候选，不带模糊许可外发 |
| Meta Muse avatars | Meta 官方产品 | 宣传 MP4/图片 | 无已核开放运行模型/再分发许可 | 第一节官方链接；参考，等待资产证据 |
| MuseAI 角色卡 | yejiming/MuseAI / 用户内容 | UI 图片/用户导入卡 | 插件 MIT 不覆盖角色卡插画 | 第一节仓链接；未找到通用动态角色 pack |
| Blue Boba Axolotl | Petdex 社区投稿 | atlas WebP + JSON | 样本 JSON 无 license | 第三节直链；特色备选，取得作者授权再用 |
| Tiny Dungeon 中实际角色待选 | Kenney | 16×16 tile 素材包；具体布局待取包 | CC0 | 第三节官网；外发 v1 低风险优先候选，不冒充已选定动画 |
| Robot | OpenMoji | SVG/PNG 静态 | CC BY-SA 4.0 | 第三节直链；可做有明确署名的轻动画，动画待制作 |
| Live2D 样例角色 | Live2D 官方/外部权利人 | model3/moc3 等，依包而定 | 非统一开放许可；raw 分发、规模、Core/SDK 分别核 | 第三节条款；v1 暂不选 |

### 形象库 v1 建议名单：把“能研究”和“能随 exe 发”分开

1. **私用研究 v1 主名单**：大肥鱼（WebM 优先，帧版作对照）、现有 Grok SVG、Claude Code Crab / Claude酱二选一、GLM 社区包。都显示来源标签，保留许可证/授权缺口，不宣传“各家官方吉祥物”。
2. **特色位**：OpenMoji robot（明确 BY-SA、动画待制作）优先；Kenney CC0 包中实际角色待下载挑选。Blue Boba Axolotl 在作者授权落实后再转正式候选。
3. **dots、Meta Muse、ChatGPT**：先保留“待授权素材/待原创”的目录位，**不把宣传图硬切出来当已授权宠物**，也不为了凑齐品牌而临时伪造官方角色。
4. **公开 exe 的初始清单应更小**：优先权利链清楚的 CC0、适当履行 BY-SA 的 OpenMoji，或自行原创角色；Grok 重构、Claude/GLM 社区包与大肥鱼均不能仅凭本报告进入公开发行白名单。
5. **发布门禁最少留四项**：资产源 URL + 固定 SHA/文件 hash；原作者/基础角色权利链；明确的使用/改作/再分发/商业条款；应附 NOTICE/署名与改作声明。不要把代码 MIT 存成整个 pack 的许可证。

最大许可风险：**大肥鱼上下游代码许可与角色许可混写**。dsh-pet 当前明示形象 CC BY-NC-SA 4.0，而两个下游对引入素材有 MIT 表述；在权利人/历史授权核清前，不能把“代码可商用”误报成“鲸鱼娘素材可商业随 exe 分发”。Petdex 无许可字段是第二道普遍风险；多下载几个包不会自动补齐授权。

验证与未覆盖：已目视 fish 仓配图、GLM/Claude酱 atlas、dots 媒体截图；已读上述指定源码与官方 Live2D 条款。未运行桌宠、未做 Electron 集成、未逐帧看 Muse 视频、未重解 0.78.1/0.79.3，也未代表权利人作许可裁定。本次没有产品代码变化，因此未跑产品回归；后续实现必须另开工单并验真实窗口、点击穿透、DPI 与资源占用。
