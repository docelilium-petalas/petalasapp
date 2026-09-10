/**
 * O CANAL — a única porta por onde mensagem sai deste módulo.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Uma porta só, e uma interface, porque o canal desta operação vai TROCAR:
 * hoje o caminho é a Datafy (revenda oficial da Cloud API da Meta), ontem era
 * uazapi por QR Code, e o histórico das duas origens tem mensagem gravada
 * pelos dois. Por isso `MvMensagem.canal` existe — para o passado não virar
 * mentira depois de uma migração.
 *
 * ── O CONTRATO ────────────────────────────────────────────────────────────
 * A Datafy expõe a Cloud API da Meta atrás do prefixo `/v1`. O corpo é o da
 * Meta, sem tradução: `messaging_product`, `to`, `type: 'template'`, e os
 * `components` com os parâmetros posicionais.
 *
 * ⚠️ O caminho exato (`{phoneNumberId}/messages`) segue a Cloud API e está
 * PRESUMIDO até a primeira chamada real — o número ainda não foi ligado. É por
 * isso que existe `conferirCanal()`: ela faz uma chamada de leitura e diz se o
 * contrato é este mesmo, antes de qualquer mensagem sair para cliente.
 *
 * ── O QUE ESTE ARQUIVO NÃO FAZ ────────────────────────────────────────────
 * Não decide SE deve enviar. Janela, teto, opt-out, anti-eco e pausa são do
 * despachante. Aqui só se resolve "como falar com a Meta" — misturar as duas
 * coisas é como um guard acaba dentro de um retry e para de valer.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { decryptField } from '@/lib/encryption'

export const BASE_DATAFY = 'https://cloud.datafyapi.com.br/v1'

export type CredenciaisCanal = {
  baseUrl: string
  phoneNumberId: string
  token: string
}

export class CanalSemCredencial extends Error {
  constructor(oQueFalta: string) {
    super(
      `Canal de WhatsApp não configurado: ${oQueFalta}. ` +
        'Configure em Ajustes → Integrações, ou defina DATAFY_PHONE_NUMBER_ID e DATAFY_TOKEN.',
    )
    this.name = 'CanalSemCredencial'
  }
}

/**
 * A natureza de uma falha de envio.
 *
 * Gravada no momento em que acontece, e nunca recalculada: a tabela de códigos
 * da Meta muda, e reclassificar o passado com a tabela de hoje reescreveria a
 * história do que aconteceu naquele dia.
 */
export type NaturezaFalha =
  | 'NUMERO_INVALIDO'
  | 'BLOQUEADA_META'
  | 'JANELA_FECHADA'
  | 'CANAL_FORA'
  | 'CONFIGURACAO'
  | 'DESCONHECIDA'

export class ErroCanal extends Error {
  constructor(
    mensagem: string,
    readonly natureza: NaturezaFalha,
    readonly codigo?: number,
    /** Re-tentar tem chance de dar certo? Número inválido, não. Canal fora, sim. */
    readonly reTentavel: boolean = false,
  ) {
    super(mensagem)
    this.name = 'ErroCanal'
  }
}

/**
 * Traduz o código da Meta em decisão.
 *
 * Número e não texto: número não tem sinônimo entre versões, e é ele que
 * decide re-tentar × desistir. Código desconhecido cai em DESCONHECIDA e NÃO
 * é re-tentável — insistir num erro que ninguém mapeou é como se queima
 * reputação sem entender por quê.
 */
export function classificar(codigo?: number): { natureza: NaturezaFalha; reTentavel: boolean } {
  switch (codigo) {
    case 131026: // message undeliverable
    case 131052: // media/recipient issue no destinatário
      return { natureza: 'NUMERO_INVALIDO', reTentavel: false }
    case 131031: // conta restringida
    case 368: // conta temporariamente bloqueada por política
      return { natureza: 'BLOQUEADA_META', reTentavel: false }
    case 131047: // re-engagement: fora da janela de 24h
    case 131051: // tipo de mensagem não suportado fora da janela
      return { natureza: 'JANELA_FECHADA', reTentavel: false }
    case 132000: // número de parâmetros não bate com o template
    case 132001: // template não existe no idioma
    case 132005: // template pausado
    case 132007: // template reprovado
      return { natureza: 'CONFIGURACAO', reTentavel: false }
    case 130429: // rate limit
    case 131048: // limite de spam
    case 133010: // conta não registrada
    case 500:
    case 503:
      return { natureza: 'CANAL_FORA', reTentavel: true }
    default:
      return { natureza: 'DESCONHECIDA', reTentavel: false }
  }
}

type SegredosCanal = { token?: string }
type AjustesCanal = { phoneNumberId?: string; baseUrl?: string }

/** Precedência igual à da Nuvemshop: banco cifrado → env → erro explícito. */
export async function obterCredenciaisCanal(): Promise<CredenciaisCanal> {
  let doBanco: Partial<CredenciaisCanal> = {}
  try {
    const linha = await prisma.integration.findFirst({
      where: { tipo: 'datafy', ativo: true },
      orderBy: { updatedAt: 'desc' },
    })
    if (linha) {
      const segredos: SegredosCanal = linha.secrets ? JSON.parse(linha.secrets) : {}
      const ajustes: AjustesCanal = linha.settings ? JSON.parse(linha.settings) : {}
      doBanco = {
        phoneNumberId: ajustes.phoneNumberId,
        baseUrl: ajustes.baseUrl,
        token: segredos.token ? await decryptField(segredos.token) : undefined,
      }
    }
  } catch {
    // Linha corrompida ou banco fora: cai para a env em vez de derrubar o tique.
  }

  const phoneNumberId = doBanco.phoneNumberId || process.env.DATAFY_PHONE_NUMBER_ID
  const token = doBanco.token || process.env.DATAFY_TOKEN
  const baseUrl = doBanco.baseUrl || process.env.DATAFY_BASE_URL || BASE_DATAFY

  const faltando: string[] = []
  if (!phoneNumberId) faltando.push('phone_number_id')
  if (!token) faltando.push('token')
  if (faltando.length) throw new CanalSemCredencial(`falta ${faltando.join(' e ')}`)

  return { phoneNumberId: phoneNumberId!, token: token!, baseUrl }
}

/** Há canal configurado? Pergunta barata, para o tique não tentar à toa. */
export async function canalConfigurado(): Promise<boolean> {
  try {
    await obterCredenciaisCanal()
    return true
  } catch {
    return false
  }
}

export type EnvioTemplate = {
  /** Destino em E.164, com o `+`. */
  para: string
  templateNome: string
  idioma: string
  /** Os `{{n}}` do CORPO, na ordem. */
  variaveis: string[]
  /** O `{{1}}` do botão de URL, quando o template tem um. */
  urlBotao?: string
}

export type ResultadoEnvio = {
  /** O id da Meta. É por ele que o webhook de status casa com a linha. */
  idExterno: string
  /** O corpo enviado, para a auditoria conseguir reproduzir o que saiu. */
  payload: string
}

/**
 * Manda um template. Lança `ErroCanal` classificado em qualquer falha.
 *
 * Sem re-tentativa aqui dentro de propósito: quem decide re-tentar é o
 * despachante, que é o único que sabe do teto do dia e do intervalo. Um retry
 * escondido aqui furaria os dois.
 */
export async function enviarTemplate(envio: EnvioTemplate): Promise<ResultadoEnvio> {
  const cred = await obterCredenciaisCanal()

  const componentes: unknown[] = []
  if (envio.variaveis.length) {
    componentes.push({
      type: 'body',
      parameters: envio.variaveis.map((v) => ({ type: 'text', text: v })),
    })
  }
  if (envio.urlBotao) {
    componentes.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: envio.urlBotao }],
    })
  }

  const corpo = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: envio.para.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: envio.templateNome,
      language: { code: envio.idioma },
      ...(componentes.length ? { components: componentes } : {}),
    },
  }
  const payload = JSON.stringify(corpo)

  let resposta: Response
  try {
    resposta = await fetch(`${cred.baseUrl}/${cred.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cred.token}`,
        'Content-Type': 'application/json',
      },
      body: payload,
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    // Rede caiu, DNS, timeout: o canal está fora, não a mensagem errada.
    throw new ErroCanal(
      `não consegui falar com o canal: ${e instanceof Error ? e.message : String(e)}`,
      'CANAL_FORA',
      undefined,
      true,
    )
  }

  const texto = await resposta.text()
  if (!resposta.ok) {
    let codigo: number | undefined
    let detalhe = texto.slice(0, 300)
    try {
      const json = JSON.parse(texto) as { error?: { code?: number; message?: string } }
      codigo = json.error?.code
      if (json.error?.message) detalhe = json.error.message
    } catch {
      // corpo não-JSON: fica o texto cru, que é melhor que nada no log
    }
    const { natureza, reTentavel } = classificar(codigo ?? resposta.status)
    throw new ErroCanal(detalhe, natureza, codigo ?? resposta.status, reTentavel)
  }

  let idExterno = ''
  try {
    const json = JSON.parse(texto) as { messages?: { id?: string }[] }
    idExterno = json.messages?.[0]?.id ?? ''
  } catch {
    // aceitou mas devolveu algo que não sei ler
  }
  if (!idExterno) {
    // Aceitou sem id é pior que recusar: sem id o webhook de status nunca casa
    // com a linha, e a mensagem fica "enviada" para sempre, sem entrega.
    throw new ErroCanal('o canal aceitou mas não devolveu id da mensagem', 'DESCONHECIDA', resposta.status, false)
  }

  return { idExterno, payload }
}

/**
 * Prova que o canal responde, SEM mandar mensagem para ninguém.
 *
 * Lê o próprio número. Se as credenciais estiverem certas e o caminho for o
 * que este arquivo presume, volta 200 com os dados do número. Qualquer outra
 * coisa é diagnóstico, não mensagem gasta.
 */
export async function conferirCanal(): Promise<{ ok: boolean; status: number; corpo: string }> {
  const cred = await obterCredenciaisCanal()
  const resposta = await fetch(`${cred.baseUrl}/${cred.phoneNumberId}`, {
    headers: { Authorization: `Bearer ${cred.token}` },
    signal: AbortSignal.timeout(20_000),
  })
  const corpo = (await resposta.text()).slice(0, 500)
  return { ok: resposta.ok, status: resposta.status, corpo }
}
