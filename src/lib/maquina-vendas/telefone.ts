/**
 * Telefone, nas três formas que o módulo precisa.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A CHAVE DE 8 DÍGITOS é a que casa lead, loja e conversa do WhatsApp.
 *
 * Ela existe porque o número aparece em formatos diferentes em cada fonte.
 * Medido no banco de produção em 08/09/2026:
 *
 *   · 36 dos 56 contatos têm 12 dígitos — ou seja, SEM o 9º dígito
 *   · 20 têm 13 dígitos, com o 9
 *   · das 103 sessões de WhatsApp, 51 casam com contato
 *
 * Igualdade exata perderia justamente quem está nos dois formatos. E perder o
 * casamento aqui não é um relatório errado: é mandar follow-up para quem já
 * respondeu, que é como se queima um número.
 *
 * 8 e não 9 de propósito — é justamente o 9º que some.
 * ══════════════════════════════════════════════════════════════════════════
 */

export function apenasDigitos(telefone: string | null | undefined): string {
  return (telefone ?? '').replace(/\D/g, '')
}

/**
 * A chave de casamento: os últimos 8 dígitos.
 *
 * String vazia para entrada inválida, e quem chama TEM de tratar: uma chave
 * vazia casaria com toda linha de chave vazia da tabela, o que na prática
 * significa mandar a mensagem de uma pessoa para outra.
 */
export function chaveTelefone(telefone: string | null | undefined): string {
  const d = apenasDigitos(telefone)
  return d.length >= 8 ? d.slice(-8) : ''
}

/**
 * E.164 sem inventar dígito.
 *
 * ⚠️ NÃO acrescenta o 9º dígito quando ele falta. Seria fácil e seria errado:
 * o número gerado não casaria com nada do que já existe no banco nem nas
 * conversas, e a pessoa passaria a receber em duplicata — uma pela linha
 * antiga, outra pela inventada. Quem normaliza para 13 dígitos tem de
 * normalizar as três fontes ao mesmo tempo, e isso é migração, não função.
 */
export function paraE164(telefone: string | null | undefined): string | null {
  const d = apenasDigitos(telefone)
  if (d.length < 10) return null
  if (d.startsWith('55')) return d.length <= 13 ? d : null
  if (d.length === 10 || d.length === 11) return `55${d}`
  return null
}

/** Só o primeiro nome, capitalizado — é assim que a copy chama a pessoa. */
export function primeiroNome(nomeCompleto: string | null | undefined): string | null {
  const limpo = (nomeCompleto ?? '').trim()
  if (!limpo) return null
  const p = limpo.split(/\s+/)[0]
  if (p.length < 2) return null
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
}

/** `(62) 99963-0120` — só para exibir em tela, nunca para comparar. */
export function formatarExibicao(telefone: string | null | undefined): string {
  const d = apenasDigitos(telefone)
  const sem55 = d.startsWith('55') ? d.slice(2) : d
  if (sem55.length === 11) return `(${sem55.slice(0, 2)}) ${sem55.slice(2, 7)}-${sem55.slice(7)}`
  if (sem55.length === 10) return `(${sem55.slice(0, 2)}) ${sem55.slice(2, 6)}-${sem55.slice(6)}`
  return telefone ?? ''
}
