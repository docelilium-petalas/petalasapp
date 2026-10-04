'use client'

/**
 * O DOSSIÊ DA CLIENTE — porte de `components/maquina-vendas/DossieContato.tsx`
 * da CarBoss, com a pele e o vocabulário da Doce Lilium.
 *
 * Uma pessoa, a régua inteira, num trilho só: o que ela já recebeu (com a
 * prova da Meta), o que ela respondeu, quando a equipe assumiu, o pedido, e o
 * que ainda vai sair. Marcos e mensagens na MESMA ordem cronológica — é a
 * costura ("respondeu depois do 2º toque") que interessa.
 *
 * Três promessas que a tela não quebra:
 *  · "sem confirmação" tem cor própria e NÃO é verde;
 *  · o selo do texto diz se aquilo é o que ela LEU, o que VAI sair ou uma
 *    reconstrução — nunca mostra copy no lugar de texto perdido;
 *  · a linha do AGORA usa o relógio do servidor que montou o dossiê.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, ArrowLeft, Bot, CheckCheck, ExternalLink, MessageCircle, Package,
  RefreshCw, Rocket, ShoppingBag, Sparkles, User,
} from 'lucide-react'
import { getDossieDoContato } from '@/app/actions/maquina-vendas'
import { Chip, type TomDl } from './comum'

type Dossie = Awaited<ReturnType<typeof getDossieDoContato>>
type Passo = Dossie['passos'][number]
type Marco = Dossie['marcos'][number]

const relogio = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
})
const soHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false })

/** "7 min", "3h55", "2d 4h" — a unidade acompanha a ordem de grandeza. */
function intervalo(ms: number): string | null {
  const min = Math.round(Math.abs(ms) / 60000)
  if (min < 1) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h${String(min % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

/** O estado do envio. A cor diz o que o rótulo diria se ninguém lesse. */
const ESTADO: Record<string, { rotulo: string; tique: string; classe: string }> = {
  LIDA: { rotulo: 'lida', tique: '✓✓', classe: 'text-info bg-info/10' },
  ENTREGUE: { rotulo: 'entregue', tique: '✓✓', classe: 'text-success bg-success/10' },
  SEM_PROVA: { rotulo: 'sem confirmação', tique: '✓', classe: 'text-warning bg-warning/10' },
  FALHOU: { rotulo: 'não chegou', tique: '✗', classe: 'text-destructive bg-destructive/10' },
  DEVOLVIDA: { rotulo: 'voltou para a fila', tique: '↩', classe: 'text-warning bg-warning/10' },
  AGENDADA: { rotulo: 'vai sair', tique: '◷', classe: 'text-primary bg-primary/10' },
  ATRASADA: { rotulo: 'atrasada na fila', tique: '!', classe: 'text-warning bg-warning/15' },
  CANCELADA: { rotulo: 'não vai sair', tique: '—', classe: 'text-muted-foreground bg-muted' },
  PULADA: { rotulo: 'pulada', tique: '»', classe: 'text-warning bg-warning/10' },
  VETADA: { rotulo: 'vetada pelo guarda de texto', tique: '⊘', classe: 'text-destructive bg-destructive/10' },
  SAIU: { rotulo: 'saiu', tique: '✓', classe: 'text-muted-foreground bg-muted' },
}

/** O selo do texto — o que a frase logo abaixo dele promete. */
const SELO_DO_TEXTO: Record<string, { rotulo: string; classe: string }> = {
  entregue: { rotulo: 'texto entregue', classe: 'text-success' },
  livre: { rotulo: 'texto livre — foi isto que saiu', classe: 'text-muted-foreground' },
  'vai-sair': { rotulo: 'é isto que vai sair', classe: 'text-primary' },
  'nao-vai-sair': { rotulo: 'era isto que sairia — não vai sair', classe: 'text-muted-foreground' },
  reconstruido: { rotulo: '⚠ reconstruído do corpo aprovado hoje', classe: 'text-warning' },
  'copy-planejada': { rotulo: 'copy da cadência — depende da janela', classe: 'text-muted-foreground' },
  desconhecido: { rotulo: '⚠ não é o texto que a cliente recebeu', classe: 'text-warning' },
  indisponivel: { rotulo: 'sem texto recuperável', classe: 'text-muted-foreground' },
}

/** O estado do template na Meta. `NAO_ENCONTRADO` é o 132001 esperando acontecer. */
const SELO_TEMPLATE: Record<string, { rotulo: string; tom: TomDl; titulo: string }> = {
  APPROVED: { rotulo: 'aprovado', tom: 'positivo', titulo: 'A Meta aprovou este template. Ele entrega fora da janela de 24 h.' },
  PENDING: { rotulo: 'em análise', tom: 'alerta', titulo: 'A Meta ainda não aprovou. Disparar assim devolve 132001 e a mensagem não sai.' },
  REJECTED: { rotulo: 'reprovado', tom: 'negativo', titulo: 'A Meta reprovou este template. Ele não entrega.' },
  PAUSED: { rotulo: 'pausado', tom: 'negativo', titulo: 'A Meta pausou este template por qualidade baixa.' },
  DISABLED: { rotulo: 'desativado', tom: 'negativo', titulo: 'Template desativado na conta. Ele não entrega.' },
  NAO_ENCONTRADO: { rotulo: 'não existe na conta', tom: 'negativo', titulo: 'A Meta respondeu e este nome NÃO está na conta. Quando a régua chegar aqui, o envio devolve 132001.' },
  NAO_CONSULTADO: { rotulo: 'não consultado', tom: undefined, titulo: 'Não deu para perguntar à Meta. Não é "aprovado" nem "reprovado": é não sei.' },
  CATALOGO: { rotulo: 'só catálogo local', tom: undefined, titulo: 'A Meta não respondeu; o estado vem do catálogo do código.' },
}

const ICONE_MARCO: Record<Marco['tipo'], typeof User> = {
  entrada: Sparkles, resposta: MessageCircle, equipe: User, pedido: ShoppingBag, parada: AlertTriangle,
}
const COR_MARCO: Record<Marco['tipo'], string> = {
  entrada: 'text-primary', resposta: 'text-info', equipe: 'text-warning', pedido: 'text-success', parada: 'text-destructive',
}

/** ESTÁ NA FILA? Não é o mesmo que `futuro`: a atrasada fica acima do agora e ainda vai sair. */
const naFila = (p: Passo) => p.estado === 'AGENDADA' || p.estado === 'ATRASADA'

function corDeQuem(p: Passo): string {
  if (p.deQuem === 'cliente') return 'text-info border-info/40 bg-info/10'
  if (p.deQuem === 'equipe') return 'text-warning border-warning/40 bg-warning/10'
  if (p.deQuem === 'ia') return 'text-muted-foreground border-border bg-muted'
  return p.motor === 'transacional' ? 'text-success border-success/40 bg-success/10' : 'text-primary border-primary/40 bg-primary/10'
}

function Marcador({ passo }: { passo: Passo }) {
  const inativo = passo.estado === 'CANCELADA'
  const Icone = passo.deQuem === 'cliente' ? MessageCircle : passo.deQuem === 'ia' ? Bot : User
  return (
    <div
      className={`relative z-10 shrink-0 grid place-items-center rounded-xl w-11 h-[34px] border ocr-mono font-bold ${passo.marcador.length > 2 ? 'text-[11px]' : 'text-xs'} ${
        inativo ? 'text-muted-foreground border-border bg-card' : corDeQuem(passo)
      } ${naFila(passo) ? 'border-dashed' : ''}`}
    >
      {passo.deQuem === 'nos' ? passo.marcador : <Icone className="w-4 h-4" />}
    </div>
  )
}

function CartaoDoPasso({ passo }: { passo: Passo }) {
  const elaFalou = passo.deQuem === 'cliente'
  const est = ESTADO[passo.estado] ?? ESTADO.SAIU
  const selo = SELO_DO_TEXTO[passo.textoOrigem] ?? SELO_DO_TEXTO.indisponivel
  const tpl = passo.template
  const seloTpl = tpl ? SELO_TEMPLATE[tpl.status] ?? { rotulo: tpl.status.toLowerCase(), tom: undefined, titulo: '' } : null
  const pendente = naFila(passo)

  return (
    <article className={`min-w-0 flex-1 rounded-xl border ${pendente ? 'border-dashed' : ''} ${
      elaFalou ? 'bg-info/5 border-info/25' : 'bg-card border-border'
    } ${passo.estado === 'CANCELADA' ? 'opacity-60' : ''}`}>
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3.5 pt-3 pb-2.5">
        <h3 className="text-sm font-semibold leading-none text-foreground">{passo.titulo}</h3>
        <span className={`text-[11px] tabular leading-none ${pendente ? 'text-primary' : 'text-muted-foreground'}`}>{relogio.format(new Date(passo.quando))}</span>
        <span className={`ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold leading-none whitespace-nowrap ${est.classe}`}
          title={passo.prova?.detalhe ?? undefined}>
          <span className="text-xs tracking-tighter">{est.tique}</span>{est.rotulo}
        </span>
      </header>

      {passo.subtitulo && (
        <p className="px-3.5 pb-2 text-[11px] text-muted-foreground leading-snug">
          {passo.subtitulo}{passo.porque && <span> · {passo.porque}</span>}
        </p>
      )}

      {passo.texto ? (
        <div className="px-3.5 pb-3">
          <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${selo.classe}`}>{selo.rotulo}</p>
          <blockquote className={`text-[13px] leading-relaxed whitespace-pre-wrap pl-3 border-l-2 ${elaFalou ? 'border-info/50' : 'border-primary/40'} ${pendente ? 'text-muted-foreground' : 'text-foreground'}`}>
            {passo.texto}
          </blockquote>
          {passo.textoAviso && <p className="mt-2 text-[11px] leading-snug text-warning">{passo.textoAviso}</p>}
        </div>
      ) : (
        <p className="px-3.5 pb-3 text-xs text-muted-foreground italic">{selo.rotulo}.</p>
      )}

      {/* Vermelho só quando a falha é DESTE envio: motivo antigo pintado de vermelho manda caçar defeito onde não há. */}
      {passo.detalhe && (
        <p className={`mx-3.5 mb-3 px-2.5 py-1.5 rounded-lg text-[11px] leading-snug border ${
          passo.detalheGrave ? 'text-destructive bg-destructive/10 border-destructive/25' : 'text-muted-foreground bg-muted/50 border-border-subtle'
        }`}>
          {passo.detalhe}
        </p>
      )}

      {tpl && seloTpl && (
        <footer className="flex flex-wrap items-center gap-2 px-3.5 py-2 border-t border-border-subtle bg-muted/40 rounded-b-xl">
          <span className="text-[11px] ocr-mono text-muted-foreground truncate max-w-full">{tpl.nome}</span>
          <Chip tom={seloTpl.tom} title={seloTpl.titulo}>{seloTpl.rotulo}</Chip>
          {tpl.categoria && (
            <Chip tom={tpl.categoria === 'MARKETING' ? 'alerta' : 'info'}
              title={tpl.categoria === 'MARKETING'
                ? 'MARKETING custa mais por mensagem, tem limite POR DESTINATÁRIO (131049) e é a categoria que mais gera bloqueio.'
                : 'Categoria atribuída pela Meta — ela decide preço e limite.'}>
              {tpl.categoria.toLowerCase()}
            </Chip>
          )}
          {tpl.botoes.length > 0 && <span className="text-[11px] text-muted-foreground">botão: {tpl.botoes.join(' · ')}</span>}
        </footer>
      )}
    </article>
  )
}

function LinhaDoMarco({ marco }: { marco: Marco }) {
  const Icone = ICONE_MARCO[marco.tipo]
  const cor = COR_MARCO[marco.tipo]
  return (
    <div className="flex items-center gap-3">
      <div className="relative z-10 shrink-0 grid place-items-center rounded-xl w-11 h-[34px] border border-border bg-card">
        <Icone className={`w-4 h-4 ${cor}`} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
        <span className="text-[11px] tabular text-muted-foreground">{relogio.format(new Date(marco.quando))}</span>
        <span className={`text-[13px] font-medium ${cor}`}>{marco.titulo}</span>
        {marco.detalhe && <span className="text-[11px] text-muted-foreground">· {marco.detalhe}</span>}
      </div>
    </div>
  )
}

/** O intervalo entre dois passos — a informação que revela o buraco. */
function Espera({ ms }: { ms: number }) {
  const texto = intervalo(ms)
  if (!texto) return <div className="h-2.5" />
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="shrink-0 flex justify-center w-11"><div className="w-px h-[22px] bg-border-strong" /></div>
      <span className="text-[11px] tabular text-muted-foreground">{texto}</span>
    </div>
  )
}

function Tile({ valor, rotulo, cor, titulo }: { valor: string; rotulo: string; cor?: string; titulo?: string }) {
  return (
    <div title={titulo} className="rounded-xl border border-border bg-card px-3.5 py-2.5">
      <p className={`text-xl font-semibold leading-none tabular ${cor ?? 'text-foreground'}`}>{valor}</p>
      <p className="mt-1.5 ocr-label leading-none">{rotulo}</p>
    </div>
  )
}

type Recorte = 'tudo' | 'ja' | 'vai'

export function DossieContato({ inscricaoId }: { inscricaoId: string }) {
  const [dados, setDados] = useState<Dossie | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [recarregando, setRecarregando] = useState(false)
  const [recorte, setRecorte] = useState<Recorte>('tudo')

  const carregar = useCallback(async () => {
    setRecarregando(true)
    try {
      setDados(await getDossieDoContato(inscricaoId))
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui montar o dossiê desta cliente.')
    } finally {
      setRecarregando(false)
    }
  }, [inscricaoId])

  useEffect(() => {
    // Busca inicial: o setState acontece depois do await. Mesmo padrão de app/radar/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  const passos = (dados?.passos ?? []).filter((p) =>
    recorte === 'tudo' ? true : recorte === 'vai' ? naFila(p) : !naFila(p) && p.estado !== 'CANCELADA',
  )
  type Item = { em: number; passo?: Passo; marco?: Marco }
  const itens: Item[] = [
    ...passos.map((p) => ({ em: new Date(p.quando).getTime(), passo: p })),
    ...(recorte === 'tudo' ? (dados?.marcos ?? []).map((m) => ({ em: new Date(m.quando).getTime(), marco: m })) : []),
  ].sort((a, b) => a.em - b.em)

  // O AGORA é o do SERVIDOR que montou o dossiê — dois relógios fariam a linha cair num lugar e os passos noutro.
  const agora = dados ? new Date(dados.agora).getTime() : 0
  const indiceDoFuturo = itens.findIndex((i) => i.em > agora)
  const proxima = dados?.resumo.proximaEm ? new Date(dados.resumo.proximaEm).getTime() : null
  const tomStatus: TomDl = dados?.statusInscricao === 'ATIVA' ? 'positivo' : dados?.statusInscricao === 'PAUSADA' ? 'alerta' : dados?.statusInscricao === 'ERRO' ? 'negativo' : undefined

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1100px] w-full mx-auto">
      <Link href="/maquina-vendas" className="inline-flex items-center gap-1.5 min-h-10 text-xs text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Máquina de Vendas
      </Link>

      {erro && (
        <div className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl border border-destructive/30 bg-destructive/10 text-[13px] text-foreground" role="alert">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" /><span>{erro}</span>
        </div>
      )}

      {!dados && !erro && (
        <div className="mt-5 space-y-5" aria-hidden>
          <div className="rounded-xl bg-muted/60 animate-pulse h-24" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="rounded-xl bg-muted/60 animate-pulse h-[68px]" />)}
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="rounded-xl bg-muted/60 animate-pulse w-11 h-[34px]" />
              <div className="flex-1 rounded-xl bg-muted/60 animate-pulse" style={{ height: 120 - i * 14 }} />
            </div>
          ))}
        </div>
      )}

      {dados && (
        <>
          <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground truncate">{dados.nome}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                <span className="tabular">{dados.telefone}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1.5"><Rocket className="w-3.5 h-3.5 text-primary" />{dados.cadencia}</span>
                {dados.colunaAtual && <><span>·</span><span>coluna <strong className="text-foreground">{dados.colunaAtual}</strong></span></>}
                {dados.colunaDeEntrada && dados.colunaDeEntrada !== dados.colunaAtual && <><span>·</span><span>entrou em {dados.colunaDeEntrada}</span></>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Chip tom={tomStatus} title={dados.motivoParada ?? undefined}>{dados.statusInscricao}</Chip>
                {dados.perfil && <Chip tom="marca" title="Perfil da cliente na inscrição — decide o tom das mensagens.">{dados.perfil}</Chip>}
                {dados.motivoParada && <span className="text-[11px] text-muted-foreground">{dados.motivoParada}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => void carregar()} disabled={recarregando}
                className="inline-flex items-center gap-2 px-3 min-h-10 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 cursor-pointer">
                <RefreshCw className={`w-4 h-4 ${recarregando ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Atualizar</span>
              </button>
              {dados.linkChatwoot && (
                <a href={dados.linkChatwoot} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 min-h-10 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-accent">
                  <ExternalLink className="w-4 h-4" /><span className="hidden sm:inline">Chatwoot</span>
                </a>
              )}
            </div>
          </header>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <Tile valor={String(dados.resumo.totalNaRegua)} rotulo="na régua" titulo="Mensagens que esta cliente recebe ou recebeu nesta régua." />
            <Tile valor={String(dados.resumo.jaSairam)} rotulo="já saíram" />
            <Tile valor={String(dados.resumo.entregues)} rotulo="entregues" cor="text-success" titulo="A Meta confirmou que chegou no aparelho. Só isto é entrega." />
            <Tile valor={String(dados.resumo.lidas)} rotulo="lidas" cor="text-info" />
            <Tile valor={String(dados.resumo.falharam)} rotulo="falharam" cor={dados.resumo.falharam > 0 ? 'text-destructive' : undefined} />
            <Tile
              valor={proxima === null ? '—' : proxima <= agora ? 'atrasada' : intervalo(proxima - agora) ?? 'agora'}
              rotulo="próxima em"
              cor={proxima === null ? 'text-muted-foreground' : proxima <= agora ? 'text-warning' : 'text-primary'}
              titulo={proxima !== null ? `Próximo toque marcado para ${relogio.format(new Date(proxima))}.` : 'Não há mais nada previsto para esta cliente.'}
            />
          </div>

          {!dados.catalogoDisponivel && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl border border-warning/30 bg-warning/10 text-xs text-foreground">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
              <span><strong>A Meta não devolveu a lista de templates agora.</strong> O que ainda vai sair aparece como copy da cadência, e a aprovação fica em &quot;não consultado&quot; — que não é o mesmo que aprovado.</span>
            </div>
          )}
          {!dados.chatwootLigado && (
            <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-xl border border-border bg-muted/50 text-xs text-foreground">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span><strong>Chatwoot não configurado neste ambiente.</strong> O trilho mostra só o que a Máquina mandou — as falas da IA e da equipe não aparecem.</span>
            </div>
          )}

          {dados.faltaNoPedido.length > 0 && (
            <div className="mt-3 rounded-xl border border-border bg-card px-3.5 py-2.5">
              <p className="ocr-label flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> O que o pedido ainda não andou</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {dados.faltaNoPedido.map((m) => <Chip key={m.marco} title={m.templates.join(', ')}>{m.marco} · {m.papel}</Chip>)}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Sem horário de propósito: cada aviso sai quando a loja mover o pedido na Nuvemshop, não antes.</p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-1 p-1 rounded-xl w-fit border border-border-subtle bg-muted/50" role="tablist">
            {([['tudo', 'A conversa inteira'], ['ja', 'Já recebeu'], ['vai', 'Ainda vai receber']] as const).map(([id, rotulo]) => (
              <button key={id} onClick={() => setRecorte(id)} role="tab" aria-selected={recorte === id}
                className={`px-3 min-h-10 rounded-lg text-xs font-medium transition-colors cursor-pointer ${recorte === id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {rotulo}
              </button>
            ))}
          </div>

          <section className="relative mt-4">
            {itens.length > 1 && <div className="absolute top-4 bottom-4 left-[21.5px] w-px bg-border pointer-events-none" />}
            <div className="relative">
              {itens.map((item, i) => {
                const anterior = i > 0 ? itens[i - 1] : null
                const chave = item.passo ? item.passo.chave : `marco-${item.marco!.tipo}-${item.em}`
                return (
                  <div key={chave}>
                    {anterior && <Espera ms={item.em - anterior.em} />}
                    {i === indiceDoFuturo && (
                      <div className="flex items-center gap-3 my-3">
                        <div className="shrink-0 grid place-items-center rounded-xl w-11 h-6 text-[11px] font-bold tabular bg-primary text-primary-foreground">
                          {soHora.format(new Date(agora))}
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">agora</span>
                        <div className="flex-1 h-px bg-primary/40" />
                      </div>
                    )}
                    {item.marco ? (
                      <LinhaDoMarco marco={item.marco} />
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5"><Marcador passo={item.passo!} /></div>
                        <CartaoDoPasso passo={item.passo!} />
                      </div>
                    )}
                  </div>
                )
              })}
              {recorte !== 'ja' && dados.resumo.aindaVaoSair === 0 && itens.length > 0 && (
                <div className="flex items-center gap-3 mt-4">
                  <div className="shrink-0 grid place-items-center rounded-xl w-11 h-[34px] border border-dashed border-border">
                    <CheckCheck className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A régua terminou. Esta cliente não recebe mais nada automático{dados.motivoParada ? ` — ${dados.motivoParada.toLowerCase()}` : ''}.
                  </p>
                </div>
              )}
            </div>
            {itens.length === 0 && (
              <div className="rounded-2xl border border-border bg-card p-10 text-center">
                <Rocket className="w-7 h-7 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-semibold text-foreground">{recorte === 'vai' ? 'Nada mais está previsto para esta cliente.' : 'Nada registrado ainda.'}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {recorte === 'vai' ? 'A régua chegou ao fim, ou a cadência parou.' : 'Quando a primeira mensagem for agendada, ela aparece aqui.'}
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
