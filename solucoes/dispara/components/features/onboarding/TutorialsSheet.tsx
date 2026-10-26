'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { HelpCircle, ChevronRight } from 'lucide-react'
import type { OnboardingStep } from './hooks/useOnboardingProgress'

interface TutorialItem {
  id: OnboardingStep
  number: number
  title: string
  description: string
  duration: string
  group: 'create' | 'connect' | 'start'
}

const TUTORIALS: TutorialItem[] = [
  // Grupo: Criar App
  {
    id: 'requirements',
    number: 1,
    title: 'Requisitos',
    description: 'Conta Meta Business verificada',
    duration: '2min',
    group: 'create',
  },
  {
    id: 'create-app',
    number: 2,
    title: 'Criar App Meta',
    description: 'Crie um app no Meta for Developers',
    duration: '5min',
    group: 'create',
  },
  {
    id: 'add-whatsapp',
    number: 3,
    title: 'Adicionar WhatsApp',
    description: 'Ative o produto WhatsApp Business API',
    duration: '3min',
    group: 'create',
  },
  // Grupo: Conectar
  {
    id: 'credentials',
    number: 4,
    title: 'Copiar Credenciais',
    description: 'Phone ID, Business ID e Token',
    duration: '2min',
    group: 'connect',
  },
  {
    id: 'configure-webhook',
    number: 5,
    title: 'Configurar Webhook',
    description: 'Receba notificações de entrega',
    duration: '3min',
    group: 'connect',
  },
  // Grupo: Avançado
  {
    id: 'create-permanent-token',
    number: 6,
    title: 'Token Permanente',
    description: 'Evite interrupções por expiração',
    duration: '5min',
    group: 'start',
  },
]

const GROUP_LABELS = {
  create: 'Criar App',
  connect: 'Conectar',
  start: 'Avançado',
}

interface TutorialsSheetProps {
  onOpenStep?: (step: OnboardingStep) => void
}

export function TutorialsSheet({
  onOpenStep,
}: TutorialsSheetProps) {
  const [open, setOpen] = useState(false)

  const handleStepClick = (step: OnboardingStep) => {
    setOpen(false)
    onOpenStep?.(step)
  }

  const groupedTutorials = {
    create: TUTORIALS.filter(t => t.group === 'create'),
    connect: TUTORIALS.filter(t => t.group === 'connect'),
    start: TUTORIALS.filter(t => t.group === 'start'),
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="p-1.5 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-subtle)] rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
          aria-label="Tutoriais de Configuração"
        >
          <HelpCircle size={20} />
        </button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-xl font-semibold">Tutoriais</SheetTitle>
          <p className="text-sm text-[var(--ds-text-secondary)] mt-1">
            Guias passo a passo para configurar o WhatsApp Business API
          </p>
        </SheetHeader>

        <div className="space-y-8 px-4">
          {(Object.keys(groupedTutorials) as Array<keyof typeof groupedTutorials>).map((groupKey) => (
            <div key={groupKey}>
              {/* Group header */}
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--ds-text-muted)] mb-3 px-1">
                {GROUP_LABELS[groupKey]}
              </p>

              {/* Group items */}
              <div className="space-y-2">
                {groupedTutorials[groupKey].map((tutorial) => (
                  <button
                    key={tutorial.id}
                    onClick={() => handleStepClick(tutorial.id)}
                    className="w-full text-left p-3 rounded-xl bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Number */}
                      <div className="w-6 h-6 rounded-full bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium">{tutorial.number}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[var(--ds-text-secondary)] text-sm">{tutorial.title}</p>
                        <p className="text-xs text-[var(--ds-text-muted)] mt-0.5">{tutorial.description}</p>
                      </div>

                      {/* Duration + Chevron */}
                      <div className="flex items-center gap-2 text-[var(--ds-text-muted)] flex-shrink-0">
                        <span className="text-xs">{tutorial.duration}</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

        </div>
      </SheetContent>
    </Sheet>
  )
}
