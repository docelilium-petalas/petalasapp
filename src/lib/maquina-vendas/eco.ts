/**
 * O ECO — a mensagem que SAIU do nosso número, devolvida pela Meta.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Até aqui o webhook do WhatsApp só ouvia dois campos: `messages` (a cliente
 * falou) e `statuses` (entrega). Tudo o mais caía em `webhook_sem_efeito` e
 * sumia no log. Entre esse "tudo o mais" estava o fato mais importante da
 * operação de atendimento: **a Marília respondeu pelo celular.**
 *
 * Quando isso acontece, a IA não sabe. Ela continua achando que a conversa é
 * dela, responde por cima da pessoa e a cliente vê duas vozes discordando no
 * mesmo balão. Este módulo é o ouvido que faltava.
 *
 * ── Os dois nomes do mesmo fato ───────────────────────────────────────────
 * A Meta assina o eco em dois campos:
 *
 *   `message_echoes`      mensagem que saiu pela API  (nós: IA ou Máquina)
 *   `smb_message_echoes`  mensagem que saiu pelo APP do WhatsApp Business
 *                         (coexistência) — ou seja, alguém DIGITOU no celular
 *
 * Seria cômodo separar humano de robô só por esse nome. **Não dá.** Medido na
 * CarBoss: o painel da Datafy assina `smb_message_echoes` também para envio
 * próprio. Confiar no nome do campo faria a IA se calar sozinha a cada
 * mensagem que ela mesma mandou — um cadeado que se tranca por dentro.
 *
 * ── O discriminador que vale ──────────────────────────────────────────────
 * O `wamid`. Toda mensagem que SAI pelo nosso código volta com um id que nós
 * já conhecemos:
 *
 *   · a Máquina grava o dela em `MvMensagem.idExterno`;
 *   · a IA grava o dela no turno da conversa (`Turno.id`).
 *
 * Eco com `wamid` conhecido é nosso. Eco com `wamid` DESCONHECIDO saiu por
 * fora do sistema — e a única porta que existe por fora é o aparelho na mão de
 * uma pessoa. É esse o sinal.
 *
 * ⚠️ O erro erra para o lado seguro: se um dia o nosso envio deixar de gravar
 * o id, o eco dele vira "humano" e a IA se cala por 12h numa conversa. Chato.
 * O erro contrário — tratar mensagem de gente como robô — faz a IA escrever
 * por cima da dona da marca na frente da cliente. Os dois não custam o mesmo.
 *
 * Módulo PURO: não fala com banco, não lê relógio, não faz rede. Quem decide e
 * grava é a rota do webhook.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Uma mensagem que saiu do nosso número, como a Meta a devolveu. */
export interface EcoDaLoja {
  /** O id da Meta. É por ele que se sabe se a mensagem é nossa. */
  wamid: string | null
  /** O telefone da CLIENTE (o destino), só dígitos com DDI. */
  paraTelefone: string
  /** O que foi dito. Vazio quando o eco é de mídia sem legenda. */
  texto: string
  quando: Date
  /**
   * `app` = a Meta disse que saiu do aplicativo do celular.
   * `api` = a Meta disse que saiu da API.
   *
   * Registrado para o log e para auditar a decisão depois — **não** é o
   * discriminador. Ver o cabeçalho.
   */
  porOnde: 'app' | 'api'
}

type MensagemEco = {
  id?: string
  from?: string
  to?: string
  recipient_id?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  image?: { caption?: string }
  video?: { caption?: string }
  document?: { caption?: string; filename?: string }
  button?: { text?: string }
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
}

const CAMPOS_DE_ECO = new Set(['message_echoes', 'smb_message_echoes'])

/**
 * As mudanças de um corpo de webhook, sem supor a forma.
 *
 * A Datafy embrulha o corpo da Meta e nem sempre do mesmo jeito: já chegou com
 * `entry[].changes[]` completo e já chegou com uma mudança solta na raiz. Ler
 * as duas formas aqui, num lugar só, evita espalhar `?.` pelo resto.
 */
function mudancasDoCorpo(corpo: unknown): Array<{ field?: string; value?: unknown }> {
  const c = (corpo ?? {}) as Record<string, unknown>
  const entries = Array.isArray(c.entry) ? (c.entry as Array<Record<string, unknown>>) : []
  const deEntry = entries.flatMap((e) =>
    Array.isArray(e?.changes) ? (e.changes as Array<{ field?: string; value?: unknown }>) : [],
  )
  if (deEntry.length) return deEntry
  // Mudança solta na raiz — a forma enxuta que a Datafy às vezes manda.
  if (typeof c.field === 'string') return [c as { field?: string; value?: unknown }]
  return []
}

/** O texto de um eco, seja ele qual for o tipo. Mídia sem legenda vira ''. */
function textoDoEco(m: MensagemEco): string {
  switch (m.type) {
    case 'text':
      return m.text?.body ?? ''
    case 'image':
      return m.image?.caption ?? ''
    case 'video':
      return m.video?.caption ?? ''
    case 'document':
      return m.document?.caption ?? m.document?.filename ?? ''
    case 'button':
      return m.button?.text ?? ''
    case 'interactive':
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? ''
    default:
      return m.text?.body ?? ''
  }
}

/**
 * Todos os ecos de um corpo de webhook.
 *
 * Nunca lança: o corpo vem de fora, e derrubar a rota faria a Meta re-entregar
 * e, depois de muitas falhas, DESLIGAR o webhook — que é justamente o canal
 * por onde este aviso chega.
 */
export function ecosDoCorpo(corpo: unknown): EcoDaLoja[] {
  const fora: EcoDaLoja[] = []
  try {
    for (const mudanca of mudancasDoCorpo(corpo)) {
      const campo = String(mudanca?.field ?? '')
      if (!CAMPOS_DE_ECO.has(campo)) continue

      const v = (mudanca?.value ?? {}) as Record<string, unknown>
      // A Meta usa `message_echoes` como nome do ARRAY nos dois campos.
      const lista = (Array.isArray(v.message_echoes) ? v.message_echoes : []) as MensagemEco[]

      for (const m of lista) {
        // Num eco, `from` é o NOSSO número e `to` é o da cliente — o contrário
        // de `messages`. Trocar os dois faria a conversa ser atribuída ao
        // próprio número da loja, e o handoff cairia sempre na mesma linha.
        const destino = String(m.to ?? m.recipient_id ?? '').replace(/\D/g, '')
        if (!destino) continue

        const seg = Number(m.timestamp)
        fora.push({
          wamid: m.id ?? null,
          paraTelefone: destino,
          texto: textoDoEco(m).trim(),
          // Sem timestamp utilizável, "agora" é melhor que uma data de 1970,
          // que cairia antes de qualquer inscrição e seria descartada adiante.
          quando: Number.isFinite(seg) && seg > 0 ? new Date(seg * 1000) : new Date(),
          porOnde: campo === 'smb_message_echoes' ? 'app' : 'api',
        })
      }
    }
  } catch {
    /* corpo torto não derruba o webhook: quem chama já devolve 200 */
  }
  return fora
}

/**
 * O corpo trouxe eco?
 *
 * ⚠️ É a armadilha número um deste endpoint. O eco chega no MESMO endereço que
 * `messages`, e tratar um eco como mensagem recebida faz a IA responder a si
 * mesma, em laço, gastando um envio por volta.
 */
export function temEco(corpo: unknown): boolean {
  return ecosDoCorpo(corpo).length > 0
}
