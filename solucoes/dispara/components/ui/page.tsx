import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Container principal de página
 * Usa espaçamento consistente do Design System
 */
export function Page({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-8', className)} {...props} />
}

/**
 * Header da página com título e ações
 * Layout responsivo: coluna em mobile, row em desktop
 */
export function PageHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Título da página
 * Usa fonte display (Satoshi) do Design System
 */
export function PageTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn('text-heading-1', className)} {...props} />
}

/**
 * Descrição da página
 * Usa cor secundária do Design System
 */
export function PageDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-body-sm', className)} {...props} />
}

/**
 * Container para ações da página (botões, filtros)
 */
export function PageActions({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-3', className)} {...props} />
}

/**
 * Seção dentro da página
 * Espaçamento vertical consistente
 */
export function PageSection({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn('space-y-4', className)} {...props} />
}
