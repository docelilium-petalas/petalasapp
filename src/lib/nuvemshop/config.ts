/**
 * CREDENCIAIS DA NUVEMSHOP — de onde vêm e por que não do `.env`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O token da Nuvemshop **não expira**. Ele só morre quando alguém gera outro
 * ou desinstala o app. Isso o torna uma credencial de vida longa ligada a UMA
 * loja — exatamente o perfil que o CRM já resolve com a tabela `Integration`
 * e `encryptField` (AES-256-GCM), e exatamente o perfil que faz de `.env` o
 * lugar errado:
 *
 *   · o EasyPanel não tem `autoDeploy` — trocar env exige Deploy manual;
 *   · o token pertence à LOJA, não ao ambiente. No dia em que existir uma
 *     segunda loja, `.env` obriga a inventar `NUVEMSHOP_TOKEN_2`;
 *   · env em texto claro vaza no `docker inspect` e no log de build. O
 *     `Integration.secrets` é cifrado em repouso.
 *
 * Precedência, e o motivo de ser esta:
 *
 *     Integration (banco, cifrado)  →  env  →  erro explícito
 *
 * O banco ganha porque é o que a operação configura pela tela. A env continua
 * valendo para ambiente novo e para script de linha de comando, onde ainda não
 * há linha no banco. E o fim da fila é ERRO, nunca um valor de mentira:
 * credencial ausente que vira string vazia produz 401 no fim do caminho, longe
 * da causa.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { decryptField } from '@/lib/encryption'

/**
 * Versão da API, fixada de propósito.
 *
 * A Nuvemshop versiona por data no CAMINHO (`/2025-03/`), e não por header.
 * Trocar de versão é mudança de contrato — campos somem, formatos mudam — e
 * precisa ser uma decisão com teste, não um `latest` que muda sozinho num
 * domingo. Para migrar: troque aqui, rode `scripts/nuvemshop-conferir.ts` e
 * leia o diff dos campos antes de subir.
 */
export const VERSAO_API = '2025-03'

export const BASE_API = 'https://api.nuvemshop.com.br'

export type CredenciaisNuvemshop = {
  /** `user_id` devolvido na troca do código OAuth. É o id da loja. */
  storeId: string
  accessToken: string
  /**
   * Obrigatório em TODA requisição, com forma de contato dentro.
   * Requisição sem User-Agent volta `400 Bad Request` — não 401, não 403.
   * É a pegadinha nº 1 da API: o erro não diz que falta o header.
   */
  userAgent: string
  /**
   * Segredo do app, usado para validar o HMAC-SHA256 dos webhooks
   * (header `x-linkedstore-hmac-sha256`). Ausente em app sob medida que não
   * registra webhook — por isso é opcional aqui e obrigatório só na rota.
   */
  appSecret?: string
}

/** Erro de configuração, separado para a rota poder responder 503 e não 500. */
export class NuvemshopSemCredencial extends Error {
  constructor(oQueFalta: string) {
    super(
      `Nuvemshop não configurada: ${oQueFalta}. ` +
        `Configure em Ajustes → Integrações, ou defina as variáveis NUVEMSHOP_* para uso em script.`,
    )
    this.name = 'NuvemshopSemCredencial'
  }
}

type SegredosGravados = {
  accessToken?: string
  appSecret?: string
}

type AjustesGravados = {
  storeId?: string
  userAgent?: string
}

/**
 * Lê a integração ativa do banco. Devolve `null` — e não erro — quando não há
 * linha: quem decide se a ausência é fatal é `obterCredenciais`, que ainda tem
 * a env para tentar.
 */
async function daIntegracao(): Promise<Partial<CredenciaisNuvemshop> | null> {
  const linha = await prisma.integration.findFirst({
    where: { tipo: 'nuvemshop', ativo: true },
    orderBy: { updatedAt: 'desc' },
  })
  if (!linha) return null

  let segredos: SegredosGravados = {}
  let ajustes: AjustesGravados = {}
  try {
    if (linha.secrets) segredos = JSON.parse(linha.secrets) as SegredosGravados
    if (linha.settings) ajustes = JSON.parse(linha.settings) as AjustesGravados
  } catch {
    // JSON corrompido é defeito de gravação, não de leitura. Cai para a env em
    // vez de derrubar a rota — e o `conferir` denuncia.
    return null
  }

  const accessToken = segredos.accessToken ? await decryptField(segredos.accessToken) : undefined
  const appSecret = segredos.appSecret ? await decryptField(segredos.appSecret) : undefined

  return {
    storeId: ajustes.storeId,
    userAgent: ajustes.userAgent,
    accessToken,
    appSecret,
  }
}

/**
 * As credenciais completas, ou erro dizendo exatamente o que falta.
 *
 * Não faz cache de propósito: o token pode ser trocado pela tela a qualquer
 * momento, e um cache de processo faria o CRM seguir usando o token velho até
 * o próximo deploy — que é o defeito mais chato de diagnosticar, porque
 * funciona em todo lugar menos em produção.
 */
export async function obterCredenciais(): Promise<CredenciaisNuvemshop> {
  const doBanco = await daIntegracao().catch(() => null)

  const storeId = doBanco?.storeId || process.env.NUVEMSHOP_STORE_ID
  const accessToken = doBanco?.accessToken || process.env.NUVEMSHOP_ACCESS_TOKEN
  const appSecret = doBanco?.appSecret || process.env.NUVEMSHOP_APP_SECRET
  const userAgent =
    doBanco?.userAgent ||
    process.env.NUVEMSHOP_USER_AGENT ||
    'Doce Lilium CRM (dev.netlife@gmail.com)'

  const faltando: string[] = []
  if (!storeId) faltando.push('store_id')
  if (!accessToken) faltando.push('access_token')
  if (faltando.length) throw new NuvemshopSemCredencial(`falta ${faltando.join(' e ')}`)

  return { storeId: storeId!, accessToken: accessToken!, userAgent, appSecret }
}

/** A raiz das chamadas desta loja. */
export function urlBase(storeId: string): string {
  return `${BASE_API}/${VERSAO_API}/${storeId}`
}
