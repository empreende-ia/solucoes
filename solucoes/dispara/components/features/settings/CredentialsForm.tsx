'use client'

import React, { forwardRef, useState, useCallback, useEffect } from 'react'
import { Container } from '@/components/ui/container'
import { SectionHeader } from '@/components/ui/section-header'
import { WhatsAppCredentialsForm, type WhatsAppCredentials } from '@/components/shared/WhatsAppCredentialsForm'
import { saveMetaAppConfigWithFeedback } from '@/components/shared/save-meta-app-config'
import type { AppSettings } from '../../../types'
import type { MetaAppInfo } from './types'

interface CredentialsFormProps {
  settings: AppSettings
  setSettings: (settings: AppSettings) => void
  onSave: () => void
  onClose: () => void
  isSaving: boolean
  onTestConnection?: () => void
  isTestingConnection?: boolean
  metaApp?: MetaAppInfo | null
  refreshMetaApp?: () => void
}

/**
 * Formulário de credenciais WhatsApp para a página de configurações.
 *
 * Usa o componente centralizado WhatsAppCredentialsForm e adiciona:
 * - Container visual com estilo glass
 * - Integração com o sistema de settings do Dispara
 * - Salvamento de Meta App ID junto com credenciais principais
 */
export const CredentialsForm = forwardRef<HTMLDivElement, CredentialsFormProps>(
  (
    {
      settings,
      setSettings,
      onSave,
      onClose,
      isSaving,
      onTestConnection,
      isTestingConnection,
      metaApp,
      refreshMetaApp,
    },
    ref
  ) => {
    const [localIsSaving, setLocalIsSaving] = useState(false)

    // Estado local para Meta App (não faz parte do settings principal)
    const [metaAppIdLocal, setMetaAppIdLocal] = useState(metaApp?.appId || '')
    const [metaAppSecretLocal, setMetaAppSecretLocal] = useState('')

    // Sincroniza com metaApp externo
    useEffect(() => {
      setMetaAppIdLocal(metaApp?.appId || '')
    }, [metaApp?.appId])

    // Monta os valores para o formulário centralizado
    const credentialsValues: WhatsAppCredentials = {
      phoneNumberId: settings.phoneNumberId || '',
      businessAccountId: settings.businessAccountId || '',
      accessToken: settings.accessToken || '',
      metaAppId: metaAppIdLocal,
      metaAppSecret: metaAppSecretLocal,
    }

    // Handler para mudança de valores
    const handleChange = useCallback(
      (values: WhatsAppCredentials) => {
        // Atualiza settings principal (phoneNumberId, businessAccountId, accessToken)
        setSettings({
          ...settings,
          phoneNumberId: values.phoneNumberId,
          businessAccountId: values.businessAccountId,
          accessToken: values.accessToken,
        })

        // Atualiza estado local do Meta App
        setMetaAppIdLocal(values.metaAppId || '')
        setMetaAppSecretLocal(values.metaAppSecret || '')
      },
      [settings, setSettings]
    )

    // Handler para salvar
    const handleSave = async () => {
      try {
        setLocalIsSaving(true)

        // Salva credenciais principais
        await onSave()
        onClose()

        // Best-effort: salva Meta App ID junto, sem bloquear o salvamento do WhatsApp
        const nextAppId = metaAppIdLocal.trim()
        const nextAppSecret = metaAppSecretLocal.trim()
        const currentAppId = String(metaApp?.appId || '').trim()

        // Se mudou o App ID ou temos um novo secret. Não bloqueia o fluxo principal.
        // Recarrega mesmo em erro: um App Secret recusado pode ter descartado o App ID
        // também, e o campo deve mostrar o estado real do servidor (não o valor
        // digitado, que some no reload).
        if (nextAppId && (nextAppId !== currentAppId || nextAppSecret)) {
          void saveMetaAppConfigWithFeedback({
            appId: nextAppId,
            appSecret: nextAppSecret || '', // Mantém vazio se não fornecido
          }).then(() => {
            refreshMetaApp?.()
          })
        }
      } catch {
        // Erro já tratado no hook, não fecha o formulário
      } finally {
        setLocalIsSaving(false)
      }
    }

    return (
      <div ref={ref} className="scroll-mt-24">
        <Container
          variant="glass"
          padding="lg"
          className="animate-in slide-in-from-top-4 duration-300"
        >
          <SectionHeader title="Configuração da API" color="brand" showIndicator={true} />

          <div className="mt-6">
            <WhatsAppCredentialsForm
              values={credentialsValues}
              onChange={handleChange}
              onSave={handleSave}
              showMetaApp={true}
              showAppSecret={true}
              hasAppSecretSaved={metaApp?.hasAppSecret ?? false}
              showValidateButton={true}
              showSaveButton={true}
              showTestButton={true}
              showHelpLink={true}
              saveButtonText="Salvar Config"
              isSaving={isSaving || localIsSaving}
              isTesting={isTestingConnection}
              variant="default"
            />
          </div>
        </Container>
      </div>
    )
  }
)

CredentialsForm.displayName = 'CredentialsForm'
