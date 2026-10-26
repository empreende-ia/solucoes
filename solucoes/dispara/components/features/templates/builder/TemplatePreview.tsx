'use client'

import React from 'react'
import Image from 'next/image'
import { Play, ExternalLink, CornerDownLeft, FileText, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Container } from '@/components/ui/container'
import { WhatsAppInlineText } from '@/components/ui/whatsapp-text'

type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'GIF' | 'DOCUMENT' | 'LOCATION'

type HeaderMediaPreview = {
  url: string
  format: HeaderFormat
  name: string
  mimeType: string
  size: number
}

type Spec = {
  header?: {
    format?: HeaderFormat
    text?: string
    location?: {
      latitude?: string
      longitude?: string
      name?: string
      address?: string
    }
  } | null
  body?: {
    text?: string
  }
  footer?: {
    text?: string
  } | null
  buttons?: any[]
}

interface TemplatePreviewProps {
  spec: Spec
  headerMediaPreview?: HeaderMediaPreview | null
}

export function TemplatePreview({ spec, headerMediaPreview }: TemplatePreviewProps) {
  const header = spec.header
  const bodyText = spec.body?.text || ''
  const footerText = spec.footer?.text || ''
  const buttons: any[] = Array.isArray(spec.buttons) ? spec.buttons : []

  const prettyButtonLabel = (b: any): string => {
    const t = String(b?.type || '')
    if (t === 'COPY_CODE') return b?.text || 'Copiar código'
    if (t === 'QUICK_REPLY') return b?.text || 'Quick Reply'
    return b?.text || t
  }

  const headerLabel = (() => {
    if (!header) return null
    if (header.format === 'TEXT') return header.text || ''
    if (header.format === 'LOCATION') return 'LOCALIZAÇÃO'
    return `MIDIA (${header.format})`
  })()

  const resolvedHeaderMediaPreview = (() => {
    if (!header) return null
    const format = String(header?.format || '').toUpperCase()
    if (format !== 'IMAGE' && format !== 'VIDEO' && format !== 'GIF' && format !== 'DOCUMENT') return null
    if (!headerMediaPreview) return null
    if (headerMediaPreview.format !== format) return null
    return headerMediaPreview
  })()

  return (
    <Container variant="default" padding="none" className="overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--ds-border-default)]">
        <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Prévia do modelo</div>
        <button
          type="button"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)]"
          title="Visualizar"
        >
          <Play className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6">
        {/* "telefone" */}
        <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-3">
          <div className="rounded-2xl overflow-hidden border border-[var(--ds-border-default)] bg-[#efeae2]">
            {/* header da conversa */}
            <div className="h-11 px-3 flex items-center gap-2 bg-[#075e54] text-white">
              <div className="h-7 w-7 rounded-full bg-white/20" />
              <div className="min-w-0">
                <div className="text-[12px] font-semibold leading-none truncate">Business</div>
                <div className="text-[10px] text-white/80 leading-none mt-0.5 truncate">template</div>
              </div>
            </div>

            {/* conversa */}
            <div className="p-3">
              <div className="max-w-90 rounded-xl bg-white text-slate-900 shadow-sm overflow-hidden">
                <div className="px-3 py-2">
                {header?.format === 'LOCATION' ? (
                  <div className="mb-2">
                    <div className="relative w-full h-24 rounded-lg overflow-hidden bg-gradient-to-br from-primary-100 to-primary-200 border border-slate-200">
                      {/* Grid pattern to simulate map */}
                      <div className="absolute inset-0 opacity-20" style={{
                        backgroundImage: 'linear-gradient(#059669 1px, transparent 1px), linear-gradient(90deg, #059669 1px, transparent 1px)',
                        backgroundSize: '20px 20px'
                      }} />
                      {/* Pin */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex flex-col items-center">
                          <MapPin className="w-8 h-8 text-red-500 drop-shadow-md" fill="currentColor" />
                          <div className="w-2 h-2 bg-red-500/30 rounded-full -mt-1" />
                        </div>
                      </div>
                      {/* Label */}
                      <div className="absolute bottom-1 left-1 right-1">
                        <div className="bg-white/90 rounded px-2 py-1 text-[10px] text-slate-600 text-center truncate">
                          {header.location?.name || header.location?.address || 'Configure a localização'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : resolvedHeaderMediaPreview ? (
                  <div className="mb-2">
                    {resolvedHeaderMediaPreview.format === 'IMAGE' ? (
                      <Image
                        src={resolvedHeaderMediaPreview.url}
                        alt={resolvedHeaderMediaPreview.name || 'Mídia do cabeçalho'}
                        width={360}
                        height={180}
                        unoptimized
                        className="w-full h-auto rounded-lg border border-slate-200"
                      />
                    ) : resolvedHeaderMediaPreview.format === 'VIDEO' || resolvedHeaderMediaPreview.format === 'GIF' ? (
                      <video
                        src={resolvedHeaderMediaPreview.url}
                        controls
                        muted
                        playsInline
                        className="w-full rounded-lg border border-slate-200"
                      />
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <FileText className="w-4 h-4 text-slate-600" />
                        <div className="min-w-0">
                          <div className="text-[12px] font-medium truncate">
                            {resolvedHeaderMediaPreview.name || 'documento.pdf'}
                          </div>
                          <div className="text-[10px] text-slate-500">Documento</div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : headerLabel ? (
                  <div className="text-[13px] font-semibold leading-snug">
                    {headerLabel}
                  </div>
                ) : null}

                <div className="text-[13px] leading-snug whitespace-pre-wrap">
                  {bodyText ? (
                    <WhatsAppInlineText text={bodyText} />
                  ) : (
                    <span className="text-slate-400">Digite o corpo para ver a prévia.</span>
                  )}
                </div>

                {footerText ? (
                  <div className="mt-1 text-[11px] text-slate-500 whitespace-pre-wrap">
                    <WhatsAppInlineText text={footerText} />
                  </div>
                ) : null}

                <div className="mt-1 flex items-center justify-end text-[10px] text-slate-400">
                  16:34
                </div>
                </div>

                {buttons.length > 0 ? (
                  <div className="border-t border-slate-200">
                    {buttons.map((b, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'px-3 py-3 text-center text-[13px] font-medium text-blue-600 flex items-center justify-center gap-2',
                          idx > 0 ? 'border-t border-slate-200' : ''
                        )}
                      >
                        {String(b?.type || '') === 'URL' ? (
                          <ExternalLink className="w-4 h-4" />
                        ) : String(b?.type || '') === 'QUICK_REPLY' ? (
                          <CornerDownLeft className="w-4 h-4" />
                        ) : null}
                        <span>{prettyButtonLabel(b)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Container>
  )
}
