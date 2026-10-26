'use client'

/**
 * ContactMemoriesSheet - Painel lateral com memórias do Mem0
 *
 * Exibe todas as memórias que o sistema tem sobre um contato.
 * Permite ao atendente humano ter contexto antes de conversar.
 *
 * Features:
 * - Lista de memórias formatadas
 * - Botão para limpar todas (LGPD)
 * - Loading states
 * - Empty state amigável
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Brain, Trash2, Loader2, RefreshCw, AlertCircle, Sparkles, User, Mail, Tag, Calendar, FileText, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Memory {
  id: string
  memory: string
  created_at?: string
  updated_at?: string
}

interface Profile {
  name: string | null
  email: string | null
  status: string
  tags: string[]
  customFields: Record<string, unknown>
  createdAt: string | null
  lastActive: string | null
}

interface ContactMemoriesSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  phone: string
  contactName: string
}

export function ContactMemoriesSheet({
  open,
  onOpenChange,
  phone,
  contactName,
}: ContactMemoriesSheetProps) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  // Helper para chave do localStorage
  const getSummaryKey = (phoneNumber: string) => `dispara_summary_${phoneNumber}`

  // Carrega resumo salvo do localStorage
  const loadSavedSummary = useCallback((phoneNumber: string) => {
    try {
      const saved = localStorage.getItem(getSummaryKey(phoneNumber))
      if (saved) {
        const { summary: savedSummary, timestamp } = JSON.parse(saved)
        // Expira após 24h para forçar atualização eventual
        const isExpired = Date.now() - timestamp > 24 * 60 * 60 * 1000
        if (!isExpired && savedSummary) {
          return savedSummary
        }
      }
    } catch {
      // Ignora erro de parse
    }
    return null
  }, [])

  // Salva resumo no localStorage
  const saveSummary = useCallback((phoneNumber: string, summaryText: string) => {
    try {
      localStorage.setItem(getSummaryKey(phoneNumber), JSON.stringify({
        summary: summaryText,
        timestamp: Date.now(),
      }))
    } catch {
      // Ignora erro de storage cheio
    }
  }, [])

  const fetchMemories = useCallback(async () => {
    if (!phone) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/mem0/memories/${encodeURIComponent(phone)}`)
      const data = await res.json()

      if (data.ok) {
        setProfile(data.profile || null)
        setMemories(data.memories || [])
      } else {
        setError(data.error || 'Erro ao buscar dados')
      }
    } catch (err) {
      console.error('Error fetching memories:', err)
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }, [phone])

  // Fetch on open + load saved summary
  useEffect(() => {
    if (open && phone) {
      fetchMemories()
      // Carrega resumo salvo do localStorage
      const savedSummary = loadSavedSummary(phone)
      setSummary(savedSummary)
    }
  }, [open, phone, fetchMemories, loadSavedSummary])

  const handleGenerateSummary = async () => {
    if (!profile && memories.length === 0) {
      toast.error('Nenhum dado para resumir')
      return
    }

    setGenerating(true)

    try {
      const res = await fetch(`/api/mem0/memories/${encodeURIComponent(phone)}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, memories }),
      })
      const data = await res.json()

      if (data.ok) {
        setSummary(data.summary)
        saveSummary(phone, data.summary) // Persiste no localStorage
        toast.success('Resumo gerado!')
      } else {
        toast.error(data.error || 'Erro ao gerar resumo')
      }
    } catch (err) {
      console.error('Error generating summary:', err)
      toast.error('Erro de conexão')
    } finally {
      setGenerating(false)
    }
  }

  const handleDeleteAll = async () => {
    setDeleting(true)

    try {
      const res = await fetch(`/api/mem0/memories/${encodeURIComponent(phone)}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.ok) {
        setMemories([])
        toast.success(data.message || 'Memórias limpas')
        setShowDeleteDialog(false)
      } else {
        toast.error(data.error || 'Erro ao limpar memórias')
      }
    } catch (err) {
      console.error('Error deleting memories:', err)
      toast.error('Erro de conexão')
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteSingle = async (memoryId: string) => {
    setDeletingId(memoryId)

    try {
      const res = await fetch(`/api/mem0/memory/${memoryId}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== memoryId))
        toast.success('Memória removida')
      } else {
        toast.error(data.error || 'Erro ao remover')
      }
    } catch (err) {
      console.error('Error deleting memory:', err)
      toast.error('Erro de conexão')
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return null
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[400px] sm:w-[450px] bg-[var(--ds-bg-elevated)] border-l border-[var(--ds-border-subtle)] px-6">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2 text-[var(--ds-text-primary)]">
              <User className="h-5 w-5 text-primary-400" />
              Contexto do Contato
            </SheetTitle>
            <SheetDescription className="text-[var(--ds-text-secondary)]">
              Tudo que sabemos sobre <span className="font-medium text-[var(--ds-text-primary)]">{contactName}</span>
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5 max-h-[calc(100vh-120px)] overflow-y-auto overflow-x-hidden">
            {/* Actions bar */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchMemories}
                disabled={loading}
                className="text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)]"
              >
                <RefreshCw className={cn('h-3 w-3 mr-1.5', loading && 'animate-spin')} />
                Atualizar
              </Button>

              <div className="flex items-center gap-1">
                {(profile || memories.length > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerateSummary}
                    disabled={generating || loading}
                    className="text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                  >
                    {generating ? (
                      <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3 mr-1.5" />
                    )}
                    {generating ? 'Gerando...' : 'Gerar Resumo'}
                  </Button>
                )}

                {memories.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={deleting}
                    className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3 w-3 mr-1.5" />
                    Limpar memórias
                  </Button>
                )}
              </div>
            </div>

            {/* AI Summary Card */}
            {summary && (
              <div className="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wand2 className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-medium text-amber-400">Resumo da IA</span>
                </div>
                <p className="text-sm text-[var(--ds-text-primary)] leading-relaxed">
                  {summary}
                </p>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--ds-text-muted)]">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <span className="text-sm">Carregando...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--ds-text-muted)]">
                <AlertCircle className="h-6 w-6 mb-2 text-red-400" />
                <span className="text-sm">{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchMemories}
                  className="mt-2 text-xs"
                >
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <>
                {/* SEÇÃO 1: Perfil (Dados do Dispara) */}
                {profile && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-primary-400">
                      <FileText className="h-3.5 w-3.5" />
                      Perfil Cadastrado
                    </div>
                    <div className="rounded-lg border border-primary-500/20 bg-primary-500/5 p-3 space-y-2.5">
                      {profile.name && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-3.5 w-3.5 text-[var(--ds-text-muted)]" />
                          <span className="text-[var(--ds-text-primary)]">{profile.name}</span>
                        </div>
                      )}
                      {profile.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-3.5 w-3.5 text-[var(--ds-text-muted)]" />
                          <span className="text-[var(--ds-text-secondary)]">{profile.email}</span>
                        </div>
                      )}
                      {profile.tags && profile.tags.length > 0 && (
                        <div className="flex items-start gap-2 text-sm">
                          <Tag className="h-3.5 w-3.5 text-[var(--ds-text-muted)] mt-0.5" />
                          <div className="flex flex-wrap gap-1">
                            {profile.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-300 text-[10px] font-medium"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {profile.createdAt && (
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-[var(--ds-text-muted)]" />
                          <span className="text-[var(--ds-text-muted)] text-xs">
                            Cliente desde {formatDate(profile.createdAt)}
                          </span>
                        </div>
                      )}
                      {/* Custom fields */}
                      {profile.customFields && Object.keys(profile.customFields).length > 0 && (
                        <div className="pt-2 border-t border-primary-500/10 space-y-1.5">
                          {Object.entries(profile.customFields).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between text-xs">
                              <span className="text-[var(--ds-text-muted)] capitalize">{key.replace(/_/g, ' ')}</span>
                              <span className="text-[var(--ds-text-secondary)]">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SEÇÃO 2: Memórias (Mem0) */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-violet-400">
                    <Brain className="h-3.5 w-3.5" />
                    Memórias da IA
                    {memories.length > 0 && (
                      <span className="text-[var(--ds-text-muted)] font-normal">({memories.length})</span>
                    )}
                  </div>

                  {memories.length === 0 ? (
                    <div className="rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] p-4 text-center">
                      <Sparkles className="h-5 w-5 text-violet-400 mx-auto mb-2" />
                      <p className="text-xs text-[var(--ds-text-muted)]">
                        Nenhuma memória ainda. A IA vai aprender conforme as conversas acontecem.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {memories.map((memory, index) => (
                        <div
                          key={memory.id || index}
                          className="rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] p-3 group relative"
                        >
                          <p className="text-sm text-[var(--ds-text-primary)] leading-relaxed pr-8">
                            {memory.memory}
                          </p>
                          {memory.created_at && (
                            <p className="text-[10px] text-[var(--ds-text-muted)] mt-1.5">
                              {formatDate(memory.created_at)}
                            </p>
                          )}
                          <button
                            onClick={() => handleDeleteSingle(memory.id)}
                            disabled={deletingId === memory.id}
                            className="absolute top-2.5 right-2.5 p-1.5 rounded-md text-[var(--ds-text-muted)] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                            title="Remover memória"
                          >
                            {deletingId === memory.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dica */}
                {(profile || memories.length > 0) && (
                  <div className="rounded-lg bg-[var(--ds-bg-tertiary)] border border-[var(--ds-border-subtle)] p-3 overflow-hidden">
                    <p className="text-xs text-[var(--ds-text-muted)] leading-relaxed break-words">
                      <strong className="text-[var(--ds-text-secondary)]">Dica:</strong> Use estas informações para personalizar o atendimento. O cliente não precisa repetir o que já sabemos.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar memórias?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação vai apagar todas as {memories.length} memória(s) que o sistema tem sobre{' '}
              <strong>{contactName}</strong>.
              <br /><br />
              O sistema vai começar a aprender do zero. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Limpando...
                </>
              ) : (
                'Limpar memórias'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
