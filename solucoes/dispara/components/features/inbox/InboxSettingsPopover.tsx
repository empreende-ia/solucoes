'use client'

/**
 * InboxSettingsPopover - Configurações rápidas do Inbox
 * Acesso rápido às configurações sem sair da página
 */

import { useState, useEffect } from 'react'
import { Settings, Archive, Save, Loader2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface InboxSettings {
  retention_days: number
  human_mode_timeout_hours: number
}

// Timeout options in hours
const TIMEOUT_OPTIONS = [
  { value: '0', label: 'Nunca (recomendado)' },
  { value: '1', label: '1 hora' },
  { value: '2', label: '2 horas' },
  { value: '4', label: '4 horas' },
  { value: '8', label: '8 horas' },
  { value: '12', label: '12 horas' },
  { value: '24', label: '1 dia' },
  { value: '48', label: '2 dias' },
  { value: '72', label: '3 dias' },
  { value: '168', label: '7 dias' },
]

export function InboxSettingsPopover() {
  const [isOpen, setIsOpen] = useState(false)
  const [retentionDays, setRetentionDays] = useState(365)
  const [timeoutHours, setTimeoutHours] = useState('0')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalRetention, setOriginalRetention] = useState(365)
  const [originalTimeout, setOriginalTimeout] = useState('0')

  // Load settings when popover opens
  useEffect(() => {
    if (!isOpen) return

    const load = async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/api/settings/inbox')
        if (response.ok) {
          const data: InboxSettings = await response.json()
          setRetentionDays(data.retention_days)
          setOriginalRetention(data.retention_days)
          setTimeoutHours(String(data.human_mode_timeout_hours))
          setOriginalTimeout(String(data.human_mode_timeout_hours))
        }
      } catch (error) {
        console.error('Failed to load inbox settings:', error)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [isOpen])

  // Track changes
  useEffect(() => {
    const retentionChanged = retentionDays !== originalRetention
    const timeoutChanged = timeoutHours !== originalTimeout
    setHasChanges(retentionChanged || timeoutChanged)
  }, [retentionDays, originalRetention, timeoutHours, originalTimeout])

  // Save handler
  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/settings/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retention_days: retentionDays,
          human_mode_timeout_hours: parseInt(timeoutHours, 10),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save')
      }

      const data: InboxSettings = await response.json()
      setOriginalRetention(data.retention_days)
      setOriginalTimeout(String(data.human_mode_timeout_hours))
      setHasChanges(false)
      toast.success('Configurações salvas')
    } catch (error) {
      console.error('Failed to save inbox settings:', error)
      toast.error('Erro ao salvar')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'h-8 w-8 flex items-center justify-center rounded-lg transition-colors',
                isOpen
                  ? 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)]'
                  : 'text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-surface)]/60'
              )}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Configurações
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-3 border-b border-[var(--ds-border-subtle)]">
          <h3 className="text-sm font-medium text-[var(--ds-text-primary)]">
            Configurações do Inbox
          </h3>
        </div>

        {isLoading ? (
          <div className="p-4 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--ds-text-muted)]" />
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {/* Timeout do modo humano */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-medium text-[var(--ds-text-primary)]">
                  Timeout do Modo Humano
                </span>
              </div>
              <p className="text-[10px] text-[var(--ds-text-muted)] leading-relaxed">
                Define quanto tempo a conversa fica com o atendente antes de voltar pro bot. Use &quot;Nunca&quot; para devolver manualmente.
              </p>
              <Select value={timeoutHours} onValueChange={setTimeoutHours}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Selecione o timeout" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEOUT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Retenção de mensagens */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Archive className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-medium text-[var(--ds-text-primary)]">
                  Retenção de Mensagens
                </span>
              </div>
              <p className="text-[10px] text-[var(--ds-text-muted)] leading-relaxed">
                Mensagens mais antigas serão arquivadas automaticamente.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ds-text-secondary)]">Manter por</span>
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 7)}
                  className="w-16 h-7 rounded-md border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] px-2 text-xs text-[var(--ds-text-primary)] text-center focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
                <span className="text-xs text-[var(--ds-text-secondary)]">dias</span>
              </div>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className={cn(
                'w-full flex items-center justify-center gap-2 h-8 rounded-lg text-xs font-medium transition-colors',
                hasChanges
                  ? 'bg-primary-600 text-white hover:bg-primary-500'
                  : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)] cursor-not-allowed'
              )}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-3 w-3" />
                  Salvar alterações
                </>
              )}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
