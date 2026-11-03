# G2-r2 · 席 B（6.1 Sol）

> 代录，未经改写（席 B 运行约束禁写文件，主会话机械转录自其最终回报，2026-11-03）

seat: B
verdict: REVISE
confidence: high
reverse_take: 最可能的事故是非缺省数据目录漏遮蔽，或联网后通过用户态网络栈的宿主别名访问本机服务；保留 WARN 可以，但不能把未经验证的布局当作安全边界。
findings:
- [HIGH] /home/lingxufeng/bot/work/p5-parity/PLAN.md:24–27,79,182 — MASK 缺省论证只证明了默认 `~/.config` 布局，不能支持所有布局正常启用自主执行 — 证据: 决策13对文件工具默认拒的是 HOME **点目录**，不是整个 HOME；因此未设 MASK、数据目录为 `~/pbots-data` 时，授权文件和其他 bot 工作区并不自动命中规则，P5-06⑦却要求「HOME 内仍 deny」；HOME 外缺口则仅记 WARN 后允许验收通过。后者也直接影响决策16所依赖的 policy-state 防写保护 — 建议: 正式启动入口从同一份 PBOTS_DATA_DIR 自动传 MASK；保留独立 SDK 的 WARN 兼容，但未证明数据根被覆盖时不得启用 ALWAYS；补 HOME 内非点目录、HOME 外两格，均要求拒读写，而非只记录缺口。
- [HIGH] /home/lingxufeng/bot/work/p5-parity/PLAN.md:99,135–142 — D-1 已补安全不变量，但 P5-22 的联网验收仍会漏掉宿主 loopback 别名 — 证据: 目前仅测沙箱内 `127.0.0.1` 三端口；候选 slirp4netns 的官方文档明确说明，宿主 loopback 监听默认可经 gateway `10.0.2.2` 访问，并提供 `--disable-host-loopback`。因此三个 errno 111 可以全部通过，同时宿主服务仍可达 — 建议: 选①/⑤时，强制关闭所选网络组件的宿主 loopback 映射，并用宿主侧自建 stub 验证 gateway/host 别名与直接地址都不可达；代理方案则验证出口拒绝回环及私网目标。
- [MEDIUM] /home/lingxufeng/bot/work/p5-parity/PLAN.md:15,74 — wrapper 文件不存在那格仍要求无法由该 wrapper 产生的错误前缀 — 证据: 运行方式是 `/usr/bin/python3 -I <wrapper>`；脚本缺失时 Python 在加载脚本前报错，脚本自身无法补 `bwrap: `，而⑤统一要求输出含该前缀 — 建议: 缺失格接受并匹配 Python 的加载失败诊断；内部异常格继续要求统一前缀，两格都保留「命令未执行」断言。
核验记录：9 条 HIGH 均有逐条回应；原 #1/#2/#5/#6/#7/#8/#9 的计划级闭环成立，#3 尚不充分，#4 须补上述别名验收。决策16已补跨进程损坏/恢复路径；never-roots 单一来源成立；新增依赖未见循环；D-1 五选项及②不可行标注基本中立。
未落盘：当前评审席运行约束禁止写报告文件；以上为完整评审，请主会话原样代录并标注。
