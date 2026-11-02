#!/usr/bin/env python3 -I
# W0.5 机械 diff：0.18 原版 asar（/dev/shm/grok-re/0.18.0/app，来自 Setup.exe）vs 0.78.1 asar（/dev/shm/grok-re/0.78.1/app）
# 产出：axis1-deps.tsv / axis2-chunks.tsv / axis3-preloads.tsv / axis4-proto.tsv / proto-fields.tsv / owners.tsv + d7-check.txt
# 运行：python3 -I w05.py [--outdir DIR]（默认 /dev/shm/grok-re/w05，另复制到脚本旁 output/）
import json, re, sys, shutil
from pathlib import Path
from collections import Counter, defaultdict

OLD = Path('/dev/shm/grok-re/0.18.0/app')
NEW = Path('/dev/shm/grok-re/0.78.1/app')
OUT = Path('/dev/shm/grok-re/w05')
SELF = Path(__file__).resolve().parent

argv = sys.argv[1:]
if '--outdir' in argv:
    OUT = Path(argv[argv.index('--outdir') + 1])
OUT.mkdir(parents=True, exist_ok=True)

def w(name, rows):
    p = OUT / name
    with open(p, 'w', encoding='utf-8') as f:
        for r in rows:
            f.write('\t'.join(str(c) for c in r) + '\n')
    print(f'{name}: {len(rows)-1} data rows -> {p}')

# ---------------- 轴① 依赖 ----------------
oldpkg = json.loads((OLD / 'package.json').read_text(encoding='utf-8'))
newpkg = json.loads((NEW / 'package.json').read_text(encoding='utf-8'))
olddep = {**oldpkg.get('dependencies', {}), **oldpkg.get('devDependencies', {})}
newdep = {**newpkg.get('dependencies', {}), **newpkg.get('devDependencies', {})}
added1 = sorted(set(newdep) - set(olddep))
removed1 = sorted(set(olddep) - set(newdep))
rows = [('id', '方向', '包名', '版本0.18', '版本0.78.1', '类别')]
n = 0
for p in added1:
    n += 1
    cat = '@anysphere' if p.startswith('@anysphere/') else ('@sand' if p.startswith('@sand/') else '外部')
    rows.append((f'W05-1-{n}', '新增', p, '-', newdep[p], cat))
for p in removed1:
    cat = '@anysphere' if p.startswith('@anysphere/') else ('@sand' if p.startswith('@sand/') else '外部')
    rows.append(('-', '删除', p, olddep[p], '-', cat))
w('axis1-deps.tsv', rows)

# ---------------- 轴② chunk 语义名 ----------------
# Vite/Rolldown chunk 名 = <name>-<hash>，hash 恰 8 字符 [A-Za-z0-9_$-]（可含内部/尾部连字符）。
# 从尾迭代剥 "-XXXXXXXX"（限 2 轮，0.18 为双 hash），hash 须含大写/数字/_ $。
def is_hashish(s):
    return any(c.isupper() or c.isdigit() or c in '_$' for c in s)

HASH_TAIL = re.compile(r'-([A-Za-z0-9_$-]{8})$')

def semantic(fname):
    stem = re.sub(r'\.(js|cjs|mjs|css|html)$', '', fname)
    for _ in range(2):
        m = HASH_TAIL.search(stem)
        if not m or not is_hashish(m.group(1)):
            break
        stem = stem[:m.start()]
    segs = stem.split('-')
    if len(segs) <= 1:
        return None
    # 纯 hash 名：chunk-<HASH> / index-<HASH> 之类只剩无语义段
    if len(segs) == 2 and segs[0] in ('chunk', 'index', 'assets') and re.match(r'^[A-Z0-9_$]{6,}$', segs[1]):
        return None
    return '-'.join(segs)

def fam_counts(root):
    c = Counter()
    for p in (root / 'dist').rglob('*'):
        if p.is_file() and p.suffix in ('.js', '.cjs', '.mjs', '.css', '.html'):
            s = semantic(p.name)
            if s: c[s] += 1
    return c

oldfam, newfam = fam_counts(OLD), fam_counts(NEW)
added2 = sorted(set(newfam) - set(oldfam))
removed2 = sorted(set(oldfam) - set(newfam))
rows = [('id', '族', '方向', '0.18文件数', '0.78.1文件数')]
n = 0
for f in added2:
    n += 1
    rows.append((f'W05-2-{n}', f, '新增', 0, newfam[f]))
for f in removed2:
    rows.append(('-', f, '删除', oldfam[f], 0))
w('axis2-chunks.tsv', rows)

# ---------------- 轴③ preload 入口 ----------------
oldpre = sorted(p.name for p in (OLD / 'dist/electron-preload').glob('*.cjs'))
newpre = sorted(p.name for p in (NEW / 'dist/electron-preload').glob('*.cjs'))
rows = [('id', '入口', '方向', '0.18', '0.78.1', 'contextBridge键')]
bridge = defaultdict(set)
for root, store in ((OLD, {}), (NEW, bridge)):
    for p in (root / 'dist/electron-preload').glob('*.cjs'):
        for m in re.finditer(r'exposeInMainWorld\("([^"]+)"', p.read_text(encoding='utf-8', errors='replace')):
            bridge[p.name].add(m.group(1))
n = 0
for f in newpre:
    isnew = f not in oldpre
    if isnew: n += 1
    rows.append((f'W05-3-{n}' if isnew else '-', f, '新增' if isnew else '保留', 'Y' if f in oldpre else '-', 'Y', ';'.join(sorted(bridge[f]))))
for f in oldpre:
    if f not in newpre:
        rows.append(('-', f, '删除', 'Y', '-', ';'.join(sorted(bridge[f]))))
w('axis3-preloads.tsv', rows)

# ---------------- 轴④ proto 服务与方法 ----------------
def parse_new_services(text):
    # minified: qX={typeName:"aiserver.v1.Svc",methods:{m:{name:"M",I:..,...
    svc = {}
    marks = [(m.start(), m.group(1)) for m in re.finditer(r'typeName:"([a-zA-Z0-9_.]+)"', text)]
    for i, (pos, name) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else min(len(text), pos + 60000)
        seg = text[pos:end]
        meth = sorted(set(re.findall(r'[a-zA-Z0-9_]+:\{name:"([A-Za-z0-9_]+)",I:', seg)))
        svc[name] = meth
    return svc

def parse_old_services(text):
    # pretty: typeName: "aiserver.v1.Svc", methods: { m: { name: "M",
    svc = {}
    marks = [(m.start(), m.group(1)) for m in re.finditer(r'typeName: "([a-zA-Z0-9_.]+)"', text)]
    for i, (pos, name) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else min(len(text), pos + 200000)
        seg = text[pos:end]
        meth = sorted(set(re.findall(r'[a-zA-Z0-9_]+: \{\s*\n\s*name: "([A-Za-z0-9_]+)"', seg)))
        svc.setdefault(name, []).extend(m for m in meth if m not in svc.get(name, []))
        svc[name] = sorted(set(svc[name]))
    return svc

newproto = (NEW / 'dist/electron-main/proto.cjs').read_text(encoding='utf-8', errors='replace')
oldmain = (OLD / 'dist/electron-main/main.cjs').read_text(encoding='utf-8', errors='replace')
nsvc, osvc = parse_new_services(newproto), parse_old_services(oldmain)

id4 = 0
def next4():
    global id4
    id4 += 1
    return f'W05-4-{id4}'

rows = [('id', '服务', '方法', '方向', '备注')]
added_methods, removed_methods = [], []
for s in sorted(set(nsvc) | set(osvc)):
    nm, om = set(nsvc.get(s, [])), set(osvc.get(s, []))
    if s not in osvc:
        rid = next4()
        rows.append((rid, s, '(服务)', '新增服务', f'{len(nm)} 方法; 0.18 无此服务'))
        added_methods.append((rid, s, '*'))
        for m in sorted(nm):
            rid = next4()
            rows.append((rid, s, m, '新增方法', '随新增服务'))
            added_methods.append((rid, s, m))
    elif s not in nsvc:
        rows.append(('-', s, '(服务)', '删除服务', f'{len(om)} 方法'))
        for m in sorted(om):
            rows.append(('-', s, m, '删除方法', ''))
            removed_methods.append((s, m))
    else:
        for m in sorted(nm - om):
            rid = next4()
            rows.append((rid, s, m, '新增方法', ''))
            added_methods.append((rid, s, m))
        for m in sorted(om - nm):
            rows.append(('-', s, m, '删除方法', ''))
            removed_methods.append((s, m))
        rows.append(('-', s, f'({len(nm & om)} 个共有方法)', '保留', ';'.join(sorted(nm & om))[:400]))
w('axis4-proto.tsv', rows)

# ---------------- proto-fields.tsv（0.78.1 message 字段表） ----------------
msgs = []  # (msgname, firstfield, literal)
for m in re.finditer(r'static \$\(\)\{return\["((?:[^"\\]|\\.)*)"', newproto):
    lit = m.group(1)
    name = lit.split('|', 1)[0]
    ff = ''
    rest = lit.split('|', 1)[1] if '|' in lit else ''
    parts = rest.split('|') if rest else []
    if parts:
        toks = parts[0].split(' ', 2)  # no name type
        ff = toks[1] if len(toks) >= 2 else parts[0]
    msgs.append((name, ff, lit))
namecount = Counter(x[0] for x in msgs)
oldmsgs = set(re.findall(r'([A-Z][A-Za-z0-9_$]{0,60}) = class _\1 extends Message', oldmain))
# 0.18 的 proto 副本分布在 main / host-main / local-exec-daemon 三个 bundle（coordinator 无内嵌 proto）
for extra in ('dist/host/host-main.cjs', 'dist/local-exec-daemon/main.cjs'):
    p = OLD / extra
    if p.exists():
        oldmsgs |= set(re.findall(r'([A-Z][A-Za-z0-9_$]{0,60}) = class _\1 extends Message',
                                  p.read_text(encoding='utf-8', errors='replace')))

newmsg_names = set(x[0] for x in msgs) - oldmsgs
rows = [('id', 'Msg名', '首字段', '原始串字面量')]
pf_rows = []
for name, ff, lit in msgs:
    isnew = name in newmsg_names
    rid = next4() if isnew else '-'
    disp = f'{name}|1 {ff}' if namecount[name] > 1 else name
    pf_rows.append((rid, disp, ff, lit))
rows.extend(pf_rows)
w('proto-fields.tsv', rows)
newmsg_ids = sorted([r[0] for r in pf_rows if r[0] != '-'], key=lambda x: int(x.rsplit('-', 1)[1]))
dup_names = sorted([k for k, v in namecount.items() if v > 1])
print(f'proto-fields: total {len(msgs)} msgs, new-vs-0.18 {len(newmsg_ids)}, duplicate names {len(dup_names)}: {dup_names}')
print(f'0.18 msg classes: {len(oldmsgs)}')

# ---------------- owners.tsv（入口归属表，只看 0.78.1） ----------------
# 归属映射：关键词 -> RE 主题（人工语义判断，固化在本表使脚本可复跑）
OWNER_RULES = [
    (re.compile(r'^chunk-[A-Z]'), 'ui-shell'),  # 大写驼峰组件名 chunk（Button/CodeBlock/...）
    (re.compile(r'desktop-mount|desktopMount|capture-overlay'), '非 MVP：computer-use（桌面挂载/截屏覆盖层）'),
    (re.compile(r'vnc', re.I), '非 MVP：VNC'),
    (re.compile(r'jpeg-napi', re.I), 'native'),
    (re.compile(r'messages-mac', re.I), 'cloud-deps（mac 消息集成）'),
    (re.compile(r'(?<![A-Za-z])box(?![A-Za-z])|sandbox|云电脑', re.I), '非 MVP：box/云电脑'),
    (re.compile(r'ssh|remote-|sftp', re.I), '非 MVP：远程连接/SSH'),
    (re.compile(r'computer.?use|cua', re.I), '非 MVP：computer-use'),
    (re.compile(r'voice|audio|tts|stt|speech', re.I), 'cloud-deps（语音端点，非 MVP 外围）'),
    (re.compile(r'account|login|auth|sign-?in|billing|payment|stripe|subscription|invoice|wallet|team-?admin', re.I), 'cloud-deps（账号体系/计费端点）'),
    (re.compile(r'marketplace|plugin|mcp|extension|dashboard|registry', re.I), 'marketplace'),
    (re.compile(r'analytics|otel|telemetry|metrics|statsig|sentry|trace|export', re.I), 'cloud-deps（遥测）'),
    (re.compile(r'notification|tray|menubar|update|updater|i18n|lingui|locale', re.I), 'RE-unpack（外壳/更新/i18n）'),
    (re.compile(r'icon|theme|style|font|katex|editor|tiptap|markdown|mdast|highlight|diagram|mermaid|chart|graph|canvas|dnd|motion|toast|dialog|avatar|emoji|composer', re.I), 'ui-shell'),
    (re.compile(r'agent|bot|roster|session|transcript|bot-line|turn|approval|group|automation|memory', re.I), 'features'),
    (re.compile(r'ipc|port|bridge|stream|proto|rpc|chunk-index|index\.eager|onepassword|keychain|secret', re.I), 'ipc-rpc'),
]
def owner_of(name):
    for rx, owner in OWNER_RULES:
        if rx.search(name):
            return owner
    return 'ipc-rpc（兜底：renderer 可达面普查）'

rows = [('入口名', '类型', '锚点', '归属', 'ids')]
def anchor(path, literal):
    return f'{path}#"{literal}"'

# 进程入口
proc_rows = [
    ('electron-main/main.cjs', '进程入口', anchor('dist/electron-main/main.cjs', 'Module._initPaths()'), 'RE-unpack（bootstrap）', ''),
    ('electron-main/main-app.cjs', '进程入口(bundle)', anchor('dist/electron-main/main.cjs', 'main-app'), 'RE-unpack（主进程主体）', ''),
    ('electron-main/main-core.cjs', '进程入口(bundle)', anchor('dist/electron-main/main.cjs', 'main-core'), 'RE-unpack（主进程核心）', ''),
    ('electron-main/proto.cjs', '进程入口(bundle)', anchor('dist/electron-main/main.cjs', 'proto'), 'ipc-rpc（proto 字典）', ''),
    ('electron-main/onepassword-connection-service.cjs', '进程入口(bundle)', anchor('dist/electron-main/onepassword-connection-service.cjs', 'onepassword'), 'cloud-deps（账号体系）', ''),
    ('local-exec-daemon/main.cjs', '进程入口', anchor('dist/electron-main/main-core.cjs', 'local-exec-daemon","main.cjs'), 'ipc-rpc Q1（进程拓扑）', ''),
    ('local-exec-daemon/messages-worker.cjs', '进程入口', anchor('dist/electron-main/main-core.cjs', 'messages-worker'), 'ipc-rpc Q3（流式/消息）', ''),
    ('node-agent-coordinator/main.cjs', '进程入口', anchor('dist/electron-main/main-app.cjs', 'node-agent-coordinator","main.cjs'), 'ipc-rpc Q1（进程拓扑）', ''),
]
rows.extend(proc_rows)
pre_id = {}
for i, f in enumerate([x for x in newpre if x not in oldpre], 1):
    pre_id[f] = f'W05-3-{i}'
for f in newpre:
    anc = anchor(f'dist/electron-preload/{f}', 'exposeInMainWorld') if bridge[f] else f'dist/electron-preload/{f}（无 contextBridge，走 MessageChannel/postMessage）'
    rows.append((f'electron-preload/{f}', 'preload 入口', anc, owner_of(f), pre_id.get(f, '-')))

# contextBridge 键
oldbridge = set()
for p in (OLD / 'dist/electron-preload').glob('*.cjs'):
    oldbridge |= {m.group(1) for m in re.finditer(r'exposeInMainWorld\("([^"]+)"', p.read_text(encoding='utf-8', errors='replace'))}
for f, keys in sorted(bridge.items()):
    for k in sorted(keys):
        if k not in oldbridge:
            rows.append((f'contextBridge:{k}', 'IPC 键', anchor(f'dist/electron-preload/{f}', f'exposeInMainWorld("{k}")'), owner_of(k), '-'))

# 轴① 新增依赖归属
for i, p in enumerate(added1, 1):
    ver = newdep[p]
    rows.append((f'dep:{p}', '依赖', f'package.json dependencies "{p}": "{ver}"', owner_of(p), f'W05-1-{i}'))

# 轴② 新增语义族归属
for i, f in enumerate(added2, 1):
    rows.append((f'chunk族:{f}', 'renderer/主进程 bundle 族', f'dist/**/{f}-*.js（axis2-chunks.tsv W05-2-{i}）', owner_of(f), f'W05-2-{i}'))

# 轴④ 新增服务/方法归属
for rid, s, m in added_methods:
    rows.append((f'proto:{s}.{m}', 'proto 方法', anchor('dist/electron-main/proto.cjs', f'{m}' if m != '*' else s.split('.')[-1]), owner_of(f'{s}.{m}'), rid))

# 新增 message 批量行（字段字典归 ipc-rpc Q2；语义显著者已由上面方法行覆盖服务面）
if newmsg_ids:
    rows.append(('proto:message 新增全集', 'proto message', f'dist/electron-main/proto.cjs static $()（proto-fields.tsv）', 'ipc-rpc Q2（字段字典引用，不逐个展开）', ';'.join(newmsg_ids)))

w('owners.tsv', rows)

# ---------------- D7 自验收 ----------------
defined = set()
for tsv in ('axis1-deps.tsv', 'axis2-chunks.tsv', 'axis3-preloads.tsv', 'axis4-proto.tsv', 'proto-fields.tsv'):
    for line in (OUT / tsv).read_text(encoding='utf-8').splitlines()[1:]:
        c0 = line.split('\t', 1)[0]
        if c0.startswith('W05-'):
            defined.add(c0)
owned = set()
for line in (OUT / 'owners.tsv').read_text(encoding='utf-8').splitlines()[1:]:
    cols = line.split('\t')
    if len(cols) >= 5:
        owned |= {x for x in cols[4].split(';') if x.startswith('W05-')}
missing = sorted(defined - owned, key=lambda x: (x.split('-')[1], int(x.rsplit('-', 1)[1])))
report = [f'defined={len(defined)} owned={len(owned)} missing={len(missing)}']
report += missing
(OUT / 'd7-check.txt').write_text('\n'.join(report) + '\n', encoding='utf-8')
print('D7:', report[0])
if missing:
    print('D7 FAIL: missing ids above')
    sys.exit(1)

# 复制产物到脚本旁 output/，供 verifier 与 BRIEF §6 引用
dst = SELF / 'output'
dst.mkdir(exist_ok=True)
for tsv in OUT.glob('*.tsv'):
    shutil.copy2(tsv, dst / tsv.name)
shutil.copy2(OUT / 'd7-check.txt', dst / 'd7-check.txt')
print('copied to', dst)
