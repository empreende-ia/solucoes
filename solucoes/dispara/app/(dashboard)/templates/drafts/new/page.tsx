'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Page, PageHeader, PageTitle, PageDescription } from '@/components/ui/page'
import { manualDraftsService } from '@/services/manualDraftsService'
import { ManualTemplateBuilder } from '@/components/features/templates/ManualTemplateBuilder'
import { CreateTemplateSchema } from '@/lib/whatsapp/validators/template.schema'

/**
 * Gera um nome de template baseado na data/hora atual.
 * Formato: template_YYYYMMDD_HHMM
 */
function generateDefaultName(): string {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return `template_${stamp}`
}

/**
 * Página para criar um NOVO template do zero.
 * Diferente de /drafts/[id], aqui NÃO existe rascunho no banco ainda.
 * O rascunho só é criado quando o usuário clica em "Salvar Rascunho".
 */
export default function NewTemplatePage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  // Spec local - ainda não existe no banco
  const [localSpec, setLocalSpec] = React.useState<any>(() => ({
    name: generateDefaultName(),
    language: 'pt_BR',
    category: 'MARKETING',
    parameter_format: 'positional',
    body: { text: '' },
    header: null,
    footer: null,
    buttons: [],
    carousel: null,
    limited_time_offer: null,
  }))

  // Mutation para criar o rascunho no banco
  const createMutation = useMutation({
    mutationFn: async (spec: any) => {
      // Primeiro cria o rascunho com os dados básicos
      const draft = await manualDraftsService.create({
        name: spec.name,
        language: spec.language || 'pt_BR',
        category: spec.category || 'MARKETING',
        parameterFormat: spec.parameter_format || 'positional',
      })
      // Depois atualiza com o spec completo
      await manualDraftsService.update(draft.id, { spec })
      return draft
    },
    onSuccess: (draft) => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] })
      toast.success('Rascunho salvo')
      // Redireciona para a página de edição com ID
      router.push(`/templates/drafts/${encodeURIComponent(draft.id)}`)
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar rascunho'),
  })

  // Mutation para criar e já submeter
  const createAndSubmitMutation = useMutation({
    mutationFn: async (spec: any) => {
      // Primeiro cria o rascunho
      const draft = await manualDraftsService.create({
        name: spec.name,
        language: spec.language || 'pt_BR',
        category: spec.category || 'MARKETING',
        parameterFormat: spec.parameter_format || 'positional',
      })
      // Atualiza com o spec completo
      await manualDraftsService.update(draft.id, { spec })
      // Submete para a Meta
      const result = await manualDraftsService.submit(draft.id)
      return { draft, result }
    },
    onSuccess: ({ result }) => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] })
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success(`Enviado para a Meta (${result.status || 'PENDING'})`)
      router.push('/templates')
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao enviar'),
  })

  const validation = React.useMemo(() => {
    const spec = localSpec || {}
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
  }, [localSpec])

  const handleSaveDraft = async () => {
    if (!localSpec) {
      toast.error('Nada para salvar')
      return
    }
    await createMutation.mutateAsync(localSpec)
  }

  const handleSend = async () => {
    if (!validation.canSend) {
      const message = validation.issues.length ? validation.issues.join('\n') : 'Revise o template antes de enviar'
      toast.error('Revise o template antes de enviar', {
        description: message,
      })
      return
    }

    if (!localSpec) {
      toast.error('Nada para enviar')
      return
    }

    await createAndSubmitMutation.mutateAsync(localSpec)
  }

  const isPending = createMutation.isPending || createAndSubmitMutation.isPending

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
        <ManualTemplateBuilder
          id="new"
          initialSpec={localSpec}
          onSpecChange={(spec) => setLocalSpec(spec)}
          onFinish={() => void handleSend()}
          isFinishing={isPending}
          onSaveDraft={() => void handleSaveDraft()}
          isSaving={createMutation.isPending}
        />
      </div>
    </Page>
  )
}
