import { DealPriority, DealStatus, ListaDisparoStatus, StatusEnvio, ActivityStatus } from '@prisma/client'

export interface MockUser {
  id: string
  email: string
  nome: string
  sobrenome: string
  avatarUrl?: string
  telefone?: string
  role: 'ADMIN' | 'MODERATOR' | 'USER'
  lead_search_webhook_url?: string
  cnpj_search_webhook_url?: string
  disparo_webhook_url?: string
  disparo_status_webhook_url?: string
  disparo_cancelar_webhook_url?: string
  permissions?: string[] // feature keys
  visiblePipelines?: string[] // pipeline IDs
}

export interface MockTeam {
  id: string
  nome: string
  ownerUserId: string
  members: string[] // User IDs
}

export interface MockWebhookEndpoint {
  id: string
  integrationId: string
  path: string
  secretToken?: string
  sourceSystem?: 'facebook_leads' | 'elementor' | 'n8n' | 'custom'
  ativo: boolean
  createdAt: string
}

export interface MockIntegration {
  id: string
  nome: string
  tipo: 'inbound_webhook' | 'outbound_api'
  baseUrl?: string
  ativo: boolean
  createdAt: string
  endpoints: MockWebhookEndpoint[]
}

export interface MockWebhookLog {
  id: string
  endpointId: string
  status: 'SUCCESS' | 'ERROR'
  timestamp: string
  payload: string
}

export interface MockAIAgentConfig {
  id: string
  userId: string
  nome: string
  nomeExibicao: string
  ativo: boolean
  tomComunicacao: string
  emojisPermitidos: boolean
  promptSistema: string
  promptQualificacao: string
  promptObjecoes: string
  scriptAbertura: string
  scriptQualificacao: string
  scriptFechamentoPositivo: string
  scriptFechamentoNegativo: string
  scoreMinimoQualificado: number // 0-100
  camposObrigatorios: string[] // 'orcamento'|'autoridade'|'necessidade'|'prazo'
  maxTentativasContato: number
  tempoEsperaRespostaHoras: number
  modeloIa: string
  temperatura: number // 0-1
  maxTokens: number
  acoesQualificado: {
    moverStageId?: string
    criarAtividade: boolean
    notificar: boolean
  }
  acoesDesqualificado: {
    moverStageId?: string
    adicionarTag?: string
    arquivarDias: number
  }
  webhookSecret: string
  n8nWebhookUrl: string
}

export interface MockAISession {
  id: string
  sessionId: string
  dealId: string
  startedAt: string
  lastInteractionAt: string
  completedAt?: string
  scoreInicial: number
  scoreFinal: number
  mensagensEnviadas: number
  mensagensRecebidas: number
  qualificationResult: 'em_andamento' | 'qualificado' | 'desqualificado'
}

export interface MockAILog {
  id: string
  sessionId: string
  dealId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface MockPipeline {
  id: string
  nome: string
  isDefault: boolean
  ativo: boolean
  ordem: number
}

export interface MockStage {
  id: string
  pipelineId: string
  nome: string
  cor: string
  probabilidade: number
  slaHours: number
  ordem: number
}

export interface MockContact {
  id: string
  user_id?: string
  nome: string
  sobrenome?: string
  email?: string
  telefone: string
  cidade?: string
  estado?: string
  tags?: string[]
  documento?: string
  dataNascimento?: string
  origem?: string
  enderecoCompleto?: {
    rua?: string
    numero?: string
    complemento?: string
    bairro?: string
    cidade?: string
    estado?: string
    cep?: string
  }
  consentimentoLgpd: boolean
  lastPurchaseAt?: string
  lastPurchaseValue?: number
  firstUtmSource?: string
  firstUtmMedium?: string
  firstUtmCampaign?: string
  firstUtmContent?: string
  firstUtmTerm?: string
  firstLandingPage?: string
  firstUtmAt?: string
  lastUtmSource?: string
  lastUtmMedium?: string
  lastUtmCampaign?: string
  lastUtmContent?: string
  lastUtmTerm?: string
  lastLandingPage?: string
  lastUtmAt?: string
  fbMetadata?: Record<string, unknown> | Array<Record<string, unknown>>
  camposCustomizados?: Record<string, unknown>
  createdAt: string
}


export interface MockDeal {
  id: string
  pipelineId: string
  stageId: string
  contactId: string
  userId: string
  ownerUserId?: string
  ownerAssignedAt?: string
  titulo: string
  valorEstimado: number
  produtoInteresse?: string
  origem?: string
  prioridade: DealPriority
  status: DealStatus
  motivoPerda?: string
  motivoPerdaCustom?: string
  fechadoEm?: string
  telefone?: string
  ramoEmpresa?: string
  faturamentoMensal?: number
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  utmLandingPage?: string
  utmReferrer?: string
  utmCapturedAt?: string
  anotacoes?: string
  anotacoesReuniao?: string
  aiScore: number
  aiAnalysis?: string
  aiRecommendedAction?: string
  aiSessionId?: string
  qualificationStatus?: string // qualificado, desqualificado, em_andamento
  qualificationData?: string // JSON string
  disqualificationReason?: string
  createdAt: string
  updatedAt: string
}

export interface MockDealStageHistory {
  id: string
  dealId: string
  deStageId: string | null
  paraStageId: string
  mudouEm: string
  mudouPor: string
  fonte: string // kanban_drag, bulk_move, ai_qualification, manual_form, etc.
}

export interface MockActivity {
  id: string
  dealId?: string
  contactId?: string
  tipo: string // ligacao, reuniao, tarefa, nota, WhatsApp, email
  titulo: string
  descricao?: string
  dueAt?: string
  status: ActivityStatus
  doneAt?: string
  createdAt: string
}

export interface MockLead {
  id: string
  nome: string
  nicho?: string
  cidade?: string
  estado?: string
  telefone: string
  site?: string
  endereco?: string
  avaliacao: number
  status: string // ativo, add_lista, disparado, descartado
  notas?: string
  createdAt: string
}

export interface MockLeadCnpj {
  id: string
  cnpj: string
  nome: string
  cnaeCodigo?: string
  cnaeDescricao?: string
  situacao?: string
  dataAbertura?: string
  cidade?: string
  estado?: string
  email?: string
  telefone?: string
  createdAt: string
}

export interface MockListaDisparo {
  id: string
  nomeLista: string
  descricao?: string
  mensagemTemplate: string
  status: ListaDisparoStatus
  totalLeads: number
  enviados: number
  erros: number
  configEnvio?: {
    intervalo_segundos: number
    horario_comercial: boolean
    hora_inicio: string
    hora_fim: string
    dias_semana: number[]
  }
  createdAt: string
}

export interface MockLeadListaDisparo {
  id: string
  listaId: string
  leadId?: string
  leadCnpjId?: string
  dealId?: string
  nomeSnapshot: string
  telefoneSnapshot: string
  mensagemFinal: string
  statusEnvio: StatusEnvio
  tentativas: number
  mensagemErro?: string
  dataEnvio?: string
}

export interface MockMessageTemplate {
  id: string
  nome: string
  conteudo: string
  variaveis: string[]
  createdAt: string
}

export interface MockCaixaRapidoList {
  id: string
  nomeLista: string
  descricao?: string
  mensagemTemplateId?: string
  status: 'RASCUNHO' | 'AGENDADA' | 'EM_ANDAMENTO' | 'PAUSADA' | 'CONCLUIDA' | 'CANCELADA'
  totalLeads: number
  enviados: number
  erros: number
  agendamento?: {
    dataHoraInicio: string
  }
  configEnvio: {
    webhookUrl?: string
    webhookMethod?: 'POST' | 'GET'
    horarioComercial: boolean
    intervaloSegundos: number
  }
  segmentosAplicados: string[]
  createdAt: string
  updatedAt: string
}

export interface MockSegmentoCaixaRapido {
  id: string
  nome: string
  descricao?: string
  filtros: Record<string, unknown>
  createdAt: string
}

export interface MockLeadReactivationHistory {
  id: string
  contactId: string
  listaId: string
  status: 'SUCESSO' | 'FALHA' | 'DUPLICADO' | 'COOLDOWN_ATIVO'
  dataEnvio: string
  detalhes?: string
}

export const INITIAL_USER: MockUser = {
  id: 'usr-admin-123',
  email: 'admin@caixarapido.com.br',
  nome: 'Diretor',
  sobrenome: 'Comercial',
  telefone: '5562999999999',
  role: 'ADMIN',
  lead_search_webhook_url: 'https://auto.devnetlife.com/webhook/buscar-google',
  cnpj_search_webhook_url: 'https://auto.devnetlife.com/webhook/pesquisacnpj',
  disparo_webhook_url: 'https://auto.devnetlife.com/webhook/disparar-whatsapp',
  disparo_status_webhook_url: 'https://auto.devnetlife.com/webhook/status-disparo',
  disparo_cancelar_webhook_url: 'https://auto.devnetlife.com/webhook/cancelar-disparo',
  permissions: ['dashboard', 'pipeline', 'contacts', 'activities', 'lead-search-google', 'lead-search-cnpj', 'listas-disparo', 'utm-analytics', 'ai-insights', 'relatorios'],
  visiblePipelines: ['pipe-principal']
}

export const INITIAL_SELLERS: MockUser[] = [
  {
    id: 'usr-seller-1',
    email: 'aline@caixarapido.com.br',
    nome: 'Aline',
    sobrenome: 'Ferreira',
    telefone: '5562988887777',
    role: 'USER',
    permissions: ['dashboard', 'pipeline', 'contacts', 'activities', 'listas-disparo'],
    visiblePipelines: ['pipe-principal']
  },
  {
    id: 'usr-seller-2',
    email: 'bruno@caixarapido.com.br',
    nome: 'Bruno',
    sobrenome: 'Gomes',
    telefone: '5511977778888',
    role: 'USER',
    permissions: ['dashboard', 'pipeline', 'contacts', 'activities'],
    visiblePipelines: ['pipe-principal']
  }
]

export const INITIAL_TEAM: MockTeam = {
  id: 'team-alfa-01',
  nome: 'Time de Vendas Alfa',
  ownerUserId: 'usr-admin-123',
  members: ['usr-admin-123', 'usr-seller-1', 'usr-seller-2']
}

export const INITIAL_INTEGRATIONS: MockIntegration[] = [
  {
    id: 'int-01',
    nome: 'Elementor Webhook Leads',
    tipo: 'inbound_webhook',
    ativo: true,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    endpoints: [
      {
        id: 'ep-01',
        integrationId: 'int-01',
        path: 'lead-elementor-principal',
        secretToken: 'sec-elementor-xyz123',
        sourceSystem: 'elementor',
        ativo: true,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    ]
  },
  {
    id: 'int-02',
    nome: 'n8n Chat Autocompleter',
    tipo: 'outbound_api',
    baseUrl: 'https://n8n.netlife.com.br/webhook/chat-complete',
    ativo: true,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    endpoints: []
  }
]

export const INITIAL_WEBHOOK_LOGS: MockWebhookLog[] = [
  {
    id: 'log-01',
    endpointId: 'ep-01',
    status: 'SUCCESS',
    timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
    payload: JSON.stringify({
      nome: 'Ricardo',
      sobrenome: 'Almeida',
      telefone: '5562998881234',
      email: 'ricardo@almeida.com',
      utm_source: 'Google Ads',
      utm_medium: 'cpc',
      utm_campaign: 'Institucional_Branding',
      campos_customizados: {
        empresa: 'Almeida Tech',
        cargo: 'CEO'
      }
    }, null, 2)
  },
  {
    id: 'log-02',
    endpointId: 'ep-01',
    status: 'ERROR',
    timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
    payload: JSON.stringify({
      error: 'Telefone inválido formatado',
      raw_payload: {
        nome: 'Lead Invalido',
        telefone: 'abc'
      }
    }, null, 2)
  }
]

export const INITIAL_AI_CONFIGS: MockAIAgentConfig[] = [
  {
    id: 'ai-config-01',
    userId: 'usr-admin-123',
    nome: 'SDR Virtual - NetLife AI',
    nomeExibicao: 'Sofia | NetLife CRM',
    ativo: true,
    tomComunicacao: 'profissional_descontraido',
    emojisPermitidos: true,
    promptSistema: 'Você é Sofia, a assistente virtual inteligente de pré-vendas (SDR) do NetLife. Seu objetivo é engajar leads frios que chegam por webhook ou listas de disparo, entender as dores comerciais e qualificar se possuem perfil (BANT) para agendar uma reunião com um consultor comercial.',
    promptQualificacao: 'Verifique se o lead tem orçamento mínimo de R$ 2.000/mês, autoridade para decidir, necessidade clara de automação de vendas e prazo de até 30 dias para iniciar.',
    promptObjecoes: 'Se o lead disser que "está sem tempo", ofereça uma demonstração gravada de 3 minutos. Se disser que "está caro", foque no ROI e no plano de teste de 7 dias gratuito.',
    scriptAbertura: 'Olá {{nome_lead}}! Tudo bem? Sou a {{nome_agente}}, consultora virtual da {{empresa}}. Vi que você demonstrou interesse no nosso produto {{produto}}. Me conta, qual o seu maior desafio de vendas hoje?',
    scriptQualificacao: 'Entendo perfeitamente, {{nome_lead}}. Para ver se conseguimos ajudar, qual seria a média de faturamento mensal ou verba disponível para essa solução hoje?',
    scriptFechamentoPositivo: 'Excelente! Você atende a todos os critérios. Vou agendar sua chamada com o nosso especialista comercial. Qual o melhor horário para você?',
    scriptFechamentoNegativo: 'Certo, {{nome_lead}}. No momento, nosso sistema pode ser complexo para a sua fase atual, mas vou deixar salvo seu contato para oportunidades futuras. Sucesso!',
    scoreMinimoQualificado: 75,
    camposObrigatorios: ['orcamento', 'autoridade', 'necessidade'],
    maxTentativasContato: 3,
    tempoEsperaRespostaHoras: 24,
    modeloIa: 'gpt-4o-mini',
    temperatura: 0.4,
    maxTokens: 500,
    acoesQualificado: {
      moverStageId: 'stage-2',
      criarAtividade: true,
      notificar: true
    },
    acoesDesqualificado: {
      moverStageId: 'stage-4',
      adicionarTag: 'AI-Desqualificado',
      arquivarDias: 7
    },
    webhookSecret: 'sec-ai-callback-abc987',
    n8nWebhookUrl: 'https://n8n.netlife.com.br/webhook/ai-agent-sdr'
  }
]

export const INITIAL_PIPELINES: MockPipeline[] = [
  { id: 'pipe-principal', nome: 'Pipeline Principal', isDefault: true, ativo: true, ordem: 1 }
]

export const INITIAL_STAGES: MockStage[] = [
  { id: 'stage-1', pipelineId: 'pipe-principal', nome: 'Novo Lead', cor: '#00E676', probabilidade: 10, slaHours: 4, ordem: 1 },
  { id: 'stage-2', pipelineId: 'pipe-principal', nome: 'Qualificação', cor: '#39FF88', probabilidade: 25, slaHours: 12, ordem: 2 },
  { id: 'stage-3', pipelineId: 'pipe-principal', nome: 'Proposta', cor: '#FFB300', probabilidade: 50, slaHours: 24, ordem: 3 },
  { id: 'stage-4', pipelineId: 'pipe-principal', nome: 'Negociação', cor: '#FF5722', probabilidade: 75, slaHours: 48, ordem: 4 },
  { id: 'stage-5', pipelineId: 'pipe-principal', nome: 'Fechamento', cor: '#00C853', probabilidade: 90, slaHours: 24, ordem: 5 },
]

export const INITIAL_CONTACTS: MockContact[] = [
  {
    id: 'contact-carlos',
    nome: 'Carlos',
    sobrenome: 'Oliveira',
    email: 'carlos@techcorp.com.br',
    telefone: '5511988887777',
    cidade: 'São Paulo',
    estado: 'SP',
    tags: ['Decisor', 'Tecnologia'],
    documento: '123.456.789-00',
    dataNascimento: '1988-05-15',
    origem: 'Meta Ads',
    enderecoCompleto: {
      rua: 'Av. Paulista',
      numero: '1000',
      complemento: 'Apto 101',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01310-100'
    },
    consentimentoLgpd: true,
    firstUtmSource: 'Meta Ads',
    firstUtmMedium: 'cpc',
    firstUtmCampaign: 'caixa_rapido_ads',
    firstUtmAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    fbMetadata: {
      fb_lead_id: 'lead-12345',
      fb_form_name: 'Formulário Comercial - Automação',
      fb_campaign_id: 'camp-999',
      fb_adset_id: 'adset-888',
      fb_ad_id: 'ad-777'
    },
    camposCustomizados: {
      ramo_de_atividade: 'Tecnologia',
      tamanho_da_equipe: '15 pessoas',
      faturamento_estimado: 'R$ 50.000/mês'
    },
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'contact-juliana',
    nome: 'Juliana',
    sobrenome: 'Santos',
    email: 'juliana@vendasmax.com.br',
    telefone: '5521977776666',
    cidade: 'Rio de Janeiro',
    estado: 'RJ',
    tags: ['PME', 'Comercial'],
    documento: '223.456.789-11',
    dataNascimento: '1992-10-22',
    origem: 'Google Maps',
    enderecoCompleto: {
      rua: 'Rua Copacabana',
      numero: '250',
      bairro: 'Copacabana',
      cidade: 'Rio de Janeiro',
      estado: 'RJ',
      cep: '22020-001'
    },
    consentimentoLgpd: true,
    firstUtmSource: 'Google Maps',
    firstUtmMedium: 'organic',
    firstUtmCampaign: 'local_search',
    firstUtmAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'contact-roberto',
    nome: 'Roberto',
    sobrenome: 'Ferreira',
    email: 'roberto@construsul.com',
    telefone: '5531966665555',
    cidade: 'Belo Horizonte',
    estado: 'MG',
    tags: ['Corporativo'],
    documento: '33.444.555/0001-22',
    origem: 'Indicação',
    consentimentoLgpd: true,
    firstUtmSource: 'Indicação',
    firstUtmMedium: 'referral',
    firstUtmCampaign: 'parceiros',
    firstUtmAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'contact-fernanda',
    nome: 'Fernanda',
    sobrenome: 'Lima',
    email: 'fernanda@agroalfa.com.br',
    telefone: '5562955554444',
    cidade: 'Goiânia',
    estado: 'GO',
    tags: ['Agronegócio'],
    origem: 'WhatsApp',
    consentimentoLgpd: true,
    firstUtmSource: 'WhatsApp',
    firstUtmMedium: 'chat',
    firstUtmCampaign: 'outbound_ocr',
    firstUtmAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  }
]

export const INITIAL_DEALS: MockDeal[] = [
  {
    id: 'deal-01',
    pipelineId: 'pipe-principal',
    stageId: 'stage-1',
    contactId: 'contact-carlos',
    userId: 'usr-admin-123',
    ownerUserId: 'usr-admin-123',
    ownerAssignedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    titulo: 'Implantação de Automação Comercial',
    valorEstimado: 8500.00,
    produtoInteresse: 'Automação',
    origem: 'Meta Ads',
    prioridade: DealPriority.ALTA,
    status: DealStatus.OPEN,
    telefone: '5511988887777',
    ramoEmpresa: 'Tecnologia',
    faturamentoMensal: 50000.00,
    utmSource: 'Meta Ads',
    utmMedium: 'cpc',
    utmCampaign: 'caixa_rapido_ads',
    utmContent: 'ad_video_01',
    utmTerm: 'crm automacao',
    utmLandingPage: '/acelerador-comercial',
    utmReferrer: 'https://instagram.com',
    utmCapturedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    aiScore: 78,
    aiAnalysis: 'Lead possui alto engajamento, visitou a página de preços e tem o perfil de faturamento correto.',
    aiRecommendedAction: 'Enviar proposta comercial com foco em ROI operacional.',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'deal-02',
    pipelineId: 'pipe-principal',
    stageId: 'stage-2',
    contactId: 'contact-juliana',
    userId: 'usr-admin-123',
    ownerUserId: 'usr-seller-1',
    ownerAssignedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    titulo: 'Contrato Tráfego Pago Semestral',
    valorEstimado: 12000.00,
    produtoInteresse: 'Tráfego Pago',
    origem: 'Google Maps',
    prioridade: DealPriority.MEDIA,
    status: DealStatus.OPEN,
    telefone: '5521977776666',
    ramoEmpresa: 'Comércio Local',
    faturamentoMensal: 35000.00,
    utmSource: 'Google Maps',
    utmMedium: 'organic',
    utmCampaign: 'local_search',
    utmContent: 'listing_card',
    utmTerm: 'agencia trafego rio',
    utmLandingPage: '/home',
    utmReferrer: 'https://google.com.br',
    utmCapturedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    aiScore: 92,
    aiAnalysis: 'Qualificação via WhatsApp identificou urgência no fechamento. O cliente quer iniciar na próxima semana.',
    aiRecommendedAction: 'Ligar imediatamente para fechar termos do contrato.',
    qualificationStatus: 'qualificado',
    qualificationData: JSON.stringify({ bant_orcamento: true, bant_autoridade: true, bant_necessidade: true, bant_tempo: 'imediato' }),
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'deal-03',
    pipelineId: 'pipe-principal',
    stageId: 'stage-3',
    contactId: 'contact-roberto',
    userId: 'usr-admin-123',
    ownerUserId: 'usr-seller-2',
    ownerAssignedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    titulo: 'Desenvolvimento de App e CRM customizado',
    valorEstimado: 45000.00,
    produtoInteresse: 'Sistema/App',
    origem: 'Indicação',
    prioridade: DealPriority.ALTA,
    status: DealStatus.OPEN,
    telefone: '5531966665555',
    ramoEmpresa: 'Engenharia',
    faturamentoMensal: 250000.00,
    utmSource: 'Indicação',
    utmMedium: 'referral',
    utmCampaign: 'parceiros',
    utmContent: 'parceiro_dev',
    utmTerm: '',
    utmLandingPage: '/parceiros',
    utmReferrer: 'https://linkedin.com',
    utmCapturedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    aiScore: 85,
    aiAnalysis: 'Faturamento de grande porte. Necessita de integrações ERP e relatórios customizados.',
    aiRecommendedAction: 'Apresentar protótipo funcional na próxima reunião.',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'deal-04',
    pipelineId: 'pipe-principal',
    stageId: 'stage-4',
    contactId: 'contact-fernanda',
    userId: 'usr-admin-123',
    ownerUserId: undefined,
    titulo: 'Mentoria & Consultoria Comercial',
    valorEstimado: 5000.00,
    produtoInteresse: 'Consultoria',
    origem: 'WhatsApp',
    prioridade: DealPriority.BAIXA,
    status: DealStatus.OPEN,
    telefone: '5562955554444',
    ramoEmpresa: 'Agronegócio',
    faturamentoMensal: 80000.00,
    utmSource: 'WhatsApp',
    utmMedium: 'chat',
    utmCampaign: 'outbound_ocr',
    utmContent: 'cold_message',
    utmTerm: 'agro',
    utmLandingPage: '/mentoria',
    utmReferrer: 'https://whatsapp.com',
    utmCapturedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    aiScore: 45,
    aiAnalysis: 'Lead possui pouco tempo disponível. Reunião de alinhamento remarcada duas vezes.',
    aiRecommendedAction: 'Enviar mensagem direta via WhatsApp com vídeo explicativo curto da mentoria.',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  }
]

export const INITIAL_ACTIVITIES: MockActivity[] = [
  {
    id: 'act-01',
    dealId: 'deal-01',
    contactId: 'contact-carlos',
    tipo: 'tarefa',
    titulo: 'Enviar proposta comercial',
    descricao: 'Elaborar PDF da proposta de implantação da automação comercial e enviar por e-mail.',
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Amanhã
    status: ActivityStatus.OPEN,
    createdAt: new Date().toISOString()
  },
  {
    id: 'act-02',
    dealId: 'deal-02',
    contactId: 'contact-juliana',
    tipo: 'ligacao',
    titulo: 'Ligação de Fechamento',
    descricao: 'Ligar para alinhar os detalhes contratuais e obter assinatura eletrônica.',
    dueAt: new Date(Date.now()).toISOString(), // Hoje
    status: ActivityStatus.OPEN,
    createdAt: new Date().toISOString()
  },
  {
    id: 'act-03',
    dealId: 'deal-03',
    contactId: 'contact-roberto',
    tipo: 'reuniao',
    titulo: 'Apresentação do Escopo',
    descricao: 'Reunião via Google Meet com o time de engenharia para validação técnica.',
    dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // Ontem
    status: ActivityStatus.DONE,
    doneAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  }
]

export const INITIAL_LEADS: MockLead[] = [
  {
    id: 'lead-map-1',
    nome: 'Padaria Central LTDA',
    nicho: 'Padarias',
    cidade: 'Goiânia',
    estado: 'GO',
    telefone: '5562988881234',
    site: 'www.padariacentral.com.br',
    endereco: 'Av. Anhanguera, 450 - Setor Central',
    avaliacao: 4.2,
    status: 'ativo',
    createdAt: new Date().toISOString()
  },
  {
    id: 'lead-map-2',
    nome: 'Oficina Mecânica Express',
    nicho: 'Mecânicas',
    cidade: 'Goiânia',
    estado: 'GO',
    telefone: '5562999994321',
    endereco: 'Rua 9, Qd 45, Lote 12 - Setor Sul',
    avaliacao: 4.8,
    status: 'ativo',
    createdAt: new Date().toISOString()
  }
]

export const INITIAL_LEADS_CNPJ: MockLeadCnpj[] = [
  {
    id: 'lead-cnpj-1',
    cnpj: '12345678000199',
    nome: 'ACME SISTEMAS DE VENDAS LTDA',
    cnaeCodigo: '6202-3/00',
    cnaeDescricao: 'Desenvolvimento de programas de computador sob encomenda',
    situacao: 'ATIVA',
    dataAbertura: '10/05/2018',
    cidade: 'São Paulo',
    estado: 'SP',
    email: 'contato@acmesistemas.com.br',
    telefone: '551133334444',
    createdAt: new Date().toISOString()
  }
]

export const INITIAL_LISTAS: MockListaDisparo[] = [
  {
    id: 'lista-01',
    nomeLista: 'Lista de Prospecção Goiânia - Mecânicas',
    descricao: 'Lista gerada via busca Google Maps focada em mecânicas automotivas.',
    mensagemTemplate: 'Olá {{primeiro_nome}}, tudo bem? Vi sua oficina Mecânica no Google e notei que vocês atendem muito bem. Sabia que com o nosso CRM Caixa Rápido vocês podem dobrar os fechamentos de orçamentos por WhatsApp? Quer conversar?',
    status: ListaDisparoStatus.CONCLUIDA,
    totalLeads: 25,
    enviados: 22,
    erros: 3,
    configEnvio: {
      intervalo_segundos: 15,
      horario_comercial: true,
      hora_inicio: '08:00',
      hora_fim: '18:00',
      dias_semana: [1, 2, 3, 4, 5]
    },
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'lista-02',
    nomeLista: 'Outbound CNAE Tecnologia - São Paulo',
    descricao: 'Focado em empresas de tecnologia recém abertas obtidas por CNPJ.',
    mensagemTemplate: 'Fala {{primeiro_nome}}, beleza? Sou da Caixa Rápido CRM. Vi que a {{empresa}} foi aberta recentemente em {{cidade}}. Desenvolvemos um funil para que empresas de software validem e escalem a máquina de vendas rápido. Bora marcar 10 min?',
    status: ListaDisparoStatus.ATIVA,
    totalLeads: 5,
    enviados: 2,
    erros: 0,
    configEnvio: {
      intervalo_segundos: 20,
      horario_comercial: true,
      hora_inicio: '09:00',
      hora_fim: '18:00',
      dias_semana: [1, 2, 3, 4, 5]
    },
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
  }
]

export const INITIAL_TEMPLATES: MockMessageTemplate[] = [
  {
    id: 'tpl-1',
    nome: 'Apresentação Comercial OCR',
    conteudo: 'Olá {{primeiro_nome}}, sou o Diretor Comercial da Operação Caixa Rápido CRM. Notamos que sua empresa está expandindo e gostaria de demonstrar como automatizamos sua captação de leads. Podemos conversar hoje às 15h?',
    variaveis: ['primeiro_nome'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'tpl-2',
    nome: 'Follow-up Proposta',
    conteudo: 'Fala {{primeiro_nome}}, tudo bem? Passando para saber o que achou da proposta de {{produto_interesse}} que te enviamos para a {{empresa}}. Alguma dúvida que possamos sanar para agilizar o caixa aí?',
    variaveis: ['primeiro_nome', 'produto_interesse', 'empresa'],
    createdAt: new Date().toISOString()
  }
]

export const INITIAL_CAIXA_RAPIDO_LISTS: MockCaixaRapidoList[] = [
  {
    id: 'cr-lista-01',
    nomeLista: 'Recuperação de Perdidos - Abril',
    descricao: 'Tentativa de reativação de deals perdidos no mês passado por falta de orçamento.',
    status: 'EM_ANDAMENTO',
    totalLeads: 45,
    enviados: 12,
    erros: 1,
    configEnvio: {
      horarioComercial: true,
      intervaloSegundos: 30,
      webhookUrl: 'https://n8n.caixarapido.com/webhook/disparo-whatsapp',
      webhookMethod: 'POST'
    },
    segmentosAplicados: ['seg-perdidos'],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  }
]

export const INITIAL_SEGMENTOS: MockSegmentoCaixaRapido[] = [
  {
    id: 'seg-perdidos',
    nome: 'Deals Perdidos (Orçamento)',
    descricao: 'Contatos de negócios perdidos nos últimos 30 dias com motivo "Sem orçamento".',
    filtros: { status: 'LOST', lostReason: 'Sem orçamento' },
    createdAt: new Date().toISOString()
  }
]

export const INITIAL_REACTIVATION_HISTORY: MockLeadReactivationHistory[] = [
  {
    id: 'hist-1',
    contactId: 'contact-carlos',
    listaId: 'cr-lista-01',
    status: 'SUCESSO',
    dataEnvio: new Date().toISOString(),
    detalhes: 'Mensagem enviada com sucesso e lida pelo contato.'
  }
]

export const INITIAL_HISTORY: MockDealStageHistory[] = [
  {
    id: 'hist-d1-1',
    dealId: 'deal-01',
    deStageId: null,
    paraStageId: 'stage-1',
    mudouEm: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    mudouPor: 'Sistema',
    fonte: 'manual_form'
  },
  {
    id: 'hist-d2-1',
    dealId: 'deal-02',
    deStageId: null,
    paraStageId: 'stage-1',
    mudouEm: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    mudouPor: 'Sistema',
    fonte: 'webhook-ingest'
  },
  {
    id: 'hist-d2-2',
    dealId: 'deal-02',
    deStageId: 'stage-1',
    paraStageId: 'stage-2',
    mudouEm: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    mudouPor: 'Aline Ferreira',
    fonte: 'kanban_drag'
  },
  {
    id: 'hist-d3-1',
    dealId: 'deal-03',
    deStageId: null,
    paraStageId: 'stage-1',
    mudouEm: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    mudouPor: 'Sistema',
    fonte: 'manual_form'
  },
  {
    id: 'hist-d3-2',
    dealId: 'deal-03',
    deStageId: 'stage-1',
    paraStageId: 'stage-3',
    mudouEm: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    mudouPor: 'Bruno Gomes',
    fonte: 'menu'
  },
  {
    id: 'hist-d4-1',
    dealId: 'deal-04',
    deStageId: null,
    paraStageId: 'stage-1',
    mudouEm: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    mudouPor: 'Sistema',
    fonte: 'ai_qualification'
  },
  {
    id: 'hist-d4-2',
    dealId: 'deal-04',
    deStageId: 'stage-1',
    paraStageId: 'stage-4',
    mudouEm: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    mudouPor: 'Sistema',
    fonte: 'ai_qualification'
  }
]
