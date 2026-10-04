/**
 * BATERIA PURA da Máquina de Vendas — o nível 1 do `npm run test:mv`.
 *
 * Mora em `src/` (e não em `scripts/`) porque a aba Prontidão roda exatamente
 * estas checagens dentro do servidor, só leitura: sem banco, sem rede, sem
 * relógio real e SEM mexer em `process.env` — trocar a env ali abriria a lista
 * de teste para um tique que rodasse no mesmo instante.
 *
 * Portado das baterias `scripts/test-mv-*.ts` da CarBoss (28 arquivos, um por
 * módulo) e reunido num só, com as regras da Doce Lilium onde elas divergem:
 * 12h de atendimento humano (lá 6h), lista de teste que BLOQUEIA (lá
 * redirecionava), 131049 que não encerra, cupom único MINHADL.
 */

import { CATALOGO, VARIAVEIS, validarCatalogo, temBotaoDeUrlVariavel } from './catalogo-templates'
import { CADENCIAS, GATILHOS_INTOCAVEIS, ehGatilhoDeCampanha } from './cadencias-seed'
import { MODELOS_CADENCIA, rotuloDelay, slugificar } from './modelos'
import {
  validarCopy,
  validarTemplate,
  montarCopy,
  expandirVariantes,
  primeiroNomeDeGente,
  removerVocativo,
  sanearVocativoResolvido,
  CopyIncompleta,
} from './copy'
import { parseJanela, dentroDaJanela, inicioDoDiaSP, ajustarParaJanela } from './janela'
import { calcularRampa, RAMPA } from './rampa'
import { provaDeEntrega, PROVA } from './prova'
import { avaliar, decidir, type LeituraDoCanal } from './disjuntor'
import { situacaoDaCadencia } from './situacao'
import { condicaoDoCarrinho, CUPOM_UNICO } from './condicao'
import { acaoDaFalha, ACAO, mudancasDoCorpo, statusesDoCorpo, mensagensRecebidas } from './entrega-meta'
import { separarHandoffs, HORAS_DE_VALIDADE } from './handoff'
import { liberadoParaEnvio, numerosDeTeste, INSCRICAO_STATUS } from './config'
import { classificar, sufixoDoBotao, componentesDoEnvio } from './canal'
import { pediuParaSair } from './opt-out'
import { falasDaClienteDepois, statusDaParada } from './paradas'
import { GradeDeVagas } from './grade'
import { conferirRastreio, linkDeRastreio, assinaturaDoPedido } from './rastreio'
import { HUMANO_HORAS } from '../atendimento/conversa'
import { analisarConversa, ehEncerramento, mascararCpf, ritmoDeLeitura, sugerirCopys, type Turno as TurnoAtencao } from './atencao'
import { conversaAindaViva, MOVIMENTO_HUMANO } from './observador-colunas'
import { emPartes, minutosDaHora } from './briefing'
import { papelDoTemplate } from './papeis'
import { templatesSemAssunto } from './templates'

export interface FalhaDaBateria {
  oQue: string
  detalhe?: string
}

export interface GrupoDaBateria {
  titulo: string
  passou: number
  falhou: number
  falhas: FalhaDaBateria[]
}

export interface ResultadoDaBateria {
  passou: number
  falhou: number
  grupos: GrupoDaBateria[]
  /** Uma exceção no meio interrompe a bateria — e isso é uma falha, não um verde. */
  parouEm: string | null
  medidoEm: string
}

/** Data na parede de São Paulo (UTC-3, sem horário de verão desde 2019). */
export function sp(iso: string): Date {
  return new Date(`${iso}-03:00`)
}

function novoColetor() {
  const grupos: GrupoDaBateria[] = []
  let atual: GrupoDaBateria | null = null
  let parouEm: string | null = null

  const grupo = (titulo: string) => {
    atual = { titulo, passou: 0, falhou: 0, falhas: [] }
    grupos.push(atual)
  }
  const checa = (condicao: boolean, oQue: string, detalhe?: unknown) => {
    if (!atual) grupo('(sem grupo)')
    const g = atual as unknown as GrupoDaBateria
    if (condicao) {
      g.passou++
      return
    }
    g.falhou++
    g.falhas.push({
      oQue,
      ...(detalhe === undefined ? {} : { detalhe: typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe) }),
    })
  }
  const igual = <T,>(obtido: T, esperado: T, oQue: string) => {
    const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
    checa(ok, oQue, ok ? undefined : `esperado ${JSON.stringify(esperado)} · obtido ${JSON.stringify(obtido)}`)
  }
  const parou = (e: unknown) => {
    const onde = (atual as GrupoDaBateria | null)?.titulo ?? '(início)'
    parouEm = `${onde}: ${e instanceof Error ? e.message : String(e)}`
    checa(false, 'a bateria parou no meio', parouEm)
  }
  const resultado = (): ResultadoDaBateria => ({
    passou: grupos.reduce((s, g) => s + g.passou, 0),
    falhou: grupos.reduce((s, g) => s + g.falhou, 0),
    grupos,
    parouEm,
    medidoEm: new Date().toISOString(),
  })
  return { grupo, checa, igual, parou, resultado }
}

export function rodarBateriaPura(): ResultadoDaBateria {
  const k = novoColetor()
  const { grupo, checa, igual } = k
  try {
    const AMOSTRA: Record<string, string> = {
      primeiro_nome: 'Teste',
      peca: 'Vestido Lírio',
      pedido: '#1042',
      cupom: 'MINHADL',
      desconto: '10%',
      rastreio: 'api/r/rastreio/1042.abcdef0123456789abcd',
      colecao: 'Coleção Primavera',
      prazo: '30/10',
      link: 'https://www.docelilium.com.br',
    }

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('1 · Catálogo dos 17 templates')
    igual(CATALOGO.length, 17, 'são 17 templates no catálogo (16 de cliente + a porta do briefing)')
    igual(CATALOGO.filter((t) => t.trilha === 'operacao').map((t) => t.nome), ['dl_relatorio_pronto_v1'], 'só a porta do briefing é operação interna')
    igual(validarCatalogo(), [], 'o catálogo passa no próprio validador')
    for (const t of CATALOGO) {
      const vars = VARIAVEIS[t.nome] ?? []
      const n = (t.corpo.match(/\{\{(\d+)\}\}/g) ?? []).length
      checa(new Set(t.corpo.match(/\{\{(\d+)\}\}/g) ?? []).size === vars.length, `${t.nome}: ${vars.length} variável(is) no mapa = ${n} no corpo`)
      const texto = t.corpo.replace(/\{\{(\d+)\}\}/g, (_m, i: string) => AMOSTRA[vars[Number(i) - 1]] ?? 'X')
      const ehUltima = /ultimo/.test(t.nome)
      const r = validarCopy(texto, { ehUltima })
      checa(r.ok, `${t.nome}: o texto final passa no vocabulário da loja`, r.erros)
    }

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('2 · Cadências do seed e modelos')
    const nomesCatalogo = new Set(CATALOGO.map((t) => t.nome))
    for (const c of CADENCIAS) {
      for (const e of c.etapas) checa(nomesCatalogo.has(e.templateNome), `${c.nome} etapa ${e.ordem}: ${e.templateNome} existe no catálogo`)
      const ultimas = c.etapas.filter((e) => e.ehUltima)
      checa(c.etapas.length === 1 || ultimas.length === 1, `${c.nome}: no máximo uma etapa marcada como última`)
    }
    igual(CADENCIAS.length, 8, 'as 8 cadências de produção estão no seed')
    checa(CADENCIAS.filter((c) => c.intocavel).every((c) => GATILHOS_INTOCAVEIS.has(c.gatilho)), 'as cadências intocáveis são exatamente as do drop 10.10')
    checa(ehGatilhoDeCampanha('campanha_1010_vespera') && !ehGatilhoDeCampanha('carrinho_abandonado'), 'gatilho de campanha reconhecido pelo prefixo')
    for (const m of MODELOS_CADENCIA) {
      for (const e of m.etapas) checa(nomesCatalogo.has(e.templateNome), `modelo ${m.slug}: ${e.templateNome} existe`)
    }
    igual(rotuloDelay(1440), '1 dia depois', 'rótulo de 1 dia no singular')
    igual(rotuloDelay(2 * 1440 + 0), '2 dias depois', 'rótulo de 2 dias')
    igual(rotuloDelay(28 * 60), '1 dia depois', '28h arredonda para 1 dia, no singular')
    igual(slugificar('Coleção Nova — Verão!'), 'colecao_nova_verao', 'slug sem acento nem pontuação')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('3 · Copy: variação, placeholders e vocativo')
    const esq = 'Oi {{primeiro_nome}}, [[a|b]] [[c|d]] tudo [[e|f]]?'
    igual(expandirVariantes(esq).length, 8, 'expande as 8 combinações')
    checa(montarCopy(esq, { primeiro_nome: 'Ana' }, 'x') === montarCopy(esq, { primeiro_nome: 'Ana' }, 'x'), 'mesma semente, mesmo texto')
    try {
      montarCopy('Oi {{primeiro_nome}}, olha a {{peca}}', { primeiro_nome: 'Ana' }, 's')
      checa(false, 'placeholder sem valor lança CopyIncompleta')
    } catch (e) {
      checa(e instanceof CopyIncompleta && e.faltando.includes('peca'), 'placeholder sem valor lança CopyIncompleta')
    }
    igual(primeiroNomeDeGente('MARIA DE FÁTIMA'), 'Maria', 'nome em caixa alta vira Title Case')
    igual(primeiroNomeDeGente('Loja Teste'), '', 'nome de loja/teste não vira vocativo')
    igual(primeiroNomeDeGente('Dn'), '', 'iniciais sem vogal não viram vocativo')
    igual(removerVocativo('Oi {{primeiro_nome}}, tudo bem?'), 'Oi, tudo bem?', 'sem nome, o vocativo sai do esqueleto')
    igual(sanearVocativoResolvido('Oi Loja, chegou peça nova', 'Loja Teste'), 'Oi, chegou peça nova', 'cerca no envio tira vocativo que veio do nome de loja')
    igual(sanearVocativoResolvido('Oi Ana, chegou', 'Ana Paula'), 'Oi Ana, chegou', 'e não mexe em nome de gente')
    checa(!validarCopy('Oi Ana, seu lead chegou?', { ehUltima: false }).ok, 'vocabulário de CRM ("lead") reprova')
    checa(validarCopy('Oi Ana, a peça é de leadership?', { ehUltima: false }).ok, '...mas só como palavra inteira')
    checa(!validarCopy('Oi Ana, última chance!', { ehUltima: false }).ok, 'escassez falsa reprova')
    checa(validarCopy('Oi Ana, tudo bem?\nChegou a peça que você queria.\nPosso separar?', { ehUltima: false }).ok, 'saudação na 1ª linha não conta como pedido')
    checa(!validarCopy('Oi Ana, a peça é IMPERDÍVEL', { ehUltima: false }).ok, 'CAPS em palavra comum reprova')
    checa(!validarCopy('Oi Ana\nQuer ver?\nGostou?', { ehUltima: false }).ok, 'dois pedidos reprovam')
    checa(!validarCopy('Oi Ana\nSeparei pra você', { ehUltima: true }).ok, 'última mensagem precisa se anunciar')
    checa(validarTemplate('Oi {{primeiro_nome}}, [[a|b]] [[c|d]]').length === 0, 'esqueleto com 4 variantes e nome passa')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('4 · Janela e dia de São Paulo')
    const j = parseJanela('09:00', '20:00')
    checa(!dentroDaJanela(sp('2026-10-04T08:59:00'), j), '08:59 SP está fora')
    checa(dentroDaJanela(sp('2026-10-04T09:00:00'), j), '09:00 SP está dentro')
    checa(dentroDaJanela(sp('2026-10-04T19:59:00'), j), '19:59 SP está dentro')
    checa(!dentroDaJanela(sp('2026-10-04T20:00:00'), j), '20:00 SP está fora')
    checa(dentroDaJanela(sp('2026-10-04T12:00:00'), j), 'domingo também envia (loja vende no fim de semana)')
    igual(inicioDoDiaSP(sp('2026-10-04T23:30:00')).toISOString(), '2026-10-04T03:00:00.000Z', 'meia-noite SP = 03:00Z, mesmo às 23:30')
    igual(ajustarParaJanela(sp('2026-10-04T21:00:00'), j).toISOString(), sp('2026-10-05T09:00:00').toISOString(), 'depois das 20h desliza para a abertura do dia seguinte')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('5 · Rampa de aberturas')
    const ag = sp('2026-10-04T10:00:00')
    igual(calcularRampa(null, 99, ag).restante, null, 'sem cursor: rampa não limita')
    igual(calcularRampa('lixo', 0, ag).restante, RAMPA[0], 'cursor ilegível: primeiro degrau (falha fechada)')
    igual(calcularRampa(sp('2026-10-04T08:00:00').toISOString(), 12, ag).restante, 0, 'dia 1: 12 aberturas e acabou')
    igual(calcularRampa(sp('2026-10-03T08:00:00').toISOString(), 0, ag).degrau, RAMPA[1], 'dia 2: segundo degrau')
    igual(calcularRampa(sp('2026-09-20T08:00:00').toISOString(), 0, ag).ativa, false, 'depois de 4 dias: concluída')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('6 · Prova de entrega (selo na tela)')
    const base = { status: 'ENVIADA', enviadaEm: sp('2026-10-04T10:00:00'), entregueEm: null, lidaEm: null, idExterno: 'wamid.x', codigoErro: null, falhaMotivo: null, naturezaFalha: null }
    igual(provaDeEntrega({ ...base, lidaEm: sp('2026-10-04T10:05:00') }, ag).nivel, PROVA.LIDA, 'lida vence entregue')
    igual(provaDeEntrega({ ...base, entregueEm: sp('2026-10-04T10:01:00') }, ag).nivel, PROVA.ENTREGUE, 'entregue')
    igual(provaDeEntrega({ ...base, status: 'ERRO', codigoErro: 131026 }, ag).nivel, PROVA.FALHOU, 'erro da Meta = não chegou')
    igual(provaDeEntrega({ ...base, status: 'AGENDADA', codigoErro: 131047 }, ag).nivel, PROVA.DEVOLVIDA, 'janela fechada devolve para a fila')
    igual(provaDeEntrega({ ...base, status: 'AGENDADA', enviadaEm: null, idExterno: null }, ag).nivel, PROVA.NAO_SAIU, 'agendada não saiu')
    igual(provaDeEntrega(base, ag).nivel, PROVA.SEM_PROVA, 'enviada sem confirmação = sem prova')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('7 · Disjuntor do canal')
    const saudavel: LeituraDoCanal = {
      canal: { status: 'CONNECTED', qualidade: 'GREEN', podeEnviar: 'AVAILABLE' } as LeituraDoCanal['canal'],
      enviadasRecentes: 10,
      entreguesRecentes: 8,
      falhasDeCanalRecentes: 0,
      jaConfirmouAlgumaVez: true,
      envioJaPausado: false,
    }
    igual(avaliar(saudavel).codigo, null, 'canal saudável não desarma')
    igual(avaliar({ ...saudavel, canal: { ...saudavel.canal!, qualidade: 'RED' } }).codigo, 'CANAL_SUSPENSO', 'qualidade vermelha desarma')
    igual(avaliar({ ...saudavel, falhasDeCanalRecentes: 3 }).codigo, 'FALHA_EM_SERIE', '3 falhas de canal desarmam')
    igual(avaliar({ ...saudavel, entreguesRecentes: 0 }).codigo, 'SAI_SEM_CHEGAR', 'sai e não chega desarma')
    igual(avaliar({ ...saudavel, entreguesRecentes: 0, jaConfirmouAlgumaVez: false }).desarmar, false, 'nunca confirmou: avisa, não desarma')
    igual(decidir({ ...saudavel, falhasDeCanalRecentes: 3, envioJaPausado: true }, 'FALHA_EM_SERIE').avisar, false, 'já pausado pelo mesmo motivo: não repete o alerta')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('8 · Situação da cadência')
    igual(situacaoDaCadencia({ nome: 'X', ativo: true, colunaArquivada: false, inscricoes: 0, etapasComTemplate: 0 }).estado, 'ligada_muda', 'ligada sem template = ligada muda (pede atenção)')
    igual(situacaoDaCadencia({ nome: 'X', ativo: true, colunaArquivada: false, inscricoes: 3, etapasComTemplate: 1 }).estado, 'ligada', 'ligada com template')
    igual(situacaoDaCadencia({ nome: 'X', ativo: false, colunaArquivada: false, inscricoes: 0, etapasComTemplate: 1 }).estado, 'desligada_sem_motivo', 'desligada sem decisão registrada')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('9 · Cupom único MINHADL')
    igual(CUPOM_UNICO, 'MINHADL', 'o cupom único é MINHADL')
    igual(condicaoDoCarrinho({ cupomConfigurado: 'MINHADL', descontoConfigurado: '10', carrinhoVivo: true }), { cupom: 'MINHADL', desconto: '10%' }, 'carrinho vivo + MINHADL = condição')
    igual(condicaoDoCarrinho({ cupomConfigurado: 'MINHADL', descontoConfigurado: '10', carrinhoVivo: false }), null, 'sem carrinho vivo: nada de cupom')
    igual(condicaoDoCarrinho({ cupomConfigurado: 'BLACK20', descontoConfigurado: '20', carrinhoVivo: true }), null, 'outro cupom nunca é oferecido')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('10 · Códigos da Meta')
    igual(acaoDaFalha(131026), ACAO.NUMERO_INVALIDO, '131026 = número inválido')
    igual(acaoDaFalha(131049), ACAO.REPRESADA, '131049 = represada (a cadência segue)')
    igual(acaoDaFalha(131047), ACAO.JANELA_FECHADA, '131047 = janela fechada (volta para a fila)')
    igual(acaoDaFalha(132000), ACAO.CONFIGURACAO, '132000 = configuração')
    igual(acaoDaFalha(null), ACAO.TRANSITORIA, 'sem código = transitória')
    igual(classificar(133010).natureza, 'NUMERO_INVALIDO', 'canal: 133010 = número inválido')
    igual(classificar(131049).reTentavel, false, 'canal: 131049 não se re-tenta no mesmo tique')
    igual(classificar(131042).natureza, 'CANAL_FORA', 'canal: 131042 = canal fora')
    igual(sufixoDoBotao('https://petalas.docelilium.com.br/api/r/rastreio/1.ab'), 'api/r/rastreio/1.ab', 'botão leva só o sufixo')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('11 · Webhook: envelope Meta e envelope achatado da Datafy')
    const status = { id: 'wamid.A', status: 'delivered', timestamp: '1759575600', recipient_id: '5562999999999' }
    const meta = { object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value: { statuses: [status] } }] }] }
    const achatado = { field: 'messages', value: { statuses: [status] } }
    igual(mudancasDoCorpo(meta).length, 1, 'envelope Meta: 1 mudança')
    igual(mudancasDoCorpo(achatado).length, 1, 'envelope achatado: 1 mudança')
    igual(statusesDoCorpo(meta).map((s) => s.id), ['wamid.A'], 'status lido no envelope Meta')
    igual(statusesDoCorpo(achatado).map((s) => s.id), ['wamid.A'], 'status lido no envelope achatado')
    const recebida = { field: 'messages', value: { messages: [{ id: 'wamid.B', from: '5562999999999', timestamp: '1759575600', type: 'text', text: { body: 'oi' } }] } }
    igual(mensagensRecebidas(recebida).length, 1, 'mensagem recebida no envelope achatado')
    // Parâmetro de botão só onde o template tem botão variável — o 2º toque do
    // carrinho levava o parâmetro e a Meta recusava com 132018 (produção, 15/09).
    const temBotao = (nome: string) =>
      componentesDoEnvio({ templateNome: nome, variaveis: ['Ana'], urlBotao: 'https://www.docelilium.com.br/checkout/v3/x' })
        .some((c) => (c as { type?: string }).type === 'button')
    checa(temBotao('dl_carrinho_lembrete_v1'), 'carrinho 1º toque: leva o parâmetro do botão')
    checa(!temBotao('dl_carrinho_duvida_v1'), 'carrinho 2º toque (sem botão): NÃO leva parâmetro — era o 132018')
    checa(temBotao('dl_carrinho_ultimo_v2'), 'carrinho 3º toque: leva o parâmetro do botão')
    checa(!temBotao('dl_drop_1010_chegou_v1'), 'botão estático: sem parâmetro')
    checa(CATALOGO.every((t) => temBotaoDeUrlVariavel(t.nome) !== null), 'todo template do catálogo responde sim/não sobre o botão')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('12 · Atendimento humano — 12h num relógio só')
    igual(HUMANO_HORAS, 12, 'a IA silencia 12h (a CarBoss usa 6h)')
    igual(HORAS_DE_VALIDADE, HUMANO_HORAS, 'a etiqueta expira no MESMO relógio da IA')
    const agora = sp('2026-10-04T12:00:00')
    const s = separarHandoffs(
      [
        { chave: 'atendimento:humano:11112222', valor: sp('2026-10-04T01:00:00').toISOString() },
        { chave: 'atendimento:humano:33334444', valor: sp('2026-10-03T23:00:00').toISOString() },
        { chave: 'atendimento:humano:55556666', valor: 'lixo' },
        { chave: 'atendimento:ultimo:77778888', valor: 'x' },
      ],
      agora,
    )
    igual(s.ativos.map((a) => a.telefoneKey), ['11112222'], '11h atrás ainda está ativo')
    igual(s.vencidos.map((v) => v.telefoneKey).sort(), ['33334444', '55556666'], '13h atrás e valor ilegível vencem')
    igual(s.ativos[0]?.restamHoras, 1, 'resta 1h')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('13 · Lista de teste — bloqueia, não redireciona')
    const lista = ['5562981191215', '5562982444219']
    checa(liberadoParaEnvio('+55 (62) 98119-1215', lista), 'número da lista passa (formatado)')
    checa(liberadoParaEnvio('556281191215', lista), 'sem o 9º dígito também passa (chave de 8)')
    checa(!liberadoParaEnvio('5562999990000', lista), 'fora da lista não passa')
    checa(liberadoParaEnvio('5562999990000', null), 'sem lista (produção) passa')
    checa(!liberadoParaEnvio('5562981191215', []), 'lista vazia (env com lixo) não deixa ninguém passar')
    igual(numerosDeTeste('abc, 12'), [], 'env só com lixo = lista vazia (falha fechada), não produção')
    igual(numerosDeTeste(''), null, 'env vazia = produção')
    igual(numerosDeTeste(' 5562981191215 ; 5562982444219 '), ['5562981191215', '5562982444219'], 'separador ; e espaços são aceitos')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('14 · Opt-out e paradas')
    checa(pediuParaSair('parar').saiu, '"parar" é opt-out')
    checa(pediuParaSair('', 'Parar de receber').saiu, 'botão "Parar de receber" é opt-out')
    checa(!pediuParaSair('quero parar de pensar nesse vestido, tem M?').saiu, 'frase comum com "parar" no meio não é opt-out')
    igual(statusDaParada('cliente_pediu_para_parar: "parar"'), INSCRICAO_STATUS.OPT_OUT, 'pediu para parar → OPT_OUT')
    igual(statusDaParada('cliente_respondeu no WhatsApp'), INSCRICAO_STATUS.RESPONDEU, 'respondeu → RESPONDEU')
    igual(statusDaParada('negocio_apagado'), INSCRICAO_STATUS.CANCELADA, 'outro motivo → CANCELADA')
    const turnos = [
      { em: sp('2026-10-04T09:00:00').toISOString(), de: 'loja', texto: 'oi' },
      { em: sp('2026-10-04T09:10:00').toISOString(), de: 'cliente', texto: 'tem P?' },
      { em: sp('2026-10-03T09:10:00').toISOString(), de: 'cliente', texto: 'velha' },
    ]
    igual(falasDaClienteDepois(turnos, sp('2026-10-04T09:05:00')).map((t) => t.texto), ['tem P?'], 'só a fala da cliente depois da inscrição conta')
    igual(falasDaClienteDepois('lixo', agora), [], 'turnos ilegíveis não viram resposta')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('15 · Grade de vagas')
    const g = new GradeDeVagas([{ quando: sp('2026-10-05T09:00:00').getTime(), inscricaoId: 'i1' }], {
      minimoMs: 3 * 60_000,
      passoMs: 5 * 60_000,
      janela: j,
    })
    const v1 = g.vaga(sp('2026-10-05T09:01:00'))
    checa(!!v1 && v1.getTime() - sp('2026-10-05T09:00:00').getTime() >= 3 * 60_000, 'respeita o intervalo mínimo')
    const v2 = g.vaga(sp('2026-10-05T10:00:00'), { inscricaoId: 'i1' })
    igual(v2?.toISOString(), sp('2026-10-06T09:00:00').toISOString(), 'uma mensagem por cliente por dia')
    const v3 = g.vaga(sp('2026-10-05T10:00:00'), { tetoPorDia: 1 })
    igual(v3?.toISOString(), sp('2026-10-06T09:00:00').toISOString(), 'teto do dia empurra para o dia seguinte')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('16 · Rastreio assinado')
    const link = linkDeRastreio(1042)
    checa(conferirRastreio(link.split('/').pop()!) === '1042', 'o link emitido abre')
    checa(conferirRastreio(`1043.${assinaturaDoPedido(1042)}`) === null, 'adulterado não abre (cai na home)')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('17 · Papéis e assuntos cobrem o catálogo')
    for (const t of CATALOGO) checa(papelDoTemplate(t.nome) !== null, `${t.nome} tem papel na régua`)
    igual(templatesSemAssunto(), [], 'todo template de etapa tem assunto')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('18 · Atenção — os casos reais que criaram as categorias')
    const t0 = sp('2026-10-04T10:00:00')
    const cli = (texto: string, min = 0): TurnoAtencao => ({ autor: 'cliente', texto, quando: new Date(t0.getTime() + min * 60_000) })
    const nos = (texto: string, min = 0): TurnoAtencao => ({ autor: 'nos', texto, quando: new Date(t0.getTime() + min * 60_000) })
    const tipos = (ts: TurnoAtencao[], agora = new Date(t0.getTime() + 10 * 60_000)) => analisarConversa(ts, agora).map((a) => a.tipo)
    checa(tipos([cli('quero o vestido isis, ainda tem?'), nos('tem sim!', 1)]).includes('QUER_COMPRAR'), 'quero o vestido → QUER_COMPRAR')
    checa(tipos([cli('Pode sim! Manda o link por favor'), nos('aqui', 1)]).includes('QUER_COMPRAR'), 'manda o link → QUER_COMPRAR')
    checa(tipos([cli('Ele tem quais tamanhos?'), nos('P, M e G', 1)]).includes('PERGUNTOU_TAMANHO'), 'quais tamanhos → PERGUNTOU_TAMANHO')
    checa(tipos([cli('A modelo está usando qual tamanho da saia?'), nos('M', 1)]).includes('PERGUNTOU_TAMANHO'), 'tamanho da modelo → PERGUNTOU_TAMANHO')
    checa(tipos([cli('me da um desconto? to achando meio caro'), nos('...', 1)]).includes('PEDIU_DESCONTO'), 'desconto/caro → PEDIU_DESCONTO')
    checa(tipos([cli('Tem taxa de entrega para Goiânia?'), nos('...', 1)]).includes('FRETE_E_ENTREGA'), 'taxa de entrega → FRETE_E_ENTREGA')
    checa(tipos([cli('voces tem loja fisica? onde fica pra eu ir ai'), nos('...', 1)]).includes('LOJA_FISICA'), 'loja física → LOJA_FISICA')
    checa(tipos([cli('gostaria de presentear minha esposa'), nos('...', 1)]).includes('PRESENTE'), 'presentear → PRESENTE')
    checa(tipos([cli('Vai ter Reposição da saia Clarisse???'), nos('...', 1)]).includes('PEDIU_REPOSICAO'), 'reposição → PEDIU_REPOSICAO')
    checa(tipos([cli('[a cliente mandou uma foto]'), nos('...', 1)]).includes('NAO_DEU_PARA_LER'), 'foto → NAO_DEU_PARA_LER')
    checa(tipos([cli('Vcs vendem atacado ?'), nos('...', 1)]).includes('ATACADO'), 'atacado → ATACADO')
    checa(tipos([cli('meu pedido veio com defeito, quero trocar'), nos('...', 1)]).includes('PEDIDO_COM_PROBLEMA'), 'defeito/troca → PEDIDO_COM_PROBLEMA')
    igual(tipos([cli('Bom dia'), nos('Oi!', 1)]), [], 'cumprimento sozinho não entra na fila')
    const silencio = analisarConversa([cli('onde fica o endereço de vocês?')], new Date(t0.getTime() + 30 * 3_600_000))
    checa(silencio.some((a) => a.tipo === 'SEM_RESPOSTA' && a.gravidade === 'grave'), '30h sem resposta → SEM_RESPOSTA grave')
    igual(tipos([cli('Mesmo assim muito obrigada pelo atendimento !!! 💖')], new Date(t0.getTime() + 30 * 3_600_000)), [], 'agradecimento final não é silêncio')
    igual(tipos([cli('qual o tamanho?')], new Date(t0.getTime() + 9 * 24 * 3_600_000)).includes('SEM_RESPOSTA'), false, 'silêncio de mais de 7 dias é reativação, não fila')
    checa(ehEncerramento('Certinho, muito obrigada ❤️'), 'certinho/obrigada encerra')
    checa(!ehEncerramento('Ok, mas qual o tamanho do Luna?'), '"ok, mas..." não encerra')
    igual(tipos([cli('quero parar de receber')]), [], 'quem pediu para sair não vira tarefa')
    igual(mascararCpf('meu cpf 123.456.789-09'), 'meu cpf 123.***.***-09', 'CPF sai mascarado')
    igual(ritmoDeLeitura([], t0).texto, 'Fila vazia. Nenhuma conversa esperando resposta.', 'fila vazia diz que está vazia')
    igual(sugerirCopys([{ tipo: 'PERGUNTOU_TAMANHO', quantas: 1 }]).length, 0, 'um caso só não vira sugestão de copy')
    igual(sugerirCopys([{ tipo: 'PERGUNTOU_TAMANHO', quantas: 3 }]).length, 1, 'três casos viram sugestão')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('19 · Observador de colunas')
    checa(!conversaAindaViva(null, t0), 'nunca falou → não está viva')
    checa(conversaAindaViva(new Date(t0.getTime() - 5 * 86_400_000), t0, 30), 'falou há 5 dias → viva')
    checa(!conversaAindaViva(new Date(t0.getTime() - 31 * 86_400_000), t0, 30), 'falou há 31 dias → não está viva')
    checa(conversaAindaViva(new Date(t0.getTime() + 3_600_000), t0, 30), 'data no futuro conta como viva')
    checa(MOVIMENTO_HUMANO.has('kanban_drag') && !MOVIMENTO_HUMANO.has('ai') && !MOVIMENTO_HUMANO.has('api'), 'só arrasto de pessoa dispensa a conversa viva')

    // ─────────────────────────────────────────────────────────────────────────────
    grupo('20 · Briefing — quebra em partes sem partir bloco')
    const blocos = ['a'.repeat(2000), 'b'.repeat(2000), 'c'.repeat(100)]
    const partes = emPartes(blocos, 3400)
    igual(partes.length, 2, 'dois blocos grandes não cabem juntos')
    checa(partes[0].startsWith('(1/2) ') && partes[1].startsWith('(2/2) '), 'rótulo (n/total) entra depois da quebra')
    checa(partes[1].includes('b'.repeat(2000)) && partes[1].includes('c'.repeat(100)), 'bloco não é partido ao meio')
    igual(emPartes(['curto']), ['curto'], 'uma parte só não ganha rótulo')
    igual(minutosDaHora('08:30', 0), 510, 'HH:mm vira minutos')
    igual(minutosDaHora('25:00', 480), 480, 'hora inválida cai no padrão')
    igual(minutosDaHora(undefined, 480), 480, 'sem env cai no padrão')
  } catch (e) {
    k.parou(e)
  }
  return k.resultado()
}
