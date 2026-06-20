export interface ManualCampaignRule {
  prefix: string
  campaign: string
  source: string
  medium: string
  origem: string
}

export const MANUAL_CAMPAIGN_RULES: ManualCampaignRule[] = [
  {
    prefix: 'HMI',
    campaign: 'HMI - Meta Ads (WhatsApp)',
    source: 'meta',
    medium: 'paid-social',
    origem: 'Meta Ads'
  }
]

export function getProductGroup(titulo?: string): 'HMI' | 'Sistema' {
  if (!titulo) return 'Sistema'
  return titulo.trim().toLowerCase().startsWith('hmi') ? 'HMI' : 'Sistema'
}

export function normalizeSourceLabel(source?: string): string {
  if (!source || source === 'undefined' || source === 'null') return 'Tráfego Direto'
  const src = source.toLowerCase().trim()
  if (/^(facebook|fb|meta|instagram|ig|meta ads)$/.test(src)) {
    return 'Meta Ads'
  }
  if (/^(google|adwords|gads|google ads)$/.test(src)) {
    return 'Google Ads'
  }
  return source.charAt(0).toUpperCase() + source.slice(1)
}

export function matchManualRule(titulo?: string): ManualCampaignRule | null {
  if (!titulo) return null
  const t = titulo.trim().toLowerCase()
  for (const rule of MANUAL_CAMPAIGN_RULES) {
    if (t.startsWith(rule.prefix.toLowerCase())) {
      return rule
    }
  }
  return null
}

export function classifyContact(
  contact: import('./mockData').MockContact,
  deals: import('./mockData').MockDeal[] = []
): import('./mockData').MockContact & {
  productGroup: 'HMI' | 'Sistema'
  derivedCampaign: string | null
  derivedOrigem: string
  dealsCount: number
} {
  const hmiDeal = deals.find(d => getProductGroup(d.titulo) === 'HMI')
  const primary = hmiDeal || deals[0]
  
  const productGroup = primary ? getProductGroup(primary.titulo) : 'Sistema'
  const rule = primary ? matchManualRule(primary.titulo) : null
  
  const derivedCampaign = 
    contact.firstUtmCampaign || 
    primary?.utmCampaign || 
    rule?.campaign || 
    null
    
  const rawOrigem = 
    contact.firstUtmSource || 
    primary?.utmSource || 
    rule?.origem || 
    contact.origem || 
    null
    
  const derivedOrigem = normalizeSourceLabel(rawOrigem || '')

  return {
    ...contact,
    productGroup,
    derivedCampaign,
    derivedOrigem,
    dealsCount: deals.length
  }
}
