/**
 * O TEXTO DO TEMPLATE NA CONVERSA DA EQUIPE — a cada tique.
 *
 * Porta de `chatwoot-nota.ts` da CarBoss (04/10/2026).
 *
 * O eco que a Datafy espelha no Chatwoot traz o NOME do template, não a frase.
 * Quem abre a conversa não sabe o que a cliente leu. A frase existe no CRM, em
 * `MvMensagem.textoEntregue`, carimbada no envio — este passo a escreve como
 * NOTA PRIVADA na conversa.
 *
 * ── Diferenças da origem ───────────────────────────────────────────────────
 *  · O PONTO DE PARTIDA É O CRM, não a inbox. Lá se varria cada conversa
 *    procurando `📢 Template: x` e se reconstruía o texto casando por janela de
 *    tempo. Aqui todo envio já nasce com `textoEntregue`, então basta pegar as
 *    mensagens ENVIADAS das últimas horas e anotar as que ainda não têm nota.
 *    Não há reconstrução, logo não há frase inventada.
 *  · A MARCA de idempotência é o id da `MvMensagem` — `(mv <id>)` —, não o id
 *    da mensagem do Chatwoot. Dois disparos do mesmo template para a mesma
 *    cliente têm texto idêntico e são eventos diferentes.
 *  · Sem compromisso/agenda: a loja não tem reunião, e `data`/`hora` não
 *    existem no contexto.
 *
 * ── Nota privada é segura por construção ──────────────────────────────────
 * Nota privada CRIA mensagem com `private: true`. Ela não sai para o WhatsApp
 * — o canal API do Chatwoot só repassa o que não é privado.
 *
 * ── Fail-open, mas nunca calado ───────────────────────────────────────────
 * Sem Chatwoot configurado o passo devolve `ligado: false` e o tique segue: é
 * visibilidade, não entrega. Derrubar o envio por não conseguir anotar seria
 * trocar um problema de tela por um problema de operação. O resultado diz
 * "desligado" e a Prontidão lista as variáveis que faltam.
 */

import prisma from '@/lib/prisma'
import { configChatwoot, conversaDoTelefone, cw, faltasDoChatwoot, notaPrivada } from './chatwoot-api'
import { MENSAGEM_STATUS } from './config'

/** Só os envios recentes: o passado foi visto por quem estava na conversa. */
export const JANELA_HORAS = 6
/** Teto por tique — cada nota custa 3 chamadas ao Chatwoot. */
export const MAXIMO_POR_TIQUE = 30

const MARCA = /\(mv ([0-9a-f-]{8,})\)/i

export interface ResultadoNotas {
  ligado: boolean
  faltas: string[]
  avaliadas: number
  anotadas: number
  jaTinham: number
  semConversa: number
  falhas: string[]
}

interface MsgCw {
  id: number
  content: string | null
  private?: boolean
}

export function textoDaNota(mensagemId: string, templateNome: string | null, texto: string): string {
  const rotulo = templateNome ? ` · ${templateNome}` : ''
  return `📄 Texto entregue pela Máquina de Vendas${rotulo} (mv ${mensagemId}):\n\n${texto}`
}

export function marcasDasNotas(msgs: MsgCw[]): Set<string> {
  const vistas = new Set<string>()
  for (const n of msgs) {
    if (!n.private) continue
    const m = MARCA.exec(String(n.content ?? ''))
    if (m) vistas.add(m[1].toLowerCase())
  }
  return vistas
}

export async function anotarTextosNoChatwoot(agora: Date = new Date()): Promise<ResultadoNotas> {
  const cfg = configChatwoot()
  const r: ResultadoNotas = {
    ligado: !!cfg,
    faltas: cfg ? [] : faltasDoChatwoot(),
    avaliadas: 0,
    anotadas: 0,
    jaTinham: 0,
    semConversa: 0,
    falhas: [],
  }
  if (!cfg) {
    console.warn(`[chatwoot-nota] desligado — faltam ${r.faltas.join(', ')}. O texto do template não será anotado.`)
    return r
  }

  const desde = new Date(agora.getTime() - JANELA_HORAS * 3_600_000)
  const enviadas = await prisma.mvMensagem.findMany({
    where: { status: MENSAGEM_STATUS.ENVIADA, enviadaEm: { gte: desde }, textoEntregue: { not: null } },
    select: { id: true, templateNome: true, textoEntregue: true, inscricao: { select: { telefoneE164: true } } },
    orderBy: { enviadaEm: 'asc' },
    take: MAXIMO_POR_TIQUE,
  })

  // Agrupa por telefone: uma leitura de conversa serve a todas as mensagens dela.
  const porTelefone = new Map<string, typeof enviadas>()
  for (const m of enviadas) {
    const tel = m.inscricao.telefoneE164
    porTelefone.set(tel, [...(porTelefone.get(tel) ?? []), m])
  }

  for (const [telefone, msgs] of porTelefone) {
    r.avaliadas += msgs.length
    try {
      const conversa = await conversaDoTelefone(cfg, telefone)
      if (!conversa) {
        r.semConversa += msgs.length
        continue
      }
      const historico = (await cw<{ payload?: MsgCw[] }>(cfg, `/conversations/${conversa}/messages`))?.payload ?? []
      const marcas = marcasDasNotas(historico)
      for (const m of msgs) {
        if (marcas.has(m.id.toLowerCase())) {
          r.jaTinham++
          continue
        }
        await notaPrivada(cfg, conversa, textoDaNota(m.id, m.templateNome, m.textoEntregue ?? ''))
        r.anotadas++
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[chatwoot-nota] ${telefone.slice(-4)}: ${msg}`)
      r.falhas.push(`…${telefone.slice(-4)}: ${msg.slice(0, 160)}`)
    }
  }
  return r
}
