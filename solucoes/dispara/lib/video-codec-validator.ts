/**
 * Validação de codecs de vídeo para WhatsApp API
 *
 * A Meta exige:
 * - Container: MP4
 * - Video codec: H.264
 * - Audio codec: AAC (ou sem áudio)
 *
 * Esta validação usa a Web API para detectar codecs incompatíveis
 * ANTES do upload, evitando erros tardios da Meta.
 */

export interface VideoValidationResult {
  valid: boolean
  videoCodec: string | null
  audioCodec: string | null
  hasAudio: boolean
  error?: string
  warning?: string
}

/**
 * Detecta se o navegador suporta a API VideoDecoder (para funcionalidades futuras)
 */
export function canValidateVideoCodec(): boolean {
  return typeof window !== 'undefined' && 'VideoDecoder' in window
}

/**
 * Extrai informações básicas de codec de um arquivo de vídeo MP4
 * usando parsing de bytes do container MP4 (sem dependências externas).
 *
 * Limitação: Esta é uma validação best-effort. Alguns casos edge
 * podem passar, mas a maioria dos problemas comuns será detectada.
 */
export async function validateVideoCodecs(file: File): Promise<VideoValidationResult> {
  try {
    const buffer = await file.arrayBuffer()
    const analysis = analyzeMP4Buffer(new Uint8Array(buffer))

    // Validar video codec
    if (analysis.videoCodec && !isH264Codec(analysis.videoCodec)) {
      return {
        valid: false,
        videoCodec: analysis.videoCodec,
        audioCodec: analysis.audioCodec,
        hasAudio: analysis.hasAudio,
        error: 'Formato de vídeo incompatível. Exporte o vídeo novamente no formato H.264.',
      }
    }

    // Validar audio codec (se houver áudio)
    if (analysis.hasAudio) {
      // Caso 1: Codec de áudio identificado mas não é AAC
      if (analysis.audioCodec && !isAACCodec(analysis.audioCodec)) {
        return {
          valid: false,
          videoCodec: analysis.videoCodec,
          audioCodec: analysis.audioCodec,
          hasAudio: true,
          error: 'Formato de áudio incompatível. Exporte o vídeo novamente com áudio AAC.',
        }
      }

      // Caso 2: Tem trilha de áudio mas não conseguimos identificar o codec
      if (!analysis.audioCodec) {
        return {
          valid: false,
          videoCodec: analysis.videoCodec,
          audioCodec: 'desconhecido',
          hasAudio: true,
          error: 'Formato de áudio não reconhecido. Exporte o vídeo novamente com áudio AAC.',
        }
      }
    }

    // Vídeo sem áudio é permitido, mas pode causar problemas em alguns casos
    if (!analysis.hasAudio) {
      return {
        valid: true,
        videoCodec: analysis.videoCodec,
        audioCodec: null,
        hasAudio: false,
        warning: 'Vídeo sem trilha de áudio detectado. Pode funcionar, mas considere adicionar áudio AAC se houver problemas.',
      }
    }

    return {
      valid: true,
      videoCodec: analysis.videoCodec,
      audioCodec: analysis.audioCodec,
      hasAudio: analysis.hasAudio,
    }
  } catch (err) {
    // Em caso de erro na análise, deixa a Meta validar
    console.warn('Erro ao analisar codecs do vídeo:', err)
    return {
      valid: true,
      videoCodec: null,
      audioCodec: null,
      hasAudio: false,
      warning: 'Não foi possível analisar os codecs. O vídeo será validado pela Meta.',
    }
  }
}

// ============================================================================
// Funções auxiliares para análise do MP4
// ============================================================================

interface MP4Analysis {
  videoCodec: string | null
  audioCodec: string | null
  hasAudio: boolean
}

/**
 * Analisa o buffer do MP4 para extrair informações de codec.
 * Faz parsing básico dos atoms/boxes do MP4.
 */
function analyzeMP4Buffer(buffer: Uint8Array): MP4Analysis {
  const result: MP4Analysis = {
    videoCodec: null,
    audioCodec: null,
    hasAudio: false,
  }

  try {
    // Procurar por boxes de codec no MP4
    const codecs = findCodecBoxes(buffer)

    // Identificar codecs
    for (const codec of codecs) {
      const codecLower = codec.toLowerCase()

      // Video codecs
      if (codecLower.startsWith('avc') || codecLower === 'h264') {
        result.videoCodec = codec
      } else if (codecLower.startsWith('hvc') || codecLower.startsWith('hev') || codecLower === 'h265') {
        result.videoCodec = codec
      } else if (codecLower.startsWith('vp0') || codecLower.startsWith('vp8') || codecLower.startsWith('vp9')) {
        result.videoCodec = codec
      } else if (codecLower.startsWith('av01')) {
        result.videoCodec = codec
      }
      // Audio codecs
      else if (codecLower.startsWith('mp4a') || codecLower === 'aac') {
        result.audioCodec = codec
        result.hasAudio = true
      } else if (codecLower.startsWith('ac-3') || codecLower.startsWith('ec-3')) {
        result.audioCodec = codec
        result.hasAudio = true
      } else if (codecLower.startsWith('opus')) {
        result.audioCodec = codec
        result.hasAudio = true
      } else if (codecLower.startsWith('mp3') || codecLower === '.mp3') {
        result.audioCodec = codec
        result.hasAudio = true
      }
      // PCM variants (não comprimido - não suportado pela Meta)
      else if (
        codecLower === 'fpcm' ||
        codecLower === 'ipcm' ||
        codecLower === 'lpcm' ||
        codecLower === 'sowt' ||
        codecLower === 'twos' ||
        codecLower === 'alaw' ||
        codecLower === 'ulaw' ||
        codecLower === 'none' ||
        codecLower === 'raw '
      ) {
        result.audioCodec = `PCM (${codec})`
        result.hasAudio = true
      }
    }

    // Se não encontrou codecs específicos, tentar detectar presença de áudio
    if (!result.hasAudio) {
      result.hasAudio = hasAudioTrack(buffer)
    }
  } catch {
    // Silently fail - deixa a Meta validar
  }

  return result
}

/**
 * Procura por boxes de codec no MP4 (avc1, mp4a, etc.)
 */
function findCodecBoxes(buffer: Uint8Array): string[] {
  const codecs: string[] = []
  const knownCodecBoxes = [
    'avc1', 'avc2', 'avc3', 'avc4', // H.264
    'hvc1', 'hev1', // H.265/HEVC
    'vp08', 'vp09', // VP8/VP9
    'av01', // AV1
    'mp4a', // AAC
    'ac-3', 'ec-3', // Dolby
    'Opus', 'opus', // Opus
    '.mp3', // MP3
    'fpcm', 'ipcm', 'lpcm', 'sowt', 'twos', 'alaw', 'ulaw', // PCM variants (não comprimido)
    'NONE', 'raw ', // Raw audio
  ]

  // Procurar por cada codec box conhecido
  for (const boxType of knownCodecBoxes) {
    const boxBytes = new TextEncoder().encode(boxType)
    for (let i = 4; i < buffer.length - 4; i++) {
      let match = true
      for (let j = 0; j < boxBytes.length && i + j < buffer.length; j++) {
        if (buffer[i + j] !== boxBytes[j]) {
          match = false
          break
        }
      }
      if (match) {
        codecs.push(boxType)
        break
      }
    }
  }

  return codecs
}

/**
 * Verifica se há uma trilha de áudio no MP4 (procura por 'soun' handler)
 */
function hasAudioTrack(buffer: Uint8Array): boolean {
  // Procurar por 'soun' (sound handler) ou 'mdia' + 'minf' + 'smhd' (sound media header)
  const soundMarkers = ['soun', 'smhd']

  for (const marker of soundMarkers) {
    const markerBytes = new TextEncoder().encode(marker)
    for (let i = 0; i < buffer.length - markerBytes.length; i++) {
      let match = true
      for (let j = 0; j < markerBytes.length; j++) {
        if (buffer[i + j] !== markerBytes[j]) {
          match = false
          break
        }
      }
      if (match) return true
    }
  }

  return false
}

/**
 * Verifica se o codec é H.264 compatível
 */
function isH264Codec(codec: string): boolean {
  const c = codec.toLowerCase()
  return c.startsWith('avc') || c === 'h264'
}

/**
 * Verifica se o codec é AAC compatível
 */
function isAACCodec(codec: string): boolean {
  const c = codec.toLowerCase()
  return c.startsWith('mp4a') || c === 'aac'
}

// ============================================================================
// Mensagens de erro user-friendly
// ============================================================================

/** Link para conversor online de vídeo */
export const VIDEO_CONVERTER_URL = 'https://cloudconvert.com/mp4-converter'

/**
 * Gera mensagem de erro user-friendly para problemas de codec
 */
export function getCodecErrorMessage(result: VideoValidationResult): string {
  if (result.valid) return ''

  if (result.error) return result.error

  // Mensagens simplificadas sem jargões técnicos
  const hasVideoIssue = result.videoCodec && !isH264Codec(result.videoCodec)
  const hasAudioIssue = result.audioCodec && !isAACCodec(result.audioCodec)

  if (hasVideoIssue && hasAudioIssue) {
    return 'Formato de vídeo e áudio incompatíveis. Exporte o vídeo novamente no formato H.264 com áudio AAC.'
  }

  if (hasVideoIssue) {
    return 'Formato de vídeo incompatível. Exporte o vídeo novamente no formato H.264.'
  }

  if (hasAudioIssue) {
    return 'Formato de áudio incompatível. Exporte o vídeo novamente com áudio AAC.'
  }

  return 'Formato de vídeo incompatível. Exporte o vídeo novamente no formato H.264 com áudio AAC.'
}

/**
 * Gera mensagem de erro com link para conversor
 */
export function getCodecErrorMessageWithLink(result: VideoValidationResult): {
  message: string
  converterUrl: string
} {
  return {
    message: getCodecErrorMessage(result),
    converterUrl: VIDEO_CONVERTER_URL,
  }
}

/**
 * Detecta problema de codec a partir de mensagem de erro da Meta
 */
export function isCodecErrorFromMeta(errorDetails: string): {
  isCodecError: boolean
  videoCodec?: string
  audioCodec?: string
} {
  const details = String(errorDetails || '').toLowerCase()

  // Padrão: "videoCodec=h264, audioCodec=unknown"
  const videoMatch = details.match(/videocodec\s*=\s*(\w+)/i)
  const audioMatch = details.match(/audiocodec\s*=\s*(\w+)/i)

  const hasCodecInfo = Boolean(videoMatch || audioMatch)
  const isUnknownCodec = details.includes('unknown') || details.includes('unsupported')

  return {
    isCodecError: hasCodecInfo && isUnknownCodec,
    videoCodec: videoMatch?.[1],
    audioCodec: audioMatch?.[1],
  }
}
