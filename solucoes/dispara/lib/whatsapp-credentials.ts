import { settingsDb } from '@/lib/supabase-db'

/**
 * WhatsApp Credentials Helper
 *
 * Centraliza gerenciamento de credenciais usando apenas Supabase Settings.
 * Credenciais são configuradas via UI no onboarding pós-instalação.
 */

export interface WhatsAppCredentials {
  phoneNumberId: string
  businessAccountId: string
  accessToken: string
  displayPhoneNumber?: string
  verifiedName?: string
}

/**
 * Get WhatsApp credentials from database
 *
 * Fonte única: Supabase Settings (configurado via UI)
 */
export async function getWhatsAppCredentials(): Promise<WhatsAppCredentials | null> {
  try {
    const settings = await settingsDb.getAll()

    const { phoneNumberId, businessAccountId, accessToken } = settings

    if (phoneNumberId && businessAccountId && accessToken) {
      return {
        phoneNumberId,
        businessAccountId,
        accessToken,
      }
    }

    return null
  } catch (error) {
    console.error('Error fetching WhatsApp credentials:', error)
    return null
  }
}

/**
 * Check if WhatsApp is configured
 */
export async function isWhatsAppConfigured(): Promise<boolean> {
  const credentials = await getWhatsAppCredentials()
  return credentials !== null
}

/**
 * Check if WhatsApp is connected (credentials exist and isConnected flag is true)
 */
export async function isWhatsAppConnected(): Promise<boolean> {
  try {
    const settings = await settingsDb.getAll()
    return settings.isConnected && Boolean(settings.phoneNumberId && settings.accessToken)
  } catch {
    return false
  }
}
