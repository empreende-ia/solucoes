import { describe, it, expect } from 'vitest'
import {
  canValidateVideoCodec,
  isCodecErrorFromMeta,
  getCodecErrorMessage,
  type VideoValidationResult,
} from './video-codec-validator'

describe('video-codec-validator', () => {
  describe('canValidateVideoCodec', () => {
    it('retorna false em ambiente Node (sem VideoDecoder)', () => {
      // Em Node.js, VideoDecoder não existe
      expect(canValidateVideoCodec()).toBe(false)
    })
  })

  describe('isCodecErrorFromMeta', () => {
    it('detecta audioCodec=unknown', () => {
      const details =
        'Video file uploaded with mimetype as video/mp4, however on processing it is of type video/mp4, videoCodec=h264, audioCodec=unknown.'

      const result = isCodecErrorFromMeta(details)

      expect(result.isCodecError).toBe(true)
      expect(result.videoCodec).toBe('h264')
      expect(result.audioCodec).toBe('unknown')
    })

    it('detecta videoCodec=unknown', () => {
      const details = 'videoCodec=unknown, audioCodec=aac'

      const result = isCodecErrorFromMeta(details)

      expect(result.isCodecError).toBe(true)
      expect(result.videoCodec).toBe('unknown')
      expect(result.audioCodec).toBe('aac')
    })

    it('detecta audioCodec=unsupported', () => {
      const details = 'videoCodec=h264, audioCodec=unsupported'

      const result = isCodecErrorFromMeta(details)

      expect(result.isCodecError).toBe(true)
      expect(result.audioCodec).toBe('unsupported')
    })

    it('não detecta erro quando codecs são válidos', () => {
      const details = 'videoCodec=h264, audioCodec=aac'

      const result = isCodecErrorFromMeta(details)

      expect(result.isCodecError).toBe(false)
    })

    it('não detecta erro quando não há informação de codec', () => {
      const details = 'Some generic error message'

      const result = isCodecErrorFromMeta(details)

      expect(result.isCodecError).toBe(false)
      expect(result.videoCodec).toBeUndefined()
      expect(result.audioCodec).toBeUndefined()
    })

    it('é case-insensitive', () => {
      const details = 'VIDEOCODEC=H264, AUDIOCODEC=UNKNOWN'

      const result = isCodecErrorFromMeta(details)

      expect(result.isCodecError).toBe(true)
    })
  })

  describe('getCodecErrorMessage', () => {
    it('retorna mensagem vazia para resultado válido', () => {
      const result: VideoValidationResult = {
        valid: true,
        videoCodec: 'avc1',
        audioCodec: 'mp4a',
        hasAudio: true,
      }

      expect(getCodecErrorMessage(result)).toBe('')
    })

    it('retorna erro quando audioCodec não é AAC', () => {
      const result: VideoValidationResult = {
        valid: false,
        videoCodec: 'avc1',
        audioCodec: 'opus',
        hasAudio: true,
        error: 'Formato de áudio incompatível. Exporte o vídeo novamente com áudio AAC.',
      }

      const message = getCodecErrorMessage(result)

      expect(message).toContain('Formato de áudio incompatível')
      expect(message).toContain('AAC')
    })

    it('retorna erro quando videoCodec não é H.264', () => {
      const result: VideoValidationResult = {
        valid: false,
        videoCodec: 'hvc1',
        audioCodec: 'mp4a',
        hasAudio: true,
        error: 'Formato de vídeo incompatível. Exporte o vídeo novamente no formato H.264.',
      }

      const message = getCodecErrorMessage(result)

      expect(message).toContain('Formato de vídeo incompatível')
      expect(message).toContain('H.264')
    })

    it('sugere exportar novamente para conversão', () => {
      const result: VideoValidationResult = {
        valid: false,
        videoCodec: 'vp09',
        audioCodec: null,
        hasAudio: false,
      }

      const message = getCodecErrorMessage(result)

      expect(message).toContain('Exporte')
      expect(message).toContain('H.264')
    })

    it('detecta áudio com codec desconhecido como inválido', () => {
      const result: VideoValidationResult = {
        valid: false,
        videoCodec: 'avc1',
        audioCodec: 'desconhecido',
        hasAudio: true,
        error: 'Formato de áudio não reconhecido. Exporte o vídeo novamente com áudio AAC.',
      }

      const message = getCodecErrorMessage(result)

      expect(message).toContain('Formato de áudio não reconhecido')
      expect(message).toContain('AAC')
    })
  })
})
