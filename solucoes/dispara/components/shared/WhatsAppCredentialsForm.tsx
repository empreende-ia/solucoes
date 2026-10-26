'use client'

import { useState, useCallback, useEffect } from 'react'
import { HelpCircle, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, ExternalLink, RefreshCw, Save } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PermissionStatusView } from './PermissionStatusView'
import type { PermissionValidationResult } from '@/app/api/settings/validate-permissions/route'

// =============================================================================
// TYPES
// =============================================================================

export interface WhatsAppCredentials {
  phoneNumberId: string
  businessAccountId: string
  accessToken: string
  metaAppId?: string
  metaAppSecret?: string
}

export interface WhatsAppCredentialsFormProps {
  /** Valores atuais das credenciais */
  values: WhatsAppCredentials
  /** Callback quando os valores mudam */
  onChange: (values: WhatsAppCredentials) => void
  /** Callback quando validação é solicitada */
  onValidate?: () => Promise<void>
  /** Callback quando o usuário quer salvar */
  onSave?: () => Promise<void>
  /** Callback quando conexão é testada com sucesso */
  onTestSuccess?: (info: { displayPhoneNumber?: string; verifiedName?: string }) => void
  /** Callback para quando o usuário quer continuar após validação */
  onContinue?: () => void

  // Opções de exibição
  /** Mostrar campos de Meta App (default: true) */
  showMetaApp?: boolean
  /** Mostrar campo de App Secret (default: true) */
  showAppSecret?: boolean
  /** Indica que o App Secret já está salvo no banco (mostra indicador visual) */
  hasAppSecretSaved?: boolean
  /** Mostrar botão de validar permissões (default: true) */
  showValidateButton?: boolean
  /** Mostrar botão de salvar (default: false - geralmente controlado externamente) */
  showSaveButton?: boolean
  /** Mostrar botão de testar conexão (default: true) */
  showTestButton?: boolean
  /** Mostrar link de ajuda (default: true) */
  showHelpLink?: boolean
  /** Texto customizado do botão de salvar */
  saveButtonText?: string
  /** Texto customizado do botão de continuar após validação bem sucedida */
  continueButtonText?: string

  // Estado externo (opcional - para controle do componente pai)
  /** Estado de validação de permissões */
  isValidating?: boolean
  /** Estado de salvamento */
  isSaving?: boolean
  /** Estado de teste de conexão */
  isTesting?: boolean
  /** Resultado da validação de permissões */
  validationResult?: PermissionValidationResult | null
  /** Informações após teste de conexão bem sucedido */
  connectionInfo?: { displayPhoneNumber?: string; verifiedName?: string } | null
  /** Erro de conexão */
  connectionError?: { title: string; description: string } | null

  // Layout
  /** Estilo do container */
  variant?: 'default' | 'compact' | 'minimal'
  /** Classes CSS adicionais */
  className?: string
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Sanitiza o access token removendo caracteres não-ASCII que podem
 * causar erro "ByteString" ao fazer requests HTTP.
 */
function sanitizeAccessToken(value: string): string {
  // Remove caracteres não-ASCII (inclui emojis, caracteres de formatação, etc.)
  // eslint-disable-next-line no-control-regex
  return value.replace(/[^\x00-\x7F]/g, '').replace(/\s/g, '').trim()
}

/**
 * Traduz erros técnicos em mensagens amigáveis para o usuário.
 */
function getUserFriendlyError(error: any): { title: string; description: string } {
  const msg = String(error?.message || '').toLowerCase()

  if (msg.includes('bytestring') || msg.includes('character at index')) {
    return {
      title: 'Token contém caracteres inválidos',
      description: 'O token parece ter caracteres especiais ou emojis. Tente copiar novamente direto do Meta Business Manager.',
    }
  }

  if (msg.includes('bad signature') || msg.includes('signature') || msg.includes('malformed')) {
    return {
      title: 'Token corrompido ou incompleto',
      description: 'O token não está completo. Copie novamente do Meta Business Manager, garantindo que copiou o token inteiro.',
    }
  }

  if (msg.includes('token') && (msg.includes('invalid') || msg.includes('expired') || msg.includes('expirado'))) {
    return {
      title: 'Token inválido ou expirado',
      description: 'Gere um novo token no Meta Business Manager. Dica: use um System User Token para não expirar.',
    }
  }

  if (msg.includes('unsupported get') || msg.includes('does not exist') || msg.includes('no permission')) {
    return {
      title: 'ID incorreto ou sem permissão',
      description: 'Verifique se o Phone Number ID está correto e se o token tem acesso a este número.',
    }
  }

  if (msg.includes('deactivated') || msg.includes('archived')) {
    return {
      title: 'App Meta desativado',
      description: 'O App no Meta foi arquivado. Acesse developers.facebook.com e reative seu App.',
    }
  }

  return {
    title: 'Credenciais inválidas',
    description: 'Verifique se os dados foram copiados corretamente do Meta Business Manager.',
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Componente centralizado para coletar credenciais WhatsApp.
 *
 * Consolida a coleta de:
 * - Phone Number ID
 * - Business Account ID (WABA)
 * - Access Token
 * - Meta App ID (opcional)
 * - Meta App Secret (opcional)
 *
 * Inclui:
 * - Validação de permissões do token
 * - Teste de conexão com a Meta API
 * - Mensagens de erro amigáveis
 * - Sanitização automática do token
 */
export function WhatsAppCredentialsForm({
  values,
  onChange,
  onValidate,
  onSave,
  onTestSuccess,
  onContinue,
  showMetaApp = true,
  showAppSecret = true,
  hasAppSecretSaved = false,
  showValidateButton = true,
  showSaveButton = false,
  showTestButton = true,
  showHelpLink = true,
  saveButtonText = 'Salvar',
  continueButtonText = 'Continuar',
  isValidating: externalIsValidating,
  isSaving: externalIsSaving,
  isTesting: externalIsTesting,
  validationResult: externalValidationResult,
  connectionInfo: externalConnectionInfo,
  connectionError: externalConnectionError,
  variant = 'default',
  className,
}: WhatsAppCredentialsFormProps) {
  // Estado interno (usado quando não controlado externamente)
  const [internalIsTesting, setInternalIsTesting] = useState(false)
  const [internalIsValidating, setInternalIsValidating] = useState(false)
  const [internalIsSaving, setInternalIsSaving] = useState(false)
  const [internalConnectionInfo, setInternalConnectionInfo] = useState<{
    displayPhoneNumber?: string
    verifiedName?: string
  } | null>(null)
  const [internalConnectionError, setInternalConnectionError] = useState<{
    title: string
    description: string
  } | null>(null)
  const [internalValidationResult, setInternalValidationResult] = useState<PermissionValidationResult | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  // Decide se usa estado interno ou externo
  const isTesting = externalIsTesting ?? internalIsTesting
  const isValidating = externalIsValidating ?? internalIsValidating
  const isSaving = externalIsSaving ?? internalIsSaving
  const connectionInfo = externalConnectionInfo ?? internalConnectionInfo
  const connectionError = externalConnectionError ?? internalConnectionError
  const validationResult = externalValidationResult ?? internalValidationResult

  // Verifica se os campos obrigatórios estão preenchidos
  const canTest = Boolean(
    values.phoneNumberId?.trim() &&
    values.businessAccountId?.trim() &&
    values.accessToken?.trim()
  )

  // Verifica se pode validar permissões (precisa de Meta App configurado)
  const appSecretValue = values.metaAppSecret || (hasAppSecretSaved ? '***configured***' : '')
  const canValidatePermissions = Boolean(
    values.accessToken?.trim() &&
    values.metaAppId?.trim() &&
    appSecretValue.trim()
  )

  // Handler para mudança de campo
  const handleFieldChange = useCallback(
    (field: keyof WhatsAppCredentials, value: string) => {
      // Sanitiza token automaticamente
      const sanitizedValue = field === 'accessToken' ? sanitizeAccessToken(value) : value

      onChange({
        ...values,
        [field]: sanitizedValue,
      })

      // Limpa erros quando usuário edita
      if (externalConnectionError === undefined) {
        setInternalConnectionError(null)
      }
      if (externalConnectionInfo === undefined) {
        setInternalConnectionInfo(null)
      }
      if (externalValidationResult === undefined) {
        setInternalValidationResult(null)
      }
    },
    [values, onChange, externalConnectionError, externalConnectionInfo, externalValidationResult]
  )

  // Handler para testar conexão
  const handleTestConnection = useCallback(async () => {
    if (!canTest) return

    if (externalIsTesting === undefined) setInternalIsTesting(true)
    setInternalConnectionError(null)
    setInternalConnectionInfo(null)

    try {
      const res = await fetch('/api/settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: values.phoneNumberId.trim(),
          businessAccountId: values.businessAccountId.trim(),
          accessToken: sanitizeAccessToken(values.accessToken),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || data.details || 'Falha ao testar conexão')
      }

      const info = {
        displayPhoneNumber: data.displayPhoneNumber || undefined,
        verifiedName: data.verifiedName || undefined,
      }

      if (externalConnectionInfo === undefined) {
        setInternalConnectionInfo(info)
      }

      onTestSuccess?.(info)

      toast.success('Conexão válida!', {
        description: info.verifiedName
          ? `${info.displayPhoneNumber} • ${info.verifiedName}`
          : info.displayPhoneNumber,
      })
    } catch (error: any) {
      const friendlyError = getUserFriendlyError(error)
      if (externalConnectionError === undefined) {
        setInternalConnectionError(friendlyError)
      }
      toast.error(friendlyError.title, {
        description: friendlyError.description,
      })
    } finally {
      if (externalIsTesting === undefined) setInternalIsTesting(false)
    }
  }, [canTest, values, onTestSuccess, externalIsTesting, externalConnectionInfo, externalConnectionError])

  // Handler para validar permissões
  const handleValidatePermissions = useCallback(async () => {
    if (!canValidatePermissions) {
      toast.error('Configure o Meta App ID e Secret primeiro')
      return
    }

    if (externalIsValidating === undefined) setInternalIsValidating(true)

    try {
      const res = await fetch('/api/settings/validate-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: sanitizeAccessToken(values.accessToken),
          appId: values.metaAppId?.trim(),
          appSecret: values.metaAppSecret?.trim(),
        }),
      })

      const result: PermissionValidationResult = await res.json()

      if (externalValidationResult === undefined) {
        setInternalValidationResult(result)
      }

      if (result.valid) {
        toast.success('Permissões OK!', {
          description: 'Token tem todas as permissões necessárias',
        })
      } else if (result.error) {
        toast.error('Erro na validação', {
          description: result.error,
        })
      } else {
        toast.warning('Permissões incompletas', {
          description: `Faltando: ${result.missing.join(', ')}`,
        })
      }

      await onValidate?.()
    } catch (error: any) {
      toast.error('Erro ao validar permissões', {
        description: error.message,
      })
    } finally {
      if (externalIsValidating === undefined) setInternalIsValidating(false)
    }
  }, [canValidatePermissions, values, onValidate, externalIsValidating, externalValidationResult])

  // Handler para salvar
  const handleSave = useCallback(async () => {
    if (externalIsSaving === undefined) setInternalIsSaving(true)

    try {
      await onSave?.()
      toast.success('Configurações salvas!')
    } catch (error: any) {
      toast.error('Erro ao salvar', {
        description: error.message,
      })
    } finally {
      if (externalIsSaving === undefined) setInternalIsSaving(false)
    }
  }, [onSave, externalIsSaving])

  // Determina se mostra o status de validação
  const showValidationStatus = validationResult !== null

  // Determina se a conexão foi bem sucedida
  const isConnectionValid = connectionInfo !== null && !connectionError

  return (
    <div className={cn('space-y-6', className)}>
      {/* Campos principais */}
      <div className={cn(
        'space-y-4',
        variant === 'compact' && 'space-y-3',
        variant === 'minimal' && 'space-y-2'
      )}>
        {/* Phone Number ID */}
        <div className="space-y-2">
          <Label htmlFor="phoneNumberId" className="flex items-center gap-2">
            Identificação do número de telefone (Phone Number ID)
            <span className="text-red-400">*</span>
            <span title="Encontrado em: App Dashboard → WhatsApp → API Setup">
              <HelpCircle className="w-4 h-4 text-[var(--ds-text-muted)] cursor-help" />
            </span>
          </Label>
          <Input
            id="phoneNumberId"
            placeholder="Ex: 123456789012345"
            value={values.phoneNumberId}
            onChange={(e) => handleFieldChange('phoneNumberId', e.target.value)}
            disabled={isTesting || isSaving}
            className="font-mono"
          />
          {variant !== 'minimal' && (
            <p className="text-xs text-[var(--ds-text-muted)]">
              Encontrado em: App Dashboard → WhatsApp → API Setup
            </p>
          )}
        </div>

        {/* Business Account ID */}
        <div className="space-y-2">
          <Label htmlFor="businessAccountId" className="flex items-center gap-2">
            Identificação da conta do WhatsApp Business (WABA ID)
            <span className="text-red-400">*</span>
          </Label>
          <Input
            id="businessAccountId"
            placeholder="Ex: 987654321098765"
            value={values.businessAccountId}
            onChange={(e) => handleFieldChange('businessAccountId', e.target.value)}
            disabled={isTesting || isSaving}
            className="font-mono"
          />
          {variant !== 'minimal' && (
            <p className="text-xs text-[var(--ds-text-muted)]">
              Encontrado em: App Dashboard → WhatsApp → API Setup
            </p>
          )}
        </div>

        {/* Access Token */}
        <div className="space-y-2">
          <Label htmlFor="accessToken" className="flex items-center gap-2">
            Token de acesso
            <span className="text-red-400">*</span>
          </Label>
          <div className="relative">
            <Input
              id="accessToken"
              type={showToken ? 'text' : 'password'}
              placeholder="EAAG..."
              value={values.accessToken}
              onChange={(e) => handleFieldChange('accessToken', e.target.value)}
              disabled={isTesting || isSaving}
              className="font-mono pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)] transition-colors"
              tabIndex={-1}
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {variant !== 'minimal' && (
            <p className="text-xs text-[var(--ds-text-muted)]">
              💡 Use um System User Token para não expirar
            </p>
          )}
        </div>

        {/* Meta App ID (opcional) */}
        {showMetaApp && (
          <div className="space-y-2">
            <Label htmlFor="metaAppId" className="flex items-center gap-2">
              ID do Aplicativo (Meta App ID)
              <span title="Encontrado em: developers.facebook.com → Seu App → Configurações → Básico">
                <HelpCircle className="w-4 h-4 text-[var(--ds-text-muted)] cursor-help" />
              </span>
            </Label>
            <Input
              id="metaAppId"
              placeholder="Ex: 123456789012345"
              value={values.metaAppId || ''}
              onChange={(e) => handleFieldChange('metaAppId', e.target.value)}
              disabled={isTesting || isSaving}
              className="font-mono"
            />
            {variant !== 'minimal' && (
              <p className="text-xs text-[var(--ds-text-muted)]">
                Necessário para templates com imagem/vídeo e validação de permissões
              </p>
            )}
          </div>
        )}

        {/* Meta App Secret (opcional) */}
        {showMetaApp && showAppSecret && (
          <div className="space-y-2">
            <Label htmlFor="metaAppSecret" className="flex items-center gap-2">
              Chave Secreta do Aplicativo (App Secret)
            </Label>
            <div className="relative">
              <Input
                id="metaAppSecret"
                type={showSecret ? 'text' : 'password'}
                placeholder="••••••••••••••••"
                value={values.metaAppSecret || (hasAppSecretSaved ? '***configured***' : '')}
                onChange={(e) => {
                  // Se o usuário começa a digitar, limpa o placeholder
                  const newValue = e.target.value === '***configured***' ? '' : e.target.value
                  handleFieldChange('metaAppSecret', newValue)
                }}
                disabled={isTesting || isSaving}
                className="font-mono pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)] transition-colors"
                tabIndex={-1}
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {variant !== 'minimal' && (
              <p className="text-xs text-[var(--ds-text-muted)]">
                Necessário para validação de permissões. Encontre em: developers.facebook.com → Seu App → Configurações → Básico
              </p>
            )}
          </div>
        )}
      </div>

      {/* Erro de conexão */}
      {connectionError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="text-red-200 font-medium">{connectionError.title}</p>
              <p className="text-red-200/70">{connectionError.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sucesso de conexão */}
      {isConnectionValid && !showValidationStatus && (
        <div className="p-3 rounded-lg bg-primary-500/10 border border-primary-500/20">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary-500 mt-0.5" />
            <div className="text-sm">
              <p className="text-primary-200 font-medium">Conexão válida</p>
              <p className="text-primary-200/70">
                {connectionInfo.displayPhoneNumber}
                {connectionInfo.verifiedName && ` • ${connectionInfo.verifiedName}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status de validação de permissões */}
      {showValidationStatus && (
        <PermissionStatusView
          result={validationResult}
          isLoading={isValidating}
          onRetry={handleValidatePermissions}
          onContinue={onContinue}
          showContinueButton={Boolean(onContinue) && validationResult?.valid}
        />
      )}

      {/* Link de ajuda */}
      {showHelpLink && (
        <a
          href="https://developers.facebook.com/apps/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Abrir Meta for Developers
        </a>
      )}

      {/* Botões de ação */}
      <div className="flex flex-wrap items-center gap-3">
        {showTestButton && (
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={!canTest || isTesting || isSaving}
          >
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Testar Conexão
              </>
            )}
          </Button>
        )}

        {showValidateButton && showMetaApp && (
          <Button
            type="button"
            variant="outline"
            onClick={handleValidatePermissions}
            disabled={!canValidatePermissions || isValidating || isSaving}
            title={!canValidatePermissions ? 'Configure Meta App ID e Secret primeiro' : undefined}
          >
            {isValidating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Validando...
              </>
            ) : (
              'Validar Permissões'
            )}
          </Button>
        )}

        {showSaveButton && (
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canTest || isSaving || isTesting}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {saveButtonText}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
