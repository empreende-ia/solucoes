/**
 * OCR Provider System
 *
 * Sistema flexível de OCR para converter documentos (PDF, imagens, DOCX, PPTX)
 * em Markdown antes de enviar ao Google File Search Store.
 *
 * @example
 * ```ts
 * import { processDocumentOCR, needsOCR } from '@/lib/ai/ocr'
 *
 * // Verificar se precisa de OCR
 * if (needsOCR('application/pdf')) {
 *   const { content, mimeType, ocrResult } = await processDocumentOCR(
 *     fileBuffer,
 *     'application/pdf',
 *     'documento.pdf'
 *   )
 *   // content agora é Markdown
 * }
 * ```
 */

// Re-export tipos
export * from './types'

// Re-export factory
export { getOCRProvider, getAvailableOCRProviders, type OCRProviderName } from './factory'

// Re-export providers (para uso direto se necessário)
export { GeminiOCRProvider, DEFAULT_OCR_MODEL } from './providers/gemini'
export { MistralOCRProvider } from './providers/mistral'

import { getOCRProvider, type OCRProviderName } from './factory'
import { needsOCR, type OCRResult } from './types'

/**
 * Resultado do processamento de documento
 */
export interface ProcessDocumentResult {
  /** Conteúdo processado (Markdown se OCR aplicado, original caso contrário) */
  content: string
  /** MIME type do conteúdo retornado */
  mimeType: string
  /** Resultado do OCR (presente apenas se OCR foi aplicado com sucesso) */
  ocrResult?: OCRResult
}

/**
 * Processa um documento com OCR se necessário
 *
 * Esta é a função principal do módulo. Ela:
 * 1. Verifica se o arquivo precisa de OCR (PDFs, imagens, etc.)
 * 2. Se sim, usa o provider configurado para extrair texto
 * 3. Retorna Markdown estruturado
 * 4. Se OCR falhar ou não for necessário, retorna conteúdo original
 *
 * @param content - Conteúdo do arquivo (base64 string ou ArrayBuffer)
 * @param mimeType - MIME type do arquivo original
 * @param fileName - Nome do arquivo (para logs)
 * @param preferredProvider - Provider específico (sobrescreve config)
 * @returns Conteúdo processado com metadados
 *
 * @example
 * ```ts
 * // Upload de PDF
 * const result = await processDocumentOCR(
 *   pdfBuffer,
 *   'application/pdf',
 *   'manual.pdf'
 * )
 *
 * if (result.ocrResult) {
 *   console.log(`OCR por ${result.ocrResult.provider}`)
 *   console.log(`${result.ocrResult.pagesProcessed} páginas`)
 * }
 *
 * // Usar conteúdo Markdown
 * await uploadToStore(result.content, result.mimeType)
 * ```
 */
export async function processDocumentOCR(
  content: string | ArrayBuffer,
  mimeType: string,
  fileName: string,
  preferredProvider?: OCRProviderName
): Promise<ProcessDocumentResult> {
  // Se não precisa de OCR, retorna original
  if (!needsOCR(mimeType)) {
    const textContent = typeof content === 'string' ? content : new TextDecoder().decode(content)

    return {
      content: textContent,
      mimeType,
    }
  }

  try {
    const provider = await getOCRProvider(preferredProvider)

    if (!provider) {
      console.warn(`[ocr] No OCR provider available for ${fileName}, using original content`)

      // Tentar decodificar como texto mesmo assim
      const textContent = typeof content === 'string' ? content : new TextDecoder().decode(content)

      return {
        content: textContent,
        mimeType,
      }
    }

    console.log(`[ocr] Processing ${fileName} with ${provider.name}...`)

    const result = await provider.process({ content, mimeType, fileName })

    console.log(`[ocr] Success: ${result.markdown.length} chars extracted from ${fileName}`)

    return {
      content: result.markdown,
      mimeType: 'text/markdown',
      ocrResult: result,
    }
  } catch (error) {
    console.error(`[ocr] Failed to process ${fileName}:`, error)

    // Fallback: tentar usar conteúdo original
    const textContent = typeof content === 'string' ? content : new TextDecoder().decode(content)

    return {
      content: textContent,
      mimeType,
    }
  }
}
