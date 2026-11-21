import subprocess, os, sys, time, json, socket, pathlib, shutil
T = pathlib.Path(sys.argv[1])
out = open(T / 'runner.out', 'w')
p = subprocess.Popen(['pnpm', '--dir', '/dev/shm/bot-T2/app/sdk', '--config.verify-deps-before-run=false', 'exec', 'node', '/tmp/bot-rvS-signal.mjs'], stdout=out, stderr=out)
try:
    end = time.monotonic() + 30
    while not (T / 'home/state.json').exists() and time.monotonic() < end and p.poll() is None:
        time.sleep(.05)
    s = json.loads((T / 'home/state.json').read_text())
    subprocess.run(['/home/lingxufeng/bot/scripts/bot-reap', str(s['runner'])], check=True)
    p.wait(timeout=10)
    print('RUNNER_EXIT', p.returncode, flush=True)
    print('KEY_DIRECTORY_AFTER_SIGTERM', os.path.exists(s['dir']), flush=True)
    sock = socket.socket()
    sock.settimeout(2)
    print('LISTENER_OPEN_AFTER_SIGTERM', sock.connect_ex(('127.0.0.1', s['port'])) == 0, flush=True)
    sock.close()
    for pid in s['born']:
        if pathlib.Path('/proc', str(pid)).exists():
            subprocess.run(['/home/lingxufeng/bot/scripts/bot-reap', str(pid)], check=False)
    for d in s['ownDshDirs']:
        if d.startswith('/tmp/dsh-ssh-'):
            shutil.rmtree(d, ignore_errors=True)
finally:
    out.close()
    if p.poll() is None:
        subprocess.run(['/home/lingxufeng/bot/scripts/bot-reap', str(p.pid)], check=False)
