/**
 * VIGIA DE DUPLICAÇÃO E FUNIL (porte de `vigia-duplicacao-e-funil.ts` do CarBoss).
 *
 *   npx tsx scripts/mv-ops/vigia-duplicacao.ts [--minutos 120] [--sem-chatwoot]
 *
 * Só leitura. Dois instrumentos:
 *
 *   1) CHATWOOT — na inbox da loja, agrupa as mensagens públicas de saída por
 *      texto dentro da conversa, e só quando caíram juntas (≤ 5 min).
 *        · 1 fala + N ecos (`content_attributes.from_echo`) = espelho, saudável:
 *          a cliente recebeu UMA vez, o segundo balão é o comprovante da Datafy.
 *        · 2+ falas sem eco = envio dobrado (defeito).
 *        · 0 falas + 2+ ecos = laço de espelho.
 *
 *   2) FUNIL — no banco de `DATABASE_URL`, contagens que só dão positivo quando
 *      algo está errado: etapa ENVIADA duas vezes, wamid repetido, inscrição
 *      ATIVA duplicada por telefone, agendada vencida (cron parado), ENVIADA
 *      sem wamid ou sem entrega, ERRO recente, log nível ERRO.
 *
 * O que NÃO veio do CarBoss, e por quê:
 *   · o cheque dos "dois canos" (webhook nativo da inbox × ponte n8n) — a
 *     Doce Lilium não tem ponte n8n; o canal oficial é a Datafy, e o canal
 *     não oficial (uazapi) foi aposentado em 09/09/2026. O `webhook_url` da
 *     inbox é mostrado como informação, sem veredito.
 *   · `consultar-producao.ts` por execSync — aqui o funil lê o próprio
 *     `DATABASE_URL` pelo Prisma; para produção, rode com a URL de produção.
 *
 * CONTROLE POSITIVO: sem tráfego nenhum na janela o veredito é SEM_TRAFEGO,
 * nunca OK — silêncio de instrumento parece saúde.
 */
import { prisma, opcao, tem, cabecalho, rodar } from './_base'
import { configChatwoot, cw, type ConfigChatwoot } from '../../src/lib/maquina-vendas/chatwoot-api'

const MINUTOS = Math.min(Math.max(Number(opcao('--minutos') ?? 120) || 120, 5), 7 * 24 * 60)
const SEM_CHATWOOT = tem('--sem-chatwoot')

type Msg = {
  id: number
  content: string | null
  message_type: number
  private: boolean
  created_at: number
  content_attributes?: Record<string, unknown> | null
  sender?: { name?: string; available_name?: string } | null
}
type Conversa = {
  id: number
  last_activity_at: number
  meta?: { sender?: { name?: string; phone_number?: string } }
}
type Grupo = { conversa: number; quem: string; texto: string; falas: Msg[]; ecos: Msg[] }

const achatar = (t: unknown) => String(t ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const apagada = (m: Msg) =>
  m.content_attributes?.deleted === true ||
  /esta mensagem foi excluí|this message was deleted/i.test(m.content ?? '')
const ehEco = (m: Msg) => m.content_attributes?.from_echo === true

async function varrerChatwoot(cfg: ConfigChatwoot, desde: number) {
  const r = await cw<{ data?: { payload?: Conversa[] }; payload?: Conversa[] }>(
    cfg,
    `/conversations?inbox_id=${cfg.inbox}&status=all&sort_on=last_activity_at`,
  )
  const conversas = (r.data?.payload ?? r.payload ?? []).filter((c) => c.last_activity_at >= desde)
  const grupos: Grupo[] = []
  let outgoing = 0
  let incoming = 0
  let apagadas = 0
  for (const c of conversas) {
    const quem = c.meta?.sender?.name ?? c.meta?.sender?.phone_number ?? `conv ${c.id}`
    const resp = await cw<{ payload?: Msg[] }>(cfg, `/conversations/${c.id}/messages`)
    const msgs = (resp.payload ?? []).filter((m) => m.created_at >= desde)
    for (const m of msgs) {
      if (m.message_type === 0) incoming++
      if (m.message_type === 1 && !m.private) outgoing++
      if (apagada(m)) apagadas++
    }
    // Mensagem apagada fica de fora: o Chatwoot troca o corpo de todas por
    // "Esta mensagem foi excluída", e duas exclusões sem relação virariam par.
    const publicas = msgs.filter(
      (m) => m.message_type === 1 && !m.private && !apagada(m) && (m.content ?? '').trim(),
    )
    const porTexto = new Map<string, Msg[]>()
    for (const m of publicas) {
      const k = achatar(m.content)
      porTexto.set(k, [...(porTexto.get(k) ?? []), m])
    }
    for (const lista of porTexto.values()) {
      if (lista.length < 2) continue
      // Só é repetição se caíram JUNTAS. A mesma frase horas depois é
      // follow-up legítimo, não balão duplicado.
      const ord = [...lista].sort((a, b) => a.created_at - b.created_at)
      let bloco: Msg[] = [ord[0]]
      const fecha = () => {
        if (bloco.length < 2) return
        grupos.push({
          conversa: c.id,
          quem,
          texto: (bloco[0].content ?? '').replace(/\s+/g, ' ').slice(0, 70),
          falas: bloco.filter((m) => !ehEco(m)),
          ecos: bloco.filter(ehEco),
        })
      }
      for (let i = 1; i < ord.length; i++) {
        if (ord[i].created_at - ord[i - 1].created_at <= 300) bloco.push(ord[i])
        else {
          fecha()
          bloco = [ord[i]]
        }
      }
      fecha()
    }
  }
  return { conversas: conversas.length, outgoing, incoming, apagadas, grupos }
}

type Funil = {
  insc_ativas: number
  atrasadas: number
  enviadas_60m: number
  erros_60m: number
  sem_wamid_24h: number
  sem_entrega_24h: number
  etapa_enviada_2x: number
  wamid_repetido: number
  insc_duplicada: number
  log_erro_60m: number
}

// `agendada_para`/`enviada_em` são timestamp SEM fuso guardando UTC — por isso
// a comparação é com `now() AT TIME ZONE 'UTC'`, e não com `now()` cru.
async function lerFunil(): Promise<Funil> {
  const linhas = await prisma.$queryRawUnsafe<Record<string, bigint | number>[]>(`
    SELECT
      (SELECT count(*) FROM maquina_vendas_inscricoes WHERE status = 'ATIVA') AS insc_ativas,
      (SELECT count(*) FROM maquina_vendas_mensagens WHERE status = 'AGENDADA'
         AND agendada_para < (now() AT TIME ZONE 'UTC') - interval '15 minutes') AS atrasadas,
      (SELECT count(*) FROM maquina_vendas_mensagens WHERE status = 'ENVIADA'
         AND enviada_em > (now() AT TIME ZONE 'UTC') - interval '60 minutes') AS enviadas_60m,
      (SELECT count(*) FROM maquina_vendas_mensagens WHERE status = 'ERRO'
         AND agendada_para > (now() AT TIME ZONE 'UTC') - interval '60 minutes') AS erros_60m,
      (SELECT count(*) FROM maquina_vendas_mensagens WHERE status = 'ENVIADA' AND id_externo IS NULL
         AND enviada_em > (now() AT TIME ZONE 'UTC') - interval '24 hours') AS sem_wamid_24h,
      (SELECT count(*) FROM maquina_vendas_mensagens WHERE status = 'ENVIADA' AND entregue_em IS NULL
         AND enviada_em BETWEEN (now() AT TIME ZONE 'UTC') - interval '24 hours'
                            AND (now() AT TIME ZONE 'UTC') - interval '20 minutes') AS sem_entrega_24h,
      (SELECT count(*) FROM (SELECT inscricao_id, etapa_ordem FROM maquina_vendas_mensagens
         WHERE status = 'ENVIADA' GROUP BY 1, 2 HAVING count(*) > 1) d) AS etapa_enviada_2x,
      (SELECT count(*) FROM (SELECT id_externo FROM maquina_vendas_mensagens
         WHERE id_externo IS NOT NULL GROUP BY 1 HAVING count(*) > 1) w) AS wamid_repetido,
      (SELECT count(*) FROM (SELECT cadencia_id, telefone_key FROM maquina_vendas_inscricoes
         WHERE status = 'ATIVA' GROUP BY 1, 2 HAVING count(*) > 1) x) AS insc_duplicada,
      (SELECT count(*) FROM logs_eventos WHERE nivel = 'ERRO'
         AND created_at > (now() AT TIME ZONE 'UTC') - interval '60 minutes') AS log_erro_60m
  `)
  const l = linhas[0]
  if (!l) throw new Error('consulta do funil voltou vazia')
  const num = {} as Record<string, number>
  for (const [k, v] of Object.entries(l)) num[k] = Number(v ?? 0)
  return num as Funil
}

async function main() {
  cabecalho('VIGIA DE DUPLICAÇÃO E FUNIL (só leitura)', false)
  const agora = new Date()
  const desde = Math.floor(agora.getTime() / 1000) - MINUTOS * 60
  const alta: string[] = []
  const atencao: string[] = []

  let cwx: Awaited<ReturnType<typeof varrerChatwoot>> | null = null
  let webhookNativo = '?'
  if (!SEM_CHATWOOT) {
    const cfg = configChatwoot()
    if (!cfg) {
      atencao.push('Chatwoot não configurado (CHATWOOT_URL/_ACCOUNT_ID/_INBOX_ID/_TOKEN) — rode com --sem-chatwoot')
    } else {
      cwx = await varrerChatwoot(cfg, desde)
      const inbox = await cw<{ webhook_url?: string | null }>(cfg, `/inboxes/${cfg.inbox}`)
      webhookNativo = inbox.webhook_url || '(vazio)'
    }
  }
  const espelho = cwx?.grupos.filter((g) => g.falas.length === 1 && g.ecos.length >= 1) ?? []
  const dobrado = cwx?.grupos.filter((g) => g.falas.length >= 2) ?? []
  const ecoMultiplo = cwx?.grupos.filter((g) => g.falas.length === 0 && g.ecos.length >= 2) ?? []
  if (dobrado.length) alta.push(`${dobrado.length} texto(s) com 2+ falas SEM eco — cheira a envio dobrado`)
  if (ecoMultiplo.length) alta.push(`${ecoMultiplo.length} texto(s) com 2+ ECOS — sintoma de laço de espelho`)

  const f = await lerFunil()
  if (f.etapa_enviada_2x) alta.push(`${f.etapa_enviada_2x} etapa(s) de cadência ENVIADA(s) duas vezes`)
  if (f.wamid_repetido) alta.push(`${f.wamid_repetido} wamid repetido em linhas diferentes`)
  if (f.insc_duplicada) alta.push(`${f.insc_duplicada} inscrição ATIVA duplicada (cadência + telefone)`)
  if (f.erros_60m) alta.push(`${f.erros_60m} mensagem(ns) em ERRO na última hora`)
  if (f.atrasadas) atencao.push(`${f.atrasadas} agendada(s) vencida(s) há mais de 15 min — cron parado ou envio pausado`)
  if (f.sem_wamid_24h) atencao.push(`${f.sem_wamid_24h} ENVIADA sem wamid nas últimas 24 h`)
  if (f.sem_entrega_24h) atencao.push(`${f.sem_entrega_24h} ENVIADA sem confirmação de entrega`)
  if (f.log_erro_60m) atencao.push(`${f.log_erro_60m} evento(s) nível ERRO no log`)

  const semTrafego = (cwx ? cwx.outgoing + cwx.incoming === 0 : true) && f.enviadas_60m === 0
  const veredito = alta.length ? 'ALTA' : atencao.length ? 'ATENCAO' : semTrafego ? 'SEM_TRAFEGO' : 'OK'

  console.log(
    `${agora.toISOString()} ${veredito} janela=${MINUTOS}min` +
      (cwx
        ? ` conv=${cwx.conversas} out=${cwx.outgoing} in=${cwx.incoming} apagadas=${cwx.apagadas}` +
          ` espelho=${espelho.length} dobrado=${dobrado.length} ecoX=${ecoMultiplo.length}`
        : ' chatwoot=NAO_LIDO') +
      ` | insc=${f.insc_ativas} atras=${f.atrasadas} env60=${f.enviadas_60m} err60=${f.erros_60m}` +
      ` semWamid=${f.sem_wamid_24h} semEntrega=${f.sem_entrega_24h} etapa2x=${f.etapa_enviada_2x}` +
      ` wamidRep=${f.wamid_repetido} inscDup=${f.insc_duplicada} logErr=${f.log_erro_60m}`,
  )
  if (cwx) console.log(`\nwebhook_url da inbox (informativo): ${webhookNativo}`)
  if (espelho.length) {
    console.log('\nPARES ESPELHO (esperado — a cliente recebe UMA vez):')
    for (const g of espelho.slice(0, 6)) console.log(`  conv ${g.conversa} · ${g.quem} · "${g.texto}"`)
    if (espelho.length > 6) console.log(`  … e mais ${espelho.length - 6}`)
  }
  for (const [rotulo, lista] of [
    ['ENVIO DOBRADO (defeito)', dobrado],
    ['ECO MÚLTIPLO (laço)', ecoMultiplo],
  ] as const) {
    if (!lista.length) continue
    console.log(`\n${rotulo}:`)
    for (const g of lista)
      console.log(`  conv ${g.conversa} · ${g.quem} · "${g.texto}" · falas ${g.falas.map((m) => m.id).join(',')} · ecos ${g.ecos.map((m) => m.id).join(',')}`)
  }
  if (alta.length) console.log('\nALTA:\n' + alta.map((x) => `  ✗ ${x}`).join('\n'))
  if (atencao.length) console.log('\nATENÇÃO:\n' + atencao.map((x) => `  ⚠️ ${x}`).join('\n'))
  if (veredito === 'SEM_TRAFEGO') console.log('\nSem tráfego na janela — "nenhuma duplicata" NÃO é conclusão.')
  // Nada é silencioso: ALTA sai com código de erro para quem agenda o vigia.
  if (veredito === 'ALTA') process.exitCode = 2
}

rodar(main)
