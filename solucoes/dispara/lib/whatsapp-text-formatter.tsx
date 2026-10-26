/**
 * WhatsApp Text Formatter
 * Renderiza texto com formatação do WhatsApp (diferente de Markdown)
 *
 * Regras WhatsApp:
 * - *texto* = negrito
 * - _texto_ = itálico
 * - ~texto~ = riscado
 * - ```texto``` = monospace
 */

import React from 'react'

interface FormattedSegment {
  type: 'text' | 'bold' | 'italic' | 'strike' | 'mono'
  content: string
}

/**
 * Parse WhatsApp formatting into segments
 */
function parseWhatsAppText(text: string): FormattedSegment[] {
  const segments: FormattedSegment[] = []
  let remaining = text

  // Regex patterns for WhatsApp formatting
  // Order matters: check monospace first (triple backticks), then single char formatters
  const patterns: Array<{ regex: RegExp; type: FormattedSegment['type'] }> = [
    { regex: /```([^`]+)```/, type: 'mono' },
    { regex: /\*([^*]+)\*/, type: 'bold' },
    { regex: /_([^_]+)_/, type: 'italic' },
    { regex: /~([^~]+)~/, type: 'strike' },
  ]

  while (remaining.length > 0) {
    let earliestMatch: { index: number; length: number; content: string; type: FormattedSegment['type'] } | null = null

    // Find the earliest formatting match
    for (const { regex, type } of patterns) {
      const match = remaining.match(regex)
      if (match && match.index !== undefined) {
        if (!earliestMatch || match.index < earliestMatch.index) {
          earliestMatch = {
            index: match.index,
            length: match[0].length,
            content: match[1],
            type,
          }
        }
      }
    }

    if (earliestMatch) {
      // Add text before the match
      if (earliestMatch.index > 0) {
        segments.push({
          type: 'text',
          content: remaining.slice(0, earliestMatch.index),
        })
      }

      // Add the formatted segment
      segments.push({
        type: earliestMatch.type,
        content: earliestMatch.content,
      })

      // Continue with remaining text
      remaining = remaining.slice(earliestMatch.index + earliestMatch.length)
    } else {
      // No more matches, add remaining as plain text
      segments.push({
        type: 'text',
        content: remaining,
      })
      break
    }
  }

  return segments
}

/**
 * Render a single segment
 */
function renderSegment(segment: FormattedSegment, index: number): React.ReactNode {
  switch (segment.type) {
    case 'bold':
      return <strong key={index} className="font-semibold">{segment.content}</strong>
    case 'italic':
      return <em key={index} className="italic">{segment.content}</em>
    case 'strike':
      return <s key={index} className="line-through">{segment.content}</s>
    case 'mono':
      return (
        <code
          key={index}
          className="px-1 py-0.5 rounded bg-black/20 font-mono text-[0.9em]"
        >
          {segment.content}
        </code>
      )
    default:
      return <span key={index}>{segment.content}</span>
  }
}

/**
 * Format WhatsApp text with proper styling
 * Handles: *bold*, _italic_, ~strikethrough~, ```monospace```
 */
export function WhatsAppFormattedText({
  text,
  className = ''
}: {
  text: string
  className?: string
}): React.ReactElement {
  const segments = parseWhatsAppText(text)

  return (
    <span className={className}>
      {segments.map((segment, index) => renderSegment(segment, index))}
    </span>
  )
}

/**
 * Check if text contains any WhatsApp formatting
 */
export function hasWhatsAppFormatting(text: string): boolean {
  return /\*[^*]+\*|_[^_]+_|~[^~]+~|```[^`]+```/.test(text)
}
