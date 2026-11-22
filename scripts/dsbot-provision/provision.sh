#!/usr/bin/env bash
# provision.sh —— DS-Bot 预配置安装器（goal-15d2a544）
# 把 R1-R18 验证过的 SuperAgent 接入配方（litellm provider + agent-default-model +
# 插件条目 + pnpm 安装）应用到目标 home，执行后直接得到完整产品体验
# （kickoff 人格 + 多 bot 编排 + 崩溃自愈）。
#
# 用法：
#   provision.sh <home> [--state-dir DIR] [--base-url URL] [--model ID] [--superagent-src DIR]
#     <home>            目标 home 目录（.ds-bot 将建在其下；通常为 AppImage 隔离 HOME）
#     --state-dir       SuperAgent 状态目录（默认 <home>/.ds-bot/superagent-state）
#     --base-url        LLM 网关（默认 http://127.0.0.1:4001/v1）
#     --model           默认模型 id（默认 glm-5.3-flash）
#     --superagent-src  superagent 包源（默认 <repo>/app/superagent）
#
# 前置：目标引擎须已首启一次（产 profiles/ds-bot/cordis.patch.yml 骨架）——
#       若无骨架则本脚本自行生成首版骨架由模板覆盖。
# 验收：scripts/fresh-boot.sh（四断言 A1/A1.5/A2/A3/A4）。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="$REPO_ROOT/scripts/dsbot-provision/cordis.patch.template.yml"

HOME_DIR=""
STATE_DIR=""
BASE_URL="http://127.0.0.1:4001/v1"
MODEL_ID="glm-5.3-flash"
SUPERAGENT_SRC="$REPO_ROOT/app/superagent"

while [ $# -gt 0 ]; do
  case "$1" in
    --state-dir)      STATE_DIR="$2"; shift 2 ;;
    --base-url)       BASE_URL="$2"; shift 2 ;;
    --model)          MODEL_ID="$2"; shift 2 ;;
    --superagent-src) SUPERAGENT_SRC="$2"; shift 2 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *)  if [ -z "$HOME_DIR" ]; then HOME_DIR="$1"; shift; else echo "extra arg: $1" >&2; exit 2; fi ;;
  esac
done
[ -n "$HOME_DIR" ] || { echo "usage: provision.sh <home> [flags]" >&2; exit 2; }
[ -f "$TEMPLATE" ] || { echo "template missing: $TEMPLATE" >&2; exit 2; }
[ -d "$SUPERAGENT_SRC" ] || { echo "superagent src missing: $SUPERAGENT_SRC" >&2; exit 2; }

DSH_HOME_DIR="$HOME_DIR/.ds-bot"
PROFILE_DIR="$DSH_HOME_DIR/profiles/ds-bot"
STATE_DIR="${STATE_DIR:-$DSH_HOME_DIR/superagent-state}"
[ -n "${DSH_LITELLM_API_KEY:-}" ] || { echo "DSH_LITELLM_API_KEY not set" >&2; exit 2; }

# 0) superagent 构建产物校验/构建（纠错轮 Codex 审查 #3：干净 checkout 无 lib/——安装器不能依赖本机已构建产物）
# 纠错轮二（Codex 复测 #4）：干净导出树 devDependencies 也不在（tsdown: not found）——
# build 前先 npm install 装齐 devDeps（registry 注入让被墙环境可达），--ignore-scripts 防生命周期脚本。
ENTRY="$SUPERAGENT_SRC/lib/index.js"
if [ ! -f "$ENTRY" ]; then
  echo "building superagent (lib/ missing)..."
  ( cd "$SUPERAGENT_SRC" && npm install --ignore-scripts --no-audit --no-fund ${NPM_CONFIG_REGISTRY:+--registry="$NPM_CONFIG_REGISTRY"} >/dev/null 2>&1; npm run build >/dev/null ) \
    || { echo "FAIL: superagent build (npm install + tsdown)" >&2; exit 1; }
fi
[ -f "$ENTRY" ] || { echo "FAIL: superagent entry missing after build: $ENTRY" >&2; exit 1; }

mkdir -p "$PROFILE_DIR" "$STATE_DIR"

# 1) 渲染 patch yml 到临时文件（纠错轮：失败不得覆盖原配置——安装成功才原子替换）
esc() { printf '%s' "$1" | sed -e 's/[&/]/\\&/g'; }
PATCH_TMP="$PROFILE_DIR/cordis.patch.yml.provision-tmp"
sed -e "s/__STATE_DIR__/$(esc "$STATE_DIR")/g" \
    -e "s/__DATA_DIR__/$(esc "$DSH_HOME_DIR")/g" \
    -e "s/__BASE_URL__/$(esc "$BASE_URL")/g" \
    -e "s/__MODEL_ID__/$(esc "$MODEL_ID")/g" \
    "$TEMPLATE" > "$PATCH_TMP"

# 2) 安装 superagent 插件包进 profile（registry 镜像——npm 直连被墙）
#    （纠错轮：重跑遇到缺入口的包目录时删除重装，不返回假成功）
if [ ! -f "$PROFILE_DIR/node_modules/dsh-superagent/lib/index.js" ]; then
  [ -d "$PROFILE_DIR/node_modules/dsh-superagent" ] && rm -rf "$PROFILE_DIR/node_modules/dsh-superagent"
  ( cd "$PROFILE_DIR" && pnpm add "file:$SUPERAGENT_SRC" --registry=https://registry.npmmirror.com >/dev/null ) || {
    rm -f "$PATCH_TMP"; echo "FAIL: superagent install (原 patch 未动)" >&2; exit 1; }
fi
[ -f "$PROFILE_DIR/node_modules/dsh-superagent/lib/index.js" ] || {
  rm -f "$PATCH_TMP"; echo "FAIL: installed package entry missing" >&2; exit 1; }

# 3) 安装全成功——原子替换 patch（失败路径在上面已 return，原配置保持完整）
mv -f "$PATCH_TMP" "$PROFILE_DIR/cordis.patch.yml"

# 3) skills/ 目录必须随包（packaged() 运行时校验 skills/dsh-superagent-feishu/SKILL.md）
if [ -d "$SUPERAGENT_SRC/skills" ] && [ ! -d "$PROFILE_DIR/node_modules/dsh-superagent/skills" ]; then
  cp -r "$SUPERAGENT_SRC/skills" "$PROFILE_DIR/node_modules/dsh-superagent/skills"
fi

# 3) 注册 bundle 层：引擎只对 dsh.profile.bundles 列出的包应用包内 cordis.patch.yml
#    （profile-boot: bundle layers → cordis.patch.yml → --patch）。pnpm 直装不走插件管理器的
#    reconcile，不注册的话瘦身模板的 id-targeted override 无锚点，插件静默不激活（2026-11-22 实证）。
node -e '
const fs = require("fs"); const p = process.argv[1];
const m = JSON.parse(fs.readFileSync(p, "utf8"));
m.dsh ??= {}; m.dsh.profile ??= {}; m.dsh.profile.bundles ??= [];
if (!m.dsh.profile.bundles.includes("dsh-superagent")) {
  m.dsh.profile.bundles.push("dsh-superagent");
  fs.writeFileSync(p, JSON.stringify(m, undefined, 2) + "\n", { mode: 0o600 });
  console.log("  bundle:  registered dsh-superagent into dsh.profile.bundles");
}' "$PROFILE_DIR/package.json"

# 4) 崩溃自愈前置：清 stale 锁（kill -9 残留——runtime.ts 已有重试，这里双保险）
rm -f "$DSH_HOME_DIR/bot/state.lock" 2>/dev/null || true

echo "provisioned: $HOME_DIR"
echo "  patch:   $PROFILE_DIR/cordis.patch.yml ($(grep -c 'id:' "$PROFILE_DIR/cordis.patch.yml") id refs)"
echo "  plugin:  $PROFILE_DIR/node_modules/dsh-superagent"
echo "  state:   $STATE_DIR"
echo "next: restart the engine with HOME=$HOME_DIR, then run scripts/fresh-boot.sh to verify."