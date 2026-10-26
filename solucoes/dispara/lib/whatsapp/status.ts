/**
 * WhatsApp Status Message Builders
 * 
 * Builders for typing indicators and mark as read actions
 */

// =============================================================================
// TYPING INDICATOR
// =============================================================================

export interface TypingIndicatorPayload {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: 'typing'
  typing: {
    action: 'on' | 'off'
  }
}

export interface TypingIndicatorOptions {
  to: string
  action: 'on' | 'off'
}

/**
 * Build a typing indicator payload
 * 
 * Note: As of 2024, WhatsApp Cloud API doesn't officially support
 * typing indicators. This is a placeholder for when/if it becomes available.
 * Currently, the best practice is to send a message quickly.
 */
export function buildTypingIndicator(options: TypingIndicatorOptions): TypingIndicatorPayload {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: options.to,
    type: 'typing',
    typing: {
      action: options.action,
    },
  }
}

// =============================================================================
// MARK AS READ
// =============================================================================

export interface MarkAsReadPayload {
  messaging_product: 'whatsapp'
  status: 'read'
  message_id: string
}

export interface MarkAsReadOptions {
  messageId: string
}

/**
 * Build a mark as read payload
 * 
 * POST /{phone_number_id}/messages
 * This marks a message as read (double blue checkmarks)
 */
export function buildMarkAsRead(options: MarkAsReadOptions): MarkAsReadPayload {
  return {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: options.messageId,
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Send mark as read to WhatsApp
 * 
 * @param phoneNumberId - WhatsApp Business Phone Number ID
 * @param accessToken - WhatsApp Business Access Token
 * @param messageId - Message ID to mark as read
 */
export async function sendMarkAsRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<boolean> {
  try {
    const payload = buildMarkAsRead({ messageId })
    
    const response = await fetch(
      `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )
    
    if (!response.ok) {
      console.error('Failed to mark as read:', await response.text())
      return false
    }
    
    return true
  } catch (error) {
    console.error('Error marking as read:', error)
    return false
  }
}

/**
 * Simulates typing indicator by adding a delay before sending
 * 
 * WhatsApp doesn't support typing indicators directly, so we add
 * a small delay to simulate "thinking" time.
 * 
 * @param delayMs - Delay in milliseconds (default: 500-1500ms random)
 */
export async function simulateTypingDelay(delayMs?: number): Promise<void> {
  const delay = delayMs ?? (Math.random() * 1000 + 500) // 500-1500ms
  await new Promise(resolve => setTimeout(resolve, delay))
}
