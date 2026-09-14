/**
 * COMO UM CONTATO APARECE NA TELA — nome, iniciais e telefone.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Reunião de 14/09/2026: "tem gente que chega e não tem nome". O WhatsApp e a
 * Nuvemshop entregam contato sem nome, ou com um nome de uma letra ("æ"), e o
 * CRM mostrava uma linha com avatar vazio e título em branco — no pipeline e
 * na lista de contatos. Aqui mora a regra única: nome de verdade tem pelo
 * menos 2 letras; sem isso, a tela diz "Sem nome · final 1215".
 * ══════════════════════════════════════════════════════════════════════════
 */

type ContatoMin = { nome?: string | null; sobrenome?: string | null; telefone?: string | null }

function limpo(v: unknown): string {
  if (v === undefined || v === null) return ''
  const s = String(v).trim()
  return s === 'undefined' || s === 'null' ? '' : s
}

export function temNome(c: ContatoMin): boolean {
  const letras = `${limpo(c.nome)}${limpo(c.sobrenome)}`.match(/\p{L}/gu) ?? []
  return letras.length >= 2
}

export function nomeDeExibicao(c: ContatoMin | null | undefined): string {
  if (!c) return 'Sem nome'
  if (temNome(c)) return `${limpo(c.nome)} ${limpo(c.sobrenome)}`.trim()
  const digitos = limpo(c.telefone).replace(/\D/g, '')
  return digitos.length >= 4 ? `Sem nome · final ${digitos.slice(-4)}` : 'Sem nome'
}

export function iniciais(c: ContatoMin | null | undefined): string {
  if (!c || !temNome(c)) return '?'
  const n = limpo(c.nome)
  const s = limpo(c.sobrenome)
  const partes = s ? [n, s] : n.split(/\s+/)
  return partes
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => (p.match(/\p{L}/u) ?? [''])[0])
    .join('')
    .toUpperCase()
}

/** 5562981191215 → +55 (62) 98119-1215. Número de fora do Brasil sai com + e os dígitos. */
export function telefoneDeExibicao(tel: string | null | undefined): string {
  const d = limpo(tel).replace(/\D/g, '')
  if (!d) return ''
  const m13 = /^55(\d{2})(\d{5})(\d{4})$/.exec(d)
  if (m13) return `+55 (${m13[1]}) ${m13[2]}-${m13[3]}`
  const m12 = /^55(\d{2})(\d{4})(\d{4})$/.exec(d)
  if (m12) return `+55 (${m12[1]}) ${m12[2]}-${m12[3]}`
  const m11 = /^(\d{2})(\d{5})(\d{4})$/.exec(d)
  if (m11) return `(${m11[1]}) ${m11[2]}-${m11[3]}`
  return `+${d}`
}
