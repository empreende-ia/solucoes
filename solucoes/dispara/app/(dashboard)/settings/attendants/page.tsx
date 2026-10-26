'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Plus,
  Copy,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Link2,
  Shield,
  Clock,
  MoreVertical,
} from 'lucide-react'
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
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

async function updateAttendant(
  id: string,
  data: Partial<AttendantToken>
): Promise<AttendantToken> {
  const res = await fetch(`/api/attendants/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const result = await res.json()
  if (!res.ok) throw new Error(result.error || 'Erro ao atualizar')
  return result
}

async function deleteAttendant(id: string): Promise<void> {
  const res = await fetch(`/api/attendants/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Erro ao remover')
}

// =============================================================================
// Components
// =============================================================================

function CopyButton({ text, label }: { text: string; label: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copiado!`)
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors"
      title={`Copiar ${label}`}
    >
      <Copy size={14} />
    </button>
  )
}

function AttendantCard({
  attendant,
  onToggleActive,
  onDelete,
  isDeleting,
}: {
  attendant: AttendantToken
  onToggleActive: (active: boolean) => void
  onDelete: () => void
  isDeleting: boolean
}) {
  const [showToken, setShowToken] = useState(false)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const accessUrl = `${baseUrl}/atendimento?token=${attendant.token}`

  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className={`
      bg-[var(--ds-bg-elevated)] border rounded-xl p-5
      ${attendant.is_active ? 'border-[var(--ds-border-default)]' : 'border-red-900/30 opacity-60'}
    `}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className={`
            w-10 h-10 rounded-lg flex items-center justify-center text-lg font-semibold
            ${attendant.is_active ? 'bg-primary-500/10 text-primary-400' : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]'}
          `}>
            {attendant.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h4 className="font-medium text-[var(--ds-text-primary)]">{attendant.name}</h4>
            <p className="text-xs text-[var(--ds-text-muted)]">
              {attendant.access_count} acesso{attendant.access_count !== 1 ? 's' : ''}
              {attendant.last_used_at && ` • Último: ${formatDate(attendant.last_used_at)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`
            inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
            ${attendant.is_active
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }
          `}>
            {attendant.is_active ? (
              <>
                <CheckCircle2 size={10} />
                Ativo
              </>
            ) : (
              <>
                <XCircle size={10} />
                Inativo
              </>
            )}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onToggleActive(!attendant.is_active)}>
                {attendant.is_active ? (
                  <>
                    <XCircle size={14} className="mr-2" />
                    Desativar
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} className="mr-2" />
                    Ativar
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onDelete}
                disabled={isDeleting}
                className="text-red-400 focus:text-red-400"
              >
                {isDeleting ? (
                  <Loader2 size={14} className="mr-2 animate-spin" />
                ) : (
                  <Trash2 size={14} className="mr-2" />
                )}
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Permissões */}
      <div className="flex gap-2 mb-4">
        <span className={`
          inline-flex items-center gap-1 px-2 py-1 rounded text-xs
          ${attendant.permissions.canView
            ? 'bg-blue-500/10 text-blue-400'
            : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)]'
          }
        `}>
          <Eye size={12} />
          Visualizar
        </span>
        <span className={`
          inline-flex items-center gap-1 px-2 py-1 rounded text-xs
          ${attendant.permissions.canReply
            ? 'bg-green-500/10 text-green-400'
            : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)]'
          }
        `}>
          <Shield size={12} />
          Responder
        </span>
        <span className={`
          inline-flex items-center gap-1 px-2 py-1 rounded text-xs
          ${attendant.permissions.canHandoff
            ? 'bg-primary-500/10 text-primary-400'
            : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)]'
          }
        `}>
          <Users size={12} />
          Transferir
        </span>
      </div>

      {/* URL de Acesso */}
      <div className="bg-[var(--ds-bg-surface)] rounded-lg p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-[var(--ds-text-secondary)]">Link de Acesso</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowToken(!showToken)}
              className="p-1 rounded hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
            >
              {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
            <CopyButton text={accessUrl} label="Link" />
            <a
              href={accessUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
            >
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
        <p className="text-xs font-mono text-[var(--ds-text-secondary)] truncate">
          {showToken ? accessUrl : `${baseUrl}/atendimento?token=••••••••`}
        </p>
      </div>

      {/* Expiração */}
      {attendant.expires_at && (
        <div className="flex items-center gap-1.5 mt-3 text-xs text-[var(--ds-text-muted)]">
          <Clock size={12} />
          Expira em {formatDate(attendant.expires_at)}
        </div>
      )}
    </div>
  )
}

function CreateAttendantForm({ onSuccess }: { onSuccess: () => void }) {
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
      toast.success(`Atendente "${data.name}" criado!`)
      setName('')
      setPermissions({ canView: true, canReply: true, canHandoff: false })
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
    <form onSubmit={handleSubmit} className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-6">
      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
        <Plus size={18} className="text-primary-400" />
        Novo Atendente
      </h3>

      <div className="space-y-4">
        {/* Nome */}
        <div className="space-y-2">
          <Label htmlFor="name">Nome do Atendente</Label>
          <Input
            id="name"
            placeholder="Ex: João - Suporte"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-sm"
          />
          <p className="text-xs text-[var(--ds-text-muted)]">
            Use um nome que identifique o atendente
          </p>
        </div>

        {/* Permissões */}
        <div className="space-y-3">
          <Label>Permissões</Label>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 bg-[var(--ds-bg-surface)] rounded-lg cursor-pointer">
              <div className="flex items-center gap-3">
                <Eye size={16} className="text-blue-400" />
                <div>
                  <p className="text-sm font-medium">Visualizar</p>
                  <p className="text-xs text-[var(--ds-text-muted)]">Ver conversas e mensagens</p>
                </div>
              </div>
              <Switch
                checked={permissions.canView}
                onCheckedChange={(checked) =>
                  setPermissions((p) => ({ ...p, canView: checked }))
                }
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-[var(--ds-bg-surface)] rounded-lg cursor-pointer">
              <div className="flex items-center gap-3">
                <Shield size={16} className="text-green-400" />
                <div>
                  <p className="text-sm font-medium">Responder</p>
                  <p className="text-xs text-[var(--ds-text-muted)]">Enviar mensagens aos clientes</p>
                </div>
              </div>
              <Switch
                checked={permissions.canReply}
                onCheckedChange={(checked) =>
                  setPermissions((p) => ({ ...p, canReply: checked }))
                }
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-[var(--ds-bg-surface)] rounded-lg cursor-pointer">
              <div className="flex items-center gap-3">
                <Users size={16} className="text-primary-400" />
                <div>
                  <p className="text-sm font-medium">Transferir</p>
                  <p className="text-xs text-[var(--ds-text-muted)]">Devolver conversas para a IA</p>
                </div>
              </div>
              <Switch
                checked={permissions.canHandoff}
                onCheckedChange={(checked) =>
                  setPermissions((p) => ({ ...p, canHandoff: checked }))
                }
              />
            </label>
          </div>
        </div>

        {/* Botão */}
        <Button
          type="submit"
          disabled={mutation.isPending || !name.trim()}
          className="w-full"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Criando...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Criar Atendente
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

// =============================================================================
// Main Page
// =============================================================================

export default function AttendantsPage() {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Query
  const {
    data: attendants = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['attendants'],
    queryFn: fetchAttendants,
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AttendantToken> }) =>
      updateAttendant(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendants'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Delete mutation
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
    if (confirm(`Tem certeza que deseja remover "${name}"?`)) {
      setDeletingId(id)
      deleteMutation.mutate(id)
    }
  }

  if (isLoading) {
    return (
      <Page>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--ds-text-muted)]" />
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary-400" />
            </div>
            <div>
              <PageTitle>Atendentes</PageTitle>
              <PageDescription>
                Crie links de acesso para sua equipe atender pelo navegador
              </PageDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw size={14} className="mr-1.5" />
              Atualizar
            </Button>
            <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
              <Plus size={14} className="mr-1.5" />
              Novo Atendente
            </Button>
          </div>
        </div>
      </PageHeader>

      <div className="max-w-3xl space-y-6">
        {/* Info box */}
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Link2 className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-blue-300 mb-1">
                Acesso sem conta
              </h4>
              <p className="text-sm text-[var(--ds-text-secondary)]">
                Cada atendente recebe um link único de acesso. Não é necessário criar conta
                ou fazer login. Basta compartilhar o link e o atendente pode começar a usar.
              </p>
            </div>
          </div>
        </div>

        {/* Create form */}
        {showCreateForm && (
          <CreateAttendantForm onSuccess={() => setShowCreateForm(false)} />
        )}

        {/* Attendants list */}
        {attendants.length === 0 ? (
          <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-8 text-center">
            <Users size={40} className="mx-auto text-[var(--ds-text-muted)] mb-3" />
            <h3 className="text-lg font-medium mb-1">Nenhum atendente</h3>
            <p className="text-sm text-[var(--ds-text-muted)] mb-4">
              Crie links de acesso para sua equipe
            </p>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus size={14} className="mr-1.5" />
              Criar Primeiro Atendente
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--ds-text-secondary)]">
                {attendants.length} atendente{attendants.length !== 1 ? 's' : ''}
              </h3>
            </div>

            {attendants.map((attendant) => (
              <AttendantCard
                key={attendant.id}
                attendant={attendant}
                onToggleActive={(active) =>
                  updateMutation.mutate({
                    id: attendant.id,
                    data: { is_active: active },
                  })
                }
                onDelete={() => handleDelete(attendant.id, attendant.name)}
                isDeleting={deletingId === attendant.id}
              />
            ))}
          </div>
        )}
      </div>
    </Page>
  )
}
