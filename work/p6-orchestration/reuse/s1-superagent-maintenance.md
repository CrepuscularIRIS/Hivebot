# S-1 · dsh-superagent 上游维护核验

核验时间：2026-11-03（UTC）；范围仅核验指定仓，不重新做编排框架候选选型。上游由本地 `git remote -v` 确认是 https://github.com/deepseek-ai/dsh-superagent-prototype 。参考仓保持只读，无 fetch、checkout 或产品代码修改。

## 结论与决策行

**「在维护」判定：边缘（近期提交满足；issue 回应条件无法核验，不能认证为满足第 1/2 级，但也不能据此断言停止维护）。** 应将 v1 的「不满足在维护」改成这个限定结论：仓库才公开约 3 天、只有首次导入提交，且关闭 Issues；没有「长期无人维护」或「issue 无人回应」的证据。

| 能力 | 候选（owner/repo@path 或 npm 包名） | 阶梯级别（1～5） | 许可证 | 维护（最近 commit / release） | 决策 | 理由 / 适配工作量 |
|---|---|---|---|---|---|---|
| S-1 编排原型复用的维护资格 | deepseek-ai/dsh-superagent-prototype@src、docs；npm 名 dsh-superagent | 3（暂不认证 1/2） | MIT | 2026-10-31 首次且唯一提交；无 release；Issues 关闭，回应未验证 | 改造 | 不是因「旧/归档」否定 R1；而是持续维护和回应尚无证据、作者声明非生产就绪、未发布 npm 包，并存在预发布 peer 范围不匹配。若复用，按所需文件最小搬运，来源 https://github.com/deepseek-ai/dsh-superagent-prototype@8c32a9dc5d72c033816c6a8110b37f40cf94fba4:src/（具体搬运文件另列）；本核验不授权实现或替代既有路线决策。 |

**R1（整仓原样直接集成）可维护性：2/5（调研判断，非实测分）——近期新发布且有完整代码文档，但只有一次公开导入、无公开 issue 支持和 release 节奏，加上 0.2.2-alpha.2 兼容未验证，目前不能把后续修复责任押给上游。**

## 1. GitHub 实况：新，不等于已证实持续维护

| 项目 | 2026-11-03 观察值 | 证据 |
|---|---|---|
| Stars / forks | GitHub MCP：16,253 / 1,756；数分钟内 gh API：16,254 / 1,756，热度为动态值 | [仓库 API](https://api.github.com/repos/deepseek-ai/dsh-superagent-prototype)；MCP `search_repositories(query=repo:deepseek-ai/dsh-superagent-prototype)` 与 `gh api` 交叉验证 |
| 创建 / archived | 2026-10-31T09:32:46Z；`archived=false`、`disabled=false` | 同上 |
| 最近六个月 commit | 2026-05-03 至核验时，默认 main 只有 **1** 个提交；`8c32a9dc5d72c033816c6a8110b37f40cf94fba4`，author 2026-10-31T12:05:39Z、committer 12:06:31Z；`parents=[]` 为根提交 | MCP `list_commits`、`get_commit`；[带时间过滤的 commits API](https://api.github.com/repos/deepseek-ai/dsh-superagent-prototype/commits?since=2026-05-03T00:00:00Z&per_page=100) |
| Release | 0；MCP `list_releases` 返回 `[]`，不是「很久没有 release」 | [releases API](https://api.github.com/repos/deepseek-ai/dsh-superagent-prototype/releases) |
| Issues 数 / 响应 | `has_issues=false`，`open_issues_count=0`；MCP `list_issues` 全状态 totalCount=0。**关闭 Issues，不存在可抽查的回应样本；响应能力未验证，而非观测到不回应。** | 仓库 API；[issues API](https://api.github.com/repos/deepseek-ai/dsh-superagent-prototype/issues?state=all) |
| Branch | MCP `list_branches` 仅 `main`，head 为上述根提交；未见 experiment/archive 分支名 | [branches API](https://api.github.com/repos/deepseek-ai/dsh-superagent-prototype/branches) |
| pushed_at | 2026-11-03T09:29:14Z，但默认分支仍只有 10-31 根提交；**不能用 pushed_at 当新代码提交时间** | 仓库 API + commits/branches API |

本地 HEAD 为 `6337fc823ce20251c8de8085948165c81aaa701e`，与远端当前 SHA 不同；不可把本地 SHA 当成远端现 head。已核对三个 blob 完全一致：package.json=`6afd24bce2aebd6858e37d00aab4505a070bfce3`，README.md=`39e1c4af122f11dd72ac0d2b34b79d6f8ae259ea`，LICENSE=`df5ef0e6d9cf2989975742db0a13ad15050ee89b`（本地 `git rev-parse HEAD:<path>` 与 MCP `get_file_contents` 返回值）。未对整树做一致性核验，也不推断 SHA 变化的原因。

## 2. Experiment / archive 性质

- **研究原型：是，作者明示；archive：否。** [README.md@当前 SHA](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/README.md#L3-L5) 与本地 `/home/lingxufeng/bot/repos/dsh-superagent-prototype/README.md:3-5` 写明 `Research prototype for reference only`、非官方 DeepSeek 产品、非生产就绪、需审查改造；公开版本不同于内部实现，文章部分设计尚未实现。
- 名称 prototype、单次公开导入支持「研究发布」定性，但没有维护终止承诺；不能从免责声明单独推出「不在维护」。

## 3. dsh 版本差距与 R1 实际门槛

- 上游 [package.json@当前 SHA](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/package.json#L53-L123) 与本地 `/home/lingxufeng/bot/repos/dsh-superagent-prototype/package.json:53-123` 一致：`engines.dsh=^0.2.1-alpha.2`；dsh peers 同范围，devDependencies 精确锁 `0.2.1-alpha.2`。本地 `pnpm-lock.yaml:21-26` 等也解析到该版本。Cordis 精确为 `4.0.5-alpha.1`。
- 项目当前宿主为 `0.2.2-alpha.2`，证据 `/home/lingxufeng/bot/app/sdk/package.json:21-25` 与 `/home/lingxufeng/bot/repos/deepseek-harness/package.json:3`。名义上差一个 patch 基版本（0.2.1 → 0.2.2），但这是 **alpha 依赖链，不是已验证向后兼容的小升级**。
- 用已装 `semver@7.8.5` 验证：`satisfies('0.2.2-alpha.2', '^0.2.1-alpha.2') === false`；只有显式 `includePrerelease:true` 才为 true。默认 npm semver 对不同基版本的 prerelease 不自动放行，因此不能声称当前 peers 范围已覆盖本项目 alpha 宿主。DSH 自身引擎检查是否使用 includePrerelease，本次未追踪，标未验证。
- 不只查 README：已读 `/home/lingxufeng/bot/repos/dsh-superagent-prototype/src/index.ts:2-23`，插件依赖 `agents/sessionController/sessionPersistence/workspaceRegistry/permissionPresets/tools/systemPrompt/skills/webServer/llm/subprocess`，并存在 settings 重读 workaround（14-19 行）。R1 需要锁定宿主及插件全链，并在 **0.2.2-alpha.2 的实际宿主 boot→创建/执行 Ticket→恢复/停止**，不能以 typecheck 或 package 范围替代运行证据；本次未做兼容测试，适配工时未验证。
- 部署文档另有 public 安装钉版本 `@deepseek-ai/dsh@0.2.1-rc.3`（`/home/lingxufeng/bot/repos/dsh-superagent-prototype/docs/006-deployment.md:76-83`），不是 package/lock 的 alpha 开发基线；亦不能当成已测试 0.2.2 的证据。
- npm 查询 `npm view dsh-superagent version time.modified repository --json` 返回 E404，package.json:6 也为 `private:true`；**没有核验到同名公开发布包**，可行的直接复用形式是第 2 级整仓链接/插件加载，而不是第 1 级安装此包。对照 `npm view @deepseek-ai/dsh-agent ...` 返回 latest `0.1.0-rc.6`、modified `2026-11-03T07:24:09.601Z`；这是 registry dist-tag 事实，不用它取代项目锁定的 0.2.2-alpha.2，也不据版本字面推定当前宿主过时。

## 4. 许可证与后续条件

MIT，Copyright (c) 2026 DeepSeek Harness Team；已读 [LICENSE@当前 SHA](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/LICENSE) 及本地 `/home/lingxufeng/bot/repos/dsh-superagent-prototype/LICENSE:1-21`，无许可证阻碍。按项目私用规则保留出处即可。

若后续出现真实修复提交 / release 及可验证的维护者响应渠道，再重新评估第 2 级；目前「边缘」是证据不足的谨慎结论，不是要求等待六个月、不是认定弃坑，也不构成自建许可。此次仅核验指定上游，未另找候选或改动 MANIFEST（已存在记录）。
