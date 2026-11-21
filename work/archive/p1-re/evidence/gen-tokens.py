#!/usr/bin/env python3 -I
# 静态求值器：grok-bot 0.78.1 sand 主题 token。
# 数据（primitives hex 表、opacity 表）从 chunk 文本正则提取，零手工转录；
# 组合规则按逆向读懂的源码实现（tv/ev/Q_/$_/z_/ERn），不执行目标代码。
import re, json, sys
from pathlib import Path

COMMON = Path('/home/lingxufeng/bot/work/p1-re/evidence/chunks/index.eager-common-DbK3Oi_r.js').read_text(encoding='utf8', errors='replace')

def grab_table(name):
    i = COMMON.find(name + '={')
    assert i >= 0, name
    j = i + len(name) + 1
    depth, k = 0, j
    while k < len(COMMON):
        c = COMMON[k]
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    return COMMON[j:k+1]

def parse_entries(text):
    # "key":`value` 或 "key":number
    return dict(re.findall(r'"([^"]+)":`([^`]*)`', text)) , \
           {m.group(1): float(m.group(2)) for m in re.finditer(r'"([^"]+)":(-?[\d.]+)[,}]', text)}

def grab_table_at(text, prefix):
    i = text.find(prefix + ':{')
    assert i >= 0, prefix
    j = i + len(prefix) + 1
    depth, k = 0, j
    while k < len(text):
        c = text[k]
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    return text[j:k+1]

# --- primitives y_ = {light:{...},dark:{...}} ---
yi = COMMON.find('y_={light:')
seg = COMMON[yi:COMMON.find('b_=[', yi)]
prim = {}
for app in ('light', 'dark'):
    t = grab_table_at(seg, app)
    hexes = re.findall(r'"([a-z]+/\d)":`(#(?:[0-9a-f]{6}))`', t)
    prim[app] = dict(hexes)
assert len(prim['light']) == 79 and len(prim['dark']) == 79, (len(prim['light']), len(prim['dark']))

# --- opacity h_/g_ ---
op = {}
for tbl, app in (('h_', 'light'), ('g_', 'dark')):
    t = grab_table(tbl)
    nums = {m.group(1): float(m.group(2)) for m in re.finditer(r'"([^"]+)":(-?[\d.]+(?:\.\d+)?)', t)}
    op[app] = nums

# --- palette B_（硬编码规则，已从源码逐条核对） ---
K_VAR = {'Fill':1,'FillHover':2,'FillPressed':7,'FillBright':0,'Foreground':3,'ForegroundHover':4,'ForegroundBright':1}
NINE = ['red','orange','yellow','green','cyan','blue','purple','magenta','brown']
T_SET = ['Fill','FillHover','FillBright','Foreground','ForegroundBright']   # accent/danger/success/warn
W_SET = ['Fill','FillHover','FillPressed','FillBright','Foreground','ForegroundHover','ForegroundBright']

def build_colors():
    c = {
        'base':'{primitive/neutral/5}','baseHover':'{primitive/neutral/4}',
        'pane':'{primitive/neutral/1}','chrome':'{primitive/neutral/2}',
        'sidebar':'{primitive/neutral/3}','elevated':'{primitive/neutral/0}',
        'focus':'{accentFillBright}',
    }
    for role, hue in (('accent','blue'),('danger','red'),('success','green'),('warn','yellow')):
        for v in T_SET:
            c[f'{role}{v}'] = '{' + f'{hue}{v}' + '}'
    for hue in NINE:
        for v, idx in K_VAR.items():
            c[f'{hue}{v}'] = '{' + f'primitive/{hue}/{idx}' + '}'
    return c

B = build_colors()
PALETTES = {
    'light': dict(id='sand-light', name='Sand Light', appearance='light', primitives='light',
                  userBubbleFill='FillHover', colors={**B, 'onPrimary':'{primitive/neutral/1}'}),
    'dark':  dict(id='sand-dark',  name='Sand Dark',  appearance='dark',  primitives='dark',
                  userBubbleFill='Fill',     colors={**B, 'onPrimary':'{primitive/neutral/5}'}),
}

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

def mix_alpha(hex6, pct):  # Q_: -> #rrggbbaa
    a = round(pct * 255 / 100)
    return hex6 + f'{a:02x}'
def over(fg, pct, back):   # $_: alpha-composite fg over back -> opaque hex
    f, b, a = hex2rgb(fg), hex2rgb(back), pct / 100
    return rgb2hex(tuple(f[i]*a + b[i]*(1-a) for i in range(3)))
def lighten(hex6, pct):    # yi(): toward white by pct（terminalAnsiBrightBlack 用）
    f, w, a = hex2rgb(hex6), (255,255,255), pct/100
    return rgb2hex(tuple(f[i]*a + w[i]*(1-a) for i in range(3)))

# --- 语法层 X_ = q_ + 每色系 Y_ 展开 ---
def tok_color(color): return ('color', color)
def tok_themed(fn):   return ('themed', fn)
def tok_mix(color, opkey): return ('mix', color, opkey)
def tok_over(color, opkey, backdrop): return ('over', color, opkey, backdrop)

X = {
    'bg/pane': tok_color('pane'), 'bg/chrome': tok_color('chrome'),
    'bg/sidebar': tok_color('sidebar'), 'bg/elevated': tok_color('elevated'),
    'bg/elevated-hover': tok_over('base','bg/hover','elevated'),
    'bg/luminous': tok_color('onPrimary'),
    'bg/scrim': tok_mix('universal/black','bg/scrim'),
    'bg/scrim-heavy': tok_mix('universal/black','bg/scrim-heavy'),
    'bg/hover': tok_mix('base','bg/hover'), 'bg/active': tok_mix('base','bg/active'),
    'bg/primary': tok_color('base'), 'bg/primary-hover': tok_color('baseHover'),
    'bg/primary-disabled': tok_mix('base','bg/primary-disabled'),
    'bg/secondary': tok_mix('base','bg/secondary'),
    'bg/secondary-hover': tok_mix('base','bg/secondary-hover'),
    'bg/secondary-active': tok_mix('base','bg/secondary-active'),
    'bg/secondary-disabled': tok_mix('base','bg/secondary-disabled'),
    'bg/tertiary': tok_mix('base','bg/tertiary'), 'bg/quaternary': tok_mix('base','bg/quaternary'),
    'fill/bubble-agent': tok_mix('base','fill/bubble-agent'),
    'fill/bubble-user': tok_mix('base','fill/bubble-user'),
    'fill/attachment-card': tok_over('base','fill/attachment-card','elevated'),
    'fill/attachment-paper': tok_over('base','fill/attachment-paper','elevated'),
    'fill/attachment-ink': tok_mix('base','fill/attachment-ink'),
    'text/primary': tok_color('base'), 'text/secondary': tok_mix('base','text/secondary'),
    'text/tertiary': tok_mix('base','text/tertiary'), 'text/quaternary': tok_mix('base','text/quaternary'),
    'text/on-primary': tok_color('onPrimary'), 'text/inverted': tok_color('chrome'),
    'icon/primary': tok_mix('base','icon/primary'), 'icon/secondary': tok_mix('base','icon/secondary'),
    'icon/tertiary': tok_mix('base','icon/tertiary'), 'icon/quaternary': tok_mix('base','icon/quaternary'),
    'icon/official': tok_themed(lambda t: 'blueForeground' if t['appearance']=='dark' else 'blueForegroundBright'),
    'border/primary-translucent': tok_mix('base','border/primary-translucent'),
    'border/secondary-translucent': tok_mix('base','border/secondary-translucent'),
    'border/tertiary-translucent': tok_mix('base','border/tertiary-translucent'),
    'border/quaternary-translucent': tok_mix('base','border/quaternary-translucent'),
    'border/attachment-card': tok_mix('base','border/attachment-card'),
    'border/attachment-paper': tok_mix('base','border/attachment-paper'),
    'border/focus-primary': tok_color('focus'),
    'border/pane': tok_color('pane'), 'border/chrome': tok_color('chrome'),
    'border/elevated': tok_color('elevated'),
    'shadow/control': tok_mix('base','shadow/control'), 'shadow/card': tok_mix('base','shadow/card'),
    'shadow/secondary': tok_mix('base','shadow/secondary'),
    'shadow/inline/ambient': tok_mix('base','shadow/inline/ambient'),
    'shadow/inline/key': tok_mix('base','shadow/inline/key'),
    'shadow/popover/ambient': tok_mix('base','shadow/popover/ambient'),
    'shadow/popover/key': tok_mix('base','shadow/popover/key'),
    'shadow/modal/ambient': tok_mix('base','shadow/modal/ambient'),
    'shadow/modal/key': tok_mix('base','shadow/modal/key'),
    'shadow/window/ambient': tok_mix('base','shadow/window/ambient'),
    'shadow/window/edge': tok_mix('base','shadow/window/edge'),
    'shadow/ring': tok_mix('base','shadow/ring'),
    'specular/primary': tok_mix('universal/white','specular/primary'),
    'specular/secondary': tok_mix('universal/white','specular/secondary'),
    'specular/tertiary': tok_mix('universal/white','specular/tertiary'),
    'specular/quaternary': tok_mix('universal/white','specular/quaternary'),
}

ROLES = ['accent','danger','success','warn'] + NINE
def J(role, tmpl, app):
    concrete = tmpl.replace('{role}', role)
    return concrete if concrete in op[app] else tmpl

def expand_role(role):
    e = {}
    e[f'bg/{role}-primary'] = tok_color(f'{role}Fill')
    e[f'bg/{role}-primary-hover'] = tok_color(f'{role}FillHover')
    e[f'bg/{role}-primary-disabled'] = tok_mix(f'{role}Fill', ('J', role, 'bg/{role}-primary-disabled'))
    e[f'bg/{role}-secondary'] = tok_mix(f'{role}FillBright', ('J', role, 'bg/{role}-secondary'))
    e[f'bg/{role}-secondary-hover'] = tok_mix(f'{role}FillBright', ('J', role, 'bg/{role}-secondary-hover'))
    e[f'bg/{role}-secondary-disabled'] = tok_mix(f'{role}FillBright', ('J', role, 'bg/{role}-secondary-disabled'))
    e[f'bg/{role}-bright'] = tok_color(f'{role}FillBright')
    e[f'fill/{role}-bubble-user'] = tok_themed(lambda t, r=role: f"{r}{t['userBubbleFill']}")
    e[f'text/{role}-primary'] = tok_color(f'{role}Foreground')
    e[f'text/{role}-quaternary'] = tok_mix(f'{role}FillBright', ('J', role, 'text/{role}-quaternary'))
    e[f'icon/{role}-primary'] = tok_color(f'{role}ForegroundBright')
    e[f'border/{role}-primary'] = tok_color(f'{role}Fill')
    e[f'border/{role}-quaternary'] = tok_mix(f'{role}FillBright', ('J', role, 'border/{role}-quaternary'))
    return e

for r in ROLES: X.update(expand_role(r))

def opacity_for(opkey, theme):
    app = theme['appearance']
    if isinstance(opkey, tuple) and opkey[0] == 'J':
        return op[app][J(opkey[1], opkey[2], app)]
    return op[app][opkey]

def eval_token(tok, theme):
    kind = tok[0]
    if kind == 'color': return resolve(tok[1], theme)
    if kind == 'themed': return resolve(tok[1](theme), theme)
    if kind == 'mix': return mix_alpha(resolve(tok[1], theme), opacity_for(tok[2], theme))
    if kind == 'over': return over(resolve(tok[1], theme), opacity_for(tok[2], theme), resolve(tok[3], theme))
    raise ValueError(kind)

def tv(path): return '--sand-' + path.replace('/', '-')

def sand_block(theme):
    return {tv(p): eval_token(t, theme) for p, t in X.items()}

# --- core 基础槽 ERn(pa[e]) ---
def variants(role, theme):
    vs = T_SET if role in ('accent','danger','success','warn') else W_SET
    out = {}
    for v in vs: out[f'{role}{v}'] = resolve(f'{role}{v}', theme)
    return out

def core_slots(theme):
    e = {}
    for k in ('sidebar','chrome','pane','elevated','base','focus'):
        e[k] = resolve(k, theme)
    e['accent'] = resolve('accentFill', theme)
    e['accentFill'] = resolve('accentFill', theme)
    e['accentForegroundBright'] = resolve('accentForegroundBright', theme)
    e['onPrimary'] = resolve('onPrimary', theme)
    e['brand'] = '#f54e00'
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
    e['terminalAnsiBrightBlack'] = lighten(resolve('base', theme), 74)
    for c in ('Red','Yellow','Green','Cyan','Blue','Magenta'):
        e[f'terminalAnsiBright{c}'] = resolve(f'{c.lower()}FillBright', theme)
    e['terminalAnsiBrightWhite'] = '#ffffff'
    for r in NINE:
        e[r] = resolve(f'{r}Fill', theme)
        e.update(variants(r, theme))
    return e

def kebab(s):
    return re.sub(r'(?<!^)(?=[A-Z])', '-', s).lower()

# --- 输出 ---
out = ['/* Grok Bot 0.78.1 (sand) theme tokens — statically derived from',
       '   app.asar dist/renderer/assets/index.eager-app-iGTgHP_Q.js (RRn/FRn/ERn/R8),',
       '   index.eager-common-DbK3Oi_r.js (pa/y_/h_/g_/X_), index.eager-platform-C2su3Zzb.js (MF/jF).',
       '   Generated by work/p1-re/evidence/gen-tokens.py; values verified against token rules in source. */', '']
import html
for app in ('light', 'dark'):
    th = PALETTES[app]
    sand = sand_block(th)
    core = core_slots(th)
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

Path('/home/lingxufeng/bot/work/p1-re/evidence/theme-tokens.css').write_text('\n'.join(out), encoding='utf8')
print('sand tokens:', {app: len(sand_block(PALETTES[app])) for app in ('light','dark')})
print('core slots:', {app: len(core_slots(PALETTES[app])) for app in ('light','dark')})
print('light bg/pane', sand_block(PALETTES['light'])['--sand-bg-pane'], 'dark bg/pane', sand_block(PALETTES['dark'])['--sand-bg-pane'])
print('light text/secondary', sand_block(PALETTES['light'])['--sand-text-secondary'], 'dark text/secondary', sand_block(PALETTES['dark'])['--sand-text-secondary'])
print('light accent bg/primary', sand_block(PALETTES['light'])['--sand-bg-accent-primary'], 'dark', sand_block(PALETTES['dark'])['--sand-bg-accent-primary'])
print('light fill/bubble-user', sand_block(PALETTES['light'])['--sand-fill-bubble-user'], 'dark', sand_block(PALETTES['dark'])['--sand-fill-bubble-user'])
print('light shadow/popover/ambient', sand_block(PALETTES['light'])['--sand-shadow-popover-ambient'], 'dark', sand_block(PALETTES['dark'])['--sand-shadow-popover-ambient'])
