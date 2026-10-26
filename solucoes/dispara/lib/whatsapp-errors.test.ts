import { describe, it, expect } from 'vitest'

import {
  mapWhatsAppError,
  isPaymentError,
  isRateLimitError,
  isRetryableError,
  getErrorCategory,
  getUserFriendlyMessage,
  getRecommendedAction,
  getUserFriendlyMessageForMetaError,
  getRecommendedActionForMetaError,
  normalizeMetaErrorTextForStorage,
} from './whatsapp-errors'

describe('whatsapp-errors', () => {
  it('deve mapear erro conhecido corretamente', () => {
    const error = mapWhatsAppError(131042)
    expect(error.category).toBe('payment')
    expect(error.retryable).toBe(false)
  })

  it('deve mapear erro desconhecido como unknown', () => {
    const error = mapWhatsAppError(999999)
    expect(error.category).toBe('unknown')
    expect(error.userMessage).toContain('999999')
  })

  it('deve identificar erros de pagamento e rate limit', () => {
    expect(isPaymentError(131042)).toBe(true)
    expect(isRateLimitError(130429)).toBe(true)
  })

  it('deve identificar erros retryable', () => {
    expect(isRetryableError(131000)).toBe(true)
    expect(isRetryableError(131042)).toBe(false)
  })

  it('deve retornar categoria, mensagem e ação', () => {
    expect(getErrorCategory(131056)).toBe('rate_limit')
    expect(getUserFriendlyMessage(131056)).toContain('Muitas mensagens')
    expect(getRecommendedAction(131056)).toContain('Aguarde')
  })

  it('deve normalizar e truncar texto da Meta', () => {
    const raw = '   Texto   com   muitos   espaços   '
    const normalized = normalizeMetaErrorTextForStorage(raw, 10)
    expect(normalized).toBe('Texto com…')
  })

  it('deve preferir detalhes da Meta na mensagem amigável', () => {
    const message = getUserFriendlyMessageForMetaError({
      code: 131052,
      details: 'Falha ao baixar mídia do weblink. HTTP code 403',
    })

    expect(message).toContain('403')
  })

  it('deve incluir detalhes em ação quando rate limit', () => {
    const action = getRecommendedActionForMetaError({
      code: 130429,
      details: 'Too many requests for this WABA',
    })

    expect(action).toContain('Meta:')
  })

  // Testes para detecção de codec de vídeo
  describe('detecção de erro de codec', () => {
    it('detecta audioCodec=unknown e retorna mensagem específica', () => {
      const result = getUserFriendlyMessageForMetaError({
        code: 131053,
        title: 'Media upload error',
        message: 'Failed to process video',
        details:
          'Video file uploaded with mimetype as video/mp4, however on processing it is of type video/mp4, videoCodec=h264, audioCodec=unknown. Please choose a different file.',
      })

      expect(result).toContain('Formato de áudio incompatível')
      expect(result).toContain('AAC')
    })

    it('detecta videoCodec=unknown e retorna mensagem específica', () => {
      const result = getUserFriendlyMessageForMetaError({
        code: 131053,
        details: 'videoCodec=unknown, audioCodec=aac',
      })

      expect(result).toContain('Formato de vídeo incompatível')
      expect(result).toContain('H.264')
    })

    it('detecta H.265/HEVC e sugere conversão', () => {
      const result = getUserFriendlyMessageForMetaError({
        code: 131053,
        details: 'videoCodec=hevc, audioCodec=aac',
      })

      expect(result).toContain('H.265')
      expect(result).toContain('não é suportado')
    })

    it('detecta VP9 e sugere conversão', () => {
      const result = getUserFriendlyMessageForMetaError({
        code: 131053,
        details: 'videoCodec=vp9, audioCodec=opus',
      })

      expect(result).toContain('não suportado')
      expect(result).toContain('H.264')
    })

    it('não detecta erro de codec quando codecs são válidos', () => {
      const result = getUserFriendlyMessageForMetaError({
        code: 131053,
        details: 'videoCodec=h264, audioCodec=aac',
      })

      // Deve retornar mensagem padrão do erro 131053
      expect(result).toContain('Erro ao fazer upload')
    })

    it('é case-insensitive na detecção de codec', () => {
      const result = getUserFriendlyMessageForMetaError({
        code: 131053,
        details: 'VIDEOCODEC=H264, AUDIOCODEC=UNKNOWN',
      })

      expect(result).toContain('Formato de áudio incompatível')
    })
  })
})
