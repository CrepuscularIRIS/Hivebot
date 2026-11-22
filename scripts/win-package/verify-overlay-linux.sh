#!/usr/bin/env bash
# verify-overlay-linux.sh —— 在 Linux 上验证 win 包 overlay 产物（不带 Windows 的最强等价检验）
# 模拟 install.ps1 的落盘结果：fresh home 首启产骨架 → 用 dist/win-package/stage 的
# overlay/dsh-superagent（npm vendored 依赖版）替换 provision(pnpm) 安装 → 重启引擎 →
# 断言 SuperAgent 插件激活（orchestrator 200 + masterId=chief，同 fresh-boot A2.5）。
# 这验证的是「zip 里的插件目录 + 手渲染 patch + bundles 注册」整条链，与 pnpm 装法无关的部分。
# 用法：bash scripts/win-package/verify-overlay-linux.sh
set -u
TRIAL="${DSBOT_TRIAL:-/tmp/dsbot-trial}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAGE="$REPO/dist/win-package/stage"
FRESH=$TRIAL/home-win-sim
LOG=$TRIAL/host-win-sim.log
RT=$TRIAL/squashfs-root/resources/primary-runtime/dependencies/node/bin/node
APP=$TRIAL/squashfs-root/resources/app

[ -d "$STAGE/overlay/dsh-superagent" ] || { echo "FAIL: 先跑 build-win-package.sh（stage 缺 overlay）" >&2; exit 1; }
DSH_LITELLM_API_KEY="${DSH_LITELLM_API_KEY:-$(grep LITELLM_MASTER_KEY "$REPO/app/ui/.env" 2>/dev/null | cut -d= -f2)}"
export DSH_LITELLM_API_KEY

BOOT_PIDS=""
spawn_engine() {
  setsid nohup "$RT" --expose-internals "$APP/src/host.mjs" >> "$LOG" 2>&1 < /dev/null &
  BOOT_PIDS="$BOOT_PIDS $!"
}
kill_own() { for p in $BOOT_PIDS; do kill -9 "$p" 2>/dev/null; done; sleep 2; rm -f "$FRESH/.ds-bot/bot/state.lock" 2>/dev/null; }

echo "== W1: fresh home 首启产骨架 =="
rm -rf "$FRESH"; mkdir -p "$FRESH"; : > "$LOG"
export HOME=$FRESH DSH_HOME=$FRESH/.ds-bot npm_config_registry=https://registry.npmmirror.com
cd "$APP" || exit 1
spawn_engine
for i in $(seq 1 40); do [ -f "$FRESH/.ds-bot/profiles/ds-bot/cordis.patch.yml" ] && break; sleep 2; done
[ -f "$FRESH/.ds-bot/profiles/ds-bot/cordis.patch.yml" ] || { echo "W1 FAIL: skeleton missing"; exit 1; }
kill_own
PROFILE=$FRESH/.ds-bot/profiles/ds-bot

echo "== W2: 按 install.ps1 语义落盘 overlay =="
# 2a) 插件目录（npm vendored 版）——首启骨架无 node_modules，先建（同 install.ps1 的 New-Item）
mkdir -p "$PROFILE/node_modules"
rm -rf "$PROFILE/node_modules/dsh-superagent"
cp -r "$STAGE/overlay/dsh-superagent" "$PROFILE/node_modules/dsh-superagent"
[ -f "$PROFILE/node_modules/dsh-superagent/lib/index.js" ] || { echo "W2 FAIL: plugin copy"; exit 1; }
[ -f "$PROFILE/node_modules/dsh-superagent/node_modules/zod/package.json" ] || { echo "W2 FAIL: vendored zod missing"; exit 1; }
# 2b) 渲染 patch（与 install.ps1 同占位符；Windows 路径正斜杠——Linux 路径本就正斜杠）
esc() { printf '%s' "$1" | sed -e 's/[&/]/\\&/g'; }
sed -e "s|__STATE_DIR__|$(esc "$TRIAL/sa-state-win-sim")|g" \
    -e "s|__DATA_DIR__|$(esc "$FRESH/.ds-bot")|g" \
    -e "s|__BASE_URL__|http://127.0.0.1:4001/v1|g" \
    -e "s|__MODEL_ID__|glm-5.3-flash|g" \
    "$STAGE/cordis.patch.win.yml" > "$PROFILE/cordis.patch.yml"
# 2c) bundles 注册（= install.ps1 的 merge 分支：骨架已有默认 4 bundle，幂等追加）
node -e '
const fs = require("fs"); const p = process.argv[1];
const m = JSON.parse(fs.readFileSync(p, "utf8"));
m.dsh ??= {}; m.dsh.profile ??= {}; m.dsh.profile.bundles ??= [];
if (!m.dsh.profile.bundles.includes("dsh-superagent")) m.dsh.profile.bundles.push("dsh-superagent");
fs.writeFileSync(p, JSON.stringify(m, undefined, 2) + "\n");' "$PROFILE/package.json"

echo "== W3: 重启引擎，断言激活 =="
spawn_engine
URL=""; for i in $(seq 1 30); do
  URL=$(grep 'dsh web' "$LOG" 2>/dev/null | tail -1); PORT=$(echo "$URL" | grep -oP ':\K[0-9]+' | head -1)
  [ -n "$PORT" ] && curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/" 2>/dev/null | grep -qE '30|40' && break
  sleep 2
done
[ -n "$PORT" ] || { echo "W3 FAIL: no engine"; exit 1; }
TOKEN=$(echo "$URL" | grep -oP 'token=\K[^ ]+')
PORT="$PORT" TOKEN="$TOKEN" node -e '
const { PORT, TOKEN } = process.env; const BASE = "http://127.0.0.1:" + PORT;
const r1 = await fetch(BASE + "/?token=" + TOKEN, {redirect:"manual"});
const cookie = (r1.headers.get("set-cookie")||"").split(";")[0];
const st = await (await fetch(BASE + "/api/bot", {method:"POST", headers:{"content-type":"application/json", cookie}, body: JSON.stringify({endpoint:"state", payload:{since:0}})})).json();
const chiefId = st.value ? (st.value.mainBotIds||[])[0] : null;
if (!chiefId) { console.log("W3 FAIL: no chief"); process.exit(1); }
let orch=null, status=0;
for (let i=0;i<30 && !(orch && orch.masterId===chiefId);i++){
  const res = await fetch(BASE + "/orchestrator/api/state", {headers:{"x-orchestrator-request":"1", cookie, origin: BASE}});
  status = res.status; if (status===200) orch = await res.json().catch(()=>null);
  if (!(orch && orch.masterId===chiefId)) await new Promise(r=>setTimeout(r,3000));
}
if (status!==200 || !orch || orch.masterId!==chiefId) { console.log("W3 FAIL: overlay 版插件未激活/未绑定 (status "+status+")", JSON.stringify(orch)?.slice(0,160)); process.exit(1); }
console.log("W3 OK: overlay(npm vendored) 插件激活，masterId=chief", chiefId);' || { kill_own; exit 1; }

kill_own
echo "== PASS: win 包 overlay 链在 Linux 等价环境验证通过 =="
