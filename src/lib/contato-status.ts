/**
 * O status de um contato na tela de Contatos (modelo CarBoss), derivado dos negócios.
 *
 *   CLIENTE    já comprou (algum negócio ganho)
 *   LEAD       tem negócio aberto e ainda não comprou
 *   PERDIDO    todos os negócios foram perdidos
 *   RECUPERAR  nunca teve negócio — alguém a quem voltar a falar
 */

export type ResumoContato = {
  abertos: number
  ganhos: number
  perdidos: number
  valorGanho: number
  ultimoNegocio: string | null
}

export type StatusContato = 'CLIENTE' | 'LEAD' | 'RECUPERAR' | 'PERDIDO'

export function statusDoContato(r?: Pick<ResumoContato, 'abertos' | 'ganhos' | 'perdidos'> | null): StatusContato {
  if (r?.ganhos) return 'CLIENTE'
  if (r?.abertos) return 'LEAD'
  if (r?.perdidos) return 'PERDIDO'
  return 'RECUPERAR'
}

export const COR_STATUS: Record<StatusContato, { texto: string; borda: string; fundo: string }> = {
  LEAD: { texto: 'text-success', borda: 'border-success/40', fundo: 'bg-success/10' },
  CLIENTE: { texto: 'text-primary', borda: 'border-primary/40', fundo: 'bg-primary/10' },
  RECUPERAR: { texto: 'text-warning', borda: 'border-warning/40', fundo: 'bg-warning/10' },
  PERDIDO: { texto: 'text-destructive', borda: 'border-destructive/40', fundo: 'bg-destructive/10' },
}
