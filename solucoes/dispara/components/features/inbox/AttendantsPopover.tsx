'use client'

/**
 * AttendantsPopover - Gerenciamento rápido de atendentes no Inbox
 * Permite criar, visualizar e copiar links de acesso sem sair do Inbox
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Plus,
  Copy,
  Trash2,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Settings,
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AttendantToken, AttendantPermissions } from '@/types'

// =============================================================================
// API
// =============================================================================

async function fetchAttendants(): Promise<AttendantToken[]> {
  const res = await fetch('/api/attendants')
  if (!res.ok) throw new Error('Erro ao buscar atendentes')
  return res.json()
}

async function createAttendant(data: {
  name: string
  permissions?: Partial<AttendantPermissions>
}): Promise<AttendantToken> {
  const res = await fetch('/api/attendants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const result = await res.json()
  if (!res.ok) throw new Error(result.error || 'Erro ao criar')
  return result
}

async function deleteAttendant(id: string): Promise<void> {
  const res = await fetch(`/api/attendants/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Erro ao remover')
}

// =============================================================================
// Components
// =============================================================================

function AttendantRow({
  attendant,
  onDelete,
  isDeleting,
}: {
  attendant: AttendantToken
  onDelete: () => void
  isDeleting: boolean
}) {
  const [showToken, setShowToken] = useState(false)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const accessUrl = `${baseUrl}/atendimento?token=${attendant.token}`

  const handleCopy = () => {
    navigator.clipboard.writeText(accessUrl)
    toast.success('Link copiado!')
  }

  return (
    <div className={cn(
      'p-2.5 rounded-lg border transition-colors',
      attendant.is_active
        ? 'bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)]'
        : 'bg-[var(--ds-bg-surface)]/50 border-[var(--ds-border-subtle)]/50 opacity-60'
    )}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
            attendant.is_active ? 'bg-primary-500/10 text-primary-400' : 'bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)]'
          )}>
            {attendant.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{attendant.name}</p>
            <p className="text-[10px] text-[var(--ds-text-muted)]">{attendant.access_count} acessos</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowToken(!showToken)}
            className="p-1 rounded hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)]"
            title={showToken ? 'Ocultar link' : 'Ver link'}
          >
            {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)]"
            title="Copiar link"
          >
            <Copy size={12} />
          </button>
          <a
            href={accessUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)]"
            title="Abrir"
          >
            <ExternalLink size={12} />
          </a>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="p-1 rounded hover:bg-red-500/10 text-[var(--ds-text-muted)] hover:text-red-400 disabled:opacity-50"
            title="Remover"
          >
            {isDeleting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
          </button>
        </div>
      </div>

      {showToken && (
        <div className="bg-[var(--ds-bg-surface)]/50 rounded px-2 py-1.5">
          <p className="text-[10px] font-mono text-[var(--ds-text-secondary)] truncate">{accessUrl}</p>
        </div>
      )}
    </div>
  )
}

function CreateForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState<AttendantPermissions>({
    canView: true,
    canReply: true,
    canHandoff: false,
  })

  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: createAttendant,
    onSuccess: (data) => {
      toast.success(`"${data.name}" criado!`)
      setName('')
      queryClient.invalidateQueries({ queryKey: ['attendants'] })
      onSuccess()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    mutation.mutate({ name: name.trim(), permissions })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        placeholder="Nome do atendente"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 text-xs bg-[var(--ds-bg-surface)]/60 border-[var(--ds-border-strong)]"
      />

      <div className="space-y-2">
        <label className="flex items-center justify-between p-2 bg-[var(--ds-bg-surface)]/30 rounded-lg">
          <span className="text-[10px] text-[var(--ds-text-secondary)]">Responder mensagens</span>
          <Switch
            checked={permissions.canReply}
            onCheckedChange={(checked) => setPermissions((p) => ({ ...p, canReply: checked }))}
            className="scale-75"
          />
        </label>
        <label className="flex items-center justify-between p-2 bg-[var(--ds-bg-surface)]/30 rounded-lg">
          <span className="text-[10px] text-[var(--ds-text-secondary)]">Devolver para IA</span>
          <Switch
            checked={permissions.canHandoff}
            onCheckedChange={(checked) => setPermissions((p) => ({ ...p, canHandoff: checked }))}
            className="scale-75"
          />
        </label>
      </div>

      <Button
        type="submit"
        size="sm"
        disabled={mutation.isPending || !name.trim()}
        className="w-full h-8 text-xs"
      >
        {mutation.isPending ? (
          <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
        ) : (
          <Plus className="w-3 h-3 mr-1.5" />
        )}
        Criar Atendente
      </Button>
    </form>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function AttendantsPopover() {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: attendants = [], isLoading } = useQuery({
    queryKey: ['attendants'],
    queryFn: fetchAttendants,
    enabled: isOpen,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAttendant,
    onSuccess: () => {
      toast.success('Atendente removido')
      queryClient.invalidateQueries({ queryKey: ['attendants'] })
      setDeletingId(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
      setDeletingId(null)
    },
  })

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Remover "${name}"?`)) {
      setDeletingId(id)
      deleteMutation.mutate(id)
    }
  }

  const activeCount = attendants.filter((a) => a.is_active).length

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'h-8 w-8 flex items-center justify-center rounded-lg transition-colors relative',
            activeCount > 0
              ? 'text-primary-400 hover:bg-primary-500/10'
              : 'text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-surface)]/60'
          )}
          title="Gerenciar atendentes"
        >
          <Users className="h-3.5 w-3.5" />
          {activeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary-500 text-[9px] text-white flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--ds-border-subtle)]">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-primary-400" />
            <span className="text-xs font-medium">Atendentes</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className={cn(
                'p-1.5 rounded transition-colors',
                showCreateForm
                  ? 'bg-primary-500/10 text-primary-400'
                  : 'text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]'
              )}
              title="Novo atendente"
            >
              <Plus size={14} />
            </button>
            <a
              href="/settings/attendants"
              className="p-1.5 rounded text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] transition-colors"
              title="Configurações completas"
            >
              <Settings size={14} />
            </a>
          </div>
        </div>

        {/* Content */}
        <div className="p-2 max-h-80 overflow-y-auto">
          {showCreateForm && (
            <div className="mb-3 pb-3 border-b border-[var(--ds-border-subtle)]">
              <CreateForm onSuccess={() => setShowCreateForm(false)} />
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--ds-text-muted)]" />
            </div>
          ) : attendants.length === 0 ? (
            <div className="text-center py-6">
              <Users className="w-8 h-8 mx-auto text-[var(--ds-text-muted)] mb-2" />
              <p className="text-xs text-[var(--ds-text-muted)] mb-2">Nenhum atendente</p>
              {!showCreateForm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCreateForm(true)}
                  className="h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1.5" />
                  Criar primeiro
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {attendants.map((attendant) => (
                <AttendantRow
                  key={attendant.id}
                  attendant={attendant}
                  onDelete={() => handleDelete(attendant.id, attendant.name)}
                  isDeleting={deletingId === attendant.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        {attendants.length > 0 && (
          <div className="px-3 py-2 border-t border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/50">
            <p className="text-[10px] text-[var(--ds-text-muted)] text-center">
              Compartilhe o link para que atendentes acessem sem login
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
