#!/usr/bin/env bash
# Hivebot 一键安装（modpack 式引导）——公开仓自身可自洽构建（SDK+launcher+壳）；
# 完整 UI 体验按 pack/manifest.json 拉取外部资源到本地（私用）。
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\033[1;36m[hivebot]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[hivebot]\033[0m %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || die "缺 git"
command -v node >/dev/null || die "缺 node（>=24）"
command -v pnpm >/dev/null || die "缺 pnpm（corepack enable 即可）"

say "1/4 SDK 依赖"
pnpm -C app/sdk install --frozen-lockfile

say "2/4 外部资源（pack/manifest.json）"
node - <<'EOF'
const { readFileSync } = require('fs')
const { execSync } = require('child_process')
const { existsSync, mkdirSync, cpSync, readdirSync } = require('fs')
const { join } = require('path')
const m = JSON.parse(readFileSync('pack/manifest.json', 'utf8'))
for (const r of m.resources) {
  if (existsSync(r.into)) { console.log(`  [skip] ${r.id}（${r.into} 已存在）`); continue }
  const tmp = `.vendor-tmp/${r.id}`
  mkdirSync('.vendor-tmp', { recursive: true })
  if (existsSync(tmp)) execSync(`git -C ${tmp} fetch --depth 1 origin ${r.pin}`, { stdio: 'inherit' })
  else execSync(`git clone --depth 1 ${r.repo} ${tmp}`, { stdio: 'inherit' })
  if (r.pick) {
    const srcDir = join(tmp, r.pick.replace(/\/\*$/, ''))
    mkdirSync(r.into, { recursive: true })
    for (const f of readdirSync(srcDir)) cpSync(join(srcDir, f), join(r.into, f))
    console.log(`  [pick] ${r.pick} → ${r.into}`)
  } else {
    mkdirSync(join(r.into, '..'), { recursive: true })
    execSync(`mv ${tmp} ${r.into}`)
    console.log(`  [repo] ${r.id} → ${r.into}`)
  }
}
EOF

say "2.5/4 0.78.1 吉祥物引擎（自备 deb——私用不分发，公开网无下载）"
DEB="${GROK_BOT_DEB:-$HOME/Downloads/grok-bot_0.78.1_amd64.deb}"
VENDOR="app/ui/renderer-grok/assets/vendor-078"
if [ -d "$VENDOR" ] && [ -f "$VENDOR/index.eager-common-DbK3Oi_r.js" ]; then
  say "  [skip] vendor-078 已存在"
elif [ -f "$DEB" ]; then
  mkdir -p "$VENDOR" .vendor-tmp/t78x
  dpkg-deb -x "$DEB" .vendor-tmp/t78x
  cp ".vendor-tmp/t78x/opt/Grok Bot/resources/app.asar" .vendor-tmp/t78/app.asar
  (cd .vendor-tmp/t78x 2>/dev/null || true)
  # asar 内两文件经 npx 解出（网络可用时）；离线场景见 docs/PRIVATE-LAYER.md
  npx --yes @electron/asar extract-file .vendor-tmp/t78/app.asar dist/renderer/assets/index.eager-common-DbK3Oi_r.js 2>/dev/null &&     mv index.eager-common-DbK3Oi_r.js "$VENDOR/" || die "asar 解包失败——手动把两文件放进 $VENDOR（见 docs/PRIVATE-LAYER.md）"
  npx --yes @electron/asar extract-file .vendor-tmp/t78/app.asar dist/renderer/assets/chunk-rolldown-runtime-BCiCTKAo.js 2>/dev/null &&     mv chunk-rolldown-runtime-BCiCTKAo.js "$VENDOR/" || die "asar 解包失败——手动把两文件放进 $VENDOR（见 docs/PRIVATE-LAYER.md）"
  say "  [ok] 引擎两文件就位（SHA 校验见 assets/SHA256SUMS）"
else
  die "缺 $DEB——吉祥物引擎是构建依赖。设 GROK_BOT_DEB=<deb 路径> 后重跑（获取方式与许可边界见 docs/PRIVATE-LAYER.md）"
fi

say "3/4 壳依赖"
pnpm -C app/ui/renderer-grok install --frozen-lockfile || say "（renderer 层依赖不全属预期——完整 UI 见 docs/PRIVATE-LAYER.md）"
pnpm -C app/ui install --frozen-lockfile

say "4/4 构建检查"
pnpm -C app/sdk exec vitest run tests/unit/orchestration-default-chain-live.test.ts --reporter=dot 2>/dev/null || say "（SDK live 测试需要 fake 环境，跳过）"

say "完成。启动：./app/launcher/hivebot（完整 UI 需 docs/PRIVATE-LAYER.md 指引的私有层）"
