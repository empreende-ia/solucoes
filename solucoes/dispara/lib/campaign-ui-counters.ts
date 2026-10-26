export type CounterSnapshot = {
  sent?: number | null
  delivered?: number | null
  read?: number | null
  failed?: number | null
}

export function computeCampaignUiCounters(input: {
  campaign: CounterSnapshot
  live?: CounterSnapshot | null
}): {
  sent: number
  /**
   * Entregues (não lidas): equivalente ao status atual `delivered`.
   * Útil para o card/filtro "Entregues".
   */
  delivered: number
  /** Total de entregues efetivos (inclui lidas). Útil para taxa de entrega. */
  deliveredTotal: number
  read: number
  failed: number
} {
  const campaignSent = Number(input.campaign.sent ?? 0)
  const campaignDelivered = Number(input.campaign.delivered ?? 0)
  const campaignRead = Number(input.campaign.read ?? 0)
  const campaignFailed = Number(input.campaign.failed ?? 0)

  const liveSent = Number(input.live?.sent ?? 0)
  const liveDelivered = Number(input.live?.delivered ?? 0)
  const liveRead = Number(input.live?.read ?? 0)
  const liveFailed = Number(input.live?.failed ?? 0)

  const sent = Math.max(campaignSent, liveSent)
  const read = Math.max(campaignRead, liveRead)
  // `campaign.delivered` e `live.delivered` historicamente representam "entregues totais" (inclui lidas).
  // Mantemos este valor para cálculo de taxa.
  const deliveredTotal = Math.max(campaignDelivered, liveDelivered, read)

  // Para o filtro/card "Entregues", queremos apenas quem ainda está em `delivered` (não inclui `read`).
  // Como `read` é um status separado e normalmente implica entrega, aproximamos como: deliveredTotal - read.
  const delivered = Math.max(0, deliveredTotal - read)
  const failed = Math.max(campaignFailed, liveFailed)

  return { sent, delivered, deliveredTotal, read, failed }
}
