/**
 * ESTADO DO NÚMERO NA META — a parte de `datafy.ts` da CarBoss que o destino
 * ainda não tinha.
 *
 * O envio (template e texto livre) já mora em `canal.ts`, com credencial do
 * banco cifrado e classificação de erro por código. Duplicar o envio aqui seria
 * ter dois caminhos para a Meta, e dois caminhos é como um deles fica sem a
 * guarda da lista de teste. Este arquivo só PERGUNTA: o número está bem?
 */

import { obterCredenciaisCanal, type CredenciaisCanal } from './canal'

/** Janela de atendimento da Meta: texto livre só até 24h depois da última fala da cliente. */
export const JANELA_ATENDIMENTO_MS = 24 * 60 * 60 * 1000

/** Janela de 24h fechada: a mensagem não saiu, e a culpa é do nosso agendamento. */
export const CODIGO_JANELA_FECHADA = 131047

export interface StatusDoNumero {
  /** CONNECTED · BANNED · RESTRICTED · FLAGGED · RATE_LIMITED · … */
  status: string
  /** GREEN · YELLOW · RED · UNKNOWN */
  qualidade: string
  /** APPROVED · DECLINED · PENDING_REVIEW · NONE · … */
  nomeStatus: string
  nomeVerificado: string
  /** AVAILABLE · LIMITED · BLOCKED — a leitura mais honesta de "consigo enviar?" */
  podeEnviar: string
  avisos: string[]
}

type Resposta = { ok: boolean; json: Record<string, unknown> | null }

async function chamar(creds: CredenciaisCanal, caminho: string): Promise<Resposta> {
  try {
    const r = await fetch(`${creds.baseUrl}${caminho}`, {
      headers: { Authorization: `Bearer ${creds.token}` },
      signal: AbortSignal.timeout(15_000),
    })
    const json = (await r.json().catch(() => null)) as Record<string, unknown> | null
    return { ok: r.ok, json }
  } catch {
    return { ok: false, json: null }
  }
}

/**
 * Pergunta à Meta o estado do número. Duas fontes de propósito — `status` e
 * `health_status` — porque já discordaram (BANNED × LIMITED) e esconder a
 * divergência faz alguém decidir com meia verdade.
 *
 * `null` = a Datafy não respondeu. Isso NÃO é canal ruim (ver `disjuntor.ts`).
 */
export async function statusDoNumero(creds?: CredenciaisCanal): Promise<StatusDoNumero | null> {
  let c = creds
  if (!c) {
    try {
      c = await obterCredenciaisCanal()
    } catch {
      return null
    }
  }
  const campos = 'status,quality_rating,name_status,verified_name'
  const [base, saude] = await Promise.all([
    chamar(c, `/${c.phoneNumberId}?fields=${campos}`),
    chamar(c, `/${c.phoneNumberId}?fields=health_status`),
  ])
  if (!base.ok || !base.json) return null

  const avisos: string[] = []
  let podeEnviar = 'DESCONHECIDO'
  if (saude.ok && saude.json) {
    const h = saude.json.health_status as
      | { can_send_message?: string; entities?: Array<{ additional_info?: unknown[]; errors?: Array<{ error_code?: number; error_description?: string }> }> }
      | undefined
    podeEnviar = h?.can_send_message ?? 'DESCONHECIDO'
    for (const e of h?.entities ?? []) {
      for (const info of e?.additional_info ?? []) avisos.push(String(info))
      for (const erro of e?.errors ?? []) {
        // 138024/138025 são de chamada de voz, que a Doce Lilium não usa.
        if (erro?.error_code === 138024 || erro?.error_code === 138025) continue
        if (erro?.error_description) avisos.push(String(erro.error_description))
      }
    }
  }

  const j = base.json
  return {
    status: String(j.status ?? 'DESCONHECIDO'),
    qualidade: String(j.quality_rating ?? 'UNKNOWN'),
    nomeStatus: String(j.name_status ?? 'DESCONHECIDO'),
    nomeVerificado: String(j.verified_name ?? ''),
    podeEnviar,
    avisos,
  }
}

/** O canal está em condição de mandar mensagem que abre conversa? */
export function canalSaudavel(s: StatusDoNumero | null): boolean {
  if (!s) return false
  return s.status === 'CONNECTED' && s.podeEnviar !== 'BLOCKED'
}

/** E.164 sem `+`, como a Meta espera em `to`. */
export function paraE164(telefone: string): string {
  return telefone.replace(/\D/g, '')
}

const CODIGOS_NUMERO_INVALIDO = new Set([131026])

/** Erro da Meta em frase legível, com o código à vista. */
export function descreverErro(erro: string, codigo: number | null): string {
  if (codigo !== null && CODIGOS_NUMERO_INVALIDO.has(codigo)) return `número não recebe WhatsApp (Meta ${codigo}): ${erro}`
  if (codigo === CODIGO_JANELA_FECHADA) return `janela de 24h fechada (Meta ${codigo}): ${erro}`
  return codigo === null ? erro : `Meta ${codigo}: ${erro}`
}
