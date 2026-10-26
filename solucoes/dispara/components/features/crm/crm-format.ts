import { formatPhoneNumberDisplay } from '@/lib/phone-formatter'
import type { Opportunity } from '@/services/crmService'

/** Formatador de moeda BRL (pt-BR) */
const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/** Formata um valor numérico em BRL (ex.: R$ 1.234,56) */
export function formatBRL(value: number): string {
  return brlFormatter.format(value)
}

/** Rótulo de exibição do contato da oportunidade (nome > telefone formatado) */
export function getOpportunityContactLabel(opportunity: Opportunity): string | null {
  if (opportunity.contactName) return opportunity.contactName
  const phone = opportunity.contactPhone || opportunity.phone
  if (phone) return formatPhoneNumberDisplay(phone)
  return null
}
