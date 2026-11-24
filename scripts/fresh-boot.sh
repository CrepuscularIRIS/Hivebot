#!/usr/bin/env bash
# goal-0acebfbf R15：首启回归脚本——干净 home + 预配置发行版形态 + 剧本断言
# 用法：fresh-boot.sh [--keep|--ui]   默认跑完自动清掉自己起的引擎；--keep 保留 fresh 环境供后续走查；
#       --ui 只做 A1+A1.5（干净 home + provision + 起引擎），打印 URL 后退出，引擎留给 ego-browser 走真实 UI
# 断言（全过 exit 0；任一不满足即非 0）：
#   A1    干净 home + 干净插件 state 起引擎（打出 dsh web URL）
#   A1.5  provision 后重启引擎仍可达
#   A2    state.json 的 mainBotIds[0] 解析出 Chief
#   A2.5  /orchestrator/api/state 路由 200 且 masterId=Chief（首启是 paused/setupPending，不是 ready）
#   A2.7  经 /api/bot update-bot 给 Chief 选模型，等 kickoff 释放、Chief 在首条人类消息前开口
#   A3    开场判据——只有 PASS 算过；FAIL 和 SKIP（四种成因）都 RC=1
#   A4    首条编排（api/bot send）→ worker 建文件、落盘 marker、Chief 回话
# 判定只在 fresh_boot_evidence.py；反例回归在 scripts/tests/fresh_boot_evidence_test.py。
set -u
TRIAL="${DSBOT_TRIAL:-/tmp/dsbot-trial}"
REPO="${HIVEBOT_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
FRESH=$TRIAL/home-fresh
LOG=$TRIAL/host-fresh-r15.log
# 参数：--keep 跑完保留 fresh 环境；--ui 只做 A1+A1.5，把引擎留给 ego-browser 走查（打印 URL 后 exit 0）
KEEP=""; UI=0
for a in "$@"; do case "$a" in --keep) KEEP=--keep;; --ui) UI=1;; esac; done
RT=$TRIAL/squashfs-root/resources/primary-runtime/dependencies/node/bin/node
APP=$TRIAL/squashfs-root/resources/app
PIDFILE=$TRIAL/engine.pids   # --ui 留下的引擎 pid（下次重跑 kill_own 清）
# LLM key 一次性导出（A1 引擎与 A1.5 provision 共用）
DSH_LITELLM_API_KEY="${DSH_LITELLM_API_KEY:-$(grep LITELLM_MASTER_KEY "$REPO/app/ui/.env" 2>/dev/null | cut -d= -f2)}"
export DSH_LITELLM_API_KEY

# 只杀本脚本 spawn 的引擎（纠错轮 Codex 审查 #1：ps 全匹配会误杀宿主上其他 dsbot 实例）
BOOT_PIDS=""
spawn_engine() {
  setsid nohup $RT --expose-internals $APP/src/host.mjs >> "$LOG" 2>&1 < /dev/null &
  BOOT_PID=$!
  BOOT_PIDS="$BOOT_PIDS $BOOT_PID"
}
kill_own() {
  for p in $BOOT_PIDS; do kill -9 "$p" 2>/dev/null; done
  # --ui 留下的引擎（PIDFILE）重跑前清掉；只杀 cmdline 含 host.mjs 且 cwd=$APP 的（防误杀宿主其他 dsbot 实例）
  for p in $(cat "$PIDFILE" 2>/dev/null); do
    [ -d "/proc/$p" ] || continue
    tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q 'host.mjs' && [ "$(readlink "/proc/$p/cwd" 2>/dev/null)" = "$APP" ] && kill -9 "$p" 2>/dev/null
  done
  : > "$PIDFILE"
  sleep 2
  rm -f "$FRESH/.ds-bot/bot/state.lock" 2>/dev/null
}

echo "== A1: fresh home engine =="
# 先停上一轮的引擎再清目录（否则它在被杀前还会往「干净」home 里写）；插件 state 目录一并清——
# 里面是上一轮的 orchestrator.sqlite（KV master-id、未决 trigger/ticket），留着就不是干净首启：
# 旧轮的 candidate 卡会投给新 Chief（UI 验收实测）。
kill_own
rm -rf "$FRESH" "$TRIAL/sa-state-fresh"
mkdir -p "$FRESH"

# 引擎首启（产 profile 骨架）
export HOME=$FRESH DSH_HOME=$FRESH/.ds-bot npm_config_registry=https://registry.npmmirror.com
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
"$REPO/scripts/dsbot-provision/provision.sh" "$FRESH" --app-dir "$APP" --state-dir "$TRIAL/sa-state-fresh" || { echo "A1.5 FAIL: provision"; exit 1; }
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
if [ "$UI" = 1 ]; then
  echo "$BOOT_PID" >> "$PIDFILE"
  echo "ui-mode: engine pid=$BOOT_PID url=$URL"
  exit 0
fi

TOKEN=$(echo "$URL" | grep -oP 'token=\K[^ ]+')
echo "== A2/A3/A4: 剧本（node 断言脚本） =="
PORT="$PORT" TOKEN="$TOKEN" FRESH="$FRESH" EVIDENCE_PY="$REPO/scripts/fresh_boot_evidence.py" DSBOT_TRIAL="$TRIAL" \
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
// A2.7: 给 Chief 选模型。update-bot 与 UI 里点选模型是同一条产品通道（body.model 经 rt.resolveModel 按 id/name 匹配）。
// DS-Bot 的开场白要等 Bot 有模型才投递（roster.js releaseKickoff: greeting === undefined || !bot.model → false），
// 不选模型主会话里连 kickoff relay 都没有、A3 永远判不了（r17–r20 实证：旧判据把这些轮次当成了通过）。
const pick = await call('update-bot', { id: chiefId, model: process.env.TEAM_MODEL || 'glm-5.3-flash' });
if (!pick.ok) { console.log('A2.7 FAIL: pick model ->', JSON.stringify(pick).slice(0, 200)); process.exit(1); }
console.log('A2.7 OK: model picked for Chief');
// 开场白投递是异步的（releaseKickoff → rt.waitForModel → sendKickoff）。必须等「Chief 已在首条人类消息之前开场」
// 落盘再发 A4，否则首条人类消息会抢在 kickoff 前面。等待条件直接复用判据单一真源 fresh_boot_evidence.py --opening
// （退出码 0 = 已开场，3 = 还没有），不在剧本里另造一份 A3 判定。
const { spawnSync } = await import('node:child_process');
// 探针退出码只有 0（已开场）和 3（还没开场）是正常轮询；其它是判据自己出错，快速失败并打出 stderr 尾部。
// 会话文件最后一行写到一半不算错，判据的读层会丢掉那半行。
const NL = String.fromCharCode(10);
const tail = s => String(s || '').trim().split(NL).slice(-6).join(NL);
let opened = false;
let waitedMs = 0;
for (let i = 0; i < 40 && !opened; i++) {
  await new Promise(r => setTimeout(r, 3000));
  waitedMs += 3000;
  const probe = spawnSync('python3', [process.env.EVIDENCE_PY, '--opening'], { encoding: 'utf8' });
  if (probe.status === 0) { opened = true; break; }
  if (probe.status !== 3) {
    console.log('A2.7 FAIL: opening probe errored (exit ' + probe.status + ') after ' + waitedMs + 'ms');
    if (probe.error) console.log(tail(probe.error.message));
    console.log(tail(probe.stderr));
    process.exit(1);
  }
}
if (!opened) { console.log('A2.7 FAIL: Chief did not open before the first human message (' + waitedMs + 'ms)'); process.exit(1); }
console.log('A2.7 OK: Chief opened (kickoff relay + persona)');
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
# A3 只有 PASS 算过。SKIP 的四种成因——主 bot 身份没解析到 / 没有主 bot 的会话文件 /
# kickoff relay 投了但 Chief 没在首条人类消息前开口 / 连 kickoff relay 都没有——都不是通过。
# 旧版放行 kickoff-not-released（理由：无 UI 流程里未释放）已被 r21 证伪：纯 API 流程选了模型，
# 开场就会投递释放。A2.7 已经等过开场，到这里还不是 PASS 就是真有问题。
case "$EVID" in *A3=PASS*) ;; *)
  echo "A3 NOT PASS: $EVID"
  echo "  -> A3 判据没有给出 PASS（成因见 A3-reason）。不是通过，不要当通过。"
  RC=1;;
esac
# 判据自己崩了时 EVID 是空串：上面已经按 NOT PASS 记了，这里指一下怎么看报错。
[ -n "$EVID" ] || echo "  (evidence 行是空的：判据自己崩了。手动跑 DSBOT_TRIAL=$TRIAL python3 $REPO/scripts/fresh_boot_evidence.py 看报错)"
echo "$EVID" | grep -q 'A4-worker=PASS' || RC=1
echo "$EVID" | grep -q 'A4-chief=PASS' || RC=1
if [ "$KEEP" != "--keep" ]; then
  kill_own
fi
exit $RC
