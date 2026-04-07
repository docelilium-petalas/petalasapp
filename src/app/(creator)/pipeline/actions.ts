'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function getPipelineData() {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return { columns: [], cards: [] }

    const profile = await prisma.profile.findUnique({
        where: { email: session.user.email },
        include: {
            pipeline_stages: {
                orderBy: { order: 'asc' },
                include: {
                    opportunities: {
                        orderBy: { createdAt: 'desc' }
                    }
                }
            }
        }
    })

    if (!profile) return { columns: [], cards: [] }

    // Transform data to match UI expectations
    const columns = profile.pipeline_stages.map(stage => ({
        id: stage.id,
        title: stage.title,
        color: stage.color,
        count: stage.opportunities.length,
        totalValue: stage.opportunities.reduce((acc, op) => acc + op.value, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    }))

    const cards = profile.pipeline_stages.flatMap(stage => 
        stage.opportunities.map(op => ({
            id: op.id,
            columnId: stage.id,
            column: stage.title,
            title: op.title,
            value: op.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
            priority: op.priority.charAt(0).toUpperCase() + op.priority.slice(1),
            priorityColor: op.priority === 'alta' ? 'bg-red-500' : op.priority === 'media' ? 'bg-orange-400' : 'bg-blue-400',
            date: new Date(op.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
            avatar: op.title.charAt(0).toUpperCase(),
            isNew: op.isNew
        }))
    )

    return { columns, cards }
}

export async function createColumn(title: string, color: string) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) throw new Error('Não autorizado')

    const profile = await prisma.profile.findUnique({ where: { email: session.user.email } })
    if (!profile) throw new Error('Perfil não encontrado')

    const lastStage = await prisma.pipelineStage.findFirst({
        where: { userId: profile.id },
        orderBy: { order: 'desc' }
    })

    await prisma.pipelineStage.create({
        data: {
            title,
            color,
            order: (lastStage?.order ?? 0) + 1,
            userId: profile.id
        }
    })

    revalidatePath('/pipeline')
}

export async function createOpportunity(
    stageId: string, 
    title: string, 
    value: number, 
    priority: string,
    description?: string,
    responsible?: string,
    date?: string
) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) throw new Error('Não autorizado')

    const profile = await prisma.profile.findUnique({ where: { email: session.user.email } })
    if (!profile) throw new Error('Perfil não encontrado')

    await prisma.opportunity.create({
        data: {
            title,
            value,
            priority,
            description,
            responsible,
            date: date ? new Date(date) : new Date(),
            stageId,
            userId: profile.id,
            isNew: true
        }
    })

    revalidatePath('/pipeline')
}
