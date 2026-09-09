/**
 * A COR DA ETAPA, TRAZIDA PARA O REGISTRO DA MARCA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * As cores das etapas moram no BANCO (`Stage.cor`), não no CSS — então nenhuma
 * varredura de classe as alcança. E o que está gravado lá é neon do tema
 * escuro da OCR, medido em 09/09/2026:
 *
 *   #00E676  #39FF88  #2979FF  #FF5722  #FF9100  #00C853  #E91E63
 *
 * Sobre um fundo escuro isso brilha; sobre o blush claro da Doce Lilium vira
 * exatamente a queixa do Owner: "verde, azul, laranja, rosa, vermelha... fica
 * feio". Não é a etapa estar colorida que incomoda — é a cor estar berrando.
 *
 * ── Por que clampar, e não mapear uma a uma ───────────────────────────────
 * Um mapa `#00E676 → sage` conserta as sete que existem hoje e não conserta a
 * oitava, porque a cor da etapa é EDITÁVEL pela tela: no dia em que alguém
 * escolher um roxo fluorescente no seletor, o mapa não tem entrada e o neon
 * volta. Clampar trata a família inteira, inclusive as que ainda não existem.
 *
 * ── O que se preserva, e o que se corta ───────────────────────────────────
 * O MATIZ é preservado inteiro: é ele que distingue uma coluna da outra, e é
 * a escolha que a pessoa fez. O que se corta é o excesso — saturação e
 * luminosidade caem para a mesma faixa das cores de dado do sistema (sage,
 * terracota, argila, azul poeira). A etapa continua sendo "a verde", só que
 * numa verde que combina com a marca.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Teto de saturação. Acima disso a cor lê como semáforo, não como pigmento. */
const SAT_MAX = 42
/** Piso de saturação: cor lavada demais deixa de distinguir a coluna. */
const SAT_MIN = 18
/** Faixa de luminosidade que garante leitura sobre o card claro. */
const LUM_MIN = 34
const LUM_MAX = 48

function hexParaRgb(hex: string): [number, number, number] | null {
  const limpo = hex.trim().replace('#', '')
  const completo =
    limpo.length === 3 ? limpo.split('').map((c) => c + c).join('') : limpo
  if (!/^[0-9a-fA-F]{6}$/.test(completo)) return null
  return [
    parseInt(completo.slice(0, 2), 16),
    parseInt(completo.slice(2, 4), 16),
    parseInt(completo.slice(4, 6), 16),
  ]
}

function rgbParaHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6
  else if (max === gg) h = ((bb - rr) / d + 2) / 6
  else h = ((rr - gg) / d + 4) / 6
  return [h * 360, s * 100, l * 100]
}

/**
 * A cor da etapa, no registro da marca.
 *
 * Devolve `hsl(...)` e não hex de propósito: assim o valor pode ser usado com
 * alpha (`hslComAlpha`) sem uma segunda conversão.
 *
 * Cinza e preto passam quase intactos — quem escolheu neutro escolheu neutro,
 * e forçar saturação mínima num cinza inventaria uma cor que ninguém pediu.
 */
export function harmonizarCorEtapa(cor: string | null | undefined): string {
  const rgb = hexParaRgb(cor ?? '')
  if (!rgb) return 'hsl(var(--brand-rose))' // cor ausente ou inválida
  const [h, s, l] = rgbParaHsl(...rgb)

  if (s < 8) {
    // neutro: só garante que fique legível sobre o card
    return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(clamp(l, LUM_MIN, LUM_MAX))}%)`
  }

  const sat = clamp(s, SAT_MIN, SAT_MAX)
  const lum = clamp(l, LUM_MIN, LUM_MAX)
  return `hsl(${Math.round(h)} ${Math.round(sat)}% ${Math.round(lum)}%)`
}

/** A mesma cor harmonizada, com transparência — para tintas de fundo. */
export function corEtapaComAlpha(cor: string | null | undefined, alpha: number): string {
  const base = harmonizarCorEtapa(cor)
  return base.startsWith('hsl(var(')
    ? `hsl(var(--brand-rose) / ${alpha})`
    : base.replace(/^hsl\((.+)\)$/, `hsl($1 / ${alpha})`)
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/**
 * As cores das etapas padrão, já no registro da marca.
 *
 * Usadas por `/api/auth/register` ao criar o funil inicial. Antes eram os
 * neons acima — ou seja, todo funil novo nascia fora da identidade e alguém
 * teria de corrigir na mão, etapa por etapa.
 */
export const CORES_ETAPA_PADRAO = {
  novo: '#4D6389',        // azul poeira — entrada, ainda sem temperatura
  contato: '#5B7C8D',     // azul acinzentado
  apresentacao: '#8A6736', // argila
  negociacao: '#A9793F',  // ouro velho
  ganho: '#3C6F57',       // sage
  perdido: '#A34F42',     // terracota
} as const
