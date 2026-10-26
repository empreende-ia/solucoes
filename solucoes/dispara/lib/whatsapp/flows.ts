import type { InteractiveHeader } from './types'

export interface FlowActionPayload {
  screen?: string
  data?: Record<string, unknown>
}

export interface BuildFlowMessageOptions {
  to: string
  body: string
  flowId: string
  flowToken: string
  ctaText?: string
  action?: 'navigate' | 'data_exchange'
  actionPayload?: FlowActionPayload
  header?: InteractiveHeader
  footer?: string
  replyToMessageId?: string
  /**
   * Versão do contrato do Flow message.
   * Na prática, a Meta costuma usar 3 (ex.: "3").
   */
  flowMessageVersion?: string
}

export interface FlowInteractiveMessagePayload {
  messaging_product: 'whatsapp'
  to: string
  type: 'interactive'
  interactive: {
    type: 'flow'
    header?: InteractiveHeader
    body: { text: string }
    footer?: { text: string }
    action: {
      name: 'flow'
      parameters: {
        flow_message_version: string
        flow_id: string
        flow_token: string
        flow_cta: string
        flow_action: 'navigate' | 'data_exchange'
        flow_action_payload?: FlowActionPayload
      }
    }
  }
  context?: { message_id: string }
}

/**
 * Builder: mensagem interactive do tipo "flow" (WhatsApp Flows).
 *
 * Observação: este builder cobre o caso mais comum (navigate).
 * Para MVP "sem endpoint", o envio inicia o Flow e a submissão final chega via webhook (nfm_reply).
 */
export function buildFlowMessage(options: BuildFlowMessageOptions): FlowInteractiveMessagePayload {
  if (!options.flowId) throw new Error('flowId é obrigatório')
  if (!options.flowToken) throw new Error('flowToken é obrigatório')

  const payload: FlowInteractiveMessagePayload = {
    messaging_product: 'whatsapp',
    to: options.to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      body: { text: options.body },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: options.flowMessageVersion || '3',
          flow_id: options.flowId,
          flow_token: options.flowToken,
          flow_cta: options.ctaText || 'Abrir',
          flow_action: options.action || 'navigate',
          ...(options.actionPayload ? { flow_action_payload: options.actionPayload } : {}),
        },
      },
    },
  }

  if (options.header) payload.interactive.header = options.header

  if (options.footer) {
    if (options.footer.length > 60) throw new Error('Footer excede 60 caracteres')
    payload.interactive.footer = { text: options.footer }
  }

  if (options.replyToMessageId) payload.context = { message_id: options.replyToMessageId }

  return payload
}
