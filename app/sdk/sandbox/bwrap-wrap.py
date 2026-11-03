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
import os
import sys

BWRAP = '/usr/bin/bwrap'


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
        return ['--perms', '0644', '--ro-bind-data', str(fd), path]
    return []


def main():
    argv = sys.argv[1:]
    buckets = {'--home': [], '--mask': [], '--never': [], '--tool': [], '--policy': []}
    i = 0
    while i < len(argv):
        tok = argv[i]
        if tok in buckets:
            if i + 1 >= len(argv):
                die('option %s needs a value' % tok)
            buckets[tok].append(argv[i + 1])
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
