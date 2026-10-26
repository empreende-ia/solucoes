/**
 * Mistral OCR Provider
 *
 * Usa a API dedicada de OCR da Mistral (mistral-ocr-2512).
 * Excelente qualidade, especialmente para documentos complexos.
 *
 * Preço: ~$2.00 por 1000 páginas
 * API: https://api.mistral.ai/v1/ocr
 */

import type { OCRProvider, OCRProcessParams, OCRResult } from '../types'

const MISTRAL_OCR_API = 'https://api.mistral.ai/v1/ocr'
const MISTRAL_OCR_MODEL = 'mistral-ocr-2512'

/**
 * Estrutura de resposta da API de OCR da Mistral
 */
interface MistralOCRResponse {
  pages: Array<{
    index: number
    markdown: string
  }>
  model: string
  usage_info: {
    pages_processed: number
  }
}

/**
 * Mistral OCR Provider
 *
 * Usa a API especializada de OCR da Mistral, que processa
 * documentos página por página retornando Markdown estruturado.
 */
export class MistralOCRProvider implements OCRProvider {
  name = 'mistral'

  constructor(private apiKey: string) {}

  async process({ content, mimeType, fileName }: OCRProcessParams): Promise<OCRResult> {
    // Preparar base64
    const base64Raw =
      typeof content === 'string' ? content : Buffer.from(content).toString('base64')

    // Remover prefixo data URL se presente
    const base64 = base64Raw.includes(',') ? base64Raw.split(',')[1] : base64Raw

    // Construir data URL para a API
    const dataUrl = `data:${mimeType};base64,${base64}`

    // Determinar se é imagem ou documento
    const isImage = mimeType.startsWith('image/')

    const response = await fetch(MISTRAL_OCR_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MISTRAL_OCR_MODEL,
        document: {
          type: isImage ? 'image_url' : 'document_url',
          [isImage ? 'image_url' : 'document_url']: dataUrl,
        },
        table_format: 'markdown',
        include_image_base64: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Mistral OCR failed (${response.status}): ${errorText}`)
    }

    const result: MistralOCRResponse = await response.json()

    console.log(
      `[ocr:mistral] Processed ${result.usage_info.pages_processed} pages from ${fileName}`
    )

    // Concatenar todas as páginas com separador
    const markdown = result.pages.map((page) => page.markdown).join('\n\n---\n\n')

    return {
      markdown,
      pagesProcessed: result.usage_info.pages_processed,
      provider: this.name,
      model: MISTRAL_OCR_MODEL,
    }
  }

  async isConfigured(): Promise<boolean> {
    return !!this.apiKey
  }
}
