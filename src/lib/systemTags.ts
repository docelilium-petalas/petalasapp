// Tags "de sistema" — fonte única de verdade compartilhada entre:
// - src/app/actions/crm.ts (sincroniza deal.tags com deal.prioridade)
// - src/app/actions/desafios.ts (fallback das Regras de Desafios por tag)
// - src/lib/categories.ts (garante que as tags existam em Configurações > Categorias)
//
// Módulo sem 'use server' e sem 'use client': arquivos 'use server' só podem
// exportar funções async, então esse mapeamento não pode viver em crm.ts/desafios.ts.

export const PRIORITY_SYSTEM_TAGS: Record<string, string> = {
  BAIXA: 'Lead AP',
  MEDIA: 'Zona Cinza',
  ALTA: 'Lead Desqualificado',
}

export const SYSTEM_TAG_COLORS: Record<string, string> = {
  'Lead AP': '#34d399',
  'Zona Cinza': '#fbbf24',
  'Lead Desqualificado': '#fb7185',
}

export const ALL_SYSTEM_TAGS = Object.values(PRIORITY_SYSTEM_TAGS)
