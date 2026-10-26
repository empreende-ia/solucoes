'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Page, PageHeader, PageTitle, PageDescription } from '@/components/ui/page'
import { manualDraftsService } from '@/services/manualDraftsService'
import { ManualTemplateBuilder } from '@/components/features/templates/ManualTemplateBuilder'
import { CreateTemplateSchema } from '@/lib/whatsapp/validators/template.schema'

export default function ManualDraftEditorPage({
  params,
}: {
  // Em páginas client do Next, `params` pode ser Promise.
  // Precisamos desempacotar com `React.use()` antes de acessar as propriedades.
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { id } = React.use(params)

  // Em Client Components, o HTML pode ser renderizado no servidor.
  // Não podemos executar fetch autenticado (cookies do browser) durante SSR.
  // Então habilitamos a query apenas após o componente montar no browser.
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const draftQuery = useQuery({
    queryKey: ['templates', 'drafts', 'manual', id],
    queryFn: async () => manualDraftsService.get(id),
    enabled: mounted && !!id,
  })

  const updateMutation = useMutation({
    mutationFn: async (spec: unknown) => manualDraftsService.update(id, { spec }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] })
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual', id] })
      toast.success('Rascunho salvo')
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar rascunho'),
  })

  const submitMutation = useMutation({
    mutationFn: async () => manualDraftsService.submit(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] })
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success(`Enviado para a Meta (${res.status || 'PENDING'})`)
      router.push('/templates')
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao enviar'),
  })

  const draft = draftQuery.data
  const loadErrorMessage = draftQuery.error instanceof Error ? draftQuery.error.message : 'Erro desconhecido'

  const shouldShowLoading = !mounted || draftQuery.isLoading

  const getCurrentSpec = () => {
    const cached = queryClient.getQueryData(['templates', 'drafts', 'manual', id]) as any
    return cached?.spec ?? draft?.spec
  }

  const validation = (() => {
    const spec: any = getCurrentSpec() || {}
    const issues: string[] = []

    const name = String(spec?.name || '').trim()
    const bodyText = typeof spec?.body?.text === 'string' ? spec.body.text : ''

    if (!name) issues.push('Defina um nome para o modelo')
    if (name && !/^[a-z0-9_]+$/.test(name)) issues.push('Nome inválido (use apenas a-z, 0-9 e _)')
    if (!bodyText.trim()) issues.push('Corpo é obrigatório')

    if (!issues.length) {
      const parsed = CreateTemplateSchema.safeParse(spec)
      if (!parsed.success) {
        const schemaIssues = parsed.error.issues.map((issue) => issue.message).filter(Boolean)
        issues.push(...schemaIssues)
      }
    }

    return {
      canSend: issues.length === 0,
      issues: Array.from(new Set(issues)),
    }
  })()

  const handleSaveDraft = async () => {
    const spec = getCurrentSpec()
    if (!spec) {
      toast.error('Nada para salvar')
      return
    }
    await updateMutation.mutateAsync(spec)
  }

  const handleSend = async () => {
    if (!validation.canSend) {
      const message = validation.issues.length ? validation.issues.join('\n') : 'Revise o template antes de enviar'
      toast.error('Revise o template antes de enviar', {
        description: message,
      })
      return
    }

    const spec = getCurrentSpec()
    if (!spec) {
      toast.error('Nada para enviar')
      return
    }

    // Garante que o rascunho no banco está atualizado antes de submeter.
    await updateMutation.mutateAsync(spec)
    await submitMutation.mutateAsync()
  }

  return (
    <Page>
      <PageHeader>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <div>
            <PageTitle>Novo template</PageTitle>
            <PageDescription>
              Crie seu template e envie pra aprovação.
            </PageDescription>
          </div>
        </div>
      </PageHeader>

      <div>
        {shouldShowLoading ? (
        <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[var(--ds-shadow-lg)] text-[var(--ds-text-secondary)] flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando rascunho...
        </div>
      ) : draftQuery.isError ? (
        <div className="rounded-2xl border border-amber-400 dark:border-amber-400/30 bg-amber-100 dark:bg-amber-500/10 p-6 shadow-[var(--ds-shadow-lg)] text-amber-700 dark:text-amber-200 space-y-3">
          <div className="font-medium">Falha ao carregar rascunho.</div>
          <div className="text-sm text-amber-600 dark:text-amber-200/90 whitespace-pre-wrap">{loadErrorMessage}</div>
          <div>
            <Button
              variant="outline"
              onClick={() => draftQuery.refetch()}
              className="border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
            >
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : !draft ? (
        <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[var(--ds-shadow-lg)] text-[var(--ds-text-secondary)]">
          Rascunho não encontrado.
        </div>
      ) : (
        <ManualTemplateBuilder
          id={draft.id}
          initialSpec={draft.spec}
          onSpecChange={(spec) => {
            // Otimista: mantém o spec no cache para o botão Salvar usar
            queryClient.setQueryData(['templates', 'drafts', 'manual', id], (prev: any) => ({ ...prev, spec }))
          }}
          onFinish={() => {
            void handleSend()
          }}
          isFinishing={updateMutation.isPending || submitMutation.isPending}
          onSaveDraft={() => {
            void handleSaveDraft()
          }}
          isSaving={updateMutation.isPending}
        />
      )}
      </div>
    </Page>
  )
}
