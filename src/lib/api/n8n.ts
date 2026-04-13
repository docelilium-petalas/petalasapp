const N8N_WEBHOOK_DEFAULT = process.env.N8N_WEBHOOK_URL || 'https://auto.devnetlife.com/webhook/docelilium'

export function triggerVideoN8N(params: {
  video_id: string
  service_name: string
  service_description: string
  imageBuffer?: Buffer
  imageType?: string
  imageName?: string
  webhookUrl?: string   // URL customizada do usuário — sobrescreve a padrão
}): void {
  const url = params.webhookUrl || N8N_WEBHOOK_DEFAULT

  const formData = new FormData()
  // Campos com os nomes que o n8n espera
  formData.append('videoId', params.video_id)
  formData.append('nomeProduto', params.service_name)

  if (params.imageBuffer) {
    const blob = new Blob([params.imageBuffer], { type: params.imageType || 'image/png' })
    formData.append('image', blob, params.imageName || 'logo.png')
  }

  // Dispara sem aguardar — n8n processará e chamará o callback quando terminar
  fetch(url, {
    method: 'POST',
    body: formData,
  }).catch(err => console.error('n8n trigger error:', err))
}
