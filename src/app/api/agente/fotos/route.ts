import { NextResponse } from 'next/server'
import { portaAberta, telefoneDaRequisicao } from '@/lib/atendimento/porta'
import { catalogoDaLoja, formatarPreco } from '@/lib/nuvemshop/catalogo'
import { enviarMensagemLivre } from '@/lib/maquina-vendas/canal'
import { registrarTurno, turnosDe, pendentesEHistorico } from '@/lib/atendimento/conversa'
import { funilSemFalhar } from '@/lib/atendimento/funil'
import { linkDeFotoParaWhatsApp } from '@/lib/atendimento/foto-whatsapp'

/** Foto já mandada nesta janela não sai de novo — medido em 14/09: "Amei o Luna!" fez a IA reenviar a foto do Luna. */
const JANELA_REPETIDA_MS = 24 * 3_600_000

/**
 * ...A MENOS que ela peça a foto. Quem decide é o texto da cliente, não o
 * modelo: as mensagens dela que ainda não tiveram resposta falam em foto,
 * imagem ou "manda/mostra de novo"? Então reenvia. Pedido do Owner em 14/09.
 */
const PEDIU_FOTO = /\b(foto|fotos|imagem|imagens|figura|print|manda de novo|mostra de novo|envia de novo|reenvia|ver de novo|ver ela|ver a peca)\b/

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export const dynamic = 'force-dynamic'

/**
 * Ferramenta `enviar_fotos`: manda a foto principal de até 3 peças, cada uma
 * com legenda de nome, preço e link. É a vitrine dentro do WhatsApp.
 *
 * O telefone NÃO vem do modelo: o n8n preenche com o da conversa. Um modelo
 * que escolhe o destinatário é um modelo que um dia manda a foto para outra
 * pessoa.
 */
export async function POST(request: Request) {
  const porta = portaAberta(request)
  if (porta !== true) return porta
  const corpo = (await request.json().catch(() => ({}))) as { telefone?: string; produtos?: string | number[] }
  const telefone = telefoneDaRequisicao(corpo.telefone)
  if (!telefone) return NextResponse.json({ erro: 'telefone inválido' }, { status: 400 })

  const ids = (Array.isArray(corpo.produtos) ? corpo.produtos : String(corpo.produtos ?? '').split(/[^0-9]+/))
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 3)
  if (!ids.length) return NextResponse.json({ enviadas: 0, dica: 'Mande os ids que vieram de buscar_catalogo.' })

  const catalogo = await catalogoDaLoja()
  const agora = Date.now()
  const turnos = await turnosDe(telefone)
  const { pendentes } = pendentesEHistorico(turnos)
  const pediuFoto = PEDIU_FOTO.test(semAcento(pendentes.map((t) => t.texto).join(' ')))
  const jaMandadas = new Set(
    pediuFoto
      ? []
      : turnos
          .filter((t) => t.de === 'loja' && t.texto.startsWith('[foto] ') && agora - new Date(t.em).getTime() < JANELA_REPETIDA_MS)
          .map((t) => t.texto.slice(7).split(' · ')[0].trim()),
  )
  const enviadas: string[] = []
  const repetidas: string[] = []
  const esgotadas: string[] = []
  const falhas: string[] = []
  for (const id of ids) {
    const p = catalogo.find((x) => x.id === id)
    if (!p || !p.fotos[0]) {
      falhas.push(`${id}: não está no catálogo`)
      continue
    }
    // A ÚLTIMA PORTA. buscar_catalogo já não devolve esgotada, mas o modelo
    // pode repetir um id de antes na conversa — e o estoque muda no meio dela.
    // Vitrine de peça que não dá para comprar é frustração, não atendimento.
    if (!p.disponivel) {
      esgotadas.push(p.nome)
      continue
    }
    if (jaMandadas.has(p.nome)) {
      repetidas.push(p.nome)
      continue
    }
    const legenda = `${p.nome} · ${formatarPreco(p.preco)}\n${p.link}`
    try {
      // O `idExterno` é como a IA reconhece o próprio eco quando ele volta
      // pelo webhook — sem ele, mandar uma foto faria a IA se calar sozinha.
      // Mesma razão de `agente/responder`.
      const { idExterno } = await enviarMensagemLivre(telefone, { tipo: 'imagem', link: linkDeFotoParaWhatsApp(p.fotos[0]), legenda })
      await registrarTurno(telefone, { em: new Date().toISOString(), de: 'loja', texto: `[foto] ${p.nome} · ${formatarPreco(p.preco)}`, id: idExterno })
      enviadas.push(p.nome)
    } catch (e) {
      falhas.push(`${p.nome}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (enviadas.length) {
    await funilSemFalhar({
      e164: telefone,
      etapa: 'produto',
      produto: enviadas.join(', ').slice(0, 180),
      atividade: `IA mandou foto: ${enviadas.join(', ')}`,
    })
  }

  const avisoEsgotadas = esgotadas.length
    ? ` NÃO saiu a foto de: ${esgotadas.join(', ')} — essa(s) peça(s) esgotou/esgotaram. Diga isso a ela e ofereça avisar quando voltar; não mande o link dessas.`
    : ''

  return NextResponse.json({
    enviadas: enviadas.length,
    pecas: enviadas,
    ja_estavam_na_conversa: repetidas,
    nao_enviadas_esgotadas: esgotadas,
    falhas,
    dica:
      (enviadas.length
        ? 'As fotos JÁ chegaram para ela, com preço e link. Não repita a lista: pergunte numa frase curta se alguma agradou ou qual tamanho ela usa.'
        : repetidas.length && !falhas.length && !esgotadas.length
          ? 'Ela JÁ tem a foto dessa peça na conversa. Não mande de novo: responda direto o que ela perguntou.'
          : esgotadas.length && !falhas.length
            ? 'Nenhuma foto saiu.'
            : 'Nenhuma foto saiu. Mande os links das peças em texto.') + avisoEsgotadas,
  })
}
