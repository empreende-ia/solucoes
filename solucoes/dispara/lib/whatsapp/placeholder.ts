export type TemplateParameterFormat = 'positional' | 'named'

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function replacePositionalPlaceholders(text: string, values?: string[]): string {
  if (!text) return ''
  if (!values || !Array.isArray(values) || values.length === 0) return text

  let result = text
  values.forEach((value, index) => {
    const placeholder = `{{${index + 1}}}`
    result = result.replace(new RegExp(escapeRegExp(placeholder), 'g'), value ?? '')
  })
  return result
}

export function replaceNamedPlaceholders(text: string, values?: Record<string, string>): string {
  if (!text) return ''
  if (!values || typeof values !== 'object') return text

  // Replace only documented placeholders: {{lowercase_numbers_underscore}}
  return text.replace(/\{\{([a-z0-9_]+)\}\}/g, (full, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return full
    return values[key] ?? ''
  })
}

export function replaceTemplatePlaceholders(input: {
  text: string
  parameterFormat: TemplateParameterFormat
  positionalValues?: string[]
  namedValues?: Record<string, string>
}): string {
  const { text, parameterFormat, positionalValues, namedValues } = input
  return parameterFormat === 'named'
    ? replaceNamedPlaceholders(text, namedValues)
    : replacePositionalPlaceholders(text, positionalValues)
}

export function extractAllPlaceholders(text: string): string[] {
  const matches = text.match(/\{\{[^}]+\}\}/g) || []
  const unique: string[] = []
  for (const t of matches) {
    if (!unique.includes(t)) unique.push(t)
  }
  return unique
}
