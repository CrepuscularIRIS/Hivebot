#!/usr/bin/env bash
# build-win-package.sh —— 组装 DS-Bot 0.3.8 + DSH SuperAgent 单一 Windows 安装包（goal: m00482）
# 产物：dist/dsbot-superagent-0.3.8-win-x64.zip
#   ├── DS-Bot-0.3.8-win-x64.exe      官方安装器（sha256 钉死防漂移）
#   ├── install.ps1                   overlay 安装器（渲染配置+落盘插件+注册 bundles，幂等）
#   ├── cordis.patch.win.yml          配置模板（占位符由 install.ps1 替换）
#   ├── README.md                     中文使用说明
#   └── overlay/dsh-superagent/       预构建插件（lib+skills+locale+vendored 运行时依赖）
#
# 用法：bash scripts/win-package/build-win-package.sh
# 自检：末段 zip 内容断言——失败 exit 1。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$REPO_ROOT/app/superagent"
HERE="$REPO_ROOT/scripts/win-package"
OUT_DIR="$REPO_ROOT/dist/win-package"
CACHE="$OUT_DIR/cache"
STAGE="$OUT_DIR/stage"
ZIP="$REPO_ROOT/dist/dsbot-superagent-0.3.8-win-x64.zip"

EXE_NAME="DS-Bot-0.3.8-win-x64.exe"
EXE_URL="https://github.com/Fei2411/DS-Bot/releases/download/v0.3.8/$EXE_NAME"
EXE_SHA256="97ff775e60036038d9e2009712175547900b214685201ee7455f621ba9990693"  # v0.3.8 官方 release（2026-11-22 下载实测）

# 1) 官方安装器：缓存优先，缺则下载，sha256 校验防上游漂移
mkdir -p "$CACHE"
if [ ! -f "$CACHE/$EXE_NAME" ]; then
  echo "downloading $EXE_URL ..."
  curl -fL --retry 3 -o "$CACHE/$EXE_NAME" "$EXE_URL"
fi
echo "$EXE_SHA256  $CACHE/$EXE_NAME" | sha256sum -c - || {
  echo "FAIL: $EXE_NAME sha256 不匹配（上游 release 变了？更新 EXE_SHA256 并重验插件兼容性）" >&2; exit 1; }

# 2) 插件构建校验（干净 checkout 无 lib/ 时现场构建——同 provision.sh 纠错经验）
if [ ! -f "$SRC/lib/index.js" ]; then
  echo "building superagent (lib/ missing)..."
  ( cd "$SRC" && npm install --ignore-scripts --no-audit --no-fund ${NPM_CONFIG_REGISTRY:+--registry="$NPM_CONFIG_REGISTRY"} >/dev/null 2>&1; npm run build >/dev/null ) \
    || { echo "FAIL: superagent build" >&2; exit 1; }
fi

# 3) staging：插件带 vendored 运行时依赖（proper-lockfile/zod 精确钉版；@deepseek-ai/* 为
#    peerDependencies 由引擎供给，不 vendor——版本跟 0.3.8 引擎走）。
#    只搬 package.json "files" 声明的运行时内容（不复制整个源目录的 node_modules/devDeps）。
rm -rf "$STAGE"; mkdir -p "$STAGE/overlay/dsh-superagent"
( cd "$SRC" && cp -r lib skills locale prompts cordis.patch.yml package.json "$STAGE/overlay/dsh-superagent/" ) \
  || { echo "FAIL: staging copy（缺 lib/skills？先跑 npm run build）" >&2; exit 1; }
(
  cd "$STAGE/overlay/dsh-superagent"
  # --legacy-peer-deps：npm 默认会自动装全部 @deepseek-ai/* peer（alpha 版、错误来源），必须跳过
  npm install --omit=dev --legacy-peer-deps --ignore-scripts --no-audit --no-fund \
    --registry="${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}" >/dev/null 2>&1 \
    || { echo "FAIL: vendor runtime deps" >&2; exit 1; }
  [ -f node_modules/proper-lockfile/package.json ] && [ -f node_modules/zod/package.json ] \
    || { echo "FAIL: vendored deps missing" >&2; exit 1; }
  rm -f package-lock.json
)

# 4) 组装 zip 根（setup.bat 转 CRLF：cmd 对 LF-only bat 的 goto/label 有兼容边界）
cp "$CACHE/$EXE_NAME" "$STAGE/$EXE_NAME"
cp "$HERE/cordis.patch.win.yml" "$HERE/README.md" "$STAGE/"
sed -e 's/$/\r/' "$HERE/setup.bat" > "$STAGE/setup.bat"
# install.ps1 加 UTF-8 BOM：PS5.1 对无 BOM 文件按 ANSI 解码，中文里的 UTF-8 字节会被当成
# 弯引号截断字符串导致解析失败（2026-11-22 Win11 26200 实测）；BOM 后按 UTF-8 读，无此问题。
printf '\xef\xbb\xbf' > "$STAGE/install.ps1"; cat "$HERE/install.ps1" >> "$STAGE/install.ps1"

# 5) 打包 + 自检（zip 内容断言）
( cd "$STAGE" && zip -qr9 "$ZIP" . )
unzip -l "$ZIP" > "$OUT_DIR/zip-listing.txt"
check() { grep -q "$1" "$OUT_DIR/zip-listing.txt" || { echo "FAIL: zip 缺 $1" >&2; exit 1; }; }
check "$EXE_NAME"
check 'install.ps1'
check 'setup.bat'
check 'cordis.patch.win.yml'
check 'README.md'
check 'overlay/dsh-superagent/lib/index.js'
check 'overlay/dsh-superagent/cordis.patch.yml'
check 'overlay/dsh-superagent/skills/dsh-superagent-github/SKILL.md'
check 'overlay/dsh-superagent/node_modules/proper-lockfile/package.json'
check 'overlay/dsh-superagent/node_modules/zod/package.json'
# 模板占位符必须在（渲染是安装器的事，构建期不渲染）
grep -q '__STATE_DIR__' "$HERE/cordis.patch.win.yml" || { echo "FAIL: 模板缺占位符" >&2; exit 1; }
# 编码自检：install.ps1 必须 BOM 开头（PS5.1 ANSI 解码坑），setup.bat 必须 CRLF（cmd goto 兼容）
head -c 3 "$STAGE/install.ps1" | od -An -tx1 | grep -q 'ef bb bf' || { echo "FAIL: install.ps1 缺 UTF-8 BOM" >&2; exit 1; }
grep -q $'\r' "$STAGE/setup.bat" || { echo "FAIL: setup.bat 缺 CRLF" >&2; exit 1; }

echo "OK: $ZIP ($(du -h "$ZIP" | cut -f1))"
echo "    listing: $OUT_DIR/zip-listing.txt"
