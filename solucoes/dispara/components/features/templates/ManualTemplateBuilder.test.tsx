import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/services/flowsService', () => {
  return {
    flowsService: {
      list: vi.fn().mockResolvedValue([]),
    },
  }
})

import { ManualTemplateBuilder } from './ManualTemplateBuilder'

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ManualTemplateBuilder', () => {
  it('permite finalizar no passo 3 e chama onFinish', async () => {
    const onFinish = vi.fn()
    const onSpecChange = vi.fn()

    const initialSpec = {
      name: 'meu_template',
      language: 'pt_BR',
      category: 'UTILITY',
      parameter_format: 'positional',
      body: { text: 'Olá {{1}}!' },
      header: null,
      footer: null,
      buttons: [],
      carousel: null,
      limited_time_offer: null,
    }

    renderWithQueryClient(
      <ManualTemplateBuilder
        id="draft_1"
        initialSpec={initialSpec}
        onSpecChange={onSpecChange}
        onFinish={onFinish}
      />,
    )

    // Passo 1 -> 2
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    // Passo 2 -> 3
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    const enviar = screen.getByRole('button', { name: 'Enviar pra Meta' }) as HTMLButtonElement
    expect(enviar.disabled).toBe(false)

    fireEvent.click(enviar)
    expect(onFinish).toHaveBeenCalledTimes(1)
  })
})
