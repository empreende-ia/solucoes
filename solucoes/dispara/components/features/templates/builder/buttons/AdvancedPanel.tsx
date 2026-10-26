'use client'

import React from 'react'
import { Container } from '@/components/ui/container'
import { Spec } from './types'
import { LimitedTimeOfferPanel } from './panels/LimitedTimeOfferPanel'
import { AuthenticationPanel } from './panels/AuthenticationPanel'
import { CarouselPanel } from './panels/CarouselPanel'

interface AdvancedPanelProps {
  spec: Spec
  header: any
  update: (patch: Partial<Spec>) => void
  carouselErrors: string[]
  limitedTimeOfferTextMissing: boolean
  limitedTimeOfferTextTooLong: boolean
  limitedTimeOfferCategoryInvalid: boolean
}

export function AdvancedPanel({
  spec,
  header,
  update,
  carouselErrors,
  limitedTimeOfferTextMissing,
  limitedTimeOfferTextTooLong,
  limitedTimeOfferCategoryInvalid,
}: AdvancedPanelProps) {
  const isMarketing = spec.category === 'MARKETING'
  const isAuthentication = spec.category === 'AUTHENTICATION'

  return (
    <Container variant="default" padding="md">
      <details>
        <summary className="cursor-pointer list-none select-none flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Avançado</div>
            <div className="text-xs text-[var(--ds-text-secondary)]">Opções menos comuns (LTO, Auth e Carousel).</div>
          </div>
          <div className="text-xs text-[var(--ds-text-muted)]">Abrir</div>
        </summary>

        <div className="mt-4 space-y-4">
          {isMarketing && (
            <LimitedTimeOfferPanel
              spec={spec}
              header={header}
              update={update}
              limitedTimeOfferTextMissing={limitedTimeOfferTextMissing}
              limitedTimeOfferTextTooLong={limitedTimeOfferTextTooLong}
              limitedTimeOfferCategoryInvalid={limitedTimeOfferCategoryInvalid}
            />
          )}

          {isAuthentication && (
            <AuthenticationPanel spec={spec} update={update} />
          )}

          {!isMarketing && !isAuthentication && (
            <div className="text-xs text-[var(--ds-text-muted)]">
              Sem opções avançadas específicas para esta categoria.
            </div>
          )}

          <CarouselPanel
            spec={spec}
            update={update}
            carouselErrors={carouselErrors}
          />
        </div>
      </details>
    </Container>
  )
}
