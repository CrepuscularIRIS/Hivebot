import fs from 'node:fs';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {promisify} from 'node:util';
import net from 'node:net';
import path from 'node:path';
const run = promisify(cp.execFile);
const {startSshHost} = await import('/dev/shm/bot-T2/app/sdk/tests/support/ssh-host.ts');
const before = process.env.PATH;
const mode = process.argv[2] || 'normal';
let host;
const born = [];
const spawn = cp.spawn;
cp.spawn = (...args) => { const child = spawn(...args); born.push(child.pid); return child; };
syncBuiltinESMExports();
try {
  if (mode === 'setup-failure') {
    const original = fs.realpathSync;
    fs.realpathSync = (...args) => {
      if (String(args[0]).endsWith('/helper.js')) throw new Error('probe: helper resolution failed');
      return original(...args);
    };
    syncBuiltinESMExports();
    try { host = await startSshHost(); } catch (e) { console.log('SETUP_ERROR', e.message); }
    fs.realpathSync = original; syncBuiltinESMExports();
    console.log('PATH_RESTORED', process.env.PATH === before);
    console.log('CHILDREN_ALIVE', born.filter(p => fs.existsSync(`/proc/${p}`)));
    fs.writeFileSync(path.join(process.env.HOME, 'state.json'), JSON.stringify({born,dir:process.env.PATH?.split(':')[0]?.replace(/\/bin$/, '')}));
  } else {
    host = await startSshHost();
    const sshArgs = ['-F',path.join(host.dir,'ssh_config'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes'];
    console.log('HOST', JSON.stringify({dir:host.dir,port:host.port,born}));
    for (const file of ['', 'keys/client_ed25519', 'keys/ssh_host_ed25519_key','authorized_keys','known_hosts']) {
      console.log('MODE',file||'.',(fs.statSync(path.join(host.dir,file)).mode & 0o777).toString(8));
    }
    const {stdout:shell} = await run('/usr/bin/ssh',[...sshArgs,'pbots-ssh-test','printf "uid=%s home=%s cwd=%s\\n" "$(id -u)" "$HOME" "$PWD"']);
    console.log('SHELL',shell.trim());
    const server = net.createServer(sock => sock.end('PRIVATE_TEST_CANARY\n'));
    await new Promise(r => server.listen(0,'127.0.0.1',r));
    const target = server.address().port;
    try {
      const {stdout} = await run('/usr/bin/ssh',[...sshArgs,'-W',`127.0.0.1:${target}`,'pbots-ssh-test'],{timeout:8000});
      console.log('DIRECT_TCP',stdout.trim());
    } finally { await new Promise(r => server.close(r)); }
    const wrong = path.join(process.env.HOME,'wrong-key');
    await run('ssh-keygen',['-q','-t','ed25519','-N','','-f',wrong]);
    try {
      await run('/usr/bin/ssh',['-F','/dev/null','-i',wrong,'-p',String(host.port),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o',`UserKnownHostsFile=${host.dir}/known_hosts`,'-o','GlobalKnownHostsFile=/dev/null',`${process.env.USER}@127.0.0.1`,'true'],{timeout:8000});
      console.log('WRONG_KEY_ACCEPTED');
    } catch (e) { console.log('WRONG_KEY_REJECTED',/Permission denied \(publickey\)/.test(e.stderr)); }
    if (mode === 'exit-without-stop') {
      fs.writeFileSync(path.join(process.env.HOME,'state.json'),JSON.stringify({born,dir:host.dir,port:host.port}));
      console.log('EXIT_WITHOUT_STOP');
      process.exit(17);
    }
    await host.stop();
    console.log('PATH_RESTORED',process.env.PATH === before);
    console.log('LISTENER_ALIVE_AFTER_STOP',born.some(p => fs.existsSync(`/proc/${p}`)));
    const log=fs.readFileSync(path.join(host.dir,'sshd.log'),'utf8');
    console.log('PRIVATE_KEY_IN_SSHD_LOG',/BEGIN .*PRIVATE KEY/.test(log));
    const config=(await run('/usr/sbin/sshd',['-T','-f',path.join(host.dir,'sshd_config')])).stdout;
    console.log('EFFECTIVE_CONFIG',config.split('\n').filter(l=>/^(port|listenaddress|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|allowtcpforwarding|allowstreamlocalforwarding|permituserenvironment|permituserrc|trustedusercakeys|authorizedkeyscommand|hostbasedauthentication|permitopen|permitlisten|forcecommand) /.test(l)).join('; '));
  }
} finally {
  if (host && mode !== 'exit-without-stop') await host.stop();
  if (mode === 'setup-failure') {
    for (const p of born) if (fs.existsSync(`/proc/${p}`)) {
      console.log('REAP',p);
      console.log((await run('/home/lingxufeng/bot/scripts/bot-reap',[String(p)])).stdout.trim());
    }
  }
}
