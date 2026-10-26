'use client'

import React, { useState } from 'react'
import type { Opportunity, OpportunityStatus } from '@/services/crmService'
import type { StageColumn } from '@/hooks/useCrm'
import { KanbanColumn } from './KanbanColumn'

export interface KanbanBoardProps {
  columns: StageColumn[]
  onMoveOpportunity: (id: string, stageId: string) => void
  onAddOpportunity: (stageId: string) => void
  onChangeStatus: (opportunity: Opportunity, status: OpportunityStatus) => void
  onEditOpportunity: (opportunity: Opportunity) => void
  onDeleteOpportunity: (opportunity: Opportunity) => void
}

/**
 * Quadro kanban com drag and drop nativo (HTML5).
 * O estado do drag (card arrastado + coluna alvo) vive aqui;
 * a mutação de mover é delegada ao controller via onMoveOpportunity.
 */
export function KanbanBoard({
  columns,
  onMoveOpportunity,
  onAddOpportunity,
  onChangeStatus,
  onEditOpportunity,
  onDeleteOpportunity,
}: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [draggingStageId, setDraggingStageId] = useState<string | null>(null)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, opportunity: Opportunity) => {
    e.dataTransfer.setData('text/plain', opportunity.id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(opportunity.id)
    setDraggingStageId(opportunity.stageId)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDraggingStageId(null)
    setDragOverStageId(null)
  }

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    // preventDefault é obrigatório para permitir o drop
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverStageId !== stageId) setDragOverStageId(stageId)
  }

  const handleDragLeave = (e: React.DragEvent, stageId: string) => {
    // Ignora dragleave disparado por elementos filhos da própria coluna
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) return
    if (dragOverStageId === stageId) setDragOverStageId(null)
  }

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || draggingId
    const sourceStageId = draggingStageId
    handleDragEnd()
    if (!id) return
    // Soltar na mesma coluna não gera PATCH
    if (sourceStageId === stageId) return
    onMoveOpportunity(id, stageId)
  }

  return (
    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
      <div className="flex h-full gap-4 pb-2">
        {columns.map((column) => (
          <KanbanColumn
            key={column.stage.id}
            column={column}
            isDragOver={dragOverStageId === column.stage.id && draggingStageId !== column.stage.id}
            draggingId={draggingId}
            onDragStartCard={handleDragStart}
            onDragEndCard={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, column.stage.id)}
            onDragLeave={(e) => handleDragLeave(e, column.stage.id)}
            onDrop={(e) => handleDrop(e, column.stage.id)}
            onAddOpportunity={onAddOpportunity}
            onChangeStatus={onChangeStatus}
            onEditOpportunity={onEditOpportunity}
            onDeleteOpportunity={onDeleteOpportunity}
          />
        ))}
      </div>
    </div>
  )
}
