python3 -I - <<'PY'
import os,json,urllib.request
r={}
for label,p in [('workspace','/home/lingxufeng/bot/work/p5-parity/evidence/r5-run-qXloBM/landlock-read-allowlist/workspace/inside'),('outside','/home/lingxufeng/bot/work/p5-parity/evidence/r5-run-qXloBM/landlock-read-allowlist/outside'),('home','/tmp/r5-sandbox/outside-landlock-read-allowlist'),('tmp','/tmp/r5-write-landlock-read-allowlist')]:
 try:
  with open(p,'w') as f: f.write('r5')
  r[label]='written'
 except OSError as e: r[label]={'errno':e.errno,'error':e.strerror}
try:
 with open('/home/lingxufeng/bot/work/p5-parity/evidence/r5-run-qXloBM/landlock-read-allowlist/secret/sentinel') as f: f.read()
 r['outside_read']='readable'
except OSError as e: r['outside_read']={'errno':e.errno,'error':e.strerror}
try:
 with open(os.path.join(os.environ['DSH_HOME'],'r5-control')) as f: f.read()
 r['dsh_home_read']='readable'
except OSError as e: r['dsh_home_read']={'errno':e.errno,'error':e.strerror}
for label,url in [('loopback','http://127.0.0.1:45845'),('external','https://example.com')]:
 try:
  with urllib.request.urlopen(url,timeout=3) as f: r[label]=f.status
 except Exception as e: r[label]=str(e)
r['env_keys']=sorted(os.environ)
print('R5_RESULT='+json.dumps(r,sort_keys=True))
PY
