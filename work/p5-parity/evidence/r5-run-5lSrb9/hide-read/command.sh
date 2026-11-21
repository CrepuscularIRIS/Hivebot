python3 -I - <<'PY'
import os,json,urllib.request
r={}
for label,p in [('workspace','/home/lingxufeng/bot/work/p5-parity/evidence/r5-run-5lSrb9/hide-read/workspace/inside'),('outside','/home/lingxufeng/bot/work/p5-parity/evidence/r5-run-5lSrb9/hide-read/outside'),('home','/tmp/r5-sandbox/outside-hide-read'),('tmp','/tmp/r5-write-hide-read')]:
 try:
  with open(p,'w') as f: f.write('r5')
  r[label]='written'
 except OSError as e: r[label]={'errno':e.errno,'error':e.strerror}
try:
 with open('/home/lingxufeng/bot/work/p5-parity/evidence/r5-run-5lSrb9/hide-read/secret/sentinel') as f: f.read()
 r['outside_read']='readable'
except OSError as e: r['outside_read']={'errno':e.errno,'error':e.strerror}
for label,url in [('loopback','http://127.0.0.1:45399'),('external','https://example.com')]:
 try:
  with urllib.request.urlopen(url,timeout=3) as f: r[label]=f.status
 except Exception as e: r[label]=str(e)
r['env_keys']=sorted(os.environ)
print('R5_RESULT='+json.dumps(r,sort_keys=True))
PY
