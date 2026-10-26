/**
 * Utility functions, types, and constants for ManualTemplateBuilder
 */

// ============================================================================
// Types
// ============================================================================

export type Spec = any

export type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'GIF' | 'DOCUMENT' | 'LOCATION'

export type HeaderMediaPreview = {
  url: string
  format: HeaderFormat
  name: string
  mimeType: string
  size: number
}

// Tipos de botão suportados pela Meta API para templates
export type ButtonType =
  | 'QUICK_REPLY'
  | 'URL'
  | 'PHONE_NUMBER'
  | 'COPY_CODE'
  | 'OTP'
  | 'FLOW'

// ============================================================================
// Constants
// ============================================================================

export const allowedHeaderFormats = new Set<HeaderFormat>([
  'TEXT',
  'IMAGE',
  'VIDEO',
  'GIF',
  'DOCUMENT',
  'LOCATION',
])

// ============================================================================
// Button Functions
// ============================================================================

export function normalizeButtons(input: any[]): any[] {
  const list = Array.isArray(input) ? input : []
  const quickReplies = list.filter((b) => b?.type === 'QUICK_REPLY')
  const others = list.filter((b) => b?.type !== 'QUICK_REPLY')
  return [...quickReplies, ...others]
}

export function countButtonsByType(buttons: any[], type: ButtonType): number {
  return (Array.isArray(buttons) ? buttons : []).filter((b) => b?.type === type).length
}

export function newButtonForType(type: ButtonType): any {
  if (type === 'URL') return { type, text: '', url: 'https://' }
  if (type === 'PHONE_NUMBER') return { type, text: '', phone_number: '' }
  if (type === 'COPY_CODE') return { type, text: 'Copiar código', example: 'CODE123' }
  if (type === 'OTP') return { type, otp_type: 'COPY_CODE', text: 'Copiar código' }
  if (type === 'FLOW') return { type, text: '', flow_id: '', flow_action: 'navigate' }
  return { type, text: '' }
}

// ============================================================================
// Text & Formatting Functions
// ============================================================================

export function countChars(value: unknown): number {
  return String(value ?? '').length
}

export function formatBytes(bytes: number): string {
  const n = Number(bytes || 0)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const value = n / 1024 ** i
  const fixed = i === 0 ? value.toFixed(0) : value.toFixed(1)
  return `${fixed} ${units[i]}`
}

export function clampText(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max)
}

// ============================================================================
// Phone Functions
// ============================================================================

export function splitPhone(phone: string): { country: string; number: string } {
  const raw = String(phone || '').replace(/\s+/g, '')
  const digits = raw.replace(/\D+/g, '')
  if (!digits) return { country: '55', number: '' }
  if (digits.startsWith('55')) return { country: '55', number: digits.slice(2) }
  if (digits.startsWith('1')) return { country: '1', number: digits.slice(1) }
  return { country: '55', number: digits }
}

export function joinPhone(country: string, number: string): string {
  const c = String(country || '').replace(/\D+/g, '')
  const n = String(number || '').replace(/\D+/g, '')
  return `${c}${n}`
}

// ============================================================================
// Spec Functions
// ============================================================================

export function ensureBaseSpec(input: unknown): Spec {
  const s = input && typeof input === 'object' ? { ...(input as any) } : {}
  if (!s.name) s.name = 'novo_template'
  if (!s.language) s.language = 'pt_BR'
  if (!s.category) s.category = 'MARKETING'
  if (!s.parameter_format) s.parameter_format = 'positional'

  // body/content
  if (!s.body && typeof s.content === 'string') s.body = { text: s.content }
  if (!s.body) s.body = { text: '' }

  if (s.header === undefined) s.header = null
  if (s.footer === undefined) s.footer = null
  if (s.buttons === undefined) s.buttons = []
  if (s.carousel === undefined) s.carousel = null
  if (s.limited_time_offer === undefined) s.limited_time_offer = null

  return s
}

// ============================================================================
// Variable & Placeholder Functions
// ============================================================================

export function variableCount(text: string): number {
  const matches = text.match(/\{\{[^}]+\}\}/g) || []
  const unique = new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '')))
  return unique.size
}

export function variableOccurrences(text: string): number {
  const matches = text.match(/\{\{[^}]+\}\}/g) || []
  return matches.length
}

export function extractPlaceholderTokens(text: string): string[] {
  const matches = text.match(/\{\{\s*([^}]+)\s*\}\}/g) || []
  return matches.map((m) => m.replace(/\{\{|\}\}/g, '').trim())
}

export function missingPositionalTokens(tokens: string[]): number[] {
  const numbers = tokens
    .filter((t) => /^\d+$/.test(t))
    .map((t) => Number(t))
    .filter((n) => n >= 1)
  if (!numbers.length) return []
  const max = Math.max(...numbers)
  const set = new Set(numbers)
  const missing: number[] = []
  for (let i = 1; i <= max; i += 1) {
    if (!set.has(i)) missing.push(i)
  }
  return missing
}

export function validateNamedTokens(text: string): { invalid: string[]; duplicates: string[] } {
  const tokens = extractPlaceholderTokens(text)
  const invalid = tokens.filter((t) => !/^[a-z][a-z0-9_]*$/.test(t))
  const counts = new Map<string, number>()
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1)
  const duplicates = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([token]) => token)
  return { invalid, duplicates }
}

export function textHasEdgeParameter(text: string): { starts: boolean; ends: boolean } {
  const trimmed = text.trim()
  if (!trimmed) return { starts: false, ends: false }
  const starts = /^\{\{\s*[^}]+\s*\}\}/.test(trimmed)
  const ends = /\{\{\s*[^}]+\s*\}\}$/.test(trimmed)
  return { starts, ends }
}

export function stripAllPlaceholders(text: string): string {
  return text.replace(/\{\{[^}]+\}\}/g, '')
}

export function sanitizePlaceholdersByMode(text: string, mode: 'positional' | 'named'): string {
  return text.replace(/\{\{\s*([^}]+)\s*\}\}/g, (raw, token) => {
    const trimmed = String(token || '').trim()
    if (mode === 'positional') {
      return /^\d+$/.test(trimmed) ? `{{${trimmed}}}` : ''
    }
    return /^[a-z][a-z0-9_]*$/.test(trimmed) ? `{{${trimmed}}}` : ''
  })
}

export function nextPositionalVariable(text: string): number {
  // Encontra o maior {{n}} no texto e retorna n+1.
  // Se nao houver, comeca em 1.
  const matches = text.match(/\{\{\s*(\d+)\s*\}\}/g) || []
  let max = 0
  for (const m of matches) {
    const num = Number(m.replace(/\D+/g, ''))
    if (!Number.isNaN(num)) max = Math.max(max, num)
  }
  return max + 1
}

// ============================================================================
// Carousel Validation
// ============================================================================

export function validateCarouselSpec(carousel: any): string[] {
  if (!carousel) return []
  const errors: string[] = []
  const cards = Array.isArray(carousel.cards) ? carousel.cards : null
  if (!cards) {
    errors.push('Carousel precisa de uma lista "cards".')
    return errors
  }
  if (cards.length < 2 || cards.length > 10) {
    errors.push('Carousel precisa ter entre 2 e 10 cards.')
  }
  cards.forEach((card: any, index: number) => {
    const components = Array.isArray(card?.components) ? card.components : []
    const header = components.find(
      (c: any) => String(c?.type || '').toUpperCase() === 'HEADER'
    )
    const body = components.find((c: any) => String(c?.type || '').toUpperCase() === 'BODY')
    if (!header) errors.push(`Card ${index + 1}: header é obrigatório.`)
    if (header) {
      const format = String(header?.format || '').toUpperCase()
      if (format !== 'IMAGE' && format !== 'VIDEO') {
        errors.push(`Card ${index + 1}: header deve ser IMAGE ou VIDEO.`)
      }
    }
    if (!body) errors.push(`Card ${index + 1}: body é obrigatório.`)
    const buttonComponent = components.find(
      (c: any) => String(c?.type || '').toUpperCase() === 'BUTTONS'
    )
    const buttonCount = Array.isArray(buttonComponent?.buttons)
      ? buttonComponent.buttons.length
      : 0
    if (buttonCount > 2) {
      errors.push(`Card ${index + 1}: máximo de 2 botões.`)
    }
  })
  return errors
}

// ============================================================================
// Text Manipulation Functions
// ============================================================================

export function wrapSelection(
  value: string,
  start: number,
  end: number,
  left: string,
  right = left
): { value: string; nextStart: number; nextEnd: number } {
  const before = value.slice(0, start)
  const mid = value.slice(start, end)
  const after = value.slice(end)
  return {
    value: `${before}${left}${mid}${right}${after}`,
    nextStart: start + left.length,
    nextEnd: end + left.length,
  }
}

export function insertAt(
  value: string,
  pos: number,
  insert: string
): { value: string; nextPos: number } {
  return {
    value: `${value.slice(0, pos)}${insert}${value.slice(pos)}`,
    nextPos: pos + insert.length,
  }
}

// ============================================================================
// Example Generation
// ============================================================================

export function defaultBodyExamples(text: string): string[][] | undefined {
  const n = variableCount(text)
  if (n <= 0) return undefined
  const row = Array.from({ length: n }, (_, i) => `Exemplo ${i + 1}`)
  return [row]
}
