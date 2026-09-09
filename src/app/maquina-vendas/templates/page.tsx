'use client'

/**
 * OS TEMPLATES, COMO A CLIENTE VAI LER.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Esta tela existe para APROVAÇÃO, não para configuração. Quem lê é a dona da
 * marca, e o que ela precisa julgar é o texto — se soa como a Doce Lilium, se
 * ela mandaria isso para uma cliente.
 *
 * Por isso a mensagem aparece dentro de um balão de conversa, com as variáveis
 * JÁ PREENCHIDAS pelos exemplos. Mostrar `Oi, {{1}}! Vi que você deixou {{2}}`
 * transferiria para ela um trabalho de tradução mental que é nosso.
 *
 * O que é decisão técnica — categoria da Meta, nome interno, o que ainda não
 * dá para preencher — fica visível mas em segundo plano: ela precisa saber que
 * existe, não precisa decidir sobre isso.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  MessageSquare, ShoppingBag, Package, Sparkles, Heart, Rocket,
  CheckCircle2, AlertTriangle, ArrowLeft,
} from 'lucide-react'
import { AppLayout } from '@/components/AppLayout'
import { CATALOGO, VARIAVEIS, type TemplateMeta } from '@/lib/maquina-vendas/catalogo-templates'

/**
 * Por que cada bloqueado não pode ir para a Meta ainda.
 *
 * Medido contra a loja real em 09/09/2026 — 62 pedidos e 9 carrinhos. Não é
 * suposição: o campo de rastreio, por exemplo, está vazio nos 62.
 */
const BLOQUEIOS: Record<string, string> = {
  dl_carrinho_ultimo_v1:
    'Depende de cupom, e o CRM não gera cupom. Exigiria permissão de escrita na loja, que tiramos de propósito.',
  dl_pix_pendente_v1:
    'A API de pedido da Nuvemshop não devolve a validade do PIX, então não há como dizer em quanto tempo ele expira.',
  dl_pedido_enviado_v1:
    'Os 62 pedidos dos últimos 60 dias estão com o código de rastreio VAZIO. Não é limite da API — é preenchimento. Se a loja passar a informar o código, destrava sozinho.',
  dl_reativacao_60d_v1: 'O CRM ainda não lê as coleções da loja.',
  dl_colecao_nova_v1: 'O CRM ainda não lê as coleções da loja.',
}

const TRILHAS = [
  { id: 'carrinho', nome: 'Carrinho abandonado', Icone: ShoppingBag,
    sobre: 'Quem montou o carrinho e não finalizou. Três toques, e o terceiro se anuncia como último.' },
  { id: 'pedido', nome: 'Pedido', Icone: Package,
    sobre: 'Acompanha a compra do recebimento à entrega.' },
  { id: 'pagamento', nome: 'Pagamento', Icone: MessageSquare,
    sobre: 'Avisa sobre pagamento pendente ou aprovado.' },
  { id: 'pos_venda', nome: 'Pós-venda', Icone: Heart,
    sobre: 'Depois que a peça chegou — opinião e troca.' },
  { id: 'reativacao', nome: 'Reativação e novidades', Icone: Sparkles,
    sobre: 'Quem já comprou e sumiu, e quem quer saber da coleção nova.' },
] as const

/** Troca {{1}}, {{2}}… pelos exemplos, para o texto ler como texto. */
function preencher(t: TemplateMeta): string {
  return t.corpo.replace(/\{\{(\d+)\}\}/g, (_, n: string) => t.exemplos[Number(n) - 1] ?? '…')
}

export default function TemplatesPage() {
  const [soPendentes, setSoPendentes] = useState(false)

  const porTrilha = useMemo(() => {
    return TRILHAS.map((tr) => ({
      ...tr,
      itens: CATALOGO.filter((t) => t.trilha === tr.id && (!soPendentes || !BLOQUEIOS[t.nome])),
    })).filter((tr) => tr.itens.length)
  }, [soPendentes])

  const prontos = CATALOGO.filter((t) => !BLOQUEIOS[t.nome]).length

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto scrollbar-thin">
        <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[900px] w-full mx-auto space-y-6">

          <div>
            <Link href="/maquina-vendas"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
              <ArrowLeft className="w-3.5 h-3.5" /> Máquina de Vendas
            </Link>
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">
              <Rocket className="w-3.5 h-3.5" />
              <span>Para aprovação</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
              Mensagens da Doce Lilium
            </h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              São as mensagens que o WhatsApp vai enviar sozinho — recuperando carrinho, acompanhando
              pedido e chamando de volta quem sumiu. Estão escritas do jeito que a cliente vai ler,
              com nome e peça de exemplo.
              <strong className="text-foreground"> Nada foi enviado nem publicado ainda.</strong>
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div>
                <span className="ocr-label">Total</span>
                <p className="text-xl font-semibold text-foreground tabular">{CATALOGO.length} mensagens</p>
              </div>
              <div>
                <span className="ocr-label">Prontas para usar</span>
                <p className="text-xl font-semibold text-success tabular">{prontos}</p>
              </div>
              <div>
                <span className="ocr-label">Dependem de ajuste</span>
                <p className="text-xl font-semibold text-warning tabular">{CATALOGO.length - prontos}</p>
              </div>
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)}
                  className="rounded border-border-strong" />
                Ver só as prontas
              </label>
            </div>
          </div>

          {porTrilha.map(({ id, nome, Icone, sobre, itens }) => (
            <section key={id} className="space-y-3">
              <div className="flex items-start gap-2.5 pt-2">
                <Icone className="w-4 h-4 text-brand-ink shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-semibold text-foreground">{nome}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{sobre}</p>
                </div>
              </div>

              {itens.map((t) => {
                const bloqueio = BLOQUEIOS[t.nome]
                return (
                  <div key={t.nome} className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-border-subtle bg-muted/50 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground flex-1 min-w-0">{t.quando.split('.')[0]}.</span>
                      {bloqueio
                        ? <span className="dl-chip text-[10px]" data-tom="alerta"><AlertTriangle className="w-3 h-3" />Depende de ajuste</span>
                        : <span className="dl-chip text-[10px]" data-tom="positivo"><CheckCircle2 className="w-3 h-3" />Pronta</span>}
                    </div>

                    {/* O balão, como chega no celular */}
                    <div className="px-5 py-5 bg-muted/25">
                      <div className="max-w-[26rem] rounded-2xl rounded-tl-sm bg-card border border-border-subtle px-4 py-3 shadow-sm">
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{preencher(t)}</p>
                        {t.rodape && <p className="text-[11px] text-muted-foreground mt-2">{t.rodape}</p>}
                        {t.botoes?.length ? (
                          <div className="mt-3 pt-2.5 border-t border-border-subtle flex flex-wrap gap-1.5">
                            {t.botoes.map((b) => (
                              <span key={b.texto}
                                className="text-[11px] font-medium text-info px-2.5 py-1 rounded-lg border border-border-subtle bg-muted/60">
                                {b.texto}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2 ml-1">
                        Nome e peça acima são exemplo — na hora do envio vêm do carrinho real.
                      </p>
                    </div>

                    {bloqueio && (
                      <div className="px-5 py-3 border-t border-border-subtle bg-warning/8">
                        <p className="text-xs text-foreground"><strong>Por que ainda não dá para usar:</strong> {bloqueio}</p>
                      </div>
                    )}

                    <div className="px-5 py-2.5 border-t border-border-subtle flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="ocr-mono">{t.nome}</span>
                      <span>{t.categoria === 'MARKETING' ? 'Marketing — precisa de autorização da cliente' : 'Utilidade — ligada a um pedido existente'}</span>
                      <span>{(VARIAVEIS[t.nome] ?? []).length} campos variáveis</span>
                    </div>
                  </div>
                )
              })}
            </section>
          ))}

          <div className="rounded-2xl border border-border-subtle bg-muted/40 p-5 text-xs text-muted-foreground leading-relaxed">
            <p className="text-foreground font-medium mb-1.5">Como funciona a aprovação</p>
            Depois que estas mensagens forem aprovadas aqui, elas são enviadas ao WhatsApp para
            revisão da Meta — que leva de algumas horas a alguns dias. Só depois disso a Máquina
            pode começar a falar com clientes. O nome de cada mensagem não pode mudar depois de
            aprovado pela Meta, e por isso a leitura de agora importa.
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
