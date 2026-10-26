'use server'

import { cache } from 'react'
import { createClient } from '@/lib/supabase-server'
import { hasOwnerPrincipal } from '@/lib/server-principal'
import type { DashboardStats, ChartDataPoint } from '@/services/dashboardService'
import type { Campaign } from '@/types'

/**
 * Busca dados do dashboard no servidor (RSC).
 * Executa queries em paralelo para stats e campanhas recentes.
 * Usa cache() para deduplicação per-request (evita queries duplicadas no mesmo render).
 * Sem principal de dono devolve null (o client busca pelas APIs).
 */
export const getDashboardData = cache(async (): Promise<{
  stats: DashboardStats
  recentCampaigns: Campaign[]
} | null> => {
  // Defesa em profundidade: sem principal de dono (ex.: modo degradado com banco
  // fora), não consulta o banco — a página renderiza só o shell.
  if (!(await hasOwnerPrincipal())) return null

  const supabase = await createClient()

  // Buscar stats agregados e campanhas recentes em PARALELO
  const [statsResult, campaignsResult, allCampaignsResult] = await Promise.all([
    // Stats agregados
    supabase
      .from('campaigns')
      .select('sent, delivered, read, failed, status')
      .not('status', 'eq', 'Rascunho'),

    // Campanhas recentes (top 5)
    supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5),

    // Todas campanhas para chart (últimos 30 dias)
    supabase
      .from('campaigns')
      .select('sent, delivered, read, failed, status, created_at, started_at, last_sent_at, total_recipients')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  ])

  // Calcular stats agregados
  const campaigns = statsResult.data || []
  let totalSent = 0
  let totalDelivered = 0
  let totalFailed = 0
  let activeCampaigns = 0

  campaigns.forEach((c) => {
    totalSent += c.sent || 0
    totalDelivered += c.delivered || 0
    totalFailed += c.failed || 0
    if (c.status === 'Enviando' || c.status === 'Agendado') {
      activeCampaigns++
    }
  })

  const deliveryRate = totalSent > 0
    ? Math.round((totalDelivered / totalSent) * 100)
    : 0

  // Gerar chartData dos últimos 30 dias
  const chartData = generateChartData(allCampaignsResult.data || [])

  // Mapear campanhas recentes para formato esperado
  const recentCampaigns = (campaignsResult.data || []).map(mapCampaignFromDb)

  return {
    stats: {
      sent24h: totalSent.toLocaleString('pt-BR'),
      deliveryRate: `${deliveryRate}%`,
      activeCampaigns: activeCampaigns.toString(),
      failedMessages: totalFailed.toString(),
      chartData
    },
    recentCampaigns
  }
})

/**
 * Gera dados do gráfico para os últimos 30 dias
 */
function generateChartData(campaigns: any[]): ChartDataPoint[] {
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 29)
  start.setHours(0, 0, 0, 0)

  const bucket = new Map<string, ChartDataPoint>()

  // Inicializar bucket com zeros
  for (let i = 0; i < 30; i++) {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    const key = day.toISOString().slice(0, 10)
    bucket.set(key, { name: '', sent: 0, read: 0, delivered: 0, failed: 0, active: 0 })
  }

  // Agregar dados das campanhas
  campaigns.forEach((campaign) => {
    const rawDate = campaign.last_sent_at || campaign.started_at || campaign.created_at
    if (!rawDate) return

    const date = new Date(rawDate)
    if (Number.isNaN(date.getTime())) return

    const key = date.toISOString().slice(0, 10)
    const entry = bucket.get(key)
    if (!entry) return

    entry.sent += campaign.sent || campaign.total_recipients || 0
    entry.read += campaign.read || 0
    entry.delivered += campaign.delivered || 0
    entry.failed += campaign.failed || 0

    if (campaign.status === 'Enviando' || campaign.status === 'Agendado') {
      entry.active += 1
    }
  })

  // Converter para array com formatação de data
  return Array.from(bucket.entries()).map(([key, value]) => {
    const [, month, day] = key.split('-')
    return {
      name: `${day}/${month}`,
      sent: value.sent,
      read: value.read,
      delivered: value.delivered,
      failed: value.failed,
      active: value.active
    }
  })
}

/**
 * Mapeia campanha do formato DB para formato da aplicação
 */
function mapCampaignFromDb(dbCampaign: any): Campaign {
  return {
    id: dbCampaign.id,
    name: dbCampaign.name,
    templateName: dbCampaign.template_name || '',
    status: dbCampaign.status,
    recipients: dbCampaign.total_recipients || 0,
    sent: dbCampaign.sent || 0,
    delivered: dbCampaign.delivered || 0,
    read: dbCampaign.read || 0,
    skipped: dbCampaign.skipped || 0,
    failed: dbCampaign.failed || 0,
    createdAt: dbCampaign.created_at,
    startedAt: dbCampaign.started_at,
    completedAt: dbCampaign.completed_at,
    scheduledAt: dbCampaign.scheduled_at,
    lastSentAt: dbCampaign.last_sent_at,
    folderId: dbCampaign.folder_id,
    tags: []
  }
}
