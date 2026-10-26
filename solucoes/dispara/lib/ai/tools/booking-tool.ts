/**
 * Booking Tool for AI Agents
 *
 * Provides a tool that sends a WhatsApp Flow for calendar booking.
 * The Flow handles the entire booking experience visually, avoiding
 * AI hallucination about availability.
 */

import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { sendFlowMessage } from '@/lib/whatsapp-send'

// =============================================================================
// TYPES
// =============================================================================

export interface BookingPrerequisites {
  ready: boolean
  missing: string[]
  details: {
    hasGoogleCalendar: boolean
    hasPublishedFlow: boolean
    hasBookingFlowId: boolean
    hasCalendarConfig: boolean
    bookingFlowId: string | null
    metaFlowId: string | null
  }
}

export interface BookingConfig {
  /** Internal flow ID (from flows table) */
  flowId: string
  /** Meta Flow ID (for sending) */
  metaFlowId: string
  /** Body text for the flow message */
  bodyText: string
  /** CTA button text */
  ctaText: string
  /** Header text */
  headerText?: string
}

export interface SendBookingFlowResult {
  success: boolean
  messageId?: string
  error?: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SETTINGS_KEYS = {
  bookingFlowId: 'booking_flow_id',
  calendarTokens: 'google_calendar_tokens',
  calendarConfig: 'google_calendar_config',
  bookingConfig: 'calendar_booking_config',
} as const

const DEFAULT_BOOKING_TEXT = {
  body: 'Clique no botão abaixo para ver os horários disponíveis e agendar seu atendimento.',
  cta: 'Ver Horários',
  header: 'Agendamento',
}

// =============================================================================
// PREREQUISITES CHECK
// =============================================================================

/**
 * Check if all prerequisites for the booking tool are met.
 *
 * Prerequisites:
 * 1. Google Calendar connected (tokens exist)
 * 2. A Flow is published to Meta (has meta_flow_id)
 * 3. booking_flow_id is set in settings
 * 4. Calendar booking config exists (optional, has defaults)
 */
export async function checkBookingPrerequisites(): Promise<BookingPrerequisites> {
  const missing: string[] = []
  const details = {
    hasGoogleCalendar: false,
    hasPublishedFlow: false,
    hasBookingFlowId: false,
    hasCalendarConfig: false,
    bookingFlowId: null as string | null,
    metaFlowId: null as string | null,
  }

  if (!isSupabaseConfigured()) {
    return {
      ready: false,
      missing: ['Supabase não configurado'],
      details,
    }
  }

  try {
    // 1. Check Google Calendar tokens
    const tokensRaw = await settingsDb.get(SETTINGS_KEYS.calendarTokens)
    if (tokensRaw) {
      const tokens = JSON.parse(tokensRaw)
      details.hasGoogleCalendar = Boolean(tokens.accessToken || tokens.refreshToken)
    }
    if (!details.hasGoogleCalendar) {
      missing.push('Google Calendar não conectado')
    }

    // 2. Check if booking_flow_id is configured
    const bookingFlowId = await settingsDb.get(SETTINGS_KEYS.bookingFlowId)
    if (bookingFlowId) {
      details.bookingFlowId = bookingFlowId
      details.hasBookingFlowId = true

      // 3. Check if the flow is published (has meta_flow_id)
      const { data: flow } = await supabase
        .from('flows')
        .select('meta_flow_id, meta_status')
        .eq('id', bookingFlowId)
        .single()

      if (flow?.meta_flow_id) {
        details.metaFlowId = flow.meta_flow_id
        details.hasPublishedFlow = true
      } else {
        missing.push('Flow de agendamento não está publicado no Meta')
      }
    } else {
      missing.push('Nenhum Flow de agendamento configurado')
    }

    // 4. Check calendar booking config (optional)
    const configRaw = await settingsDb.get(SETTINGS_KEYS.bookingConfig)
    details.hasCalendarConfig = Boolean(configRaw)

  } catch (error) {
    console.error('[checkBookingPrerequisites] Error:', error)
    missing.push('Erro ao verificar pré-requisitos')
  }

  return {
    ready: missing.length === 0,
    missing,
    details,
  }
}

// =============================================================================
// GET BOOKING CONFIG
// =============================================================================

/**
 * Get the booking configuration including the Meta Flow ID.
 * Returns null if prerequisites are not met.
 */
export async function getBookingConfig(): Promise<BookingConfig | null> {
  const prereqs = await checkBookingPrerequisites()

  if (!prereqs.ready || !prereqs.details.metaFlowId || !prereqs.details.bookingFlowId) {
    return null
  }

  return {
    flowId: prereqs.details.bookingFlowId,
    metaFlowId: prereqs.details.metaFlowId,
    bodyText: DEFAULT_BOOKING_TEXT.body,
    ctaText: DEFAULT_BOOKING_TEXT.cta,
    headerText: DEFAULT_BOOKING_TEXT.header,
  }
}

// =============================================================================
// SEND BOOKING FLOW
// =============================================================================

/**
 * Send a booking flow message to a phone number.
 *
 * @param phoneNumber - Recipient phone number
 * @returns Result with success status and message ID
 */
export async function sendBookingFlow(phoneNumber: string): Promise<SendBookingFlowResult> {
  const config = await getBookingConfig()

  if (!config) {
    const prereqs = await checkBookingPrerequisites()
    return {
      success: false,
      error: `Agendamento não disponível: ${prereqs.missing.join(', ')}`,
    }
  }

  const result = await sendFlowMessage({
    to: phoneNumber,
    flowId: config.metaFlowId,
    bodyText: config.bodyText,
    ctaText: config.ctaText,
    headerText: config.headerText,
    flowAction: 'navigate',
  })

  return {
    success: result.success,
    messageId: result.messageId,
    error: result.error,
  }
}

// =============================================================================
// TOOL DEFINITION (for use with Vercel AI SDK)
// =============================================================================

/**
 * Tool description for AI agents.
 * This is used by the LLM to understand when to call the tool.
 */
export const BOOKING_TOOL_DESCRIPTION = `Envia o formulário de agendamento interativo para o cliente.
Use esta ferramenta quando o cliente:
- Quiser agendar um horário, consulta ou atendimento
- Perguntar sobre disponibilidade de agenda
- Quiser ver os horários disponíveis
- Mencionar que quer marcar/reservar algo

NÃO invente horários ou datas - deixe o formulário mostrar a disponibilidade real.`
