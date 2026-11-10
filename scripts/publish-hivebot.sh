#!/usr/bin/env bash
# publish-hivebot.sh —— 把私仓的「可公开层」同步到公开仓 CrepuscularIRIS/Hivebot。
# 白名单=排除式（--exclude 之外全推）；每次全量 rsync（幂等）。跑完自己 cd 进去 commit+push。
# 排除的法律依据见 docs/LICENSE-SCOPE.md（0.18 移植树无许可证 / 桌宠形象 CC BY-NC-SA / 内部工单）。
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="${1:?用法: publish-hivebot.sh <公开仓工作目录>}"

RSYNC_EXCLUDES=(
  # ── 法律排除（不可分发）──
  '--exclude=app/ui/renderer-grok/frontend'      # 0.18 移植树（无许可证）
  '--exclude=app/ui/renderer-grok/source'        # 0.18 移植协议层（含上游代码）
  '--exclude=app/ui/renderer-grok/assets'        # 0.18 运行时资产
  '--exclude=app/ui/renderer-grok/harness'       # 含上游产物的截图对照台
  '--exclude=app/ui/pet/assets'                  # 桌宠形象 CC BY-NC-SA（代码保留，资产 install.sh 拉）
  # ── 内部/体积排除 ──
  '--exclude=work'               # 工单/回执/证据（内部流程）
  '--exclude=docs'               # 内部文档
  '--exclude=repos'              # 只读参考仓
  '--exclude=scripts'            # 内部脚本（bot-reap 等）——publish 脚本单独拷
  '--exclude=.claude' '--exclude=.codegraph' '--exclude=.git'
  '--exclude=node_modules' '--exclude=coverage' '--exclude=out' '--exclude=dist-app'
  '--exclude=.build' '--exclude=.dsh' '--exclude=evidence' '--exclude=test-results' '--exclude=test-output'
  '--exclude=*.log' '--exclude=.test-homes'
  '--exclude=app/ui/renderer-grok/.build'
  '--exclude=CLAUDE.md'          # 私有主控文件
)

rsync -a --delete "${RSYNC_EXCLUDES[@]}" "$SRC"/ "$DST"/
# 顶层面板：install.sh、pack/、docs-public→docs/、LICENSE
cp "$SRC/install.sh" "$DST/install.sh" && chmod +x "$DST/install.sh"
rm -rf "$DST/docs" && cp -r "$SRC/docs-public" "$DST/docs"
cp "$SRC/docs-public/README.md" "$DST/README.md"
cp "$SRC/docs-public/LICENSE" "$DST/LICENSE"
# publish 脚本自身进公开仓（供复现发布）
mkdir -p "$DST/scripts"
cp "$SRC/scripts/publish-hivebot.sh" "$DST/scripts/"
echo "同步完成 → $DST（cd 进去 git add -A && git commit && git push）"
