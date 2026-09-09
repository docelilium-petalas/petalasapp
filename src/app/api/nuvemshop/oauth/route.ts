import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { encryptField } from '@/lib/encryption'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * OAUTH DA NUVEMSHOP — a volta da autorização, automatizada.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Existiriam dois jeitos de obter o token da loja:
 *
 *   · "Aplicativo sob medida" — dois cliques no painel, MAS só nos planos
 *     Escala e Next. Conferido em 09/09/2026: a loja da Doce Lilium não tem
 *     a opção, então esse caminho está fechado.
 *   · App de parceiro com OAuth — gratuito, e é este arquivo.
 *
 * O incômodo do OAuth é o meio do caminho: a loja devolve um `code` numa URL,
 * ele vale 5 MINUTOS, e alguém teria de copiá-lo e rodar um curl antes de
 * expirar. Esta rota tira isso da frente — ela É a URL de redirecionamento,
 * pega o código, troca por token e guarda cifrado. Quem instala não vê código
 * nenhum.
 *
 * ── Por que o token não vai para o .env ───────────────────────────────────
 * Ele não expira, pertence à LOJA e não ao ambiente, e o EasyPanel deste
 * projeto não tem autoDeploy — toda env nova custa um Deploy manual. Vai para
 * `Integration.secrets`, cifrado com AES-256-GCM.
 * ══════════════════════════════════════════════════════════════════════════
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const erroLoja = url.searchParams.get('error')

  if (erroLoja) {
    return paginaSimples('Autorização recusada', `A loja respondeu: ${erroLoja}`, false)
  }
  if (!code) {
    return paginaSimples(
      'Falta o código',
      'Esta URL é o destino do botão de instalar da Nuvemshop. Abra-a pelo fluxo de autorização, não direto.',
      false,
    )
  }

  const appId = process.env.NUVEMSHOP_APP_ID
  const clientSecret = process.env.NUVEMSHOP_CLIENT_SECRET
  if (!appId || !clientSecret) {
    return paginaSimples(
      'App não configurado',
      'Defina NUVEMSHOP_APP_ID e NUVEMSHOP_CLIENT_SECRET no ambiente antes de instalar.',
      false,
    )
  }

  // O código vale 5 minutos. Troca já.
  const resposta = await fetch('https://www.tiendanube.com/apps/authorize/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: appId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
    }),
  })

  const dados = (await resposta.json().catch(() => null)) as
    | { access_token?: string; user_id?: number | string; scope?: string; error?: string; error_description?: string }
    | null

  if (!resposta.ok || !dados?.access_token || !dados?.user_id) {
    const motivo = dados?.error_description || dados?.error || `HTTP ${resposta.status}`
    return paginaSimples('Não deu para trocar o código', motivo, false)
  }

  const storeId = String(dados.user_id)

  // Guarda cifrado. `upsert` manual porque `Integration` não tem chave única
  // por tipo — e reinstalar o app é caso normal, não erro.
  const userId = await donoDaConfiguracao()
  const segredos = JSON.stringify({
    accessToken: await encryptField(dados.access_token),
    ...(process.env.NUVEMSHOP_CLIENT_SECRET
      ? { appSecret: await encryptField(process.env.NUVEMSHOP_CLIENT_SECRET) }
      : {}),
  })
  const ajustes = JSON.stringify({
    storeId,
    userAgent: 'Doce Lilium CRM (dev.netlife@gmail.com)',
    escopos: dados.scope ?? '',
  })

  const existente = await prisma.integration.findFirst({ where: { tipo: 'nuvemshop' } })
  if (existente) {
    await prisma.integration.update({
      where: { id: existente.id },
      data: { secrets: segredos, settings: ajustes, ativo: true },
    })
  } else {
    await prisma.integration.create({
      data: { userId, tipo: 'nuvemshop', authType: 'oauth', secrets: segredos, settings: ajustes, ativo: true },
    })
  }

  return paginaSimples(
    'Loja conectada',
    `store_id ${storeId}. O token foi guardado cifrado — nada dele aparece em tela, log ou URL. ` +
      `Agora rode o registro dos webhooks e o módulo passa a enxergar carrinho e pedido.`,
    true,
  )
}

/**
 * De quem é a linha de integração.
 *
 * Usa o usuário da sessão quando há uma; senão, o admin mais antigo. O
 * fallback existe porque a Nuvemshop redireciona o navegador de volta e a
 * sessão pode não sobreviver ao salto entre domínios — e falhar a instalação
 * por isso seria trocar um problema real por um problema de cookie.
 */
async function donoDaConfiguracao(): Promise<string> {
  try {
    const store = await cookies()
    const token = store.get('ocr_auth_token')?.value
    if (token) {
      const auth = await verifyToken(token)
      if (auth?.userId) return auth.userId
    }
  } catch {
    // sem sessão: cai no admin
  }
  const admin = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (!admin) throw new Error('Nenhum usuário no sistema para associar a integração.')
  return admin.id
}

/** Página de retorno. HTML mínimo — o usuário vem do navegador, não da API. */
function paginaSimples(titulo: string, detalhe: string, ok: boolean) {
  const cor = ok ? '#3C6F57' : '#A34F42'
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} · Doce Lilium</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#ECD8DD;font-family:system-ui,sans-serif;color:#34141C">
<div style="max-width:32rem;padding:2rem;background:#F9F0F3;border:1px solid #CCA9B2;border-radius:1rem">
<p style="margin:0 0 .5rem;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:${cor}">Nuvemshop</p>
<h1 style="margin:0 0 .75rem;font-size:1.4rem;font-weight:600">${titulo}</h1>
<p style="margin:0 0 1.5rem;font-size:.9rem;line-height:1.6;color:#73535B">${detalhe}</p>
<a href="/maquina-vendas" style="display:inline-block;padding:.6rem 1.1rem;border-radius:.75rem;background:#44121E;color:#fff;text-decoration:none;font-size:.8rem;font-weight:500">Voltar à Máquina de Vendas</a>
</div></body></html>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
