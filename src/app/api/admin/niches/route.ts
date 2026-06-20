import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    let niches = await prisma.niche.findMany({
      where: { userId: user.userId },
      orderBy: [
        { categoria: 'asc' },
        { nome: 'asc' }
      ]
    })

    // Auto-populate default niches if none exist
    if (niches.length === 0) {
      const defaultNiches = [
        'Escritório de Advocacia',
        'Clínica de Estética',
        'Imobiliárias',
        'Corretores',
        'Empresas de Energia Solar'
      ];
      
      await prisma.niche.createMany({
        data: defaultNiches.map(nome => ({
          nome,
          categoria: 'PROSPECCAO',
          status: 'ativo',
          userId: user.userId
        }))
      });

      niches = await prisma.niche.findMany({
        where: { userId: user.userId },
        orderBy: [
          { categoria: 'asc' },
          { nome: 'asc' }
        ]
      });
    }

    return NextResponse.json(niches)
  } catch (error: any) {
    console.error('Erro ao buscar nichos:', error)
    return NextResponse.json({ error: 'Erro ao buscar nichos' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { nome, descricao, categoria, status } = await req.json()

    if (!nome || typeof nome !== 'string') {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const trimmedNome = nome.trim()

    // Verifica duplicidade
    const existing = await prisma.niche.findFirst({
      where: { nome: trimmedNome, userId: user.userId }
    })

    if (existing) {
      return NextResponse.json({ error: 'Já existe um nicho com este nome' }, { status: 409 })
    }

    const newNiche = await prisma.niche.create({
      data: {
        nome: trimmedNome,
        descricao: descricao?.trim() || null,
        categoria: categoria || 'PROSPECCAO',
        status: status || 'ativo',
        userId: user.userId
      }
    })

    return NextResponse.json(newNiche, { status: 201 })
  } catch (error: any) {
    console.error('Erro ao criar nicho:', error)
    return NextResponse.json({ error: 'Erro ao criar nicho' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id, nome, descricao, categoria, status } = await req.json()

    if (!id || !nome) {
      return NextResponse.json({ error: 'ID e Nome são obrigatórios' }, { status: 400 })
    }

    const trimmedNome = nome.trim()

    // Verifica ownership e duplicidade (se mudar o nome)
    const existing = await prisma.niche.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.userId) {
      return NextResponse.json({ error: 'Nicho não encontrado' }, { status: 404 })
    }

    if (existing.nome !== trimmedNome) {
      const duplicate = await prisma.niche.findFirst({
        where: { nome: trimmedNome, userId: user.userId }
      })
      if (duplicate) {
        return NextResponse.json({ error: 'Já existe outro nicho com este nome' }, { status: 409 })
      }
    }

    const updated = await prisma.niche.update({
      where: { id },
      data: {
        nome: trimmedNome,
        descricao: descricao?.trim() || null,
        categoria: categoria || existing.categoria,
        status: status || existing.status
      }
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Erro ao atualizar nicho:', error)
    return NextResponse.json({ error: 'Erro ao atualizar nicho' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 })
    }

    const existing = await prisma.niche.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.userId) {
      return NextResponse.json({ error: 'Nicho não encontrado' }, { status: 404 })
    }

    await prisma.niche.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Erro ao excluir nicho:', error)
    return NextResponse.json({ error: 'Erro ao excluir nicho' }, { status: 500 })
  }
}
