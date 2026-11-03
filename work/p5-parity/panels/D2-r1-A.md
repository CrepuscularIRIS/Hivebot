seat: A
vote: ③（次选：② 的变体 ②'，见 F4）
confidence: medium
findings:
- [HIGH] PLAN §5 D-2 ③ / P5-21 ⑥ / P5-24 ⑧ / QUESTIONS.md:130-132 — 选 ③ 后连接器落第 7 行还是第 8 行，四处写法互相矛盾 — 证据: D-2 ③「连接器工具一律第 8 行」与 P5-21 ⑥「全部按第 8 行出卡」一致；但 Q-013 第 6 行「桥接前一律按第 7 行」、第 7 行「桥接前所有连接器按本行」、P5-24 ⑧「③ 时 = 全部连接器工具」都把它们当作可以始终允许的写工具；Q-013 第 8 行又写「否 = 桥接前任何连接器都拿不到 always」。三处说法会互相推翻：如果 ③ 落第 8 行，且第 8 行答「否」，那么 P5-24 没有一个合法的 eventId，整个常驻授权存储和身份桥都是死代码 — 建议: 在 Q-013 里把这个组合当作一个显式选项交给用户：(i) ③ 落第 7 行，始终允许的资格按 bot × 工具给，卡片注明「该连接器未声明是否破坏性」，由用户判断，不靠 hint（本席推荐，符合「bot 自己完成」的方向）；(ii) ③ 加第 8 行「否」，即连接器永远出卡，本 slug 砍掉 P5-24、身份桥和 M1 alwaysAllow，这是最省的做法。不允许出现两套文档各写一半的状态。
- [HIGH] 选项 ② / Q-013 第 6 行 — 第 6 行把未沙箱化进程的自报值当作放行依据，失败方向是 fail-open — 证据: 已装 SDK `app/sdk/node_modules/.pnpm/@modelcontextprotocol+sdk@1.15.1/.../dist/esm/types.d.ts:15281-15286` 原文「all properties in ToolAnnotations are hints … Clients should never make tool use decisions based on ToolAnnotations received from untrusted servers」；Q-013 背景 ⑤ 写明连接器进程不在沙箱里。server 只要自报 `readOnlyHint=true`，就会得到 asked === 0 的静默放行，这一点任何测试都堵不住（P5-23 ② 只测了「参数里伪造」，没有测「server 自己报假值」）— 建议: 本 slug 不让 annotations 放宽任何档位。将来如果要做，hint 只允许用来收紧（destructive → 不给 always），或者只对用户在设置里标为可信的 server 生效。
- [MEDIUM] 选项 ② 第 7 行「未标注 → 写」 — 与 MCP 规范的默认值相反 — 证据: 同文件 `types.d.ts:15305`，destructiveHint 的说明为「Default: true」（readOnlyHint=false 时才有意义）。按规范，未标注的非只读工具默认就是破坏性的，应落第 8 行；照 PLAN 的写法，大多数不写 annotations 的 server 都会落进可始终允许的一档 — 建议: 如果以后做 ②，按规范的默认值归档。
- [MEDIUM] PLAN D-2 ③「身份子集 = publicToolName 复制 + 可信 rawName 清单」 — 拿可信 rawName 清单本身就要 tools/list，和 ② 的第二连接是同一个难点，③ 照现在的写法并没有避开 ② 最难的那部分 — 证据: `reuse/d2-mcp-meta.md` §2、§5.3；`D/packages/mcp/mcp-client/src/tools.ts:131-150` 中 rawName 只存在于闭包。publicToolName（`tools.ts:68-86`）是 `(serverName, rawName)` 的确定性函数，有损时会带 sha256 — 建议: 用更笨的键，`(botId, 已注册 publicName)`，不需要发现 rawName；serverName 用配置里的 server 清单做前缀匹配，匹配有歧义就不给 always 资格。这要修订 Q-015 ①「不用归一化 toolName」，需要用户确认。
- [MEDIUM] `tools.ts:68-86` 注释称 distinct identities never collapse — 未归一化时并不成立：server `a__b` + raw `c` 与 server `a` + raw `b__c` 都会得到 `mcp__a__b__c` — 证据: 函数体只在替换或超长时才加 hash。上游注册冲突时整代回滚（`tools.ts:141-150` 之后的 catch），所以不会静默误配，但我们自己的映射表 / 授权键会撞 — 建议: 配置校验禁止 serverName 含 `__`；映射表里同一个 publicName 出现两次时，不给授权，一律 ASK。
- [LOW] ②'（次选） — 如果用户坚持要第 6 行 ALWAYS，不要开第二连接，改为第 3 级复制 `syncTools`（`tools.ts:119-150`），在同一代切换里顺带登记一张旁表 `publicName → {serverName, rawName, annotations, generation}`。这样天然跟随 listChanged，也不多起 stdio 进程。代价是接管这个插件的生命周期（d2 §4 末句），而且仍只对用户标为可信的 server 读 hint。
reverse_take: 最可能的失败方式：选了 ②，然后被一个自报 readOnlyHint=true 的写工具静默放行，或者被第二连接的 stdio 副作用拖住整个 W1-AP。更笨更稳的做法：选 ③，以 publicName 作键，让用户在第 7 行和第 8 行之间二选一；第 8 行答「否」时，连 P5-24 也一起砍掉。

## 投票理由（≤5 行）
1. ① 现在不成立（d2 §0：(a)(b) 都是否），不选。
2. ② 换来的只有第 6 行的 ALWAYS，但依据是未沙箱进程的自报 hint，SDK 自己都写明不应凭此做决策（types.d.ts:15286）；而且它依赖一条没有实证过的第二连接。
3. ③ 的失败方向是多出卡片，属于 fail-closed，可以事后放宽；② 的失败方向是静默放行，事后无法追回。
4. ③ 加上 publicName 作键，完全不需要发现 rawName，P5-23 可以缩成「复制 publicToolName + 配置前缀匹配 + 冲突就 ASK」。

## 若选 ③，实现上最关键的一个坑
连接器落第几行，以及键用什么。第 8 行答「否」时，③ 等于没有任何 always 资格，P5-24 就是死代码，应当直接砍掉，不要照建。第 8 行允许（或 ③ 落第 7 行）时，授权键里有 rawName 就又回到「拿可信清单」这个难点。所以授权键要用已注册的 publicName，同时配置禁止 serverName 含 `__`，防止未归一化的名字相撞，导致授权串到别的 server 的工具上。

## 与 Q-013 第 8 行的相互作用
- ③ 加第 8 行「否」：连接器全部是只问不记，始终允许这一类在本 slug 里不存在，P5-24、Q-015 ① 的 alwaysAllow/list/revoke 和身份桥都可以撤掉。
- ③ 加第 8 行「是」（或 ③ 落第 7 行）：P5-24 照建，键用 publicName。
- ② 加第 8 行「否」：按规范默认值，大多数未标注的工具也会落第 8 行，始终允许几乎只剩自报 destructiveHint=false 的工具，而这又是一个自报值。② 在这个组合下最不划算。
