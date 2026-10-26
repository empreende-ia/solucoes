import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttendantProvider } from '@/components/attendant/AttendantProvider'
import ConversaPage from '@/app/atendimento/conversa/[id]/page'

/**
 * Conversa da PWA de atendente com o banco fora desde o primeiro carregamento:
 * a tela de "Reconectando" não pode alternar com o spinner a cada nova rodada.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'conv-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const ATTENDANT = {
  id: 'att-1',
  name: 'Ana',
  permissions: { canView: true, canReply: true, canHandoff: false },
}

function jsonResponse(status: number, data: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => data,
  } as unknown as Response
}

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>()

function renderPage() {
  // retryDelay mínimo: o teste não espera o backoff padrão do react-query
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } })
  return render(
    <QueryClientProvider client={client}>
      <AttendantProvider token={null}>
        <ConversaPage />
      </AttendantProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ConversaPage com o banco indisponível', () => {
  // Cenário do achado: sem a conversa em cache, a nova rodada (polling ou "Tentar agora")
  // volta a query para 'pending' com error=null no react-query v5. Antes a página caía
  // no spinner durante os ~7s de retries e só depois voltava para "Reconectando...".
  it('"Reconectando" continua na tela durante a nova rodada, sem voltar ao spinner', async () => {
    let hangConversation = false
    let conversationCalls = 0
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith('/api/attendants/validate')) {
        return jsonResponse(200, { valid: true, attendant: ATTENDANT })
      }
      if (url.startsWith('/api/inbox/conversations/conv-1/messages')) {
        return jsonResponse(200, { messages: [], hasMore: false })
      }
      conversationCalls++
      // Nova rodada em andamento (a resposta não chega durante o teste)
      if (hangConversation) return new Promise<Response>(() => {})
      return jsonResponse(503, { error: 'Banco indisponível' }, { 'Retry-After': '5' })
    })

    const { container } = renderPage()
    expect(await screen.findByText('Reconectando...')).toBeTruthy()
    const callsBefore = conversationCalls

    hangConversation = true
    fireEvent.click(screen.getByRole('button', { name: 'Tentar agora' }))
    await waitFor(() => expect(conversationCalls).toBe(callsBefore + 1))
    // Deixa o react-query notificar e o React renderizar o estado da nova rodada
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))

    expect(screen.getByText('Reconectando...')).toBeTruthy()
    expect(screen.queryByText('Conversa não encontrada')).toBeNull()
    expect(screen.queryByText('Acesso Negado')).toBeNull()
    // Spinner de carregamento de página inteira (o "Reconectando" usa o seu, menor)
    expect(container.querySelector('.w-8.h-8.animate-spin')).toBeNull()
  })

  it('erro de verdade (404) continua "Conversa não encontrada" depois das tentativas', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith('/api/attendants/validate')) {
        return jsonResponse(200, { valid: true, attendant: ATTENDANT })
      }
      if (url.startsWith('/api/inbox/conversations/conv-1/messages')) {
        return jsonResponse(200, { messages: [], hasMore: false })
      }
      return jsonResponse(404, { error: 'not found' })
    })

    renderPage()

    expect(await screen.findByText('Conversa não encontrada')).toBeTruthy()
    expect(screen.queryByText('Reconectando...')).toBeNull()
  })
})
