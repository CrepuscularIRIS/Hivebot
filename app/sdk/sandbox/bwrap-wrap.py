#!/usr/bin/env python3
# P5-01（决策 4）：bash 全入口纯收紧 wrapper。原型: 本仓 R5 探针
# work/p5-parity/evidence/r5-run-qXloBM/bwrap-wrapper.py（-- 分隔符前插入遮蔽），
# 本文件按 PLAN p5-parity P5-01 的挂载序重写并 fail-closed。
#
# 调用形态（dsh sandbox-local runnerCommand，0.2.2-alpha.2 confine()）：
#   python3 -I bwrap-wrap.py [--home H]... [--mask M]... [--never N]...
#                            [--tool T]... [--policy P]...
#                            <dsh bwrap profile args> -- <command argv>
# 挂载序：base(--ro-bind / / …) → --unshare-net → 遮蔽（--mask：目录 --tmpfs /
# 文件 --perms 0644 --ro-bind-data 空fd）→ 工具链白名单 --ro-bind 挂回 → 工作区重 --bind
# （等于/包含任一 --home → 拒绝）→ 策略代码根 --ro-bind（决策 14）→ 落在挂回/
# 重 bind 目录之下的硬 NEVER 根再遮一次（v2.1）→ 命令。
# 一切自身错误：stderr 打 `bwrap: ` 前缀、非零退出、不 exec。唯一例外（v2.1）：
# 本文件缺失时 python3 -I 在加载脚本前报 Errno 2、退出码 2，脚本补不了前缀。
# dry-run：环境变量 BWRAP_WRAP_DRY_RUN=1 时打印最终 argv（每行一个元素）退出 0，
# 不 exec —— 测试用来证明挂载序；它只会拒绝执行，失败方向仍是收紧。
#
# P5-22 联网路径（--permit-root 命中时）追加：宿主侧 supervisor 握手序
# （D1-r1）：bwrap --info-fd 拿 child-pid → 卡 --block-fd → 起 slirp4netns
# （--configure --disable-host-loopback --disable-dns --exit-fd --ready-fd，
# 官方 v1.3.7 静态包，见 bin/README.md）→ ready 后放行。--unshare-net 恒保留：
# 联网来自宿主侧 helper 接入新 netns，不是去掉命名空间（reuse/d1-netns.md §4）。
# helper 任何失败 fail closed：杀 bwrap（命令不跑）、非零退出、bwrap: 前缀——
# 绝不静默降级为断网跑，更绝不去掉 --unshare-net。
import hashlib
import json
import os
import select
import subprocess
import sys
import tempfile
import time

BWRAP = '/usr/bin/bwrap'

# hide_args 为 --ro-bind-data 打开的宿主 fd：execv 路径天然继承；supervisor
# 路径 Popen 默认 close_fds，必须显式 pass_fds 保留（否则 bwrap 收到 Bad file
# descriptor，e2e 差分格实测）。
DATA_FDS = []


def die(msg):
    sys.stderr.write('bwrap: ' + msg + '\n')
    sys.stderr.flush()
    sys.exit(1)


def norm(p):
    if not p or p == '/':
        return p
    return p.rstrip('/')


def is_under(path, root):
    """path == root 或 path 在 root 之下（bwrap 挂载点视角）。"""
    path, root = norm(path), norm(root)
    if root == '/':
        return True
    return path == root or path.startswith(root + '/')


def hide_args(path):
    """遮蔽一个根：目录 --tmpfs；文件 --perms 0644 --ro-bind-data <空fd>（P5-01.f2）。

    旧原语 --ro-bind /dev/null 在 bwrap 0.9.0 下对一切用户 bind 强制 MS_NODEV
    （bind-mount.c: new_flags = current_flags | (devices ? 0 : MS_NODEV) | …），
    字符设备在 nodev 挂载上 open 必 EACCES（cat rc=1；老版本 bwrap 不加 nodev 则
    rc=0——跨版本/跨启动漂移，见 evidence/P5-01/f2-boot-probe.txt 与 P5-06 verify
    f2-repro.txt）。改为挂空普通文件（内容取自宿主 /dev/null 读到的 0 字节），
    open 只走 DAC（0644），rc 恒 0、内容恒空、类型恒普通文件，与 boot 态无关。"""
    if os.path.isdir(path):
        return ['--tmpfs', path]
    if os.path.isfile(path):
        try:
            fd = os.open('/dev/null', os.O_RDONLY)  # 宿主侧读 0 字节；fd 不关闭，exec 时继承给 bwrap
        except OSError as e:
            die('open /dev/null for mask %s failed: %s' % (path, e))
        os.set_inheritable(fd, True)
        DATA_FDS.append(fd)
        return ['--perms', '0644', '--ro-bind-data', str(fd), path]
    return []


# ── P5-22：一次性联网许可（签发侧 src/policy/request-net.mjs）──

PUBLIC_DNS = '1.1.1.1'  # 专用只读 resolv.conf 的公网 DNS（D1-r1：不回退宿主 stub）


def argv_hash(command_argv):
    """sha256(JSON(argv))，与 request-net.mjs 的 JSON.stringify 同一规范
    （json.dumps separators=(',',':') + ensure_ascii=False 对纯字符串数组与
    JSON.stringify 逐字节一致；单测对拍钉死）。"""
    return hashlib.sha256(
        json.dumps(command_argv, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    ).hexdigest()


def claim_permit(root, command_argv, claim):
    """扫描许可目录：命中本会话（env DSH_SESSION_ID）+ argvHash + 未过期的许可。

    claim=True 时 unlink 抢占（一次性：并发 wrapper 只有一个 unlink 成功）；
    过期许可无论归属一律删除（防堆积）。目录缺失 / 无命中 → None（断网路径）。
    解析失败的文件原样跳过（不删也不命中——它不是本 wrapper 签发的形状）。"""
    try:
        names = os.listdir(root)
    except OSError:
        return None
    session = os.environ.get('DSH_SESSION_ID', '')
    want = argv_hash(command_argv)
    now = time.time() * 1000
    matched = None
    for name in sorted(names):
        if not name.endswith('.json'):
            continue
        path = os.path.join(root, name)
        try:
            with open(path, 'r', encoding='utf-8') as fh:
                permit = json.load(fh)
        except (OSError, ValueError):
            continue
        if not isinstance(permit, dict) or permit.get('version') != 1:
            continue
        exp = permit.get('expiresAt')
        if not isinstance(exp, (int, float)):
            continue
        if now > exp:
            try:
                os.unlink(path)
            except OSError:
                pass
            continue
        if matched is None and permit.get('session') == session and permit.get('argvHash') == want:
            if not claim:
                matched = permit  # dry-run：只报形状，不消耗
                continue
            try:
                os.unlink(path)
            except OSError:
                continue  # 被并发 wrapper 抢先：继续找
            matched = permit
    return matched


def write_resolv_conf():
    """宿主侧临时 resolv.conf（0600，用后即删），内容为公网 DNS 单条。"""
    fd, path = tempfile.mkstemp(prefix='bwrap-wrap-resolv-')
    os.write(fd, ('nameserver %s\n' % PUBLIC_DNS).encode('utf-8'))
    os.close(fd)
    return path


def _read_fd(fd, want_json=False, timeout_s=10.0):
    """带 select 截止的读：返回 (bytes, ok)。"""
    buf = b''
    end = time.monotonic() + timeout_s
    while time.monotonic() < end:
        r, _, _ = select.select([fd], [], [], max(0.0, end - time.monotonic()))
        if not r:
            return buf, False
        chunk = os.read(fd, 4096)
        if not chunk:
            return buf, True
        buf += chunk
        if want_json and b'}' in buf:
            return buf, True
        if not want_json and len(buf) >= 1:
            return buf, True
    return buf, False


def run_networked(net_argv, slirp_path, resolv_path):
    """宿主侧 supervisor（D1-r1 握手序）。net_argv 的 '--info-fd'/'--block-fd'
    占位值 'PENDING' 在此处替换为真 fd。任何失败 fail closed：杀 bwrap（命令
    从未放行）、退出 1。许可已在 claim 时消耗——失败重跑需重新 request_network
    （防重试滥用，对模型诚实）。信号链：wrapper 被 kill → bwrap --die-with-parent
    收割沙箱 → exit-fd EOF 收割 slirp。"""
    info_r, info_w = os.pipe()
    block_r, block_w = os.pipe()
    ready_r, ready_w = os.pipe()
    exit_r, exit_w = os.pipe()
    slirp_argv = [slirp_path, '--configure', '--disable-dns', '--mtu=65520',
                  '--exit-fd', str(exit_r), '--ready-fd', str(ready_w)]
    # 测试差分钩子（P5-22 验收：去掉防护开关时网关别名必须命中，证明探针有效）。
    # 仅 launcher env 可达（模型 bash 内 export 不影响本进程环境），生产不设。
    if not os.environ.get('P2SDK_TEST_SLIRP_NO_LOOPBACK_GUARD'):
        slirp_argv.append('--disable-host-loopback')
    bwrap = slirp = None
    try:
        argv = list(net_argv)
        i = argv.index('--info-fd')
        argv[i + 1] = str(info_w)
        j = argv.index('--block-fd')
        argv[j + 1] = str(block_r)
        bwrap = subprocess.Popen(argv, pass_fds=(info_w, block_r, *DATA_FDS))
        os.close(info_w)
        os.close(block_r)
        info, ok = _read_fd(info_r, want_json=True)
        os.close(info_r)
        if not ok or bwrap.poll() is not None:
            die('networked sandbox failed before info (bwrap rc=%s, info=%r)' % (bwrap.poll(), info[:120]))
        child_pid = json.loads(info)['child-pid']
        slirp_argv += ['--userns-path=/proc/%d/ns/user' % child_pid, str(child_pid), 'tap0']
        try:
            # stdout 收掉：slirp 的 banner（Starting slirp…）默认写 stdout，
            # 不收会混进被包裹命令的输出（spike 实测）；诊断走 stderr。
            slirp = subprocess.Popen(slirp_argv, pass_fds=(ready_w, exit_r),
                                     stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        except OSError as e:
            die('spawn slirp4netns %s failed: %s' % (slirp_path, e))
        os.close(ready_w)
        os.close(exit_r)
        ready, ok = _read_fd(ready_r)
        os.close(ready_r)
        if not ok or ready != b'1':
            err = b''
            try:
                os.set_blocking(slirp.stderr.fileno(), False)
                err = os.read(slirp.stderr.fileno(), 4096)
            except OSError:
                pass
            _reap(bwrap, slirp)
            die('slirp4netns did not become ready (ready=%r, stderr=%r)' % (ready, err[:300]))
        os.close(block_w)  # EOF → bwrap 放行 exec 命令
        rc = bwrap.wait()
        os.close(exit_w)  # EOF → slirp 退出
        try:
            slirp.wait(timeout=5)
        except subprocess.TimeoutExpired:
            slirp.kill()
            slirp.wait()
        sys.exit(rc)
    except SystemExit:
        _reap(bwrap, slirp)
        raise
    except Exception as e:
        _reap(bwrap, slirp)
        die('supervisor error: %r' % (e,))
    finally:
        try:
            os.unlink(resolv_path)
        except OSError:
            pass


def _reap(bwrap, slirp):
    """fail-closed 收尾：SIGTERM → 等待 → SIGKILL，只动本 supervisor 的子进程。"""
    for proc, grace in ((bwrap, 2.0), (slirp, 1.0)):
        if proc is None or proc.poll() is not None:
            continue
        try:
            proc.terminate()
            proc.wait(timeout=grace)
        except Exception:
            try:
                proc.kill()
                proc.wait()
            except Exception:
                pass


def main():
    argv = sys.argv[1:]
    buckets = {'--home': [], '--mask': [], '--never': [], '--tool': [], '--policy': []}
    singles = {}
    i = 0
    while i < len(argv):
        tok = argv[i]
        if tok in buckets:
            if i + 1 >= len(argv):
                die('option %s needs a value' % tok)
            buckets[tok].append(argv[i + 1])
            i += 2
        elif tok in ('--permit-root', '--slirp'):
            if i + 1 >= len(argv):
                die('option %s needs a value' % tok)
            singles[tok] = argv[i + 1]
            i += 2
        else:
            break
    rest = argv[i:]
    if not rest:
        die('no sandbox profile arguments after wrapper options')
    if '--' not in rest:
        die("missing '--' separator in profile arguments")
    sep = rest.index('--')
    profile, command = rest[:sep], rest[sep + 1:]
    if not command:
        die('no command after --')

    # --- 解析 dsh bwrapProfileArgs（钉住 0.2.2-alpha.2 形状；漂移即拒绝）---
    base, binds = [], []
    tmpfs_tmp = False
    j = 0
    while j < len(profile):
        tok = profile[j]
        if tok in ('--ro-bind', '--bind'):
            if j + 2 >= len(profile):
                die('%s needs two operands' % tok)
            src, dst = profile[j + 1], profile[j + 2]
            if src != dst:
                die('unsupported %s with src != dst (%s -> %s)' % (tok, src, dst))
            if tok == '--bind':
                binds.append(src)
            else:
                base += [tok, src, dst]
            j += 3
        elif tok == '--tmpfs':
            if j + 1 >= len(profile):
                die('--tmpfs needs an operand')
            if profile[j + 1] == '/tmp':
                tmpfs_tmp = True
            else:
                die('unsupported --tmpfs target %s' % profile[j + 1])
            j += 2
        elif tok == '--dev':
            base += [tok, profile[j + 1]]
            j += 2
        elif tok == '--proc':
            base += [tok, profile[j + 1]]
            j += 2
        elif tok in ('--unshare-pid', '--die-with-parent'):
            base += [tok]
            j += 1
        else:
            die('unsupported profile argument %r' % tok)

    # --- 决策 13 ④：工作区等于/包含任一 HOME → 拒绝运行 ---
    for b in binds:
        for h in buckets['--home']:
            if is_under(h, b):
                die('workspace %s contains HOME %s; refusing to run' % (b, h))

    # --- 组装 ---
    out = [BWRAP]
    out += base
    out += ['--unshare-net']
    for m in buckets['--mask']:
        out += hide_args(m)
    tools_mounted = []
    for t in buckets['--tool']:
        if os.path.isdir(t):
            out += ['--ro-bind', t, t]
            tools_mounted.append(t)
    if tmpfs_tmp:
        out += ['--tmpfs', '/tmp']
    for b in binds:
        out += ['--bind', b, b]
    policies_mounted = []
    for p in buckets['--policy']:
        if os.path.isdir(p):
            out += ['--ro-bind', p, p]
            policies_mounted.append(p)
    # T7d/T7db：skill 根只读覆盖——bash 写 .dsh/skills/.agents/skills 必须失败（挂载
    # 点不可写/rename/rm；与 write/edit 的审阅卡同语义）。从 binds（会话工作区
    # per-bot）派生，bwrap 挂载序：ws 重 bind → 父目录自绑（成挂载点，不可 mv/rm，
    # 父目录内照旧可写）→ 根 ro-bind（后挂载覆盖父绑写权限）→ 再遮。
    # review 高1（fail-closed）：缺根不跳过——真跑先补建（旧工作区/restore 不经
    # 预建，缺根时 bash 可 mkdir+写绕过）；dry-run 只报完整形状不落盘。skill 要
    # 可见可读，不进 remask 集。
    # T7db：符号链接拒绝——realpath 必须等于自身（防宿主侧 makedirs 被 bot 早先
    # 种下的链接引到工作区外建目录/挂载别处）；makedirs 的 OSError 走 die（bwrap: 前缀）。
    dry_here = bool(os.environ.get('BWRAP_WRAP_DRY_RUN'))  # dry 在后文才定义——局部判环境（同语义）
    for b in binds:
        for parent, sub in (('.dsh', '.dsh/skills'), ('.agents', '.agents/skills')):
            pdir = os.path.join(b, parent)
            root = os.path.join(b, sub)
            # T7db review 中1：链接拒绝在 makedirs **之前**（islink 悬空/非悬空全兜——
            # 否则 .dsh 链到已存在可写目录时 skills 先建到外面才 die，宿主副作用已发生）
            for x in (pdir, root):
                if os.path.islink(x):
                    die(f'symlink refused: {x} -> {os.path.realpath(x)}')
            if not os.path.isdir(root) and not dry_here:
                try:
                    os.makedirs(root, exist_ok=True)
                except OSError as e:
                    die(f'makedirs {root} failed: {e}')
            for x in (pdir, root):  # 创建后复查（防中途被换成链接）
                if not dry_here and (os.path.islink(x) or os.path.realpath(x) != x):
                    die(f'symlink refused: {x} -> {os.path.realpath(x)}')
            out += ['--bind', pdir, pdir, '--ro-bind', root, root]
    # 再遮（v2.1）：硬 NEVER 根与 mask 根落在任何挂回/重 bind 目录之下 → 最后再遮一次
    mounted = binds + tools_mounted + policies_mounted
    remask = set()
    for n in buckets['--never'] + buckets['--mask']:
        if any(is_under(n, d) for d in mounted):
            remask.add(norm(n))
    # 只保留最上层（被更浅的已遮根覆盖的去掉），排序保证确定性
    topmost = [n for n in remask if not any(o != n and is_under(n, o) for o in remask)]
    for n in sorted(topmost):
        out += hide_args(n)
    out += ['--'] + command

    # ── P5-22（D-1 定稿 ⑤）：一次性联网许可 ──
    # 命中（session+argvHash+TTL 全符；claim 即 unlink 抢占，一次性由此保证）→
    # 宿主侧 supervisor 起 slirp4netns 接到本 netns；不命中 → 断网路径原样。
    # 许可由 src/policy/request-net.mjs 在用户批准 request_network 后签发（跨语言
    # hash 对拍见 tests/unit/request-net.test.ts 与 tests/e2e/sandbox-wrapper.test.ts
    # 的 mjs 签发 / python 命中双向）。dry-run 只报形状不消耗许可。
    permit_root = singles.get('--permit-root')
    dry = bool(os.environ.get('BWRAP_WRAP_DRY_RUN'))
    permit = claim_permit(permit_root, command, not dry) if permit_root else None
    # 测试钩子优先（P2SDK_TEST_SLIRP_BIN 覆盖 argv 路径，验 fail-closed）；
    # env 只能来自 launcher（模型 bash 改不了父进程环境）。
    slirp = os.environ.get('P2SDK_TEST_SLIRP_BIN') or singles.get('--slirp')
    if permit is not None and slirp:
        # 专用只读 resolv.conf：公网 DNS，绝不回退宿主 stub（内建 DNS 别名
        # 10.0.2.3 已由 slirp --disable-dns 关闭，d1-netns §4 安全校正）。挂在
        # 一切之后，覆盖 base 的 --ro-bind / /。
        resolv = '<RESOLV-CONF>' if dry else write_resolv_conf()
        net = out[:out.index('--')] + [
            '--ro-bind', resolv, '/etc/resolv.conf',
            '--info-fd', '<FD_INFO>' if dry else 'PENDING',
            '--block-fd', '<FD_BLOCK>' if dry else 'PENDING',
            '--'] + command
        if dry:
            sys.stderr.write('bwrap-wrap: network permit matched (session %s, ttl %ds); would run supervisor\n'
                             % (permit.get('session'), max(0, int((permit.get('expiresAt', 0) - time.time() * 1000) / 1000))))
            sys.stdout.write('\n'.join(net) + '\n')
            sys.stdout.flush()
            return
        run_networked(net, slirp, resolv)
        return

    if os.environ.get('BWRAP_WRAP_DRY_RUN'):
        sys.stdout.write('\n'.join(out) + '\n')
        sys.stdout.flush()
        return
    try:
        os.execv(BWRAP, out)
    except OSError as e:
        die('exec %s failed: %s' % (BWRAP, e))


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # 一切内部异常也打前缀、不 exec（决策 4）
        die('internal error: %r' % (e,))
