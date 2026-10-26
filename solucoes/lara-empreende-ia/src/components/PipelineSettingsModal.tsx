import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, GripVertical, Plus, Lock, Bot, User, AlertTriangle } from 'lucide-react';
import { KanbanColumn } from '@/types';
import { api } from '@/services/api';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PipelineSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSave?: () => void;
}

export function PipelineSettingsModal({ open, onClose, onSave }: PipelineSettingsModalProps) {
  const [stages, setStages] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editIsAiManaged, setEditIsAiManaged] = useState(false);
  const [editTriggerCriteria, setEditTriggerCriteria] = useState('');
  const [newStageTitle, setNewStageTitle] = useState('');
  const [newStageIsAiManaged, setNewStageIsAiManaged] = useState(false);
  const [newStageTriggerCriteria, setNewStageTriggerCriteria] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ stageId: string; stageName: string } | null>(null);
  const [availableStages, setAvailableStages] = useState<KanbanColumn[]>([]);
  const [moveToStageId, setMoveToStageId] = useState<string>('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      loadStages();
    }
  }, [open]);

  const loadStages = async () => {
    setLoading(true);
    try {
      const data = await api.fetchPipelineStages();
      setStages(data);
    } catch (error) {
      toast.error('Erro ao carregar etapas');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (stage: KanbanColumn) => {
    setEditingId(stage.id);
    setEditTitle(stage.title);
    // Mantém o valor legado no banco por compatibilidade; a UI canônica
    // diferencia etapas por hierarquia e ícone, não por faixas coloridas.
    setEditColor(stage.color || 'border-muted-foreground');
    setEditIsAiManaged(stage.isAiManaged);
    setEditTriggerCriteria(stage.aiTriggerCriteria || '');
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    try {
      await api.updatePipelineStage(editingId, {
        title: editTitle,
        color: editColor,
        isAiManaged: editIsAiManaged,
        aiTriggerCriteria: editTriggerCriteria || null,
      } as any);
      
      toast.success('Etapa atualizada');
      setEditingId(null);
      loadStages();
      onSave?.();
    } catch (error) {
      toast.error('Erro ao atualizar etapa');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditColor('');
    setEditIsAiManaged(false);
    setEditTriggerCriteria('');
  };

  const handleDeleteClick = async (stage: KanbanColumn) => {
    // Check if there are deals in this stage
    try {
      const deals = await api.fetchPipeline();
      const dealsInStage = deals.filter(d => d.stageId === stage.id);
      
      if (dealsInStage.length > 0) {
        // Show dialog to move deals
        const otherStages = stages.filter(s => s.id !== stage.id);
        setAvailableStages(otherStages);
        setMoveToStageId(otherStages[0]?.id || '');
        setDeleteConfirm({ stageId: stage.id, stageName: stage.title });
      } else {
        // No deals, delete directly
        await api.deletePipelineStage(stage.id);
        toast.success('Etapa removida');
        loadStages();
        onSave?.();
      }
    } catch (error) {
      toast.error('Erro ao verificar deals');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await api.deletePipelineStage(deleteConfirm.stageId, moveToStageId);
      toast.success('Etapa removida e deals realocados');
      setDeleteConfirm(null);
      setMoveToStageId('');
      loadStages();
      onSave?.();
    } catch (error) {
      toast.error('Erro ao remover etapa');
    }
  };

  const handleAddStage = async () => {
    if (!newStageTitle.trim()) {
      toast.error('Digite um nome para a etapa');
      return;
    }

    try {
      await api.createPipelineStage({
        title: newStageTitle,
        color: 'border-muted-foreground',
        isAiManaged: newStageIsAiManaged,
        aiTriggerCriteria: newStageTriggerCriteria || undefined,
      });
      
      toast.success('Etapa criada');
      setNewStageTitle('');
      setNewStageIsAiManaged(false);
      setNewStageTriggerCriteria('');
      loadStages();
      onSave?.();
    } catch (error) {
      toast.error('Erro ao criar etapa');
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newStages = [...stages];
    const draggedItem = newStages[draggedIndex];
    newStages.splice(draggedIndex, 1);
    newStages.splice(index, 0, draggedItem);
    
    setStages(newStages);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null) return;

    try {
      const stageIds = stages.map(s => s.id);
      await api.reorderPipelineStages(stageIds);
      toast.success('Ordem atualizada');
      onSave?.();
    } catch (error) {
      toast.error('Erro ao reordenar etapas');
      loadStages(); // Reload on error
    } finally {
      setDraggedIndex(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar Pipeline</DialogTitle>
            <DialogDescription>
              Organize as etapas e escolha quais movimentos podem ser feitos pela Lara.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Existing Stages */}
            <div className="space-y-2">
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : (
                stages.map((stage, index) => (
                  <div
                    key={stage.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`eia-row-card flex items-center gap-3 cursor-move ${
                      draggedIndex === index ? 'opacity-50' : ''
                    }`}
                  >
                    <GripVertical className="w-5 h-5 text-muted-foreground" />

                    {editingId === stage.id ? (
                      <div className="flex-1 space-y-2">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full"
                          placeholder="Nome da etapa"
                        />
                        
                        {/* Stage Type Selector */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Tipo de etapa</Label>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={!editIsAiManaged ? "default" : "outline"}
                              onClick={() => setEditIsAiManaged(false)}
                              className="flex-1"
                            >
                              <User className="w-3 h-3 mr-1" />
                              Manual
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={editIsAiManaged ? "default" : "outline"}
                              onClick={() => setEditIsAiManaged(true)}
                              className="flex-1"
                            >
                              <Bot className="w-3 h-3 mr-1" />
                              Automático
                            </Button>
                          </div>
                        </div>

                        {/* AI Criteria (only show if AI Managed) */}
                        {editIsAiManaged && (
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Critérios para IA mover para este estágio:
                            </Label>
                            <Textarea
                              value={editTriggerCriteria}
                              onChange={(e) => setEditTriggerCriteria(e.target.value)}
                              placeholder="Ex: Lead demonstrou interesse claro e pediu demonstração..."
                              className="h-20 text-sm resize-none"
                            />
                          </div>
                        )}
                        
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" onClick={handleSaveEdit}>
                            Salvar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-1">
                          {/* Visual Indicator */}
                          {stage.isAiManaged ? (
                            stage.aiTriggerCriteria ? (
                              <div title="Estágio automático com critério configurado">
                                <Bot className="w-4 h-4 text-primary" />
                              </div>
                            ) : (
                              <div title="Estágio automático sem critério - IA não sabe quando usar">
                                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )
                          ) : (
                            <div title="Estágio manual - apenas movimentação humana">
                              <User className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <span className="font-medium">{stage.title}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(stage)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {stage.isSystem ? (
                          <Button size="sm" variant="ghost" disabled title="Etapa de sistema não pode ser deletada">
                            <Lock className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteClick(stage)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add New Stage */}
            <div className="border-t pt-4 space-y-3">
              <Label className="text-sm font-medium">Nova etapa</Label>
              <Input
                value={newStageTitle}
                onChange={(e) => setNewStageTitle(e.target.value)}
                placeholder="Nome da etapa"
                className="w-full"
              />
              
              {/* Stage Type Selector */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tipo de etapa</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={!newStageIsAiManaged ? "default" : "outline"}
                    onClick={() => setNewStageIsAiManaged(false)}
                    className="flex-1"
                  >
                    <User className="w-3 h-3 mr-1" />
                    Manual
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={newStageIsAiManaged ? "default" : "outline"}
                    onClick={() => setNewStageIsAiManaged(true)}
                    className="flex-1"
                  >
                    <Bot className="w-3 h-3 mr-1" />
                    Automático
                  </Button>
                </div>
              </div>

              {/* AI Criteria (only show if AI Managed) */}
              {newStageIsAiManaged && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Critérios para IA mover para este estágio:
                  </Label>
                  <Textarea
                    value={newStageTriggerCriteria}
                    onChange={(e) => setNewStageTriggerCriteria(e.target.value)}
                    placeholder="Ex: Lead demonstrou interesse claro e pediu demonstração..."
                    className="h-20 text-sm resize-none"
                  />
                </div>
              )}
              
              <Button onClick={handleAddStage} className="w-full">
                <Plus className="w-4 h-4 mr-1" />
                Adicionar etapa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation with Deal Reallocation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover etapa "{deleteConfirm?.stageName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Existem deals nesta etapa. Para onde você deseja movê-los?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <Label>Mover deals para:</Label>
            <Select value={moveToStageId} onValueChange={setMoveToStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma etapa" />
              </SelectTrigger>
              <SelectContent>
                {availableStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.title}
                  </SelectItem>
                ))
                }
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={!moveToStageId}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
