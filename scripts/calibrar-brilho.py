"""Deriva a escala visual inteira a partir de UM número: a luminosidade do card.

    python scripts/calibrar-brilho.py 96

Antes eu ajustava token por token, e cada suavização do card deixava para trás
valores calibrados contra o branco antigo — foi assim que três razões caíram
sozinhas quando o card saiu de #FFFFFF. Aqui o card é a ENTRADA e todo o resto
é consequência calculada: mudar o brilho da interface volta a ser trocar um
número e rodar de novo.

Idempotente: os padrões casam qualquer `<h> <s>% <l>%`, então rodar duas vezes
com o mesmo argumento não muda nada.
"""
import colorsys
import io
import re
import sys


def rgb(h, s, l):
    return colorsys.hls_to_rgb(h / 360, l / 100, s / 100)


def lum(c):
    f = lambda x: x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = [f(v) for v in c]
    return .2126 * r + .7152 * g + .0722 * b


def cr(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + .05) / (min(la, lb) + .05)


def hx(c):
    return '#' + ''.join(f'{int(round(v * 255)):02X}' for v in c)


CARD_L = float(sys.argv[1]) if len(sys.argv) > 1 else 96.0
CARD_H, CARD_S = 345, 45
CARD = rgb(CARD_H, CARD_S, CARD_L)


def escurece(h, s, alvo, ref=CARD):
    """O L mais claro que ainda atinge `alvo` de contraste contra `ref`."""
    L = 99.0
    while L > 0:
        c = rgb(h, s, L)
        if cr(c, ref) >= alvo:
            return round(L, 1), c
        L -= 0.1
    raise SystemExit(f'impossivel atingir {alvo} com h={h} s={s}')


# ── Superfícies ─────────────────────────────────────────────────────────────
PAGE_H, PAGE_S = 345, 34
page_L = CARD_L
while cr(CARD, rgb(PAGE_H, PAGE_S, page_L)) < 1.22:
    page_L -= 0.1
page_L = round(page_L, 1)
PAGE = rgb(PAGE_H, PAGE_S, page_L)

sec_L = round(CARD_L - 2.5, 1)
mut_L = round(CARD_L - 4.0, 1)
acc_L = round(CARD_L - 5.5, 1)

# Papel: mesma luminosidade do card, matiz deslocado do blush para o marfim.
PAPER_H, PAPER_S = 32, 30
PAPER = rgb(PAPER_H, PAPER_S, CARD_L)
PB_H, PB_S = 32, 22
pb_L, pb = escurece(PB_H, PB_S, 1.55, PAPER)

# ── Linhas e texto ──────────────────────────────────────────────────────────
sub_L, sub = escurece(345, 22, 1.28)
bd_L, bd = escurece(345, 26, 1.90)
st_L, st = escurece(345, 20, 3.05)
fgm_L, fgm = escurece(345, 16, 6.00)
ink_L, ink = escurece(348, 46, 7.00)

# ── Cores de dado, na chave DELICADA ────────────────────────────────────────
# A primeira versão usava matiz saturado (verde 58%, âmbar 72%) e o Owner
# apontou em 08/09/2026: "esse verde, aquela cor laranja, não está legal nessa
# identidade visual". Estava certo — saturação alta briga com uma marca cuja
# assinatura é blush e vinho.
#
# A correção não é clarear (clarear derruba o contraste): é DESSATURAR e
# escurecer. Cor apagada e profunda lê como pigmento; cor saturada lê como
# semáforo, e semáforo não combina com moda.
POS_H, POS_S = 152, 30   # sage, no lugar do emerald
NEG_H, NEG_S = 8, 42     # terracota, no lugar do vermelho
WRN_H, WRN_S = 35, 44    # argila / ouro velho, no lugar do laranja
INF_H, INF_S = 218, 28   # azul poeira, no lugar do azul puro

pos_L, pos = escurece(POS_H, POS_S, 5.20)
neg_L, neg = escurece(NEG_H, NEG_S, 5.00)
wrn_L, wrn = escurece(WRN_H, WRN_S, 4.60)
inf_L, inf = escurece(INF_H, INF_S, 5.40)

T = '[\\d.]+ [\\d.]+% [\\d.]+%'          # casa qualquer trio HSL
R = '[^\\n]*'

SUBS = [
    (f'--background: {T};{R}',
     f'--background: {PAGE_H} {PAGE_S}% {page_L}%;   /* {hx(PAGE)} - a pagina. {cr(CARD, PAGE):.2f}:1 sob o card */'),
    (f'--card: {T};{R}',
     f'--card: {CARD_H} {CARD_S}% {CARD_L}%;         /* {hx(CARD)} - {(1 - lum(CARD)) * 100:.0f}% menos brilho que branco puro.'),
    (f'--popover: {T};', f'--popover: {CARD_H} {CARD_S}% {CARD_L}%;'),
    (f'--paper: {T};{R}',
     f'--paper: {PAPER_H} {PAPER_S}% {CARD_L}%;      /* {hx(PAPER)} - marfim, para pilha de tarefas */'),
    (f'--paper-border: {T};{R}',
     f'--paper-border: {PB_H} {PB_S}% {pb_L}%; /* {hx(pb)} - {cr(pb, PAPER):.2f}:1 sobre o papel */'),
    (f'--secondary: {T};{R}',
     f'--secondary: 345 30% {sec_L}%;    /* {hx(rgb(345, 30, sec_L))} - um degrau abaixo do card */'),
    (f'--muted: {T};{R}',
     f'--muted: 345 26% {mut_L}%;        /* {hx(rgb(345, 26, mut_L))} - era OLIVA. 193 usos corrigidos */'),
    (f'--accent: {T};{R}',
     f'--accent: 345 34% {acc_L}%;       /* {hx(rgb(345, 34, acc_L))} - era OLIVA */'),
    (f'--border-subtle: {T};{R}',
     f'--border-subtle: 345 22% {sub_L}%;  /* {hx(sub)} - {cr(sub, CARD):.2f}:1. Divisorias internas   */'),
    (f'--border: {T};{R}',
     f'--border: 345 26% {bd_L}%;         /* {hx(bd)} - {cr(bd, CARD):.2f}:1. Contorno de card      */'),
    (f'--border-strong: {T};{R}',
     f'--border-strong: 345 20% {st_L}%;  /* {hx(st)} - {cr(st, CARD):.2f}:1. Campos e interativos  */'),
    (f'--input: {T};{R}',
     f'--input: 345 20% {st_L}%;          /* input usa a forte: e elemento de interacao */'),
    (f'--muted-foreground: {T};{R}',
     f'--muted-foreground: 345 16% {fgm_L}%; /* {hx(fgm)} - {cr(fgm, CARD):.2f}:1 sobre card */'),
    (f'--brand-ink: {T};{R}',
     f'--brand-ink: 348 46% {ink_L}%;     /* {hx(ink)} - {cr(ink, CARD):.2f}:1. O rosa quando e TEXTO */'),

    (f'--success: {T};{R}',
     f'--success: {POS_H} {POS_S}% {pos_L}%;      /* {hx(pos)} sage - {cr(pos, CARD):.2f}:1 */'),
    (f'--destructive: {T};{R}',
     f'--destructive: {NEG_H} {NEG_S}% {neg_L}%;   /* {hx(neg)} terracota - {cr(neg, CARD):.2f}:1 */'),
    (f'--warning: {T};{R}',
     f'--warning: {WRN_H} {WRN_S}% {wrn_L}%;      /* {hx(wrn)} argila - {cr(wrn, CARD):.2f}:1 */'),
    (f'--info: {T};{R}',
     f'--info: {INF_H} {INF_S}% {inf_L}%;       /* {hx(inf)} azul poeira - {cr(inf, CARD):.2f}:1 */'),

    (f'--priority-alta: {T};', f'--priority-alta: {NEG_H} {NEG_S}% {neg_L}%;'),
    (f'--priority-media: {T};', f'--priority-media: {WRN_H} {WRN_S}% {wrn_L}%;'),
    (f'--priority-baixa: {T};', f'--priority-baixa: {POS_H} {POS_S}% {pos_L}%;'),
    (f'--status-open: {T};', f'--status-open: {INF_H} {INF_S}% {inf_L}%;'),
    (f'--status-won: {T};', f'--status-won: {POS_H} {POS_S}% {pos_L}%;'),
    (f'--status-lost: {T};', f'--status-lost: {NEG_H} {NEG_S}% {neg_L}%;'),
    (f'--chart-3: {T};', f'--chart-3: {POS_H} {POS_S}% {pos_L}%;'),
    (f'--chart-4: {T};', f'--chart-4: {INF_H} {INF_S}% {inf_L}%;'),
    (f'--chart-5: {T};', f'--chart-5: {WRN_H} {WRN_S}% {wrn_L}%;'),
]

p = 'src/app/globals.css'
s = io.open(p, encoding='utf-8').read()
faltou = []
for pat, novo in SUBS:
    s, n = re.subn(pat, lambda m, v=novo: v, s, count=1)
    if n == 0:
        faltou.append(pat.split(':')[0])
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

FG = rgb(345, 45, 14)
print(f'card    {hx(CARD)}  L={CARD_L}%  -{(1 - lum(CARD)) * 100:.1f}% de brilho vs branco puro')
print(f'pagina  {hx(PAGE)}  separacao {cr(CARD, PAGE):.2f}:1')
print(f'papel   {hx(PAPER)}  borda {hx(pb)} ({cr(pb, PAPER):.2f}:1)')
print(f'campo   {hx(rgb(345, 30, sec_L))}   muted {hx(rgb(345, 26, mut_L))}   accent {hx(rgb(345, 34, acc_L))}')
print(f'bordas  sutil {cr(sub, CARD):.2f}   card {cr(bd, CARD):.2f}   forte {cr(st, CARD):.2f}')
print(f'texto   principal {cr(FG, CARD):.1f}:1   suave {cr(fgm, CARD):.2f}:1   rosa {cr(ink, CARD):.2f}:1')
print(f'dados   sage {hx(pos)} {cr(pos, CARD):.2f}   terracota {hx(neg)} {cr(neg, CARD):.2f}')
print(f'        argila {hx(wrn)} {cr(wrn, CARD):.2f}   azul {hx(inf)} {cr(inf, CARD):.2f}')
print(f'branco  no vinho {cr((1, 1, 1), rgb(346, 58, 17)):.2f}:1   no rosa solido {cr((1, 1, 1), rgb(351, 46, 53.1)):.2f}:1')
if faltou:
    print('\nNAO CASOU:', *faltou, sep='\n  ')
else:
    print('\ntodos os tokens recalibrados')
