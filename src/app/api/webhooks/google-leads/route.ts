import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // O N8N pode enviar array ou objeto único, vamos padronizar
    const leadsData = Array.isArray(body) ? body : [body]

    const processResults = await Promise.all(
      leadsData.map(async (data: any) => {
        const {
          user_id,
          nome,
          telefone,
          endereco,
          cidade,
          estado,
          nicho,
          site
        } = data

        if (!user_id) {
          return { success: false, error: 'user_id é obrigatório' }
        }

        const phoneClean = telefone ? telefone.trim() : ''
        const nameClean = nome ? nome.trim() : ''

        // Deduplicação
        if (phoneClean) {
          const exists = await prisma.googleLead.findFirst({
            where: {
              userId: user_id,
              telefone: phoneClean
            }
          })
          if (exists) return { success: false, reason: 'DUPLICATE_PHONE' }
        } else if (nameClean) {
          const exists = await prisma.googleLead.findFirst({
            where: {
              userId: user_id,
              nome: nameClean,
              cidade: cidade?.trim()
            }
          })
          if (exists) return { success: false, reason: 'DUPLICATE_NAME_CITY' }
        }

        // Inserir novo
        await prisma.googleLead.create({
          data: {
            userId: user_id,
            nome: nameClean || null,
            telefone: phoneClean || null,
            endereco: endereco?.trim() || null,
            cidade: cidade?.trim() || null,
            uf: estado?.trim() || null,
            nicho: nicho?.trim() || null,
            site: site?.trim() || null,
            status: 'NOVO'
          }
        })

        return { success: true }
      })
    )

    const inserted = processResults.filter(r => r.success).length
    const duplicated = processResults.filter(r => !r.success && r.reason).length

    return NextResponse.json({
      success: true,
      message: `Processados: ${processResults.length}. Inseridos: ${inserted}. Duplicados ignorados: ${duplicated}.`
    })

  } catch (error: any) {
    console.error('Erro no webhook de google-leads:', error)
    return NextResponse.json({ error: 'Erro interno ao processar leads do N8N' }, { status: 500 })
  }
}
