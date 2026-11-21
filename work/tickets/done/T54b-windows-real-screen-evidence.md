# T54b：T54 返修——用真实屏幕像素（VNC）取证原生窗口层，改正结论

> 开单：manager (Opus 5.5) | 日期：2026-11-11 | 施工：main (GLM 5.3)
> 来源：`receipts/T54.acceptance.md` G1–G4（T54 第 1 次不通过）
> 分支 / 作业目录：集成分支，只加 `work/ui-polish-win/evidence/T54/`（子目录 `screen/`）
> claimed：2026-11-11 main (GLM) @ 9c76cef1
> blocked：2026-11-11 manager 任务 C（已解除）
> accepted：2026-11-11 2e57c35b（manager 任务 B，以 T54c 第三轮证据关闭：窗口层无错位；见 receipts/T54.acceptance.md §6）

## 目标
回答一个问题：**在 Win11 VM 的真实屏幕上，用户看到的「错位」是什么**——页面内容有没有被裁、被任务栏压住、被原生窗口控件（—□×）盖住、标题栏区域与原版是否不同。用屏幕像素说话，不用 CDP 页面截图推。

## 怎么做
1. 唤醒 VM 显示：`vncdo -s :5 key shift`（只发这一类无害按键），再 `vncdo -s :5 capture`；全黑就再试一次并记录。
2. 每屏整屏 VNC 截图（`screen/<屏>.vnc.png`，1280×800 原尺寸），屏同 T54 的 01 / 02-rail / 04 / 05 / 06 / 07 / 10（900×600 窗口化，非最大化）；用 T54 的 CDP 驱动切状态，再用 VNC 拍。最大化与非最大化各拍一张 01。
3. **窗口控件定位**：在 01 的 VNC 图上量出 —□× 三钮与标题栏 / 叠层区域的像素框；同时用 CDP 取页面里落在该区域内的元素（`document.elementsFromPoint` 扫该框）——列出被盖住的页面元素（若有）。
4. **边缘检查**：VNC 图上量页面最左列、最右列、最底行（任务栏上沿）是否是应用像素、是否有内容被截（对照 CDP 同屏截图逐边比对，贴裁切条）。
5. 02-rail：折叠钮选择器按 0.78.1 侧栏头部 icon 行（`work/p5-parity/RE-visual-078-values.md` 结论 ①）与我们 DOM 实际改写，两平台补采。
6. 改写 `MATRIX.md`「核心错位 A」行：用新证据重写现象与原因类；`win-metrics.json` 的 −8 / 1296 若证实是不可见边框，明确写「非错位」。新增「原生窗口层」一节：控件位置、尺寸、是否盖住内容、标题栏背景色与应用顶部是否接缝。
7. 收尾同 T54（无调试端口残留）。

## 边界
1. 只新增 / 修改 `work/ui-polish-win/evidence/T54/`（含 `screen/`、`MATRIX.md`）与 `work/tickets/receipts/T54b.receipt.md`。不改 `app/**`、不改 VM 系统设置。
2. MATRIX 里每条「证据」列写的图，必须在图上看得到所说的东西；看不到就不许写。

## 验收（写命令，不写感觉）
1. `ls /home/lingxufeng/bot/work/ui-polish-win/evidence/T54/screen/*.vnc.png | wc -l` → ≥ 8；经理 Read 逐张看，非黑屏、是 1280×800、应用在前台。
2. `python3 -c "from PIL import Image;im=Image.open('<01 最大化 vnc>');print(im.size)"` → `(1280, 800)`。
3. MATRIX「原生窗口层」节有：三钮像素框、被盖元素清单（可为空，但要写「扫描框 … 无元素」）、四边裁切检查结论各一行，每行附图名。
4. 02-rail 两平台 json + png 存在。
5. VM 收尾：同 T54 验收 5（9229 无监听）。
6. `git diff --stat <claimed>..HEAD` 只含边界 1。

## 为什么这样验收
T54 证明了页面 CSS 两平台一致——这很有用，等于说错位不在我们的布局代码里。剩下的嫌疑全在「页面之外」：原生窗口控件、标题栏、最大化边框、任务栏。这一层 CDP 天然看不见，只能看屏幕像素。验收逼着每条结论都对得上一张能看到问题的图，防止再出现「数据说内容刚好铺满、结论却说溢出」的情况。

## 产出
- `work/ui-polish-win/evidence/T54/screen/`、改写的 `MATRIX.md`、`work/tickets/receipts/T54b.receipt.md`
