import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCheck2, Loader2, Lock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { cn } from '@/lib/utils';
import { WhatsAppTemplatesError, whatsappTemplatesApi } from '@/services/whatsappTemplates';
import {
  countBodyVariables,
  renderTemplateText,
  validateTemplateDraft,
  TEMPLATE_LANGUAGES,
  type MetaTemplate,
  type TemplateDraft,
} from '../../../supabase/functions/_shared/whatsapp-templates';

const fieldClass = 'mt-1.5 w-full rounded-xl border border-input bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60';

const STATUS_META: Record<string, { label: string; variant: 'success' | 'muted' | 'destructive' | 'outline' }> = {
  APPROVED: { label: 'Aprovado', variant: 'success' },
  PENDING: { label: 'Em análise', variant: 'muted' },
  IN_APPEAL: { label: 'Em recurso', variant: 'muted' },
  REJECTED: { label: 'Rejeitado', variant: 'destructive' },
  PAUSED: { label: 'Pausado', variant: 'destructive' },
  DISABLED: { label: 'Desativado', variant: 'destructive' },
};

const emptyDraft: TemplateDraft = {
  name: '',
  category: 'UTILITY',
  language: 'pt_BR',
  headerText: '',
  bodyText: '',
  footerText: '',
  exampleValues: [],
};

/** O nome na Meta só aceita [a-z0-9_]; normaliza enquanto digita em vez de rejeitar depois. */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 512);
}

export default function WhatsAppTemplatesSettings() {
  const { isAdmin } = useCompanySettings();
  const [, setSearchParams] = useSearchParams();
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MetaTemplate | null>(null);
  // O nome sobrevive ao fechamento do dialog para o título não piscar vazio
  // durante a animação de saída.
  const [deleteName, setDeleteName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await whatsappTemplatesApi.list());
      setNotConfigured(false);
      setForbidden(false);
    } catch (error) {
      if (error instanceof WhatsAppTemplatesError && error.code === 'whatsapp_cloud_not_configured') {
        setNotConfigured(true);
      } else if (error instanceof WhatsAppTemplatesError && error.code === 'not_allowed') {
        // Observador sem papel de edição: estado informativo, não um erro.
        setForbidden(true);
      } else {
        toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os templates.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const variableCount = countBodyVariables(draft.bodyText);
  // Editar o corpo depois de preencher exemplos pode deixar valores sobrando
  // além das variáveis atuais; a validação e o envio usam só o que está visível.
  const effectiveDraft = useMemo(
    () => ({ ...draft, exampleValues: draft.exampleValues.slice(0, variableCount) }),
    [draft, variableCount],
  );
  const issues = useMemo(() => validateTemplateDraft(effectiveDraft), [effectiveDraft]);
  const issueFor = (field: string) => issues.find((issue) => issue.field === field)?.message;
  // Sem mensagens de erro antes de a pessoa digitar: só valida campos preenchidos.
  const showIssue = (field: 'name' | 'bodyText' | 'headerText' | 'footerText' | 'exampleValues') => {
    if (field === 'exampleValues') return variableCount > 0 ? issueFor(field) : undefined;
    const value = field === 'name' ? draft.name : field === 'bodyText' ? draft.bodyText : field === 'headerText' ? draft.headerText : draft.footerText;
    return value?.trim() ? issueFor(field) : undefined;
  };
  const preview = useMemo(
    () => renderTemplateText(draft.bodyText, draft.exampleValues),
    [draft.bodyText, draft.exampleValues],
  );

  const openCreate = () => {
    setDraft(emptyDraft);
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (issues.length > 0) {
      toast.error(issues[0].message);
      return;
    }
    setSaving(true);
    try {
      const created = await whatsappTemplatesApi.create(effectiveDraft);
      toast.success(`Template “${created.name}” enviado para análise da Meta.`);
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o template.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await whatsappTemplatesApi.remove(deleteTarget.name);
      toast.success('Template excluído.');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir o template.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="eia-card p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="eia-eyebrow">WhatsApp Cloud</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Templates de mensagem</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Fora da janela de 24 horas desde a última mensagem do cliente, a Meta só permite enviar
            templates aprovados — inclusive os follow-ups mais longos da agente. Crie e acompanhe a
            aprovação aqui.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
          <Button variant="primary" size="sm" onClick={openCreate} disabled={!isAdmin || notConfigured}>
            <Plus className="h-4 w-4" />
            Novo template
          </Button>
        </div>
      </div>

      {!isAdmin && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          Apenas administradores podem criar ou excluir templates.
        </p>
      )}

      {forbidden ? (
        <p className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          Seu papel atual não permite ver os templates desta conta. Peça a um administrador.
        </p>
      ) : notConfigured ? (
        <div className="mt-5 rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium text-foreground">WhatsApp Cloud ainda não configurado</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Informe o token de acesso e o ID da conta WhatsApp Business (WABA) para gerenciar templates.
            O token precisa da permissão <span className="font-mono text-xs">whatsapp_business_management</span>.
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setSearchParams({ tab: 'apis' }, { replace: true })}>
            Abrir aba APIs
          </Button>
        </div>
      ) : loading && templates.length === 0 ? (
        <div className="mt-5 flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Consultando templates na Meta…
        </div>
      ) : templates.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum template nesta conta ainda. Crie o primeiro — a aprovação da Meta costuma levar de minutos a algumas horas.
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {templates.map((template) => {
            const status = STATUS_META[template.status] ?? { label: template.status, variant: 'outline' as const };
            return (
              <div key={`${template.name}-${template.language}`} className="rounded-xl border border-border bg-secondary px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">{template.name}</span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <Badge variant="outline">{template.language}</Badge>
                      {template.category && <Badge variant="muted">{template.category === 'UTILITY' ? 'Utilidade' : template.category === 'MARKETING' ? 'Marketing' : template.category}</Badge>}
                    </div>
                    {template.bodyText && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{template.bodyText}</p>}
                    {template.rejectedReason && (
                      <p className="mt-1.5 text-xs text-destructive">Motivo da rejeição: {template.rejectedReason}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 hover:text-destructive" aria-label={`Excluir o template ${template.name}`} onClick={() => { setDeleteTarget(template); setDeleteName(template.name); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Novo template</DialogTitle>
            <DialogDescription>
              A Meta analisa cada template antes de liberar o envio. Use {'{{1}}'}, {'{{2}}'}… para os
              trechos variáveis e dê um exemplo real de cada um.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Nome
                <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: normalizeName(event.target.value) }))} className="mt-1.5 font-mono" placeholder="ex_retomada_diagnostico" />
                {showIssue('name') && <span className="mt-1 block text-xs font-normal text-destructive">{showIssue('name')}</span>}
              </label>
              <label className="block text-sm font-medium">Idioma
                <select value={draft.language} onChange={(event) => setDraft((current) => ({ ...current, language: event.target.value }))} className={fieldClass}>
                  {TEMPLATE_LANGUAGES.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium">Finalidade
              <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as TemplateDraft['category'] }))} className={fieldClass}>
                <option value="UTILITY">Utilidade — retomar um assunto em andamento (follow-up, confirmação)</option>
                <option value="MARKETING">Marketing — ofertas e novidades (exige opt-in do contato)</option>
              </select>
            </label>
            <label className="block text-sm font-medium">Cabeçalho <span className="font-normal text-muted-foreground">(opcional, sem variáveis)</span>
              <Input value={draft.headerText ?? ''} onChange={(event) => setDraft((current) => ({ ...current, headerText: event.target.value }))} className="mt-1.5" placeholder="Ex.: Continuando nossa conversa" />
              {showIssue('headerText') && <span className="mt-1 block text-xs font-normal text-destructive">{showIssue('headerText')}</span>}
            </label>
            <label className="block text-sm font-medium">Corpo da mensagem
              <textarea value={draft.bodyText} onChange={(event) => setDraft((current) => ({ ...current, bodyText: event.target.value }))} className={cn(fieldClass, 'min-h-28 resize-y')} placeholder={'Ex.: Oi {{1}}! Ficamos de retomar sobre {{2}}. Ainda faz sentido para você?'} />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">{draft.bodyText.trim().length}/1024 caracteres · {variableCount} variável(is)</span>
              {showIssue('bodyText') && <span className="mt-1 block text-xs font-normal text-destructive">{showIssue('bodyText')}</span>}
            </label>
            {variableCount > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground">Exemplos das variáveis <span className="font-normal text-muted-foreground">(exigidos pela Meta)</span></p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {Array.from({ length: variableCount }, (_, index) => (
                    <Input
                      key={index}
                      value={draft.exampleValues[index] ?? ''}
                      onChange={(event) => setDraft((current) => {
                        const exampleValues = [...current.exampleValues];
                        exampleValues[index] = event.target.value;
                        return { ...current, exampleValues };
                      })}
                      placeholder={`Exemplo de {{${index + 1}}}`}
                    />
                  ))}
                </div>
                {showIssue('exampleValues') && <p className="mt-1 text-xs text-destructive">{showIssue('exampleValues')}</p>}
              </div>
            )}
            <label className="block text-sm font-medium">Rodapé <span className="font-normal text-muted-foreground">(opcional, sem variáveis)</span>
              <Input value={draft.footerText ?? ''} onChange={(event) => setDraft((current) => ({ ...current, footerText: event.target.value }))} className="mt-1.5" placeholder="Ex.: Responda SAIR para não receber follow-ups" />
              {showIssue('footerText') && <span className="mt-1 block text-xs font-normal text-destructive">{showIssue('footerText')}</span>}
            </label>
            {draft.bodyText.trim() && (
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><FileCheck2 className="h-3.5 w-3.5" />Como o lead vai receber</p>
                {draft.headerText?.trim() && <p className="mt-2 text-sm font-semibold text-foreground">{draft.headerText.trim()}</p>}
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{preview}</p>
                {draft.footerText?.trim() && <p className="mt-1.5 text-xs text-muted-foreground">{draft.footerText.trim()}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button variant="primary" onClick={() => void handleCreate()} disabled={saving || issues.length > 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Enviando…' : 'Enviar para aprovação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o template “{deleteName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A exclusão vale para todos os idiomas desse nome na conta Meta e não pode ser desfeita.
              Follow-ups que dependam dele deixarão de ser entregues fora da janela de 24 horas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20" disabled={deleting} onClick={(event) => { event.preventDefault(); void handleDelete(); }}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Excluir template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
