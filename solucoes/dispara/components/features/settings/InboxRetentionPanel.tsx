'use client'

/**
 * T071: InboxRetentionPanel - Configure inbox message retention
 * Allows setting how many days to keep inbox messages before cleanup
 */

import { useState, useEffect } from 'react'
import { Archive, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface InboxSettings {
  retention_days: number
}

export function InboxRetentionPanel() {
  const [retentionDays, setRetentionDays] = useState(90)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalValue, setOriginalValue] = useState(90)

  // Load settings
  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/settings/inbox')
        if (response.ok) {
          const data: InboxSettings = await response.json()
          setRetentionDays(data.retention_days)
          setOriginalValue(data.retention_days)
        }
      } catch (error) {
        console.error('Failed to load inbox settings:', error)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  // Track changes
  useEffect(() => {
    setHasChanges(retentionDays !== originalValue)
  }, [retentionDays, originalValue])

  // Save handler
  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/settings/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retention_days: retentionDays }),
      })

      if (!response.ok) {
        throw new Error('Failed to save')
      }

      const data: InboxSettings = await response.json()
      setOriginalValue(data.retention_days)
      setHasChanges(false)
      toast.success('Configurações salvas')
    } catch (error) {
      console.error('Failed to save inbox settings:', error)
      toast.error('Erro ao salvar configurações')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--ds-text-muted)]" />
          <span className="text-sm text-[var(--ds-text-secondary)]">Carregando...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--ds-status-warning-bg)] border border-[var(--ds-status-warning)]/20">
          <Archive className="h-6 w-6 text-[var(--ds-status-warning-text)]" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-[var(--ds-text-primary)]">Retenção de Mensagens</h3>
          <p className="mt-1 text-sm text-[var(--ds-text-secondary)]">
            Define por quantos dias as mensagens do inbox são mantidas antes de serem arquivadas automaticamente.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="retention-days" className="text-sm text-[var(--ds-text-secondary)]">
                Manter mensagens por:
              </label>
              <input
                id="retention-days"
                type="number"
                min={7}
                max={365}
                value={retentionDays}
                onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 7)}
                className="w-20 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 text-sm text-[var(--ds-text-primary)] focus:border-[var(--ds-status-warning)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--ds-status-warning)]/50"
              />
              <span className="text-sm text-[var(--ds-text-secondary)]">dias</span>
            </div>

            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="flex items-center gap-2 rounded-lg bg-[var(--ds-status-warning-bg)] border border-[var(--ds-status-warning)]/30 px-4 py-2 text-sm font-medium text-[var(--ds-status-warning-text)] transition-colors hover:bg-[var(--ds-status-warning)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>

          <p className="mt-3 text-xs text-[var(--ds-text-muted)]">
            Valores permitidos: 7 a 365 dias. Mensagens mais antigas serão arquivadas automaticamente.
          </p>
        </div>
      </div>
    </div>
  )
}
