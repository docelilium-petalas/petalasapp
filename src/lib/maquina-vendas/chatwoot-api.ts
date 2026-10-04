/**
 * O CLIENTE DO CHATWOOT — um só, para os passos do tique.
 *
 * Porta de `chatwoot-api.ts` da CarBoss. Lá a URL, a conta (1) e a caixa (6)
 * eram fixas no código, apontando para o Chatwoot da CarBoss. Aqui as três vêm
 * do ambiente, e SEM padrão: um padrão errado faria a nota de uma cliente da
 * Doce Lilium cair na caixa de outra empresa.
 *
 *   CHATWOOT_URL         https://petalas-chatwoot.yt7ol2.easypanel.host
 *   CHATWOOT_ACCOUNT_ID  id da conta
 *   CHATWOOT_INBOX_ID    id da caixa do canal API (WhatsApp oficial)
 *   CHATWOOT_TOKEN       (ou CHATWOOT_API_TOKEN) token de agente/admin
 *
 * Faltou qualquer um → `configChatwoot()` devolve `null` e quem chama registra
 * que o passo ficou desligado. Nunca em silêncio.
 */

export type ConfigChatwoot = { url: string; conta: number; inbox: number; token: string }

export function lerTokenDoChatwoot(): string | null {
  return (process.env.CHATWOOT_TOKEN ?? process.env.CHATWOOT_API_TOKEN)?.trim() || null
}

export function configChatwoot(): ConfigChatwoot | null {
  const url = (process.env.CHATWOOT_URL ?? '').trim().replace(/\/+$/, '')
  const conta = Number(process.env.CHATWOOT_ACCOUNT_ID)
  const inbox = Number(process.env.CHATWOOT_INBOX_ID)
  const token = lerTokenDoChatwoot()
  if (!url || !token || !Number.isInteger(conta) || conta <= 0 || !Number.isInteger(inbox) || inbox <= 0) return null
  return { url, conta, inbox, token }
}

/** O que falta para ligar — a tela de Prontidão mostra isto em vez de "desligado". */
export function faltasDoChatwoot(): string[] {
  const f: string[] = []
  if (!(process.env.CHATWOOT_URL ?? '').trim()) f.push('CHATWOOT_URL')
  if (!(Number(process.env.CHATWOOT_ACCOUNT_ID) > 0)) f.push('CHATWOOT_ACCOUNT_ID')
  if (!(Number(process.env.CHATWOOT_INBOX_ID) > 0)) f.push('CHATWOOT_INBOX_ID')
  if (!lerTokenDoChatwoot()) f.push('CHATWOOT_TOKEN')
  return f
}

export async function cw<T>(cfg: ConfigChatwoot, caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${cfg.url}/api/v1/accounts/${cfg.conta}${caminho}`, {
    ...init,
    headers: { api_access_token: cfg.token, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  })
  const corpo = await r.text()
  if (!r.ok) throw new Error(`chatwoot ${init?.method ?? 'GET'} ${caminho} → HTTP ${r.status}: ${corpo.slice(0, 200)}`)
  return corpo ? (JSON.parse(corpo) as T) : ({} as T)
}

/**
 * ⚠️ O `POST /labels` do Chatwoot SUBSTITUI o conjunto inteiro de etiquetas —
 *    não acrescenta (medido na origem em 20/08/2026). Por isso estas funções
 *    sempre postam o conjunto FINAL.
 */
export async function lerEtiquetas(cfg: ConfigChatwoot, conversa: number): Promise<string[]> {
  const r = await cw<{ payload?: string[] }>(cfg, `/conversations/${conversa}/labels`)
  return r?.payload ?? []
}

export async function porEtiqueta(cfg: ConfigChatwoot, conversa: number, etiqueta: string): Promise<string[]> {
  const atuais = await lerEtiquetas(cfg, conversa)
  if (atuais.includes(etiqueta)) return atuais
  const final = [...atuais, etiqueta]
  await cw(cfg, `/conversations/${conversa}/labels`, { method: 'POST', body: JSON.stringify({ labels: final }) })
  return final
}

export async function tirarEtiqueta(cfg: ConfigChatwoot, conversa: number, etiqueta: string): Promise<string[]> {
  const atuais = await lerEtiquetas(cfg, conversa)
  const restantes = atuais.filter((e) => e !== etiqueta)
  if (restantes.length === atuais.length) return atuais
  await cw(cfg, `/conversations/${conversa}/labels`, { method: 'POST', body: JSON.stringify({ labels: restantes }) })
  return restantes
}

export async function notaPrivada(cfg: ConfigChatwoot, conversa: number, texto: string): Promise<void> {
  await cw(cfg, `/conversations/${conversa}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: texto, private: true, message_type: 'outgoing' }),
  })
}

/**
 * A conversa da caixa DL com este telefone (a mais recente), ou `null`.
 * Busca por contato e casa pelos últimos 8 dígitos — o 9º dígito e o DDI
 * aparecem e somem entre Meta, Datafy e Chatwoot.
 */
export async function conversaDoTelefone(cfg: ConfigChatwoot, telefone: string): Promise<number | null> {
  const chave = telefone.replace(/\D/g, '').slice(-8)
  if (chave.length !== 8) return null
  const contatos =
    (await cw<{ payload?: Array<{ id: number; phone_number?: string | null }> }>(
      cfg,
      `/contacts/search?q=${encodeURIComponent(chave)}&include_contacts=true`,
    ))?.payload ?? []
  const contato = contatos.find((c) => (c.phone_number ?? '').replace(/\D/g, '').endsWith(chave))
  if (!contato) return null
  const convs =
    (await cw<{ payload?: Array<{ id: number; inbox_id: number; last_activity_at?: number }> }>(
      cfg,
      `/contacts/${contato.id}/conversations`,
    ))?.payload ?? []
  const daCaixa = convs.filter((c) => c.inbox_id === cfg.inbox).sort((a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0))
  return daCaixa[0]?.id ?? null
}
