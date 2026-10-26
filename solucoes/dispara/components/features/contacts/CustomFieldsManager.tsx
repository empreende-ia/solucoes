import React, { useState, useEffect, useCallback, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, Type, Loader2 } from 'lucide-react';
import { customFieldService } from '@/services/customFieldService';
import { CustomFieldDefinition } from '@/types';
import { toast } from 'sonner';

// =============================================================================
// MEMOIZED SUBCOMPONENT - Evita re-render de todos os itens ao adicionar/remover
// =============================================================================

interface CustomFieldItemProps {
  field: CustomFieldDefinition;
  onDelete: (id: string) => void;
}

const CustomFieldItem = memo(function CustomFieldItem({ field, onDelete }: CustomFieldItemProps) {
  const handleDelete = useCallback(() => {
    onDelete(field.id);
  }, [field.id, onDelete]);

  return (
    <div
      className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 hover:bg-[var(--ds-bg-hover)] hover:border-[var(--ds-border-subtle)] transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] text-[var(--ds-text-secondary)] group-hover:text-[var(--ds-text-primary)] transition-colors">
          <Type size={14} />
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--ds-text-primary)]">{field.label}</p>
          <p className="text-[10px] font-mono text-[var(--ds-text-muted)] flex items-center gap-1">
            <span>{'{{'}</span>
            {field.key}
            <span>{'}}'}</span>
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-[var(--ds-text-muted)] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all rounded-lg h-9 w-9"
        onClick={handleDelete}
      >
        <Trash2 size={15} />
      </Button>
    </div>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface CustomFieldsManagerProps {
    entityType?: 'contact' | 'deal';
    onFieldCreated?: (field: CustomFieldDefinition) => void;
    onFieldDeleted?: (id: string) => void;
}

export function CustomFieldsManager({
    entityType = 'contact',
    onFieldCreated,
    onFieldDeleted
}: CustomFieldsManagerProps) {
    const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);

    // New Field State
    const [newLabel, setNewLabel] = useState('');
    const [newKey, setNewKey] = useState('');

    useEffect(() => {
        fetchFields();
    }, []);

    // Auto-generate slug/key from label
    useEffect(() => {
        const slug = newLabel
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove accents
            .replace(/[^a-z0-9]/g, '_') // Replace special chars with underscore
            .replace(/^_+|_+$/g, ''); // Trim underscores

        setNewKey(slug);
    }, [newLabel]);

    const fetchFields = async () => {
        try {
            setLoading(true);
            const data = await customFieldService.getAll(entityType);
            setFields(data);
        } catch (error) {
            console.error(error);
            toast.error('Erro ao carregar campos');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newLabel || !newKey) return;

        try {
            setCreating(true);
            const newField = await customFieldService.create({
                label: newLabel,
                key: newKey,
                type: 'text',
                entity_type: entityType,
                options: []
            });

            setFields([...fields, newField]);
            setNewLabel('');
            setNewKey('');
            toast.success('Campo criado com sucesso');

            if (onFieldCreated) {
                onFieldCreated(newField);
            }
        } catch (error) {
            console.error(error);
            toast.error('Erro ao criar campo');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = useCallback(async (id: string) => {
        try {
            await customFieldService.delete(id);
            setFields(prev => prev.filter(f => f.id !== id));
            toast.success('Campo removido');

            if (onFieldDeleted) {
                onFieldDeleted(id);
            }
        } catch (error) {
            console.error(error);
            toast.error('Erro ao remover campo');
        }
    }, [onFieldDeleted]);

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Create Form */}
            <div className="bg-[var(--ds-bg-elevated)] p-5 rounded-2xl border border-[var(--ds-border-subtle)] space-y-5">
                <h4 className="text-sm font-semibold text-[var(--ds-text-primary)] flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-primary-500/10 flex items-center justify-center text-primary-500">
                        <Plus size={14} />
                    </div>
                    Novo Campo
                </h4>

                <div className="space-y-4">
                    <div>
                        <Label className="text-xs font-medium text-[var(--ds-text-secondary)] mb-1.5 block">Nome do Campo</Label>
                        <Input
                            placeholder="Ex: Empresa"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            className="bg-[var(--ds-bg-surface)] border-[var(--ds-border-subtle)] text-[var(--ds-text-primary)] placeholder-[var(--ds-text-muted)] focus:border-primary-500/50 focus:ring-primary-500/20"
                        />
                    </div>

                    <div>
                        <Label className="text-xs font-medium text-[var(--ds-text-secondary)] mb-1.5 block">Chave (Variável)</Label>
                        <div className="text-xs font-mono bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] p-3 rounded-lg text-[var(--ds-text-secondary)] flex items-center gap-2">
                            <span className="text-[var(--ds-text-muted)] select-none">{'{{'}</span>
                            <span className="text-primary-400">{newKey || '...'}</span>
                            <span className="text-[var(--ds-text-muted)] select-none">{'}}'}</span>
                        </div>
                    </div>

                    <Button
                        className="w-full bg-white text-black hover:bg-slate-200 font-bold rounded-xl transition-all shadow-lg shadow-white/5"
                        size="default"
                        onClick={handleCreate}
                        disabled={!newLabel || !newKey || creating}
                    >
                        {creating ? <Loader2 className="animate-spin mr-2" size={16} /> : <Plus size={16} className="mr-2" />}
                        Criar Campo
                    </Button>
                </div>
            </div>

            <div className="space-y-4">
                {/* System Fields Section */}
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-[var(--ds-text-muted)] uppercase tracking-wider px-1">Campos do Sistema</h4>
                    <div className="space-y-2">
                        {[
                            { label: 'Nome', key: 'nome' },
                            { label: 'Telefone', key: 'telefone' },
                            { label: 'E-mail', key: 'email' }
                        ].map((field) => (
                            <div
                                key={field.key}
                                className="flex items-center justify-between p-3.5 rounded-xl border border-primary-500/20 bg-primary-500/5"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary-500/10 border border-primary-500/20 text-primary-400">
                                        <Type size={14} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-[var(--ds-text-primary)]">{field.label}</p>
                                        <p className="text-[10px] font-mono text-primary-400 flex items-center gap-1">
                                            <span>{'{{'}</span>
                                            {field.key}
                                            <span>{'}}'}</span>
                                        </p>
                                    </div>
                                </div>
                                <span className="text-[10px] text-[var(--ds-text-muted)] px-2 py-1 rounded bg-[var(--ds-bg-surface)]/50">automático</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Custom Fields Section */}
                <h4 className="text-xs font-semibold text-[var(--ds-text-muted)] uppercase tracking-wider px-1 pt-4">Campos Personalizados</h4>

                {loading ? (
                    <div className="flex justify-center py-8 text-[var(--ds-text-muted)]">
                        <Loader2 className="animate-spin" />
                    </div>
                ) : fields.length === 0 ? (
                    <div className="text-center py-6 px-4 rounded-2xl border border-dashed border-[var(--ds-border-subtle)] bg-white/[0.02]">
                        <p className="text-xs text-[var(--ds-text-muted)]">Nenhum campo personalizado ainda.</p>
                    </div>
                ) : (
                    <div className="space-y-2.5">
                        {fields.map((field) => (
                            <CustomFieldItem
                                key={field.id}
                                field={field}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
