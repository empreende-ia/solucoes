'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { FileText, RefreshCw, Plus, Trash2, Send, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ManualDraftTemplate } from '@/hooks/useManualDrafts'

function extractDraftBody(draft: ManualDraftTemplate): string {
  if (typeof draft.content === 'string' && draft.content.trim()) return draft.content
  const spec = draft.spec
  if (spec && typeof spec === 'object') {
    const body = (spec as Record<string, unknown>).body as { text?: string } | undefined
    if (body && typeof body.text === 'string') return body.text
    if (typeof (spec as Record<string, unknown>).content === 'string') return (spec as Record<string, unknown>).content as string
  }
  return ''
}

interface DraftStatusBadgeProps {
  /** Whether the draft is ready to be submitted */
  ready: boolean
}

function DraftStatusBadge({ ready }: DraftStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide border',
        ready
          ? 'bg-primary-500/10 text-primary-300 border-primary-500/20'
          : 'bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)] border-[var(--ds-border-subtle)]'
      )}
    >
      {ready ? 'Pronto para enviar' : 'Em edição'}
    </span>
  )
}

export interface ManualDraftsViewProps {
  /** List of draft templates */
  drafts: ManualDraftTemplate[]
  /** Whether the initial data is loading */
  isLoading: boolean
  /** Whether a refresh is in progress */
  isRefreshing: boolean
  /** Current search query */
  search: string
  /** Callback to update search query */
  setSearch: (v: string) => void
  /** Callback to refresh the drafts list */
  onRefresh: () => void
  /** Callback to create a new draft */
  onCreate: (input: { name: string; category: string; language: string; parameterFormat: 'positional' | 'named' }) => Promise<ManualDraftTemplate | void>
  /** Whether a draft is being created */
  isCreating: boolean
  /** Callback to delete a draft by id */
  onDelete: (id: string) => void
  /** Whether a draft is being deleted */
  isDeleting: boolean
  /** Callback to update a draft spec */
  onUpdate: (id: string, patch: { spec: unknown }) => void
  /** Whether a draft is being updated */
  isUpdating: boolean
  /** Callback to submit a draft for approval */
  onSubmit: (id: string) => void
  /** Whether a draft is being submitted */
  isSubmitting: boolean
  /** Function to normalize template names */
  normalizeName: (input: string) => string
}

export function ManualDraftsView({
  drafts,
  isLoading,
  isRefreshing,
  search,
  setSearch,
  onRefresh,
  onCreate,
  isCreating,
  onDelete,
  isDeleting,
  isUpdating,
  onSubmit,
  isSubmitting,
  normalizeName,
}: ManualDraftsViewProps) {
  const router = useRouter()
  const [isQuickCreating, setIsQuickCreating] = React.useState(false)

  const canSubmit = (draft: ManualDraftTemplate): boolean => {
    const spec = (draft.spec || {}) as any
    const bodyText = typeof spec?.body?.text === 'string' ? spec.body.text : (typeof spec?.content === 'string' ? spec.content : '')
    return bodyText.trim().length > 0
  }

  const handleQuickCreate = async () => {
    const now = new Date()
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    const name = `template_${stamp}`
    try {
      setIsQuickCreating(true)
      const created = await onCreate({ name, category: 'MARKETING', language: 'pt_BR', parameterFormat: 'positional' })
      if (created?.id) {
        router.push(`/templates/drafts/${encodeURIComponent(created.id)}`)
        return
      }
    } catch {
      // Toast handled by caller.
    } finally {
      setIsQuickCreating(false)
    }
  }

  const readyDrafts = drafts.filter((d) => canSubmit(d))
  const editingDrafts = drafts.filter((d) => !canSubmit(d))
  const draftStage = drafts.length === 0 ? 'create' : readyDrafts.length > 0 ? 'send' : 'edit'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--ds-bg-hover)] border border-[var(--ds-border-subtle)] text-[var(--ds-text-primary)]">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">Templates em rascunho</h2>
            <p className="text-sm text-[var(--ds-text-secondary)]">Crie, edite e envie para a Meta.</p>
          </div>
        </div>
      </div>

      <div className="space-y-6 max-w-[min(900px,100%)]">
        <Container variant="default" padding="lg" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Etapas</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ds-text-secondary)]">
              <span className={draftStage === 'create' ? 'text-[var(--ds-text-primary)] font-semibold' : ''}>1. Criar</span>
              <span className="opacity-40">→</span>
              <span className={draftStage === 'edit' ? 'text-[var(--ds-text-primary)] font-semibold' : ''}>2. Editar</span>
              <span className="opacity-40">→</span>
              <span className={draftStage === 'send' ? 'text-[var(--ds-text-primary)] font-semibold' : ''}>3. Enviar</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleQuickCreate} disabled={isQuickCreating || isCreating}>
              <Plus className="w-4 h-4" />
              {isQuickCreating ? 'Criando…' : 'Criar rascunho'}
            </Button>
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 text-[var(--ds-text-primary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
            >
              <RefreshCw className={cn('w-4 h-4', isRefreshing ? 'animate-spin' : '')} />
              Atualizar
            </Button>
          </div>
        </Container>

        <Container variant="default" padding="lg" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar rascunhos..."
            className="bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)] text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] w-full sm:w-96"
          />
          <div className="text-xs text-[var(--ds-text-secondary)]">
            {drafts.length} rascunho(s) • {readyDrafts.length} pronto(s) para envio
          </div>
        </Container>

        <Container variant="default" padding="none" className="overflow-hidden">
        {isLoading ? (
          <div className="px-6 py-10 text-center text-[var(--ds-text-secondary)]">Carregando...</div>
        ) : drafts.length === 0 ? (
          <div className="px-6 py-10 text-center text-[var(--ds-text-muted)]">
            <div className="text-sm font-semibold text-[var(--ds-text-secondary)]">Nenhum rascunho ainda.</div>
            <div className="text-xs text-[var(--ds-text-muted)] mt-1">Clique em “Criar rascunho” para começar.</div>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            <div className="px-6 py-3 text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-wider">
              Em edição ({editingDrafts.length})
            </div>
            {editingDrafts.length === 0 ? (
              <div className="px-6 py-5 text-sm text-[var(--ds-text-muted)]">Tudo pronto para enviar.</div>
            ) : (
              editingDrafts.slice(0, 3).map((draft) => {
                const snippet = extractDraftBody(draft).trim()
                return (
                  <div key={draft.id} className="px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-[var(--ds-bg-hover)]">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-[var(--ds-text-primary)] font-medium truncate">{draft.name}</div>
                        <DraftStatusBadge ready={false} />
                      </div>
                      <p className="text-xs text-[var(--ds-text-muted)] line-clamp-2 whitespace-pre-wrap">
                        {snippet || 'Sem corpo ainda. Escreva o conteúdo para aparecer aqui.'}
                      </p>
                      <div className="text-xs text-[var(--ds-text-muted)] mt-1">
                        Atualizado {new Date(draft.updatedAt).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => router.push(`/templates/drafts/${encodeURIComponent(draft.id)}`)}
                        disabled={isUpdating}
                      >
                        <Pencil className="w-4 h-4" />
                        Continuar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(draft.id)}
                        disabled={isDeleting}
                        title="Excluir rascunho"
                      >
                        <Trash2 className="w-4 h-4" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                )
              })
            )}

            {editingDrafts.length > 3 && (
              <div className="px-6 py-3 flex items-center justify-between text-xs text-[var(--ds-text-muted)]">
                <span>Mostrando 3 de {editingDrafts.length}.</span>
                <button
                  type="button"
                  className="text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] underline underline-offset-2"
                  onClick={() => setSearch('')}
                >
                  Ver todos
                </button>
              </div>
            )}

            <div className="px-6 py-3 text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-wider">
              Prontos para enviar ({readyDrafts.length})
            </div>
            {readyDrafts.length === 0 ? (
              <div className="px-6 py-5 text-sm text-[var(--ds-text-muted)]">Nenhum rascunho pronto ainda.</div>
            ) : (
              readyDrafts.slice(0, 3).map((draft) => {
                const snippet = extractDraftBody(draft).trim()
                return (
                  <div key={draft.id} className="px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-[var(--ds-bg-hover)]">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-[var(--ds-text-primary)] font-medium truncate">{draft.name}</div>
                        <DraftStatusBadge ready />
                      </div>
                      <p className="text-xs text-[var(--ds-text-muted)] line-clamp-2 whitespace-pre-wrap">
                        {snippet || 'Pronto para enviar.'}
                      </p>
                      <div className="text-xs text-[var(--ds-text-muted)] mt-1">
                        Atualizado {new Date(draft.updatedAt).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onSubmit(draft.id)}
                        disabled={isSubmitting}
                      >
                        <Send className="w-4 h-4" />
                        Enviar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/templates/drafts/${encodeURIComponent(draft.id)}`)}
                        disabled={isUpdating}
                      >
                        <Pencil className="w-4 h-4" />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(draft.id)}
                        disabled={isDeleting}
                        title="Excluir rascunho"
                      >
                        <Trash2 className="w-4 h-4" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                )
              })
            )}

            {readyDrafts.length > 3 && (
              <div className="px-6 py-3 flex items-center justify-between text-xs text-[var(--ds-text-muted)]">
                <span>Mostrando 3 de {readyDrafts.length}.</span>
                <button
                  type="button"
                  className="text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] underline underline-offset-2"
                  onClick={() => setSearch('')}
                >
                  Ver todos
                </button>
              </div>
            )}
          </div>
        )}
        </Container>
      </div>

      <div className="text-xs text-[var(--ds-text-muted)]">
        Para enviar, o BODY do template precisa estar preenchido.
      </div>
    </div>
  )
}
