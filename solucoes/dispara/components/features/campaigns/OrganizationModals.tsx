'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useCampaignFolders } from '@/hooks/useCampaignFolders'
import { useCampaignTags, TAG_COLORS } from '@/hooks/useCampaignTags'
import {
  FolderIcon,
  TagIcon,
  TrashIcon,
  PencilIcon,
  PlusIcon,
  XIcon,
  CheckIcon,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import type { CampaignFolder, CampaignTag } from '@/types'

interface OrganizationModalsProps {
  isOpen: boolean
  onClose: () => void
  defaultTab?: 'folders' | 'tags'
}

/**
 * Modal para gerenciar pastas e tags de campanhas
 */
export function OrganizationModals({
  isOpen,
  onClose,
  defaultTab = 'folders',
}: OrganizationModalsProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Organizar Campanhas</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="folders" className="flex items-center gap-2">
              <FolderIcon className="h-4 w-4" />
              Pastas
            </TabsTrigger>
            <TabsTrigger value="tags" className="flex items-center gap-2">
              <TagIcon className="h-4 w-4" />
              Tags
            </TabsTrigger>
          </TabsList>

          <TabsContent value="folders" className="mt-4">
            <FoldersManager />
          </TabsContent>

          <TabsContent value="tags" className="mt-4">
            <TagsManager />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Folders Manager
// =============================================================================

function FoldersManager() {
  const { folders, isLoading, create, update, delete: deleteFolder, isCreating, isDeleting } = useCampaignFolders()
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderColor, setNewFolderColor] = useState<string>(TAG_COLORS[0])
  const [editingFolder, setEditingFolder] = useState<CampaignFolder | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newFolderName.trim()) return

    try {
      await create({ name: newFolderName.trim(), color: newFolderColor })
      toast.success('Pasta criada!')
      setNewFolderName('')
      setNewFolderColor(TAG_COLORS[0])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar pasta')
    }
  }

  const handleUpdate = async () => {
    if (!editingFolder || !editingFolder.name.trim()) return

    try {
      await update(editingFolder.id, { name: editingFolder.name.trim(), color: editingFolder.color })
      toast.success('Pasta atualizada!')
      setEditingFolder(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar pasta')
    }
  }

  const handleConfirmDelete = async (id: string) => {
    try {
      await deleteFolder(id)
      toast.success('Pasta removida!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover pasta')
    } finally {
      setPendingDeleteId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Create new folder */}
      <div className="flex items-center gap-2">
        <ColorPicker
          value={newFolderColor}
          onChange={setNewFolderColor}
        />
        <Input
          placeholder="Nome da pasta"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={!newFolderName.trim() || isCreating}
        >
          <PlusIcon className="h-4 w-4 mr-1" />
          Criar
        </Button>
      </div>

      {/* Folders list */}
      <div className="border rounded-lg border-[var(--ds-border-default)] divide-y divide-[var(--ds-border-default)] max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--ds-border-default)] border-t-primary-500" />
          </div>
        ) : folders.length === 0 ? (
          <div className="p-4 text-center text-sm text-[var(--ds-text-muted)]">
            Nenhuma pasta criada
          </div>
        ) : (
          folders.map((folder) => (
            <div key={folder.id} className="flex items-center gap-2 p-3">
              {/* Delete confirmation inline */}
              {pendingDeleteId === folder.id ? (
                <div className="flex-1 flex items-center justify-between gap-2">
                  <span className="text-sm text-[var(--ds-text-secondary)]">
                    Remover <strong className="text-[var(--ds-text-primary)]">{folder.name}</strong>?
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingDeleteId(null)}
                      className="h-7 px-2 text-xs"
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleConfirmDelete(folder.id)}
                      disabled={isDeleting}
                      className="h-7 px-2 text-xs bg-red-600 hover:bg-red-700"
                    >
                      {isDeleting ? 'Removendo...' : 'Remover'}
                    </Button>
                  </div>
                </div>
              ) : editingFolder?.id === folder.id ? (
                <>
                  <ColorPicker
                    value={editingFolder.color}
                    onChange={(color) => setEditingFolder({ ...editingFolder, color })}
                  />
                  <Input
                    value={editingFolder.name}
                    onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                    className="flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdate()
                      if (e.key === 'Escape') setEditingFolder(null)
                    }}
                  />
                  <Button size="icon" variant="ghost" onClick={handleUpdate}>
                    <CheckIcon className="h-4 w-4 text-green-500" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingFolder(null)}>
                    <XIcon className="h-4 w-4 text-[var(--ds-text-secondary)]" />
                  </Button>
                </>
              ) : (
                <>
                  <div
                    className="w-4 h-4 rounded flex-shrink-0"
                    style={{ backgroundColor: folder.color }}
                  />
                  <span className="flex-1 text-sm text-[var(--ds-text-primary)] truncate">{folder.name}</span>
                  <span className="text-xs text-[var(--ds-text-muted)]">({folder.campaignCount || 0})</span>
                  <Button size="icon" variant="ghost" onClick={() => setEditingFolder(folder)}>
                    <PencilIcon className="h-4 w-4 text-[var(--ds-text-secondary)]" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setPendingDeleteId(folder.id)}
                    disabled={isDeleting}
                  >
                    <TrashIcon className="h-4 w-4 text-red-400" />
                  </Button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Tags Manager
// =============================================================================

function TagsManager() {
  const { tags, isLoading, create, delete: deleteTag, isCreating, isDeleting } = useCampaignTags()
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState<string>(TAG_COLORS[0])
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newTagName.trim()) return

    try {
      await create({ name: newTagName.trim(), color: newTagColor })
      toast.success('Tag criada!')
      setNewTagName('')
      setNewTagColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar tag')
    }
  }

  const handleConfirmDelete = async (id: string) => {
    try {
      await deleteTag(id)
      toast.success('Tag removida!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover tag')
    } finally {
      setPendingDeleteId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Create new tag */}
      <div className="flex items-center gap-2">
        <ColorPicker
          value={newTagColor}
          onChange={setNewTagColor}
        />
        <Input
          placeholder="Nome da tag"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={!newTagName.trim() || isCreating}
        >
          <PlusIcon className="h-4 w-4 mr-1" />
          Criar
        </Button>
      </div>

      {/* Tags list */}
      <div className="border rounded-lg border-[var(--ds-border-default)] divide-y divide-[var(--ds-border-default)] max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--ds-border-default)] border-t-primary-500" />
          </div>
        ) : tags.length === 0 ? (
          <div className="p-4 text-center text-sm text-[var(--ds-text-muted)]">
            Nenhuma tag criada
          </div>
        ) : (
          tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2 p-3">
              {/* Delete confirmation inline */}
              {pendingDeleteId === tag.id ? (
                <div className="flex-1 flex items-center justify-between gap-2">
                  <span className="text-sm text-[var(--ds-text-secondary)]">
                    Remover <strong className="text-[var(--ds-text-primary)]">{tag.name}</strong>?
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingDeleteId(null)}
                      className="h-7 px-2 text-xs"
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleConfirmDelete(tag.id)}
                      disabled={isDeleting}
                      className="h-7 px-2 text-xs bg-red-600 hover:bg-red-700"
                    >
                      {isDeleting ? 'Removendo...' : 'Remover'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="flex-1 text-sm text-[var(--ds-text-primary)] truncate">{tag.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setPendingDeleteId(tag.id)}
                    disabled={isDeleting}
                  >
                    <TrashIcon className="h-4 w-4 text-red-400" />
                  </Button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Color Picker
// =============================================================================

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 rounded border border-[var(--ds-border-default)] transition-colors hover:border-slate-500"
        style={{ backgroundColor: value }}
        title="Escolher cor"
      />

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 p-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg shadow-lg z-50">
            <div className="grid grid-cols-4 gap-1">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    onChange(color)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-7 h-7 rounded transition-transform hover:scale-110',
                    value === color && 'ring-2 ring-[var(--ds-text-primary)] ring-offset-1 ring-offset-[var(--ds-bg-elevated)]'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
