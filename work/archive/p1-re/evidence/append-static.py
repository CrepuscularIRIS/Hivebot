#!/usr/bin/env python3 -I
# 追加字面量层（源码中已是最终值的 token）。全部来自静态提取的证据，无推导。
from pathlib import Path

CSS = []
A = CSS.append
A('')
A('/* ========== 共享层（appearance 无关；jF/kRn/R8/z6/ARn 字面量） ========== */')
A(':root {')
for k, v in [('instant',50),('fast',100),('normal',150),('slow',200),('slower',300),('drawer',500),('1s',1000),('2s',2000)]:
    A(f'  --cursor-duration-{k}: {v}ms;')
A('  --ease: ease;')
A('  --ease-sharp: cubic-bezier(0.165, 0.84, 0.44, 1);')
A('  --ease-heavy: cubic-bezier(0.645, 0.045, 0.355, 1);')
A('  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);')
A('  --ease-linear: linear;')
# spacing gF：0..20 步进 0.25，×4px；负档 ne-0.25..ne-20
for q in range(0, 81):
    whole, frac = divmod(q, 4)
    k = str(whole) if frac == 0 else f'{whole}.{frac*25}'
    A(f'  --cursor-spacing-{k}: {q}px;')
for whole in range(1, 21):
    A(f'  --cursor-spacing-ne-{whole}: -{whole*4}px;')
    if whole == 1:
        for f in (25, 50, 75):
            A(f'  --cursor-spacing-ne-0-{f}: -{f//25}px;')
for k, v in [('none',0),('xs',2),('sm',4),('base',6),('lg',8),('xl',12),('2xl',14),('3xl',16),('4xl',18),('full',9999)]:
    A(f'  --cursor-radius-{k}: {v}px; /* _F 表；kRn 注入覆盖 base:8 lg:10 xl:14 2xl:16 3xl:18 */')
for k, v in [('sm',20),('md',24),('lg',28),('xl',32)]:
    A(f'  --cursor-height-{k}: {v}px;')
for k, v in [('xs',11),('sm',12),('base',13),('lg',14)]:
    A(f'  --cursor-font-size-{k}: {v}px;')
for k, v in [('xs',14),('sm',16),('base',18),('lg',22)]:
    A(f'  --cursor-line-height-{k}: {v}px;')
for k, v in [('xs','0.07'),('sm','0'),('base','-0.08'),('lg','-0.15'),('xl','0.08'),('2xl','-0.46'),('3xl','-0.26')]:
    A(f'  --cursor-letter-spacing-{k}: {v}px;')
for k, v in [('normal',400),('medium',500),('semibold',600),('bold',700),('normal-code',400),('medium-code',500),('semibold-code',600)]:
    A(f'  --cursor-font-weight-{k}: {v};')
A('  --cursor-font-smoothing-webkit: antialiased;')
A('  --cursor-font-smoothing-moz: grayscale;')
A('  --cursor-elevation-1: 1;')
A('  --cursor-elevation-2: 2;')
A('  --sand-blur-background: 24px;')
A('  --sand-shadow-inline: 0 4px 12px -1px var(--sand-shadow-inline-ambient), 0 2px 4px -2px var(--sand-shadow-inline-key), 0 0 0 1px var(--sand-shadow-ring);')
A('  --sand-shadow-popover: 0 10px 20px -3px var(--sand-shadow-popover-ambient), 0 4px 6px -4px var(--sand-shadow-popover-key), 0 0 0 1px var(--sand-shadow-ring);')
A('  --sand-shadow-modal: 0 20px 32px -5px var(--sand-shadow-modal-ambient), 0 8px 12px -6px var(--sand-shadow-modal-key), 0 0 0 1px var(--sand-shadow-ring);')
A('  --sand-shadow-window: 0 22px 70px 4px var(--sand-shadow-window-ambient), 0 0 0 0.5px var(--sand-shadow-window-edge);')
A("  --sand-font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;")
A("  --sand-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;")
A("  --sand-font-sans-xvf: 'XVF', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;")
A("  --sand-font-mono-xvf: 'XVF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;")
A('  --ui-tooltip-border-width: 0.5px;')
A('  --ui-tooltip-border-radius: 6px;')
A('  --ui-tooltip-font-size: 12px;   /* R6.label */')
A('  --ui-tooltip-line-height: 16px;')
A('  --ui-tooltip-letter-spacing: 0em;')
A('  --ui-tooltip-padding-y: 4px;')
A('  --ui-tooltip-padding-x: 6px;')
for k, v in [('xxs',11),('xs',12),('sm',13),('base',14),('lg',15),('xl',17),('xxl',22),('xxxl',26)]:
    A(f'  --sand-font-size-{k}: {v}px;')
for k, v in [('xxs',16),('xs',16),('sm',18),('base',20),('lg',22),('xl',24),('xxl',28),('xxxl',32)]:
    A(f'  --sand-line-height-{k}: {v}px;')
for k, v in [('xxs','0.01'),('xs','0.01'),('sm','0.015'),('base','0.01'),('lg','0.01'),('xl','0.01'),('xxl','0.01'),('xxxl','0.01')]:
    A(f'  --sand-letter-spacing-{k}: {v}em;')
A('  /* ARn（isXvfTypeface 注入；CSS 静态版为 8px/0px/10px）: */')
A('  --sand-transcript-prose-line-height: 22px;')
A('  --sand-transcript-prose-block-padding: 7px;')
A('  --sand-transcript-prose-one-line-height: 36px;')
A('  --sand-transcript-prose-bubble-radius: 18px;')
A('  --sand-agent-item-avatar-gap: 10px;')
A('  --sand-agent-item-title-gap: 1px;')
A('  --sand-agent-item-radius: 12px;')
A('  --sand-row-glyph-x-height-nudge: 0.5px;')
A('  --sand-menu-row-gap: 6px;')
A('  --sand-menu-row-height: 32px;')
A('  --sand-command-palette-row-gap: 10px;')
A('  --sand-page-title-variation-settings: "opsz" 12;')
A('  /* jRn（XVF + chatProse15px）: */')
A('  --sand-menu-radius: 16px;')
A('  --sand-menu-row-radius: 10px;')
A('  --sand-new-chat-menu-radius: 16px;')
A('  --sand-new-chat-menu-row-radius: 10px;')
A('  --sand-command-palette-radius: 18px;')
A('}')
A('')

DV = {
 'light': dict(cat=['#1084FE','#C24E00','#9159FE','#009957','#FF309B','#C27400','#008F7E','#97683D'],
               other='#777777', neg='#C21D2E', rest='#B5D9FF',
               seq=['#D6EAFF','#80BEFE','#459FFE','#1084FE','#0C64C1','#084382'],
               div=['#C21D2E','#FF8C98','#E8E8E8','#80BEFE','#0C64C1']),
 'dark':  dict(cat=['#1084FE','#FF6700','#9159FE','#00C972','#FF309B','#FF9800','#00BCA6','#97683D'],
               other='#777777', neg='#FF263C', rest='#084382',
               seq=['#052A51','#084382','#0C64C1','#1084FE','#459FFE','#80BEFE'],
               div=['#FF5667','#82131F','#262626','#084382','#459FFE']),
}
A('/* ========== dataviz（Tjn 静态表，--sand-dataviz-*） ========== */')
for app in ('light','dark'):
    d = DV[app]
    A(f'[data-theme="cursor-{app}"] {{')
    for i, c in enumerate(d['cat']):
        A(f'  --sand-dataviz-{i}: {c};')
    A(f"  --sand-dataviz-other: {d['other']};")
    A(f"  --sand-dataviz-negative: {d['neg']};")
    A(f"  --sand-dataviz-single-series-rest: {d['rest']};")
    A(f"  --sand-dataviz-area: {d['cat'][0]}24;")
    for i, c in enumerate(d['seq']):
        A(f'  --sand-dataviz-sequential-{i}: {c};')
    for i, c in enumerate(d['div']):
        A(f'  --sand-dataviz-diverging-{i}: {c};')
    A('}')
A('')

A('/* ========== xRn/SRn 别名层（CRn 注入 :root；值全为 var(--sand-*) 引用） ========== */')
A(':root {')
for name, ref in [
 ('bg-editor','bg-pane'),('bg-chrome','bg-chrome'),('bg-elevated','bg-elevated'),('bg-input','bg-elevated'),
 ('bg-hover','bg-hover'),('bg-active','bg-active'),('bg-selected','bg-active'),('bg-focused','bg-active'),
 ('bg-primary','bg-secondary-hover'),('bg-secondary','bg-secondary-hover'),('bg-tertiary','bg-secondary'),
 ('bg-quaternary','bg-secondary'),('bg-quinary','bg-secondary-disabled'),('bg-card','bg-secondary'),
 ('bg-accent','bg-accent-primary'),('bg-accent-hover','bg-accent-primary-hover'),('bg-accent-secondary','bg-accent-secondary'),
 ('bg-accent-tertiary','bg-accent-secondary'),('bg-accent-quaternary','bg-accent-secondary-disabled'),
 ('bg-link-hover','bg-blue-secondary'),('accent-color','bg-accent-primary'),('foreground','fill-bubble-user'),
 ('text-primary','text-primary'),('text-secondary','text-secondary'),('text-tertiary','text-tertiary'),
 ('text-quaternary','text-quaternary'),('text-invert','text-on-primary'),('text-accent','text-accent-primary'),
 ('text-link','text-accent-primary'),('text-git-added-primary','text-success-primary'),('text-git-removed-primary','text-danger-primary'),
 ('icon-primary','icon-primary'),('icon-secondary','icon-secondary'),('icon-tertiary','icon-tertiary'),
 ('icon-quaternary','icon-quaternary'),('icon-accent-primary','icon-accent-primary'),
 ('icon-git-added-primary','icon-success-primary'),('icon-git-removed-primary','icon-danger-primary'),
 ('stroke-primary','border-primary-translucent'),('stroke-secondary','border-secondary-translucent'),
 ('stroke-tertiary','border-tertiary-translucent'),('stroke-quaternary','border-quaternary-translucent'),
 ('stroke-focused','border-focus-primary'),('focus-ring-color','border-focus-primary'),
 ('stroke-accent','border-accent-primary'),('stroke-red','border-red-primary'),('stroke-cyan-primary','border-cyan-primary'),
 ('border-color','border-secondary-translucent'),
 ('specular-primary','specular-primary'),('specular-secondary','specular-secondary'),
 ('specular-tertiary','specular-tertiary'),('specular-quaternary','specular-quaternary'),
 ('shadow-primary','shadow-popover-ambient'),
]:
    A(f'  --cursor-{name}: var(--sand-{ref});')
A('  --cursor-focus-ring-offset: 1px;')
A('  --cursor-shadow-md: var(--sand-shadow-popover);')
A('  --cursor-box-shadow-sm: 0 1px 3px 0 var(--sand-shadow-control); /* z6.control */')
A('  --cursor-box-shadow-md: var(--sand-shadow-popover);')
A('  --cursor-box-shadow-lg: var(--sand-shadow-window);')
A('  --ui-popup-box-shadow: var(--sand-shadow-popover);')
A('  --ui-tooltip-box-shadow: var(--sand-shadow-inline);')
for c in ['red','orange','yellow','green','cyan','blue','purple','magenta','brown']:
    A(f'  --cursor-bg-{c}-primary: var(--sand-bg-{c}-primary);')
    A(f'  --cursor-bg-{c}-secondary: var(--sand-bg-{c}-secondary);')
    A(f'  --cursor-text-{c}-primary: var(--sand-text-{c}-primary);')
    A(f'  --cursor-icon-{c}-primary: var(--sand-icon-{c}-primary);')
A('}')
A('')

A('/* ========== syntax 高亮（jF syntax 类） ========== */')
A('/* light = Ge(PF)：PF 源板值经 NF() 键映射为 --cursor-syntax-*；dark = He.syntax 原值 */')
SYN_L = [
 ('foreground','oklch(0.191 0 0 / 0.922)'),('background','oklch(0.991 0 0)'),
 ('keyword','oklch(0.488 0.195 13.082)'),('string','oklch(0.7 0.095 290.796)'),
 ('function','oklch(0.662 0.144 39.487)'),('number','oklch(0.567 0.168 346.061)'),
 ('comment','oklch(0.191 0 0 / 0.678)'),('constant','oklch(0.488 0.102 243.616)'),
 ('parameter','oklch(0.191 0 0 / 0.922)'),('punctuation','oklch(0.191 0 0 / 0.922)'),
 ('link','oklch(0.488 0.102 243.616)'),('string-expression','oklch(0.7 0.095 290.796)'),
 ('tag','oklch(0.488 0.195 13.082)'),('attribute','oklch(0.191 0 0 / 0.922)'),
 ('property','oklch(0.191 0 0 / 0.922)'),('type','oklch(0.488 0.102 243.616)'),
 ('variable','oklch(0.191 0 0 / 0.922)'),('class','oklch(0.488 0.102 243.616)'),
 ('language-variable','oklch(0.488 0.195 13.082)'),('constant-variable','oklch(0.488 0.102 243.616)'),
]
SYN_D = [
 ('foreground','oklch(0.878 0.01 286.202)'),('background','oklch(0.209 0 0)'),
 ('keyword','oklch(0.811 0.079 191.639)'),('string','oklch(0.769 0.132 329.919)'),
 ('function','oklch(0.805 0.097 58.138)'),('number','oklch(0.849 0.086 80.222)'),
 ('comment','oklch(0.919 0 0 / 0.369)'),('constant','oklch(0.854 0.131 83.385)'),
 ('parameter','oklch(0.878 0.01 286.202)'),('punctuation','oklch(0.878 0.01 286.202)'),
 ('link','oklch(0.799 0.106 249.274)'),('string-expression','oklch(0.769 0.132 329.919)'),
 ('tag','var(--cursor-syntax-keyword)'),('attribute','var(--cursor-syntax-parameter)'),
 ('property','var(--cursor-syntax-foreground)'),('type','var(--cursor-syntax-constant)'),
 ('variable','var(--cursor-syntax-foreground)'),('class','var(--cursor-syntax-constant)'),
 ('language-variable','var(--cursor-syntax-keyword)'),('constant-variable','var(--cursor-syntax-constant)'),
]
for app, syn in (('light', SYN_L), ('dark', SYN_D)):
    A(f'[data-theme="cursor-{app}"] {{')
    for k, v in syn:
        A(f'  --cursor-syntax-{k}: {v};')
    A('}')
A('')

A('/* ========== 布局常量（index-Dh7EWA8t.css 静态声明 + eager-app JS 字面量） ========== */')
A(':root {')
A('  --sand-shell-grid: 280px minmax(0, 1fr) auto;       /* .sand-1g5hyr8 */')
A('  --sand-shell-grid-collapsed: 0 minmax(0, 1fr) auto; /* .sand-14fal1x */')
A('  --sand-sidebar-anim-duration: 0.2s;                 /* .sand-1r800kn (data-sidebar-animating) */')
A('  --sand-sidebar-anim-ease: cubic-bezier(0.22, 1, 0.36, 1);')
A('  --sand-chat-min-width: 424px;                       /* .sand-1fiktjy */')
A('  --sand-titlebar-block: 38px;                        /* .sand-14mu8d4 默认 */')
A('  --conversation-bubble-max-width: min(640px, calc(100% - 0px));')
A('  --conversation-opposed-inset: clamp(0px, (100% - 480px) * 0.4, 20%);')
A('  --conversation-opposed-inset-human: max(32px, var(--conversation-opposed-inset));')
A('  --conversation-block-gap: 0px;')
A('  --conversation-font-size: 14px;')
A('  --conversation-line-height: 22px;')
A('  --conversation-text-font-size: 14px;')
A('  --conversation-glass-corner-rule: 15px;  /* calc(cursor-radius-xl 14px + 1px) */')
A('  --conversation-surface-border-radius: 14px;')
A('}')
A('/* JS 常量（非 CSS 变量）: sidebar expandedWidth 默认 280、持久化范围 240–400（$T()，键 sand.sidebar.width）；')
A('   infoPane width 默认 320、下限 280；canvas 卡 708×372（JP）；卡片缩略宽 min(80%, 560px, w-82px)（rF/lF） */')

p = Path('/home/lingxufeng/bot/work/p1-re/evidence/theme-tokens.css')
with p.open('a', encoding='utf8') as f:
    f.write('\n'.join(CSS) + '\n')
print('appended; total bytes', p.stat().st_size)
