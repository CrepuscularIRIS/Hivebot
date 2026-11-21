# sandbox/bin · 受控联网 helper 二进制

## slirp4netns（静态官方 release）

- 来源: https://github.com/rootless-containers/slirp4netns/releases/download/v1.3.7/slirp4netns-x86_64
- 版本: v1.3.7（2026-10-30 发布；commit 7ea080d8635bc85487e232ec178701c6864151c9，libslirp 4.9.7）
- sha256: `1c177694fe6bf299debfd8ff601a2ee3c4f7554d9983acdf1f854a6b34d53e70`
  （与官方同目录 `SHA256SUMS` 一致；本仓复核命令：`sha256sum app/sdk/sandbox/bin/slirp4netns`）
- 许可证: GPL-2.0-or-later（上游仓 COPYING；静态链接含 libslirp LGPL-2.1-or-later、libseccomp LGPL-2.1）。私用不分发（CLAUDE.md §4），将来对外分发时整体重审。
- 用途: P5-22 受控升权路径（D-1 定稿 ⑤）——wrapper（`../bwrap-wrap.py`）宿主侧 supervisor 在许可命中时
  以 `--configure --disable-host-loopback --disable-dns --exit-fd … --ready-fd …` 加入 bwrap 的
  user/net namespace 提供 NAT 出口；helper 失败 fail closed。
- 升级: 换版本时同步更新本文件的版本 / sha256 / 许可证行，并在官方 release 页核对 SHA256SUMS。
