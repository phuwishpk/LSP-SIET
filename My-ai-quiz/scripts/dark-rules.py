"""Dark-mode rules for the colour classes the AI Quiz pages use.

The pages are written with light Tailwind colours only. In dark mode each one is
mapped to its dark counterpart: pale fills become dark tints of the same hue, dark
text becomes light, saturated accents (rose-600 buttons, white text on them) stay.
The rules sit in app/globals.css between the `dark-rules:start` / `dark-rules:end`
comments. They are unlayered, so they win over Tailwind's utilities - except inside
the shared navbar (`.siet-navbar`), which has its own `dark:` classes.

    python3 scripts/dark-rules.py          # print the rules
    python3 scripts/dark-rules.py --write  # put them into app/globals.css

Run it after adding a light colour class to a page.
"""
import os
import re
import sys

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app')
CSS = os.path.join(APP, 'globals.css')

TOKEN = re.compile(
    r'(?<![\w\-\[])((?:[a-z-]+:)*)(bg|text|border|from|via|to|ring|placeholder)-'
    r'(white|black|slate|gray|rose|pink|amber|emerald|indigo|red|orange|\[#[0-9a-fA-F]{3,8}\])'
    r'(?:-(\d{2,3}))?(?:/(\d{1,3}))?(?![\w\-\[])'
)

# Dark tints: the hue's -950 shade for pale fills, its -900 for lines, and light text shades.
TINT = {'rose': (76, 5, 25), 'pink': (80, 7, 36), 'amber': (69, 26, 3), 'emerald': (2, 44, 34),
        'indigo': (30, 27, 75), 'red': (69, 10, 10), 'orange': (67, 20, 7)}
LINE = {'rose': (136, 19, 55), 'pink': (131, 24, 67), 'amber': (120, 53, 15), 'emerald': (6, 78, 59),
        'indigo': (55, 48, 163), 'red': (127, 29, 29), 'orange': (124, 45, 18)}
TEXT_LIGHT = {'rose': ('#fb7185', '#fda4af', '#fecdd3'), 'pink': ('#f472b6', '#f9a8d4', '#fbcfe8'),
              'amber': ('#fbbf24', '#fcd34d', '#fde68a'), 'emerald': ('#34d399', '#6ee7b7', '#a7f3d0'),
              'indigo': ('#818cf8', '#a5b4fc', '#c7d2fe'), 'red': ('#f87171', '#fca5a5', '#fecaca'),
              'orange': ('#fb923c', '#fdba74', '#fed7aa')}
NEUTRAL_BG = {50: '#1c1c20', 100: '#27272a', 200: '#3f3f46', 300: '#52525b', 400: '#52525b', 800: '#52525b', 900: '#3f3f46'}
NEUTRAL_TEXT = {300: '#71717a', 400: '#8a8a93', 500: '#a1a1aa', 600: '#d4d4d8', 700: '#e4e4e7', 800: '#f4f4f5', 900: '#fafafa'}
NEUTRAL_LINE = {100: '#27272a', 200: '#3f3f46', 300: '#52525b'}
HEX = {'#f8fafc': ('bg', '#09090b'), '#fafbfc': ('bg', '#0f0f12'), '#fffdf7': ('bg', '#1c1917'), '#0f172a': ('both', None),
       '#1e293b': ('text', '#f4f4f5'), '#e11d48': ('text', '#fb7185'), '#f43f5e': ('text', '#fb7185'),
       '#fdf2f8': ('grad', (80, 7, 36, .55)), '#fce7f3': ('grad', (80, 7, 36, .35)), '#ffe4e6': ('grad', (76, 5, 25, .45))}

PROP = {'bg': 'background-color: {v}', 'text': 'color: {v}', 'placeholder': 'color: {v}', 'border': 'border-color: {v}',
        'ring': '--tw-ring-color: {v}', 'from': '--tw-gradient-from: {v}', 'via': '--tw-gradient-via: {v}',
        'to': '--tw-gradient-to: {v}'}
PSEUDO = {'hover': ':hover', 'focus': ':focus', 'active': ':active', 'disabled': ':disabled', 'focus-visible': ':focus-visible'}
NOT_NAVBAR = ':not(.siet-navbar *)'


def rgba(rgb, a):
    return f'rgb({rgb[0]} {rgb[1]} {rgb[2]} / {round(a, 3)})'


def with_alpha(hexcol, a):
    if a >= 1:
        return hexcol
    h = hexcol.lstrip('#')
    return rgba(tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)), a)


def dark_value(kind, color, shade, alpha):
    a = (alpha / 100) if alpha is not None else 1.0
    shade = int(shade) if shade else None
    if color.startswith('[#'):
        hx = color[1:-1].lower()
        rule = HEX.get(hx)
        if not rule:
            return None
        if hx == '#0f172a':
            return '#fafafa' if kind == 'text' else ('#3f3f46' if kind == 'bg' else None)
        if rule[0] == 'grad':
            return rgba(rule[1][:3], rule[1][3]) if kind in ('from', 'via', 'to') else None
        if rule[0] == kind:
            return with_alpha(rule[1], a)
        return None
    if color == 'white':
        return with_alpha('#18181b', a) if kind in ('bg', 'from', 'via', 'to') else None  # white text stays
    if color == 'black':
        return None
    if color in ('slate', 'gray'):
        if kind == 'bg' and shade in NEUTRAL_BG:
            return with_alpha(NEUTRAL_BG[shade], a) if shade != 900 else ('#3f3f46' if a >= 1 else rgba((0, 0, 0), a))
        if kind in ('text', 'placeholder') and shade in NEUTRAL_TEXT:
            return NEUTRAL_TEXT[shade]
        if kind in ('border', 'ring') and shade in NEUTRAL_LINE:
            return with_alpha(NEUTRAL_LINE[shade], a)
        return None
    if shade is None:
        return None
    if kind in ('bg', 'from', 'via', 'to'):
        if shade <= 50:
            return rgba(TINT[color], .45 * a)
        if shade <= 100:
            return rgba(TINT[color], .65 * a)
        if shade <= 200:
            return rgba(LINE[color], .6 * a)
        return None  # saturated fills stay
    if kind in ('border', 'ring'):
        if shade <= 100:
            return rgba(LINE[color], .45 * a)
        if shade <= 200:
            return rgba(LINE[color], .6 * a)
        if shade == 300:
            return rgba(LINE[color], .9 * a)
        return None
    if kind in ('text', 'placeholder'):
        light = TEXT_LIGHT[color]
        if shade <= 600:
            return light[0] if shade >= 500 else None
        if shade == 700:
            return light[1]
        return light[2]
    return None


def esc(cls):
    return re.sub(r'([:/\[\]#.])', r'\\\1', cls)


def rules():
    used = set()
    for folder, dirs, files in os.walk(APP):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.next')]
        for name in files:
            if name.endswith(('.tsx', '.ts')):
                with open(os.path.join(folder, name), encoding='utf-8') as source:
                    used.update(m.group(0) for m in TOKEN.finditer(source.read()))
    out = []
    for tok in sorted(used):
        m = TOKEN.fullmatch(tok)
        variants = [v for v in m.group(1).split(':') if v]
        kind, color, shade, alpha = m.group(2), m.group(3), m.group(4), m.group(5)
        if any(v.startswith('dark') or v in ('sm', 'md', 'lg', 'xl') for v in variants):
            continue
        value = dark_value(kind, color, shade, int(alpha) if alpha else None)
        if value is None:
            continue
        sel, group, pseudo_el = '.' + esc(tok), False, ''
        for var in variants:
            if var in PSEUDO:
                sel += PSEUDO[var]
            elif var == 'group-hover':
                group = True
            elif var == 'placeholder':
                pseudo_el = '::placeholder'
            else:
                sel = None
                break
        if sel is None:
            continue
        if kind == 'placeholder':
            pseudo_el = '::placeholder'
        prefix = ":root[data-theme='dark'] .group:hover " if group else ":root[data-theme='dark'] "
        out.append(f"{prefix}{sel}{NOT_NAVBAR}{pseudo_el} {{ {PROP[kind].format(v=value)}; }}")
    return out


def main():
    lines = rules()
    if '--write' not in sys.argv:
        print('\n'.join(lines))
        return
    with open(CSS, encoding='utf-8') as f:
        css = f.read()
    start, end = '/* dark-rules:start', '/* dark-rules:end */'
    a = css.index('\n', css.index(start)) + 1
    b = css.index(end)
    with open(CSS, 'w', encoding='utf-8') as f:
        f.write(css[:a] + '\n'.join(lines) + '\n' + css[b:])
    print(f'{len(lines)} rules written to app/globals.css')


if __name__ == '__main__':
    main()
