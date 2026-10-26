import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Onboarding/Configurações: o resultado do POST /api/settings/meta-app precisa
 * chegar ao usuário. Antes o onboarding (DashboardShell.handleSaveCredentials) só
 * fazia console.warn no 400 de App Secret recusado — e o App ID também sumia.
 */

const toastMock = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

import { saveMetaAppConfigWithFeedback } from '@/components/shared/save-meta-app-config'

const fetchMock = vi.fn()

function apiResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  toastMock.error.mockReset()
  toastMock.warning.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('saveMetaAppConfigWithFeedback', () => {
  it('CENÁRIO DO ACHADO: App Secret recusado (400) → toast de erro com a mensagem da API, sem lançar', async () => {
    const message =
      'O App ID foi salvo, mas o App Secret não confere com ele e NÃO foi salvo. Copie o App Secret do mesmo App (não use o Client Token).'
    fetchMock.mockResolvedValue(apiResponse(400, { error: message, code: 'invalid_app_secret', appIdSaved: true }))

    await expect(saveMetaAppConfigWithFeedback({ appId: '123456', appSecret: 'client-token' })).resolves.toBe(false)

    expect(toastMock.error).toHaveBeenCalledTimes(1)
    expect(toastMock.error).toHaveBeenCalledWith(message)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/settings/meta-app')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ appId: '123456', appSecret: 'client-token' })
  })

  it('erro de rede → toast de erro genérico', async () => {
    fetchMock.mockRejectedValue(new TypeError(''))
    await expect(saveMetaAppConfigWithFeedback({ appId: '1', appSecret: '' })).resolves.toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/App ID\/App Secret da Meta/))
  })

  it('secret salvo sem validação na Graph → mostra o warning da API', async () => {
    fetchMock.mockResolvedValue(
      apiResponse(200, {
        success: true,
        appId: '123456',
        hasAppSecret: true,
        appSecretValidation: 'unavailable',
        warning: 'Não foi possível validar o App Secret com a Meta agora.',
      })
    )

    await expect(saveMetaAppConfigWithFeedback({ appId: '123456', appSecret: 's' })).resolves.toBe(true)
    expect(toastMock.warning).toHaveBeenCalledWith('Não foi possível validar o App Secret com a Meta agora.')
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('sucesso sem warning → nenhum toast', async () => {
    fetchMock.mockResolvedValue(apiResponse(200, { success: true, appId: '123456', appSecretValidation: 'valid' }))
    await expect(saveMetaAppConfigWithFeedback({ appId: '123456', appSecret: 's' })).resolves.toBe(true)
    expect(toastMock.warning).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
  })
})
