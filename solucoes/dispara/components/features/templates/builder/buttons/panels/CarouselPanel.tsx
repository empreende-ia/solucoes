'use client'

import React from 'react'
import { Container } from '@/components/ui/container'
import { Textarea } from '@/components/ui/textarea'
import { Spec } from '../types'

interface CarouselPanelProps {
  spec: Spec
  update: (patch: Partial<Spec>) => void
  carouselErrors: string[]
}

export function CarouselPanel({ spec, update, carouselErrors }: CarouselPanelProps) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      const val = e.target.value.trim()
      update({ carousel: val ? JSON.parse(val) : null })
    } catch {
      // nao travar digitando
    }
  }

  return (
    <Container variant="subtle" padding="md" className="space-y-3">
      <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Carousel</div>
      <div className="text-xs text-[var(--ds-text-secondary)]">
        Editor visual completo do Carousel vem depois. Por enquanto, voce pode colar o JSON.
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-[var(--ds-text-secondary)]">JSON (carousel)</label>
        <Textarea
          value={spec.carousel ? JSON.stringify(spec.carousel, null, 2) : ''}
          onChange={handleChange}
          className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)] min-h-28 font-mono text-xs"
          placeholder="Cole aqui um JSON de carousel (opcional)"
        />
      </div>

      {carouselErrors.length > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
          {carouselErrors.map((err) => (
            <div key={err}>{err}</div>
          ))}
        </div>
      )}
    </Container>
  )
}
