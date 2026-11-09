
## 2026-11-09 追加（用户）：打磨场景要自己去逆向找，不靠用户讲述
> 不是, 是有很多类型的. 去看看把这些打磨场景的去做一下. 然后Grok Bot本身是包含这些功能的, 就是不知道为什么我们没有集成, 我不希望是我自己去讲述. 你逆向Grok Bot本身的内容也是可以看到的.

**定调**：**原版即规格**——系统性地逆向我们手里的 0.79.3 recovered 源码（app/ui/renderer-grok/frontend/src/recovered/，332 文件），穷举原版功能面，逐一对照我们 overrides/shim 的接线现状，找出「原版有、我们没集成」的完整清单，然后按场景打磨落地。用户不再逐个讲述。

## 2026-11-09 追加二：桌宠实装 + 形象汇总 + Windows exe 分发（用户）
> 可以加入试试看, 然后代替原来的bot效果? 然后看看有没有claude, glm, chatgpt类似的形象. 最好是一个汇总.比如这种Repo就很nice, 前端打磨效果不错. big-blue-fish-desktop-pet. 然后这个什么登录的我们不需要, 我们知道把一些grok bot, deut, dots, muse都有的放进来. 然后再打磨一些特色的宠物之类的内容. 然后你看看能否模仿一个dsh类似的安装内容. 做一个windows 的exe启动包. 后续我会在windows连接到Ubuntu去测试之类的.

**拆解**：
1. **桌宠实装**：试装 dsh-pet 类（代替/叠加原 bot 状态呈现——bot 干活时宠物有动作）
2. **形象汇总**：claude/glm/chatgpt/grok/dots/muse 各家 AI 形象资产盘点（big-blue-fish-desktop-pet 前端打磨参考）——汇总成一个形象库
3. **去登录**：不要社区登录类功能，直接收录各家都有的形象
4. **特色宠物打磨**：自有内容
5. **Windows exe 启动包**：模仿 dsh 的安装体验，Electron 打 Windows 安装包——用户将在 Windows 连接 Ubuntu 后端测试（接 SSH 远端架构）
