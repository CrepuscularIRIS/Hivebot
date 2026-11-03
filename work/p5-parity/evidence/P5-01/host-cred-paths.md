# P5-01 · 宿主凭证路径清单（never-roots 常量来源）

日期：2026-11-03。方法：只 `ls -d` / `stat`（存在性与大小），**不读任何文件内容**。
宿主：`lingxufeng`，uid 1000，passwd home = `/home/lingxufeng`（与 `$HOME` 同值），bwrap 0.9.0，python3 3.12。
本清单每一项都已写进 `app/sdk/src/policy/never-roots.mjs`（wrapper 与 P5-02 起的 guard 同时生效，决策 6）。

## 1. HOME 外（`HOME_OUTSIDE_NEVER` 常量）

| 路径 | 类型 | 大小 | 进常量 |
|---|---|---|---|
| `/etc/ppp/chap-secrets` | 普通文件 | 80 B | 是 |
| `/etc/ppp/pap-secrets` | 普通文件 | 1628 B | 是 |

扫描范围（`/etc /opt /srv /var/tmp` 深度 3 内 `*token*/*credential*/*.pem/*secret*/config.json`）命中的其余项均为公共 CA 证书（`/etc/pki`、`/etc/ssl/certs`）或桌面启动项（`gnome-keyring-secrets.desktop`），非凭证，未列入。`/etc/machine-id` 是机器标识非凭证，未列。

## 2. HOME 内非点目录

`/home/lingxufeng` 深度 2 内（排除 `bot` 仓与非凭证名）无命中。**空清单**——非点目录布局（如 `~/pbots-data`）由 `PBOTS_DATA_DIR` 显式传入时才存在，运行时根已由 `computeRoots(cfg.dataDirs)` 覆盖（G2-r2 B-H1 的三种布局由 P5-06 ⑦ 验收）。

## 3. 工具链白名单目录内（`TOOLCHAIN_CREDENTIALS` 常量）

白名单目录（passwd home 下，三者都存在）：`miniconda3`、`.local/bin`、`.npm-global`。

| 路径 | 类型 | 大小 | 进常量 |
|---|---|---|---|
| `/home/lingxufeng/miniconda3/.condarc` | 普通文件 | 24 B | 是 |
| `/home/lingxufeng/miniconda3/etc/aau_token` | 普通文件 | 22 B | 是 |

两项即 PLAN v2.1 点名的已知项（「24 / 22 字节」实测吻合）。whitelist 内未再发现其他凭证形文件。

## 4. 点目录类别核对（决策 13 ① v1 清单，进 `CREDENTIAL_HOME_ENTRIES`）

实存：`.ssh` `.gnupg` `.npmrc` `.config/gh` `.grokbot` `.claude` `.claude.json` `.codex` `.cli-proxy-api`（后三者由 `.claude*` 前缀与软遮蔽覆盖）。
不存在：`.aws` `.kube` `.docker` `.netrc` `.git-credentials` `.pypirc`；`.config/**/credentials*` 受限递归无命中。类别常量按决策 13 ① 全列（含不存在项，供 guard 匹配与本机外部署）。

## 附：与 wrapper 的对接

- 文件根（§1、§3 四项）：初始遮蔽与再遮都用 `--ro-bind /dev/null` 覆盖——`test -e` 仍为 0、`test -s` 为 1（验收 ②/⑨ 的探针口径）。
- 工具链挂回后 `.condarc` / `aau_token` 由再遮步骤重新盖掉（v2.1 G2-r2 #2）。
