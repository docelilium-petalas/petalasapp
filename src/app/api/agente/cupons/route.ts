import { NextResponse } from 'next/server'
import { portaAberta } from '@/lib/atendimento/porta'
import { acharCupom, cupomVale, lerCupons, descreverDesconto } from '@/lib/nuvemshop/cupons'
import { obterAjustes } from '@/lib/maquina-vendas/config'

export const dynamic = 'force-dynamic'

/**
 * O QUE A IA ENXERGA DE CUPOM — janela de inspeção, não ferramenta do agente.
 *
 * O agente recebe os cupons dentro de `consultar_cliente`, junto do resto do
 * contexto: uma chamada a menos por conversa, e a dica e a lista saem sempre
 * do mesmo instante. Esta rota existe para conferir de fora — em QA, e no dia
 * em que alguém perguntar "por que ela não ofereceu o cupom?".
 *
 * Com `?codigo=MINHADL`, confere um código específico e diz em português por
 * que ele vale ou não.
 */
export async function GET(request: Request) {
  const porta = portaAberta(request)
  if (porta !== true) return porta

  const codigo = new URL(request.url).searchParams.get('codigo')
  if (codigo) {
    const c = await acharCupom(codigo)
    if (!c) return NextResponse.json({ codigo, existe: false, vale: false, motivo: 'a loja não tem esse código' })
    const vale = cupomVale(c)
    return NextResponse.json({
      codigo: c.codigo,
      existe: true,
      vale,
      desconto: descreverDesconto(c),
      motivo: vale
        ? null
        : !c.ligado
          ? 'está desligado na loja'
          : c.maxUsos != null && c.usos >= c.maxUsos
            ? `bateu o teto de ${c.maxUsos} usos`
            : 'fora da janela de validade',
      detalhe: c,
    })
  }

  const [leitura, ajustes] = await Promise.all([lerCupons(), obterAjustes().catch(() => null)])
  const escolhido = ajustes?.cupomCarrinho?.trim() || null
  const naLoja = escolhido ? (leitura.cupons.find((c) => c.codigo.toUpperCase() === escolhido.toUpperCase()) ?? null) : null

  return NextResponse.json({
    lido_em: leitura.lidoEm,
    motivo: leitura.motivo,
    total: leitura.cupons.length,
    vigentes: leitura.cupons.filter((c) => cupomVale(c)).map((c) => ({ codigo: c.codigo, desconto: descreverDesconto(c) })),
    vencidos: leitura.cupons.filter((c) => !cupomVale(c)).map((c) => c.codigo),
    // O elo que quebra calado: cupom escolhido em Ajustes que não existe (ou
    // não vale) na loja. A IA não ofereceria nada, e ninguém saberia por quê.
    recuperacao: {
      escolhido,
      existe_na_loja: Boolean(naLoja),
      vale_agora: naLoja ? cupomVale(naLoja) : false,
    },
  })
}
