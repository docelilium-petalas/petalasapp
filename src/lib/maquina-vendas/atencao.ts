/**
 * AS CONVERSAS QUE MERECEM ATENÇÃO — a fila de leitura da equipe.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Porte do `atencao.ts` do CRM CarBoss. A ESTRUTURA veio inteira (veto de
 * robô, repetição literal, catálogo com rótulo/porquê/ação/copy/prazo juntos,
 * silêncio com teto, encerramento, CPF mascarado, ritmo de leitura, sugestão
 * de copy com mínimo de casos). As CATEGORIAS não vieram — lá o cliente é uma
 * oficina perguntando de sistema; aqui é uma cliente perguntando de vestido.
 * Copiar a lista de lá classificaria "quero o Luna no M" como nada.
 *
 * ── NENHUMA CATEGORIA FOI INVENTADA ───────────────────────────────────────
 * Saíram da leitura das falas reais guardadas em `MvResposta` (clone da
 * produção de 04/10/2026: 8 conversas, 129 turnos). Cada uma cita o caso.
 * A única exceção está marcada: PEDIDO_COM_PROBLEMA ainda não apareceu na
 * base, mas a loja tem régua de troca (`dl_troca_instrucoes_v1`) e a primeira
 * reclamação não pode cair no mesmo balde de um "oi".
 *
 * ── O QUE ESTE ARQUIVO NÃO FAZ ────────────────────────────────────────────
 * Não decide e não manda nada. Ordena uma fila para uma PESSOA ler. A copy
 * sugerida é para a equipe conferir e mandar com o dedo dela; os
 * `{marcadores}` ficam visíveis porque cada um é decisão de quem leu.
 * Leitura pura: não escreve em tabela nenhuma.
 *
 * ── Fonte ──────────────────────────────────────────────────────────────────
 * `MvResposta.ultimasMsgs` (os 30 últimos turnos por telefone). Conversa que
 * não veio da Máquina também entra — a cliente que chegou pelo Instagram e
 * ficou sem resposta é exatamente o caso que esta tela existe para mostrar.
 *
 *   `grave`   — tem venda ou pedido do outro lado, e demorar é perder.
 *   `atencao` — merece resposta humana, mas nada quebra se esperar o dia.
 * Não existe nível baixo: fila com 200 itens irrelevantes não é lida.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { pediuParaSair } from './opt-out'
import { lerTurnosCrus } from './respostas'
import { formatarExibicao } from './telefone'

export type Gravidade = 'grave' | 'atencao'

export type TipoDeAtencao =
  | 'QUER_COMPRAR'
  | 'PEDIDO_COM_PROBLEMA'
  | 'PERGUNTOU_TAMANHO'
  | 'PEDIU_DESCONTO'
  | 'SEM_RESPOSTA'
  | 'FRETE_E_ENTREGA'
  | 'LOJA_FISICA'
  | 'PRESENTE'
  | 'PEDIU_REPOSICAO'
  | 'NAO_DEU_PARA_LER'
  | 'ATACADO'

export interface Turno {
  autor: 'nos' | 'cliente'
  texto: string
  quando: Date
}

export interface Achado {
  tipo: TipoDeAtencao
  gravidade: Gravidade
  rotulo: string
  porque: string
  oQueFazer: string
  copySugerida: string
  prazoHoras: number
  trecho: string
  quando: Date
}

/** Ordem da fila: menor primeiro. Venda e pedido com problema na frente. */
export const PESO: Record<TipoDeAtencao, number> = {
  QUER_COMPRAR: 0,
  PEDIDO_COM_PROBLEMA: 1,
  PERGUNTOU_TAMANHO: 2,
  PEDIU_DESCONTO: 3,
  SEM_RESPOSTA: 4,
  FRETE_E_ENTREGA: 5,
  LOJA_FISICA: 6,
  PRESENTE: 7,
  PEDIU_REPOSICAO: 8,
  NAO_DEU_PARA_LER: 9,
  ATACADO: 10,
}

// ═══════════════════════════════════════════════════════════════════════════
// O VETO QUE VEM ANTES DE TUDO
// ═══════════════════════════════════════════════════════════════════════════
// Na CarBoss metade das "falas" eram recados automáticos de empresa. Cliente de
// moda é pessoa física e quase não tem isso — mas basta UMA lojista com
// WhatsApp Business (atacado, ***575) para a fila ganhar robô falando com robô.
const RECADO_AUTOMATICO: readonly RegExp[] = [
  /agradece(mos)?\s+(o\s+)?(seu\s+contato|sua\s+mensagem)/i,
  /\b(entraremos|retornaremos|responderemos|retornarei)\b[^.!?]{0,40}\b(assim que|logo|o quanto antes)/i,
  /\bn[ãa]o\s+estamos\s+dispon[íi]ve(l|is)\b/i,
  /\batendimento\s+est[áa]\s+encerrado\b/i,
  /\bdeixe\s+(a\s+)?sua\s+mensagem\b/i,
  /\bsou\s+(o|a)\s+assistente\b/i,
  /\bseja\s+bem[\s-]?vind/i,
]

export function ehRecadoAutomatico(texto: string): boolean {
  const t = String(texto ?? '').trim()
  if (!t) return true
  return RECADO_AUTOMATICO.some((r) => r.test(t))
}

/** Frase longa repetida literalmente é assinatura de robô. "Oi" repetido é gente. */
const MINIMO_PARA_REPETICAO = 25
const achatar = (s: string) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

export function marcarRepetidos(turnos: Turno[]): Set<string> {
  const vistos = new Map<string, number>()
  for (const t of turnos) {
    if (t.autor !== 'cliente') continue
    const chave = achatar(t.texto)
    if (chave.length < MINIMO_PARA_REPETICAO) continue
    vistos.set(chave, (vistos.get(chave) ?? 0) + 1)
  }
  return new Set([...vistos.entries()].filter(([, n]) => n > 1).map(([k]) => k))
}

// ═══════════════════════════════════════════════════════════════════════════
// AS CATEGORIAS — cada uma com o caso real que a criou
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. QUER COMPRAR ─────────────────────────────────────────────────────────
//   ***215 "quero o vestido isis, ainda tem?" · "Pode sim! Manda o link por favor"
//   ***056 "Pode me mandar por gentileza" (depois de escolher o Luna no M)
// Quem pede o link já escolheu. Esfriar uma tarde é a perda mais cara da lista.
const QUER_COMPRAR: readonly RegExp[] = [
  /\bquero\s+(o|a|esse|essa|este|esta)\b/i,
  /\b(manda|mande|me\s+manda|pode\s+(me\s+)?mandar|envia|me\s+envia)\b[^?.!]{0,20}\b(o\s+)?link\b/i,
  /\bpode\s+me\s+mandar\b/i,
  /\b(vou|quero)\s+levar\b/i,
  /\bcomo\s+(fa[çc]o\s+(pra|para)\s+)?compr/i,
  /\b(posso|d[áa]\s+pra)\s+pagar\b|\bchave\s+pix\b|\bno\s+pix\b/i,
  /\bfechar\s+(o\s+)?pedido\b|\bfinalizar\s+(a\s+)?compra\b/i,
]

// ── 2. PEDIDO COM PROBLEMA (categoria de risco, ainda sem caso medido) ─────
const PEDIDO_COM_PROBLEMA: readonly RegExp[] = [
  /\b(n[ãa]o\s+chegou|ainda\s+n[ãa]o\s+recebi|cad[êe]\s+(o\s+)?(meu\s+)?pedido|atrasad[oa])\b/i,
  /\b(veio|chegou)\s+(errad[oa]|com\s+defeito|rasgad[oa]|manchad[oa]|furad[oa])\b/i,
  /\b(trocar|troca|devolver|devolu[çc][ãa]o|reembolso|estorno)\b/i,
  /\bn[ãa]o\s+(serviu|coube|ficou\s+bom)\b/i,
  /\brastreio\b[^?.!]{0,25}\b(n[ãa]o|parado|sem)\b/i,
]

// ── 3. PERGUNTOU TAMANHO ───────────────────────────────────────────────────
//   ***215 "Vocês ainda têm o vestido Luna no tamanho M?" · "O tamanho que eu uso é o PP"
//   ***148 "Ele tem quais tamanhos?" · "qual tamanho ele é"
//   ***488 "A modelo está usando qual tamanho da saia?"
//   ***056 "Ela veste M"
// Tamanho é a trava número 1 de moda online. Quem pergunta está provando a peça.
const TAMANHO: readonly RegExp[] = [
  /\btamanhos?\b/i,
  /\b(veste|visto|uso|usa)\s+(o\s+)?(pp|p|m|g|gg|\d{2})\b/i,
  /\bno\s+(pp|p|m|g|gg)\b/i,
  /\b(medidas?|modelagem|forma\s+(pequeno|grande)|serve\s+em\s+quem)\b/i,
  /\b(ainda\s+)?tem\s+(no|o|a)\s+(pp|p|m|g|gg)\b/i,
]

// ── 4. PEDIU DESCONTO ──────────────────────────────────────────────────────
//   ***215 "me da um desconto? to achando meio caro"
// Objeção de preço é venda na mesa. ⚠️ Regra da casa: o único cupom é MINHADL,
// e só para quem tem carrinho abandonado VIVO. A tela lembra disso na ação.
const DESCONTO: readonly RegExp[] = [
  /\bdesconto\b/i,
  /\bcupom\b/i,
  /\b(t[áa]|to|t[ôo]|achei|achando|meio|muito|bem)\s+(meio\s+)?car[oa]\b/i,
  /\b(faz|fazer|tem)\s+(um\s+)?(pre[çc]o\s+melhor|promo[çc][ãa]o)\b/i,
]

// ── 5. FRETE E ENTREGA ─────────────────────────────────────────────────────
//   ***274 "Vocês entrega em Goiânia?" · "Tem taxa de entrega para Goiânia?"
//   ***148 "E de Goiânia ?" · "Pq o contato é 62"
const FRETE: readonly RegExp[] = [
  /\b(frete|taxa\s+de\s+entrega|entrega[mr]?|envi(a|am)\s+para|chega\s+em\s+quantos)\b/i,
  /\bprazo\s+de\s+(entrega|envio)\b/i,
  /\bmotoboy\b|\bretirar\b|\bretirada\b/i,
]

// ── 6. LOJA FÍSICA ─────────────────────────────────────────────────────────
//   ***215 "vocês estão abertos hoje?" · "onde fica o endereço de vocês?" ·
//          "voces tem loja fisica? onde fica pra eu ir ai"
//   ***148 "Onde é a loja." · ***274 "De onde vcs são?"
const LOJA_FISICA: readonly RegExp[] = [
  /\bloja\s+f[íi]sica\b/i,
  /\b(onde\s+(fica|[ée])|qual\s+o)\s+(a\s+loja|o\s+endere[çc]o|endere[çc]o)\b/i,
  /\bendere[çc]o\s+de\s+voc[êe]s\b/i,
  /\b(est[ãa]o|t[ãa]o)\s+abert[oa]s?\b/i,
  /\bde\s+onde\s+(voc[êe]s|vcs)\s+s[ãa]o\b/i,
  /\bpra\s+eu\s+ir\s+a[íi]\b/i,
]

// ── 7. PRESENTE ────────────────────────────────────────────────────────────
//   ***056 "gostaria de presentear minha esposa . Acho q chama vestido Luna"
// Quem compra para outra pessoa precisa de ajuda com tamanho e troca — e
// costuma ter data. Vale perguntar a data na primeira resposta.
const PRESENTE: readonly RegExp[] = [
  /\bpresente(ar)?\b/i,
  /\b(pra|para)\s+(minha|meu)\s+(esposa|namorada|m[ãa]e|filha|irm[ãa]|amiga|sogra)\b/i,
  /\banivers[áa]rio\s+d[aeo]\b/i,
]

// ── 8. PEDIU REPOSIÇÃO ─────────────────────────────────────────────────────
//   ***820 "Vai ter Reposição da saia Clarisse???" · "Espero que ela volte pra o estoque"
// Não é perda: é a lista de desejos (`dl_lista_desejos_voltou_v1`) sem ninguém
// ter anotado o nome da peça.
const REPOSICAO: readonly RegExp[] = [
  /\breposi[çc][ãa]o\b/i,
  /\bvolt(e|ar|a)\s+(pr[ao]|para\s+o)\s+estoque\b/i,
  /\b(vai\s+)?voltar\s+a\s+ter\b/i,
  /\bme\s+avis(a|e)\s+quando\b/i,
]

// ── 9. NÃO DEU PARA LER ────────────────────────────────────────────────────
//   ***575 e ***488 "[a cliente mandou uma foto]" — a foto É a pergunta (qual peça).
const ILEGIVEL: readonly RegExp[] = [
  /^\[a\s+cliente\s+mandou\s+(uma?\s+)?(foto|imagem|[áa]udio|v[íi]deo|figurinha|documento|sticker)/i,
  /\[(image|audio|video|sticker|document|media)\]/i,
]

// ── 10. ATACADO ────────────────────────────────────────────────────────────
//   ***575 "Vcs vendem atacado ?"
const ATACADO: readonly RegExp[] = [/\batacado\b/i, /\brevend(a|er|edora)\b/i, /\bpre[çc]o\s+de\s+lojista\b/i]

interface Definicao {
  tipo: TipoDeAtencao
  gravidade: Gravidade
  rotulo: string
  porque: string
  oQueFazer: string
  copySugerida: string
  prazoHoras: number
  padroes: readonly RegExp[]
}

/** Rótulo, porquê, ação, copy e prazo moram JUNTO do detector — nunca na tela. */
const CATALOGO: readonly Definicao[] = [
  {
    tipo: 'QUER_COMPRAR',
    gravidade: 'grave',
    rotulo: 'Quer comprar',
    porque: 'Ela já escolheu a peça e pediu o caminho. Cada hora sem link é uma chance de desistir.',
    oQueFazer: 'Mande o link da peça no tamanho certo agora, e pergunte se pode ajudar a finalizar.',
    copySugerida: 'Oi, {nome}! 🌸 Separei aqui pra você: {link da peça}. É só escolher o tamanho {tamanho} e finalizar — qualquer dúvida no caminho, me chama que eu te ajudo.',
    prazoHoras: 1,
    padroes: QUER_COMPRAR,
  },
  {
    tipo: 'PEDIDO_COM_PROBLEMA',
    gravidade: 'grave',
    rotulo: 'Pedido com problema',
    porque: 'Cliente que já pagou e está insatisfeita. Não é venda: é a próxima compra (e a avaliação) em risco.',
    oQueFazer: 'Abra o pedido na Nuvemshop, confira rastreio/item e responda com a solução — não com "vou verificar".',
    copySugerida: '{nome}, sinto muito por isso! Já abri seu pedido {número} aqui e {o que encontrei}. Vou resolver pra você: {solução}.',
    prazoHoras: 2,
    padroes: PEDIDO_COM_PROBLEMA,
  },
  {
    tipo: 'PERGUNTOU_TAMANHO',
    gravidade: 'grave',
    rotulo: 'Perguntou tamanho',
    porque: 'Tamanho é a trava número 1 de moda online. Quem pergunta está provando a peça na cabeça.',
    oQueFazer: 'Responda com a medida real da peça (busto/cintura/comprimento) e se ainda há no tamanho dela.',
    copySugerida: 'Oi, {nome}! O {peça} no {tamanho} tem {medidas}. A modelo da foto usa {tamanho da modelo}. Ainda tenho {disponibilidade} — quer que eu te mande o link?',
    prazoHoras: 2,
    padroes: TAMANHO,
  },
  {
    tipo: 'PEDIU_DESCONTO',
    gravidade: 'grave',
    rotulo: 'Pediu desconto',
    porque: 'Objeção de preço é venda na mesa — e a resposta errada (cupom inventado) vira regra para todas.',
    oQueFazer: 'Veja se ela tem carrinho abandonado VIVO: só então o MINHADL (10%). Sem carrinho, valorize a peça — nunca invente cupom.',
    copySugerida: '{nome}, entendo! {Se tiver carrinho vivo: Pra você fechar hoje, usa o cupom MINHADL que dá 10% no carrinho que você montou.} {Sem carrinho: O {peça} é {o que justifica o preço} — e a troca é por nossa conta se não servir.}',
    prazoHoras: 2,
    padroes: DESCONTO,
  },
  {
    tipo: 'FRETE_E_ENTREGA',
    gravidade: 'atencao',
    rotulo: 'Perguntou de entrega',
    porque: 'Frete desconhecido é o motivo mais comum de carrinho abandonado. Ela está calculando se vale.',
    oQueFazer: 'Responda com o valor e o prazo para a cidade dela (Goiânia tem entrega local).',
    copySugerida: 'Entregamos sim, {nome}! Para {cidade} fica {valor} e chega em {prazo}. Quer que eu te mande o link da peça?',
    prazoHoras: 3,
    padroes: FRETE,
  },
  {
    tipo: 'LOJA_FISICA',
    gravidade: 'atencao',
    rotulo: 'Quer ir até a loja',
    porque: 'Quer ver ou provar antes de comprar. Sem resposta clara, ela não compra nem online.',
    oQueFazer: 'Diga como funciona (online + Goiânia) e ofereça o caminho: provador, retirada ou link.',
    copySugerida: 'Oi, {nome}! Somos de Goiânia e atendemos {como funciona o atendimento presencial}. Se preferir, te mando as medidas certinhas e a troca é por nossa conta. 🌸',
    prazoHoras: 3,
    padroes: LOJA_FISICA,
  },
  {
    tipo: 'PRESENTE',
    gravidade: 'atencao',
    rotulo: 'É para presente',
    porque: 'Quem compra para outra pessoa precisa de ajuda com tamanho e troca — e quase sempre tem uma data.',
    oQueFazer: 'Pergunte a data e o tamanho de quem vai usar; explique a troca.',
    copySugerida: 'Que presente lindo, {nome}! 💖 Pra quando é? Me diz o tamanho que {ela} usa e eu te ajudo a acertar — e se não servir, a troca é tranquila.',
    prazoHoras: 4,
    padroes: PRESENTE,
  },
  {
    tipo: 'PEDIU_REPOSICAO',
    gravidade: 'atencao',
    rotulo: 'Quer uma peça esgotada',
    porque: 'Não é perda: é lista de desejos. Ela disse exatamente o que compra quando voltar.',
    oQueFazer: 'Anote a peça e o tamanho na nota do contato e ofereça uma parecida em estoque.',
    copySugerida: '{nome}, anotei aqui: {peça} no {tamanho}. Assim que voltar eu te aviso primeiro! Enquanto isso, olha {sugestão parecida} 🌸',
    prazoHoras: 24,
    padroes: REPOSICAO,
  },
  {
    tipo: 'NAO_DEU_PARA_LER',
    gravidade: 'atencao',
    rotulo: 'Mandou foto ou áudio',
    porque: 'A pergunta está na mídia, e o texto não existe no banco. Só abrindo a conversa para saber.',
    oQueFazer: 'Abra a conversa no Chatwoot/WhatsApp, veja a mídia e responda.',
    copySugerida: '',
    prazoHoras: 4,
    padroes: ILEGIVEL,
  },
  {
    tipo: 'ATACADO',
    gravidade: 'atencao',
    rotulo: 'Pergunta de atacado',
    porque: 'Não é cliente final: é possível revendedora. Merece resposta de quem decide condição comercial.',
    oQueFazer: 'Passe para a Marília decidir se a Doce Lilium vende para lojista e em que condição.',
    copySugerida: 'Oi! Obrigada pelo interesse na Doce Lilium 🌸 Vou te passar para a Marília, que cuida das condições para lojistas.',
    prazoHoras: 24,
    padroes: ATACADO,
  },
]

const HORAS_ATE_SILENCIO = 3
const HORAS_ATE_ABANDONO = 24
/** Depois disto o silêncio é reativação, não fila de leitura. Ver a origem. */
export const DIAS_ATE_ESFRIAR = 7

/** Última fala que fecha a conversa — vale SÓ para o silêncio.
 *  ***945 "Certinho, muito obrigada ❤️" · ***820 "Mesmo assim muito obrigada pelo atendimento !!! 💖" · ***575 "Obrigado" */
const ENCERRAMENTO: readonly RegExp[] = [
  /obrigad[oa]\s+(pelo\s+atendimento|pela\s+aten[çc][ãa]o)/i,
  /\b(eu\s+)?(te\s+)?(aviso|retorno|chamo)\b[^.!?]{0,15}$/i,
  /^\s*(ok|okay|blz|beleza|valeu|vlw|obrigad[oa]?|muito\s+obrigad[oa]|t[dm]\s+certo|tudo\s+certo|certinho|maravilha|perfeito|combinado|show|sim|n[ãa]o|👍|🙏|❤️|💖|🥰)/i,
]
const MAXIMO_DE_ENCERRAMENTO = 60
const SAUDACAO = /^(bom\s+dia|boa\s+tarde|boa\s+noite|ol[áa]|oi+|opa|e\s*a[íi])\b[\s,.!;:-]*/i

export function ehEncerramento(texto: string): boolean {
  const t = achatar(texto)
  if (!t) return true
  if (/obrigad[oa]\s+(pelo\s+atendimento|pela\s+aten[çc][ãa]o)/.test(t)) return true
  if (/^https?:\/\/\S+$/.test(t)) return true
  if (t.length > MAXIMO_DE_ENCERRAMENTO) return false
  // "Ok, mas qual o tamanho?" começa com ok e é pergunta. Pergunta nunca fecha.
  if (t.includes('?') || /\b(mas|por[ée]m|s[óo]\s+que)\b/.test(t)) return false
  const semSaudacao = t.replace(SAUDACAO, '').trim()
  if (!semSaudacao) return true
  return ENCERRAMENTO.some((r) => r.test(semSaudacao))
}

/** CPF nunca aparece inteiro. Ficam 3 primeiros e 2 últimos. */
export const mascararCpf = (t: string): string => t.replace(/\b(\d{3})\.?\d{3}\.?\d{3}-?(\d{2})\b/g, '$1.***.***-$2')

const corta = (t: string, n = 180) => {
  const s = mascararCpf(String(t ?? '').replace(/\s+/g, ' ').trim())
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/** Analisa UMA conversa. `agora` por parâmetro: o silêncio depende do relógio. */
export function analisarConversa(turnos: Turno[], agora: Date = new Date()): Achado[] {
  const achados: Achado[] = []
  const repetidos = marcarRepetidos(turnos)
  const ehRuido = (t: Turno) => ehRecadoAutomatico(t.texto) || repetidos.has(achatar(t.texto))

  for (const turno of turnos) {
    if (turno.autor !== 'cliente' || ehRuido(turno)) continue
    // Quem pediu para sair não entra em fila de "procure essa pessoa".
    if (pediuParaSair(turno.texto).saiu) continue
    for (const d of CATALOGO) {
      if (d.padroes.some((p) => p.test(turno.texto))) {
        achados.push({
          tipo: d.tipo,
          gravidade: d.gravidade,
          rotulo: d.rotulo,
          porque: d.porque,
          oQueFazer: d.oQueFazer,
          copySugerida: d.copySugerida,
          prazoHoras: d.prazoHoras,
          trecho: corta(turno.texto),
          quando: turno.quando,
        })
      }
    }
  }

  const ultimo = turnos[turnos.length - 1]
  if (ultimo && ultimo.autor === 'cliente' && !ehRuido(ultimo) && !pediuParaSair(ultimo.texto).saiu && !ehEncerramento(ultimo.texto)) {
    const horas = (agora.getTime() - ultimo.quando.getTime()) / 3_600_000
    if (horas >= HORAS_ATE_SILENCIO && horas <= DIAS_ATE_ESFRIAR * 24) {
      const abandonado = horas >= HORAS_ATE_ABANDONO
      achados.push({
        tipo: 'SEM_RESPOSTA',
        gravidade: abandonado ? 'grave' : 'atencao',
        rotulo: 'Falou e ficou sem resposta',
        porque: `Há ${Math.floor(horas)}h sem retorno nosso (nem da IA). Silêncio depois de a cliente escrever é a maior causa de desistência.`,
        oQueFazer: abandonado
          ? 'Responda reconhecendo a demora. Não deixe uma mensagem da régua sair por cima.'
          : 'Responda agora, mesmo que seja só para dizer que vai olhar e já volta.',
        copySugerida: abandonado
          ? 'Oi, {nome}! Desculpa a demora em voltar aqui 🌸 Li sua mensagem e queria te responder direitinho: {retomada}'
          : 'Oi, {nome}! Vi sua mensagem, deixa eu conferir aqui e já te respondo 🌸',
        prazoHoras: abandonado ? 1 : 3,
        trecho: corta(ultimo.texto),
        quando: ultimo.quando,
      })
    }
  }

  // Um achado por tipo — o mais recente.
  const porTipo = new Map<TipoDeAtencao, Achado>()
  for (const a of achados) {
    const atual = porTipo.get(a.tipo)
    if (!atual || a.quando > atual.quando) porTipo.set(a.tipo, a)
  }
  return [...porTipo.values()].sort((x, y) => PESO[x.tipo] - PESO[y.tipo])
}

export interface ConversaNaFila {
  telefoneKey: string
  /** A inscrição mais recente desta cliente, se a Máquina já falou com ela. É por ela que abre o dossiê. */
  inscricaoId: string | null
  nome: string
  /** Mascarado, como em todo o módulo. */
  telefone: string
  cadencia: string | null
  gravidade: Gravidade
  venceEm: string
  /** A última fala é dela (e não é um "obrigada"): a bola está com a gente. */
  esperandoResposta: boolean
  /** Passou do prazo E ainda espera resposta. Conversa já respondida nunca fica atrasada. */
  atrasada: boolean
  /** Última fala dela tem mais de uma semana: é reativação, não resposta. */
  esfriou: boolean
  /** Alguém da equipe já falou com ela (Chatwoot/celular)? */
  equipeFalou: boolean
  achados: Array<Omit<Achado, 'quando'> & { quando: string }>
}

export interface RitmoDeLeitura {
  aCadaHoras: number
  texto: string
  temAtraso: boolean
}

export interface SugestaoDeCopy {
  problema: string
  quantosCasos: number
  categoria: 'MARKETING' | 'UTILITY'
  porqueCategoria: string
  ondeEntra: string
  corpo: string
}

export interface FilaDeAtencao {
  conversas: ConversaNaFila[]
  medidoEm: Date
  conversasLidas: number
  esperandoAgora: number
  somenteRobo: number
  porTipo: Array<{ tipo: TipoDeAtencao; rotulo: string; quantas: number; gravidade: Gravidade }>
  ritmo: RitmoDeLeitura
  sugestoesDeCopy: SugestaoDeCopy[]
}

/** De quanto em quanto tempo abrir a fila. Sai do MENOR prazo em aberto, não de preferência. */
export function ritmoDeLeitura(conversas: ConversaNaFila[], agora: Date): RitmoDeLeitura {
  const quentes = conversas.filter((c) => !c.esfriou)
  const atrasadas = quentes.filter((c) => c.atrasada).length
  const graves = quentes.filter((c) => c.gravidade === 'grave').length
  const frias = conversas.length - quentes.length
  const sobraFrio = frias > 0 ? ` (${frias} de antes da última semana, para reativar sem pressa)` : ''

  if (atrasadas > 0) {
    return {
      aCadaHoras: 1,
      temAtraso: true,
      texto: `${atrasadas} ${atrasadas === 1 ? 'conversa passou' : 'conversas passaram'} do prazo. Abra agora e zere antes de voltar para a fila.${sobraFrio}`,
    }
  }
  if (graves > 0) {
    const proxima = quentes
      .filter((c) => c.gravidade === 'grave')
      .map((c) => new Date(c.venceEm).getTime())
      .sort((a, b) => a - b)[0]
    const horas = Math.max(1, Math.round((proxima - agora.getTime()) / 3_600_000))
    return {
      aCadaHoras: horas,
      temAtraso: false,
      texto: `${graves} ${graves === 1 ? 'conversa grave' : 'conversas graves'} na fila. A mais urgente vence em ${horas}h — volte aqui antes disso.${sobraFrio}`,
    }
  }
  if (quentes.length > 0) {
    return { aCadaHoras: 12, temAtraso: false, texto: `Nada urgente. Duas passadas por dia — de manhã e no fim da tarde — dão conta.${sobraFrio}` }
  }
  if (frias > 0) {
    return { aCadaHoras: 24, temAtraso: false, texto: `Nada novo esperando. Sobraram ${frias} conversas antigas para uma rodada de reativação quando der.` }
  }
  return { aCadaHoras: 24, temAtraso: false, texto: 'Fila vazia. Nenhuma conversa esperando resposta.' }
}

const MINIMO_DE_CASOS = 2

/**
 * O que a base está pedindo de copy nova. Só aparece com ≥2 casos: uma
 * conversa é anedota. Proposta para a dona da marca revisar — nunca submetida
 * sozinha (template aprovado não se edita; nasce `_v1` novo).
 */
export function sugerirCopys(porTipo: Array<{ tipo: TipoDeAtencao; quantas: number }>): SugestaoDeCopy[] {
  const quantas = (t: TipoDeAtencao) => porTipo.find((p) => p.tipo === t)?.quantas ?? 0
  const s: SugestaoDeCopy[] = []

  const tamanho = quantas('PERGUNTOU_TAMANHO')
  if (tamanho >= MINIMO_DE_CASOS) {
    s.push({
      problema: 'Tamanho é a pergunta que mais aparece. Ela trava a compra até alguém responder com medida real.',
      quantosCasos: tamanho,
      categoria: 'MARKETING',
      porqueCategoria: 'Leva a cliente de volta a uma peça que ela ainda não comprou: é oferta, e a Meta lê assim.',
      ondeEntra: 'Toque 2 do carrinho (no lugar da "dúvida" genérica), com a medida da peça do carrinho.',
      corpo: 'Oi, {{1}}! Fiquei pensando se o tamanho te deixou na dúvida 🌸 O {{2}} tem modelagem {{3}}. Quer que eu te passe as medidas certinhas?',
    })
  }
  const reposicao = quantas('PEDIU_REPOSICAO')
  if (reposicao >= MINIMO_DE_CASOS) {
    s.push({
      problema: 'Clientes pedindo peça esgotada e ninguém anotando qual. A lista de desejos já tem template.',
      quantosCasos: reposicao,
      categoria: 'MARKETING',
      porqueCategoria: 'Já existe e está aprovado: `dl_lista_desejos_voltou_v1`. Falta só a lista.',
      ondeEntra: 'Observador de marketing (`lista_desejos`): alimentar com a peça anotada na conversa.',
      corpo: '(usar `dl_lista_desejos_voltou_v1` — sem template novo)',
    })
  }
  const frete = quantas('FRETE_E_ENTREGA') + quantas('LOJA_FISICA')
  if (frete >= MINIMO_DE_CASOS) {
    s.push({
      problema: 'Entrega e loja física aparecem antes de qualquer pergunta de peça. É dúvida de confiança, não de produto.',
      quantosCasos: frete,
      categoria: 'UTILITY',
      porqueCategoria: 'Responde uma pergunta que a própria cliente fez — mas o melhor lugar é o prompt da IA, não um template.',
      ondeEntra: 'Base de conhecimento da IA do WhatsApp (fluxo n8n), com valor e prazo por região.',
      corpo: '(resposta da IA, não template)',
    })
  }
  return s
}

/** Telefone mascarado do mesmo jeito em todo o módulo. */
const mascarar = (e164: string) => {
  const d = String(e164 ?? '').replace(/\D/g, '')
  return d.length >= 8 ? `${d.slice(0, 4)}•••••${d.slice(-3)}` : formatarExibicao(e164)
}

/**
 * A fila inteira. `desde`/`ate` recortam pela ÚLTIMA fala da conversa.
 * Só leitura: `MvResposta`, `MvInscricao`, `MvCursor`.
 */
export async function montarFilaDeAtencao(desde?: Date, ate?: Date, agora: Date = new Date()): Promise<FilaDeAtencao> {
  const respostas = await prisma.mvResposta.findMany({
    where: desde || ate ? { respondidoEm: { ...(desde && { gte: desde }), ...(ate && { lte: ate }) } } : {},
    select: { telefoneKey: true, telefoneE164: true, ultimasMsgs: true },
    orderBy: { respondidoEm: 'desc' },
    take: 1000,
  })
  const chaves = respostas.map((r) => r.telefoneKey)

  const [inscricoes, humanos] = await Promise.all([
    chaves.length
      ? prisma.mvInscricao.findMany({
          where: { telefoneKey: { in: chaves } },
          select: { id: true, telefoneKey: true, nomeSnapshot: true, humanoFalouEm: true, cadencia: { select: { nome: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    chaves.length
      ? prisma.mvCursor.findMany({ where: { chave: { in: chaves.map((k) => `atendimento:humano:${k}`) } }, select: { chave: true } })
      : Promise.resolve([]),
  ])
  const principal = new Map<string, (typeof inscricoes)[number]>()
  const equipeFalou = new Set<string>(humanos.map((h) => h.chave.slice('atendimento:humano:'.length)))
  for (const i of inscricoes) {
    if (!principal.has(i.telefoneKey)) principal.set(i.telefoneKey, i)
    if (i.humanoFalouEm) equipeFalou.add(i.telefoneKey)
  }

  const conversas: ConversaNaFila[] = []
  let somenteRobo = 0
  let lidas = 0
  for (const r of respostas) {
    const turnos: Turno[] = lerTurnosCrus(r.ultimasMsgs)
      .sort((a, b) => a.em.getTime() - b.em.getTime())
      .map((t) => ({ autor: t.de === 'cliente' ? 'cliente' : 'nos', texto: t.texto, quando: t.em }))
    const delas = turnos.filter((t) => t.autor === 'cliente')
    if (!delas.length) continue
    lidas++

    const achados = analisarConversa(turnos, agora)
    if (!achados.length) {
      if (delas.every((t) => ehRecadoAutomatico(t.texto))) somenteRobo++
      continue
    }
    const vence = Math.min(...achados.map((a) => a.quando.getTime() + a.prazoHoras * 3_600_000))
    const ultimaFala = Math.max(...delas.map((t) => t.quando.getTime()))
    const i = principal.get(r.telefoneKey)
    const ultimo = turnos[turnos.length - 1]
    const esperandoResposta = ultimo.autor === 'cliente' && !ehEncerramento(ultimo.texto)
    conversas.push({
      telefoneKey: r.telefoneKey,
      inscricaoId: i?.id ?? null,
      nome: i?.nomeSnapshot || `cliente ***${r.telefoneKey.slice(-4)}`,
      telefone: mascarar(r.telefoneE164 ?? r.telefoneKey),
      cadencia: i?.cadencia.nome ?? null,
      gravidade: achados.some((a) => a.gravidade === 'grave') ? 'grave' : 'atencao',
      venceEm: new Date(vence).toISOString(),
      esperandoResposta,
      atrasada: esperandoResposta && vence < agora.getTime(),
      esfriou: agora.getTime() - ultimaFala > DIAS_ATE_ESFRIAR * 24 * 3_600_000,
      equipeFalou: equipeFalou.has(r.telefoneKey),
      achados: achados.map((a) => ({ ...a, quando: a.quando.toISOString() })),
    })
  }

  conversas.sort((a, b) => {
    if (a.esfriou !== b.esfriou) return a.esfriou ? 1 : -1
    if (a.atrasada !== b.atrasada) return a.atrasada ? -1 : 1
    if (a.gravidade !== b.gravidade) return a.gravidade === 'grave' ? -1 : 1
    return a.venceEm.localeCompare(b.venceEm)
  })

  const contagem = new Map<TipoDeAtencao, { rotulo: string; gravidade: Gravidade; quantas: number }>()
  for (const c of conversas) {
    for (const a of c.achados) {
      const atual = contagem.get(a.tipo)
      if (atual) atual.quantas++
      else contagem.set(a.tipo, { rotulo: a.rotulo, gravidade: a.gravidade, quantas: 1 })
    }
  }
  const porTipo = [...contagem.entries()].map(([tipo, v]) => ({ tipo, ...v })).sort((a, b) => PESO[a.tipo] - PESO[b.tipo])

  return {
    conversas,
    medidoEm: agora,
    conversasLidas: lidas,
    esperandoAgora: conversas.filter((c) => !c.esfriou && c.esperandoResposta).length,
    somenteRobo,
    porTipo,
    ritmo: ritmoDeLeitura(conversas, agora),
    sugestoesDeCopy: sugerirCopys(porTipo),
  }
}
