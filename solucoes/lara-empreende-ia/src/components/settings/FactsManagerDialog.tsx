import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Skeleton } from '../ui/skeleton';
import { knowledgeApi, type KnowledgeFact } from '@/services/knowledge';

interface FactsManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}

const FactsManagerDialog: React.FC<FactsManagerDialogProps> = ({ open, onOpenChange, isAdmin }) => {
  const [facts, setFacts] = useState<KnowledgeFact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<KnowledgeFact | null | 'new'>(null);
  const [category, setCategory] = useState('geral');
  const [title, setTitle] = useState('');
  const [factText, setFactText] = useState('');
  const [source, setSource] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const loadFacts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgeApi.fetchFacts();
      setFacts(data.filter((fact) => fact.category !== 'faq' && fact.status === 'confirmed'));
    } catch (error) {
      console.error('[FactsManagerDialog] Error loading facts:', error);
      toast.error('Não foi possível carregar as informações confirmadas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    loadFacts();
  }, [open, loadFacts]);

  const startNew = () => {
    setCategory('geral');
    setTitle('');
    setFactText('');
    setSource('');
    setExpiresAt('');
    setEditing('new');
  };

  const startEdit = (fact: KnowledgeFact) => {
    setCategory(fact.category || 'geral');
    setTitle(fact.title || fact.question || fact.category || '');
    setFactText(fact.fact);
    setSource(fact.source || '');
    setExpiresAt(fact.expires_at ? fact.expires_at.slice(0, 10) : '');
    setEditing(fact);
  };

  const handleSave = async () => {
    if (!factText.trim()) {
      toast.error('Escreva a informação antes de salvar');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim() || category.trim() || 'Informação confirmada',
        category: category.trim() || 'geral',
        fact: factText.trim(),
        source: source.trim() || null,
        expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
        always_include: true,
      };

      if (editing === 'new') {
        await knowledgeApi.createFact(payload);
        toast.success('Informação confirmada adicionada');
      } else if (editing) {
        await knowledgeApi.updateFact(editing.id, {
          ...payload,
          status: 'confirmed',
          is_active: true,
        });
        toast.success('Informação confirmada atualizada');
      }

      setEditing(null);
      await loadFacts();
    } catch (error) {
      console.error('[FactsManagerDialog] Error saving fact:', error);
      toast.error('Não foi possível salvar a informação');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (fact: KnowledgeFact) => {
    if (!window.confirm(`Excluir a informação “${fact.fact}”?`)) return;
    try {
      await knowledgeApi.deleteFact(fact.id);
      setFacts((current) => current.filter((item) => item.id !== fact.id));
      if (editing !== 'new' && editing?.id === fact.id) setEditing(null);
      toast.success('Informação confirmada excluída');
    } catch (error) {
      console.error('[FactsManagerDialog] Error deleting fact:', error);
      toast.error('Não foi possível excluir o fato');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 pb-5 pt-6">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle>Informações confirmadas</DialogTitle>
              <DialogDescription className="mt-1.5">
                Estas informações entram em todas as conversas. Você pode visualizar, adicionar,
                editar ou excluir sem sair de Configurações.
              </DialogDescription>
            </div>
            {isAdmin && (
              <Button variant="primary" size="sm" onClick={startNew} className="shrink-0 gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nova informação
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
          {editing && (
            <section className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4" aria-label="Editor de informação confirmada">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {editing === 'new' ? 'Adicionar informação' : 'Editar informação'}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)} aria-label="Fechar editor" className="px-2">
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="settings-fact-title">Título</Label>
                  <Input id="settings-fact-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Preço do plano principal" disabled={saving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-fact-category">Categoria</Label>
                  <Input
                    id="settings-fact-category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    placeholder="Ex.: preço"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="settings-fact-text">Informação que a Lara deve saber</Label>
                  <Input
                    id="settings-fact-text"
                    value={factText}
                    onChange={(event) => setFactText(event.target.value)}
                    placeholder="Ex.: o plano principal custa R$ 497/mês"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-fact-source">Fonte ou confirmação</Label>
                  <Input id="settings-fact-source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Ex.: tabela comercial aprovada" disabled={saving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-fact-expiry">Revisar após <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <Input id="settings-fact-expiry" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} disabled={saving} />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={saving}>
                  Cancelar
                </Button>
                <Button variant="primary" size="sm" onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar informação
                </Button>
              </div>
            </section>
          )}

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 w-full" />)}
            </div>
          ) : facts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
              <BookOpen className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-foreground">Nenhuma informação confirmada</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Comece por preço, links importantes, horários ou qualquer informação que não pode faltar.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {facts.map((fact) => (
                <article key={fact.id} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-secondary/60 p-4">
                  <div className="min-w-0 flex-1">
                    <span className="eia-pill border border-border bg-card text-secondary-foreground">{fact.category || 'geral'}</span>
                    <p className="mt-2 text-sm font-medium text-foreground">{fact.title || fact.category}</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{fact.fact}</p>
                    {fact.source && <p className="mt-2 text-xs text-muted-foreground">Fonte: {fact.source}</p>}
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(fact)} aria-label={`Editar fato ${fact.category}`} className="px-2">
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(fact)} aria-label={`Excluir fato ${fact.category}`} className="px-2 hover:text-destructive">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FactsManagerDialog;
