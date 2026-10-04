'use client'

/**
 * PRONTIDÃO — "a Máquina está pronta para mandar mensagem de verdade?"
 *
 * Só administradora. Só leitura. NUNCA manda mensagem.
 *
 * Duas partes:
 *  · checagens do ambiente (banco migrado, canal, número na Meta, templates,
 *    disjuntor, tique, segredos, lista de teste, pausa, alerta, Chatwoot);
 *  · a bateria PURA — as mesmas regras do `npm run test:mv -- 1`, rodadas no
 *    servidor sem tocar banco nem rede.
 *
 * Não conseguir medir NÃO é verde: aparece como "não medido".
 */

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleHelp, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { getProntidao } from '@/app/actions/maquina-vendas'
import { BOTAO, CABECALHO_PAINEL, Carregando, Chip, ErroDeCarga, PAINEL, erroDe, horaCurta } from './comum'

type Prontidao = Awaited<ReturnType<typeof getProntidao>>

function IconeDoEstado({ ok }: { ok: boolean | null }) {
  if (ok === true) return <CheckCircle2 className="w-4 h-4 shrink-0 text-success" aria-label="pronto" />
  if (ok === false) return <XCircle className="w-4 h-4 shrink-0 text-destructive" aria-label="não pronto" />
  return <CircleHelp className="w-4 h-4 shrink-0 text-warning" aria-label="não medido" />
}

export function AbaProntidao() {
  const [p, setP] = useState<Prontidao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [medindo, setMedindo] = useState(false)

  const medir = useCallback(async () => {
    setMedindo(true)
    try {
      setP(await getProntidao())
      setErro(null)
    } catch (e) {
      setErro(erroDe(e))
    } finally {
      setMedindo(false)
    }
  }, [])

  useEffect(() => {
    // Medição inicial da aba: setState depois do await. Mesmo padrão de app/radar/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void medir()
  }, [medir])

  if (erro) return <ErroDeCarga erro={erro} tentarDeNovo={medir} />
  if (!p) return <Carregando texto="Medindo a prontidão…" />

  const graves = p.checagens.filter((c) => c.grave && c.ok !== true)
  const avisos = p.checagens.filter((c) => !c.grave && c.ok !== true)
  const bateriaOk = p.bateria.falhou === 0 && !p.bateria.parouEm
  const pronta = graves.length === 0 && bateriaOk

  return (
    <div className="space-y-3">
      <div className={`${PAINEL} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div className="flex items-start gap-3">
          <ShieldCheck className={`w-6 h-6 shrink-0 ${pronta ? 'text-success' : 'text-destructive'}`} />
          <div>
            <p className="font-semibold text-foreground">{pronta ? 'Pronta para enviar' : 'Ainda não está pronta'}</p>
            <p className="text-xs text-muted-foreground">
              {graves.length} problema(s) grave(s) · {avisos.length} aviso(s) · bateria {p.bateria.passou} ok / {p.bateria.falhou} falha(s)
              {' · '}medido {horaCurta(p.medidoEm)}
            </p>
          </div>
        </div>
        <button onClick={medir} disabled={medindo} className={BOTAO}>
          <RefreshCw className={`w-4 h-4 ${medindo ? 'animate-spin' : ''}`} /> Medir de novo
        </button>
      </div>

      <div className={`${PAINEL} overflow-hidden`}>
        <div className={CABECALHO_PAINEL}>
          <span className="ocr-label">Ambiente</span>
          <span className="text-[11px] text-muted-foreground">grave = nada sai, ou sai errado</span>
        </div>
        {p.checagens.map((c) => (
          <div key={c.id} className="px-4 sm:px-5 py-2.5 border-b border-border-subtle last:border-b-0 flex items-start gap-2.5">
            <IconeDoEstado ok={c.ok} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground flex flex-wrap items-center gap-1.5">
                {c.titulo}
                {c.grave && c.ok !== true && <Chip tom="negativo">grave</Chip>}
                {c.ok === null && <Chip tom="alerta">não medido</Chip>}
              </p>
              <p className="text-[11px] text-muted-foreground break-words">{c.detalhe}</p>
            </div>
          </div>
        ))}
      </div>

      <div className={`${PAINEL} overflow-hidden`}>
        <div className={CABECALHO_PAINEL}>
          <span className="ocr-label">Bateria pura (regras, sem banco nem rede)</span>
          <Chip tom={bateriaOk ? 'positivo' : 'negativo'}>{p.bateria.passou} ok · {p.bateria.falhou} falha(s)</Chip>
        </div>
        {p.bateria.parouEm && (
          <p className="px-4 sm:px-5 py-2 text-xs text-destructive border-b border-border-subtle">
            A bateria parou no meio ({p.bateria.parouEm}) — isso é falha, não verde.
          </p>
        )}
        {p.bateria.grupos.map((g) => (
          <div key={g.titulo} className="px-4 sm:px-5 py-2 border-b border-border-subtle last:border-b-0">
            <div className="flex items-center gap-2.5">
              <IconeDoEstado ok={g.falhou === 0} />
              <span className="flex-1 text-sm text-foreground">{g.titulo}</span>
              <span className="text-[11px] text-muted-foreground tabular">{g.passou} ok{g.falhou ? ` · ${g.falhou} falha(s)` : ''}</span>
            </div>
            {g.falhas.length > 0 && (
              <ul className="mt-1.5 ml-6 space-y-1">
                {g.falhas.map((f, i) => (
                  <li key={i} className="text-[11px] text-destructive">
                    {f.oQue}{f.detalhe && <span className="text-muted-foreground"> — {f.detalhe}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Esta aba só mede. Nenhuma mensagem sai daqui — o teste com envio real é o nível 3, por script e só para a lista de teste.</p>
    </div>
  )
}
