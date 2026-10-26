import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileText,
  HelpCircle,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AgentConfig } from '@/domain/agent-config';
import { extractMaterialFile, type ExtractedMaterial } from '@/lib/material-extraction';
import { cn } from '@/lib/utils';
import {
  knowledgeApi,
  type KnowledgeDocument,
  type KnowledgeFact,
  type UnansweredQuestion,
} from '@/services/knowledge';
import KnowledgeGapsPanel from '@/components/KnowledgeGapsPanel';
import FactsManagerDialog from './FactsManagerDialog';

type KnowledgeView = 'confirmed' | 'faqs' | 'documents' | 'pending';

const viewOptions: Array<{ id: KnowledgeView; label: string }> = [
  { id: 'confirmed', label: 'Informações confirmadas' },
  { id: 'faqs', label: 'Perguntas frequentes' },
  { id: 'documents', label: 'Materiais e documentos' },
  { id: 'pending', label: 'Pendências' },
];

const textareaClass = 'min-h-32 w-full resize-y rounded-xl border border-input bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20';

function EmptyState({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function ReportLine({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return <p className="mt-1 first:mt-0"><strong className="text-foreground">{label}:</strong> {items.join(' · ')}</p>;
}

function StatCard({ label, value, icon: Icon, attention, onClick }: {
  label: string;
  value: number;
  icon: typeof BookOpen;
  attention?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-xl border border-border bg-secondary p-2">
          <Icon className={cn('h-4 w-4', attention ? 'text-destructive' : 'text-primary')} />
        </span>
        <span className="text-2xl font-semibold text-foreground">{value}</span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
    </>
  );
  if (!onClick) return <div className="rounded-2xl border border-border bg-card p-4">{content}</div>;
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/30">
      {content}
    </button>
  );
}

export default function KnowledgeWorkspaceSettings({ editable, updateConfigAndSave }: {
  editable: boolean;
  updateConfigAndSave: (updater: (current: AgentConfig) => AgentConfig) => Promise<void>;
}) {
  const [view, setView] = useState<KnowledgeView>('confirmed');
  const [facts, setFacts] = useState<KnowledgeFact[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [pending, setPending] = useState<UnansweredQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);

  const [faqOpen, setFaqOpen] = useState(false);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqSource, setFaqSource] = useState('');

  const [documentOpen, setDocumentOpen] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const [documentType, setDocumentType] = useState<'texto' | 'url'>('texto');
  const [documentUrl, setDocumentUrl] = useState('');
  const [uploadedMaterial, setUploadedMaterial] = useState<ExtractedMaterial | null>(null);
  const [extractingMaterial, setExtractingMaterial] = useState(false);
  const documentFileRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchSummary, setSearchSummary] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextFacts, nextDocuments, nextPending] = await Promise.all([
        knowledgeApi.fetchFacts(),
        knowledgeApi.fetchDocuments(),
        knowledgeApi.fetchUnanswered('open'),
      ]);
      setFacts(nextFacts);
      setDocuments(nextDocuments);
      setPending(nextPending);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o conhecimento.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const confirmedFacts = useMemo(
    () => facts.filter((fact) => fact.category !== 'faq' && fact.status === 'confirmed'),
    [facts],
  );
  const faqs = useMemo(
    () => facts.filter((fact) => fact.category === 'faq' && fact.status === 'confirmed'),
    [facts],
  );
  const reviewFacts = useMemo(
    () => facts.filter((fact) => fact.status === 'needs_review' || fact.status === 'draft'),
    [facts],
  );
  const expiredFacts = useMemo(
    () => facts.filter((fact) => fact.status === 'expired' || Boolean(fact.expires_at && new Date(fact.expires_at) <= new Date())),
    [facts],
  );
  const reviewDocuments = useMemo(
    () => documents.filter((document) => document.status === 'needs_review' || document.status === 'error'),
    [documents],
  );
  const materialAttentionCount = reviewFacts.length + expiredFacts.length + reviewDocuments.length;
  const attentionCount = pending.length + materialAttentionCount;

  const resetFaq = () => {
    setEditingFaqId(null);
    setFaqQuestion('');
    setFaqAnswer('');
    setFaqSource('');
  };

  const openNewFaq = () => {
    resetFaq();
    setFaqOpen(true);
  };

  const openFaqEditor = (faq: KnowledgeFact) => {
    setEditingFaqId(faq.id);
    setFaqQuestion(faq.question || faq.title);
    setFaqAnswer(faq.fact);
    setFaqSource(faq.source || '');
    setFaqOpen(true);
  };

  const saveFaq = async () => {
    if (!faqQuestion.trim() || !faqAnswer.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: faqQuestion.trim(),
        category: 'faq',
        question: faqQuestion.trim(),
        fact: faqAnswer.trim(),
        source: faqSource.trim() || null,
        always_include: false,
      };
      if (editingFaqId) {
        await knowledgeApi.updateFact(editingFaqId, { ...payload, status: 'confirmed', is_active: true });
        toast.success('Pergunta frequente atualizada');
      } else {
        await knowledgeApi.createFact(payload);
        toast.success('Pergunta frequente adicionada');
      }
      setFaqOpen(false);
      resetFaq();
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar a FAQ');
    } finally {
      setSaving(false);
    }
  };

  const resetDocument = () => {
    setEditingDocumentId(null);
    setDocumentTitle('');
    setDocumentContent('');
    setDocumentType('texto');
    setDocumentUrl('');
    setUploadedMaterial(null);
  };

  const openNewDocument = () => {
    resetDocument();
    setDocumentOpen(true);
  };

  const openDocumentEditor = (document: KnowledgeDocument) => {
    setEditingDocumentId(document.id);
    setDocumentTitle(document.title);
    setDocumentContent(document.content);
    setDocumentType(document.doc_type === 'url' ? 'url' : 'texto');
    setDocumentUrl(document.source_url || '');
    setUploadedMaterial(null);
    setDocumentOpen(true);
  };

  const saveDocument = async () => {
    if (!documentTitle.trim() || !documentContent.trim()) return;
    setSaving(true);
    try {
      const common = {
        title: documentTitle.trim(),
        content: documentContent.trim(),
        doc_type: documentType,
        source_url: documentType === 'url' ? documentUrl.trim() || null : null,
      };
      if (editingDocumentId) {
        await knowledgeApi.updateDocument(editingDocumentId, common);
        toast.success('Material atualizado e reindexado');
      } else if (uploadedMaterial) {
        await knowledgeApi.createDocumentForReview({
          ...common,
          ingestion_report: {
            characters_read: uploadedMaterial.charactersRead,
            warnings: uploadedMaterial.warnings,
            unreadable_parts: uploadedMaterial.unreadableParts,
            found_information: [],
            needs_confirmation: [],
            missing_information: [],
            conflicts: [],
          },
        });
        toast.success('Material lido e enviado para sua revisão');
      } else {
        await knowledgeApi.createDocument(common);
        toast.success('Material revisado e aprovado para consulta');
      }
      setDocumentOpen(false);
      resetDocument();
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível processar o material');
    } finally {
      setSaving(false);
    }
  };

  const readMaterialFile = async (file: File) => {
    setExtractingMaterial(true);
    try {
      const extracted = await extractMaterialFile(file);
      setUploadedMaterial(extracted);
      setDocumentTitle(extracted.title);
      setDocumentContent(extracted.content);
      setDocumentType('texto');
      if (!extracted.content) toast.warning('Não encontramos texto legível. Envie outra versão ou cole o conteúdo.');
      else toast.success('Conteúdo extraído. Revise antes de liberar para a agente.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo.');
    } finally {
      setExtractingMaterial(false);
      if (documentFileRef.current) documentFileRef.current.value = '';
    }
  };

  const removeFact = async (fact: KnowledgeFact) => {
    if (!window.confirm(`Excluir “${fact.title}”?`)) return;
    try {
      await knowledgeApi.deleteFact(fact.id);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir a informação.');
    }
  };

  const removeDocument = async (document: KnowledgeDocument) => {
    if (!window.confirm(`Excluir “${document.title}” e todos os trechos indexados?`)) return;
    try {
      await knowledgeApi.deleteDocument(document.id);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível excluir o material.');
    }
  };

  const confirmFact = async (fact: KnowledgeFact) => {
    try {
      await knowledgeApi.confirmFact(fact.id);
      toast.success('Informação confirmada e liberada para a agente.');
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível confirmar a informação.');
    }
  };

  const approveDocument = async (document: KnowledgeDocument) => {
    try {
      await knowledgeApi.approveDocument(document.id);
      toast.success('Material aprovado para consulta.');
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível aprovar o material.');
    }
  };

  const testSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const hits = await knowledgeApi.search(searchQuery.trim());
      setSearchSummary(hits.length
        ? `${hits.length} fonte(s) encontrada(s): ${hits.map((hit) => hit.title).join(', ')}`
        : 'Nenhuma fonte aprovada respondeu. A agente deve admitir que não consegue confirmar e oferecer atendimento humano.');
    } catch (cause) {
      setSearchSummary(cause instanceof Error ? cause.message : 'Falha ao testar a busca.');
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return <div className="eia-card flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando conhecimento…</div>;
  }
  if (error) {
    return <div className="eia-card p-6"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 text-destructive" /><div><h2 className="font-semibold text-foreground">Não foi possível abrir o conhecimento</h2><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button variant="secondary" size="sm" className="mt-4" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Tentar novamente</Button></div></div></div>;
  }

  return (
    <div className="space-y-5">
      <FactsManagerDialog
        open={factsOpen}
        onOpenChange={(open) => { setFactsOpen(open); if (!open) void load(); }}
        isAdmin={editable}
      />

      <div className="eia-card p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="eia-eyebrow">Conhecimento</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">O que a agente pode afirmar com segurança</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Fontes aprovadas, separadas por tipo e com pendências explícitas. A agente nunca escolhe silenciosamente entre informações conflitantes.</p>
          </div>
          <Button variant="primary" onClick={() => setFactsOpen(true)} disabled={!editable}><Plus className="h-4 w-4" />Nova informação</Button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Informações confirmadas" value={confirmedFacts.length} icon={CheckCircle2} />
          <StatCard label="Perguntas frequentes" value={faqs.length} icon={HelpCircle} />
          <StatCard label="Materiais aprovados" value={documents.filter((item) => item.status === 'approved').length} icon={FileText} />
          <StatCard label="Precisam da sua ajuda" value={attentionCount} icon={AlertCircle} attention={attentionCount > 0} onClick={() => setView('pending')} />
        </div>
      </div>

      <div className="eia-card overflow-hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-border p-2">
          {viewOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setView(option.id)}
              className={cn('inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition', view === option.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
            >
              {option.label}
              {option.id === 'pending' && attentionCount > 0 && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums', view === option.id ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-destructive/10 text-destructive')}>
                  {attentionCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {view === 'confirmed' && (
            <section>
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-foreground">Informações confirmadas</h3><p className="mt-1 text-sm text-muted-foreground">Preços, links, horários, prazos, condições e políticas validadas por uma pessoa.</p></div><Button variant="secondary" size="sm" onClick={() => setFactsOpen(true)} disabled={!editable}>Gerenciar</Button></div>
              <div className="mt-4 space-y-2">
                {confirmedFacts.length === 0 ? <EmptyState>Nenhuma informação confirmada ainda.</EmptyState> : confirmedFacts.map((fact) => (
                  <article key={fact.id} className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-foreground">{fact.title}</h4><Badge variant="success">Confirmado</Badge></div><p className="mt-2 whitespace-pre-line text-sm text-foreground">{fact.fact}</p>{fact.source && <p className="mt-2 text-xs text-muted-foreground">Fonte: {fact.source}</p>}</div>{editable && <div className="flex shrink-0 gap-1"><Button variant="ghost" size="sm" onClick={() => setFactsOpen(true)} aria-label={`Editar ${fact.title}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={() => void removeFact(fact)} aria-label={`Excluir ${fact.title}`}><Trash2 className="h-4 w-4" /></Button></div>}</div></article>
                ))}
              </div>
            </section>
          )}

          {view === 'faqs' && (
            <section>
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-foreground">Perguntas frequentes</h3><p className="mt-1 text-sm text-muted-foreground">A agente adapta a linguagem sem alterar a orientação aprovada.</p></div><Button variant="secondary" size="sm" onClick={openNewFaq} disabled={!editable}><Plus className="h-4 w-4" />Nova FAQ</Button></div>
              <div className="mt-4 space-y-2">
                {faqs.length === 0 ? <EmptyState>Nenhuma pergunta frequente aprovada.</EmptyState> : faqs.map((faq) => (
                  <article key={faq.id} className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">{faq.question || faq.title}</p><p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{faq.fact}</p>{faq.source && <p className="mt-2 text-xs text-muted-foreground">Fonte: {faq.source}</p>}</div>{editable && <div className="flex shrink-0 gap-1"><Button variant="ghost" size="sm" onClick={() => openFaqEditor(faq)} aria-label={`Editar ${faq.title}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={() => void removeFact(faq)} aria-label={`Excluir ${faq.title}`}><Trash2 className="h-4 w-4" /></Button></div>}</div></article>
                ))}
              </div>
            </section>
          )}

          {view === 'documents' && (
            <section>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="font-semibold text-foreground">Materiais e documentos</h3><p className="mt-1 text-sm text-muted-foreground">Consulte a leitura, a origem e os avisos antes de liberar cada material.</p></div><Button variant="secondary" size="sm" onClick={openNewDocument} disabled={!editable}><Plus className="h-4 w-4" />Adicionar material</Button></div>
              <div className="mt-4 space-y-2">
                {documents.length === 0 ? <EmptyState>Nenhum material adicionado.</EmptyState> : documents.map((document) => {
                  const report = document.ingestion_report || {};
                  const warnings = Array.isArray(report.warnings) ? report.warnings as string[] : [];
                  const unreadable = Array.isArray(report.unreadable_parts) ? report.unreadable_parts as string[] : [];
                  const conflicts = Array.isArray(report.conflicts) ? report.conflicts as string[] : [];
                  const found = Array.isArray(report.found_information) ? report.found_information as string[] : [];
                  const needsConfirmation = Array.isArray(report.needs_confirmation) ? report.needs_confirmation as string[] : [];
                  const missing = Array.isArray(report.missing_information) ? report.missing_information as string[] : [];
                  const reportHasDetails = warnings.length + unreadable.length + conflicts.length + found.length + needsConfirmation.length + missing.length > 0;
                  return (
                    <article key={document.id} className="rounded-xl border border-border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-foreground">{document.title}</h4><Badge variant={document.status === 'approved' ? 'success' : document.status === 'error' ? 'destructive' : 'muted'}>{document.status === 'approved' ? 'Aprovado' : document.status === 'error' ? 'Falha de leitura' : 'Precisa de revisão'}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{document.chunk_count} trecho(s){document.source_url ? ` · ${document.source_url}` : ''}</p>{document.error_message && <p className="mt-2 text-sm text-destructive">{document.error_message}</p>}{reportHasDetails && <div className="mt-3 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground"><ReportLine label="Informações encontradas" items={found} /><ReportLine label="Precisam de confirmação" items={needsConfirmation} /><ReportLine label="Informações importantes não encontradas" items={missing} /><ReportLine label="Partes ilegíveis" items={unreadable} /><ReportLine label="Conflitos" items={conflicts} /><ReportLine label="Avisos" items={warnings} /></div>}</div>
                        {editable && <div className="flex shrink-0 flex-wrap gap-1">{document.status === 'needs_review' && <Button variant="secondary" size="sm" onClick={() => void approveDocument(document)}><CheckCircle2 className="h-4 w-4" />Aprovar</Button>}<Button variant="ghost" size="sm" onClick={() => openDocumentEditor(document)} aria-label={`Editar ${document.title}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={() => void removeDocument(document)} aria-label={`Excluir ${document.title}`}><Trash2 className="h-4 w-4" /></Button></div>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {view === 'pending' && (
            <section className="space-y-5">
              <KnowledgeGapsPanel
                editable={editable}
                onChange={() => void load()}
                onAddKnowledge={() => setFactsOpen(true)}
                updateConfigAndSave={updateConfigAndSave}
              />
              <div>
                <h3 className="font-semibold text-foreground">Conhecimento esperando sua decisão</h3>
                <p className="mt-1 text-sm text-muted-foreground">Nada abaixo vira verdade ou regra até uma decisão humana.</p>
              </div>
              <div className="space-y-3">
                {reviewFacts.map((fact) => <article key={fact.id} className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><Badge variant="muted">Informação sugerida</Badge><p className="mt-2 text-sm font-semibold text-foreground">{fact.title}</p><p className="mt-1 text-sm text-muted-foreground">{fact.fact}</p>{fact.source && <p className="mt-1 text-xs text-muted-foreground">Origem: {fact.source}</p>}</div>{editable && <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => void confirmFact(fact)}><CheckCircle2 className="h-4 w-4" />Confirmar</Button><Button variant="ghost" size="sm" onClick={() => void removeFact(fact)}>Ignorar</Button></div>}</div></article>)}
                {reviewDocuments.map((document) => <article key={document.id} className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><Badge variant={document.status === 'error' ? 'destructive' : 'muted'}>{document.status === 'error' ? 'Material ilegível' : 'Material para revisar'}</Badge><p className="mt-2 text-sm font-semibold text-foreground">{document.title}</p><p className="mt-1 text-xs text-muted-foreground">{document.error_message || `${document.chunk_count} trecho(s) encontrados.`}</p></div>{editable && <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => openDocumentEditor(document)}><Pencil className="h-4 w-4" />Revisar</Button><Button variant="ghost" size="sm" onClick={() => void removeDocument(document)}>Ignorar</Button></div>}</div></article>)}
                {expiredFacts.map((fact) => <article key={fact.id} className="rounded-xl border border-border bg-muted/30 p-4"><Badge variant="muted">Informação vencida</Badge><p className="mt-2 text-sm font-semibold text-foreground">{fact.title}</p><p className="mt-1 text-sm text-muted-foreground">{fact.fact}</p><Button variant="secondary" size="sm" className="mt-3" onClick={() => setFactsOpen(true)}>Revisar informação</Button></article>)}
                {materialAttentionCount === 0 && <EmptyState>Nenhuma informação ou material aguardando revisão. As perguntas sem resposta ficam no painel acima.</EmptyState>}
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="eia-card p-5">
        <div className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">Teste o que a agente encontra</h3></div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void testSearch(); }} placeholder="Ex.: Qual é o preço do plano?" /><Button variant="secondary" onClick={() => void testSearch()} disabled={searching || !searchQuery.trim()}>{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Testar busca</Button></div>
        {searchSummary && <p className="mt-3 rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">{searchSummary}</p>}
      </div>

      <Dialog open={faqOpen} onOpenChange={(open) => { setFaqOpen(open); if (!open) resetFaq(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingFaqId ? 'Editar pergunta frequente' : 'Nova pergunta frequente'}</DialogTitle><DialogDescription>Registre uma orientação aprovada. A agente pode adaptar a linguagem sem alterar o sentido.</DialogDescription></DialogHeader>
          <div className="space-y-4"><div><Label htmlFor="faq-question">Pergunta</Label><Input id="faq-question" className="mt-1.5" value={faqQuestion} onChange={(event) => setFaqQuestion(event.target.value)} placeholder="Ex.: Quanto custa o plano principal?" /></div><div><Label htmlFor="faq-answer">Orientação aprovada</Label><textarea id="faq-answer" className={cn(textareaClass, 'mt-1.5')} value={faqAnswer} onChange={(event) => setFaqAnswer(event.target.value)} placeholder="Ex.: O plano principal custa R$ 497/mês e inclui…" /></div><div><Label htmlFor="faq-source">Fonte <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input id="faq-source" className="mt-1.5" value={faqSource} onChange={(event) => setFaqSource(event.target.value)} placeholder="Ex.: tabela comercial de agosto/2026" /></div></div>
          <DialogFooter><Button variant="ghost" onClick={() => setFaqOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => void saveFaq()} disabled={saving || !faqQuestion.trim() || !faqAnswer.trim()}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{editingFaqId ? 'Salvar alterações' : 'Salvar FAQ'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={documentOpen} onOpenChange={(open) => { setDocumentOpen(open); if (!open) resetDocument(); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editingDocumentId ? 'Editar material' : 'Adicionar material'}</DialogTitle><DialogDescription>{editingDocumentId ? 'Revise o texto e salve para reindexar a fonte aprovada.' : 'Envie um arquivo ou cole texto revisado. A extração nunca é aprovada sem sua conferência.'}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            {!editingDocumentId && <><input ref={documentFileRef} type="file" accept=".pdf,.docx,.txt,.md,.json,.csv,.xlsx" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readMaterialFile(file); }} /><div className="rounded-xl border border-dashed border-border p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-sm font-medium text-foreground">PDF, DOCX, TXT, CSV ou XLSX</p><p className="mt-1 text-xs text-muted-foreground">PDFs sem texto selecionável serão sinalizados; não há OCR garantido.</p></div><Button variant="secondary" size="sm" disabled={extractingMaterial} onClick={() => documentFileRef.current?.click()}>{extractingMaterial ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{extractingMaterial ? 'Lendo…' : 'Escolher arquivo'}</Button></div>{uploadedMaterial && <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs"><p className="font-medium text-foreground">{uploadedMaterial.title}</p><p className="mt-1 text-muted-foreground">{uploadedMaterial.charactersRead.toLocaleString('pt-BR')} caracteres lidos · ficará pendente até aprovação</p>{uploadedMaterial.warnings.map((warning) => <p key={warning} className="mt-1 text-muted-foreground">{warning}</p>)}</div>}</div></>}
            <div><Label htmlFor="document-title">Título</Label><Input id="document-title" className="mt-1.5" value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder="Ex.: Apresentação comercial — agosto de 2026" /></div>
            <div><Label htmlFor="document-type">Origem</Label><select id="document-type" value={documentType} onChange={(event) => setDocumentType(event.target.value as 'texto' | 'url')} className="mt-1.5 h-10 w-full rounded-xl border border-input bg-secondary px-3 text-sm"><option value="texto">Arquivo ou texto colado</option><option value="url">URL específica</option></select></div>
            {documentType === 'url' && <div><Label htmlFor="document-url">URL de origem</Label><Input id="document-url" className="mt-1.5" value={documentUrl} onChange={(event) => setDocumentUrl(event.target.value)} placeholder="https://suaempresa.com.br/politica" /></div>}
            <div><Label htmlFor="document-content">Conteúdo extraído e revisado</Label><textarea id="document-content" className={cn(textareaClass, 'mt-1.5 min-h-56')} value={documentContent} onChange={(event) => setDocumentContent(event.target.value)} placeholder="Cole aqui o texto legível do material…" /></div>
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">Confirme versão, data, origem, informações ausentes e contradições. Remova dados pessoais ou confidenciais desnecessários.</div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setDocumentOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => void saveDocument()} disabled={saving || !documentTitle.trim() || !documentContent.trim()}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{editingDocumentId ? 'Salvar e reindexar' : uploadedMaterial ? 'Salvar para revisão' : 'Aprovar texto revisado'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
