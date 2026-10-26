import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Compass,
  FileText,
  Globe2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AgentConfig } from '@/domain/agent-config';
import { formatConfigError } from '@/lib/configErrors';
import { completePartialJson } from '@/lib/partialJson';
import {
  extractMaterialFile,
  validateMaterialFiles,
  type ExtractedMaterial,
} from '@/lib/material-extraction';
import { resolveAnswerableField } from '@/lib/setupQuestions';
import { cn } from '@/lib/utils';
import {
  applyAgentSetupProposal,
  generateAgentSetupProposalStream,
  readAgentSetupSources,
  type AgentSetupAnswerNote,
  type AgentSetupAnswers,
  type AgentSetupProposal,
  type AgentSetupUrlSource,
} from '@/services/agent-setup';
import { knowledgeApi } from '@/services/knowledge';
import { recordAgentProductEvent } from '@/services/observability';

type ReviewDecision = 'confirm' | 'edit' | 'incorrect' | 'later' | 'remove';
type SetupStep = 'business' | 'sales' | 'sources' | 'review';

const steps: Array<{ id: SetupStep; label: string }> = [
  { id: 'business', label: 'Seu negócio' },
  { id: 'sales', label: 'Atendimento' },
  { id: 'sources', label: 'Materiais' },
  { id: 'review', label: 'Revisão' },
];

const initialAnswers: AgentSetupAnswers = {
  companyName: '', website: '', companyDescription: '', whatCompanySells: '', primaryAudience: '',
  salesGoal: '', salesProcess: '', tone: '', differentiators: '', restrictions: '', knownFacts: '',
  unknownNotes: '', segmentTemplate: 'none',
};

function answersFromConfig(config: AgentConfig): AgentSetupAnswers {
  return {
    ...initialAnswers,
    companyName: config.identity.companyName,
    website: config.identity.website,
    companyDescription: config.identity.companyDescription,
    whatCompanySells: config.identity.whatCompanySells,
    primaryAudience: config.identity.primaryAudience,
    differentiators: config.identity.differentiators.join('\n'),
    restrictions: config.identity.excludedProfiles.join('\n'),
  };
}

const fieldClass = 'mt-1.5 w-full rounded-xl border border-input bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20';
const textareaClass = cn(fieldClass, 'min-h-24 resize-y');

/**
 * Marcação por campo no lugar dos antigos atalhos que sobrescreviam o texto:
 * o que a pessoa digitou permanece intacto e a marcação segue junto para a IA.
 */
const noteOptions: Array<{ value: AgentSetupAnswerNote; label: string }> = [
  { value: 'unknown', label: 'Não sei' },
  { value: 'later', label: 'Responder depois' },
  { value: 'suggest', label: 'IA pode sugerir' },
  { value: 'handoff', label: 'Depende de outra pessoa' },
];

function NoteChips({ value, onChange }: {
  value: AgentSetupAnswerNote | undefined;
  onChange: (value: AgentSetupAnswerNote | undefined) => void;
}) {
  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {noteOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(value === option.value ? undefined : option.value)}
          className={cn('rounded-full border px-2.5 py-1 text-[11px] transition', value === option.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-ring hover:text-foreground')}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

/**
 * Três decisões com efeitos distintos, no lugar das cinco antigas com efeitos
 * sobrepostos. Editar não é uma decisão: é o lápis ao lado, e editar implica
 * aplicar. `also` mapeia decisões legadas persistidas para a pílula equivalente.
 */
function DecisionPills({ value, onChange, options }: {
  value: ReviewDecision;
  onChange: (value: ReviewDecision) => void;
  options: Array<{ value: ReviewDecision; label: string; icon: typeof Check; also?: ReviewDecision[] }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = option.value === value || (option.also ?? []).includes(value);
        return (
          <button key={option.value} type="button" aria-pressed={selected} onClick={() => onChange(option.value)} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
            <option.icon className="h-3 w-3" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const sectionDecisionOptions: Array<{ value: ReviewDecision; label: string; icon: typeof Check; also?: ReviewDecision[] }> = [
  { value: 'confirm', label: 'Aplicar', icon: Check, also: ['edit'] },
  { value: 'remove', label: 'Não aplicar', icon: XCircle, also: ['incorrect', 'later'] },
];

const factDecisionOptions: Array<{ value: ReviewDecision; label: string; icon: typeof Check; also?: ReviewDecision[] }> = [
  { value: 'confirm', label: 'Confirmar', icon: Check, also: ['edit'] },
  { value: 'later', label: 'Deixar para revisão', icon: ArrowRight },
  { value: 'remove', label: 'Descartar', icon: Trash2, also: ['incorrect'] },
];

function EditToggle({ editing, onToggle }: { editing: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-pressed={editing} onClick={onToggle} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium', editing ? 'border-ring text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
      <Pencil className="h-3 w-3" />
      {editing ? 'Fechar edição' : 'Editar'}
    </button>
  );
}

/**
 * Uma lacuna que o assistente não conseguiu preencher sozinho.
 *
 * O controle vem do campo que a resposta preenche: seletor quando o valor é uma
 * escolha fixa, uma linha por item quando é lista, texto quando é texto. Pergunta
 * cujo campo a interface não reconhece fica sem caixa — dizer onde resolver é mais
 * honesto do que oferecer um lugar que não grava nada.
 */
function PendingQuestion({
  item,
  value,
  onChange,
  onApply,
}: {
  item: AgentSetupProposal['missingInformation'][number];
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
}) {
  const target = resolveAnswerableField(item.field);

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-sm font-medium text-foreground">{item.question}</p>
      {item.reason && <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>}

      {!target ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Esta não tem um campo direto na proposta. Resolva nas seções da configuração depois de aplicar.
        </p>
      ) : (
        <div className="mt-3">
          <Label className="text-xs text-muted-foreground">Preenche: {target.label}</Label>
          {target.kind === 'choice' ? (
            <select value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass}>
              <option value="">Selecione…</option>
              {target.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : target.kind === 'multichoice' ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {target.options?.map((option) => {
                const selectedValues = value.split('\n').filter(Boolean);
                const selected = selectedValues.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange((selected
                      ? selectedValues.filter((item) => item !== option.value)
                      : [...selectedValues, option.value]
                    ).join('\n'))}
                    className={cn(
                      'rounded-full border px-2.5 py-1.5 text-xs font-medium transition',
                      selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-ring hover:text-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : target.kind === 'text' ? (
            <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={target.placeholder} className="mt-1.5" />
          ) : (
            <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={target.placeholder} className={cn(textareaClass, target.kind === 'list' && 'min-h-20')} />
          )}
          <div className="mt-2 flex justify-end">
            <Button variant="secondary" size="sm" disabled={!value.trim()} onClick={onApply}>
              <Check className="h-3.5 w-3.5" />
              Usar esta resposta
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function readableSize(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/**
 * Fechar o modal — inclusive sem querer, com Esc ou clique fora — não pode custar
 * as respostas nem uma proposta que consumiu créditos de IA. O estado vive em
 * sessionStorage por agente e é limpo quando a proposta é aplicada.
 */
const SETUP_STORAGE_VERSION = 1;
const setupStorageKey = (agentId: string) => `agent-setup-assistant:${agentId}`;

interface PersistedSetupState {
  v: number;
  step: SetupStep;
  answers: AgentSetupAnswers;
  siteUrlsText: string;
  materials: ExtractedMaterial[];
  proposal: AgentSetupProposal | null;
  sectionDecisions: Record<'identity' | 'sales' | 'behavior', ReviewDecision>;
  factDecisions: Record<string, ReviewDecision>;
  pendingAnswers: Record<string, string>;
  draftApplied: boolean;
  answerNotes?: Record<string, AgentSetupAnswerNote>;
  urlSources?: { key: string; sources: AgentSetupUrlSource[] } | null;
  /** A proposta foi aplicada; o estado só sobrevive até o conhecimento persistir. */
  applied?: boolean;
}

/**
 * Persistência do conhecimento em voo, por agente e fora do ciclo de vida do
 * componente: reabrir o assistente durante o save não pode disparar uma segunda
 * gravação concorrente (fatos e perguntas deduplicam por check-then-insert, sem
 * UNIQUE no banco) — uma nova aplicação encadeia atrás da anterior.
 */
const knowledgePersistInFlight = new Map<string, Promise<void>>();

function readPersistedSetupState(agentId: string): PersistedSetupState | null {
  try {
    const raw = sessionStorage.getItem(setupStorageKey(agentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSetupState;
    return parsed?.v === SETUP_STORAGE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function clearPersistedSetupState(agentId: string) {
  try {
    sessionStorage.removeItem(setupStorageKey(agentId));
  } catch {
    // Storage indisponível não pode impedir o fluxo.
  }
}

interface AgentSetupAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  currentConfig: AgentConfig;
  editable: boolean;
  onApply: (config: AgentConfig) => Promise<void> | void;
  /** Garante que o rascunho na tela esteja salvo antes de gerar a proposta. */
  ensureDraftSaved?: () => Promise<void>;
  /**
   * 'dialog' é a janela de Configurações → Agente. 'embedded' renderiza o mesmo
   * fluxo direto no corpo de outro contêiner (o onboarding), sem modal dentro
   * de modal e sem botão de fechar.
   */
  variant?: 'dialog' | 'embedded';
  /** Chamado depois que a proposta foi aplicada ao rascunho. */
  onApplied?: () => void;
  /**
   * Respostas conhecidas por quem embute (ex.: nome da empresa digitado no
   * passo anterior do onboarding). Só valem para uma sessão nova — uma sessão
   * retomada do sessionStorage sempre vence.
   */
  answerOverrides?: Partial<AgentSetupAnswers>;
  /** Controles extras no rodapé (ex.: "pular" do onboarding). */
  footerExtra?: React.ReactNode;
}

export default function AgentSetupAssistant({ open, onOpenChange, agentId, currentConfig, editable, onApply, ensureDraftSaved, variant = 'dialog', onApplied, answerOverrides, footerExtra }: AgentSetupAssistantProps) {
  const embedded = variant === 'embedded';
  const [step, setStep] = useState<SetupStep>('business');
  const [answers, setAnswers] = useState<AgentSetupAnswers>(() => answersFromConfig(currentConfig));

  const [answerNotes, setAnswerNotes] = useState<Record<string, AgentSetupAnswerNote>>({});
  const [siteUrlsText, setSiteUrlsText] = useState(currentConfig.identity.website || '');
  const [urlSources, setUrlSources] = useState<{ key: string; sources: AgentSetupUrlSource[] } | null>(null);
  const [readingUrls, setReadingUrls] = useState(false);
  const [materials, setMaterials] = useState<ExtractedMaterial[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [generationStage, setGenerationStage] = useState<'reading' | 'generating' | null>(null);
  // Pré-visualização progressiva do streaming: objeto parcial da proposta,
  // atualizado com moderação para não re-renderizar a cada delta.
  const [streamPreview, setStreamPreview] = useState<Record<string, unknown> | null>(null);
  const lastPreviewAtRef = useRef(0);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<AgentSetupProposal | null>(null);
  const [sectionDecisions, setSectionDecisions] = useState<Record<'identity' | 'sales' | 'behavior', ReviewDecision>>({ identity: 'confirm', sales: 'confirm', behavior: 'confirm' });
  const [factDecisions, setFactDecisions] = useState<Record<string, ReviewDecision>>({});
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, string>>({});
  // O rascunho pode já ter sido aplicado numa tentativa que falhou depois, ao
  // salvar o conhecimento; o retry pula essa etapa em vez de repeti-la.
  const [draftApplied, setDraftApplied] = useState(false);
  const [backgroundSaving, setBackgroundSaving] = useState(false);
  // Sessão retomada de uma aplicação cujo conhecimento pode não ter concluído.
  const [resumedAfterApply, setResumedAfterApply] = useState(false);
  const [applyStage, setApplyStage] = useState<'draft' | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const appliedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const stepIndex = steps.findIndex((item) => item.id === step);
  const siteUrls = useMemo(() => siteUrlsText.split('\n').map((value) => value.trim()).filter(Boolean), [siteUrlsText]);
  const urlsKey = siteUrls.join('\n');
  const generating = generationStage !== null;
  const currentUrlSources = urlSources?.key === urlsKey ? urlSources.sources : null;

  // Overrides mudam de identidade a cada render de quem embute; o ref evita
  // recriar o efeito de restauração por causa disso.
  const answerOverridesRef = useRef(answerOverrides);
  answerOverridesRef.current = answerOverrides;

  const resetWizard = () => {
    // Só preenche lacuna: override nunca sobrescreve valor já vindo do rascunho.
    const base = answersFromConfig(currentConfig);
    const overrides = answerOverridesRef.current ?? {};
    const seeded = { ...base };
    for (const [key, value] of Object.entries(overrides) as Array<[keyof AgentSetupAnswers, string | undefined]>) {
      if (value?.trim() && !seeded[key]?.trim()) seeded[key] = value.trim() as never;
    }
    setStep('business');
    setAnswers(seeded);
    setAnswerNotes({});
    setSiteUrlsText(currentConfig.identity.website || seeded.website || '');

    setUrlSources(null);
    setMaterials([]);
    setProposal(null);
    setSectionDecisions({ identity: 'confirm', sales: 'confirm', behavior: 'confirm' });
    setFactDecisions({});
    setPendingAnswers({});
    setDraftApplied(false);
    setApplyError(null);
  };

  useEffect(() => {
    if (!open) return;
    const restored = readPersistedSetupState(agentId);
    // Sessão retomada de um apply concluído não conta como novo início nem como
    // abandono, e não volta a persistir por cima de um storage já limpo.
    appliedRef.current = restored?.applied === true;
    if (!restored?.applied) {
      void recordAgentProductEvent(agentId, 'setup_started', restored?.step ?? 'business', { source: 'settings_agent', resumed: Boolean(restored) }).catch(() => undefined);
    }
    if (restored) {
      // Uma geração interrompida pode ter persistido o passo de revisão sem
      // proposta; voltar para Materiais evita reabrir numa tela vazia.
      setStep(restored.step === 'review' && !restored.proposal ? 'sources' : restored.step);
      setAnswers(restored.answers);
      setAnswerNotes(restored.answerNotes ?? {});
      setSiteUrlsText(restored.siteUrlsText);
      setUrlSources(restored.urlSources ?? null);
      setMaterials(restored.materials);
      setProposal(restored.proposal);
      setSectionDecisions(restored.sectionDecisions);
      setFactDecisions(restored.factDecisions);
      setPendingAnswers(restored.pendingAnswers);
      setDraftApplied(restored.draftApplied);
      setResumedAfterApply(restored.applied === true);
      setApplyError(null);
      const inFlight = knowledgePersistInFlight.get(agentId);
      if (inFlight) {
        setBackgroundSaving(true);
        let active = true;
        void inFlight.catch(() => undefined).finally(() => { if (active) setBackgroundSaving(false); });
        return () => { active = false; };
      }
      setBackgroundSaving(false);
      return;
    }
    setResumedAfterApply(false);
    setBackgroundSaving(false);
    resetWizard();
  }, [open, agentId]);

  const persistNow = (overrides?: Partial<PersistedSetupState>) => {
    try {
      const payload: PersistedSetupState = {
        v: SETUP_STORAGE_VERSION,
        step,
        answers,
        answerNotes,
        siteUrlsText,
        urlSources,
        // O servidor lê no máximo 80k caracteres por fonte; guardar além disso
        // só arriscaria estourar a cota do sessionStorage.
        materials: materials.map((material) => ({ ...material, content: material.content.slice(0, 80_000) })),
        proposal,
        sectionDecisions,
        factDecisions,
        pendingAnswers,
        draftApplied,
        ...overrides,
      };
      sessionStorage.setItem(setupStorageKey(agentId), JSON.stringify(payload));
    } catch {
      // Cota cheia ou storage bloqueado: o fluxo segue, apenas sem retomada.
    }
  };
  const persistNowRef = useRef(persistNow);
  persistNowRef.current = persistNow;

  // Persiste com atraso curto: respostas mudam a cada tecla e o payload carrega
  // o texto extraído dos materiais.
  useEffect(() => {
    if (!open || appliedRef.current) return;
    const handle = setTimeout(() => persistNowRef.current(), 400);
    return () => clearTimeout(handle);
  }, [open, step, answers, answerNotes, siteUrlsText, urlSources, materials, proposal, sectionDecisions, factDecisions, pendingAnswers, draftApplied, agentId]);

  const restartFromScratch = () => {
    if (!window.confirm('Descartar as respostas e a proposta deste assistente e recomeçar?')) return;
    clearPersistedSetupState(agentId);
    resetWizard();
  };

  useEffect(() => {
    if (!open) return;
    void recordAgentProductEvent(agentId, 'setup_step_viewed', step).catch(() => undefined);
  }, [agentId, open, step]);

  const updateAnswer = (key: keyof AgentSetupAnswers, value: string) => setAnswers((current) => ({ ...current, [key]: value }));

  const setAnswerNote = (key: string, note: AgentSetupAnswerNote | undefined) => setAnswerNotes((current) => {
    const next = { ...current };
    if (note) next[key] = note;
    else delete next[key];
    return next;
  });

  /** Lê as páginas sem gerar nada: o status de cada URL aparece antes de gastar créditos. */
  const readUrlsNow = async (): Promise<AgentSetupUrlSource[] | null> => {
    if (siteUrls.length === 0) return [];
    if (siteUrls.length > 6) {
      toast.error('Envie no máximo 6 páginas específicas por proposta.');
      return null;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setReadingUrls(true);
    try {
      const sources = await readAgentSetupSources({ agentId, siteUrls, signal: controller.signal });
      setUrlSources({ key: urlsKey, sources });
      return sources;
    } catch (error) {
      if (controller.signal.aborted) return null;
      toast.error(error instanceof Error ? error.message : 'Não foi possível ler as páginas.');
      return null;
    } finally {
      setReadingUrls(false);
      abortRef.current = null;
    }
  };

  const cancelGeneration = () => {
    abortRef.current?.abort();
    setGenerationStage(null);
    setStreamPreview(null);
    setStep('sources');
  };

  // O JSON da proposta chega em ordem fixa de chaves; uma seção está completa
  // quando alguma chave posterior a ela já apareceu no texto parcial.
  const streamSections = useMemo(() => {
    if (!streamPreview) return null;
    const arrivedKeys = Object.keys(streamPreview);
    const ordered: Array<{ key: string; label: string }> = [
      { key: 'identity', label: 'Identidade e negócio' },
      { key: 'salesProcess', label: 'Atendimento e vendas' },
      { key: 'customInstructions', label: 'Comportamento' },
      { key: 'suggestedFacts', label: 'Informações encontradas' },
      { key: 'missingInformation', label: 'Pendências a revisar' },
    ];
    return ordered.map((section, index) => {
      const arrived = arrivedKeys.includes(section.key);
      const laterArrived = ordered.slice(index + 1).some((later) => arrivedKeys.includes(later.key));
      const value = streamPreview[section.key];
      return {
        ...section,
        state: laterArrived ? 'done' as const : arrived ? 'writing' as const : 'pending' as const,
        count: Array.isArray(value) ? value.length : null,
      };
    });
  }, [streamPreview]);
  const previewIdentity = streamPreview?.identity as Record<string, unknown> | undefined;
  const previewIdentityLine = [
    typeof previewIdentity?.agentName === 'string' && previewIdentity.agentName && `Agente: ${previewIdentity.agentName}`,
    typeof previewIdentity?.companyName === 'string' && previewIdentity.companyName && `Empresa: ${previewIdentity.companyName}`,
    typeof previewIdentity?.whatCompanySells === 'string' && previewIdentity.whatCompanySells,
  ].filter(Boolean).join(' · ');

  const handleFiles = async (files: File[]) => {
    try {
      validateMaterialFiles(files);
      if (materials.length + files.length > 8) throw new Error('Envie no máximo 8 arquivos por vez.');
      if (materials.reduce((sum, item) => sum + item.sizeBytes, 0) + files.reduce((sum, file) => sum + file.size, 0) > 24 * 1024 * 1024) {
        throw new Error('Os arquivos ultrapassam o limite total de 24 MB. Divida o envio em partes.');
      }
      setExtracting(true);
      const extracted: ExtractedMaterial[] = [];
      for (const file of files) extracted.push(await extractMaterialFile(file));
      setMaterials((current) => [...current, ...extracted]);
      const unreadable = extracted.filter((item) => !item.content).length;
      if (unreadable) toast.warning(`${unreadable} arquivo(s) precisam de outra versão ou texto colado.`);
      else toast.success(`${extracted.length} material(is) lido(s) para revisão.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível ler os arquivos.');
    } finally {
      setExtracting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    const hasAnyAnswer = Object.values(answers).some((value) => value.trim() && value !== 'none');
    if (!hasAnyAnswer && siteUrls.length === 0 && materials.length === 0) {
      toast.error('Responda ao menos uma pergunta ou envie um material.');
      return;
    }
    if (siteUrls.length > 6) {
      toast.error('Envie no máximo 6 páginas específicas por proposta.');
      return;
    }
    const originStep = step === 'review' ? 'sources' : step;
    const controller = new AbortController();
    abortRef.current = controller;
    setStep('review');
    setStreamPreview(null);
    lastPreviewAtRef.current = 0;
    const startedAt = performance.now();
    let readMs = 0;
    try {
      let sources = currentUrlSources;
      const needsReading = !sources && siteUrls.length > 0;
      setGenerationStage(needsReading ? 'reading' : 'generating');
      // O save do rascunho (a proposta parte do rascunho lido no servidor) e a
      // leitura das páginas não dependem um do outro — correm juntos.
      const [, readResult] = await Promise.all([
        ensureDraftSaved?.(),
        (async () => {
          if (!needsReading) return sources;
          const readStart = performance.now();
          const read = await readAgentSetupSources({ agentId, siteUrls, signal: controller.signal });
          readMs = Math.round(performance.now() - readStart);
          return read;
        })(),
      ]);
      sources = readResult ?? null;
      if (needsReading && sources) {
        setUrlSources({ key: urlsKey, sources });
        const failed = sources.filter((source) => !source.content);
        if (failed.length === siteUrls.length && !hasAnyAnswer && materials.length === 0) {
          throw new Error('Nenhuma página pôde ser lida. Corrija os endereços ou responda alguma pergunta.');
        }
        if (failed.length > 0) toast.warning(`${failed.length} página(s) não puderam ser lidas; elas aparecem no relatório da revisão.`);
      }
      setGenerationStage('generating');
      const generateStart = performance.now();
      const result = await generateAgentSetupProposalStream({
        agentId,
        answers,
        answerNotes,
        siteUrls,
        urlSources: sources ?? [],
        materials,
        signal: controller.signal,
        onDelta: (fullText) => {
          const now = Date.now();
          if (now - lastPreviewAtRef.current < 300) return;
          lastPreviewAtRef.current = now;
          const partial = completePartialJson(fullText);
          if (partial && typeof partial === 'object') setStreamPreview(partial as Record<string, unknown>);
        },
      });
      // O servidor devolve as fontes sem o conteúdo (o cliente já o tem) — a
      // reidratação por id restaura o texto para a revisão e para o apply.
      const contentById = new Map<string, string>(
        [...materials, ...(sources ?? [])].map((item) => [item.id, item.content]),
      );
      const next = {
        ...result.proposal,
        sources: result.proposal.sources.map((source) => (
          source.content ? source : { ...source, content: contentById.get(source.id) ?? '' }
        )),
      };
      setProposal(next);
      setFactDecisions(Object.fromEntries(next.suggestedFacts.map((fact) => [fact.id!, 'later'])));
      setPendingAnswers({});
      setDraftApplied(false);
      setApplyError(null);
      setStep('review');
      void recordAgentProductEvent(agentId, 'setup_proposal_generated', 'review', {
        suggestedFacts: next.suggestedFacts.length,
        sources: next.sources.length,
        missingInformation: next.missingInformation.length,
        readMs,
        generateMs: Math.round(performance.now() - generateStart),
        totalMs: Math.round(performance.now() - startedAt),
        serverMs: result.durationMs,
      }).catch(() => undefined);
      toast.success('Proposta pronta. Nada foi aplicado ainda.');
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar a proposta.');
      setStep(originStep);
    } finally {
      setGenerationStage(null);
      setStreamPreview(null);
      abortRef.current = null;
    }
  };

  /**
   * Grava a resposta no campo que a pergunta aponta e retira a pergunta da lista.
   * Tudo acontece na proposta em memória — nada é publicado antes de "Aplicar ao
   * rascunho", igual ao resto desta tela.
   */
  const applyPendingAnswer = (field: string) => {
    const target = resolveAnswerableField(field);
    const value = pendingAnswers[field]?.trim();
    if (!proposal || !target || !value) return;
    setProposal({
      ...target.apply(proposal, value),
      missingInformation: proposal.missingInformation.filter((item) => item.field !== field),
    });
    setPendingAnswers((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    toast.success(`Resposta usada em ${target.label}.`);
  };

  const handleApply = async () => {
    if (!proposal) return;
    // Valida antes de tocar em qualquer coisa: uma resposta que não couber no
    // schema não pode custar a revisão inteira nem virar um ZodError cru na tela.
    let config: AgentConfig;
    try {
      config = applyAgentSetupProposal(currentConfig, proposal, {
        identity: ['confirm', 'edit'].includes(sectionDecisions.identity),
        sales: ['confirm', 'edit'].includes(sectionDecisions.sales),
        behavior: ['confirm', 'edit'].includes(sectionDecisions.behavior),
      });
    } catch (error) {
      toast.error(formatConfigError(error, 'Não foi possível aplicar a proposta.'));
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      if (!draftApplied) {
        setApplyStage('draft');
        await onApply(config);
        setDraftApplied(true);
      }
    } catch (error) {
      const message = formatConfigError(error, 'Não foi possível aplicar a proposta.');
      setApplyError(message);
      toast.error(message);
      setApplying(false);
      setApplyStage(null);
      return;
    }

    // Rascunho aplicado — é o que muda a configuração; o modal fecha agora.
    // Fatos, materiais e perguntas seguem em segundo plano: cada escrita é
    // idempotente e o sessionStorage guarda a retomada até tudo persistir.
    const knowledgeInput = {
      facts: proposal.suggestedFacts.flatMap((fact) => {
          const decision = factDecisions[fact.id!] || 'later';
          if (decision === 'incorrect' || decision === 'remove') return [];
          return [{
            title: fact.title,
            category: fact.category,
            fact: fact.fact,
            source: fact.source || fact.evidence || 'Configuração assistida',
            critical: fact.critical,
            decision: decision === 'later' ? 'suggest' as const : 'confirm' as const,
          }];
        }),
        documents: proposal.sources.map((source) => ({
          title: source.title,
          content: source.content,
          doc_type: source.kind === 'url' ? 'url' as const : 'texto' as const,
          source_url: source.kind === 'url' ? source.sourceLabel : null,
          error_message: source.content ? null : source.warnings.join(' ') || 'Material sem texto legível.',
          ingestion_report: {
            characters_read: source.charactersRead,
            warnings: source.warnings,
            unreadable_parts: source.unreadableParts,
            found_information: proposal.suggestedFacts.filter((fact) => fact.source === source.sourceLabel || fact.source === source.title).map((fact) => fact.title),
            needs_confirmation: proposal.suggestedFacts.filter((fact) => fact.critical).map((fact) => fact.title),
            missing_information: proposal.missingInformation.map((item) => item.question),
            conflicts: proposal.assumptions,
          },
        })),
        unanswered: [
          ...proposal.missingInformation.map((item) => ({
            question: item.question,
            context: item.reason || `Campo pendente: ${item.field}`,
            kind: 'question' as const,
            metadata: { source: 'agent_setup_assistant', field: item.field },
          })),
          ...proposal.assumptions.map((assumption) => ({
            question: assumption,
            context: 'Conflito ou suposição detectada durante a configuração assistida.',
            kind: 'conflict' as const,
            metadata: { source: 'agent_setup_assistant' },
          })),
        ],
      };

    const acceptedSections = Object.values(sectionDecisions).filter((decision) => ['confirm', 'edit'].includes(decision)).length;
    const acceptedFacts = Object.values(factDecisions).filter((decision) => ['confirm', 'edit'].includes(decision)).length;
    void recordAgentProductEvent(agentId, 'setup_applied', 'review', {
      acceptedSections,
      acceptedFacts,
      rejectedOrDeferredSections: 3 - acceptedSections,
      rejectedOrDeferredFacts: proposal.suggestedFacts.length - acceptedFacts,
      aiGeneratedFields: acceptedSections + acceptedFacts + proposal.sources.length,
    }).catch(() => undefined);

    appliedRef.current = true;
    persistNow({ draftApplied: true, applied: true, step: 'review' });
    setApplying(false);
    setApplyStage(null);
    // No modo janela, aplicar fecha o modal. Embutido, quem hospeda decide o
    // próximo passo — fechar aqui derrubaria o passo do onboarding.
    if (!embedded) onOpenChange(false);
    onApplied?.();


    // Encadeia atrás de qualquer persistência anterior ainda em voo — nunca há
    // duas gravações concorrentes de fatos/perguntas para o mesmo agente.
    const previous = knowledgePersistInFlight.get(agentId) ?? Promise.resolve();
    const background = previous
      .catch(() => undefined)
      .then(() => knowledgeApi.applySetupKnowledge(knowledgeInput))
      .then(() => {
        clearPersistedSetupState(agentId);
      })
      .finally(() => {
        if (knowledgePersistInFlight.get(agentId) === background) knowledgePersistInFlight.delete(agentId);
      });
    knowledgePersistInFlight.set(agentId, background);
    toast.promise(background, {
      loading: 'Rascunho atualizado. Salvando fatos, materiais e pendências…',
      success: 'Conhecimento salvo. Itens pendentes aguardam sua revisão.',
      error: (error) => `${formatConfigError(error, 'Não foi possível salvar o conhecimento.')} Reabra “Configurar com IA” e clique em Aplicar — nada será duplicado.`,
    });
  };

  const nextStep = () => setStep(steps[Math.min(steps.length - 1, stepIndex + 1)].id);
  const previousStep = () => setStep(steps[Math.max(0, stepIndex - 1)].id);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && open && !appliedRef.current && !applying) {
      // Fechar no meio de uma geração não deixa a chamada correndo à toa.
      abortRef.current?.abort();
      void recordAgentProductEvent(agentId, 'setup_abandoned', step, {
        hadProposal: Boolean(proposal),
        materials: materials.length,
        urls: siteUrls.length,
      }).catch(() => undefined);
    }
    onOpenChange(nextOpen);
  };

  const headerNode = embedded ? (
    <div className="flex items-center gap-2 border-b border-border px-6 py-4">
      <span className="rounded-xl bg-primary p-2 text-primary-foreground"><Compass className="h-4 w-4" /></span>
      <div className="flex-1">
        <h3 className="text-base font-semibold text-foreground">Configurar com IA</h3>
        <p className="text-sm text-muted-foreground">Responda o que souber. Sites e materiais são opcionais; você revisa tudo antes de aplicar.</p>
      </div>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={restartFromScratch}>Recomeçar</Button>
    </div>
  ) : (

        <DialogHeader className="px-6 pt-6"><div className="flex items-center gap-2"><span className="rounded-xl bg-primary p-2 text-primary-foreground"><Compass className="h-4 w-4" /></span><div className="flex-1"><DialogTitle>Configurar com IA</DialogTitle><DialogDescription>Responda o que souber. Sites e materiais são opcionais; você revisa tudo antes de aplicar. Fechar esta janela não perde seu progresso.</DialogDescription></div><Button variant="ghost" size="sm" className="mr-6 shrink-0" onClick={restartFromScratch}>Recomeçar</Button></div></DialogHeader>
  );

  const stepperNode = (
    <div className="flex gap-1 overflow-x-auto border-b border-border bg-muted/20 px-6 py-3">{steps.map((item, index) => <button key={item.id} type="button" onClick={() => item.id !== 'review' || proposal ? setStep(item.id) : undefined} className={cn('inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium', step === item.id ? 'bg-primary text-primary-foreground' : index < stepIndex ? 'text-foreground' : 'text-muted-foreground')}><span className={cn('flex h-5 w-5 items-center justify-center rounded-full border text-[10px]', step === item.id ? 'border-primary-foreground/50' : 'border-border')}>{index < stepIndex ? <Check className="h-3 w-3" /> : index + 1}</span>{item.label}</button>)}</div>
  );

  const footerNode = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-6 py-4">
      <Button variant="ghost" disabled={stepIndex === 0 || generating || applying} onClick={previousStep}><ArrowLeft className="h-4 w-4" />Voltar</Button>
      <div className="flex flex-wrap justify-end gap-2">
        {footerExtra}
        {!embedded && step !== 'review' && <Button variant="ghost" onClick={() => onOpenChange(false)}>Continuar manualmente</Button>}
        {(step === 'business' || step === 'sales') && <Button variant="secondary" disabled={generating || extracting} onClick={() => void handleGenerate()}><Compass className="h-4 w-4" />Gerar proposta agora</Button>}
        {step === 'sources' ? (
          <Button variant="primary" disabled={generating || extracting} onClick={() => void handleGenerate()}>{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}{generating ? 'Preparando…' : 'Gerar proposta'}</Button>
        ) : step === 'review' ? (
          <Button variant="primary" disabled={!proposal || applying || !editable} onClick={() => void handleApply()}>{applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{applying ? 'Aplicando…' : applyError ? 'Tentar novamente' : 'Aplicar ao rascunho'}</Button>
        ) : (
          <Button variant="primary" onClick={nextStep}>Avançar<ArrowRight className="h-4 w-4" /></Button>
        )}
      </div>
    </div>
  );

  const bodyNode = (

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          {step === 'business' && <div className="space-y-5"><div><h3 className="text-lg font-semibold text-foreground">Conte o básico sobre a empresa</h3><p className="mt-1 text-sm text-muted-foreground">Exemplos mostram o nível de detalhe esperado. Você pode deixar lacunas explícitas.</p></div><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Nome da empresa<Input value={answers.companyName} onChange={(event) => updateAnswer('companyName', event.target.value)} className="mt-1.5" placeholder="Ex.: Empreende.IA" /></label><label className="text-sm font-medium">Site <span className="font-normal text-muted-foreground">(opcional)</span><Input value={answers.website} onChange={(event) => { const next = event.target.value; setSiteUrlsText((current) => (!current.trim() || current.trim() === answers.website.trim()) ? next : current); updateAnswer('website', next); }} className="mt-1.5" placeholder="https://suaempresa.com.br" /></label><label className="text-sm font-medium md:col-span-2">O que a empresa faz<textarea value={answers.companyDescription} onChange={(event) => updateAnswer('companyDescription', event.target.value)} className={textareaClass} placeholder="Ex.: Ajudamos pequenas empresas a implantar atendimento e vendas com inteligência artificial." /><NoteChips value={answerNotes.companyDescription} onChange={(note) => setAnswerNote('companyDescription', note)} /></label><label className="text-sm font-medium">O que vende<textarea value={answers.whatCompanySells} onChange={(event) => updateAnswer('whatCompanySells', event.target.value)} className={textareaClass} placeholder="Ex.: Mentoria de implantação, treinamento da equipe e agentes de atendimento sob medida." /><NoteChips value={answerNotes.whatCompanySells} onChange={(note) => setAnswerNote('whatCompanySells', note)} /></label><label className="text-sm font-medium">Para quem vende<textarea value={answers.primaryAudience} onChange={(event) => updateAnswer('primaryAudience', event.target.value)} className={textareaClass} placeholder="Ex.: Donos de empresas de serviços com equipe comercial pequena e alto volume de WhatsApp." /><NoteChips value={answerNotes.primaryAudience} onChange={(note) => setAnswerNote('primaryAudience', note)} /></label></div><label className="block text-sm font-medium">Modelo de segmento <span className="font-normal text-muted-foreground">(editável)</span><select value={answers.segmentTemplate} onChange={(event) => updateAnswer('segmentTemplate', event.target.value)} className={fieldClass}><option value="none">Sem modelo — usar apenas minhas respostas</option><option value="consultoria-b2b">Consultoria ou serviço B2B</option><option value="servicos-locais">Serviço local</option><option value="infoproduto">Educação, mentoria ou infoproduto</option><option value="software-b2b">Software B2B</option></select></label></div>}

          {step === 'sales' && <div className="space-y-5"><div><h3 className="text-lg font-semibold text-foreground">Como a conversa deve avançar</h3><p className="mt-1 text-sm text-muted-foreground">Descreva o resultado esperado e o que a agente precisa entender sem virar um questionário.</p></div><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Resultado ideal<textarea value={answers.salesGoal} onChange={(event) => updateAnswer('salesGoal', event.target.value)} className={textareaClass} placeholder="Ex.: Entender a necessidade, confirmar se há perfil e agendar uma conversa de diagnóstico." /><NoteChips value={answerNotes.salesGoal} onChange={(note) => setAnswerNote('salesGoal', note)} /></label><label className="text-sm font-medium">Processo comercial atual<textarea value={answers.salesProcess} onChange={(event) => updateAnswer('salesProcess', event.target.value)} className={textareaClass} placeholder="Ex.: Primeiro entendemos o contexto; depois urgência e tentativas anteriores; por fim recomendamos o próximo passo." /><NoteChips value={answerNotes.salesProcess} onChange={(note) => setAnswerNote('salesProcess', note)} /></label><label className="text-sm font-medium">Tom e estilo<textarea value={answers.tone} onChange={(event) => updateAnswer('tone', event.target.value)} className={textareaClass} placeholder="Ex.: Didático, direto e acolhedor. Respostas curtas, sem excesso de emojis." /><NoteChips value={answerNotes.tone} onChange={(note) => setAnswerNote('tone', note)} /></label><label className="text-sm font-medium">Diferenciais aprovados<textarea value={answers.differentiators} onChange={(event) => updateAnswer('differentiators', event.target.value)} className={textareaClass} placeholder={'Ex.: implantação acompanhada\nexperiência prática com WhatsApp'} /></label><label className="text-sm font-medium">O que não deve prometer ou atender<textarea value={answers.restrictions} onChange={(event) => updateAnswer('restrictions', event.target.value)} className={textareaClass} placeholder={'Ex.: não prometer resultado financeiro\nnão orientar sobre ferramentas de terceiros sem base'} /></label><label className="text-sm font-medium">Fatos que você já sabe<textarea value={answers.knownFacts} onChange={(event) => updateAnswer('knownFacts', event.target.value)} className={textareaClass} placeholder={'Ex.: Reunião de diagnóstico: 45 minutos\nLink oficial: https://...\nAtendimento: seg–sex, 9h–18h'} /><p className="mt-1 text-xs text-muted-foreground">A IA separará preço, link, horário e políticas para confirmação individual.</p></label></div><label className="block text-sm font-medium">Lacunas ou decisões que dependem de outra pessoa<textarea value={answers.unknownNotes} onChange={(event) => updateAnswer('unknownNotes', event.target.value)} className={textareaClass} placeholder="Ex.: A política de desconto precisa ser confirmada com o comercial." /></label></div>}

          {step === 'sources' && <div className="space-y-5"><div><h3 className="text-lg font-semibold text-foreground">Acelere com sites e materiais <Badge variant="muted">Opcional</Badge></h3><p className="mt-1 text-sm text-muted-foreground">A configuração funciona sem arquivos. Use materiais apenas para reduzir digitação; toda extração continuará pendente até sua revisão.</p></div><div className="rounded-2xl border border-border p-4"><div className="flex items-start gap-3"><Globe2 className="mt-0.5 h-5 w-5 text-primary" /><div className="flex-1"><Label htmlFor="setup-urls">Páginas que a IA pode ler</Label><textarea id="setup-urls" value={siteUrlsText} onChange={(event) => setSiteUrlsText(event.target.value)} className={cn(textareaClass, 'min-h-28')} placeholder={'https://suaempresa.com.br\nhttps://suaempresa.com.br/servicos'} /><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">O site do primeiro passo já aparece aqui. Uma URL por linha, até 6 — sem varredura do site inteiro.</p><Button variant="secondary" size="sm" disabled={readingUrls || generating || siteUrls.length === 0} onClick={() => void readUrlsNow()}>{readingUrls ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}{readingUrls ? 'Lendo…' : 'Testar leitura'}</Button></div>{currentUrlSources && currentUrlSources.length > 0 && <div className="mt-3 space-y-1.5">{currentUrlSources.map((source) => <div key={source.id} className="flex items-center gap-2 text-xs">{source.content ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}<span className="min-w-0 truncate text-foreground">{source.sourceLabel}</span><span className="shrink-0 text-muted-foreground">{source.content ? `${source.charactersRead.toLocaleString('pt-BR')} caracteres` : source.warnings[0] || 'sem texto legível'}</span></div>)}</div>}</div></div></div><div className="rounded-2xl border border-border p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="flex items-start gap-3"><Upload className="mt-0.5 h-5 w-5 text-primary" /><div><p className="text-sm font-semibold text-foreground">Arquivos da empresa</p><p className="mt-1 text-xs text-muted-foreground">PDF com texto, DOCX, TXT, CSV ou XLSX. Até 8 MB por arquivo e 24 MB por envio.</p></div></div><input ref={inputRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.json,.csv,.xlsx" className="hidden" onChange={(event) => void handleFiles(Array.from(event.target.files || []))} /><Button variant="secondary" size="sm" disabled={extracting} onClick={() => inputRef.current?.click()}>{extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{extracting ? 'Lendo…' : 'Adicionar arquivos'}</Button></div><div className="mt-4 space-y-2">{materials.length === 0 ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum arquivo — você pode continuar assim.</div> : materials.map((material) => <div key={material.id} className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3"><FileText className="mt-0.5 h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{material.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{readableSize(material.sizeBytes)} · {material.charactersRead.toLocaleString('pt-BR')} caracteres lidos</p>{material.warnings.map((warning) => <p key={warning} className="mt-1 text-xs text-muted-foreground">{warning}</p>)}</div><Button variant="ghost" size="sm" onClick={() => setMaterials((current) => current.filter((item) => item.id !== material.id))}><Trash2 className="h-4 w-4" /></Button></div>)}</div></div><div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground"><strong className="text-foreground">Antes de enviar:</strong> prefira versões atuais, remova dados pessoais desnecessários e não use conversas exportadas sem organização. PDFs apenas com imagens serão marcados como ilegíveis.</div></div>}

          {step === 'review' && <div className="space-y-5">{generating && <div className="mx-auto flex min-h-72 w-full max-w-xl flex-col items-center justify-center text-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /><h3 className="mt-4 font-semibold text-foreground">{generationStage === 'reading' ? `Lendo ${siteUrls.length} página(s)…` : 'Gerando a proposta…'}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{generationStage === 'reading' ? 'Buscando o texto das páginas que você indicou. A IA ainda não foi acionada.' : streamSections ? 'As seções aparecem conforme ficam prontas.' : 'Organizando suas respostas em campos estruturados e separando fatos que exigem confirmação.'}</p>
            {generationStage === 'generating' && streamSections && (
              <div className="mt-5 w-full rounded-2xl border border-border bg-muted/20 p-4 text-left">
                <div className="space-y-2">
                  {streamSections.map((section) => (
                    <p key={section.key} className="flex items-center gap-2 text-sm">
                      {section.state === 'done'
                        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                        : section.state === 'writing'
                          ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                          : <span className="inline-block h-4 w-4 shrink-0 rounded-full border border-border" />}
                      <span className={section.state === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>
                        {section.label}
                        {section.count !== null && section.state !== 'pending' && ` · ${section.count}`}
                      </span>
                    </p>
                  ))}
                </div>
                {previewIdentityLine && <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">{previewIdentityLine}</p>}
              </div>
            )}
            <Button variant="secondary" size="sm" className="mt-4" onClick={cancelGeneration}>Cancelar</Button></div>}
          {!generating && proposal && (backgroundSaving || resumedAfterApply) && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              {backgroundSaving ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              {backgroundSaving
                ? 'A aplicação anterior ainda está salvando o conhecimento em segundo plano. Pode revisar à vontade; aplicar de novo espera ela terminar.'
                : 'A aplicação anterior pode não ter terminado de salvar o conhecimento. Clique em “Aplicar ao rascunho” para garantir — nada será duplicado.'}
            </div>
          )}{!generating && proposal && <><div><h3 className="text-lg font-semibold text-foreground">Foi isso que entendemos</h3><p className="mt-1 text-sm text-muted-foreground">Escolha o que aplicar em cada bloco; use o lápis para ajustar antes. Fatos começam como pendência até você confirmar. Nada abaixo está publicado.</p></div><section className="rounded-2xl border border-border p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="font-semibold text-foreground">Identidade e negócio</p><p className="mt-1 text-sm text-muted-foreground">{proposal.identity.agentName} representa {proposal.identity.companyName || 'empresa não informada'} para {proposal.identity.primaryAudience || 'público pendente'}.</p></div><div className="flex flex-col items-start gap-2 sm:items-end"><DecisionPills options={sectionDecisionOptions} value={sectionDecisions.identity} onChange={(value) => setSectionDecisions((current) => ({ ...current, identity: value }))} /><EditToggle editing={sectionDecisions.identity === 'edit'} onToggle={() => setSectionDecisions((current) => ({ ...current, identity: current.identity === 'edit' ? 'confirm' : 'edit' }))} /></div></div>{sectionDecisions.identity === 'edit' && <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs font-medium">Empresa<Input value={proposal.identity.companyName} onChange={(event) => setProposal({ ...proposal, identity: { ...proposal.identity, companyName: event.target.value } })} className="mt-1" /></label><label className="text-xs font-medium">Agente<Input value={proposal.identity.agentName} onChange={(event) => setProposal({ ...proposal, identity: { ...proposal.identity, agentName: event.target.value } })} className="mt-1" /></label><label className="text-xs font-medium">O que vende<textarea value={proposal.identity.whatCompanySells} onChange={(event) => setProposal({ ...proposal, identity: { ...proposal.identity, whatCompanySells: event.target.value } })} className={cn(textareaClass, 'min-h-20')} /></label><label className="text-xs font-medium">Público<textarea value={proposal.identity.primaryAudience} onChange={(event) => setProposal({ ...proposal, identity: { ...proposal.identity, primaryAudience: event.target.value } })} className={cn(textareaClass, 'min-h-20')} /></label></div>}<div className="mt-3 flex flex-wrap gap-2">{proposal.identity.offerings.map((offering) => <Badge key={offering.name} variant="muted">{offering.name}</Badge>)}</div></section>

            <section className="rounded-2xl border border-border p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row">
                <div><p className="font-semibold text-foreground">Atendimento e vendas</p><p className="mt-1 text-sm text-muted-foreground">{proposal.salesProcess.stages.length} etapas e {proposal.salesProcess.qualificationFields.length} informações de qualificação propostas.</p></div>
                <div className="flex flex-col items-start gap-2 sm:items-end"><DecisionPills options={sectionDecisionOptions} value={sectionDecisions.sales} onChange={(value) => setSectionDecisions((current) => ({ ...current, sales: value }))} /><EditToggle editing={sectionDecisions.sales === 'edit'} onToggle={() => setSectionDecisions((current) => ({ ...current, sales: current.sales === 'edit' ? 'confirm' : 'edit' }))} /></div>
              </div>
              {sectionDecisions.sales === 'edit' ? (
                <div className="mt-4 space-y-4">
                  <label className="block text-xs font-medium">Modelo de atendimento
                    <select value={proposal.salesProcess.model} onChange={(event) => setProposal({ ...proposal, salesProcess: { ...proposal.salesProcess, model: event.target.value as AgentSetupProposal['salesProcess']['model'] } })} className={fieldClass}>
                      <option value="consultative">Venda consultiva</option><option value="qualification_and_scheduling">Qualificação e agendamento</option><option value="direct_sale">Venda direta</option><option value="triage_and_handoff">Triagem e encaminhamento</option><option value="custom">Personalizado</option>
                    </select>
                  </label>
                  <div><p className="text-xs font-medium">Etapas propostas</p><div className="mt-2 space-y-2">{proposal.salesProcess.stages.map((stage, index) => <div key={`${stage.name}-${index}`} className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto]"><Input value={stage.name} aria-label={`Nome da etapa ${index + 1}`} placeholder="Ex.: Descoberta" onChange={(event) => setProposal({ ...proposal, salesProcess: { ...proposal.salesProcess, stages: proposal.salesProcess.stages.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) } })} /><Input value={stage.objective} aria-label={`Objetivo da etapa ${index + 1}`} placeholder="Ex.: Entender a principal necessidade" onChange={(event) => setProposal({ ...proposal, salesProcess: { ...proposal.salesProcess, stages: proposal.salesProcess.stages.map((item, itemIndex) => itemIndex === index ? { ...item, objective: event.target.value } : item) } })} /><Button variant="ghost" size="sm" aria-label={`Remover etapa ${index + 1}`} onClick={() => setProposal({ ...proposal, salesProcess: { ...proposal.salesProcess, stages: proposal.salesProcess.stages.filter((_, itemIndex) => itemIndex !== index) } })}><Trash2 className="h-4 w-4" /></Button></div>)}</div><Button variant="secondary" size="sm" className="mt-2" onClick={() => setProposal({ ...proposal, salesProcess: { ...proposal.salesProcess, stages: [...proposal.salesProcess.stages, { name: '', objective: '', active: true }] } })}><Plus className="h-4 w-4" />Adicionar etapa</Button></div>
                  <div><p className="text-xs font-medium">Informações de qualificação</p><div className="mt-2 space-y-2">{proposal.salesProcess.qualificationFields.map((field, index) => <div key={`${field.name}-${index}`} className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto]"><Input value={field.name} aria-label={`Nome do campo ${index + 1}`} placeholder="Ex.: Dor principal" onChange={(event) => setProposal({ ...proposal, salesProcess: { ...proposal.salesProcess, qualificationFields: proposal.salesProcess.qualificationFields.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) } })} /><Input value={field.description} aria-label={`Descrição do campo ${index + 1}`} placeholder="Ex.: O problema que o lead quer resolver" onChange={(event) => setProposal({ ...proposal, salesProcess: { ...proposal.salesProcess, qualificationFields: proposal.salesProcess.qualificationFields.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) } })} /><Button variant="ghost" size="sm" aria-label={`Remover campo ${index + 1}`} onClick={() => setProposal({ ...proposal, salesProcess: { ...proposal.salesProcess, qualificationFields: proposal.salesProcess.qualificationFields.filter((_, itemIndex) => itemIndex !== index) } })}><Trash2 className="h-4 w-4" /></Button></div>)}</div><Button variant="secondary" size="sm" className="mt-2" onClick={() => setProposal({ ...proposal, salesProcess: { ...proposal.salesProcess, qualificationFields: [...proposal.salesProcess.qualificationFields, { name: '', description: '', dataType: 'text', priority: 'important', captureRule: '', crmSource: '', options: [] }] } })}><Plus className="h-4 w-4" />Adicionar informação</Button></div>
                </div>
              ) : <div className="mt-3 grid gap-2 md:grid-cols-2">{proposal.salesProcess.stages.map((stage, index) => <div key={`${stage.name}-${index}`} className="rounded-xl bg-muted/30 p-3"><p className="text-xs font-semibold text-foreground">{index + 1}. {stage.name}</p><p className="mt-1 text-xs text-muted-foreground">{stage.objective}</p></div>)}</div>}
            </section>

            <section className="rounded-2xl border border-border p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="font-semibold text-foreground">Comportamento avançado</p><p className="mt-1 text-sm text-muted-foreground">Instruções adicionais que não substituem as proteções fixas.</p></div><div className="flex flex-col items-start gap-2 sm:items-end"><DecisionPills options={sectionDecisionOptions} value={sectionDecisions.behavior} onChange={(value) => setSectionDecisions((current) => ({ ...current, behavior: value }))} /><EditToggle editing={sectionDecisions.behavior === 'edit'} onToggle={() => setSectionDecisions((current) => ({ ...current, behavior: current.behavior === 'edit' ? 'confirm' : 'edit' }))} /></div></div>{sectionDecisions.behavior === 'edit' ? <textarea value={proposal.customInstructions} onChange={(event) => setProposal({ ...proposal, customInstructions: event.target.value })} className={cn(textareaClass, 'mt-4 min-h-32')} /> : <p className="mt-3 whitespace-pre-wrap rounded-xl bg-muted/30 p-3 text-sm text-muted-foreground">{proposal.customInstructions || 'Nenhuma instrução adicional proposta.'}</p>}</section><section className="rounded-2xl border border-border p-4"><p className="font-semibold text-foreground">Informações encontradas</p><p className="mt-1 text-sm text-muted-foreground">Fatos ficam como pendência por padrão. Confirme individualmente apenas o que você verificou.</p><div className="mt-4 space-y-3">{proposal.suggestedFacts.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum fato crítico foi extraído.</p> : proposal.suggestedFacts.map((fact, factIndex) => <div key={fact.id} className="rounded-xl border border-border bg-muted/20 p-3"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><p className="text-sm font-semibold text-foreground">{fact.title}</p>{fact.critical && <Badge variant="muted">Exige confirmação</Badge>}</div>{factDecisions[fact.id!] === 'edit' ? <div className="mt-3 grid gap-2"><Input value={fact.title} aria-label="Título da informação" placeholder="Ex.: Horário de atendimento" onChange={(event) => setProposal({ ...proposal, suggestedFacts: proposal.suggestedFacts.map((item, index) => index === factIndex ? { ...item, title: event.target.value } : item) })} /><textarea value={fact.fact} aria-label="Conteúdo da informação" placeholder="Ex.: Segunda a sexta, das 9h às 18h" onChange={(event) => setProposal({ ...proposal, suggestedFacts: proposal.suggestedFacts.map((item, index) => index === factIndex ? { ...item, fact: event.target.value } : item) })} className={cn(textareaClass, 'min-h-20')} /><Input value={fact.source} aria-label="Fonte da informação" placeholder="Ex.: Apresentação comercial, página 8" onChange={(event) => setProposal({ ...proposal, suggestedFacts: proposal.suggestedFacts.map((item, index) => index === factIndex ? { ...item, source: event.target.value } : item) })} /></div> : <><p className="mt-1 text-sm text-foreground">{fact.fact}</p><p className="mt-1 text-xs text-muted-foreground">Origem: {fact.source || 'resposta fornecida'}{fact.evidence ? ` · “${fact.evidence.slice(0, 180)}”` : ''}</p></>}</div><div className="flex flex-col items-start gap-2 sm:items-end"><DecisionPills options={factDecisionOptions} value={factDecisions[fact.id!] || 'later'} onChange={(value) => setFactDecisions((current) => ({ ...current, [fact.id!]: value }))} /><EditToggle editing={factDecisions[fact.id!] === 'edit'} onToggle={() => setFactDecisions((current) => ({ ...current, [fact.id!]: current[fact.id!] === 'edit' ? 'confirm' : 'edit' }))} /></div></div></div>)}</div></section>{proposal.missingInformation.length > 0 && <section className="rounded-2xl border border-border bg-muted/30 p-4"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="font-semibold text-foreground">Ainda precisamos saber</p><p className="mt-1 text-xs text-muted-foreground">Responda aqui e a resposta entra na proposta. O que ficar em branco continua vazio no rascunho.</p><div className="mt-4 space-y-4">{proposal.missingInformation.map((item) => <PendingQuestion key={`${item.field}-${item.question}`} item={item} value={pendingAnswers[item.field] ?? ''} onChange={(value) => setPendingAnswers((current) => ({ ...current, [item.field]: value }))} onApply={() => applyPendingAnswer(item.field)} />)}</div></div></div></section>}{proposal.assumptions.length > 0 && <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4"><p className="font-semibold text-foreground">Conflitos ou suposições detectadas</p><p className="mt-1 text-xs text-muted-foreground">Nenhum item abaixo será escolhido silenciosamente. Resolva na configuração antes de publicar.</p><ul className="mt-3 space-y-1 text-sm text-foreground">{proposal.assumptions.map((item) => <li key={item}>• {item}</li>)}</ul></section>}{proposal.sources.length > 0 && <section className="rounded-2xl border border-border p-4"><p className="font-semibold text-foreground">Relatório dos materiais</p><div className="mt-3 space-y-2">{proposal.sources.map((source) => <div key={source.id} className="flex items-start gap-3 rounded-xl bg-muted/30 p-3"><FileText className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-sm font-medium text-foreground">{source.title}</p><p className="text-xs text-muted-foreground">{source.charactersRead.toLocaleString('pt-BR')} caracteres encontrados · será salvo como “Precisa de revisão”</p>{source.warnings.map((warning) => <p key={warning} className="mt-1 text-xs text-muted-foreground">{warning}</p>)}</div></div>)}</div></section>}
            {(applying || applyError) && (
              <section className={cn('rounded-2xl border p-4', applyError ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/30')}>
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2 text-foreground">
                    {draftApplied ? <CheckCircle2 className="h-4 w-4 text-success" /> : applyStage === 'draft' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <span className="inline-block h-4 w-4 rounded-full border border-border" />}
                    Configuração aplicada ao rascunho
                  </p>
                  <p className="text-xs text-muted-foreground">Fatos, materiais e pendências são salvos em segundo plano depois que esta janela fecha.</p>
                </div>
                {applyError && (
                  <div className="mt-3 border-t border-destructive/20 pt-3">
                    <p className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{applyError}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Pode clicar em “Tentar novamente” com segurança: o que já foi salvo não será duplicado.</p>
                  </div>
                )}
              </section>
            )}</>}</div>}
        </div>
  );

  const content = (
    <>
      {headerNode}
      {stepperNode}
      {bodyNode}
      {footerNode}
    </>
  );

  if (embedded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
        {content}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden p-0">
        {content}
      </DialogContent>
    </Dialog>
  );
}