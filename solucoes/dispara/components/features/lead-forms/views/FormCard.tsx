'use client'

import type { LeadForm } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Container } from '@/components/ui/container'
import { Pencil } from 'lucide-react'

export interface FormCardProps {
  form: LeadForm
  publicBaseUrl: string
  isCopied: boolean
  isDeleting: boolean
  onCopyLink: (url: string) => void
  onEdit: (form: LeadForm) => void
  onDelete: (id: string) => void
}

export function FormCard({
  form,
  publicBaseUrl,
  isCopied,
  isDeleting,
  onCopyLink,
  onEdit,
  onDelete,
}: FormCardProps) {
  const url = `${(publicBaseUrl || '').replace(/\/$/, '')}/f/${encodeURIComponent(form.slug)}`

  return (
    <Container variant="subtle" padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-white">{form.name}</p>
            <Badge variant={form.isActive ? 'default' : 'secondary'}>
              {form.isActive ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          <p className="text-xs text-slate-400">
            <span className="text-slate-500">Slug:</span> {form.slug} &nbsp;-&nbsp;{' '}
            <span className="text-slate-500">Tag:</span> {form.tag}
          </p>
          <p className="text-xs text-slate-400 break-all">
            <span className="text-slate-500">Link:</span> {url}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => onCopyLink(url)}
            className="border-slate-700 bg-slate-900"
          >
            {isCopied ? 'Copiado' : 'Copiar link'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => onEdit(form)}
            className="border-slate-700 bg-slate-900"
          >
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Button>
          <Button
            variant="destructive"
            onClick={() => onDelete(form.id)}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deletando...' : 'Deletar'}
          </Button>
        </div>
      </div>
    </Container>
  )
}
