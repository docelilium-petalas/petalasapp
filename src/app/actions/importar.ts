'use server'

/**
 * IMPORTAR CONTATOS DE PLANILHA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A regra que organiza este arquivo: **julgar e gravar são passos separados,
 * e o julgamento é o MESMO nos dois.**
 *
 * `analisar()` diz o que vai acontecer com cada linha e não escreve nada.
 * `executar()` chama `analisar()` de novo e só então grava. Não existe um
 * segundo caminho de decisão — se a prévia disse "criar 42, atualizar 9,
 * ignorar 3", é isso que acontece.
 *
 * Isso importa porque importação é irreversível na prática. Uma tela que
 * grava 500 contatos e SÓ ENTÃO diz "3 linhas tinham erro" deixa a pessoa com
 * uma base suja e nenhum jeito de voltar atrás.
 *
 * ── O CASAMENTO É PELA CHAVE DE 8 DÍGITOS ─────────────────────────────────
 * Medido no banco de produção em 08/09/2026: 36 dos 56 contatos têm 12
 * dígitos, ou seja, sem o 9º. Uma planilha exportada de outro sistema quase
 * sempre traz o 9. Comparar telefone com telefone criaria uma segunda ficha
 * para a mesma pessoa — e a partir daí ela recebe tudo em duplicata.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { chaveTelefone, paraE164 } from '@/lib/maquina-vendas/telefone'
import { julgar, type LinhaImportada, type Relatorio } from '@/lib/importar-contatos'

async function exigirAuth() {
  const store = await cookies()
  const token = store.get('ocr_auth_token')?.value
  if (!token) throw new Error('Não autorizado.')
  return verifyToken(token)
}

function limpar(v?: string): string {
  return (v ?? '').trim()
}

/** A chave de 8 dígitos, ou vazio se o telefone não serve. Ver o cabeçalho. */
function chaveDoTelefone(telefone: string): string {
  const e164 = paraE164(telefone)
  return e164 ? chaveTelefone(e164) : ''
}

/** Busca os contatos que já existem e entrega o julgamento a `julgar()`. */
export async function analisar(linhas: LinhaImportada[]): Promise<Relatorio> {
  await exigirAuth()
  const existentes = await prisma.contact.findMany({
    select: { id: true, telefone: true, email: true, cidade: true, estado: true, documento: true, sobrenome: true },
  })
  return julgar(linhas, existentes, chaveDoTelefone)
}

/**
 * Aplica o que `analisar()` decidiu.
 *
 * Reanalisa em vez de receber os vereditos da tela: entre a prévia e o clique
 * alguém pode ter cadastrado um contato, e gravar por um julgamento velho
 * criaria a duplicata que a análise existe para impedir.
 */
export async function executar(linhas: LinhaImportada[]): Promise<Relatorio & { erros: string[] }> {
  const auth = await exigirAuth()
  const relatorio = await analisar(linhas)
  const erros: string[] = []

  for (const v of relatorio.vereditos) {
    const l = linhas[v.linha - 2]
    if (!l) continue

    try {
      if (v.acao === 'criar') {
        await prisma.contact.create({
          data: {
            userId: auth.userId,
            nome: limpar(l.nome),
            sobrenome: limpar(l.sobrenome) || null,
            email: limpar(l.email) || null,
            telefone: paraE164(v.telefone ?? '')!,
            cidade: limpar(l.cidade) || null,
            estado: limpar(l.estado) || null,
            documento: limpar(l.documento) || null,
            consentimentoLgpd: false,
            // Fica registrado de onde veio, porque contato importado tem um
            // histórico diferente de contato que chegou por formulário.
            firstUtmSource: limpar(l.origem) || 'importacao',
            lastUtmSource: limpar(l.origem) || 'importacao',
            firstUtmAt: new Date(),
            lastUtmAt: new Date(),
          },
        })
      } else if (v.acao === 'atualizar' && v.contatoId) {
        const dados: Record<string, string> = {}
        if (v.camposAtualizados?.includes('e-mail')) dados.email = limpar(l.email)
        if (v.camposAtualizados?.includes('cidade')) dados.cidade = limpar(l.cidade)
        if (v.camposAtualizados?.includes('estado')) dados.estado = limpar(l.estado)
        if (v.camposAtualizados?.includes('documento')) dados.documento = limpar(l.documento)
        if (v.camposAtualizados?.includes('sobrenome')) dados.sobrenome = limpar(l.sobrenome)
        if (Object.keys(dados).length) {
          await prisma.contact.update({ where: { id: v.contatoId }, data: dados })
        }
      }
    } catch (e) {
      erros.push(`Linha ${v.linha}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  revalidatePath('/contacts')
  revalidatePath('/pipeline')
  return { ...relatorio, erros }
}
