'use client'

import React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { TemplatePreview } from './TemplatePreview'

type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'GIF' | 'DOCUMENT' | 'LOCATION'

type HeaderMediaPreview = {
  url: string
  format: HeaderFormat
  name: string
  mimeType: string
  size: number
}

type Spec = {
  header?: {
    format?: HeaderFormat
    text?: string
  } | null
  body?: {
    text?: string
  }
  footer?: {
    text?: string
  } | null
  buttons?: any[]
}

interface PreviewDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spec: Spec
  headerMediaPreview?: HeaderMediaPreview | null
}

/**
 * Drawer lateral para visualizar o preview do template em dispositivos mobile
 * Usa o Sheet do shadcn/ui com slide-in da direita
 */
export function PreviewDrawer({
  open,
  onOpenChange,
  spec,
  headerMediaPreview,
}: PreviewDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-[var(--ds-bg-elevated)] border-l border-[var(--ds-border-subtle)] p-0 overflow-y-auto"
      >
        <SheetHeader className="px-6 py-4 border-b border-[var(--ds-border-subtle)]">
          <SheetTitle className="text-[var(--ds-text-primary)]">Preview do Template</SheetTitle>
        </SheetHeader>

        <div className="p-4">
          <TemplatePreview spec={spec} headerMediaPreview={headerMediaPreview} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
