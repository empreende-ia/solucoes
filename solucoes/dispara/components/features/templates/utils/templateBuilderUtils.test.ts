import { describe, it, expect } from 'vitest'
import {
  normalizeButtons,
  countButtonsByType,
  countChars,
  formatBytes,
  clampText,
  splitPhone,
  joinPhone,
  newButtonForType,
  ensureBaseSpec,
  variableCount,
  variableOccurrences,
  extractPlaceholderTokens,
  missingPositionalTokens,
  validateNamedTokens,
  validateCarouselSpec,
  textHasEdgeParameter,
  stripAllPlaceholders,
  sanitizePlaceholdersByMode,
  nextPositionalVariable,
  wrapSelection,
  insertAt,
  defaultBodyExamples,
} from './templateBuilderUtils'

// ============================================================================
// normalizeButtons
// ============================================================================

describe('normalizeButtons', () => {
  it('should return empty array for non-array input', () => {
    expect(normalizeButtons(null as any)).toEqual([])
    expect(normalizeButtons(undefined as any)).toEqual([])
    expect(normalizeButtons({} as any)).toEqual([])
    expect(normalizeButtons('string' as any)).toEqual([])
  })

  it('should return empty array for empty input', () => {
    expect(normalizeButtons([])).toEqual([])
  })

  it('should put QUICK_REPLY buttons first', () => {
    const input = [
      { type: 'URL', text: 'Link' },
      { type: 'QUICK_REPLY', text: 'Reply 1' },
      { type: 'PHONE_NUMBER', text: 'Call' },
      { type: 'QUICK_REPLY', text: 'Reply 2' },
    ]
    const result = normalizeButtons(input)
    expect(result[0].type).toBe('QUICK_REPLY')
    expect(result[1].type).toBe('QUICK_REPLY')
    expect(result[2].type).toBe('URL')
    expect(result[3].type).toBe('PHONE_NUMBER')
  })

  it('should handle array with only QUICK_REPLY buttons', () => {
    const input = [
      { type: 'QUICK_REPLY', text: 'Reply 1' },
      { type: 'QUICK_REPLY', text: 'Reply 2' },
    ]
    const result = normalizeButtons(input)
    expect(result).toEqual(input)
  })

  it('should handle array with no QUICK_REPLY buttons', () => {
    const input = [
      { type: 'URL', text: 'Link' },
      { type: 'PHONE_NUMBER', text: 'Call' },
    ]
    const result = normalizeButtons(input)
    expect(result).toEqual(input)
  })

  it('should handle null items in array', () => {
    const input = [null, { type: 'QUICK_REPLY', text: 'Reply' }, undefined, { type: 'URL', text: 'Link' }]
    const result = normalizeButtons(input as any)
    expect(result[0].type).toBe('QUICK_REPLY')
    expect(result.length).toBe(4)
  })
})

// ============================================================================
// countButtonsByType
// ============================================================================

describe('countButtonsByType', () => {
  it('should return 0 for non-array input', () => {
    expect(countButtonsByType(null as any, 'URL')).toBe(0)
    expect(countButtonsByType(undefined as any, 'URL')).toBe(0)
    expect(countButtonsByType({} as any, 'URL')).toBe(0)
  })

  it('should return 0 for empty array', () => {
    expect(countButtonsByType([], 'URL')).toBe(0)
  })

  it('should count buttons of specified type', () => {
    const buttons = [
      { type: 'URL', text: 'Link 1' },
      { type: 'URL', text: 'Link 2' },
      { type: 'QUICK_REPLY', text: 'Reply' },
      { type: 'PHONE_NUMBER', text: 'Call' },
    ]
    expect(countButtonsByType(buttons, 'URL')).toBe(2)
    expect(countButtonsByType(buttons, 'QUICK_REPLY')).toBe(1)
    expect(countButtonsByType(buttons, 'PHONE_NUMBER')).toBe(1)
    expect(countButtonsByType(buttons, 'COPY_CODE')).toBe(0)
  })

  it('should handle null items in array', () => {
    const buttons = [null, { type: 'URL', text: 'Link' }, undefined]
    expect(countButtonsByType(buttons as any, 'URL')).toBe(1)
  })
})

// ============================================================================
// countChars
// ============================================================================

describe('countChars', () => {
  it('should count characters in string', () => {
    expect(countChars('hello')).toBe(5)
    expect(countChars('hello world')).toBe(11)
  })

  it('should return 0 for empty string', () => {
    expect(countChars('')).toBe(0)
  })

  it('should handle null and undefined', () => {
    expect(countChars(null)).toBe(0)
    expect(countChars(undefined)).toBe(0)
  })

  it('should convert numbers to string and count', () => {
    expect(countChars(12345)).toBe(5)
    expect(countChars(0)).toBe(1)
  })

  it('should handle unicode characters', () => {
    expect(countChars('cafe')).toBe(4)
    expect(countChars('ola mundo')).toBe(9)
  })
})

// ============================================================================
// formatBytes
// ============================================================================

describe('formatBytes', () => {
  it('should format bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(10240)).toBe('10.0 KB')
  })

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB')
    expect(formatBytes(1572864)).toBe('1.5 MB')
  })

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB')
  })

  it('should handle negative values', () => {
    expect(formatBytes(-100)).toBe('0 B')
  })

  it('should handle NaN and Infinity', () => {
    expect(formatBytes(NaN)).toBe('0 B')
    expect(formatBytes(Infinity)).toBe('0 B')
    expect(formatBytes(-Infinity)).toBe('0 B')
  })

  it('should handle null/undefined coerced to number', () => {
    expect(formatBytes(null as any)).toBe('0 B')
    expect(formatBytes(undefined as any)).toBe('0 B')
  })
})

// ============================================================================
// clampText
// ============================================================================

describe('clampText', () => {
  it('should return original text if under max', () => {
    expect(clampText('hello', 10)).toBe('hello')
    expect(clampText('hello', 5)).toBe('hello')
  })

  it('should truncate text if over max', () => {
    expect(clampText('hello world', 5)).toBe('hello')
    expect(clampText('hello world', 8)).toBe('hello wo')
  })

  it('should handle empty string', () => {
    expect(clampText('', 10)).toBe('')
    expect(clampText('', 0)).toBe('')
  })

  it('should handle max of 0', () => {
    expect(clampText('hello', 0)).toBe('')
  })
})

// ============================================================================
// splitPhone
// ============================================================================

describe('splitPhone', () => {
  it('should split Brazilian phone numbers', () => {
    expect(splitPhone('5511999999999')).toEqual({ country: '55', number: '11999999999' })
    expect(splitPhone('+5511999999999')).toEqual({ country: '55', number: '11999999999' })
    expect(splitPhone('55 11 99999-9999')).toEqual({ country: '55', number: '11999999999' })
  })

  it('should split US phone numbers', () => {
    expect(splitPhone('12125551234')).toEqual({ country: '1', number: '2125551234' })
    expect(splitPhone('+1 212 555 1234')).toEqual({ country: '1', number: '2125551234' })
  })

  it('should default to Brazil for unknown codes', () => {
    expect(splitPhone('999999999')).toEqual({ country: '55', number: '999999999' })
  })

  it('should treat numbers starting with 1 as US code', () => {
    // Numbers starting with 1 are interpreted as US country code
    expect(splitPhone('11999999999')).toEqual({ country: '1', number: '1999999999' })
  })

  it('should handle empty/null input', () => {
    expect(splitPhone('')).toEqual({ country: '55', number: '' })
    expect(splitPhone(null as any)).toEqual({ country: '55', number: '' })
    expect(splitPhone(undefined as any)).toEqual({ country: '55', number: '' })
  })

  it('should strip non-digit characters', () => {
    expect(splitPhone('+55 (11) 99999-9999')).toEqual({ country: '55', number: '11999999999' })
  })
})

// ============================================================================
// joinPhone
// ============================================================================

describe('joinPhone', () => {
  it('should join country code and number', () => {
    expect(joinPhone('55', '11999999999')).toBe('5511999999999')
    expect(joinPhone('1', '2125551234')).toBe('12125551234')
  })

  it('should strip non-digit characters', () => {
    expect(joinPhone('+55', '(11) 99999-9999')).toBe('5511999999999')
  })

  it('should handle empty values', () => {
    expect(joinPhone('', '')).toBe('')
    expect(joinPhone('55', '')).toBe('55')
    expect(joinPhone('', '999999999')).toBe('999999999')
  })

  it('should handle null/undefined', () => {
    expect(joinPhone(null as any, null as any)).toBe('')
    expect(joinPhone(undefined as any, undefined as any)).toBe('')
  })
})

// ============================================================================
// newButtonForType
// ============================================================================

describe('newButtonForType', () => {
  it('should create URL button', () => {
    const btn = newButtonForType('URL')
    expect(btn.type).toBe('URL')
    expect(btn.text).toBe('')
    expect(btn.url).toBe('https://')
  })

  it('should create PHONE_NUMBER button', () => {
    const btn = newButtonForType('PHONE_NUMBER')
    expect(btn.type).toBe('PHONE_NUMBER')
    expect(btn.text).toBe('')
    expect(btn.phone_number).toBe('')
  })

  it('should create COPY_CODE button', () => {
    const btn = newButtonForType('COPY_CODE')
    expect(btn.type).toBe('COPY_CODE')
    expect(btn.text).toBe('Copiar código')
    expect(btn.example).toBe('CODE123')
  })

  it('should create OTP button', () => {
    const btn = newButtonForType('OTP')
    expect(btn.type).toBe('OTP')
    expect(btn.otp_type).toBe('COPY_CODE')
    expect(btn.text).toBe('Copiar código')
  })

  it('should create FLOW button', () => {
    const btn = newButtonForType('FLOW')
    expect(btn.type).toBe('FLOW')
    expect(btn.text).toBe('')
    expect(btn.flow_id).toBe('')
    expect(btn.flow_action).toBe('navigate')
  })

  it('should create default button for other types', () => {
    const quickReply = newButtonForType('QUICK_REPLY')
    expect(quickReply.type).toBe('QUICK_REPLY')
    expect(quickReply.text).toBe('')

    const flow = newButtonForType('FLOW')
    expect(flow.type).toBe('FLOW')
    expect(flow.text).toBe('')
  })
})

// ============================================================================
// ensureBaseSpec
// ============================================================================

describe('ensureBaseSpec', () => {
  it('should create default spec from null/undefined', () => {
    const spec = ensureBaseSpec(null)
    expect(spec.name).toBe('novo_template')
    expect(spec.language).toBe('pt_BR')
    expect(spec.category).toBe('MARKETING')
    expect(spec.parameter_format).toBe('positional')
    expect(spec.body).toEqual({ text: '' })
    expect(spec.header).toBeNull()
    expect(spec.footer).toBeNull()
    expect(spec.buttons).toEqual([])
    expect(spec.carousel).toBeNull()
    expect(spec.limited_time_offer).toBeNull()
  })

  it('should preserve existing values', () => {
    const input = {
      name: 'custom_template',
      language: 'en_US',
      category: 'UTILITY',
      parameter_format: 'named',
      body: { text: 'Hello' },
      header: { format: 'TEXT', text: 'Title' },
      footer: { text: 'Footer' },
      buttons: [{ type: 'URL', text: 'Link' }],
    }
    const spec = ensureBaseSpec(input)
    expect(spec.name).toBe('custom_template')
    expect(spec.language).toBe('en_US')
    expect(spec.category).toBe('UTILITY')
    expect(spec.parameter_format).toBe('named')
    expect(spec.body).toEqual({ text: 'Hello' })
    expect(spec.header).toEqual({ format: 'TEXT', text: 'Title' })
    expect(spec.footer).toEqual({ text: 'Footer' })
  })

  it('should convert content to body', () => {
    const input = { content: 'Hello World' }
    const spec = ensureBaseSpec(input)
    expect(spec.body).toEqual({ text: 'Hello World' })
  })

  it('should handle non-object input', () => {
    expect(ensureBaseSpec('string')).toHaveProperty('name', 'novo_template')
    expect(ensureBaseSpec(123)).toHaveProperty('name', 'novo_template')
    expect(ensureBaseSpec([])).toHaveProperty('name', 'novo_template')
  })
})

// ============================================================================
// variableCount
// ============================================================================

describe('variableCount', () => {
  it('should count unique variables', () => {
    expect(variableCount('Hello {{1}}')).toBe(1)
    expect(variableCount('Hello {{1}} and {{2}}')).toBe(2)
    expect(variableCount('{{name}} is {{age}} years old')).toBe(2)
  })

  it('should count duplicate variables once', () => {
    expect(variableCount('{{1}} and {{1}}')).toBe(1)
    expect(variableCount('{{name}} likes {{name}}')).toBe(1)
  })

  it('should return 0 for no variables', () => {
    expect(variableCount('Hello World')).toBe(0)
    expect(variableCount('')).toBe(0)
  })

  it('should handle variables with whitespace', () => {
    expect(variableCount('Hello {{ 1 }}')).toBe(1)
    expect(variableCount('{{ name }} and {{  name  }}')).toBe(2) // Different due to whitespace
  })
})

// ============================================================================
// variableOccurrences
// ============================================================================

describe('variableOccurrences', () => {
  it('should count all variable occurrences', () => {
    expect(variableOccurrences('Hello {{1}}')).toBe(1)
    expect(variableOccurrences('Hello {{1}} and {{2}}')).toBe(2)
  })

  it('should count duplicate variables multiple times', () => {
    expect(variableOccurrences('{{1}} and {{1}}')).toBe(2)
    expect(variableOccurrences('{{name}} likes {{name}}')).toBe(2)
  })

  it('should return 0 for no variables', () => {
    expect(variableOccurrences('Hello World')).toBe(0)
    expect(variableOccurrences('')).toBe(0)
  })
})

// ============================================================================
// extractPlaceholderTokens
// ============================================================================

describe('extractPlaceholderTokens', () => {
  it('should extract placeholder tokens', () => {
    expect(extractPlaceholderTokens('Hello {{name}}')).toEqual(['name'])
    expect(extractPlaceholderTokens('{{1}} and {{2}}')).toEqual(['1', '2'])
  })

  it('should trim whitespace from tokens', () => {
    expect(extractPlaceholderTokens('Hello {{ name }}')).toEqual(['name'])
    expect(extractPlaceholderTokens('{{  1  }}')).toEqual(['1'])
  })

  it('should return empty array for no placeholders', () => {
    expect(extractPlaceholderTokens('Hello World')).toEqual([])
    expect(extractPlaceholderTokens('')).toEqual([])
  })

  it('should include duplicates', () => {
    expect(extractPlaceholderTokens('{{name}} and {{name}}')).toEqual(['name', 'name'])
  })
})

// ============================================================================
// missingPositionalTokens
// ============================================================================

describe('missingPositionalTokens', () => {
  it('should find missing positional tokens', () => {
    expect(missingPositionalTokens(['1', '3'])).toEqual([2])
    expect(missingPositionalTokens(['1', '4'])).toEqual([2, 3])
    expect(missingPositionalTokens(['2', '5'])).toEqual([1, 3, 4])
  })

  it('should return empty for sequential tokens', () => {
    expect(missingPositionalTokens(['1', '2', '3'])).toEqual([])
    expect(missingPositionalTokens(['1'])).toEqual([])
  })

  it('should return empty for no numeric tokens', () => {
    expect(missingPositionalTokens(['name', 'age'])).toEqual([])
    expect(missingPositionalTokens([])).toEqual([])
  })

  it('should ignore non-numeric tokens', () => {
    expect(missingPositionalTokens(['1', 'name', '3'])).toEqual([2])
  })

  it('should ignore zero and negative numbers', () => {
    expect(missingPositionalTokens(['0', '1', '3'])).toEqual([2])
  })
})

// ============================================================================
// validateNamedTokens
// ============================================================================

describe('validateNamedTokens', () => {
  it('should validate proper named tokens', () => {
    const result = validateNamedTokens('Hello {{name}} and {{age}}')
    expect(result.invalid).toEqual([])
    expect(result.duplicates).toEqual([])
  })

  it('should detect invalid tokens', () => {
    const result = validateNamedTokens('Hello {{Name}} and {{123}}')
    expect(result.invalid).toContain('Name')
    expect(result.invalid).toContain('123')
  })

  it('should detect duplicate tokens', () => {
    const result = validateNamedTokens('{{name}} likes {{name}}')
    expect(result.duplicates).toEqual(['name'])
  })

  it('should detect invalid starting characters', () => {
    const result = validateNamedTokens('{{_name}} and {{1name}}')
    expect(result.invalid).toContain('_name')
    expect(result.invalid).toContain('1name')
  })

  it('should allow underscores in middle', () => {
    const result = validateNamedTokens('{{first_name}} and {{last_name}}')
    expect(result.invalid).toEqual([])
  })

  it('should handle empty text', () => {
    const result = validateNamedTokens('')
    expect(result.invalid).toEqual([])
    expect(result.duplicates).toEqual([])
  })
})

// ============================================================================
// validateCarouselSpec
// ============================================================================

describe('validateCarouselSpec', () => {
  it('should return empty array for null/undefined', () => {
    expect(validateCarouselSpec(null)).toEqual([])
    expect(validateCarouselSpec(undefined)).toEqual([])
  })

  it('should require cards array', () => {
    const errors = validateCarouselSpec({})
    expect(errors).toContain('Carousel precisa de uma lista "cards".')
  })

  it('should require 2-10 cards', () => {
    expect(validateCarouselSpec({ cards: [{}] })).toContain('Carousel precisa ter entre 2 e 10 cards.')

    const manyCards = Array(11).fill({
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Text' },
      ],
    })
    expect(validateCarouselSpec({ cards: manyCards })).toContain('Carousel precisa ter entre 2 e 10 cards.')
  })

  it('should require header and body for each card', () => {
    const carousel = {
      cards: [
        { components: [] },
        { components: [] },
      ],
    }
    const errors = validateCarouselSpec(carousel)
    expect(errors).toContain('Card 1: header é obrigatório.')
    expect(errors).toContain('Card 1: body é obrigatório.')
    expect(errors).toContain('Card 2: header é obrigatório.')
    expect(errors).toContain('Card 2: body é obrigatório.')
  })

  it('should require IMAGE or VIDEO header format', () => {
    const carousel = {
      cards: [
        {
          components: [
            { type: 'HEADER', format: 'TEXT' },
            { type: 'BODY', text: 'Text' },
          ],
        },
        {
          components: [
            { type: 'HEADER', format: 'DOCUMENT' },
            { type: 'BODY', text: 'Text' },
          ],
        },
      ],
    }
    const errors = validateCarouselSpec(carousel)
    expect(errors).toContain('Card 1: header deve ser IMAGE ou VIDEO.')
    expect(errors).toContain('Card 2: header deve ser IMAGE ou VIDEO.')
  })

  it('should limit buttons to 2 per card', () => {
    const carousel = {
      cards: [
        {
          components: [
            { type: 'HEADER', format: 'IMAGE' },
            { type: 'BODY', text: 'Text' },
            { type: 'BUTTONS', buttons: [{}, {}, {}] },
          ],
        },
        {
          components: [
            { type: 'HEADER', format: 'IMAGE' },
            { type: 'BODY', text: 'Text' },
          ],
        },
      ],
    }
    const errors = validateCarouselSpec(carousel)
    expect(errors).toContain('Card 1: máximo de 2 botões.')
  })

  it('should pass valid carousel', () => {
    const carousel = {
      cards: [
        {
          components: [
            { type: 'HEADER', format: 'IMAGE' },
            { type: 'BODY', text: 'Card 1' },
            { type: 'BUTTONS', buttons: [{}, {}] },
          ],
        },
        {
          components: [
            { type: 'HEADER', format: 'VIDEO' },
            { type: 'BODY', text: 'Card 2' },
          ],
        },
      ],
    }
    const errors = validateCarouselSpec(carousel)
    expect(errors).toEqual([])
  })
})

// ============================================================================
// textHasEdgeParameter
// ============================================================================

describe('textHasEdgeParameter', () => {
  it('should detect parameter at start', () => {
    expect(textHasEdgeParameter('{{1}} Hello')).toEqual({ starts: true, ends: false })
    expect(textHasEdgeParameter('{{ name }} World')).toEqual({ starts: true, ends: false })
  })

  it('should detect parameter at end', () => {
    expect(textHasEdgeParameter('Hello {{1}}')).toEqual({ starts: false, ends: true })
    expect(textHasEdgeParameter('World {{ name }}')).toEqual({ starts: false, ends: true })
  })

  it('should detect parameters at both edges', () => {
    expect(textHasEdgeParameter('{{1}} Hello {{2}}')).toEqual({ starts: true, ends: true })
    expect(textHasEdgeParameter('{{name}}')).toEqual({ starts: true, ends: true })
  })

  it('should return false for parameters in middle only', () => {
    expect(textHasEdgeParameter('Hello {{1}} World')).toEqual({ starts: false, ends: false })
  })

  it('should return false for no parameters', () => {
    expect(textHasEdgeParameter('Hello World')).toEqual({ starts: false, ends: false })
  })

  it('should return false for empty/whitespace only', () => {
    expect(textHasEdgeParameter('')).toEqual({ starts: false, ends: false })
    expect(textHasEdgeParameter('   ')).toEqual({ starts: false, ends: false })
  })

  it('should handle whitespace around text', () => {
    expect(textHasEdgeParameter('  {{1}} Hello  ')).toEqual({ starts: true, ends: false })
    expect(textHasEdgeParameter('  Hello {{1}}  ')).toEqual({ starts: false, ends: true })
  })
})

// ============================================================================
// stripAllPlaceholders
// ============================================================================

describe('stripAllPlaceholders', () => {
  it('should remove all placeholders', () => {
    expect(stripAllPlaceholders('Hello {{name}}')).toBe('Hello ')
    expect(stripAllPlaceholders('{{1}} and {{2}}')).toBe(' and ')
  })

  it('should handle no placeholders', () => {
    expect(stripAllPlaceholders('Hello World')).toBe('Hello World')
  })

  it('should handle empty string', () => {
    expect(stripAllPlaceholders('')).toBe('')
  })

  it('should handle whitespace in placeholders', () => {
    expect(stripAllPlaceholders('Hello {{ name }}')).toBe('Hello ')
  })
})

// ============================================================================
// sanitizePlaceholdersByMode
// ============================================================================

describe('sanitizePlaceholdersByMode', () => {
  describe('positional mode', () => {
    it('should keep numeric placeholders', () => {
      expect(sanitizePlaceholdersByMode('Hello {{1}}', 'positional')).toBe('Hello {{1}}')
      expect(sanitizePlaceholdersByMode('{{1}} and {{2}}', 'positional')).toBe('{{1}} and {{2}}')
    })

    it('should remove named placeholders', () => {
      expect(sanitizePlaceholdersByMode('Hello {{name}}', 'positional')).toBe('Hello ')
      expect(sanitizePlaceholdersByMode('{{1}} and {{name}}', 'positional')).toBe('{{1}} and ')
    })

    it('should normalize whitespace', () => {
      expect(sanitizePlaceholdersByMode('Hello {{ 1 }}', 'positional')).toBe('Hello {{1}}')
    })
  })

  describe('named mode', () => {
    it('should keep valid named placeholders', () => {
      expect(sanitizePlaceholdersByMode('Hello {{name}}', 'named')).toBe('Hello {{name}}')
      expect(sanitizePlaceholdersByMode('{{first_name}} {{last_name}}', 'named')).toBe('{{first_name}} {{last_name}}')
    })

    it('should remove numeric placeholders', () => {
      expect(sanitizePlaceholdersByMode('Hello {{1}}', 'named')).toBe('Hello ')
    })

    it('should remove invalid named placeholders', () => {
      expect(sanitizePlaceholdersByMode('Hello {{Name}}', 'named')).toBe('Hello ')
      expect(sanitizePlaceholdersByMode('Hello {{_name}}', 'named')).toBe('Hello ')
      expect(sanitizePlaceholdersByMode('Hello {{1name}}', 'named')).toBe('Hello ')
    })

    it('should normalize whitespace', () => {
      expect(sanitizePlaceholdersByMode('Hello {{ name }}', 'named')).toBe('Hello {{name}}')
    })
  })

  it('should handle empty string', () => {
    expect(sanitizePlaceholdersByMode('', 'positional')).toBe('')
    expect(sanitizePlaceholdersByMode('', 'named')).toBe('')
  })
})

// ============================================================================
// nextPositionalVariable
// ============================================================================

describe('nextPositionalVariable', () => {
  it('should return next number after max', () => {
    expect(nextPositionalVariable('Hello {{1}}')).toBe(2)
    expect(nextPositionalVariable('{{1}} and {{2}}')).toBe(3)
    expect(nextPositionalVariable('{{3}} and {{1}}')).toBe(4)
  })

  it('should return 1 for no variables', () => {
    expect(nextPositionalVariable('Hello World')).toBe(1)
    expect(nextPositionalVariable('')).toBe(1)
  })

  it('should ignore named variables', () => {
    expect(nextPositionalVariable('Hello {{name}}')).toBe(1)
  })

  it('should handle mixed variables', () => {
    expect(nextPositionalVariable('{{1}} and {{name}}')).toBe(2)
  })

  it('should handle whitespace in variables', () => {
    expect(nextPositionalVariable('Hello {{ 2 }}')).toBe(3)
  })
})

// ============================================================================
// wrapSelection
// ============================================================================

describe('wrapSelection', () => {
  it('should wrap selection with same left and right', () => {
    const result = wrapSelection('hello world', 0, 5, '*')
    expect(result.value).toBe('*hello* world')
    expect(result.nextStart).toBe(1)
    expect(result.nextEnd).toBe(6)
  })

  it('should wrap selection with different left and right', () => {
    const result = wrapSelection('hello world', 0, 5, '{{', '}}')
    expect(result.value).toBe('{{hello}} world')
    expect(result.nextStart).toBe(2)
    expect(result.nextEnd).toBe(7)
  })

  it('should handle empty selection', () => {
    const result = wrapSelection('hello world', 5, 5, '*')
    expect(result.value).toBe('hello** world')
    expect(result.nextStart).toBe(6)
    expect(result.nextEnd).toBe(6)
  })

  it('should handle selection at end', () => {
    const result = wrapSelection('hello world', 6, 11, '*')
    expect(result.value).toBe('hello *world*')
    expect(result.nextStart).toBe(7)
    expect(result.nextEnd).toBe(12)
  })

  it('should handle full text selection', () => {
    const result = wrapSelection('hello', 0, 5, '[', ']')
    expect(result.value).toBe('[hello]')
    expect(result.nextStart).toBe(1)
    expect(result.nextEnd).toBe(6)
  })
})

// ============================================================================
// insertAt
// ============================================================================

describe('insertAt', () => {
  it('should insert at beginning', () => {
    const result = insertAt('world', 0, 'hello ')
    expect(result.value).toBe('hello world')
    expect(result.nextPos).toBe(6)
  })

  it('should insert at end', () => {
    const result = insertAt('hello', 5, ' world')
    expect(result.value).toBe('hello world')
    expect(result.nextPos).toBe(11)
  })

  it('should insert in middle', () => {
    const result = insertAt('helloworld', 5, ' ')
    expect(result.value).toBe('hello world')
    expect(result.nextPos).toBe(6)
  })

  it('should handle empty string', () => {
    const result = insertAt('', 0, 'hello')
    expect(result.value).toBe('hello')
    expect(result.nextPos).toBe(5)
  })

  it('should handle empty insert', () => {
    const result = insertAt('hello', 2, '')
    expect(result.value).toBe('hello')
    expect(result.nextPos).toBe(2)
  })
})

// ============================================================================
// defaultBodyExamples
// ============================================================================

describe('defaultBodyExamples', () => {
  it('should return undefined for no variables', () => {
    expect(defaultBodyExamples('Hello World')).toBeUndefined()
    expect(defaultBodyExamples('')).toBeUndefined()
  })

  it('should return examples for single variable', () => {
    const result = defaultBodyExamples('Hello {{1}}')
    expect(result).toEqual([['Exemplo 1']])
  })

  it('should return examples for multiple variables', () => {
    const result = defaultBodyExamples('{{1}} and {{2}} and {{3}}')
    expect(result).toEqual([['Exemplo 1', 'Exemplo 2', 'Exemplo 3']])
  })

  it('should count unique variables only', () => {
    const result = defaultBodyExamples('{{1}} and {{1}}')
    expect(result).toEqual([['Exemplo 1']])
  })

  it('should handle named variables', () => {
    const result = defaultBodyExamples('Hello {{name}} and {{age}}')
    expect(result).toEqual([['Exemplo 1', 'Exemplo 2']])
  })
})
