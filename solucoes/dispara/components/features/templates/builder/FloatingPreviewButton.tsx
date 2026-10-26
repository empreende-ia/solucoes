'use client'

import React from 'react'
import { Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FloatingPreviewButtonProps {
  onClick: () => void
  className?: string
}

/**
 * Botao flutuante para abrir o preview do template em mobile
 * Posicionado no canto inferior direito, visivel apenas em < lg
 */
export function FloatingPreviewButton({
  onClick,
  className,
}: FloatingPreviewButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Posicionamento fixo
        'fixed bottom-6 right-6 z-40',
        // Visibilidade: apenas mobile (esconde em lg+)
        'lg:hidden',
        // Aparencia
        'flex items-center gap-2 px-4 py-3 rounded-full',
        'bg-primary-500 hover:bg-primary-600',
        'text-white font-medium text-sm',
        // Sombra e transicao
        'shadow-lg shadow-primary-500/25',
        'transition-all duration-200',
        'hover:scale-105 active:scale-95',
        className
      )}
      aria-label="Ver preview do template"
    >
      <Eye className="w-5 h-5" />
      <span>Preview</span>
    </button>
  )
}
