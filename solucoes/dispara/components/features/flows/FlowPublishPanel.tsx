'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Trash2, Search, Eye, FileText, Check, Play } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Container } from '@/components/ui/container'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import { flowsService, type FlowRow } from '@/services/flowsService'
import { SendFlowDialog } from '@/components/features/flows/SendFlowDialog'

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('pt-BR')
}

function statusInfo(flow: FlowRow): { label: string; dsStatus: 'success' | 'warning' | 'error' | 'draft' | 'processing' } {
  const metaStatus = String(flow.meta_status || '').toUpperCase()
  const hasErrors = Array.isArray(flow.meta_validation_errors)
    ? flow.meta_validation_errors.length > 0
    : !!flow.meta_validation_errors

  if (metaStatus === 'PUBLISHED') {
    return { label: 'Publicado', dsStatus: 'success' }
  }

  if (metaStatus === 'REJECTED' || metaStatus === 'ERROR' || hasErrors) {
    return { label: 'Requer ação', dsStatus: 'error' }
  }

  if (metaStatus === 'PENDING' || metaStatus === 'IN_REVIEW') {
    return { label: 'Em revisão', dsStatus: 'processing' }
  }

  return { label: 'Rascunho', dsStatus: 'draft' }
}

export function FlowPublishPanel({
  flows,
  isLoading,
  isFetching,
  onRefresh,
}: {
  flows: FlowRow[]
  isLoading: boolean
  isFetching: boolean
  onRefresh: () => void
}) {
  const queryClient = useQueryClient()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmFlow, setConfirmFlow] = useState<FlowRow | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'review' | 'action'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [testFlowId, setTestFlowId] = useState<string | null>(null)
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false)

  const sortedFlows = useMemo(() => {
    const rows = [...(flows || [])]
    rows.sort((a, b) => {
      const da = new Date(a.updated_at || a.created_at).getTime()
      const db = new Date(b.updated_at || b.created_at).getTime()
      return db - da
    })
    return rows
  }, [flows])

  const visibleFlows = sortedFlows.filter((flow) => {
    // Filtro por busca
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      if (!flow.name.toLowerCase().includes(search)) return false
    }

    // Filtro por status
    if (statusFilter === 'all') return true
    const metaStatus = String(flow.meta_status || '').toUpperCase()
    const hasErrors = Array.isArray(flow.meta_validation_errors)
      ? flow.meta_validation_errors.length > 0
      : !!flow.meta_validation_errors

    if (statusFilter === 'draft') return !metaStatus
    if (statusFilter === 'published') return metaStatus === 'PUBLISHED'
    if (statusFilter === 'review') return metaStatus === 'PENDING' || metaStatus === 'IN_REVIEW'
    if (statusFilter === 'action') return metaStatus === 'REJECTED' || metaStatus === 'ERROR' || hasErrors
    return true
  })

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const visibleIds = new Set(visibleFlows.map((flow) => flow.id))
      let changed = false
      const next = new Set<string>()
      prev.forEach((id) => {
        if (visibleIds.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      })
      if (!changed && next.size === prev.size) return prev
      return next
    })
  }, [visibleFlows])

  const filterCounts = useMemo(() => {
    const counts = { all: sortedFlows.length, draft: 0, published: 0, review: 0, action: 0 }
    for (const flow of sortedFlows) {
      const metaStatus = String(flow.meta_status || '').toUpperCase()
      const hasErrors = Array.isArray(flow.meta_validation_errors)
        ? flow.meta_validation_errors.length > 0
        : !!flow.meta_validation_errors

      if (!metaStatus) counts.draft += 1
      if (metaStatus === 'PUBLISHED') counts.published += 1
      if (metaStatus === 'PENDING' || metaStatus === 'IN_REVIEW') counts.review += 1
      if (metaStatus === 'REJECTED' || metaStatus === 'ERROR' || hasErrors) counts.action += 1
    }
    return counts
  }, [sortedFlows])

  const selectedCount = selectedIds.size
  const allVisibleSelected = visibleFlows.length > 0 && visibleFlows.every((flow) => selectedIds.has(flow.id))

  const handleDelete = async (flow: FlowRow) => {
    try {
      setDeletingId(flow.id)
      await flowsService.remove(flow.id)
      toast.success('MiniApp excluído')
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir MiniApp')
    } finally {
      setDeletingId(null)
      setConfirmFlow(null)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    try {
      setBulkDeleting(true)
      let deleted = 0
      let failed = 0
      for (const flowId of selectedIds) {
        try {
          await flowsService.remove(flowId)
          deleted += 1
        } catch {
          failed += 1
        }
      }
      if (deleted > 0) {
        toast.success(`${deleted} MiniApp(s) excluído(s)`)
      }
      if (failed > 0) {
        toast.error(`${failed} MiniApp(s) não puderam ser excluído(s)`)
      }
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      onRefresh()
    } finally {
      setBulkDeleting(false)
      setConfirmBulkDelete(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters - mesmo padrão de Templates */}
      <Container variant="default" padding="lg" className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status filters */}
        <div
          className="flex gap-2 overflow-x-auto no-scrollbar"
          role="group"
          aria-label="Filtrar por status"
        >
          {[
            { id: 'all', label: 'Todos', count: filterCounts.all },
            { id: 'draft', label: 'Rascunho', count: filterCounts.draft },
            { id: 'published', label: 'Publicado', count: filterCounts.published },
            { id: 'review', label: 'Em revisão', count: filterCounts.review },
            { id: 'action', label: 'Requer ação', count: filterCounts.action },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id as typeof statusFilter)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap',
                statusFilter === item.id
                  ? 'border-primary-400/40 bg-primary-500/10 text-primary-200'
                  : 'border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 text-slate-400 hover:text-white',
              )}
              aria-pressed={statusFilter === item.id}
            >
              {item.label} ({item.count})
            </button>
          ))}
        </div>

        {/* Search + Selection actions */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-3 bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] rounded-xl px-4 py-3 w-full md:w-72 transition-all focus-within:border-primary-500/50 focus-within:ring-1 focus-within:ring-primary-500/50">
            <Search size={18} className="text-slate-500" aria-hidden="true" />
            <input
              type="text"
              placeholder="Buscar MiniApps..."
              className="bg-transparent border-none outline-none text-sm w-full text-white placeholder:text-slate-600"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Buscar MiniApps por nome"
            />
          </div>

          {selectedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={bulkDeleting}
            >
              <Trash2 className="h-4 w-4" />
              Excluir ({selectedCount})
            </Button>
          )}
        </div>
      </Container>

      {/* Table */}
      <Container variant="default" padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--ds-bg-surface)]/30 text-[var(--ds-text-muted)] uppercase tracking-widest text-xs">
              <tr>
                <th className="px-4 py-4 w-10">
                  <button
                    onClick={() => {
                      if (allVisibleSelected) {
                        setSelectedIds(new Set())
                      } else {
                        setSelectedIds(new Set(visibleFlows.map((flow) => flow.id)))
                      }
                    }}
                    disabled={visibleFlows.length === 0}
                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                      visibleFlows.length === 0
                        ? 'border-[var(--ds-border-subtle)] opacity-40 cursor-not-allowed'
                        : allVisibleSelected
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-[var(--ds-border-default)] hover:border-white/40'
                    }`}
                    aria-label="Selecionar todos"
                  >
                    {allVisibleSelected && visibleFlows.length > 0 && (
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-4 font-medium">Nome</th>
                <th className="px-4 py-4 font-medium">Status</th>
                <th className="px-4 py-4 font-medium">ID Meta</th>
                <th className="px-4 py-4 font-medium">Atualizado</th>
                <th className="px-4 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Carregando MiniApps...
                  </td>
                </tr>
              ) : visibleFlows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                        <Search size={24} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="text-slate-400 font-medium">
                          {sortedFlows.length === 0 ? 'Nenhum MiniApp criado' : 'Nenhum MiniApp encontrado'}
                        </p>
                        <p className="text-slate-600 text-sm mt-1">
                          {sortedFlows.length === 0
                            ? 'Crie seu primeiro MiniApp para começar'
                            : 'Tente ajustar os filtros ou buscar por outro termo'}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleFlows.map((flow) => {
                  const status = statusInfo(flow)
                  const isDeleting = deletingId === flow.id
                  const canTest = !!flow.meta_flow_id
                  return (
                    <tr key={flow.id} className={`hover:bg-[var(--ds-bg-hover)] transition-colors group cursor-pointer ${
                      selectedIds.has(flow.id) ? 'bg-primary-500/5' : ''
                    }`}>
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(flow.id)) next.delete(flow.id)
                              else next.add(flow.id)
                              return next
                            })
                          }}
                          className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                            selectedIds.has(flow.id)
                              ? 'bg-primary-500 border-primary-500'
                              : 'border-[var(--ds-border-default)] hover:border-white/40'
                          }`}
                          title={selectedIds.has(flow.id) ? 'Desmarcar' : 'Selecionar'}
                        >
                          {selectedIds.has(flow.id) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[var(--ds-bg-surface)]/30 rounded-lg text-slate-400 group-hover:text-primary-200 transition-colors">
                            <FileText size={16} />
                          </div>
                          <span
                            className="font-medium text-white group-hover:text-primary-200 transition-colors truncate max-w-50"
                            title={flow.name}
                          >
                            {flow.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={status.dsStatus} size="sm" showDot>
                          {status.label}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500 font-mono">
                        {flow.meta_flow_id || '—'}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500 font-mono whitespace-nowrap">
                        {new Date(flow.updated_at || flow.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Abrir no builder */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon-sm" asChild>
                                <Link href={`/flows/builder/${encodeURIComponent(flow.id)}`}>
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Abrir no builder</TooltipContent>
                          </Tooltip>

                          {/* Testar MiniApp - só aparece se já tem ID da Meta */}
                          {canTest && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => {
                                    setTestFlowId(flow.meta_flow_id!)
                                    setIsTestDialogOpen(true)
                                  }}
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Testar MiniApp</TooltipContent>
                            </Tooltip>
                          )}

                          {/* Excluir - último */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost-destructive"
                                size="icon-sm"
                                onClick={() => setConfirmFlow(flow)}
                                disabled={isDeleting}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Excluir MiniApp</TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Container>

      <Dialog open={!!confirmFlow} onOpenChange={(open) => !open && setConfirmFlow(null)}>
        <DialogContent className="sm:max-w-md bg-slate-900/80 border border-amber-500/20 text-white">
          <DialogHeader>
            <DialogTitle>Excluir MiniApp</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-slate-300">
            MiniApp: <span className="font-semibold">{confirmFlow?.name}</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFlow(null)} className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 text-slate-200 hover:text-white hover:bg-[var(--ds-bg-hover)]">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmFlow && handleDelete(confirmFlow)}
              disabled={!confirmFlow || deletingId === confirmFlow.id}
              className="bg-amber-500/10 text-amber-200 border border-amber-500/30 hover:bg-amber-500/15"
            >
              {deletingId === confirmFlow?.id ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmBulkDelete} onOpenChange={(open) => !open && setConfirmBulkDelete(false)}>
        <DialogContent className="sm:max-w-md bg-slate-900/80 border border-amber-500/20 text-white">
          <DialogHeader>
            <DialogTitle>Excluir MiniApps selecionados</DialogTitle>
            <DialogDescription className="text-slate-400">
              {selectedCount} MiniApp(s) serão excluído(s) permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmBulkDelete(false)}
              className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 text-slate-200 hover:text-white hover:bg-[var(--ds-bg-hover)]"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-amber-500/10 text-amber-200 border border-amber-500/30 hover:bg-amber-500/15"
            >
              {bulkDeleting ? 'Excluindo…' : 'Excluir selecionados'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para testar MiniApp */}
      <SendFlowDialog
        flows={flows}
        isLoadingFlows={isLoading}
        onRefreshFlows={onRefresh}
        open={isTestDialogOpen}
        onOpenChange={setIsTestDialogOpen}
        prefillFlowId={testFlowId || undefined}
        hideTrigger
      />
    </div>
  )
}
