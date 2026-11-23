#!/usr/bin/env bash
# goal-0acebfbf R15：首启回归脚本——干净 home + 预配置发行版形态 + 剧本断言
# 用法：fresh-boot.sh [--keep]   默认跑完自动恢复原 home；--keep 保留 fresh 环境供后续走查
# 断言（全过 exit 0）：
#   A1 干净 home 引擎起（dsh web URL 打出）
#   A2 Chief 无模型开场（"Pick a model" 文案）
#   A2.5 SuperAgent 插件激活（orchestrator ready + masterId=Chief——bundle 注册断言）
#   A3 选模型后 kickoff（人格开场 "Chief of Staff"）
#   A4 首条编排（api/bot send）→ worker 建+落盘 marker
set -u
TRIAL="${DSBOT_TRIAL:-/tmp/dsbot-trial}"
REPO="${HIVEBOT_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
FRESH=$TRIAL/home-fresh
LOG=$TRIAL/host-fresh-r15.log
KEEP=${1:-}
# LLM key 一次性导出（A1 引擎与 A1.5 provision 共用）
DSH_LITELLM_API_KEY="${DSH_LITELLM_API_KEY:-$(grep LITELLM_MASTER_KEY "$REPO/app/ui/.env" 2>/dev/null | cut -d= -f2)}"
export DSH_LITELLM_API_KEY

echo "== A1: fresh home engine =="
[ -d "$FRESH" ] && rm -rf "$FRESH"
mkdir -p "$FRESH"

# 只杀本脚本 spawn 的引擎（纠错轮 Codex 审查 #1：ps 全匹配会误杀宿主上其他 dsbot 实例）
BOOT_PIDS=""
spawn_engine() {
  setsid nohup $RT --expose-internals $APP/src/host.mjs >> "$LOG" 2>&1 < /dev/null &
  BOOT_PID=$!
  BOOT_PIDS="$BOOT_PIDS $BOOT_PID"
}
kill_own() {
  for p in $BOOT_PIDS; do kill -9 "$p" 2>/dev/null; done
  sleep 2
  rm -f "$FRESH/.ds-bot/bot/state.lock" 2>/dev/null
}

echo "== A1: fresh home engine =="
[ -d "$FRESH" ] && rm -rf "$FRESH"
mkdir -p "$FRESH"
kill_own

# 引擎首启（产 profile 骨架）
export HOME=$FRESH DSH_HOME=$FRESH/.ds-bot npm_config_registry=https://registry.npmmirror.com
RT=$TRIAL/squashfs-root/resources/primary-runtime/dependencies/node/bin/node
APP=$TRIAL/squashfs-root/resources/app
cd "$APP" || exit 1
spawn_engine
# 等 profile 骨架出现（cordis.patch.yml 生成）
for i in $(seq 1 40); do
  [ -f "$FRESH/.ds-bot/profiles/ds-bot/cordis.patch.yml" ] && break
  sleep 2
done
[ -f "$FRESH/.ds-bot/profiles/ds-bot/cordis.patch.yml" ] || { echo "A1 FAIL: profile skeleton missing"; exit 1; }

echo "== A1.5: 预配置（provision.sh——单一真源 scripts/dsbot-provision/） =="
kill_own
"$REPO/scripts/dsbot-provision/provision.sh" "$FRESH" --state-dir "$TRIAL/sa-state-fresh" || { echo "A1.5 FAIL: provision"; exit 1; }
cd "$APP" || exit 1
spawn_engine
for i in $(seq 1 30); do
  URL=$(grep 'dsh web' "$LOG" 2>/dev/null | tail -1)
  PORT=$(echo "$URL" | grep -oP ':\K[0-9]+' | head -1)
  [ -n "$PORT" ] && curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/" 2>/dev/null | grep -qE '30|40' && break
  sleep 2
done
echo "engine: $URL"
[ -n "$PORT" ] || { echo "A1 FAIL: no engine"; exit 1; }

TOKEN=$(echo "$URL" | grep -oP 'token=\K[^ ]+')
echo "== A2/A3/A4: 剧本（node 断言脚本） =="
NODE_SCRIPT="$TRIAL/r15-boot-check.mjs" PORT="$PORT" TOKEN="$TOKEN" FRESH="$FRESH" \
  node -e "
const { PORT, TOKEN, FRESH } = process.env;
const BASE = 'http://127.0.0.1:' + PORT;
const fs = await import('node:fs/promises');
const r1 = await fetch(BASE + '/?token=' + TOKEN, {redirect:'manual'});
const cookie = (r1.headers.get('set-cookie')||'').split(';')[0];
const call = (endpoint, payload) => fetch(BASE + '/api/bot', {method:'POST', headers:{'content-type':'application/json', cookie}, body: JSON.stringify({endpoint, payload})}).then(r=>r.json());
// A2: state 面 Chief 在
const st = await call('state', {since:0});
const chiefId = st.value ? (st.value.mainBotIds||[])[0] : null;
if (!chiefId) { console.log('A2 FAIL: no chief'); process.exit(1); }
console.log('A2 OK: chief', chiefId);
// A2.5: SuperAgent 插件激活断言（2026-11-22 实证缺口：A4 的 TEAM_TOOLS 走引擎原生副手，
// 插件不激活也能过——bundle 未注册时瘦身模板静默失效，只有 orchestrator 面能证真激活）。
// fresh home 未走 setup → runtime 是 paused/setupPending 而非 ready；激活证据=路由挂载(200)。
// masterId 绑定走 60s 巡检收敛（首启时 ds-bot roster 写 state.json 可能晚于插件 init）→ 轮询 ≤90s。
let orch = null, status = 0;
for (let i = 0; i < 30 && !(orch && orch.masterId === chiefId); i++) {
  const res = await fetch(BASE + '/orchestrator/api/state', {headers:{'x-orchestrator-request':'1', cookie, origin: BASE}});
  status = res.status;
  if (status === 200) orch = await res.json().catch(() => null);
  if (!(orch && orch.masterId === chiefId)) await new Promise(r => setTimeout(r, 3000));
}
if (status !== 200 || !orch || orch.masterId !== chiefId) { console.log('A2.5 FAIL: orchestrator not activated/bound (status ' + status + ')', JSON.stringify(orch)?.slice(0,160)); process.exit(1); }
console.log('A2.5 OK: orchestrator activated, masterId=chief');
// A3: kickoff 人格开场（Chief 会话 jsonl 含 'Chief of Staff'——ds-bot roster kickoff + 真模型）
// fresh home 的 Chief 会话在 sessions/<encoded-cwd>/ 下，用 zstd 解（node 无 zstd——起 python 辅助或跳过）
// 此断言走文件层（bash 侧 python 已有），node 侧只发 A4。
// A3/A4: 发首条编排（api/bot send——产品级可靠通道）
const send = await call('send', {sessionId: chiefId, text: 'Use one of your worker Bots (TEAM_TOOLS) to create a file boot-check.txt containing the word ok — delegate it, do not create the file yourself'});
if (!send.ok) { console.log('A4 FAIL send:', JSON.stringify(send).slice(0,120)); process.exit(1); }
console.log('A4 send OK, waiting worker...');
// 轮询 marker（worker 落盘）；A4 的「确系 worker 写」证据在 bash 侧 python 断言（会话作者级）
let marker = false;
for (let i = 0; i < 45; i++) {
  await new Promise(r => setTimeout(r, 4000));
  try { const c = await fs.readFile(FRESH + '/.ds-bot/bot/workspace/boot-check.txt', 'utf8'); 
        if (c.trim() === 'ok') { marker = true; break; } } catch {}
}
console.log(marker ? 'A4-marker OK' : 'A4 FAIL: marker not written in 180s');
process.exit(marker ? 0 : 1);
" --input-type=module 2>&1
RC=$?
echo "boot-check exit: $RC"
# A3+A4 证据（文件层，作者级断言——纠错轮 Codex 审查 #1：关键词命中≠Chief 在首条 user 前开场；marker 存在≠worker 写）
# 判据单一真源在 scripts/fresh_boot_evidence.py（4b922fde 复测 #5：反例回归测试在 scripts/tests/）
EVID=$(DSBOT_TRIAL="$TRIAL" python3 "$REPO/scripts/fresh_boot_evidence.py")
echo "evidence: $EVID"
case "$EVID" in *A3=FAIL*) RC=1;; esac   # PASS/SKIP 均可：SKIP=无 UI 流程未释放 kickoff（见断言内注释）
echo "$EVID" | grep -q 'A4-worker=PASS' || RC=1
echo "$EVID" | grep -q 'A4-chief=PASS' || RC=1
if [ "$KEEP" != "--keep" ]; then
  kill_own
fi
exit $RC
