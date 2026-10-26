'use client'

/**
 * T062: KnowledgeBasePanel
 * File list with upload and status badges for AI agent knowledge base
 */

import React, { useState, useCallback, useRef } from 'react'
import {
  FileText,
  Upload,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  HardDrive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { AIKnowledgeFile, KnowledgeFileIndexingStatus } from '@/types'

export interface KnowledgeBasePanelProps {
  agentId: string | null
  files: AIKnowledgeFile[]
  isLoading: boolean
  error: Error | null
  onUpload: (params: { name: string; content: string; mime_type?: string }) => Promise<AIKnowledgeFile>
  onDelete: (fileId: string) => Promise<void>
  isUploading?: boolean
  isDeleting?: boolean
  totalSize?: number
}

const statusConfig: Record<KnowledgeFileIndexingStatus, { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: 'Aguardando', icon: Clock, color: 'text-yellow-400' },
  processing: { label: 'Processando', icon: Loader2, color: 'text-blue-400' },
  completed: { label: 'Indexado', icon: CheckCircle2, color: 'text-green-400' },
  failed: { label: 'Falhou', icon: XCircle, color: 'text-red-400' },
  local_only: { label: 'Local', icon: HardDrive, color: 'text-[var(--ds-text-secondary)]' },
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function KnowledgeBasePanel({
  agentId,
  files,
  isLoading,
  error,
  onUpload,
  onDelete,
  isUploading = false,
  isDeleting = false,
  totalSize = 0,
}: KnowledgeBasePanelProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [deleteFile, setDeleteFile] = useState<AIKnowledgeFile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle file selection
  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!agentId) return

      try {
        // Determinar se é arquivo binário (PDF, imagens) ou texto
        const binaryTypes = [
          'application/pdf',
          'image/',
          'application/vnd.openxmlformats', // docx, pptx, xlsx
        ]
        const isBinary = binaryTypes.some((t) => file.type.startsWith(t))

        let content: string

        if (isBinary) {
          // Para binários: ler como data URL (base64)
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(file)
          })
        } else {
          // Para texto: ler como string UTF-8
          content = await file.text()
        }

        await onUpload({
          name: file.name,
          content,
          mime_type: file.type || 'text/plain',
        })
      } catch (err) {
        console.error('[KnowledgeBasePanel] Upload error:', err)
      }
    },
    [agentId, onUpload]
  )

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)

      const droppedFiles = Array.from(e.dataTransfer.files)
      for (const file of droppedFiles) {
        await handleFileSelect(file)
      }
    },
    [handleFileSelect]
  )

  // Handle input change
  const handleInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || [])
      for (const file of selectedFiles) {
        await handleFileSelect(file)
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [handleFileSelect]
  )

  // Handle delete confirmation
  const handleConfirmDelete = useCallback(async () => {
    if (deleteFile) {
      await onDelete(deleteFile.id)
      setDeleteFile(null)
    }
  }, [deleteFile, onDelete])

  if (!agentId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Base de Conhecimento</CardTitle>
          <CardDescription>
            Selecione um agente para gerenciar sua base de conhecimento
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <FileText className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base">Base de Conhecimento</CardTitle>
                <CardDescription>
                  {files.length} arquivo{files.length !== 1 ? 's' : ''} • {formatFileSize(totalSize)}
                </CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Adicionar
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".txt,.md,.pdf,.csv,.json"
              multiple
              onChange={handleInputChange}
            />
          </div>
        </CardHeader>

        <CardContent>
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-6 w-6 text-red-400 mb-2" />
              <p className="text-sm text-[var(--ds-text-secondary)]">Erro ao carregar arquivos</p>
              <p className="text-xs text-[var(--ds-text-muted)]">{error.message}</p>
            </div>
          )}

          {/* Drop zone / Empty state */}
          {!isLoading && !error && files.length === 0 && (
            <div
              className={cn(
                'flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-lg transition-colors',
                isDragOver
                  ? 'border-primary-500 bg-primary-500/5'
                  : 'border-[var(--ds-border-default)] hover:border-[var(--ds-border-default)]'
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="h-8 w-8 text-[var(--ds-text-muted)] mb-3" />
              <p className="text-sm text-[var(--ds-text-secondary)] mb-1">
                Arraste arquivos aqui ou clique em &quot;Adicionar&quot;
              </p>
              <p className="text-xs text-[var(--ds-text-muted)]">
                Suporta TXT, MD, PDF, CSV, JSON
              </p>
            </div>
          )}

          {/* File list */}
          {!isLoading && !error && files.length > 0 && (
            <div
              className={cn(
                'space-y-2 rounded-lg transition-colors',
                isDragOver && 'ring-2 ring-primary-500 bg-primary-500/5'
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {files.map((file) => {
                const status = statusConfig[file.indexing_status]
                const StatusIcon = status.icon

                return (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)]"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="p-2 rounded bg-[var(--ds-bg-surface)]">
                        <FileText className="h-4 w-4 text-[var(--ds-text-secondary)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--ds-text-primary)] truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-[var(--ds-text-muted)]">
                          {formatFileSize(file.size_bytes)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Status badge */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={cn('flex items-center gap-1', status.color)}>
                            <StatusIcon
                              className={cn(
                                'h-4 w-4',
                                file.indexing_status === 'processing' && 'animate-spin'
                              )}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{status.label}</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[var(--ds-text-secondary)] hover:text-red-400"
                        onClick={() => setDeleteFile(file)}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteFile} onOpenChange={() => setDeleteFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir arquivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir &ldquo;{deleteFile?.name}&rdquo;?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
