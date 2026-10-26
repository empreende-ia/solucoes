'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  /** compact: um botão de ícone (sidebar recolhida) · segmented: par claro/escuro */
  variant?: 'compact' | 'segmented'
  className?: string
}

/**
 * Alternador de tema claro/escuro (next-themes).
 * Renderiza placeholder estável até montar para evitar hydration mismatch.
 */
export function ThemeToggle({ variant = 'segmented', className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = !mounted || resolvedTheme === 'dark'

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg text-[var(--ds-text-secondary)] transition-colors',
          'hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2',
          className
        )}
        title={isDark ? 'Tema claro' : 'Tema escuro'}
        aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      >
        {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
      </button>
    )
  }

  return (
    <div
      className={cn(
        'inline-flex w-full items-center rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] p-0.5',
        className
      )}
      role="group"
      aria-label="Tema da interface"
    >
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
          !isDark
            ? 'bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] shadow-sm'
            : 'text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)]'
        )}
        aria-pressed={!isDark}
      >
        <Sun size={13} aria-hidden="true" />
        Claro
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
          isDark
            ? 'bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] shadow-sm'
            : 'text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)]'
        )}
        aria-pressed={isDark}
      >
        <Moon size={13} aria-hidden="true" />
        Escuro
      </button>
    </div>
  )
}

export default ThemeToggle
