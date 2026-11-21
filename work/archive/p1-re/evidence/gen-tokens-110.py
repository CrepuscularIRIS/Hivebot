#!/usr/bin/env python3 -I
# 静态求值器：grok-bot 1.1.0 sand 主题 token（T97 前置取证）。
# 基线：work/p1-re/evidence/gen-tokens.py（0.78.1 版）。数据仍从 chunk 文本正则提取，零手工转录，不执行目标代码。
#
# 相对 0.78.1 版的适配与修正（全部已对照 1.1.0 源码核实）：
# 1. chunk 换 1.1.0：common=DcDxc78C（app=DNSDeodN / platform=B-dP4sqR 仅核对结构，不参与求值）。
# 2. 压缩名映射（0.78.1 → 1.1.0）：
#    primitives y_→D_；opacity h_→C_(light)/g_→w_(dark)，E_={light:C_,dark:w_}，S_(theme)=E_[appearance]；
#    语法层基表 q_→tv，汇总 X_→iv；token 构造 Q_(color)/$_(themed)/K_→$(mix)/z_→ev(over)；
#    求值 av→(universal)/re_→q_/K_→K_ 递归；ov/sv 数学函数同名换位（ov=hex+alpha, sv=alpha 合成）；
#    变体集合 T_→N_(5,仅 accent)/w_→M_(7)，选择器 E_→P_：`accent?N_:M_`；
#    展开器 z_ 不变名（common 内）；J_ 基础色表、V_/B_ 展开同名；palette W_→Y_(light)/X_(dark)；
#    core slots ERn→iEr（app 内），ma→Ba(=common pv)、ca→Pa(=lv '--sand-' 命名)、da→aee(=z_)、yi→Wi(=common ov)。
# 3. 语义修正两处（0.78.1 gen 的逆向错误，本次按 1.1.0 与 0.78.1 双版本源码核实为同一行为）：
#    a) terminalAnsiBrightBlack：源码 `yi(t('base'),74)` 中 yi 绑定 common 导出 b=Q_(0.78.1)/ov(1.1.0)，
#       即 mix（#rrggbb + alpha hex），不是向白混合的 lighten。0.78.1 输出 #575757/#f8f8f8 是误读。
#    b) success/warn/danger 的 core-slot 变体集合：源码选择器 `e==='accent'?N_:M_`（两版同文），
#       即 danger/success/warn 用 7 变体（含 FillPressed/ForegroundHover），0.78.1 gen 误用 5 变体，
#       少输出 --cursor-{success,warn,danger}-{fill-pressed,foreground-hover} 共 6 token/主题。
# 4. 结构差异：无。两版 primitives(79/79)/opacity(53 键) 数值零变化，tv 基表 61 键零变化，rv 每角色 14 token 同构，
#    iEr/ERn 逐字段同构。因此本脚本输出的 110 值在除上述两修正点外应与 0781 求值逐 token 相等（自检断言）。
import re, sys
from pathlib import Path

COMMON = Path('/home/lingxufeng/bot/work/grok-1.1.0-re/deb110/asar/dist/renderer/assets/index.eager-common-DcDxc78C.js').read_text(encoding='utf8', errors='replace')
TOK0781_CSS = Path('/home/lingxufeng/bot/work/p1-re/evidence/theme-tokens.css').read_text(encoding='utf8')
PALETTE = Path('/home/lingxufeng/bot/app/ui/renderer-grok/overrides/p5-55-palette.css').read_text(encoding='utf8')
OUT_CSS = Path('/home/lingxufeng/bot/work/p1-re/evidence/theme-tokens-110.css')
OUT_TSV = Path('/home/lingxufeng/bot/work/p1-re/evidence/tokens-diff-0781-vs-110.tsv')

def grab_at(text, name):
    i = text.find(name + '={')
    assert i >= 0, name
    j = i + len(name) + 1
    depth, k = 0, j
    while k < len(text):
        c = text[k]
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    return text[j:k+1]

def sub_block(text, anchor):
    mm = re.search(anchor + r':\{', text)
    assert mm, anchor
    j = text.index('{', mm.start()); depth, k = 0, j
    while True:
        if text[k] == '{': depth += 1
        elif text[k] == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    return text[j:k+1]

# --- primitives D_ ---
prim = {}
d_body = grab_at(COMMON, 'D_')
for app in ('light', 'dark'):
    b = sub_block(d_body, app)
    prim[app] = dict(re.findall(r'"([a-z]+/\d)":`(#(?:[0-9a-f]{6}))`', b))
assert len(prim['light']) == 79 and len(prim['dark']) == 79, (len(prim['light']), len(prim['dark']))

# --- opacity C_/w_ + T_ keys ---
op = {}
for tbl, app in (('C_', 'light'), ('w_', 'dark')):
    t = grab_at(COMMON, tbl)
    op[app] = {m.group(1): float(m.group(2)) for m in re.finditer(r'"([^"]+)":(-?[\d.]+)', t)}
assert set(op['light']) == set(op['dark']) and len(op['light']) == 53
T_KEYS = set(op['light'])  # T_=Object.keys(C_)

# --- variant sets & selector (P_: accent→N_ else M_) ---
M_SET = re.findall(r'`(\w+)`', re.search(r'M_=\[([^\]]+)\]', COMMON).group(1))
N_SET = re.findall(r'`(\w+)`', re.search(r'N_=\[([^\]]+)\]', COMMON).group(1))
sel = re.search(r'function P_\(e\)\{return e===`accent`\?N_:M_\}', COMMON)
assert sel and M_SET == ['Fill','FillHover','FillPressed','FillBright','Foreground','ForegroundHover','ForegroundBright'] \
       and N_SET == ['Fill','FillHover','FillBright','Foreground','ForegroundBright']
def P_(role): return N_SET if role == 'accent' else M_SET

# --- L_ primitive index map ---
L_ = {m.group(1): int(m.group(2)) for m in re.finditer(r'(\w+):(\d)', re.search(r'L_=\{([^}]+)\}', COMMON).group(1))}
assert L_ == {'Fill':1,'FillHover':2,'FillPressed':7,'FillBright':0,'Foreground':3,'ForegroundHover':4,'ForegroundBright':1}

# --- roles / hues ---
A_ = re.findall(r'`(\w+)`', re.search(r'A_=\[([^\]]+)\]', COMMON).group(1))
k_ = re.findall(r'`(\w+)`', re.search(r'k_=\[([^\]]+)\]', COMMON).group(1))
assert A_ == ['red','orange','yellow','green','cyan','blue','purple','magenta','brown'] and k_ == ['accent','danger','success','warn']

# --- palette J_ base colors (z_ expander semantics) ---
def z_(roles, fn):  # Object.fromEntries(roles.flatMap(r=>P_(r).map(v=>[`${r}${v}`, fn(v,r)])))
    return {f'{r}{v}': fn(v, r) for r in roles for v in P_(r)}
def V_(role, hue): return z_([role], lambda v, r: '{' + f'{hue}{v}' + '}')
def B_(): return z_(A_, lambda v, r: '{' + f'primitive/{r}/{L_[v]}' + '}')

J_ = {
    'base':'{primitive/neutral/5}','baseHover':'{primitive/neutral/4}',
    'pane':'{primitive/neutral/1}','chrome':'{primitive/neutral/2}',
    'sidebar':'{primitive/neutral/3}','elevated':'{primitive/neutral/0}',
    'focus':'{accentFillBright}',
    **V_('accent','blue'), **V_('danger','red'), **V_('success','green'), **V_('warn','yellow'),
    **B_(),
}
PALETTES = {
    'light': dict(id='sand-light', name='Sand Light', appearance='light', primitives='light',
                  userBubbleFill='FillHover', colors={**J_, 'onPrimary':'{primitive/neutral/1}'}),
    'dark':  dict(id='sand-dark',  name='Sand Dark',  appearance='dark',  primitives='dark',
                  userBubbleFill='Fill',     colors={**J_, 'onPrimary':'{primitive/neutral/5}'}),
}
# 与产物 Y_/X_ 文本核对
assert re.search(r'Y_=\{id:`sand-light`[^}]*userBubbleFill:`FillHover`,colors:\{\.\.\.J_,onPrimary:`\{primitive/neutral/1\}`\}\}', COMMON)
assert re.search(r'X_=\{id:`sand-dark`[^}]*userBubbleFill:`Fill`,colors:\{\.\.\.J_,onPrimary:`\{primitive/neutral/5\}`\}\}', COMMON)

UNIVERSAL = {'universal/black':'#000000', 'universal/white':'#ffffff'}
RE_PRIM = re.compile(r'\{primitive/([a-z]+/\d+)\}')
RE_THEME = re.compile(r'\{([a-zA-Z]+)\}')

def resolve(key, theme, seen=()):
    if key in UNIVERSAL: return UNIVERSAL[key]
    val = theme['colors'][key]
    if re.fullmatch(r'#[0-9a-f]{6}', val): return val
    m = RE_PRIM.fullmatch(val)
    if m: return prim[theme['primitives']][m.group(1)]
    m = RE_THEME.fullmatch(val)
    if m:
        assert m.group(1) not in seen, f'cycle {key}->{m.group(1)}'
        return resolve(m.group(1), theme, seen + (m.group(1),))
    raise ValueError(f'unresolved {key}={val}')

def hex2rgb(h): return tuple(int(h[1+i*2:3+i*2], 16) for i in range(3))
def rgb2hex(rgb): return '#' + ''.join(f'{round(c):02x}' for c in rgb)
def ov(hex6, pct):   # mix → #rrggbbaa
    a = round(pct * 255 / 100)
    return hex6 + f'{a:02x}'
def sv(fg, pct, back):  # alpha composite
    f, b, a = hex2rgb(fg), hex2rgb(back), pct / 100
    return rgb2hex(tuple(f[i]*a + b[i]*(1-a) for i in range(3)))

# --- 语法层 tv：程序化解析（0.78.1 gen 硬编码，这里改为解析产物，保证发现 added/removed） ---
tv_text = grab_at(COMMON, 'tv')
def parse_call(s):
    m = re.fullmatch(r'(Q|\$|ev)\((.*)\)', s)
    if not m: return None
    fn, args = m.group(1), m.group(2)
    parts = re.findall(r'`([^`]*)`', args)
    if fn == 'Q': assert len(parts) == 1; return ('color', parts[0])
    if fn == '$': assert len(parts) == 2; return ('mix', parts[0], parts[1])
    if fn == 'ev': assert len(parts) == 3; return ('over', parts[0], parts[1], parts[2])

X = {}
for m in re.finditer(r'"([^"]+)":(Q\(.*?\)|\$\((?:[^()]*)\)|ev\(.*?\)|\$_\(\w+=>[^()]*\))(?=[,}])', tv_text):
    key, expr = m.group(1), m.group(2)
    if expr.startswith('$_'):
        # themed：tv 里唯一 'icon/official'，blueForeground(dark)/blueForegroundBright(light)
        assert key == 'icon/official' and 'appearance' in expr, key
        X[key] = ('themed', lambda t: 'blueForeground' if t['appearance']=='dark' else 'blueForegroundBright')
    else:
        tok = parse_call(expr)
        assert tok, (key, expr)
        X[key] = tok
assert len(X) == 61, len(X)

# --- rv 每角色展开（照 1.1.0 rv 源码模板；nv = T_.find(concrete) ?? tmpl） ---
def nv(role, tmpl):
    concrete = tmpl.replace('{role}', role)
    return concrete if concrete in T_KEYS else tmpl
def expand_role(e):
    fill = f'{e}Fill'
    n = lambda t: ('mix', f'{e}FillBright', nv(e, t))
    return {
        f'bg/{e}-primary': ('color', fill),
        f'bg/{e}-primary-hover': ('color', f'{e}FillHover'),
        f'bg/{e}-primary-disabled': ('mix', fill, nv(e, 'bg/{role}-primary-disabled')),
        f'bg/{e}-secondary': n('bg/{role}-secondary'),
        f'bg/{e}-secondary-hover': n('bg/{role}-secondary-hover'),
        f'bg/{e}-secondary-disabled': n('bg/{role}-secondary-disabled'),
        f'bg/{e}-bright': ('color', f'{e}FillBright'),
        f'fill/{e}-bubble-user': ('themed', lambda t, r=e: f"{r}{t['userBubbleFill']}"),
        f'text/{e}-primary': ('color', f'{e}Foreground'),
        f'text/{e}-quaternary': n('text/{role}-quaternary'),
        f'icon/{e}-primary': ('color', f'{e}ForegroundBright'),
        f'border/{e}-primary': ('color', fill),
        f'border/{e}-quaternary': n('border/{role}-quaternary'),
    }
ROLES = k_ + A_
for r in ROLES: X.update(expand_role(r))

def eval_token(tok, theme):
    kind = tok[0]
    if kind == 'color': return resolve(tok[1], theme)
    if kind == 'themed': return resolve(tok[1](theme), theme)
    if kind == 'mix': return ov(resolve(tok[1], theme), op[theme['appearance']][tok[2]])
    if kind == 'over': return sv(resolve(tok[1], theme), op[theme['appearance']][tok[2]], resolve(tok[3], theme))
    raise ValueError(kind)

def tv_name(p): return '--sand-' + p.replace('/', '-')  # lv
def sand_block(theme): return {tv_name(p): eval_token(t, theme) for p, t in X.items()}

# --- core slots iEr（含修正 a/b，见文件头注释） ---
def variants(role, theme):
    return {f'{role}{v}': resolve(f'{role}{v}', theme) for v in P_(role)}
def core_slots(theme):
    e = {}
    for k in ('sidebar','chrome','pane','elevated','base','focus'):
        e[k] = resolve(k, theme)
    e['accent'] = resolve('accentFill', theme)
    e['accentFill'] = resolve('accentFill', theme)
    e['accentForegroundBright'] = resolve('accentForegroundBright', theme)
    e['onPrimary'] = resolve('onPrimary', theme)
    e['brand'] = '#f54e00'  # TRn/rEr
    e['success'] = resolve('successFill', theme)
    e['warn'] = resolve('warnFill', theme)
    e['danger'] = resolve('dangerFill', theme)
    for r in ('success','warn','danger'): e.update(variants(r, theme))
    e['added'] = e['successFill']; e['addedForegroundBright'] = resolve('successForegroundBright', theme)
    e['modified'] = e['warnFill'];  e['modifiedForegroundBright'] = resolve('warnForegroundBright', theme)
    e['removed'] = e['dangerFill']; e['removedForegroundBright'] = resolve('dangerForegroundBright', theme)
    e['untracked'] = resolve('cyanFill', theme); e['untrackedForegroundBright'] = resolve('cyanForegroundBright', theme)
    dark = theme['appearance'] == 'dark'
    o, s = (resolve('elevated', theme), resolve('base', theme)) if dark else (resolve('base', theme), resolve('elevated', theme))
    e['terminalAnsiBlack'] = o; e['terminalAnsiWhite'] = s
    e['terminalAnsiRed'] = resolve('redForeground', theme)
    e['terminalAnsiYellow'] = resolve('yellowForeground', theme)
    e['terminalAnsiGreen'] = resolve('greenForeground', theme)
    e['terminalAnsiCyan'] = resolve('cyanForeground', theme)
    e['terminalAnsiBlue'] = resolve('blueForeground', theme)
    e['terminalAnsiMagenta'] = resolve('magentaForeground', theme)
    e['terminalAnsiBrightBlack'] = ov(resolve('base', theme), 74)  # 修正：Wi=ov（mix），非 lighten
    for c in ('Red','Yellow','Green','Cyan','Blue','Magenta'):
        e[f'terminalAnsiBright{c}'] = resolve(f'{c.lower()}FillBright', theme)
    e['terminalAnsiBrightWhite'] = '#ffffff'
    for r in A_:
        e[r] = resolve(f'{r}Fill', theme)
        e.update(variants(r, theme))
    return e

def kebab(s): return re.sub(r'(?<!^)(?=[A-Z])', '-', s).lower()

# --- 输出 1：theme-tokens-110.css（同 theme-tokens.css 格式） ---
out = ['/* Grok Bot 1.1.0 (sand) theme tokens — statically derived from',
       '   deb110 asar dist/renderer/assets/index.eager-common-DcDxc78C.js (D_/C_/w_/tv/rv/z_/P_/L_/Y_/X_),',
       '   index.eager-app-DNSDeodN.js (iEr/rEr), index.eager-platform-B-dP4sqR.js (结构核对)。',
       '   Generated by work/p1-re/evidence/gen-tokens-110.py; 相对 0.78.1 求值修正两处（见脚本头注释）：',
       '   terminalAnsiBrightBlack=mix(base,74)；success/warn/danger 用 7 变体。其余与 0.78.1 求值逐 token 相等。 */', '']
eval110 = {}
for app in ('light', 'dark'):
    th = PALETTES[app]
    sand = sand_block(th); core = core_slots(th)
    eval110[app] = {**{f'--cursor-{kebab(k)}': v for k, v in core.items()}, **sand}
    out.append(f'/* ===== appearance: {app}  ({th["id"]} · {th["name"]}) ===== */')
    out.append(f'/* dataset.theme = "cursor-{app}"; color-scheme: {app} */')
    out.append(f'[data-theme="cursor-{app}"] {{')
    out.append('  color-scheme: ' + app + ';')
    out.append('  /* --- core slots (--cursor-<slot>) : resolved hex --- */')
    for k in sorted(core): out.append(f'  --cursor-{kebab(k)}: {core[k]};')
    out.append('  /* --- syntax layer (--sand-<path>) : resolved values, #rrggbbaa = mix --- */')
    for k in sorted(sand): out.append(f'  {k}: {sand[k]};')
    out.append('}')
    out.append('')
OUT_CSS.write_text('\n'.join(out), encoding='utf8')

# --- 自检：110 求值 vs 0781 求值（theme-tokens.css）应仅差已声明的两处 ---
eval781 = {}
cur = None
for line in TOK0781_CSS.splitlines():
    m = re.match(r'/\* ===== appearance: (\w+)', line)
    if m: cur = m.group(1)
    if re.match(r'(html)?:root\s*\{', line): cur = None  # chrome 层追加块不属于 sand 求值
    m = re.match(r'\s+(--[\w-]+): ([^;]+);', line)
    if m and cur: eval781.setdefault(cur, {})[m.group(1)] = m.group(2)
selfcheck = {}
for app in ('light', 'dark'):
    a, b = eval781[app], eval110[app]
    diff = {k: (a.get(k), b.get(k)) for k in set(a) | set(b) if a.get(k) != b.get(k)}
    selfcheck[app] = diff

# --- 输出 2：diff TSV（0781 列 = 我们 palette 现值 = 0.78.1 基线） ---
# palette 构成：html[data-theme] 两个 sand 求值块 + chrome 层静态块（html:root 全局 + dataviz/syntax 主题块，
# 来自 0.78.1 index css，与 sand 求值不是一个体系 —— tokens.tsv diff 的正是 chrome 层）。
# 分类：sand 求值体系 token 进值对比；chrome 层 token 标 chrome-static（110 值不在本求值范围，见 tokens.tsv）。
pal = {}
chrome_global = set()
cur = None
in_root = False
for line in PALETTE.splitlines():
    m = re.search(r'html\[data-theme="cursor-(light|dark)"\]', line)
    if m: cur = m.group(1); in_root = False
    if re.match(r'html:root\s*\{', line): cur = None; in_root = True
    m = re.match(r'\s+(--[\w-]+): ([^;]+);', line)
    if m:
        if in_root: chrome_global.add(m.group(1))
        elif cur: pal.setdefault(cur, {})[m.group(1)] = m.group(2)

rows = []
counts = {'changed': 0, 'same': 0, 'added': 0, 'chrome-static': 0}
for app in ('light', 'dark'):
    for tok in sorted(set(pal.get(app, {})) | set(eval110[app])):
        # (body unchanged)
        p110 = eval110[app].get(tok)
        p0781 = pal.get(app, {}).get(tok)
        if p0781 is None:
            status = 'added'; counts['added'] += 1
        elif p110 is None:
            status = 'chrome-static'; counts['chrome-static'] += 1  # palette 有、sand 求值无 → chrome 层（dataviz/syntax 等）
        elif p0781 == p110:
            status = 'same'; counts['same'] += 1
        else:
            status = 'changed'; counts['changed'] += 1
        rows.append((app, tok, p0781 or '', p110 or '', status))
# html:root 全局 chrome 块（duration/ease/spacing/radius/字号/布局等 + var() 别名）：palette 定义了、属 chrome 层
for tok in sorted(chrome_global):
    counts['chrome-static'] += 1
    rows.append(('(root)', tok, '', '', 'chrome-static'))
with OUT_TSV.open('w', encoding='utf8') as f:
    f.write('# appearance\\ttoken\\tvalue_0781_palette\\tvalue_110_derived\\tstatus\n')
    f.write('# status: changed/same/added = sand 求值体系（本表求值）；chrome-static = palette 的 chrome 层静态 token\n')
    f.write('#（0.78.1 index css 来源，1.1.0 同层 diff 见 harness/out/tokens.tsv，不在本求值范围）。\n')
    f.write('appearance\ttoken\tvalue_0781_palette\tvalue_110_derived\tstatus\n')
    for r in rows: f.write('\t'.join(r) + '\n')

# --- 报告 + 抽验 ---
print('sand tokens:', {app: len(sand_block(PALETTES[app])) for app in ('light','dark')})
print('core slots:', {app: len(core_slots(PALETTES[app])) for app in ('light','dark')})
print('self-check 110 vs 0781-derived (expected only the two declared fixes):')
for app in ('light','dark'):
    print(f'  {app}: {len(selfcheck[app])} differing tokens')
    for k, v in sorted(selfcheck[app].items()):
        print(f'    {k}: 0781={v[0]} 110={v[1]}')
print('diff vs palette:', counts)
print('palette parsed tokens:', {app: len(pal.get(app, {})) for app in ('light','dark')})

# 抽验 8 条（值直接取自 1.1.0 产物/手算数学，不经过求值器路径复用）
checks = []
sb = {app: sand_block(PALETTES[app]) for app in ('light','dark')}
cs = {app: core_slots(PALETTES[app]) for app in ('light','dark')}
d110 = dict(prim['light']); d110d = dict(prim['dark'])
# 1-2 sidebar/accent light：对照 D_ 表直值
checks.append(('light --cursor-sidebar', cs['light']['sidebar'], prim['light']['neutral/3'], 'D_ light "neutral/3" 直值'))
checks.append(('light --cursor-accent', cs['light']['accent'], prim['light']['blue/1'], 'D_ light "blue/1" 直值（accentFill={blueFill}={primitive/blue/1}）'))
# 3-4 dark sidebar/accent
checks.append(('dark --cursor-sidebar', cs['dark']['sidebar'], prim['dark']['neutral/3'], 'D_ dark "neutral/3" 直值'))
checks.append(('dark --cursor-accent', cs['dark']['accent'], prim['dark']['blue/1'], 'D_ dark "blue/1" 直值'))
# 5 elevated（--cursor-bg-elevated 属 chrome css 层体系，sand 侧对应 --cursor-elevated）
checks.append(('dark --cursor-elevated', cs['dark']['elevated'], prim['dark']['neutral/0'], 'D_ dark "neutral/0" 直值；注意 --cursor-bg-elevated 是 index css chrome 层 token，非 sand 求值'))
# 6 scrim-heavy 手算：ov(#000000, 95) = #000000 + round(95*255/100)=242=f2
checks.append(('dark --sand-bg-scrim-heavy', sb['dark']['--sand-bg-scrim-heavy'], '#000000' + f'{round(op["dark"]["bg/scrim-heavy"]*255/100):02x}', 'ov 数学手算：black+95%'))
# 7 bright-black（mix 修正）：ov(base,74)，base dark=prim dark neutral/5
checks.append(('dark --cursor-terminal-ansi-bright-black', cs['dark']['terminalAnsiBrightBlack'], prim['dark']['neutral/5'] + 'bd', 'Wi=ov（common export b）实锤：mix 非 lighten；74*255/100=188.7→189=bd'))
# 8 bubble-user light：tv fill/bubble-user = $('base','fill/bubble-user')，opacity light=1
a = round(op['light']['fill/bubble-user'] * 255 / 100)
checks.append(('light --sand-fill-bubble-user', sb['light']['--sand-fill-bubble-user'], prim['light']['neutral/5'] + f'{a:02x}', 'ov 手算：base+fill/bubble-user 光度'))
print('\nspot checks (8):')
ok = True
for name, got, expect, src in checks:
    match = got == expect
    ok &= match
    print(f'  [{"OK" if match else "MISMATCH"}] {name}: derived={got} expected={expect}  [{src}]')
print('ALL SPOT CHECKS PASS' if ok else 'SPOT CHECK FAILURE')
