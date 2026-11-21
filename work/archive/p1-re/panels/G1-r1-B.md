# G1-r1 · 席 B（6.1 Sol）

> 主会话代录：本席运行约束禁止写文件，以下为其回报原文，未经改写。

seat: B
verdict: REVISE
confidence: high
reverse_take: 七主题与 MVP 边界基本忠实，差分路线及 Q-003 待用户确认的降级合理；最可能失败的是"新逻辑藏在旧 bundle 中，文档靠关键词命中通过，下游仍拿不到可用契约"。
findings:
- [HIGH] /home/lingxufeng/bot/work/p1-re/BRIEF.md:17,32,69 — 防漏机制只覆盖新增目录和 bundle，不能覆盖旧 bundle 内新增的子系统；D7 又只检查名称出现，没有检查实际研究归属 — 证据：W0 明定 diff 为"新增 / 删除的目录和 bundle"；/home/lingxufeng/bot/work/p1-re/RE-unpack.md:44-45,59 记录多个 MB 级聚合 bundle — 建议：增加不依赖 0.18 的一次入口扫描（进程、路由、IPC/service、扩展），每个新能力映射具体 RE 问题或非 MVP 清单行；W0 补全后才释放依赖它的任务。
- [HIGH] /home/lingxufeng/bot/work/p1-re/BRIEF.md:27,64-65 — DONE 未验收深挖答案是否完整、证据是否支持结论，字符串存在即可过关；错误的旅程方法表同样能 PASS — 证据：D2 只要求"证据："及抽样命中，D3 只检查三行存在和五个方法名命中；没有检查 §5 要求的逐题答案、版本对照及调用关系 — 建议：每题必须有答案、对照和证据，未知项显式列出；三条 MVP 旅程各核验调用方→方法→事件/返回的静态链路，关键断点未解不得 PASS。
- [MEDIUM] /home/lingxufeng/bot/work/p1-re/BRIEF.md:68 — D6 有明确命令但不等价于"非 MVP 只占表格行"，存在漏检和要求冲突 — 证据：实测该过滤器会放过 `### Q1box 深挖`，也检查不到普通正文中的深挖；§6 cloud-deps 要求推理、遥测、更新、市场、团队，D6 却只强制七个非 MVP 项 — 建议：将命令定位为辅助 lint，另逐项核验规定表格及非表格正文；Q 标题豁免应匹配完整问题编号边界。
- [MEDIUM] /home/lingxufeng/bot/work/p1-re/BRIEF.md:60,70 — D8"每节的每一行都链接回"没有定义适用单元，标题、空行、mermaid 语法行无法合理逐行链接，文件级链接又不能定位依据 — 证据：出口同时要求 mermaid 图和四节内容，D8 未排除结构行或要求具体锚点 — 建议：改为每个事实条目、图节点/关系及表格数据行带来源编号，编号映射具体 RE 小节；标题、空行、代码围栏豁免。
- [MEDIUM] /home/lingxufeng/bot/work/p1-re/BRIEF.md:24,66,89 — 市场死因识别正确，但防法止于提出替代源候选，不能证明市场确实有可用数据 — 证据：D4 写"交 scout 核实"，核实成果被放在 P2，P1 DONE 不要求核实结果返回 — 建议：出口至少引用一份已核实的公开目录样例及安装字段映射；若不可用，明确记录阻塞或待用户决策，不能把候选当作风险已关闭。
- [LOW] /home/lingxufeng/bot/work/p1-re/BRIEF.md:34-58 — 波次优先级总体合理，但 W1→W2→W3 没有列出真实依赖，容易人为串行；多 session 数据模型反而晚于 UI/协议研究 — 证据：host-ext/native 只依赖 W0 和已有地图，features 的模型问题也未声明依赖 W1 — 建议：按具体输入列依赖；清单任务可在 W0 后启动，features 的关键模型发现及时反馈 W1，无需整波等待。
