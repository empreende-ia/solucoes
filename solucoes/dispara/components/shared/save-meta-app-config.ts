import { toast } from 'sonner'
import { settingsService } from '@/services/settingsService'

/**
 * Salva App ID/App Secret da Meta e mostra o resultado ao usuário (onboarding e
 * Configurações).
 *
 * Nunca lança: o Meta App é complementar às credenciais do WhatsApp e não deve
 * interromper o fluxo — mas a falha não pode sumir no console. Um App Secret
 * recusado pela Graph volta como 400 com uma mensagem que diz se o App ID foi
 * salvo (o upload de mídia de template depende dele); o `warning` aparece quando
 * não deu para validar o secret com a Meta (salvo em verificação).
 *
 * @returns true se a API aceitou o salvamento.
 */
export async function saveMetaAppConfigWithFeedback(data: { appId: string; appSecret: string }): Promise<boolean> {
  try {
    const result = await settingsService.saveMetaAppConfig(data)
    if (result.warning) toast.warning(result.warning)
    return true
  } catch (error) {
    console.warn('Falha ao salvar Meta App config:', error)
    toast.error(
      error instanceof Error && error.message
        ? error.message
        : 'Falha ao salvar o App ID/App Secret da Meta. Confira em Configurações.'
    )
    return false
  }
}
