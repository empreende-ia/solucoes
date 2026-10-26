/**
 * OCR Provider System - Tipos e Interfaces
 *
 * Sistema flexível de providers de OCR para converter documentos
 * (PDF, imagens, DOCX, PPTX) em Markdown antes de enviar ao File Search Store.
 */

/**
 * Parâmetros para processamento OCR
 */
export interface OCRProcessParams {
  /** Conteúdo do arquivo (base64 string ou ArrayBuffer) */
  content: string | ArrayBuffer
  /** MIME type do arquivo */
  mimeType: string
  /** Nome do arquivo (para logs) */
  fileName: string
}

/**
 * Resultado do processamento OCR
 */
export interface OCRResult {
  /** Conteúdo extraído em Markdown */
  markdown: string
  /** Número de páginas processadas (se aplicável) */
  pagesProcessed?: number
  /** Nome do provider usado */
  provider: string
  /** Modelo usado (se aplicável) */
  model?: string
}

/**
 * Interface que todos os OCR providers devem implementar
 */
export interface OCRProvider {
  /** Nome do provider */
  name: string

  /** Processa documento e retorna Markdown */
  process(params: OCRProcessParams): Promise<OCRResult>

  /** Verifica se o provider está configurado (tem API key) */
  isConfigured(): Promise<boolean>
}

/**
 * MIME types que precisam de processamento OCR
 */
export const OCR_MIME_TYPES = [
  // PDFs
  'application/pdf',
  // Documentos Office
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  // Imagens
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/tiff',
] as const

/**
 * Verifica se um arquivo precisa de processamento OCR
 */
export function needsOCR(mimeType: string): boolean {
  // Verifica match exato ou se é uma imagem
  return (
    OCR_MIME_TYPES.includes(mimeType as (typeof OCR_MIME_TYPES)[number]) ||
    mimeType.startsWith('image/')
  )
}
