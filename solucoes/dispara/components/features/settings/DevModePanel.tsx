'use client'

import { Code, ExternalLink } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useDevMode } from '@/components/providers/DevModeProvider'
import Link from 'next/link'

export function DevModePanel() {
  const { isDevMode, toggleDevMode } = useDevMode()

  return (
    <div className="glass-panel rounded-2xl p-8">
      <SectionHeader
        title="Desenvolvedor"
        description="Ative para acessar ferramentas avançadas de debug e desenvolvimento."
        color="info"
        icon={Code}
        className="mb-6"
      />

      <div className="space-y-4">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--ds-text-primary)]">Modo Desenvolvedor</p>
            <p className="text-xs text-[var(--ds-text-secondary)]">
              Exibe painéis avançados e ferramentas de debug
            </p>
          </div>
          <Switch checked={isDevMode} onCheckedChange={toggleDevMode} />
        </div>

        {/* Links para rotas dev-only (só visível no dev mode) */}
        {isDevMode && (
          <div className="pt-4 border-t border-[var(--ds-border-subtle)] space-y-3">
            <p className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wider font-medium">
              Ferramentas de Desenvolvimento
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/design-system">
                <Button variant="outline" size="sm" className="gap-2">
                  <ExternalLink size={14} />
                  Design System
                </Button>
              </Link>
              <Link href="/settings/meta-diagnostics">
                <Button variant="outline" size="sm" className="gap-2">
                  <ExternalLink size={14} />
                  Meta Diagnostics
                </Button>
              </Link>
              <Link href="/settings/performance">
                <Button variant="outline" size="sm" className="gap-2">
                  <ExternalLink size={14} />
                  Performance
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
