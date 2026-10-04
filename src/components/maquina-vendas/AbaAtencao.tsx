'use client'

/**
 * ATENÇÃO — as conversas em que a bola está com a equipe.
 *
 * Lê as conversas dos últimos dias e separa o que pede gente: quem quer
 * comprar, pedido com problema, pergunta de tamanho, desconto, frete… Cada
 * achado traz POR QUE entrou na fila, o que fazer, um texto sugerido e o prazo.
 * A ordem é a da venda: quem quer comprar e quem tem pedido com problema vêm
 * primeiro. Conversa já respondida nunca fica "atrasada".
 *
 * Só leitura: nada aqui manda mensagem. O texto sugerido é para copiar e
 * responder pelo Chatwoot ou pelo celular da loja.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Copy, FileText, Inbox, Lightbulb } from 'lucide-react'
import { getFilaDeAtencao } from '@/app/actions/maquina-vendas'
import type { FilaDeAtencao } from '@/lib/maquina-vendas/atencao'
import { BOTAO, BOTAO_ICONE, CABECALHO_PAINEL, Carregando, Chip, ErroDeCarga, PAINEL, Vazio, erroDe, horaCurta } from './comum'

const JANELAS = [7, 15, 30] as const

export function AbaAtencao() {
  const [dias, setDias] = useState<number>(15)
  const [fila, setFila] = useState<FilaDeAtencao | null>(null)
  const [diasCarregados, setDiasCarregados] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [soEsperando, setSoEsperando] = useState(true)

  const carregar = useCallback(async () => {
    try {
      setFila(await getFilaDeAtencao(dias))
      setErro(null)
    } catch (e) {
      setErro(erroDe(e))
    } finally {
      setDiasCarregados(dias)
    }
  }, [dias])

  useEffect(() => {
    // Busca reagindo à janela escolhida: setState depois do await. Mesmo padrão de app/radar/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      toast.success('Texto copiado.')
    } catch {
      toast.error('Não deu para copiar — selecione o texto à mão.')
    }
  }

  if (erro) return <ErroDeCarga erro={erro} tentarDeNovo={carregar} />
  if (!fila) return <Carregando texto="Lendo as conversas…" />

  const conversas = soEsperando ? fila.conversas.filter((c) => c.esperandoResposta) : fila.conversas
  const carregando = diasCarregados !== dias

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip tom={fila.esperandoAgora > 0 ? 'alerta' : 'positivo'}>{fila.esperandoAgora} esperando resposta</Chip>
          <Chip>{fila.conversasLidas} conversa(s) lidas</Chip>
          {fila.somenteRobo > 0 && <Chip tom="info">{fila.somenteRobo} só com o robô até agora</Chip>}
          <Chip tom={fila.ritmo.temAtraso ? 'negativo' : undefined}>{fila.ritmo.texto}</Chip>
        </div>
        <div className="flex items-center gap-1.5">
          {JANELAS.map((d) => (
            <button key={d} onClick={() => setDias(d)} className={`${BOTAO} ${dias === d ? '!border-primary !text-primary' : ''}`} aria-pressed={dias === d}>
              {d} dias
            </button>
          ))}
        </div>
      </div>

      {fila.porTipo.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fila.porTipo.map((t) => (
            <Chip key={t.tipo} tom={t.gravidade === 'grave' ? 'negativo' : 'alerta'}>{t.rotulo}: {t.quantas}</Chip>
          ))}
        </div>
      )}

      <div className={`${PAINEL} overflow-hidden ${carregando ? 'opacity-60' : ''}`}>
        <div className={CABECALHO_PAINEL}>
          <span className="ocr-label">Conversas que pedem a equipe</span>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer min-h-10">
            <input type="checkbox" checked={soEsperando} onChange={(e) => setSoEsperando(e.target.checked)} className="w-4 h-4 accent-primary" />
            só as que esperam resposta
          </label>
        </div>
        {conversas.length === 0 ? (
          <Vazio Icone={Inbox} titulo={soEsperando ? 'Ninguém esperando resposta' : 'Nada pedindo atenção'} detalhe={`Nos últimos ${dias} dias.`} />
        ) : (
          conversas.map((c) => (
            <div key={c.telefoneKey} className="px-4 sm:px-5 py-3 border-b border-border-subtle last:border-b-0 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {c.nome} <span className="text-xs font-normal text-muted-foreground">{c.telefone}</span>
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Chip tom={c.gravidade === 'grave' ? 'negativo' : 'alerta'}>{c.gravidade === 'grave' ? 'grave' : 'atenção'}</Chip>
                    {c.atrasada && <Chip tom="negativo">atrasada</Chip>}
                    {c.esfriou && <Chip>esfriou — virou reativação</Chip>}
                    {c.equipeFalou && <Chip tom="info">equipe já falou</Chip>}
                    {c.cadencia && <Chip>{c.cadencia}</Chip>}
                    <span className="text-[11px] text-muted-foreground tabular">responder até {horaCurta(c.venceEm)}</span>
                  </div>
                </div>
                {c.inscricaoId && (
                  <Link href={`/maquina-vendas/contato/${c.inscricaoId}`} className={BOTAO_ICONE} aria-label={`Dossiê de ${c.nome}`} title="Abrir o dossiê">
                    <FileText className="w-4 h-4" />
                  </Link>
                )}
              </div>
              {c.achados.map((a, i) => (
                <div key={i} className="dl-panel px-3 py-2.5 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">{a.rotulo}</span>
                    <span className="text-[11px] text-muted-foreground tabular">{horaCurta(a.quando)} · prazo {a.prazoHoras} h</span>
                  </div>
                  {a.trecho && <p className="text-xs text-foreground italic border-l-2 border-primary/40 pl-2">“{a.trecho}”</p>}
                  <p className="text-[11px] text-muted-foreground">{a.porque}</p>
                  <p className="text-[11px] text-foreground"><strong>O que fazer:</strong> {a.oQueFazer}</p>
                  {a.copySugerida && (
                    <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-border-subtle p-2">
                      <p className="flex-1 text-[11px] text-foreground whitespace-pre-line">{a.copySugerida}</p>
                      <button className={BOTAO_ICONE} onClick={() => copiar(a.copySugerida)} aria-label="Copiar texto sugerido" title="Copiar">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {fila.sugestoesDeCopy.length > 0 && (
        <div className={`${PAINEL} overflow-hidden`}>
          <div className={CABECALHO_PAINEL}>
            <span className="ocr-label flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5" /> Templates que fariam falta</span>
            <Link href="/maquina-vendas/templates" className="text-xs text-primary hover:underline min-h-10 inline-flex items-center">Abrir Templates</Link>
          </div>
          {fila.sugestoesDeCopy.map((s, i) => (
            <div key={i} className="px-4 sm:px-5 py-3 border-b border-border-subtle last:border-b-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-foreground">{s.problema}</span>
                <Chip>{s.quantosCasos} caso(s)</Chip>
                <Chip tom={s.categoria === 'MARKETING' ? 'alerta' : 'info'} title={s.porqueCategoria}>{s.categoria}</Chip>
              </div>
              <p className="text-[11px] text-muted-foreground">{s.ondeEntra}</p>
              <p className="text-xs text-foreground whitespace-pre-line">{s.corpo}</p>
            </div>
          ))}
          <p className="px-4 sm:px-5 py-2 text-[11px] text-muted-foreground border-t border-border">
            Sugestão, não envio: template novo passa pela aprovação da dona da marca e da Meta antes de existir.
          </p>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Medido {horaCurta(new Date(fila.medidoEm).toISOString())}. Nada nesta aba manda mensagem.</p>
    </div>
  )
}
