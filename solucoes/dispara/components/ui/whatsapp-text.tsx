import React from 'react'

type WhatsAppTextBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'codeblock'; text: string }
  | { type: 'spacer' }

const splitByTripleBackticks = (
  text: string
): Array<{ type: 'text' | 'codeblock'; value: string }> => {
  const out: Array<{ type: 'text' | 'codeblock'; value: string }> = []
  let i = 0
  while (i < text.length) {
    const start = text.indexOf('```', i)
    if (start === -1) {
      out.push({ type: 'text', value: text.slice(i) })
      break
    }
    const end = text.indexOf('```', start + 3)
    if (end === -1) {
      out.push({ type: 'text', value: text.slice(i) })
      break
    }
    if (start > i) out.push({ type: 'text', value: text.slice(i, start) })
    out.push({ type: 'codeblock', value: text.slice(start + 3, end) })
    i = end + 3
  }
  return out.filter((t) => t.value.length > 0)
}

const parseWhatsAppTextBlocks = (text: string): WhatsAppTextBlock[] => {
  const tokens = splitByTripleBackticks(text)
  const blocks: WhatsAppTextBlock[] = []

  const pushTextToken = (raw: string) => {
    const lines = raw.split(/\r?\n/)
    let i = 0
    while (i < lines.length) {
      const line = lines[i] ?? ''
      if (line.trim() === '') {
        blocks.push({ type: 'spacer' })
        i += 1
        continue
      }

      // Quote: "> texto"
      if (line.startsWith('> ')) {
        const quoteLines: string[] = []
        while (i < lines.length && (lines[i] ?? '').startsWith('> ')) {
          quoteLines.push((lines[i] ?? '').slice(2))
          i += 1
        }
        blocks.push({ type: 'quote', text: quoteLines.join('\n') })
        continue
      }

      // Bullet list: "* texto" or "- texto"
      if (/^(?:\*|-)\s+/.test(line)) {
        const items: string[] = []
        while (i < lines.length && /^(?:\*|-)\s+/.test(lines[i] ?? '')) {
          items.push((lines[i] ?? '').replace(/^(?:\*|-)\s+/, ''))
          i += 1
        }
        blocks.push({ type: 'ul', items })
        continue
      }

      // Numbered list: "1. texto"
      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = []
        while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? '')) {
          items.push((lines[i] ?? '').replace(/^\d+\.\s+/, ''))
          i += 1
        }
        blocks.push({ type: 'ol', items })
        continue
      }

      // Paragraph: consume until next structural block or empty line
      const para: string[] = []
      while (i < lines.length) {
        const cur = lines[i] ?? ''
        if (cur.trim() === '') break
        if (cur.startsWith('> ') || /^(?:\*|-)\s+/.test(cur) || /^\d+\.\s+/.test(cur)) break
        para.push(cur)
        i += 1
      }
      blocks.push({ type: 'paragraph', text: para.join('\n') })
    }
  }

  for (const token of tokens) {
    if (token.type === 'codeblock') {
      blocks.push({ type: 'codeblock', text: token.value })
    } else {
      pushTextToken(token.value)
    }
  }

  while (blocks.length && blocks[blocks.length - 1]?.type === 'spacer') blocks.pop()

  return blocks
}

const renderWhatsAppInline = (text: string, keyPrefix: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = []
  let i = 0
  let key = 0

  const pushText = (value: string) => {
    if (value.length === 0) return
    nodes.push(<React.Fragment key={`${keyPrefix}-t-${key++}`}>{value}</React.Fragment>)
  }

  while (i < text.length) {
    // Inline code: `texto`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i + 1) {
        const code = text.slice(i + 1, end)
        nodes.push(
          <code
            key={`${keyPrefix}-code-${key++}`}
            className="rounded bg-black/25 px-1 py-0.5 font-mono text-[12px] text-[#e9edef]"
          >
            {code}
          </code>
        )
        i = end + 1
        continue
      }
    }

    const ch = text[i]
    if (ch === '*' || ch === '_' || ch === '~') {
      const end = text.indexOf(ch, i + 1)
      if (end > i + 1) {
        const inner = text.slice(i + 1, end)
        const innerNodes = renderWhatsAppInline(inner, `${keyPrefix}-in-${key}`)

        if (ch === '*') {
          nodes.push(
            <strong key={`${keyPrefix}-b-${key++}`} className="font-bold">
              {innerNodes}
            </strong>
          )
        } else if (ch === '_') {
          nodes.push(
            <em key={`${keyPrefix}-i-${key++}`} className="italic">
              {innerNodes}
            </em>
          )
        } else {
          nodes.push(
            <s key={`${keyPrefix}-s-${key++}`} className="line-through">
              {innerNodes}
            </s>
          )
        }

        i = end + 1
        continue
      }
    }

    const nextSpecial = (() => {
      const candidates = ['`', '*', '_', '~']
        .map((sym) => text.indexOf(sym, i + 1))
        .filter((pos) => pos !== -1)
      return candidates.length ? Math.min(...candidates) : -1
    })()

    if (nextSpecial === -1) {
      pushText(text.slice(i))
      break
    }

    pushText(text.slice(i, nextSpecial))
    i = nextSpecial
  }

  return nodes
}

export interface WhatsAppInlineTextProps {
  /** WhatsApp formatted text to render */
  text: string
  /** Additional CSS classes */
  className?: string
}

export const WhatsAppInlineText = ({
  text,
  className,
}: WhatsAppInlineTextProps) => {
  const parts = text.split(/\r?\n/)
  return (
    <span className={className}>
      {parts.map((part, idx) => (
        <React.Fragment key={`wa-ln-${idx}`}>
          {renderWhatsAppInline(part, `wa-ln-${idx}`)}
          {idx < parts.length - 1 ? <br /> : null}
        </React.Fragment>
      ))}
    </span>
  )
}

export interface WhatsAppFormattedBodyProps {
  /** WhatsApp formatted text to render as structured blocks */
  text: string
}

export const WhatsAppFormattedBody = ({ text }: WhatsAppFormattedBodyProps) => {
  const blocks = parseWhatsAppTextBlocks(text)

  return (
    <div className="space-y-1">
      {blocks.map((b, idx) => {
        const k = `wa-${idx}`
        if (b.type === 'spacer') return <div key={k} className="h-2" />

        if (b.type === 'codeblock') {
          return (
            <pre
              key={k}
              className="overflow-x-auto whitespace-pre-wrap rounded-md bg-black/25 p-2 font-mono text-[12px] leading-relaxed text-[#e9edef]"
            >
              <code>{b.text.replace(/^\n+|\n+$/g, '')}</code>
            </pre>
          )
        }

        if (b.type === 'quote') {
          return (
            <div key={k} className="rounded-sm border-l-2 border-violet-400/40 bg-black/10 pl-3 py-0.5">
              <WhatsAppInlineText text={b.text} />
            </div>
          )
        }

        if (b.type === 'ul') {
          return (
            <div key={k} className="space-y-1">
              {b.items.map((item, itemIdx) => (
                <div key={`${k}-ul-${itemIdx}`} className="flex gap-2">
                  <span className="text-slate-400">•</span>
                  <span className="flex-1">
                    <WhatsAppInlineText text={item} />
                  </span>
                </div>
              ))}
            </div>
          )
        }

        if (b.type === 'ol') {
          return (
            <div key={k} className="space-y-1">
              {b.items.map((item, itemIdx) => (
                <div key={`${k}-ol-${itemIdx}`} className="flex gap-2">
                  <span className="min-w-4.5 text-right text-slate-400">{itemIdx + 1}.</span>
                  <span className="flex-1">
                    <WhatsAppInlineText text={item} />
                  </span>
                </div>
              ))}
            </div>
          )
        }

        return (
          <div key={k} className="leading-relaxed">
            <WhatsAppInlineText text={b.text} />
          </div>
        )
      })}
    </div>
  )
}
