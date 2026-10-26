'use client'

import React from 'react'
import { Search, ChevronLeft, ChevronRight, Loader2, Inbox, Phone, Calendar, FileText, User, Megaphone, Download } from 'lucide-react'
import { Page, PageHeader, PageTitle, PageDescription } from '@/components/ui/page'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import { SubmissionsController } from '@/hooks/useSubmissions'
import { FlowSubmission } from '@/services/submissionsService'

interface SubmissionsViewProps {
  controller: SubmissionsController
  title?: string
  description?: string
  campaignId?: string
  flowId?: string
}

function SubmissionCard({
  submission,
  extractFormFields,
  formatPhone,
}: {
  submission: FlowSubmission
  extractFormFields: (s: FlowSubmission) => Record<string, unknown>
  formatPhone: (phone: string) => string
}) {
  const fields = extractFormFields(submission)
  const fieldEntries = Object.entries(fields)
  const createdAt = new Date(submission.created_at)

  // Dados relacionados
  const contactName = submission.contact?.name
  const contactEmail = submission.contact?.email
  const campaignName = submission.campaign?.name

  return (
    <Container variant="default" padding="lg" hover className="hover:bg-slate-900/80 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary-500/10 border border-primary-500/20">
            {contactName ? (
              <User className="w-4 h-4 text-primary-400" />
            ) : (
              <Phone className="w-4 h-4 text-primary-400" />
            )}
          </div>
          <div>
            {/* Nome do contato (se disponível) ou telefone */}
            <div className="font-medium text-white">
              {contactName || formatPhone(submission.from_phone)}
            </div>
            {/* Se tem nome, mostra telefone abaixo */}
            {contactName && (
              <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                <Phone className="w-3 h-3" />
                {formatPhone(submission.from_phone)}
                {contactEmail && (
                  <span className="ml-2 text-slate-500">• {contactEmail}</span>
                )}
              </div>
            )}
            {/* Data */}
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
              <Calendar className="w-3 h-3" />
              {createdAt.toLocaleDateString('pt-BR')} às {createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {/* Badge da campanha (se disponível) */}
        {campaignName && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Megaphone className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-300">{campaignName}</span>
          </div>
        )}
      </div>

      {/* Form Fields */}
      {fieldEntries.length > 0 ? (
        <div className="space-y-2 pl-11">
          {fieldEntries.map(([key, value]) => (
            <div key={key} className="flex items-start gap-2">
              <span className="text-xs text-slate-500 min-w-[80px] pt-0.5">{formatFieldLabel(key)}:</span>
              <span className="text-sm text-slate-200">{formatFieldValue(value)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-500 pl-11 italic">Sem dados do formulário</div>
      )}
    </Container>
  )
}

function formatFieldLabel(key: string): string {
  // Converte snake_case para Title Case
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 rounded-2xl bg-slate-800/50 mb-4">
        <Inbox className="w-8 h-8 text-slate-500" />
      </div>
      <h3 className="text-lg font-medium text-white mb-2">Nenhuma submissão encontrada</h3>
      <p className="text-sm text-slate-500 max-w-sm">
        As submissões aparecerão aqui quando os leads preencherem seus formulários MiniApp.
      </p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Container key={i} variant="default" padding="lg" className="animate-pulse">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-slate-700/50" />
            <div>
              <div className="w-32 h-5 bg-slate-700/50 rounded mb-2" />
              <div className="w-24 h-3 bg-slate-700/50 rounded" />
            </div>
          </div>
          <div className="space-y-2 pl-11">
            <div className="w-48 h-4 bg-slate-700/50 rounded" />
            <div className="w-36 h-4 bg-slate-700/50 rounded" />
          </div>
        </Container>
      ))}
    </div>
  )
}

export function SubmissionsView({
  controller,
  title = 'Submissões',
  description = 'Respostas dos formulários MiniApp',
  campaignId,
  flowId,
}: SubmissionsViewProps) {
  const {
    submissions,
    total,
    stats,
    search,
    setSearch,
    page,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    isLoading,
    extractFormFields,
    formatPhone,
  } = controller

  // Monta URL de exportação com filtros atuais
  const exportUrl = React.useMemo(() => {
    const params = new URLSearchParams()
    if (campaignId) params.set('campaignId', campaignId)
    if (flowId) params.set('flowId', flowId)
    if (search.trim()) params.set('search', search.trim())
    const queryString = params.toString()
    return `/api/submissions/export.csv${queryString ? `?${queryString}` : ''}`
  }, [campaignId, flowId, search])

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>{title}</PageTitle>
          <PageDescription>{description}</PageDescription>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)]">
            <FileText className="w-4 h-4 text-primary-400" />
            <span className="text-sm text-slate-300">
              <span className="font-semibold text-white">{total}</span> submissões
            </span>
          </div>
          {total > 0 && (
            <a
              href={exportUrl}
              download
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </a>
          )}
        </div>
      </PageHeader>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Buscar por telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)]"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : submissions.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="space-y-4">
            {submissions.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                extractFormFields={extractFormFields}
                formatPhone={formatPhone}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--ds-border-subtle)]">
              <div className="text-sm text-slate-500">
                Página {page + 1} de {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prevPage}
                  disabled={!hasPrevPage}
                  className="border-[var(--ds-border-subtle)] bg-slate-900 hover:bg-[var(--ds-bg-hover)]"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={nextPage}
                  disabled={!hasNextPage}
                  className="border-[var(--ds-border-subtle)] bg-slate-900 hover:bg-[var(--ds-bg-hover)]"
                >
                  Próxima
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Page>
  )
}
