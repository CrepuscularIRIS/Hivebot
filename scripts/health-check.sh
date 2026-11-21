#!/usr/bin/env bash
# goal-0acebfbf R15: 四段健康读数（起—连—发—收）
set -u
TRIAL="${DSBOT_TRIAL:-/tmp/dsbot-trial}"
PIDS=$(ps aux | grep 'resources/app/src/host.mjs' | grep -v grep | awk '{print $2}' | wc -l)
echo "[1/4 引擎] processes=$PIDS"
URL=$($TRIAL/engine.sh url 2>/dev/null); PORT=$(echo "$URL" | grep -oP ':\K[0-9]+' | head -1)
TOKEN=$(echo "$URL" | grep -oP 'token=\K[^ ]+')
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/" 2>/dev/null)
echo "[2/4 web] port=$PORT code=$CODE"
if [ "$CODE" != "401" ] && [ "$CODE" != "302" ]; then echo "RESULT: 引擎/web 未就绪"; exit 1; fi
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
