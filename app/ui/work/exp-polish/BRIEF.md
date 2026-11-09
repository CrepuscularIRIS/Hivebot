# BRIEF：体验打磨轮（2026-11-09，用户）

## 用户原话
> 我这怎么在ui里面点击里面, 就显示2个, 而且worker还在跳跃? 这个是不合理的. 然后一一去测试剩下的, 比如computer use, browser use的显示回传等等一系列的问题. 他会交付电脑. 之前我们scout是否把muse, dots, grokbots, claude deut的所有功能都统计出来了呢? 我们把一一去和dsh的比较或的stars比较高的差价去匹配. 然后稍微修改一下系统提示词. 现在有很多很火的dsh的桌面宠物. 后面我们也可以基于这个去探索一下, b站上很火. 社区也是同理. dsh有很多比如房间, 桌面宠物互动等等一系列的内容. 扩展一下, 不然还是基本的UI. 我们推迟一下ssh的问题. 先打磨体验

## 拆解（八项）
1. **UI bug**：Workers 分组点开只显示 2 个（生产实测 helper 已 3 个——截图旁证）+ **worker 位置跳跃**（running 状态变化导致分组间跳/重排？）——不合理，修
2. **系统性体验测试**：computer use、browser use 的显示回传（bot 操作电脑/浏览器时 UI 如何呈现过程与结果）——一一测试列问题清单
3. **scout 覆盖度审计**：muse（dsh 生态的 muse）、dots、Grok Bot、Claude Code 功能是否全统计——补缺
4. **功能匹配**：与 dsh 生态、高 stars 仓库逐功能对照匹配
5. **系统提示词微调**
6. **新方向探索**：dsh 桌面宠物（B 站很火）、房间、社区互动——扩展产品面（不然只是基本 UI）
7. **SSH 问题推迟**（T34b/断连相关后置）
8. 总基调：**先打磨体验**

## 已有底子
- research-reposcan/ 四份 scout 报告（A Claude Code 42 项/B Grok Bot+dots 竞品/C 编排/D 体验帖）
- 生产实例 Workers 分组已上线（T36）——正是用户实测发现 bug 的地方
