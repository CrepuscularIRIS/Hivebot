#!/usr/bin/env bash
# provision.sh —— DS-Bot 预配置安装器（goal-15d2a544）
# 把 R1-R18 验证过的 SuperAgent 接入配方（litellm provider + agent-default-model +
# 插件条目 + pnpm 安装）应用到目标 home。接入后 Chief 仍是 DS-Bot 原生主 bot，多 bot 编排走
# DS-Bot 原生 TEAM_TOOLS；SuperAgent 提供 watch 记账、评估与 ticket 异步兜底（2026-11-23 实测形态）。
#
# 用法：
#   provision.sh <home> [--appimage FILE | --app-dir DIR] [--state-dir DIR] [--base-url URL] [--model ID] [--superagent-src DIR]
#     <home>            目标 home 目录（.ds-bot 在其下；就是启动 DS-Bot 时用的那个 HOME）
#     --appimage FILE   DS-Bot 的 AppImage：构建与安装都用它自带的 node + pnpm（推荐，不必另装 node/pnpm）
#     --app-dir DIR     AppImage 解包目录（squashfs-root）或安装目录下的 resources/——作用同上
#     --state-dir       SuperAgent 状态目录（默认 <home>/.ds-bot/superagent-state）
#     --base-url        LLM 网关（默认 http://127.0.0.1:4001/v1）
#     --model           默认模型 id（默认 glm-5.3-flash）
#     --superagent-src  superagent 包源（默认 <repo>/app/superagent）
#                       安装时按包的 files 清单复制到 <home>/.ds-bot/superagent-src，profile 引用这份副本（挪走仓库不影响）
#
# 前置：DS-Bot 用这个 home 启动过一次并已完全退出（profile 骨架：package.json /
#       pnpm-workspace.yaml / cordis.patch.yml）——步骤 2 的 pnpm add 与步骤 3 的 bundle 注册都写在骨架上。
# 前置：能访问 npm registry（依赖按 pnpm-lock.yaml 下载，默认走 npmmirror 镜像）。
# 前置：网关 key 环境变量 DSH_LITELLM_API_KEY 要对 DS-Bot 进程本身可见——本脚本不读它的值，只把
#       变量名写进模型路由；桌面启动的 DS-Bot 看不到终端里临时 export 的值，做法见同目录 README.md 第 2 步。
# 运行时：优先用 DS-Bot 自带的 node + pnpm——给 --appimage / --app-dir；都没给时从正在运行的引擎的
#       命令行里找；都没有才退到 PATH 上的 node / pnpm（此时 pnpm 主版本必须与 profile 的 store 一致）。详见 runtime.sh。
# 幂等：重跑安全。源码变了（git pull / 重新构建）会原地重装插件；引擎原有的 patch 在首次接入前
#       备份为 cordis.patch.yml.pre-hivebot。撤销接入用同目录的 uninstall.sh。
# 验收：scripts/fresh-boot.sh（A1/A1.5/A2/A2.5/A2.7/A3/A4，全过 exit 0）。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="$REPO_ROOT/scripts/dsbot-provision/cordis.patch.template.yml"
source "$REPO_ROOT/scripts/dsbot-provision/runtime.sh"

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
    --appimage)       runtime_set_appimage "$2"; shift 2 ;;
    --app-dir)        runtime_set_app_dir "$2"; shift 2 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *)  if [ -z "$HOME_DIR" ]; then HOME_DIR="$1"; shift; else echo "extra arg: $1" >&2; exit 2; fi ;;
  esac
done
[ -n "$HOME_DIR" ] || { echo "usage: provision.sh <home> [flags]" >&2; exit 2; }
# 相对路径补成绝对路径（引擎进程的 DSH_HOME 是绝对路径，下面按它判「引擎在跑」）。
case "$HOME_DIR" in /*) ;; *) HOME_DIR="$(pwd)/$HOME_DIR" ;; esac
HOME_DIR="${HOME_DIR%/}"
[ -d "$HOME_DIR" ] || { echo "FAIL: home 目录不存在: $HOME_DIR" >&2; exit 2; }
[ -f "$TEMPLATE" ] || { echo "template missing: $TEMPLATE" >&2; exit 2; }
[ -d "$SUPERAGENT_SRC" ] || { echo "superagent src missing: $SUPERAGENT_SRC" >&2; exit 2; }

DSH_HOME_DIR="$HOME_DIR/.ds-bot"
PROFILE_DIR="$DSH_HOME_DIR/profiles/ds-bot"
STATE_DIR="${STATE_DIR:-$DSH_HOME_DIR/superagent-state}"
# 这里不检查 DSH_LITELLM_API_KEY：模型路由里只写环境变量名（apiKeyEnv），key 由 DS-Bot 进程启动时自己读。
# 真正要保证的是这个变量对 DS-Bot 进程可见（桌面启动看不到终端里临时 export 的值），见 README.md 第 2 步。
if [ ! -f "$PROFILE_DIR/package.json" ]; then
  echo "FAIL: DS-Bot profile skeleton missing: $PROFILE_DIR/package.json" >&2
  echo "  -> 先用这个 home 启动一次 DS-Bot（桌面双击 AppImage），窗口出来后完全退出，再重跑本脚本。" >&2
  exit 2
fi

# 前置：node + pnpm。优先用 DS-Bot 自带的——和引擎自己装插件是同一套工具，store 位置与 pnpm 大版本
# 天然一致（见 runtime.sh）。不走 npm：装 superagent 的依赖会 ERESOLVE（见步骤 0）。
runtime_resolve || {
  echo "FAIL: 找不到可用的 node + pnpm——加 --appimage <DS-Bot 的 AppImage 路径> 用它自带的运行时，或 npm i -g pnpm@11" >&2
  exit 2; }
runtime_describe
trap runtime_cleanup EXIT
# 引擎还在这个 home 上跑就拒绝：它的插件管理器会改写 profile，和这里对写会互相覆盖。
ENGINE_PIDS="$(runtime_engine_pids_on "$HOME_DIR")"
if [ -n "$ENGINE_PIDS" ]; then
  echo "FAIL: DS-Bot 正在这个 home 上运行（引擎 pid: $(echo "$ENGINE_PIDS" | tr '\n' ' ')）——先完全退出再重跑。" >&2
  exit 2
fi

# 0) superagent 构建产物校验/构建（纠错轮 Codex 审查 #3：干净 checkout 无 lib/——安装器不能依赖本机已构建产物）
# 纠错轮二（Codex 复测 #4）：干净导出树 devDependencies 也不在（tsdown: not found）——build 前先装齐 devDeps，
# --ignore-scripts 防生命周期脚本。
# 2026-11-24 干净 clone 实测：用 npm 装会 ERESOLVE（@deepseek-ai/cordis 4.0.5-alpha.1 与
# cordis-plugin-include 声明的 peer ~4.0.5 冲突），旧写法还把 npm 的输出 >/dev/null 吞了，只剩一句
# tsdown: not found。改走包自己的锁文件（pnpm-lock.yaml + --frozen-lockfile），失败时打出日志尾部。
ENTRY="$SUPERAGENT_SRC/lib/index.js"
if [ ! -f "$ENTRY" ]; then
  echo "building superagent (lib/ missing): pnpm install --frozen-lockfile && pnpm run build"
  BUILD_LOG="$(mktemp)"
  ( cd "$SUPERAGENT_SRC" && PATH="$RUNTIME_PATH" "${PNPM[@]}" install --frozen-lockfile --ignore-scripts ${NPM_CONFIG_REGISTRY:+--registry="$NPM_CONFIG_REGISTRY"} >"$BUILD_LOG" 2>&1 \
        && PATH="$RUNTIME_PATH" "${PNPM[@]}" run build >>"$BUILD_LOG" 2>&1 ) || {
    echo "FAIL: superagent build (pnpm install --frozen-lockfile + pnpm run build) —— 构建日志尾部：" >&2
    tail -n 25 "$BUILD_LOG" >&2
    rm -f "$BUILD_LOG"
    exit 1
  }
  rm -f "$BUILD_LOG"
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

# 2) 安装/升级 superagent 插件包进 profile（registry 镜像——npm 直连被墙）
#    触发安装：入口缺失，或源码摘要与上次安装时记下的不同（git pull / 重新构建之后）。
#    pnpm 的 file: 目录依赖是逐文件硬链接的副本，源码重建后已安装副本不会自己变——所以重跑 provision
#    必须能升级。pnpm add 原地重装，不先删旧包（失败时旧包仍在，patch 也不动）。
#    包源先按 package.json 的 files 清单复制到 home 里（STAGE），profile 的 file: 引用指向这份副本——
#    2026-11-24 实测：引用仓库路径时，仓库被挪走/删掉后引擎再对这个 profile 跑 pnpm install 会 ENOENT。
src_digest() {
  ( cd "$SUPERAGENT_SRC" && find lib package.json skills -type f -print0 2>/dev/null | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -d" " -f1 )
}
INSTALLED="$PROFILE_DIR/node_modules/dsh-superagent"
STAGE="${DSH_HOME_DIR}/superagent-src"
stage_source() {
  FILES="$("${NODE_BIN}" -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).files.join(" "))' "${SUPERAGENT_SRC}/package.json")"
  rm -rf "${STAGE}.new"
  mkdir -p "${STAGE}.new"
  ( cd "${SUPERAGENT_SRC}" && shopt -s nullglob && set -- package.json ${FILES} \
    && for item in "$@"; do
         if [ -e "$item" ]; then mkdir -p "${STAGE}.new/$(dirname "$item")" && cp -a "$item" "${STAGE}.new/$(dirname "$item")/"; fi
       done )
  # files 清单里可能列了仓库里没有的文件（如 README.md），跳过；通配条目（locale/*.json）保持原目录结构。
  # 但入口与包内 bundle 层必须有——后者缺了插件会静默不激活（见步骤 3 的说明）。
  [ -f "${STAGE}.new/lib/index.js" ] && [ -f "${STAGE}.new/cordis.patch.yml" ] || {
    echo "FAIL: staged plugin source incomplete: ${STAGE}（需要 lib/index.js 与 cordis.patch.yml）" >&2; exit 1; }

  rm -rf "${STAGE}"
  mv "${STAGE}.new" "${STAGE}"
}
DIGEST="$(src_digest)"
NEED_INSTALL=0
[ -f "$INSTALLED/lib/index.js" ] && [ "$(cat "$INSTALLED/.source-sha256" 2>/dev/null)" = "$DIGEST" ] || NEED_INSTALL=1
# 旧版安装器把 file: 引用指向仓库路径：源码没变也要改指到 home 里的副本
grep -qF '"dsh-superagent": "file:'"${STAGE}"'"' "${PROFILE_DIR}/package.json" 2>/dev/null || NEED_INSTALL=1
if [ "${NEED_INSTALL}" = 1 ]; then
  [ -d "${INSTALLED}" ] && [ ! -f "${INSTALLED}/lib/index.js" ] && rm -rf "${INSTALLED}"
  stage_source
  INSTALL_LOG="$(mktemp)"
  ( cd "${PROFILE_DIR}" && HOME="${HOME_DIR}" PATH="${RUNTIME_PATH}" "${PNPM[@]}" add "file:${STAGE}" --registry=https://registry.npmmirror.com >"${INSTALL_LOG}" 2>&1 ) || {
    echo "FAIL: superagent install (原 patch 未动) —— pnpm add 输出尾部：" >&2
    tail -n 15 "$INSTALL_LOG" >&2
    rm -f "$PATCH_TMP" "$INSTALL_LOG"
    exit 1; }
  rm -f "$INSTALL_LOG"
  # skills 随包同步（package.json 的 files 含 skills；这里覆盖一次，保证与源码一致）
  if [ -d "${STAGE}/skills" ]; then
    rm -rf "${INSTALLED}/skills"
    cp -r "${STAGE}/skills" "${INSTALLED}/skills"
  fi
  echo "$DIGEST" > "${INSTALLED}/.source-sha256"
  echo "  plugin:  installed dsh-superagent from ${SUPERAGENT_SRC} (source $DIGEST)"
  echo "  plugin:  source staged to ${STAGE}"
else
  echo "  plugin:  up to date (source $DIGEST)"
fi
[ -f "$PROFILE_DIR/node_modules/dsh-superagent/lib/index.js" ] || {
  rm -f "$PATCH_TMP"; echo "FAIL: installed package entry missing" >&2; exit 1; }

# 3) 安装全成功——原子替换 patch（失败路径在上面已 return，原配置保持完整）
#    首次接入前把引擎原有的 patch 备份一份（uninstall.sh 靠它还原）：只备份一次，
#    且只备份不是本脚本渲染出来的文件（渲染结果首行带 hivebot-provision 标记）。
if [ -f "$PROFILE_DIR/cordis.patch.yml" ] && [ ! -f "$PROFILE_DIR/cordis.patch.yml.pre-hivebot" ] \
   && ! grep -q 'hivebot-provision' "$PROFILE_DIR/cordis.patch.yml"; then
  cp -p "$PROFILE_DIR/cordis.patch.yml" "$PROFILE_DIR/cordis.patch.yml.pre-hivebot"
  echo "  patch:   backed up the original to cordis.patch.yml.pre-hivebot"
fi
mv -f "$PATCH_TMP" "$PROFILE_DIR/cordis.patch.yml"

# 3) skills/ 目录必须随包（packaged() 运行时校验 skills/dsh-superagent-feishu/SKILL.md）
if [ -d "$SUPERAGENT_SRC/skills" ] && [ ! -d "$PROFILE_DIR/node_modules/dsh-superagent/skills" ]; then
  cp -r "$SUPERAGENT_SRC/skills" "$PROFILE_DIR/node_modules/dsh-superagent/skills"
fi

# 3) 注册 bundle 层：引擎只对 dsh.profile.bundles 列出的包应用包内 cordis.patch.yml
#    （profile-boot: bundle layers → cordis.patch.yml → --patch）。pnpm 直装不走插件管理器的
#    reconcile，不注册的话瘦身模板的 id-targeted override 无锚点，插件静默不激活（2026-11-22 实证）。
"$NODE_BIN" -e '
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
echo "next: 启动 DS-Bot（home: $HOME_DIR），在界面里给 Chief 选模型「$MODEL_ID · LiteLLM (local)」；"
echo "      开发验收跑 scripts/fresh-boot.sh；撤销接入跑 scripts/dsbot-provision/uninstall.sh。"