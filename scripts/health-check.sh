#!/usr/bin/env bash
# goal-0acebfbf R15: 四段健康读数（起—连—发—收）
# 两种找引擎的方式：
#   · 开发试验（fresh-boot.sh 的 /tmp/dsbot-trial）：engine.sh url 给出带 token 的地址——四段全查，含绑定一致性。
#   · 桌面安装（没有 engine.sh）：端口从 DS-Bot 主进程日志读（token 在那里是 <hidden>，拿不到，进不了 /api/bot），
#     只查到 SuperAgent 编排面：DSBOT_HOME=<DS-Bot 运行时的 home> scripts/health-check.sh
set -u
TRIAL="${DSBOT_TRIAL:-/tmp/dsbot-trial}"
DSBOT_HOME="${DSBOT_HOME:-$HOME}"
PIDS=$(ps aux | grep 'resources/app/src/host.mjs' | grep -v grep | awk '{print $2}' | wc -l)
echo "[1/4 引擎] processes=$PIDS"
URL=$($TRIAL/engine.sh url 2>/dev/null); PORT=$(echo "$URL" | grep -oP ':\K[0-9]+' | head -1)
if [ -z "$PORT" ]; then
  URL=$(grep 'dsh web' "$DSBOT_HOME/.config/DS Bot/logs/main.log" 2>/dev/null | tail -n 1 | grep -oE 'http[^ ]+')
  PORT=$(echo "$URL" | grep -oP ':\K[0-9]+' | head -1)
fi
TOKEN=$(echo "$URL" | grep -oP 'token=\K[^ ]+')
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/" 2>/dev/null)
echo "[2/4 web] port=$PORT code=$CODE"
if [ "$CODE" != "401" ] && [ "$CODE" != "302" ]; then echo "RESULT: 引擎/web 未就绪"; exit 1; fi
if [ -z "$TOKEN" ] || [ "$TOKEN" = "<hidden>" ]; then
  # 桌面安装：没有 token（进不了 /api/bot），目标机也不一定装了 node——只用 curl + grep 读编排面。
  # 编排面只认请求头 x-orchestrator-request，不认 cookie（实测：带头 200，不带头 403）。
  BODY=$(curl -s -m 4 -H 'x-orchestrator-request: 1' -w '\n%{http_code}' "http://127.0.0.1:$PORT/orchestrator/api/state" 2>/dev/null)
  CODE=${BODY##*$'\n'}; JSON=${BODY%$'\n'*}
  echo "[3/4 面板] 跳过（桌面安装拿不到 token；Chief 在不在场看界面）"
  if [ "$CODE" != "200" ]; then
    echo "[4/4 SuperAgent] http=$CODE"
    if [ "$CODE" = "404" ]; then echo "RESULT: 路由 404 = 插件没激活"; else echo "RESULT: SuperAgent 未就绪"; fi
    exit 1
  fi
  MASTER=$(printf '%s' "$JSON" | grep -oE '"masterId":"[^"]+"' | head -n 1 | cut -d'"' -f4)
  if printf '%s' "$JSON" | grep -q '"state":"ready"' && [ -n "$MASTER" ]; then
    echo "[4/4 SuperAgent] http=200 orchestrator=ready masterId=${MASTER:8:8}"
    echo "RESULT: SuperAgent 就绪（绑定一致性未核对）"
    exit 0
  fi
  echo "[4/4 SuperAgent] http=200 orchestrator=NOT-READY masterId=${MASTER:0:8}…"
  echo "RESULT: SuperAgent 未就绪"
  exit 1
fi
node --input-type=module -e "
const BASE='http://127.0.0.1:$PORT';
const r1=await fetch(BASE+'/?token=$TOKEN',{redirect:'manual'});
const cookie=(r1.headers.get('set-cookie')||'').split(';')[0];
const call=(e,p)=>fetch(BASE+'/api/bot',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({endpoint:e,payload:p})}).then(r=>r.json());
const st=await call('state',{since:0});
const chief=st.value?(st.value.mainBotIds||[])[0]:null;
console.log('[3/4 面板] chief='+(chief?'OK '+chief.slice(8,16):'MISSING'));
if(!chief){console.log('RESULT: Chief 不在');process.exit(1)}
const orch=await fetch(BASE+'/orchestrator/api/state',{headers:{'x-orchestrator-request':'1',cookie,origin:BASE}}).then(r=>r.json()).catch(()=>null);
const ready=orch&&orch.health&&orch.health.runtime&&orch.health.runtime.state==='ready';
// 纠错轮二（Codex 复测 #2）：绑定一致性读数——chief（ds-bot state）与 masterId（SuperAgent 绑定）
// 漂移=半切换（新段能回复但 watch/KV 留旧段），health 不能只报进程绿。
const bindConsistent = orch && chief && orch.masterId === chief;
console.log('[4/4 SuperAgent] orchestrator='+(ready?'ready':'NOT-READY')+' masterId='+(orch?String(orch.masterId).slice(8,16):'-')+' bind='+(bindConsistent?'CONSISTENT':'**DRIFTED**'));
console.log(ready && bindConsistent ?'RESULT: 全链健康':'RESULT: '+(ready?'绑定漂移（masterId≠Chief 当前段）':'SuperAgent 未就绪'));
process.exit(ready && bindConsistent ?0:1);
"
