/**
 * FOTO QUE O WHATSAPP ACEITA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Medido em 14/09/2026: a foto do "Vestido Teste Petalas" foi cadastrada na
 * Nuvemshop em .webp, a Cloud API aceitou o envio (200, wamid) e DEPOIS
 * devolveu `failed` com o código 131053 "Media upload error". O WhatsApp só
 * aceita JPEG e PNG em mensagem de imagem. Resultado: a IA dizia "mandei a
 * foto", o CRM andava para "Viu produto", e a cliente não via nada.
 *
 * A saída: foto que não é JPEG/PNG passa por uma rota do próprio CRM que
 * converte para JPEG na hora. O link é assinado para ninguém usar o CRM como
 * conversor de imagem aberto, e só aceita a CDN da Nuvemshop.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

const HOSTS_PERMITIDOS = /(^|\.)(mitiendanube\.com|nuvemshop\.com\.br|tiendanube\.com)$/i

function segredo(): string {
  const s = process.env.JWT_SECRET || process.env.CRON_SECRET
  if (!s) throw new Error('sem JWT_SECRET/CRON_SECRET para assinar o link da foto')
  return s
}

function assinar(url: string): string {
  return createHmac('sha256', segredo()).update(`foto:${url}`).digest('hex').slice(0, 24)
}

export function fotoPrecisaConverter(url: string): boolean {
  return !/\.(jpe?g|png)(\?|#|$)/i.test(url)
}

export function hostPermitido(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === 'https:' || u.protocol === 'http:') && HOSTS_PERMITIDOS.test(u.hostname)
  } catch {
    return false
  }
}

/** O link que vai para a Meta: o original se já é JPEG/PNG, senão o conversor. */
export function linkDeFotoParaWhatsApp(url: string): string {
  if (!fotoPrecisaConverter(url) || !hostPermitido(url)) return url
  const base = (process.env.APP_URL || 'https://petalas.docelilium.com.br').replace(/\/+$/, '')
  const u = Buffer.from(url, 'utf8').toString('base64url')
  return `${base}/api/r/foto/${assinar(url)}/${u}.jpg`
}

/** Devolve a URL original se a assinatura confere e o host é da loja; senão null. */
export function conferirFoto(assinatura: string, codificada: string): string | null {
  const limpa = codificada.replace(/\.jpg$/i, '')
  let url: string
  try {
    url = Buffer.from(limpa, 'base64url').toString('utf8')
  } catch {
    return null
  }
  if (!hostPermitido(url)) return null
  const esperado = Buffer.from(assinar(url))
  const veio = Buffer.from(assinatura)
  return esperado.length === veio.length && timingSafeEqual(esperado, veio) ? url : null
}
