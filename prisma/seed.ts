import 'dotenv/config'
import { AppRole, DealStatus, DealPriority, ActivityStatus } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import prisma from '../src/lib/prisma'

const TEMPLATE_SEGMENTOS = [
  // Prioridade Máxima
  {
    id: 'tmpl_seg_p1a',
    nome: 'P1-A — Propostas sem resposta',
    descricao: 'Deals sem movimentação há mais de 2 dias — recuperar intenção imediata',
    prioridade: 'maxima',
    filtros: JSON.stringify([{ tipo: 'sem_resposta', horasMin: 48 }])
  },
  {
    id: 'tmpl_seg_p1b',
    nome: 'P1-B — Lead quente que sumiu',
    descricao: 'Leads em negociação ou qualificação sem contato há 3 dias',
    prioridade: 'maxima',
    filtros: JSON.stringify([{ tipo: 'sem_resposta', horasMin: 72 }])
  },
  {
    id: 'tmpl_seg_p1c',
    nome: 'P1-C — Lead que pediu preço',
    descricao: 'Leads com alta prioridade que não avançaram de etapa',
    prioridade: 'maxima',
    filtros: JSON.stringify([{ tipo: 'sem_resposta', horasMin: 24 }])
  },
  {
    id: 'tmpl_seg_p1d',
    nome: 'P1-D — Agendamentos perdidos / no-show',
    descricao: 'Leads com baixa atividade em último dia — possível no-show',
    prioridade: 'maxima',
    filtros: JSON.stringify([{ tipo: 'leads_frios', diasSemAtividade: 1 }])
  },
  // Prioridade Média
  {
    id: 'tmpl_seg_p2a',
    nome: 'P2-A — Leads de campanha antiga (2–6 meses)',
    descricao: 'Leads criados entre 60 e 180 dias atrás que nunca chegaram a proposta',
    prioridade: 'media',
    filtros: JSON.stringify([{ tipo: 'leads_frios', diasSemAtividade: 60 }])
  },
  {
    id: 'tmpl_seg_p2b',
    nome: 'P2-B — Oportunidade morna',
    descricao: 'Deals abertos sem atualização há mais de 7 dias',
    prioridade: 'media',
    filtros: JSON.stringify([{ tipo: 'leads_frios', diasSemAtividade: 7 }])
  },
  {
    id: 'tmpl_seg_p2c',
    nome: 'P2-C — Lead frio com histórico de interesse',
    descricao: 'Deals abertos sem resposta há mais de 168 horas (7 dias)',
    prioridade: 'media',
    filtros: JSON.stringify([{ tipo: 'sem_resposta', horasMin: 168 }])
  },
  // Prioridade Baixa
  {
    id: 'tmpl_seg_p3a',
    nome: 'P3-A — Lista fria sem responsável',
    descricao: 'Contatos sem vendedor atribuído — filtrar ouro escondido',
    prioridade: 'baixa',
    filtros: JSON.stringify([{ tipo: 'sem_responsavel' }])
  },
  {
    id: 'tmpl_seg_p3b',
    nome: 'P3-B — Audiências frias de Instagram',
    descricao: 'Leads originados via Instagram sem resposta após primeiro contato',
    prioridade: 'baixa',
    filtros: JSON.stringify([{ tipo: 'origem', origem: 'instagram' }])
  },
  {
    id: 'tmpl_seg_p3c',
    nome: 'P3-C — Lead gerado há mais de 1 ano',
    descricao: 'Deals criados há mais de 365 dias sem fechar — última tentativa',
    prioridade: 'baixa',
    filtros: JSON.stringify([{ tipo: 'leads_frios', diasSemAtividade: 365 }])
  },
]

const TEMPLATE_CADENCIAS = [
  {
    nome: 'Leads Perdidos',
    tipo: 'REATIVACAO',
    etapas: [
      { ordem: 1, prazoValor: 0, prazoUnidade: 'horas', mensagem: 'Oi, vimos que conversamos há um tempo. Surgiu algo novo que pode te ajudar, posso te atualizar?', pararAoResponder: true },
      { ordem: 2, prazoValor: 1, prazoUnidade: 'dias', mensagem: 'Estamos ajudando clientes parecidos com você a alcançar resultados. Quer ver um exemplo rápido?', pararAoResponder: true },
      { ordem: 3, prazoValor: 2, prazoUnidade: 'dias', mensagem: 'Tenho uma condição rápida pra você entrar sem burocracia. Envio?', pararAoResponder: true },
      { ordem: 4, prazoValor: 3, prazoUnidade: 'dias', mensagem: 'Vou encerrar sua ficha por aqui. Se quiser retomar depois, só me chamar.', pararAoResponder: true },
    ]
  },
  {
    nome: 'Orçamentos Sem Resposta',
    tipo: 'FOLLOW_UP',
    etapas: [
      { ordem: 1, prazoValor: 0, prazoUnidade: 'horas', mensagem: 'Chegou a ver o orçamento que te enviei? Quer que eu ajuste algo nele?', pararAoResponder: true },
      { ordem: 2, prazoValor: 1, prazoUnidade: 'dias', mensagem: 'Posso fazer uma simulação mais rápida com menos informações. Te ajudo?', pararAoResponder: true },
      { ordem: 3, prazoValor: 2, prazoUnidade: 'dias', mensagem: 'Tenho prioridade de fechamento hoje. Quer aproveitar?', pararAoResponder: true },
      { ordem: 4, prazoValor: 2, prazoUnidade: 'dias', mensagem: 'Encerrando sua proposta aqui. Se precisar depois, estou à disposição.', pararAoResponder: true },
    ]
  },
  {
    nome: 'Leads que Pararam de Responder',
    tipo: 'REATIVACAO',
    etapas: [
      { ordem: 1, prazoValor: 0, prazoUnidade: 'horas', mensagem: 'Virou uma correria por aí? Se quiser, te ajudo de forma rápida.', pararAoResponder: true },
      { ordem: 2, prazoValor: 2, prazoUnidade: 'dias', mensagem: 'Você ainda tem interesse em seguir? Posso te ajudar com o próximo passo.', pararAoResponder: true },
      { ordem: 3, prazoValor: 3, prazoUnidade: 'dias', mensagem: "Coloquei sua conversa como 'pausada'. Quer continuar agora?", pararAoResponder: true },
      { ordem: 4, prazoValor: 4, prazoUnidade: 'dias', mensagem: 'Tenho um slot de fechamento hoje. Coloco seu nome?', pararAoResponder: true },
    ]
  },
  {
    nome: 'Leads que Nunca Responderam',
    tipo: 'FOLLOW_UP',
    etapas: [
      { ordem: 1, prazoValor: 0, prazoUnidade: 'horas', mensagem: 'Oi! Prefere resumo rápido ou detalhado sobre o assunto?', pararAoResponder: true },
      { ordem: 2, prazoValor: 1, prazoUnidade: 'dias', mensagem: 'Ajudamos muitas pessoas a alcançar resultados. Posso te mostrar?', pararAoResponder: true },
      { ordem: 3, prazoValor: 2, prazoUnidade: 'dias', mensagem: 'Prometo ser breve 😊 Quer que eu te mande o passo mais rápido?', pararAoResponder: true },
      { ordem: 4, prazoValor: 2, prazoUnidade: 'dias', mensagem: 'Dica rápida que já pode te ajudar agora: {{insight}}. Quer o próximo passo?', pararAoResponder: true },
      { ordem: 5, prazoValor: 2, prazoUnidade: 'dias', mensagem: 'Sem problemas se não quiser seguir agora. Deixo aberto aqui.', pararAoResponder: true },
    ]
  },
]

async function seedTemplateSegmentos() {
  for (const seg of TEMPLATE_SEGMENTOS) {
    const existing = await prisma.segmento.findUnique({ where: { id: seg.id } })
    if (!existing) {
      await prisma.segmento.create({
        data: {
          id: seg.id,
          userId: null,
          nome: seg.nome,
          descricao: seg.descricao,
          prioridade: seg.prioridade,
          tipo: 'template',
          filtros: seg.filtros
        }
      })
    }
  }
  console.log('Segmentos template criados/verificados.')
}

async function seedTemplateCadencias(userIds: string[]) {
  for (const userId of userIds) {
    for (const cad of TEMPLATE_CADENCIAS) {
      const existing = await prisma.cadencia.findFirst({
        where: { userId, nome: cad.nome, tipoOrigem: 'template' }
      })
      if (!existing) {
        await prisma.cadencia.create({
          data: {
            userId,
            nome: cad.nome,
            tipo: cad.tipo,
            status: 'ATIVO',
            tipoOrigem: 'template',
            etapas: { create: cad.etapas }
          }
        })
      }
    }
  }
  console.log('Cadências template criadas/verificadas.')
}

async function main() {
  console.log('Iniciando o seeding do banco de dados...')

  // Sempre garante segmentos template (idempotente)
  await seedTemplateSegmentos()

  // Verificar se o banco já foi populado para evitar apagar dados do usuário
  const userCount = await prisma.user.count()
  if (userCount > 0) {
    // Seed template cadences for existing users (idempotent)
    const existingUsers = await prisma.user.findMany({ select: { id: true } })
    await seedTemplateCadencias(existingUsers.map(u => u.id))
    console.log('O banco de dados já possui usuários cadastrados. Seeding de usuários ignorado para preservar dados.')
    return
  }

  // Limpar dados existentes para evitar duplicidade no seed
  await prisma.aiConversationLog.deleteMany({})
  await prisma.aiQualificationSession.deleteMany({})
  await prisma.leadListaDisparo.deleteMany({})
  await prisma.historicoDisparos.deleteMany({})
  await prisma.listaDisparo.deleteMany({})
  await prisma.activity.deleteMany({})
  await prisma.dealStageHistory.deleteMany({})
  await prisma.deal.deleteMany({})
  await prisma.contact.deleteMany({})
  await prisma.stage.deleteMany({})
  await prisma.pipeline.deleteMany({})
  await prisma.teamMember.deleteMany({})
  await prisma.team.deleteMany({})
  await prisma.profile.deleteMany({})
  await prisma.userRole.deleteMany({})
  await prisma.userFeaturePermission.deleteMany({})
  await prisma.user.deleteMany({})

  console.log('Tabelas limpas.')

  // 1. Criar Usuários Default
  const salt = await bcrypt.genSalt(10)
  const passwordHash = await bcrypt.hash('admin123', salt)
  const userPasswordHash = await bcrypt.hash('32126090', salt)

  // 1.1 Admin User
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@caixarapido.com.br',
      passwordHash,
    },
  })

  await prisma.profile.create({
    data: {
      userId: adminUser.id,
      nome: 'Diretor',
      sobrenome: 'Comercial',
      telefone: '5562999999999',
    },
  })

  await prisma.userRole.create({
    data: {
      userId: adminUser.id,
      role: AppRole.ADMIN,
    },
  })

  // 1.2 Gabriel User
  const gabrielUser = await prisma.user.create({
    data: {
      email: 'gabriel@caixarapido.com.br',
      passwordHash: userPasswordHash,
    },
  })

  await prisma.profile.create({
    data: {
      userId: gabrielUser.id,
      nome: 'Gabriel',
      sobrenome: 'CJ',
      telefone: '5562999999999',
    },
  })

  await prisma.userRole.create({
    data: {
      userId: gabrielUser.id,
      role: AppRole.ADMIN,
    },
  })

  // 1.3 Luiza User
  const luizaUser = await prisma.user.create({
    data: {
      email: 'luiza@caixarapido.com.br',
      passwordHash: userPasswordHash,
    },
  })

  await prisma.profile.create({
    data: {
      userId: luizaUser.id,
      nome: 'Luiza',
      sobrenome: '',
      telefone: '5562999999999',
    },
  })

  await prisma.userRole.create({
    data: {
      userId: luizaUser.id,
      role: AppRole.ADMIN,
    },
  })

  // 2. Criar Permissões de Recursos (Feature Flags)
  const features = [
    'dashboard',
    'pipeline',
    'contacts',
    'activities',
    'lead-search-google',
    'lead-search-cnpj',
    'listas-disparo',
    'utm-analytics',
    'ai-insights',
    'relatorios',
    'settings',
  ]

  const userIdsToSeed = [adminUser.id, gabrielUser.id, luizaUser.id]

  for (const userId of userIdsToSeed) {
    for (const feature of features) {
      await prisma.userFeaturePermission.create({
        data: {
          userId,
          feature,
          allowed: true,
        },
      })
    }
  }

  // 3. Criar Time Comercial
  const mainTeam = await prisma.team.create({
    data: {
      nome: 'Time de Vendas Alfa',
    },
  })

  // Vincular usuários ao time como ADMIN
  for (const userId of userIdsToSeed) {
    await prisma.teamMember.create({
      data: {
        teamId: mainTeam.id,
        userId,
        role: AppRole.ADMIN,
      },
    })
  }

  // 6. Criar Pipeline Comercial Padrão
  const defaultPipeline = await prisma.pipeline.create({
    data: {
      userId: adminUser.id,
      teamId: mainTeam.id,
      nome: 'Pipeline Principal',
      isDefault: true,
      ordem: 1,
      ativo: true,
    },
  })

  // 7. Criar Etapas do Pipeline (Stages)
  const stageData = [
    { nome: 'Novo Lead', cor: '#00E676', probabilidade: 10, slaHours: 4, ordem: 1 },
    { nome: 'Qualificação', cor: '#39FF88', probabilidade: 25, slaHours: 12, ordem: 2 },
    { nome: 'Proposta', cor: '#FFB300', probabilidade: 50, slaHours: 24, ordem: 3 },
    { nome: 'Negociação', cor: '#FF5722', probabilidade: 75, slaHours: 48, ordem: 4 },
    { nome: 'Fechamento', cor: '#00C853', probabilidade: 90, slaHours: 24, ordem: 5 },
  ]

  const stages = []
  for (const stg of stageData) {
    const s = await prisma.stage.create({
      data: {
        pipelineId: defaultPipeline.id,
        nome: stg.nome,
        cor: stg.cor,
        ordem: stg.ordem,
        probabilidade: stg.probabilidade,
        slaHours: stg.slaHours,
      },
    })
    stages.push(s)
  }

  console.log('Pipeline e etapas padrão criados.')

  // 8. Seeding de Contatos Mock
  const contactsData = [
    { nome: 'Carlos', sobrenome: 'Oliveira', email: 'carlos@techcorp.com.br', telefone: '5511988887777', cidade: 'São Paulo', estado: 'SP' },
    { nome: 'Juliana', sobrenome: 'Santos', email: 'juliana@vendasmax.com.br', telefone: '5521977776666', cidade: 'Rio de Janeiro', estado: 'RJ' },
    { nome: 'Roberto', sobrenome: 'Ferreira', email: 'roberto@construsul.com', telefone: '5531966665555', cidade: 'Belo Horizonte', estado: 'MG' },
    { nome: 'Fernanda', sobrenome: 'Lima', email: 'fernanda@agroalfa.com.br', telefone: '5562955554444', cidade: 'Goiânia', estado: 'GO' },
  ]

  const contacts = []
  for (const c of contactsData) {
    const contact = await prisma.contact.create({
      data: {
        userId: adminUser.id,
        nome: c.nome,
        sobrenome: c.sobrenome,
        email: c.email,
        telefone: c.telefone,
        cidade: c.cidade,
        estado: c.estado,
        consentimentoLgpd: true,
        firstUtmSource: 'Meta Ads',
        firstUtmMedium: 'cpc',
        firstUtmCampaign: 'caixa_rapido_ads',
        firstUtmAt: new Date(),
      },
    })
    contacts.push(contact)
  }

  // 9. Seeding de Negociações (Deals) Mock vinculadas aos contatos
  const dealsData = [
    {
      titulo: 'Implantação de Automação Comercial',
      valor: 8500.0,
      origem: 'Meta Ads',
      produto: 'Automação',
      prioridade: DealPriority.ALTA,
      status: DealStatus.OPEN,
      stageIndex: 0, // Novo Lead
      contactIndex: 0, // Carlos
    },
    {
      titulo: 'Contrato Tráfego Pago Semestral',
      valor: 12000.0,
      origem: 'Google Maps',
      produto: 'Tráfego Pago',
      prioridade: DealPriority.MEDIA,
      status: DealStatus.OPEN,
      stageIndex: 1, // Qualificação
      contactIndex: 1, // Juliana
    },
    {
      titulo: 'Desenvolvimento de App e CRM customizado',
      valor: 45000.0,
      origem: 'Indicação',
      produto: 'Sistema/App',
      prioridade: DealPriority.ALTA,
      status: DealStatus.OPEN,
      stageIndex: 2, // Proposta
      contactIndex: 2, // Roberto
    },
    {
      titulo: 'Mentoria & Consultoria Comercial',
      valor: 5000.0,
      origem: 'WhatsApp',
      produto: 'Consultoria',
      prioridade: DealPriority.BAIXA,
      status: DealStatus.OPEN,
      stageIndex: 3, // Negociação
      contactIndex: 3, // Fernanda
    },
  ]

  for (const d of dealsData) {
    const deal = await prisma.deal.create({
      data: {
        pipelineId: defaultPipeline.id,
        stageId: stages[d.stageIndex].id,
        contactId: contacts[d.contactIndex].id,
        userId: adminUser.id,
        titulo: d.titulo,
        valorEstimado: d.valor,
        origem: d.origem,
        produtoInteresse: d.produto,
        prioridade: d.prioridade,
        status: d.status,
        telefone: contacts[d.contactIndex].telefone,
        aiScore: d.stageIndex === 1 ? 85 : 0, // Dar um score para o deal em qualificação
        aiAnalysis: d.stageIndex === 1 ? 'Lead demonstrou forte interesse e possui orçamento adequado.' : undefined,
      },
    })

    // Adicionar Histórico de Transição Inicial
    await prisma.dealStageHistory.create({
      data: {
        dealId: deal.id,
        deStageId: stages[0].id, // Simulando que veio do primeiro stage
        paraStageId: stages[d.stageIndex].id,
        mudouPor: 'Admin',
        fonte: 'api',
      },
    })

    // Adicionar uma atividade para cada deal
    await prisma.activity.create({
      data: {
        userId: adminUser.id,
        dealId: deal.id,
        contactId: contacts[d.contactIndex].id,
        tipo: 'tarefa',
        titulo: 'Fazer follow-up com o cliente',
        descricao: 'Entrar em contato para dar andamento à negociação de ' + d.produto,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Amanhã
        status: ActivityStatus.OPEN,
      },
    })
  }

  // 10. Criar Templates de Mensagem Iniciais
  await prisma.messageTemplate.create({
    data: {
      userId: adminUser.id,
      nome: 'Sondagem de Faturamento',
      categoria: 'Sondagem',
      corpo: 'Olá {{nome}}, tudo bem? Antes de continuar, preciso entender melhor o momento da {{empresa}}. Qual é o faturamento mensal aproximado hoje?',
    },
  })

  // 11. Criar Cadências Template para todos os usuários
  await seedTemplateCadencias(userIdsToSeed)

  console.log('Tudo pronto! Banco de dados populado com sucesso.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
