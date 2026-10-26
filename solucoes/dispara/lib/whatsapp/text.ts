/**
 * WhatsApp Text Message Builder
 */

import { TextMessagePayload } from './types'

export interface BuildTextMessageOptions {
  to: string
  text: string
  previewUrl?: boolean
  replyToMessageId?: string
}

/**
 * Build a text message payload
 */
export function buildTextMessage(options: BuildTextMessageOptions): TextMessagePayload {
  const payload: TextMessagePayload = {
    messaging_product: 'whatsapp',
    to: options.to,
    type: 'text',
    text: {
      body: options.text,
      preview_url: options.previewUrl ?? false,
    },
  }

  if (options.replyToMessageId) {
    payload.context = {
      message_id: options.replyToMessageId,
    }
  }

  return payload
}
