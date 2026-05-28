import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface PDFExportData {
  overview: {
    created: number
    won: number
    lost: number
    receitaEmAberto: number
    ticketMedio: number
    taxaConversao: number
    avgAssignmentHours: number
  }
  stages: Array<{
    stageNome: string
    entradas: number
    countCurrent: number
    valueCurrent: number
    permanenciaMediaHoras: number
  }>
  sellers: Array<{
    sellerNome: string
    leadsAtribuidos: number
    dealsGanhos: number
    valorGanho: number
    dealsPerdidos: number
    conversao: number
    movimentacoesEtapa: number
  }>
  pipelines: Array<{
    pipelineNome: string
    avgAssignmentHours: number
    totalDeals: number
    distribuicaoPercent: number
  }>
  filters: {
    pipelineName: string
    periodLabel: string
    sellersLabel: string
  }
}

export function exportReportToPDF(data: PDFExportData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const formatBRL = (v: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  }

  const formatHours = (h: number) => {
    if (h < 1) {
      return `${Math.round(h * 60)} min`
    }
    return `${h.toFixed(1)}h`
  }

  // --- BRAND HEADER ---
  // Dark luxury premium header bar
  doc.setFillColor(10, 14, 23) // #0A0E17
  doc.rect(0, 0, 210, 35, 'F')

  // CRM Logo/Title
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('NETLIFE CRM', 15, 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(180, 180, 180)
  doc.text('Relatório Comercial e de Operação — Caixa Rápido', 15, 25)

  // Date and metadata on header right
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  const todayStr = new Date().toLocaleDateString('pt-BR')
  doc.text(`Gerado em: ${todayStr}`, 155, 15)
  doc.text(`Pipeline: ${data.filters.pipelineName}`, 155, 21)
  doc.text(`Período: ${data.filters.periodLabel}`, 155, 27)

  // --- FILTERS SUMMARY BAR ---
  doc.setFillColor(240, 243, 246)
  doc.rect(15, 40, 180, 12, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(60, 60, 60)
  doc.text(`Filtros Ativos: Vendedores (${data.filters.sellersLabel})`, 18, 47)

  // --- KPI GRID (3x2) ---
  const drawKpiCard = (x: number, y: number, w: number, h: number, title: string, value: string, color: [number, number, number] = [59, 130, 246]) => {
    // Background card
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(x, y, w, h, 2, 2, 'FD')

    // Colored accent strip
    doc.setFillColor(color[0], color[1], color[2])
    doc.rect(x, y, 1.5, h, 'F')

    // Title
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(100, 116, 139)
    doc.text(title, x + 5, y + 6)

    // Value
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text(value, x + 5, y + 15)
  }

  // Draw 6 cards
  const wonValueStr = formatBRL(data.overview.won * data.overview.ticketMedio)
  const ticketStr = formatBRL(data.overview.ticketMedio)
  const convStr = `${data.overview.taxaConversao.toFixed(1)}%`
  const assignStr = formatHours(data.overview.avgAssignmentHours)

  drawKpiCard(15, 57, 56, 20, 'NOVAS OPORTUNIDADES', String(data.overview.created), [59, 130, 246])
  drawKpiCard(77, 57, 56, 20, 'NEGÓCIOS GANHOS', String(data.overview.won), [16, 185, 129])
  drawKpiCard(139, 57, 56, 20, 'NEGÓCIOS PERDIDOS', String(data.overview.lost), [239, 68, 68])

  drawKpiCard(15, 81, 56, 20, 'RECEITA GANHA', wonValueStr, [16, 185, 129])
  drawKpiCard(77, 81, 56, 20, 'TICKET MÉDIO', ticketStr, [99, 102, 241])
  drawKpiCard(139, 81, 56, 20, 'CONVERSÃO COMERCIAL', convStr, [245, 158, 11])

  // Subtitle assignments
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text(`Tempo Médio de Atribuição (SLA): ${assignStr}`, 15, 110)

  // --- STAGE FUNNEL TABLE ---
  doc.setFontSize(11)
  doc.text('Funil de Vendas (Etapas)', 15, 120)

  autoTable(doc, {
    startY: 124,
    margin: { left: 15, right: 15 },
    head: [['Etapa', 'Entradas no Período', 'Volume Atual (Qtd)', 'Volume Atual (Valor)', 'Permanência Média']],
    body: data.stages.map(s => [
      s.stageNome,
      String(s.entradas),
      String(s.countCurrent),
      formatBRL(s.valueCurrent),
      formatHours(s.permanenciaMediaHoras)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [10, 14, 23], halign: 'left', fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'center' }
    }
  })

  // --- SELLER PERFORMANCE TABLE ---
  let finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 180

  if (finalY > 210) {
    doc.addPage()
    finalY = 20
  } else {
    finalY += 12
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text('Performance por Vendedor', 15, finalY)

  autoTable(doc, {
    startY: finalY + 4,
    margin: { left: 15, right: 15 },
    head: [['Vendedor', 'Atribuídos (Qtd)', 'Ganhos (Qtd)', 'Valor Ganho', 'Perdidos (Qtd)', 'Conversão', 'Movimentações']],
    body: data.sellers.map(s => [
      s.sellerNome,
      String(s.leadsAtribuidos),
      String(s.dealsGanhos),
      formatBRL(s.valorGanho),
      String(s.dealsPerdidos),
      `${s.conversao.toFixed(1)}%`,
      String(s.movimentacoesEtapa)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [10, 14, 23], halign: 'left', fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'center' },
      5: { halign: 'center' },
      6: { halign: 'center' }
    }
  })

  // --- COMPARISON BY PIPELINE ---
  finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 240
  if (finalY > 210) {
    doc.addPage()
    finalY = 20
  } else {
    finalY += 12
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text('Comparativo de Oportunidades por Pipeline', 15, finalY)

  autoTable(doc, {
    startY: finalY + 4,
    margin: { left: 15, right: 15 },
    head: [['Pipeline/Funil', 'Total Oportunidades', 'Distribuição %', 'SLA Médio Atribuição']],
    body: data.pipelines.map(p => [
      p.pipelineNome,
      String(p.totalDeals),
      `${p.distribuicaoPercent.toFixed(1)}%`,
      formatHours(p.avgAssignmentHours)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [10, 14, 23], halign: 'left', fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' }
    }
  })

  // --- FOOTER PAGE NUMBERS ---
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`Página ${i} de ${pageCount}`, 105, 287, { align: 'center' })
    doc.text('NetLife CRM — Operação Caixa Rápido', 15, 287)
  }

  // Save the PDF
  const todayCompact = todayStr.replace(/\//g, '-')
  doc.save(`Relatorio_Comercial_${data.filters.pipelineName.replace(/\s+/g, '_')}_${todayCompact}.pdf`)
}
