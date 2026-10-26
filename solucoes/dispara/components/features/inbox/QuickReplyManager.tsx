'use client'

/**
 * QuickReplyManager - Modal para gerenciar respostas rápidas
 * Permite criar, editar e deletar quick replies
 */

import React, { useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Loader2, X, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { InboxQuickReply } from '@/types'

interface QuickReplyManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quickReplies: InboxQuickReply[]
  onRefresh: () => void
}

interface QuickReplyFormData {
  title: string
  content: string
  shortcut: string
}

const emptyForm: QuickReplyFormData = {
  title: '',
  content: '',
  shortcut: '',
}

export function QuickReplyManager({
  open,
  onOpenChange,
  quickReplies,
  onRefresh,
}: QuickReplyManagerProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<QuickReplyFormData>(emptyForm)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset state when modal closes
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      setIsCreating(false)
      setEditingId(null)
      setFormData(emptyForm)
      setError(null)
    }
    onOpenChange(newOpen)
  }, [onOpenChange])

  // Start creating new quick reply
  const handleStartCreate = useCallback(() => {
    setIsCreating(true)
    setEditingId(null)
    setFormData(emptyForm)
    setError(null)
  }, [])

  // Start editing existing quick reply
  const handleStartEdit = useCallback((qr: InboxQuickReply) => {
    setEditingId(qr.id)
    setIsCreating(false)
    setFormData({
      title: qr.title,
      content: qr.content,
      shortcut: qr.shortcut || '',
    })
    setError(null)
  }, [])

  // Cancel editing/creating
  const handleCancel = useCallback(() => {
    setIsCreating(false)
    setEditingId(null)
    setFormData(emptyForm)
    setError(null)
  }, [])

  // Save quick reply (create or update)
  const handleSave = useCallback(async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      setError('Título e conteúdo são obrigatórios')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const payload = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        shortcut: formData.shortcut.trim() || undefined,
      }

      if (editingId) {
        // Update existing
        const response = await fetch(`/api/inbox/quick-replies/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Erro ao atualizar')
        }
      } else {
        // Create new
        const response = await fetch('/api/inbox/quick-replies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Erro ao criar')
        }
      }

      // Success - reset and refresh
      setIsCreating(false)
      setEditingId(null)
      setFormData(emptyForm)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsSaving(false)
    }
  }, [formData, editingId, onRefresh])

  // Delete quick reply
  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id)
    setError(null)

    try {
      const response = await fetch(`/api/inbox/quick-replies/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Erro ao deletar')
      }

      // If we were editing this one, cancel
      if (editingId === id) {
        handleCancel()
      }

      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setDeletingId(null)
    }
  }, [editingId, handleCancel, onRefresh])

  const isEditing = isCreating || editingId !== null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--ds-text-primary)]">Respostas Rápidas</DialogTitle>
          <DialogDescription className="text-[var(--ds-text-muted)]">
            Crie e gerencie suas respostas prontas para agilizar o atendimento
          </DialogDescription>
        </DialogHeader>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form for creating/editing */}
        {isEditing && (
          <div className="space-y-4 p-4 rounded-lg bg-[var(--ds-bg-surface)]/50 border border-[var(--ds-border-subtle)]">
            <div className="space-y-2">
              <label className="text-xs text-[var(--ds-text-muted)] font-medium">Título</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Ex: Saudação inicial"
                className="bg-[var(--ds-bg-surface)] border-[var(--ds-border-strong)] text-[var(--ds-text-primary)]"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[var(--ds-text-muted)] font-medium">Conteúdo</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Olá! Como posso ajudar você hoje?"
                rows={3}
                className="bg-[var(--ds-bg-surface)] border-[var(--ds-border-strong)] text-[var(--ds-text-primary)] resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[var(--ds-text-muted)] font-medium">
                Atalho <span className="text-[var(--ds-text-secondary)]">(opcional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)]">/</span>
                <Input
                  value={formData.shortcut}
                  onChange={(e) => setFormData(prev => ({ ...prev, shortcut: e.target.value.replace(/[^a-z0-9]/gi, '').toLowerCase() }))}
                  placeholder="ola"
                  className="pl-7 bg-[var(--ds-bg-surface)] border-[var(--ds-border-strong)] text-[var(--ds-text-primary)]"
                  maxLength={20}
                />
              </div>
              <p className="text-[11px] text-[var(--ds-text-muted)]">Digite /atalho na caixa de mensagem para inserir rapidamente</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={isSaving}
                className="text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)]"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !formData.title.trim() || !formData.content.trim()}
                className="bg-primary-600 hover:bg-primary-500 text-white"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    {editingId ? 'Salvar' : 'Criar'}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* List of quick replies */}
        {!isEditing && (
          <>
            <ScrollArea className="max-h-[300px] -mx-6 px-6">
              {quickReplies.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-[var(--ds-text-muted)]">Nenhuma resposta rápida criada</p>
                  <p className="text-xs text-[var(--ds-text-secondary)] mt-1">Clique em "Nova" para começar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {quickReplies.map((qr) => (
                    <div
                      key={qr.id}
                      className={cn(
                        'group p-3 rounded-lg border transition-colors',
                        'bg-[var(--ds-bg-surface)]/30 border-[var(--ds-border-subtle)]',
                        'hover:bg-[var(--ds-bg-surface)]/50 hover:border-[var(--ds-border-strong)]'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--ds-text-primary)] truncate">
                              {qr.title}
                            </span>
                            {qr.shortcut && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ds-bg-surface)] text-[var(--ds-text-muted)] font-mono shrink-0">
                                /{qr.shortcut}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--ds-text-muted)] mt-1 line-clamp-2">
                            {qr.content}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleStartEdit(qr)}
                            className="p-1.5 rounded-md text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-colors"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(qr.id)}
                            disabled={deletingId === qr.id}
                            className="p-1.5 rounded-md text-[var(--ds-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            title="Excluir"
                          >
                            {deletingId === qr.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleStartCreate}
                className="bg-primary-600 hover:bg-primary-500 text-white"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Nova
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
