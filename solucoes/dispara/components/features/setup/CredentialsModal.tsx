'use client'

import { useState, useCallback } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { WhatsAppCredentialsForm, type WhatsAppCredentials } from '@/components/shared/WhatsAppCredentialsForm'

interface CredentialsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  onHelpClick: () => void
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error'

/**
 * Modal de credenciais para setup rápido.
 *
 * Usa o componente centralizado WhatsAppCredentialsForm em modo minimal:
 * - Apenas campos essenciais (Phone, WABA, Token)
 * - Sem Meta App ID/Secret
 * - Sem validação de permissões
 * - Salva e fecha automaticamente após sucesso
 */
export function CredentialsModal({
  open,
  onOpenChange,
  onSuccess,
  onHelpClick,
}: CredentialsModalProps) {
  const [credentials, setCredentials] = useState<WhatsAppCredentials>({
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
  })
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const isFormValid =
    credentials.phoneNumberId.trim() &&
    credentials.businessAccountId.trim() &&
    credentials.accessToken.trim()

  // Handler para mudança de valores
  const handleChange = useCallback((values: WhatsAppCredentials) => {
    setCredentials(values)
    // Limpa erro quando o usuário edita
    if (testStatus === 'error') {
      setTestStatus('idle')
      setErrorMessage('')
    }
  }, [testStatus])

  // Handler para testar e salvar
  const handleTestAndSave = async () => {
    if (!isFormValid) return

    setTestStatus('testing')
    setErrorMessage('')

    try {
      // API /api/settings/credentials faz teste + save em uma única chamada
      const res = await fetch('/api/settings/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: credentials.phoneNumberId.trim(),
          businessAccountId: credentials.businessAccountId.trim(),
          accessToken: credentials.accessToken.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.details || data.error || 'Credenciais inválidas')
      }

      // Sincronizar templates automaticamente (fire-and-forget)
      fetch('/api/templates/sync', { method: 'POST' }).catch(() => {
        // Ignora erro - não é crítico
      })

      setTestStatus('success')

      // Fechar modal após breve delay para mostrar sucesso
      setTimeout(() => {
        onOpenChange(false)
        onSuccess()
        // Reset state
        setTestStatus('idle')
        setCredentials({ phoneNumberId: '', businessAccountId: '', accessToken: '' })
      }, 1000)
    } catch (error) {
      setTestStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Erro desconhecido')
    }
  }

  const handleClose = () => {
    if (testStatus === 'testing') return // Não fecha durante teste
    onOpenChange(false)
    setTestStatus('idle')
    setErrorMessage('')
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500/20 to-primary-600/20 flex items-center justify-center">
              <span className="text-3xl">🔐</span>
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            Conectar WhatsApp
          </DialogTitle>
          <DialogDescription className="text-center">
            Cole suas credenciais do Meta Business Suite
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Formulário centralizado - modo minimal */}
          <WhatsAppCredentialsForm
            values={credentials}
            onChange={handleChange}
            showMetaApp={false}
            showAppSecret={false}
            showValidateButton={false}
            showSaveButton={false}
            showTestButton={false}
            showHelpLink={false}
            variant="minimal"
          />

          {/* Help Link */}
          <button
            type="button"
            onClick={onHelpClick}
            className="flex items-center gap-2 text-sm text-[var(--ds-text-secondary)] hover:text-primary-400 transition-colors w-full justify-center py-2"
          >
            Não sabe onde encontrar? Ver tutorial passo-a-passo
          </button>

          {/* Error Message */}
          {testStatus === 'error' && errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-red-200">{errorMessage}</p>
            </div>
          )}

          {/* Success Message */}
          {testStatus === 'success' && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary-500/10 border border-primary-500/20">
              <CheckCircle2 className="w-5 h-5 text-primary-400" />
              <p className="text-sm text-primary-200">
                Conectado! Sincronizando templates...
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={testStatus === 'testing'}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleTestAndSave}
              disabled={!isFormValid || testStatus === 'testing' || testStatus === 'success'}
              className="min-w-[140px]"
            >
              {testStatus === 'testing' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : testStatus === 'success' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Conectado!
                </>
              ) : (
                'Testar e Conectar'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
