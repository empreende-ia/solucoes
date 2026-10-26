'use client'

import React from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Code,
  Bold,
  Italic,
  Strikethrough,
  Plus,
  Loader2,
  FileText,
  Upload,
  CheckCircle2,
  Trash2,
  MapPin,
  ExternalLink,
} from 'lucide-react'
import { VIDEO_CONVERTER_URL } from '@/lib/video-codec-validator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Spec = any

type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'GIF' | 'DOCUMENT' | 'LOCATION'

type HeaderMediaPreview = {
  url: string
  format: HeaderFormat
  name: string
  mimeType: string
  size: number
}

type NamedTokenChecks = {
  invalid: string[]
  duplicates: string[]
} | null

export interface StepContentProps {
  spec: Spec
  header: any
  update: (patch: Partial<Spec>) => void
  updateHeader: (patch: any) => void
  updateFooter: (patch: any) => void
  variableMode: 'positional' | 'named'
  addVariable: (target: 'header' | 'body') => void
  applyBodyFormat: (kind: 'bold' | 'italic' | 'strike' | 'code') => void
  bodyRef: React.RefObject<HTMLTextAreaElement | null>
  headerTextRef: React.RefObject<HTMLInputElement | null>
  footerRef: React.RefObject<HTMLInputElement | null>
  // Validation states
  headerType: HeaderFormat | 'NONE'
  headerText: string
  bodyText: string
  footerText: string
  headerTextCount: number
  bodyTextCount: number
  footerTextCount: number
  bodyMaxLength: number
  headerVariableCount: number
  isHeaderVariableValid: boolean
  headerLengthExceeded: boolean
  headerTextMissing: boolean
  bodyLengthExceeded: boolean
  footerLengthExceeded: boolean
  isHeaderFormatValid: boolean
  footerHasVariables: boolean
  headerEdgeParameter: { starts: boolean; ends: boolean }
  bodyEdgeParameter: { starts: boolean; ends: boolean }
  positionalHeaderInvalid: string[]
  positionalBodyInvalid: string[]
  positionalHeaderMissing: number[]
  positionalBodyMissing: number[]
  hasInvalidNamed: boolean
  hasDuplicateNamed: boolean
  namedHeaderChecks: NamedTokenChecks
  namedBodyChecks: NamedTokenChecks
  namedFooterChecks: NamedTokenChecks
  isMarketingCategory: boolean
  isLimitedTimeOffer: boolean
  ltoHeaderInvalid: boolean
  ltoFooterInvalid: boolean
  canShowMediaSample: boolean
  headerMediaHandleValue: string
  isHeaderMediaHandleMissing: boolean
  // Media upload
  headerMediaPreview: HeaderMediaPreview | null
  setHeaderMediaPreview: React.Dispatch<React.SetStateAction<HeaderMediaPreview | null>>
  headerMediaFileInputRef: React.RefObject<HTMLInputElement | null>
  isUploadingHeaderMedia: boolean
  uploadHeaderMediaError: string | null
  uploadHeaderMedia: (file: File) => Promise<void>
  headerMediaAccept: (format: HeaderFormat | 'NONE') => string
  formatBytes: (bytes: number) => string
  // Sanitization
  sanitizePlaceholdersByMode: (text: string, mode: 'positional' | 'named') => string
  stripAllPlaceholders: (text: string) => string
  defaultBodyExamples: (text: string) => string[][] | undefined
  notifySanitized: () => void
  // Named variable dialog
  namedVarDialogOpen: boolean
  setNamedVarDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  namedVarName: string
  setNamedVarName: React.Dispatch<React.SetStateAction<string>>
  namedVarError: string | null
  setNamedVarError: React.Dispatch<React.SetStateAction<string | null>>
  confirmNamedVariable: () => void
  // Meta App ID (necessário para upload de mídia)
  hasMetaAppId?: boolean
}

export function StepContent({
  spec,
  header,
  update,
  updateHeader,
  updateFooter,
  variableMode,
  addVariable,
  applyBodyFormat,
  bodyRef,
  headerTextRef,
  footerRef,
  headerType,
  headerText,
  bodyText,
  footerText,
  headerTextCount,
  bodyTextCount,
  footerTextCount,
  bodyMaxLength,
  headerVariableCount,
  isHeaderVariableValid,
  headerLengthExceeded,
  headerTextMissing,
  bodyLengthExceeded,
  footerLengthExceeded,
  isHeaderFormatValid,
  footerHasVariables,
  headerEdgeParameter,
  bodyEdgeParameter,
  positionalHeaderInvalid,
  positionalBodyInvalid,
  positionalHeaderMissing,
  positionalBodyMissing,
  hasInvalidNamed,
  hasDuplicateNamed,
  namedHeaderChecks,
  namedBodyChecks,
  namedFooterChecks,
  isMarketingCategory,
  isLimitedTimeOffer,
  ltoHeaderInvalid,
  ltoFooterInvalid,
  canShowMediaSample,
  headerMediaHandleValue,
  isHeaderMediaHandleMissing,
  headerMediaPreview,
  setHeaderMediaPreview,
  headerMediaFileInputRef,
  isUploadingHeaderMedia,
  uploadHeaderMediaError,
  uploadHeaderMedia,
  headerMediaAccept,
  formatBytes,
  sanitizePlaceholdersByMode,
  stripAllPlaceholders,
  defaultBodyExamples,
  notifySanitized,
  namedVarDialogOpen,
  setNamedVarDialogOpen,
  namedVarName,
  setNamedVarName,
  namedVarError,
  setNamedVarError,
  confirmNamedVariable,
  hasMetaAppId = true,
}: StepContentProps) {
  return (
    <>
      <Container variant="default" padding="lg" className="space-y-2 min-h-140">
        <div>
          <div className="text-base font-semibold text-[var(--ds-text-primary)]">Conteudo</div>
          <div className="text-xs text-[var(--ds-text-secondary)] mt-1">
            Adicione um cabeçalho, corpo de texto e rodapé para o seu modelo. A Meta analisa variáveis e conteúdo antes da aprovação.
          </div>
        </div>
        {hasInvalidNamed || hasDuplicateNamed || (positionalHeaderInvalid.length > 0) || (positionalBodyInvalid.length > 0) || footerHasVariables ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)] h-8 px-3 text-xs"
              onClick={() => {
                const next: Partial<Spec> = {}
                if (headerType === 'TEXT') {
                  const cleanedHeader = sanitizePlaceholdersByMode(headerText, variableMode)
                  if (cleanedHeader !== headerText) {
                    next.header = { ...(header || { format: 'TEXT' }), format: 'TEXT', text: cleanedHeader, example: header?.example ?? null }
                    notifySanitized()
                  }
                }
                const cleanedBody = sanitizePlaceholdersByMode(bodyText, variableMode)
                if (cleanedBody !== bodyText) {
                  const example = defaultBodyExamples(cleanedBody)
                  next.body = { ...(spec.body || {}), text: cleanedBody, example: example ? { body_text: example } : undefined }
                  notifySanitized()
                }
                if (spec.footer?.text) {
                  const cleanedFooter = stripAllPlaceholders(footerText)
                  if (cleanedFooter !== footerText) {
                    next.footer = { ...(spec.footer || {}), text: cleanedFooter }
                    notifySanitized()
                  }
                }
                if (Object.keys(next).length) update(next)
              }}
            >
              Limpar variaveis invalidas
            </Button>
          </div>
        ) : null}

        {/* CABECALHO */}
        <div className="pt-1">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Cabecalho <span className="text-xs text-[var(--ds-text-muted)] font-normal">* Opcional</span></div>
            {headerType !== 'NONE' ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-2 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]"
                onClick={() => update({ header: null })}
              >
                Remover
              </Button>
            ) : null}
          </div>

          {headerType === 'NONE' ? (
            <div className="mt-2 flex items-center justify-between rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-2">
              <div className="text-xs text-[var(--ds-text-secondary)]">Sem cabeçalho configurado.</div>
              <Button
                type="button"
                variant="outline"
                className="border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)]"
                onClick={() =>
                  updateHeader(
                    isLimitedTimeOffer
                      ? { format: 'IMAGE', example: { header_handle: [''] } }
                      : { format: 'TEXT', text: '', example: null },
                  )
                }
              >
                Adicionar cabeçalho
              </Button>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--ds-text-secondary)]">Tipo</label>
                <Select
                  value={headerType}
                  onValueChange={(v) => {
                    const format = v as HeaderFormat | 'NONE'
                    if (format === 'NONE') {
                      update({ header: null })
                      return
                    }
                    if (format === 'TEXT') updateHeader({ format: 'TEXT', text: '', example: null })
                    else if (format === 'LOCATION') updateHeader({ format: 'LOCATION', location: { latitude: '', longitude: '', name: '', address: '' } })
                    else updateHeader({ format, example: { header_handle: [''] } })
                  }}
                >
                  <SelectTrigger className="w-full bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Nenhum</SelectItem>
                    <SelectItem value="TEXT" disabled={isLimitedTimeOffer}>Texto</SelectItem>
                    <SelectItem value="IMAGE" disabled={!hasMetaAppId}>Imagem {!hasMetaAppId && '🔒'}</SelectItem>
                    <SelectItem value="VIDEO" disabled={!hasMetaAppId}>Vídeo {!hasMetaAppId && '🔒'}</SelectItem>
                    <SelectItem value="DOCUMENT" disabled={!hasMetaAppId || isLimitedTimeOffer}>Documento {!hasMetaAppId && '🔒'}</SelectItem>
                    <SelectItem value="LOCATION" disabled={isLimitedTimeOffer}>Localização</SelectItem>
                  </SelectContent>
                </Select>

                {!hasMetaAppId ? (
                  <p className="text-xs text-amber-400/80">
                    🔒 Opções de mídia requerem o <span className="font-medium">ID do Aplicativo</span>. Configure em Configurações → API.
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {!isHeaderFormatValid ? (
            <p className="text-xs text-amber-300 mt-1">Tipo de cabeçalho invalido para templates.</p>
          ) : null}
          {ltoHeaderInvalid ? (
            <p className="text-xs text-amber-300 mt-1">Limited Time Offer aceita apenas cabeçalho IMAGE ou VIDEO.</p>
          ) : null}

          {headerType === 'TEXT' ? (
            <div className="mt-1 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--ds-text-secondary)]">Texto</label>
                <div className="text-xs text-[var(--ds-text-muted)]">{headerTextCount}/60</div>
              </div>
              <Input
                ref={headerTextRef as any}
                value={headerText}
                onChange={(e) => {
                  const raw = e.target.value
                  const cleaned = sanitizePlaceholdersByMode(raw, variableMode)
                  if (cleaned !== raw) notifySanitized()
                  updateHeader({ ...header, format: 'TEXT', text: cleaned })
                }}
                className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
                placeholder="Texto do cabeçalho"
                maxLength={60}
              />
              {headerLengthExceeded ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">Cabecalho excede 60 caracteres.</p>
              ) : null}
              {!isHeaderVariableValid ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">O cabeçalho permite apenas 1 variavel.</p>
              ) : null}
              {namedHeaderChecks?.invalid.length ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">Variaveis devem ser minusculas com underscore (ex: first_name).</p>
              ) : null}
              {namedHeaderChecks?.duplicates.length ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">Nomes de variavel no cabeçalho devem ser unicos.</p>
              ) : null}
              {headerTextMissing ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">Cabeçalho de texto é obrigatório.</p>
              ) : null}
              {positionalHeaderInvalid.length ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  No modo numerico, use apenas {'{{1}}'}, {'{{2}}'}...
                </p>
              ) : null}
              {positionalHeaderMissing.length ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Sequencia posicional deve comecar em {'{{1}}'} e nao ter buracos.
                </p>
              ) : null}
              {headerEdgeParameter.starts || headerEdgeParameter.ends ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">O cabeçalho nao pode comecar nem terminar com variavel.</p>
              ) : null}
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => addVariable('header')}
                  disabled={headerVariableCount >= 1}
                  className="h-8 px-2 text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar variavel
                </Button>
              </div>
            </div>
          ) : null}

          {headerType === 'LOCATION' ? (
            <div className="mt-2 space-y-3">
              <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <MapPin className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-[var(--ds-text-primary)]">Localização do cabeçalho</h4>
                    <p className="text-xs text-[var(--ds-text-secondary)] mt-1">
                      Cole uma URL do Google Maps ou preencha manualmente.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Google Maps URL input */}
                  <div>
                    <label className="text-xs text-[var(--ds-text-muted)] mb-1 block">URL do Google Maps</label>
                    <Input
                      type="text"
                      placeholder="Cole aqui a URL do Google Maps..."
                      className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
                      onChange={(e) => {
                        const url = e.target.value
                        if (!url.includes('google.com/maps')) return

                        // Extract coordinates from URL
                        // Format 1: @-22.9481617,-43.1576136 (view coordinates)
                        // Format 2: !3d-22.9492586!4d-43.1545757 (pin coordinates - more precise)
                        let lat = ''
                        let lng = ''

                        // Try to get precise pin coordinates first (!3d and !4d)
                        const pinMatch = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/)
                        if (pinMatch) {
                          lat = pinMatch[1]
                          lng = pinMatch[2]
                        } else {
                          // Fallback to @ coordinates
                          const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
                          if (atMatch) {
                            lat = atMatch[1]
                            lng = atMatch[2]
                          }
                        }

                        // Extract place name from URL path
                        const placeMatch = url.match(/\/place\/([^/@]+)/)
                        let name = ''
                        if (placeMatch) {
                          try {
                            name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '))
                          } catch {
                            name = placeMatch[1].replace(/\+/g, ' ')
                          }
                        }

                        if (lat && lng) {
                          updateHeader({
                            ...header,
                            format: 'LOCATION',
                            location: {
                              latitude: lat,
                              longitude: lng,
                              name: name || (header as any)?.location?.name || '',
                              address: (header as any)?.location?.address || '',
                            },
                          })
                          // Clear the input after extraction
                          e.target.value = ''
                        }
                      }}
                    />
                    <p className="text-[10px] text-[var(--ds-text-muted)] mt-1">
                      Abra o Google Maps, clique no local e copie a URL da barra de endereço
                    </p>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-[var(--ds-border-default)]" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-blue-500/5 px-2 text-[10px] text-[var(--ds-text-muted)]">ou preencha manualmente</span>
                    </div>
                  </div>
                  {/* Latitude & Longitude */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--ds-text-muted)] mb-1 block">Latitude *</label>
                      <Input
                        type="text"
                        value={(header as any)?.location?.latitude || ''}
                        onChange={(e) => {
                          updateHeader({
                            ...header,
                            format: 'LOCATION',
                            location: {
                              latitude: e.target.value,
                              longitude: (header as any)?.location?.longitude || '',
                              name: (header as any)?.location?.name || '',
                              address: (header as any)?.location?.address || '',
                            },
                          })
                        }}
                        placeholder="Ex: -23.5505"
                        className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--ds-text-muted)] mb-1 block">Longitude *</label>
                      <Input
                        type="text"
                        value={(header as any)?.location?.longitude || ''}
                        onChange={(e) => {
                          updateHeader({
                            ...header,
                            format: 'LOCATION',
                            location: {
                              latitude: (header as any)?.location?.latitude || '',
                              longitude: e.target.value,
                              name: (header as any)?.location?.name || '',
                              address: (header as any)?.location?.address || '',
                            },
                          })
                        }}
                        placeholder="Ex: -46.6333"
                        className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
                      />
                    </div>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="text-xs text-[var(--ds-text-muted)] mb-1 block">Nome do Local</label>
                    <Input
                      type="text"
                      value={(header as any)?.location?.name || ''}
                      onChange={(e) => {
                        updateHeader({
                          ...header,
                          format: 'LOCATION',
                          location: {
                            latitude: (header as any)?.location?.latitude || '',
                            longitude: (header as any)?.location?.longitude || '',
                            name: e.target.value,
                            address: (header as any)?.location?.address || '',
                          },
                        })
                      }}
                      placeholder="Ex: Loja Centro"
                      className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
                    />
                  </div>

                  {/* Address */}
                  <div>
                    <label className="text-xs text-[var(--ds-text-muted)] mb-1 block">Endereço</label>
                    <Input
                      type="text"
                      value={(header as any)?.location?.address || ''}
                      onChange={(e) => {
                        updateHeader({
                          ...header,
                          format: 'LOCATION',
                          location: {
                            latitude: (header as any)?.location?.latitude || '',
                            longitude: (header as any)?.location?.longitude || '',
                            name: (header as any)?.location?.name || '',
                            address: e.target.value,
                          },
                        })
                      }}
                      placeholder="Preencha manualmente (não disponível na URL)"
                      className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
                    />
                  </div>

                  {/* Validation hint */}
                  {(!(header as any)?.location?.latitude || !(header as any)?.location?.longitude) && (
                    <p className="text-xs text-amber-400 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-amber-400" />
                      Latitude e Longitude são obrigatórios para enviar o template
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {canShowMediaSample ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--ds-text-secondary)]">Midia do cabeçalho</label>

                <div className="flex items-center gap-2">
                  {isUploadingHeaderMedia ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-2 py-1 text-[11px] text-[var(--ds-text-secondary)]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Enviando...
                    </span>
                  ) : headerMediaHandleValue ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-600 dark:border-primary-400/30 bg-primary-100 dark:bg-primary-500/10 px-2 py-1 text-[11px] text-primary-700 dark:text-primary-200">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Pronto
                    </span>
                  ) : null}
                </div>
              </div>

              {/* input escondido (fica mais "app-like") */}
              <input
                ref={headerMediaFileInputRef as any}
                type="file"
                accept={headerMediaAccept(headerType)}
                className="hidden"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0]
                  // Permite selecionar o mesmo arquivo novamente
                  e.currentTarget.value = ''
                  if (!file) return

                  // Preview local (como a Meta faz). O handle nao e um link renderizavel.
                  const format = headerType as HeaderFormat
                  try {
                    const url = URL.createObjectURL(file)
                    setHeaderMediaPreview({
                      url,
                      format,
                      name: file.name,
                      mimeType: file.type || '',
                      size: file.size,
                    })
                  } catch {
                    // Ignore: preview e opcional.
                  }

                  void uploadHeaderMedia(file)
                }}
              />

              <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--ds-text-primary)] truncate">
                    {headerMediaPreview?.name || 'Escolha um arquivo'}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--ds-text-secondary)]">
                    {headerMediaPreview ? (
                      `${formatBytes(headerMediaPreview.size)} * ${String(headerType).toLowerCase()}`
                    ) : (
                      'Ele vai aparecer na previa a direita.'
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={headerMediaPreview ? 'outline' : 'default'}
                    disabled={isUploadingHeaderMedia}
                    className={cn(
                      headerMediaPreview
                        ? 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)]'
                        : 'bg-primary-500 hover:bg-primary-400 text-black',
                    )}
                    onClick={() => headerMediaFileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    {headerMediaPreview ? 'Trocar' : 'Escolher'}
                  </Button>

                  {headerMediaPreview ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isUploadingHeaderMedia}
                      className="text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"
                      onClick={() => {
                        setHeaderMediaPreview(null)
                        updateHeader({
                          ...header,
                          format: headerType as HeaderFormat,
                          example: {
                            ...(header?.example || {}),
                            header_handle: [''],
                          },
                        })
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                      Remover
                    </Button>
                  ) : null}
                </div>
              </div>

              {/* Aviso de limite de tamanho */}
              <p className="text-xs text-[var(--ds-text-muted)]">
                {headerType === 'VIDEO' && (
                  <>Máximo: <span className="font-medium text-amber-400/80">4.5MB</span> (limite da plataforma). Formato: MP4 (H.264 + AAC).</>
                )}
                {headerType === 'IMAGE' && (
                  <>Máximo: <span className="font-medium">5MB</span>. Formatos: PNG, JPEG.</>
                )}
                {headerType === 'DOCUMENT' && (
                  <>Máximo: <span className="font-medium text-amber-400/80">4.5MB</span> (limite da plataforma). Formato: PDF.</>
                )}
                {headerType === 'GIF' && (
                  <>Máximo: <span className="font-medium">3.5MB</span>. Formato: MP4 (como GIF animado).</>
                )}
              </p>

              {uploadHeaderMediaError ? (
                <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                  <p>{uploadHeaderMediaError}</p>
                  {/* Mostrar link do conversor se for erro de codec */}
                  {(uploadHeaderMediaError.includes('formato') ||
                    uploadHeaderMediaError.includes('H.264') ||
                    uploadHeaderMediaError.includes('AAC') ||
                    uploadHeaderMediaError.includes('incompatível')) && (
                    <a
                      href={VIDEO_CONVERTER_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Converter vídeo online (CloudConvert)
                    </a>
                  )}
                </div>
              ) : isHeaderMediaHandleMissing ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {headerMediaPreview ? 'Finalize o envio da midia para continuar.' : 'Selecione um arquivo para o cabeçalho.'}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* CORPO */}
        <div className="pt-1">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Corpo</div>
            <div className="text-xs text-[var(--ds-text-muted)]">{bodyTextCount}/{bodyMaxLength}</div>
          </div>

          <div className="mt-2 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)]">
            <div className="p-2">
              <Textarea
                ref={bodyRef as any}
                value={bodyText}
                onChange={(e) => {
                  const raw = e.target.value
                  const cleaned = sanitizePlaceholdersByMode(raw, variableMode)
                  if (cleaned !== raw) notifySanitized()
                  const example = defaultBodyExamples(cleaned)
                  update({ body: { ...(spec.body || {}), text: cleaned, example: example ? { body_text: example } : undefined } })
                }}
                className="bg-transparent border-none text-[var(--ds-text-primary)] min-h-24 focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="Digite o corpo (obrigatório)"
                maxLength={bodyMaxLength}
              />
            </div>

            <div className="flex items-center gap-1 px-2 py-1.5 border-t border-[var(--ds-border-default)]">
              <Button type="button" variant="ghost" onClick={() => applyBodyFormat('bold')} className="h-7 px-2 text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]">
                <Bold className="w-4 h-4" />
              </Button>
              <Button type="button" variant="ghost" onClick={() => applyBodyFormat('italic')} className="h-7 px-2 text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]">
                <Italic className="w-4 h-4" />
              </Button>
              <Button type="button" variant="ghost" onClick={() => applyBodyFormat('strike')} className="h-7 px-2 text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]">
                <Strikethrough className="w-4 h-4" />
              </Button>
              <Button type="button" variant="ghost" onClick={() => applyBodyFormat('code')} className="h-7 px-2 text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]">
                <Code className="w-4 h-4" />
              </Button>

              <div className="flex-1" />

              <Button
                type="button"
                variant="ghost"
                onClick={() => addVariable('body')}
                className="h-7 px-2 text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]"
              >
                <Plus className="w-4 h-4" />
                Adicionar variavel
              </Button>
            </div>
          </div>

          {namedBodyChecks?.invalid.length ? (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">Use apenas minusculas e underscore nas variaveis do corpo.</div>
          ) : null}
          {namedBodyChecks?.duplicates.length ? (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">Nomes de variavel no corpo devem ser unicos.</div>
          ) : null}
          {positionalBodyInvalid.length ? (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              No modo numerico, use apenas {'{{1}}'}, {'{{2}}'}...
            </div>
          ) : null}
          {positionalBodyMissing.length ? (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Sequencia posicional deve comecar em {'{{1}}'} e nao ter buracos.
            </div>
          ) : null}
          {bodyLengthExceeded ? (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">Corpo excede {bodyMaxLength} caracteres.</div>
          ) : null}
          {bodyEdgeParameter.starts || bodyEdgeParameter.ends ? (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">O corpo nao pode comecar nem terminar com variavel.</div>
          ) : null}
          {!bodyText.trim() ? (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">O corpo é obrigatório.</div>
          ) : null}
        </div>

        {/* RODAPE */}
        <div className="pt-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Rodapé <span className="text-xs text-[var(--ds-text-muted)] font-normal">* Opcional</span></div>
            <div className="text-xs text-[var(--ds-text-muted)]">{footerTextCount}/60</div>
          </div>

          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)] h-8 px-3"
                disabled={isLimitedTimeOffer && !spec.footer}
                onClick={() => updateFooter(spec.footer ? null : { text: '' })}
              >
                {spec.footer ? 'Remover rodapé' : 'Adicionar rodapé'}
              </Button>
            </div>

            {isLimitedTimeOffer ? (
              <div className="text-xs text-amber-700 dark:text-amber-300">Limited Time Offer não permite rodapé.</div>
            ) : null}

            {spec.footer ? (
              <div className="space-y-2">
                <Input
                  ref={footerRef as any}
                  value={footerText}
                  onChange={(e) => {
                    const nextText = stripAllPlaceholders(e.target.value)
                    if (nextText !== e.target.value) notifySanitized()
                    updateFooter({ ...(spec.footer || {}), text: nextText })
                  }}
                  className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
                  placeholder="Inserir texto"
                  maxLength={60}
                />
                {footerLengthExceeded ? (
                  <div className="text-xs text-amber-700 dark:text-amber-300">Rodapé excede 60 caracteres.</div>
                ) : null}
                {footerHasVariables ? (
                  <div className="text-xs text-amber-700 dark:text-amber-300">Rodapé não permite variáveis.</div>
                ) : null}
                {namedFooterChecks?.invalid.length ? (
                  <div className="text-xs text-amber-700 dark:text-amber-300">Use apenas minúsculas e underscore nas variáveis do rodapé.</div>
                ) : null}
                {namedFooterChecks?.duplicates.length ? (
                  <div className="text-xs text-amber-700 dark:text-amber-300">Nomes de variável no rodapé devem ser únicos.</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </Container>

      {/* Named Variable Dialog */}
      <Dialog open={namedVarDialogOpen} onOpenChange={setNamedVarDialogOpen}>
        <DialogContent className="sm:max-w-105">
          <DialogHeader>
            <DialogTitle>Variavel nomeada</DialogTitle>
            <DialogDescription>Use apenas minusculas, numeros e underscore.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--ds-text-secondary)]">Nome da variavel</label>
            <Input
              value={namedVarName}
              onChange={(e) => {
                setNamedVarName(e.target.value)
                if (namedVarError) setNamedVarError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmNamedVariable()
                }
              }}
              placeholder="ex: first_name"
              className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)]"
              autoFocus
            />
            {namedVarError ? <p className="text-xs text-amber-700 dark:text-amber-300">{namedVarError}</p> : null}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setNamedVarDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmNamedVariable}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
