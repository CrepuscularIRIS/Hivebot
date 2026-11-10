#!/bin/bash
# 红绿突变：每条门控一个突变（去门控 → build → 单跑 → 应红 → 还原）。产物在 work/p4-ui/evidence/U-00/red-green/。
set -u
cd "$(dirname "$0")/../.."
EV=../../work/p4-ui/evidence/U-00/red-green

mutate () { # $1=name $2=file $3=from $4=to $5=grep（playwright --grep 正则）
  local name=$1 file=$2 from=$3 to=$4 grep=$5
  echo "== $name =="
  python3 - "$file" "$from" "$to" <<'PY'
import sys
path, frm, to = sys.argv[1:4]
s = open(path).read()
if s.count(frm) != 1:
    print(f"MUTATE-ERROR: {frm!r} count={s.count(frm)} in {path}"); sys.exit(1)
open(path, 'w').write(s.replace(frm, to))
PY
  [ $? -ne 0 ] && { echo "$name mutate failed"; return 1; }
  pnpm build >/dev/null 2>&1 || { echo "$name build failed"; git checkout -- "$file"; return 1; }
  pnpm test:e2e --grep "$grep" > "$EV/$name.txt" 2>&1
  grep -E "passed|failed" "$EV/$name.txt" | tail -1
  git checkout -- "$file"
  pnpm build >/dev/null 2>&1
}

mutate a  main/window.ts "webviewTag: false," "webviewTag: true," "webviewTag"
mutate a2 main/window.ts "devTools: false," "devTools: true," "webviewTag"
mutate b  main/window.ts "return { action: 'deny' }" "return { action: 'allow' }" "openExternal"
mutate c  main/window.ts "if (new URL(url).protocol !== \`\${SCHEME}:\`) {" "if (false) {" "location.href"
mutate d  preload/index.ts "const isAppMainFrame = location.protocol === 'pbots-app:' && location.hostname === 'app' && process.isMainFrame" "const isAppMainFrame = true" "拿不到 window.pbots"
mutate e  main/index.ts "ipcMain.handle('pbots:api', (event, req) => { assertSender(event); return m1(req) })" "ipcMain.handle('pbots:api', (event, req) => m1(req))" "非主窗口"
mutate f  main/index.ts "if (url.hostname !== 'app') return new Response(null, { status: 404 })" "if (false) return new Response(null, { status: 404 })" "other 主机"

# f-traverse：403 分支的断言在单测（e2e 的穿越路径会被 URL 规范化），突变后跑 vitest。
echo "== f-traverse(unit) =="
python3 - main/index.ts "if (!target.startsWith(directory + sep)) return { status: 403 }" "if (false) return { status: 403 }" <<'PY'
import sys
path, frm, to = sys.argv[1:4]
s = open(path).read(); assert s.count(frm) == 1
open(path, 'w').write(s.replace(frm, to))
PY
pnpm test tests/unit/shell/document-path.test.ts > "$EV/f-traverse.txt" 2>&1
grep -E "passed|failed" "$EV/f-traverse.txt" | tail -1
git checkout -- main/index.ts
