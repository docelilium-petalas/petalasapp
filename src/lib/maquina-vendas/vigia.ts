/**
 * O VIGIA — mede o canal, chama o disjuntor e avisa gente.
 *
 * Porta de `vigia.ts` da CarBoss. `disjuntor.ts` decide; este arquivo lê o
 * banco, pergunta à Meta, puxa o freio e escreve o alerta.
 *
 * Diferenças da origem:
 *  · Sem número padrão de alerta. Lá era o celular do dono da CarBoss; aqui o
 *    WhatsApp só sai com `MV_ALERTA_NUMERO` definido. Sem ele, o alerta vive
 *    em `logs_eventos` (que é a fonte da verdade de qualquer jeito).
 *  · O código da falha é `codigoErro` (`falhaCodigo` na origem).
 *  · NÃO engole erro: devolve `{ erro }` e o tique responde 500. O vigia que
 *    falha calado é um disjuntor que não existe.
 */

import prisma from '@/lib/prisma'
import { statusDoNumero } from './datafy'
import { enviarMensagemLivre } from './canal'
import { CODIGOS_DO_DESTINATARIO } from './entrega-meta'
import { decidir, type CodigoDoDisjuntor, type LeituraDoCanal, type Veredito } from './disjuntor'
import { numeroDeAlerta } from './config'

const JANELA_MS = 2 * 60 * 60 * 1000
const JANELA_ERROS_MS = 60 * 60 * 1000
const TIPO_LOG = 'disjuntor'

export interface ResultadoDoVigia {
  leitura: LeituraDoCanal
  veredito: Veredito
  pausou: boolean
  avisou: boolean
  whatsappSaiu: boolean | null
}

async function ultimoCodigo(agora: Date): Promise<CodigoDoDisjuntor | null> {
  const ultimo = await prisma.logEvento.findFirst({
    where: { tipo: TIPO_LOG, createdAt: { gte: new Date(agora.getTime() - 24 * 3600_000) } },
    orderBy: { createdAt: 'desc' },
    select: { dados: true },
  })
  if (!ultimo?.dados) return null
  try {
    return (JSON.parse(ultimo.dados)?.codigo as CodigoDoDisjuntor) ?? null
  } catch {
    return null
  }
}

async function medir(agora: Date): Promise<LeituraDoCanal> {
  const desde = new Date(agora.getTime() - JANELA_MS)
  const desdeErros = new Date(agora.getTime() - JANELA_ERROS_MS)

  const [enviadasRecentes, entreguesRecentes, falhasDeCanalRecentes, confirmadas, ajustes] = await Promise.all([
    prisma.mvMensagem.count({ where: { status: 'ENVIADA', enviadaEm: { gte: desde } } }),
    prisma.mvMensagem.count({ where: { entregueEm: { gte: desde } } }),
    // ⚠️ `status: 'ERRO'` sozinho parou a CarBoss dois dias (16/09/2026) por
    //    três 131049 — limite POR DESTINATÁRIO. E o `OR null` existe porque
    //    `NOT IN` em SQL descarta código nulo, que é a falha de transporte.
    prisma.mvMensagem.count({
      where: {
        status: 'ERRO',
        agendadaPara: { gte: desdeErros },
        OR: [{ codigoErro: null }, { codigoErro: { notIn: CODIGOS_DO_DESTINATARIO } }],
      },
    }),
    prisma.mvMensagem.count({ where: { entregueEm: { not: null } } }),
    prisma.mvAjustes.findUnique({ where: { id: 'unico' } }),
  ])

  // A Meta por último: sem ela o disjuntor decide pelas outras regras, e
  // `canal: null` é "não sei", nunca "está ruim".
  const canal = await statusDoNumero().catch(() => null)

  return {
    canal: canal ? { status: canal.status, qualidade: canal.qualidade, podeEnviar: canal.podeEnviar } : null,
    enviadasRecentes,
    entreguesRecentes,
    falhasDeCanalRecentes,
    jaConfirmouAlgumaVez: confirmadas > 0,
    envioJaPausado: ajustes?.envioPausado ?? true,
  }
}

async function avisarNoWhatsApp(v: Veredito): Promise<boolean | null> {
  const numero = numeroDeAlerta()
  if (!numero) return null
  try {
    await enviarMensagemLivre(numero, { tipo: 'texto', texto: `🔴 Doce Lilium · Máquina de Vendas\n${v.titulo}\n\n${v.detalhe}` })
    return true
  } catch (e) {
    // Texto livre depende da janela de 24h: o alerta pode ser engolido pelo
    // próprio canal doente. Fica registrado, não derruba o tique.
    await prisma.logEvento
      .create({
        data: {
          origem: 'maquina-vendas',
          nivel: 'AVISO',
          tipo: 'disjuntor_alerta_falhou',
          titulo: 'Alerta do disjuntor não saiu no WhatsApp',
          dados: JSON.stringify(e instanceof Error ? e.message : String(e)).slice(0, 2000),
        },
      })
      .catch((err) => console.error('[vigia] log do alerta falhou:', err))
    return false
  }
}

export async function rodarVigia(agora: Date = new Date()): Promise<ResultadoDoVigia | { erro: string }> {
  try {
    const leitura = await medir(agora)
    const veredito = decidir(leitura, await ultimoCodigo(agora))

    if (!veredito.avisar && !veredito.desarmar) {
      return { leitura, veredito, pausou: false, avisou: false, whatsappSaiu: null }
    }

    let pausou = false
    if (veredito.desarmar) {
      await prisma.mvAjustes.update({
        where: { id: 'unico' },
        data: { envioPausado: true, atualizadoPor: `disjuntor · ${veredito.codigo}` },
      })
      pausou = true
    }

    await prisma.logEvento.create({
      data: {
        origem: 'maquina-vendas',
        nivel: veredito.desarmar ? 'ERRO' : 'AVISO',
        tipo: TIPO_LOG,
        titulo: veredito.titulo,
        detalhe: veredito.detalhe,
        dados: JSON.stringify({ codigo: veredito.codigo, leitura, pausou }),
      },
    })

    const whatsappSaiu = await avisarNoWhatsApp(veredito)
    return { leitura, veredito, pausou, avisou: true, whatsappSaiu }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    console.error('[vigia] falhou:', erro)
    return { erro }
  }
}
