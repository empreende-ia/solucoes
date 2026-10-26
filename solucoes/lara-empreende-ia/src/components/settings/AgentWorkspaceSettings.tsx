import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Compass,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Target,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import type { AgentConfig, AgentIdentity, AgentSalesProcess } from '@/domain/agent-config';
import { computeAgentReadiness, type AgentReadiness, type ReadinessItem } from '@/domain/agent-readiness';
import { useAgentDraft, type AgentConflictResolution, type AgentDraftSaveStatus } from '@/hooks/useAgentDraft';
import { getCurrentAgentContext } from '@/services/agent-config';
import { cn } from '@/lib/utils';
import { evalsApi, type EvalRun } from '@/services/evals';
import { knowledgeApi } from '@/services/knowledge';
import CompiledPromptInspector from './CompiledPromptInspector';
import KnowledgeWorkspaceSettings from './KnowledgeWorkspaceSettings';
import AgentActionsSettings from './AgentActionsSettings';
import AgentPublishSettings from './AgentPublishSettings';
import AgentSuggestionsPanel from './AgentSuggestionsPanel';
import AgentSetupAssistant from './AgentSetupAssistant';
import AgentObservabilityPanel from './AgentObservabilityPanel';

type AgentSection = 'overview' | 'identity' | 'sales' | 'knowledge' | 'actions' | 'publish' | 'advanced';

/** Resumo da base de conhecimento, buscado no pai para alimentar nav e Visão geral. */
interface KnowledgeSummary {
  confirmed: number;
  faqs: number;
  approvedDocuments: number;
  attention: number;
}

const sections: Array<{ id: AgentSection; label: string; icon: typeof Bot }> = [
  { id: 'overview', label: 'Visão geral', icon: Bot },
  { id: 'identity', label: 'Identidade e negócio', icon: Compass },
  { id: 'sales', label: 'Atendimento e vendas', icon: Target },
  { id: 'knowledge', label: 'Conhecimento', icon: BookOpen },
  { id: 'actions', label: 'Ações', icon: Wrench },
  { id: 'publish', label: 'Testar e publicar', icon: ClipboardCheck },
];

const goalOptions: Array<{ value: AgentIdentity['primaryGoals'][number]; label: string }> = [
  { value: 'qualify', label: 'Entender e qualificar leads' },
  { value: 'qualify_and_schedule', label: 'Qualificar e agendar' },
  { value: 'answer_and_recommend', label: 'Tirar dúvidas e recomendar' },
  { value: 'sell_directly', label: 'Vender diretamente' },
  { value: 'support_and_handoff', label: 'Atender e encaminhar' },
  { value: 'collect_information', label: 'Coletar informações' },
];

const outcomeOptions: Array<{ value: AgentSalesProcess['desiredOutcomes'][number]; label: string }> = [
  { value: 'schedule_meeting', label: 'Agendar reunião' },
  { value: 'handoff_to_consultant', label: 'Encaminhar para consultor' },
  { value: 'recommend_solution', label: 'Recomendar solução' },
  { value: 'send_purchase_link', label: 'Enviar link de compra' },
  { value: 'collect_information', label: 'Coletar informações' },
  { value: 'resolve_question', label: 'Resolver dúvida' },
  { value: 'identify_no_fit', label: 'Identificar ausência de perfil' },
];

const fieldClass = 'mt-1.5 w-full rounded-xl border border-input bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60';

function SaveIndicator({ status }: { status: AgentDraftSaveStatus }) {
  const content = {
    loading: [Loader2, 'Carregando', 'animate-spin'],
    saved: [Check, 'Salvo', ''],
    unsaved: [CircleDot, 'Alterações pendentes', ''],
    saving: [Loader2, 'Salvando', 'animate-spin'],
    conflict: [AlertCircle, 'Conflito de edição', ''],
    error: [AlertCircle, 'Falha ao salvar', ''],
  }[status] as [typeof Check, string, string];
  const [Icon, label, className] = content;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', status === 'error' || status === 'conflict' ? 'text-destructive' : 'text-muted-foreground')}>
      <Icon className={cn('h-3.5 w-3.5', className)} />
      {label}
    </span>
  );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-foreground">
      {label}
      {hint && <span className="ml-1 font-normal text-muted-foreground">{hint}</span>}
      {children}
    </label>
  );
}

function ChoicePills<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ value: T; label: string }>;
  value: T[];
  onChange: (value: T[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(selected ? value.filter((item) => item !== option.value) : [...value, option.value])}
            className={cn(
              'rounded-full border px-3 py-2 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
              selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-ring hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ListEditor({
  values,
  onChange,
  placeholder,
  disabled,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const next = draft.trim();
    if (!next || values.includes(next)) return;
    onChange([...values, next]);
    setDraft('');
  };

  return (
    <div className="mt-2 space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <span key={value} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground">
              {value}
              {!disabled && (
                <button type="button" onClick={() => onChange(values.filter((item) => item !== value))} aria-label={`Remover ${value}`} className="text-muted-foreground hover:text-destructive">×</button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            className={cn(fieldClass, 'mt-0')}
          />
          <Button type="button" variant="secondary" size="sm" onClick={add} disabled={!draft.trim()}>
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Saída explícita do conflito de edição. As teclas continuam valendo localmente;
 * nada é salvo até a pessoa escolher entre manter o que está na tela ou adotar o
 * que a outra sessão gravou — os dois caminhos ficam visíveis, nenhum é silencioso.
 */
function ConflictBanner({ localConfig, resolve }: {
  localConfig: AgentConfig;
  resolve: (resolution: AgentConflictResolution) => Promise<void>;
}) {
  const [serverInfo, setServerInfo] = useState<{ updatedAt: string; areas: string[] } | null>(null);
  const [resolving, setResolving] = useState<AgentConflictResolution | null>(null);
  const localConfigRef = useRef(localConfig);
  localConfigRef.current = localConfig;

  // Uma consulta só, na montagem: o banner aparece junto com o conflito e a pessoa
  // pode continuar digitando sem que cada tecla dispare uma ida ao servidor.
  useEffect(() => {
    let active = true;
    void getCurrentAgentContext().then((latest) => {
      if (!active || !latest) return;
      const mine = localConfigRef.current;
      const candidates: Array<[string, unknown, unknown]> = [
        ['Identidade e negócio', mine.identity, latest.draftConfig.identity],
        ['Atendimento e vendas', mine.salesProcess, latest.draftConfig.salesProcess],
        ['Política de conhecimento', mine.knowledgePolicy, latest.draftConfig.knowledgePolicy],
        ['Ações', mine.actions, latest.draftConfig.actions],
        ['Instruções personalizadas', mine.customInstructions, latest.draftConfig.customInstructions],
      ];
      setServerInfo({
        updatedAt: latest.draftUpdatedAt,
        areas: candidates
          .filter(([, ours, theirs]) => JSON.stringify(ours) !== JSON.stringify(theirs))
          .map(([name]) => name),
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const act = async (resolution: AgentConflictResolution) => {
    if (resolution === 'takeServer' && !window.confirm('Descartar as suas alterações locais e usar a versão salva na outra sessão?')) return;
    setResolving(resolution);
    try {
      await resolve(resolution);
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start gap-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">O rascunho foi alterado em outra sessão.</p>
          <p className="mt-1 text-destructive/80">
            Você pode continuar editando; nada será salvo até escolher um caminho abaixo.
            {serverInfo?.updatedAt && <> Última alteração externa: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(serverInfo.updatedAt))}.</>}
          </p>
          {serverInfo && serverInfo.areas.length > 0 && (
            <p className="mt-1 text-xs text-destructive/70">Áreas divergentes: {serverInfo.areas.join(', ')}.</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={resolving !== null} onClick={() => void act('keepMine')}>
          {resolving === 'keepMine' && <Loader2 className="h-4 w-4 animate-spin" />}
          Manter minhas alterações
        </Button>
        <Button variant="outline" size="sm" disabled={resolving !== null} onClick={() => void act('takeServer')}>
          {resolving === 'takeServer' && <Loader2 className="h-4 w-4 animate-spin" />}
          Usar a versão da outra sessão
        </Button>
      </div>
    </div>
  );
}

function SectionCard({ icon: Icon, title, description, action, state = 'pending' }: {
  icon: typeof Bot;
  title: string;
  description: string;
  action: () => void;
  /**
   * 'ready' = feito; 'pending' = vale continuar; 'optional' = seção que nunca
   * fica "devendo" — sem ele, Prompt e comportamento mostrava um "Continuar"
   * perpétuo para um campo explicitamente opcional.
   */
  state?: 'ready' | 'pending' | 'optional';
}) {
  return (
    <button type="button" onClick={action} className="eia-card group flex min-h-52 flex-col p-5 text-left transition hover:-translate-y-0.5 hover:border-ring/50">
      <div className="flex items-start justify-between gap-4">
        <span className="rounded-xl border border-border bg-secondary p-2.5"><Icon className="h-5 w-5 text-primary" /></span>
        {state === 'ready' ? <Badge variant="success">Pronto</Badge> : state === 'optional' ? <Badge variant="outline">Opcional</Badge> : <Badge variant="muted">Continuar</Badge>}
      </div>
      <h3 className="mt-5 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        Abrir seção <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function Overview({ config, setSection, editable, updateConfig, onStartSetup, readiness, knowledgeSummary, latestEvaluation }: {
  config: AgentConfig;
  setSection: (section: AgentSection) => void;
  editable: boolean;
  updateConfig: (updater: (current: AgentConfig) => AgentConfig) => void;
  onStartSetup: () => void;
  readiness: AgentReadiness;
  knowledgeSummary: KnowledgeSummary | null;
  latestEvaluation: EvalRun | null;
}) {
  const identityReady = readiness.identityReady;
  const importedNeedsReview = Boolean(config.migration?.legacyPrompt && !config.migration?.structuredReady);
  // Duas listas com pesos diferentes: o que trava a publicação e o que apenas
  // melhora a agente. Antes tudo era uma pilha só, e configuração parcial
  // parecia proibida quando na verdade já publica e já atende.
  const required = readiness.required;
  const recommended: ReadinessItem[] = [
    ...(knowledgeSummary?.attention
      ? [{ label: `${knowledgeSummary.attention} item(ns) de conhecimento precisam de revisão.`, section: 'knowledge' as const }]
      : []),
    ...readiness.recommended,
  ];

  return (
    <div className="space-y-6">
      {!identityReady && (
        <div className="eia-card overflow-hidden border-primary/25">
          <div className="grid gap-6 bg-gradient-to-br from-primary/[0.08] eia-card to-card p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <Badge variant="muted"><Compass className="mr-1 h-3 w-3" />Recomendado</Badge>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">Vamos preparar sua agente?</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Responda algumas perguntas para começar. Se quiser, adicione páginas e materiais para acelerar o preenchimento. Você sempre revisará as informações antes de utilizá-las.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="primary" onClick={onStartSetup} disabled={!editable}><Compass className="h-4 w-4" />Configurar com IA</Button>
                <Button variant="secondary" onClick={() => setSection('identity')}>Prefiro configurar manualmente</Button>
              </div>
            </div>
            <div className="hidden min-w-56 rounded-2xl border border-border bg-card/80 p-4 lg:block"><p className="text-xs font-semibold text-foreground">Você pode combinar</p><ul className="mt-3 space-y-2 text-xs text-muted-foreground"><li>· Perguntas guiadas</li><li>· Site ou páginas específicas</li><li>· PDF, DOCX, TXT, CSV e XLSX</li><li>· Modelo editável do segmento</li></ul></div>
          </div>
        </div>
      )}
      {importedNeedsReview && (
        <div id="migration-review" className="eia-card border-primary/25 bg-primary/[0.04] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-start gap-3">
              <BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold text-foreground">Revise a configuração importada</h3>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Transformamos o prompt antigo em campos claros. Confira os dados antes de permitir uma nova publicação.</p>
              </div>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!editable || !identityReady}
              onClick={() => updateConfig((current) => ({
                ...current,
                migration: { ...current.migration, structuredReady: true },
              }))}
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirmar dados estruturados
            </Button>
          </div>
          {!identityReady && <p className="mt-3 text-xs text-muted-foreground">Complete primeiro os campos obrigatórios de Identidade e negócio.</p>}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SectionCard icon={Compass} title="Identidade e negócio" state={identityReady ? 'ready' : 'pending'} description={`${config.identity.agentName || 'Sua agente'} representa ${config.identity.companyName || 'sua empresa'} para ${config.identity.primaryAudience || 'um público ainda não definido'}.`} action={() => setSection('identity')} />
        <SectionCard icon={Target} title="Atendimento e vendas" state={readiness.salesConfigured ? 'ready' : 'pending'} description={`${config.salesProcess.qualificationFields.length} informações de qualificação e ${config.salesProcess.desiredOutcomes.length} resultados desejados configurados.`} action={() => setSection('sales')} />
        <SectionCard icon={BookOpen} title="Conhecimento" state={knowledgeSummary && knowledgeSummary.attention === 0 && (knowledgeSummary.confirmed + knowledgeSummary.faqs + knowledgeSummary.approvedDocuments > 0) ? 'ready' : 'pending'} description={knowledgeSummary ? `${knowledgeSummary.confirmed} informações confirmadas, ${knowledgeSummary.faqs} FAQs, ${knowledgeSummary.approvedDocuments} materiais e ${knowledgeSummary.attention} pendências.` : 'Informações confirmadas, perguntas frequentes, documentos e pendências da agente.'} action={() => setSection('knowledge')} />
        <SectionCard icon={Wrench} title="Ações" state={readiness.recommended.some((item) => item.section === 'actions') ? 'pending' : config.actions.some((action) => action.enabled) ? 'ready' : 'optional'} description={readiness.schedulingWithoutAction ? 'Os objetivos pedem agendamento, mas a ação está desligada — ative aqui ou ajuste os objetivos.' : 'Defina o que a agente pode fazer e quais confirmações são necessárias.'} action={() => setSection('actions')} />
        <SectionCard icon={ClipboardCheck} title="Avaliação" state={latestEvaluation?.gate_status === 'passed' ? 'ready' : 'pending'} description={latestEvaluation ? `${latestEvaluation.passed} aprovados, ${latestEvaluation.warnings} alertas, ${latestEvaluation.critical_failures} erros críticos e ${latestEvaluation.unstable} instáveis na última execução.` : 'Converse com o rascunho, execute cenários e publique com segurança.'} action={() => setSection('publish')} />
        <SectionCard icon={Settings2} title="Prompt e comportamento" state={readiness.required.some((item) => item.section === 'advanced') ? 'pending' : 'optional'} description={readiness.required.some((item) => item.section === 'advanced') ? 'Uma instrução personalizada perigosa está bloqueando a publicação — revise o campo.' : 'Edite instruções personalizadas e veja, em tempo real, o prompt completo compilado a partir da configuração.'} action={() => setSection('advanced')} />
      </div>

      <div className="eia-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eia-eyebrow">Pendências</p>
            <h3 className="mt-1 text-base font-semibold text-foreground">O que falta e o que pode melhorar</h3>
          </div>
          <Badge variant={required.length ? 'muted' : 'success'}>{required.length ? `${required.length} para publicar` : 'Pronta para publicar'}</Badge>
        </div>
        {required.length ? (
          <div className="mt-4 divide-y divide-border rounded-xl border border-border">
            {required.map((item) => (
              <button key={item.label} type="button" onClick={() => {
                // A pendência de migração mora nesta própria tela: navegar para
                // "overview" seria um clique sem efeito. Rola até o cartão.
                if (item.section === 'overview') {
                  document.getElementById('migration-review')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  return;
                }
                setSection(item.section);
              }} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted/50">
                <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-muted-foreground" />{item.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">Nada obrigatório pendente. Uma configuração parcial já atende — teste e publique quando quiser; o que está abaixo é lapidação.</p>
        )}
        {recommended.length > 0 && (
          <>
            <p className="mt-5 text-xs font-medium text-muted-foreground">Opcional, recomendado — a agente funciona sem isso e melhora com isso</p>
            <div className="mt-2 divide-y divide-border rounded-xl border border-border">
              {recommended.map((item) => (
                <button key={item.label} type="button" onClick={() => setSection(item.section)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground">
                  <span className="flex items-center gap-2"><Plus className="h-4 w-4 shrink-0" />{item.label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <AgentSuggestionsPanel editable={editable} updateConfig={updateConfig} openKnowledge={() => setSection('knowledge')} />
    </div>
  );
}

function IdentityEditor({ config, updateConfig, editable }: {
  config: AgentConfig;
  updateConfig: (updater: (current: AgentConfig) => AgentConfig) => void;
  editable: boolean;
}) {
  const updateIdentity = (patch: Partial<AgentIdentity>) => updateConfig((current) => ({
    ...current,
    identity: { ...current.identity, ...patch },
  }));
  const identity = config.identity;

  return (
    <div className="space-y-6">
      <div className="eia-card p-6">
        <p className="eia-eyebrow">Essencial</p>
        <h2 className="mt-1 text-xl font-semibold text-foreground">Quem a agente representa</h2>
        <p className="mt-1 text-sm text-muted-foreground">Esses dados definem como ela se apresenta e quais resultados deve buscar.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <FormField label="Nome da agente"><input disabled={!editable} value={identity.agentName} onChange={(e) => updateIdentity({ agentName: e.target.value })} className={fieldClass} placeholder="Ex.: Lara" /></FormField>
          <FormField label="Função"><input disabled={!editable} value={identity.role} onChange={(e) => updateIdentity({ role: e.target.value })} className={fieldClass} placeholder="Ex.: Assistente de vendas" /></FormField>
          <FormField label="Nome da empresa"><input disabled={!editable} value={identity.companyName} onChange={(e) => updateIdentity({ companyName: e.target.value })} className={fieldClass} placeholder="Sua empresa" /></FormField>
          <FormField label="Site" hint="(opcional)"><input disabled={!editable} value={identity.website} onChange={(e) => updateIdentity({ website: e.target.value })} className={fieldClass} placeholder="https://" /></FormField>
          <FormField label="O que a empresa vende"><textarea disabled={!editable} value={identity.whatCompanySells} onChange={(e) => updateIdentity({ whatCompanySells: e.target.value })} className={cn(fieldClass, 'min-h-28 resize-y')} placeholder="Explique produtos e serviços em linguagem simples." /></FormField>
          <FormField label="Público principal"><textarea disabled={!editable} value={identity.primaryAudience} onChange={(e) => updateIdentity({ primaryAudience: e.target.value })} className={cn(fieldClass, 'min-h-28 resize-y')} placeholder="Quem mais se beneficia do que você oferece?" /></FormField>
        </div>
        <div className="mt-5">
          <span className="text-sm font-medium text-foreground">Objetivos principais</span>
          <ChoicePills options={goalOptions} value={identity.primaryGoals} onChange={(primaryGoals) => updateIdentity({ primaryGoals })} disabled={!editable} />
        </div>
      </div>

      <div className="eia-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Contexto do negócio</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <FormField label="Descrição da empresa"><textarea disabled={!editable} value={identity.companyDescription} onChange={(e) => updateIdentity({ companyDescription: e.target.value })} className={cn(fieldClass, 'min-h-28 resize-y')} placeholder="Ex.: Consultoria que ajuda pequenas empresas a implantar atendimento e vendas com IA." /></FormField>
          <FormField label="Como a agente deve se apresentar"><textarea disabled={!editable} value={identity.introduction} onChange={(e) => updateIdentity({ introduction: e.target.value })} className={cn(fieldClass, 'min-h-28 resize-y')} placeholder="Ex.: Oi, sou a Lara, assistente do time do Empreende.IA. Posso entender seu momento e indicar o melhor próximo passo?" /></FormField>
          <FormField label="Segmento"><input disabled={!editable} value={identity.segment} onChange={(e) => updateIdentity({ segment: e.target.value })} className={fieldClass} placeholder="Ex.: Educação e consultoria em IA para empresas" /></FormField>
          <FormField label="Modelo de atendimento">
            <select disabled={!editable} value={identity.serviceMode} onChange={(e) => updateIdentity({ serviceMode: e.target.value as AgentIdentity['serviceMode'] })} className={fieldClass}>
              <option value="remote">Remoto</option><option value="in_person">Presencial</option><option value="hybrid">Híbrido</option><option value="not_applicable">Não se aplica</option>
            </select>
          </FormField>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <FormField label="Regiões atendidas"><ListEditor values={identity.serviceRegions} onChange={(serviceRegions) => updateIdentity({ serviceRegions })} placeholder="Ex.: Brasil" disabled={!editable} /></FormField>
          <FormField label="Diferenciais aprovados"><ListEditor values={identity.differentiators} onChange={(differentiators) => updateIdentity({ differentiators })} placeholder="Ex.: acompanhamento próximo" disabled={!editable} /></FormField>
          <FormField label="Perfis ou assuntos que não atende"><ListEditor values={identity.excludedProfiles} onChange={(excludedProfiles) => updateIdentity({ excludedProfiles })} placeholder="Ex.: suporte técnico de terceiros" disabled={!editable} /></FormField>
        </div>
      </div>

      <div className="eia-card p-6">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-foreground">Provas sociais aprovadas</h2><p className="mt-1 text-sm text-muted-foreground">Resultados, marcas atendidas e números só entram no comportamento quando uma pessoa aprova e registra a fonte.</p></div>{editable && <Button variant="secondary" size="sm" onClick={() => updateIdentity({ socialProof: [...identity.socialProof, { id: crypto.randomUUID(), claim: 'Nova prova social', source: '', approved: false }] })}><Plus className="h-4 w-4" />Adicionar prova</Button>}</div>
        <div className="mt-5 space-y-3">{identity.socialProof.length === 0 ? <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Ex.: “Mais de 200 empresas treinadas” — adicione somente com uma fonte verificável.</p> : identity.socialProof.map((proof) => <div key={proof.id} className="rounded-xl border border-border bg-muted/20 p-4"><div className="grid gap-3 md:grid-cols-[2fr_1.4fr_auto]"><input disabled={!editable} value={proof.claim} onChange={(event) => updateIdentity({ socialProof: identity.socialProof.map((item) => item.id === proof.id ? { ...item, claim: event.target.value } : item) })} className={cn(fieldClass, 'mt-0')} placeholder="Ex.: 4,9/5 de avaliação média" /><input disabled={!editable} value={proof.source} onChange={(event) => updateIdentity({ socialProof: identity.socialProof.map((item) => item.id === proof.id ? { ...item, source: event.target.value } : item) })} className={cn(fieldClass, 'mt-0')} placeholder="Fonte ou link de confirmação" /><div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={!editable || !proof.source.trim()} checked={proof.approved} onChange={(event) => updateIdentity({ socialProof: identity.socialProof.map((item) => item.id === proof.id ? { ...item, approved: event.target.checked } : item) })} />Aprovada</label>{editable && <Button variant="ghost" size="sm" onClick={() => updateIdentity({ socialProof: identity.socialProof.filter((item) => item.id !== proof.id) })}><Trash2 className="h-4 w-4" /></Button>}</div></div>{!proof.source.trim() && <p className="mt-2 text-xs text-muted-foreground">Adicione a fonte antes de aprovar esta afirmação.</p>}</div>)}</div>
      </div>

      <div className="eia-card p-6">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-foreground">Ofertas</h2><p className="mt-1 text-sm text-muted-foreground">O que a agente pode recomendar de forma contextual.</p></div>{editable && <Button variant="secondary" size="sm" onClick={() => updateIdentity({ offerings: [...identity.offerings, { id: crypto.randomUUID(), name: 'Nova oferta', summary: '', audience: '', problemSolved: '', relatedLink: '', active: true }] })}><Plus className="h-4 w-4" />Adicionar oferta</Button>}</div>
        <div className="mt-5 space-y-3">
          {identity.offerings.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Nenhuma oferta cadastrada ainda.</p>}
          {identity.offerings.map((offering, index) => (
            <div key={offering.id} className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3"><span className="text-sm font-semibold text-foreground">Oferta {index + 1}</span>{editable && <Button variant="ghost" size="sm" onClick={() => updateIdentity({ offerings: identity.offerings.filter((item) => item.id !== offering.id) })}><Trash2 className="h-4 w-4" />Remover</Button>}</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <FormField label="Nome"><input disabled={!editable} value={offering.name} onChange={(e) => updateIdentity({ offerings: identity.offerings.map((item) => item.id === offering.id ? { ...item, name: e.target.value } : item) })} className={fieldClass} placeholder="Ex.: Mentoria de implementação" /></FormField>
                <FormField label="Público"><input disabled={!editable} value={offering.audience} onChange={(e) => updateIdentity({ offerings: identity.offerings.map((item) => item.id === offering.id ? { ...item, audience: e.target.value } : item) })} className={fieldClass} placeholder="Ex.: Donos de empresas com time comercial" /></FormField>
                <FormField label="Explicação curta"><textarea disabled={!editable} value={offering.summary} onChange={(e) => updateIdentity({ offerings: identity.offerings.map((item) => item.id === offering.id ? { ...item, summary: e.target.value } : item) })} className={cn(fieldClass, 'min-h-24')} placeholder="Ex.: Programa acompanhado para colocar o primeiro agente em operação." /></FormField>
                <FormField label="Problema que resolve"><textarea disabled={!editable} value={offering.problemSolved} onChange={(e) => updateIdentity({ offerings: identity.offerings.map((item) => item.id === offering.id ? { ...item, problemSolved: e.target.value } : item) })} className={cn(fieldClass, 'min-h-24')} placeholder="Ex.: Falta de processo e segurança para implantar IA no atendimento." /></FormField>
                <FormField label="Link relacionado" hint="(opcional)"><input disabled={!editable} value={offering.relatedLink} onChange={(e) => updateIdentity({ offerings: identity.offerings.map((item) => item.id === offering.id ? { ...item, relatedLink: e.target.value } : item) })} className={fieldClass} placeholder="https://suaempresa.com.br/oferta" /></FormField>
                <label className="flex items-center justify-between self-end rounded-xl border border-border bg-card px-3 py-2.5 text-sm"><span>Disponível para recomendação</span><input type="checkbox" disabled={!editable} checked={offering.active} onChange={(e) => updateIdentity({ offerings: identity.offerings.map((item) => item.id === offering.id ? { ...item, active: e.target.checked } : item) })} /></label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SalesEditor({ config, updateConfig, editable }: {
  config: AgentConfig;
  updateConfig: (updater: (current: AgentConfig) => AgentConfig) => void;
  editable: boolean;
}) {
  const sales = config.salesProcess;
  const updateSales = (patch: Partial<AgentSalesProcess>) => updateConfig((current) => ({ ...current, salesProcess: { ...current.salesProcess, ...patch } }));
  const updateQualificationField = (id: string, patch: Partial<AgentSalesProcess['qualificationFields'][number]>) => updateSales({ qualificationFields: sales.qualificationFields.map((item) => item.id === id ? { ...item, ...patch } : item) });

  return (
    <div className="space-y-6">
      <div className="eia-card p-6">
        <p className="eia-eyebrow">Estratégia</p><h2 className="mt-1 text-xl font-semibold text-foreground">Como a conversa deve avançar</h2><p className="mt-1 text-sm text-muted-foreground">Defina o modelo comercial e o que conta como um bom próximo passo.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <FormField label="Modelo comercial"><select disabled={!editable} value={sales.model} onChange={(e) => updateSales({ model: e.target.value as AgentSalesProcess['model'] })} className={fieldClass}><option value="consultative">Venda consultiva</option><option value="qualification_and_scheduling">Qualificação e agendamento</option><option value="direct_sale">Venda direta</option><option value="triage_and_handoff">Triagem e encaminhamento</option><option value="custom">Processo personalizado</option></select></FormField>
        </div>
        <div className="mt-5"><span className="text-sm font-medium text-foreground">Resultados desejados</span><ChoicePills options={outcomeOptions} value={sales.desiredOutcomes} onChange={(desiredOutcomes) => updateSales({ desiredOutcomes })} disabled={!editable} /></div>
      </div>

      <div className="eia-card p-6">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-foreground">Etapas flexíveis</h2><p className="mt-1 text-sm text-muted-foreground">Servem como orientação; a agente não repetirá perguntas já respondidas.</p></div>{editable && <Button variant="secondary" size="sm" onClick={() => updateSales({ stages: [...sales.stages, { id: crypto.randomUUID(), name: 'Nova etapa', objective: '', order: sales.stages.length, active: true }] })}><Plus className="h-4 w-4" />Adicionar etapa</Button>}</div>
        <div className="mt-4 space-y-3">{sales.stages.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Adicione as etapas que ajudam a orientar o atendimento.</p>}{sales.stages.map((stage, index) => <div key={stage.id} className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 md:grid-cols-[auto_1fr_2fr_auto]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span><input disabled={!editable} value={stage.name} onChange={(e) => updateSales({ stages: sales.stages.map((item) => item.id === stage.id ? { ...item, name: e.target.value } : item) })} className={cn(fieldClass, 'mt-0')} /><input disabled={!editable} value={stage.objective} onChange={(e) => updateSales({ stages: sales.stages.map((item) => item.id === stage.id ? { ...item, objective: e.target.value } : item) })} className={cn(fieldClass, 'mt-0')} placeholder="Objetivo desta etapa" />{editable && <Button variant="ghost" size="sm" onClick={() => updateSales({ stages: sales.stages.filter((item) => item.id !== stage.id) })}><Trash2 className="h-4 w-4" /></Button>}</div>)}</div>
      </div>

      <div className="eia-card p-6">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-foreground">Informações de qualificação</h2><p className="mt-1 text-sm text-muted-foreground">A agente coleta essas informações naturalmente, sem transformar a conversa em formulário.</p></div>{editable && <Button variant="secondary" size="sm" onClick={() => updateSales({ qualificationFields: [...sales.qualificationFields, { id: crypto.randomUUID(), name: 'Nova informação', description: '', dataType: 'text', priority: 'important', captureRule: '', crmSource: '', options: [] }] })}><Plus className="h-4 w-4" />Adicionar informação</Button>}</div>
        <div className="mt-4 space-y-3">{sales.qualificationFields.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Exemplos: dor principal, urgência, papel do lead, resultado desejado e disposição para investir.</p>}{sales.qualificationFields.map((field) => <div key={field.id} className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-foreground">{field.name || 'Nova informação'}</p>{editable && <Button variant="ghost" size="sm" onClick={() => updateSales({ qualificationFields: sales.qualificationFields.filter((item) => item.id !== field.id) })}><Trash2 className="h-4 w-4" />Remover</Button>}</div><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><FormField label="Nome"><input disabled={!editable} value={field.name} onChange={(event) => updateQualificationField(field.id, { name: event.target.value })} className={fieldClass} placeholder="Ex.: Dor principal" /></FormField><FormField label="Descrição"><input disabled={!editable} value={field.description} onChange={(event) => updateQualificationField(field.id, { description: event.target.value })} className={fieldClass} placeholder="Ex.: O problema que mais afeta o resultado hoje" /></FormField><FormField label="Prioridade"><select disabled={!editable} value={field.priority} onChange={(event) => updateQualificationField(field.id, { priority: event.target.value as typeof field.priority })} className={fieldClass}><option value="required">Obrigatório antes do próximo passo</option><option value="important">Importante</option><option value="contextual">Contextual</option></select></FormField><FormField label="Tipo de dado"><select disabled={!editable} value={field.dataType} onChange={(event) => updateQualificationField(field.id, { dataType: event.target.value as typeof field.dataType })} className={fieldClass}><option value="text">Texto</option><option value="number">Número</option><option value="boolean">Sim ou não</option><option value="date">Data</option><option value="single_choice">Uma opção</option><option value="multiple_choice">Várias opções</option></select></FormField><FormField label="Regra de captura"><input disabled={!editable} value={field.captureRule} onChange={(event) => updateQualificationField(field.id, { captureRule: event.target.value })} className={fieldClass} placeholder="Ex.: Pergunte apenas se não apareceu naturalmente" /></FormField><FormField label="Origem no CRM" hint="(opcional)"><input disabled={!editable} value={field.crmSource} onChange={(event) => updateQualificationField(field.id, { crmSource: event.target.value })} className={fieldClass} placeholder="Ex.: contact.custom_fields.urgencia" /></FormField></div>{['single_choice', 'multiple_choice'].includes(field.dataType) && <div className="mt-3"><FormField label="Opções permitidas"><ListEditor values={field.options} onChange={(options) => updateQualificationField(field.id, { options })} placeholder="Ex.: Imediata" disabled={!editable} /></FormField></div>}<p className="mt-3 text-xs text-muted-foreground">No atendimento, este campo pode estar desconhecido, inferido ou confirmado. A agente não deve tratar inferência como confirmação.</p></div>)}</div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="eia-card p-6"><h2 className="text-lg font-semibold text-foreground">Qualificação</h2><div className="mt-5 space-y-5"><FormField label="Sinais positivos"><ListEditor values={sales.positiveCriteria} onChange={(positiveCriteria) => updateSales({ positiveCriteria })} placeholder="Ex.: tem uma dor clara" disabled={!editable} /></FormField><FormField label="Sinais de desqualificação"><ListEditor values={sales.negativeCriteria} onChange={(negativeCriteria) => updateSales({ negativeCriteria })} placeholder="Ex.: busca algo fora do escopo" disabled={!editable} /></FormField></div></div>
        <div className="eia-card p-6"><h2 className="text-lg font-semibold text-foreground">Comunicação</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><FormField label="Formalidade"><select disabled={!editable} value={sales.communication.formality} onChange={(e) => updateSales({ communication: { ...sales.communication, formality: e.target.value as typeof sales.communication.formality } })} className={fieldClass}><option value="informal">Informal</option><option value="balanced">Equilibrada</option><option value="formal">Formal</option></select></FormField><FormField label="Emojis"><select disabled={!editable} value={sales.communication.emojiUsage} onChange={(e) => updateSales({ communication: { ...sales.communication, emojiUsage: e.target.value as typeof sales.communication.emojiUsage } })} className={fieldClass}><option value="none">Não usar</option><option value="light">Uso leve</option><option value="moderate">Uso moderado</option></select></FormField><FormField label="Tamanho ideal" hint="em caracteres"><input type="number" min={1} disabled={!editable} value={sales.communication.idealMessageLength} onChange={(e) => updateSales({ communication: { ...sales.communication, idealMessageLength: Number(e.target.value) || 1 } })} className={fieldClass} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Alvo que a agente busca em cada mensagem. Cerca de {Math.max(1, Math.round(sales.communication.idealMessageLength / 6))} palavras.</span></FormField><FormField label="Tamanho máximo" hint="em caracteres"><input type="number" min={1} disabled={!editable} value={sales.communication.maximumMessageLength} onChange={(e) => updateSales({ communication: { ...sales.communication, maximumMessageLength: Number(e.target.value) || 1 } })} className={fieldClass} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Teto verificado nos testes. Cerca de {Math.max(1, Math.round(sales.communication.maximumMessageLength / 6))} palavras.</span></FormField></div><div className="mt-5 space-y-3"><label className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3 text-sm"><span>Responder perguntas diretas primeiro</span><input type="checkbox" disabled={!editable} checked={sales.communication.answerDirectQuestionsFirst} onChange={(e) => updateSales({ communication: { ...sales.communication, answerDirectQuestionsFirst: e.target.checked } })} /></label><label className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3 text-sm"><span>Uma pergunta por vez como padrão</span><input type="checkbox" disabled={!editable} checked={sales.communication.oneQuestionAtATime} onChange={(e) => updateSales({ communication: { ...sales.communication, oneQuestionAtATime: e.target.checked } })} /></label></div></div>
      </div>

      <div className="eia-card p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-foreground">Necessidade → oferta</h2><p className="mt-1 text-sm text-muted-foreground">Relaciona o que o lead precisa com uma recomendação contextual.</p></div>{editable && <Button variant="secondary" size="sm" onClick={() => updateSales({ needMappings: [...sales.needMappings, { id: crypto.randomUUID(), need: 'Nova necessidade', offeringIds: [], guidance: '' }] })}><Plus className="h-4 w-4" />Adicionar relação</Button>}</div><div className="mt-4 space-y-3">{sales.needMappings.length === 0 ? <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Ex.: “Equipe demora para responder” → “Agente de atendimento”, depois de entender volume e processo atual.</p> : sales.needMappings.map((mapping) => <div key={mapping.id} className="rounded-xl border border-border bg-muted/20 p-4"><div className="grid gap-3 md:grid-cols-2"><FormField label="Necessidade ou dor"><input disabled={!editable} value={mapping.need} onChange={(event) => updateSales({ needMappings: sales.needMappings.map((item) => item.id === mapping.id ? { ...item, need: event.target.value } : item) })} className={fieldClass} placeholder="Ex.: Alto volume sem resposta rápida" /></FormField><FormField label="Como recomendar"><input disabled={!editable} value={mapping.guidance} onChange={(event) => updateSales({ needMappings: sales.needMappings.map((item) => item.id === mapping.id ? { ...item, guidance: event.target.value } : item) })} className={fieldClass} placeholder="Ex.: Confirme volume e equipe antes de indicar" /></FormField></div><div className="mt-3"><p className="text-xs font-medium text-foreground">Ofertas relacionadas</p><div className="mt-2 flex flex-wrap gap-2">{config.identity.offerings.map((offering) => { const selected = mapping.offeringIds.includes(offering.id); return <button key={offering.id} type="button" disabled={!editable} onClick={() => updateSales({ needMappings: sales.needMappings.map((item) => item.id === mapping.id ? { ...item, offeringIds: selected ? item.offeringIds.filter((id) => id !== offering.id) : [...item.offeringIds, offering.id] } : item) })} className={cn('rounded-full border px-2.5 py-1 text-xs', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>{offering.name}</button>; })}{config.identity.offerings.length === 0 && <span className="text-xs text-muted-foreground">Cadastre ofertas em Identidade e negócio.</span>}</div></div>{editable && <Button variant="ghost" size="sm" className="mt-3" onClick={() => updateSales({ needMappings: sales.needMappings.filter((item) => item.id !== mapping.id) })}><Trash2 className="h-4 w-4" />Remover relação</Button>}</div>)}</div></div>

      <div className="eia-card p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-foreground">Objeções</h2><p className="mt-1 text-sm text-muted-foreground">Defina o que entender antes de responder, argumentos aprovados e limites.</p></div>{editable && <Button variant="secondary" size="sm" onClick={() => updateSales({ objections: [...sales.objections, { id: crypto.randomUUID(), name: 'Nova objeção', signals: [], understandFirst: '', approvedArguments: [], prohibitedPromises: [], handoffCondition: '' }] })}><Plus className="h-4 w-4" />Adicionar objeção</Button>}</div><div className="mt-4 space-y-4">{sales.objections.length === 0 ? <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Ex.: “Está caro” — entender comparação e prioridade antes de explicar valor; nunca prometer retorno financeiro.</p> : sales.objections.map((objection) => <div key={objection.id} className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex items-start justify-between gap-3"><FormField label="Nome"><input disabled={!editable} value={objection.name} onChange={(event) => updateSales({ objections: sales.objections.map((item) => item.id === objection.id ? { ...item, name: event.target.value } : item) })} className={fieldClass} placeholder="Ex.: Preço" /></FormField>{editable && <Button variant="ghost" size="sm" onClick={() => updateSales({ objections: sales.objections.filter((item) => item.id !== objection.id) })}><Trash2 className="h-4 w-4" /></Button>}</div><div className="mt-3 grid gap-4 md:grid-cols-2"><FormField label="Sinais ou exemplos"><ListEditor values={objection.signals} onChange={(signals) => updateSales({ objections: sales.objections.map((item) => item.id === objection.id ? { ...item, signals } : item) })} placeholder="Ex.: Está fora do orçamento" disabled={!editable} /></FormField><FormField label="O que compreender antes"><textarea disabled={!editable} value={objection.understandFirst} onChange={(event) => updateSales({ objections: sales.objections.map((item) => item.id === objection.id ? { ...item, understandFirst: event.target.value } : item) })} className={cn(fieldClass, 'min-h-24')} placeholder="Ex.: Com o que está comparando e qual resultado busca" /></FormField><FormField label="Argumentos aprovados"><ListEditor values={objection.approvedArguments} onChange={(approvedArguments) => updateSales({ objections: sales.objections.map((item) => item.id === objection.id ? { ...item, approvedArguments } : item) })} placeholder="Ex.: Implantação acompanhada" disabled={!editable} /></FormField><FormField label="Promessas proibidas"><ListEditor values={objection.prohibitedPromises} onChange={(prohibitedPromises) => updateSales({ objections: sales.objections.map((item) => item.id === objection.id ? { ...item, prohibitedPromises } : item) })} placeholder="Ex.: Retorno garantido" disabled={!editable} /></FormField><FormField label="Encaminhar quando"><input disabled={!editable} value={objection.handoffCondition} onChange={(event) => updateSales({ objections: sales.objections.map((item) => item.id === objection.id ? { ...item, handoffCondition: event.target.value } : item) })} className={fieldClass} placeholder="Ex.: Pedido de condição comercial fora da política" /></FormField></div></div>)}</div></div>

      <div className="eia-card p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-foreground">Follow-up</h2><p className="mt-1 text-sm text-muted-foreground">Tentativas automáticas sempre respeitam opt-out e transferência humana.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={sales.followUp.enabled} onChange={(event) => updateSales({ followUp: { ...sales.followUp, enabled: event.target.checked } })} />Habilitado</label></div>{sales.followUp.enabled && <div className="mt-5 grid gap-4 md:grid-cols-2"><FormField label="Intervalos em horas"><input disabled={!editable} value={sales.followUp.intervalsHours.join(', ')} onChange={(event) => updateSales({ followUp: { ...sales.followUp, intervalsHours: event.target.value.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0) } })} className={fieldClass} placeholder="Ex.: 24, 72, 168" /></FormField><FormField label="Máximo de tentativas"><input type="number" min={0} max={20} disabled={!editable} value={sales.followUp.maximumAttempts} onChange={(event) => updateSales({ followUp: { ...sales.followUp, maximumAttempts: Number(event.target.value) || 0 } })} className={fieldClass} /></FormField><FormField label="Condições de parada"><ListEditor values={sales.followUp.stopConditions} onChange={(stopConditions) => updateSales({ followUp: { ...sales.followUp, stopConditions } })} placeholder="Ex.: reunião agendada" disabled={!editable} /></FormField><FormField label="Canais permitidos"><ListEditor values={sales.followUp.allowedChannels} onChange={(allowedChannels) => updateSales({ followUp: { ...sales.followUp, allowedChannels } })} placeholder="Ex.: WhatsApp" disabled={!editable} /></FormField><div className="rounded-xl border border-border bg-muted/30 p-4 text-sm md:col-span-2"><strong className="text-foreground">Proteção fixa:</strong><span className="ml-1 text-muted-foreground">qualquer opt-out interrompe imediatamente o follow-up. Essa regra não pode ser desativada.</span></div></div>}</div>
    </div>
  );
}

export default function AgentWorkspaceSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('section') as AgentSection | null;
  const activeSection = [...sections.map((item) => item.id), 'advanced'].includes(requestedSection as AgentSection) ? requestedSection as AgentSection : 'overview';
  const draft = useAgentDraft();
  const [setupOpen, setSetupOpen] = useState(false);

  // Deep-link real do onboarding: /settings?tab=agent&setup=1 abre o assistente
  // de verdade, em vez de largar a pessoa na visão geral com um clique a mais.
  // Espera o rascunho carregar para respeitar o papel: observador não ganha por
  // deep-link um assistente que todos os outros pontos de entrada desabilitam.
  useEffect(() => {
    if (searchParams.get('setup') !== '1') return;
    if (draft.status === 'loading') return;
    if (draft.context && draft.isEditable) setSetupOpen(true);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('setup');
      return next;
    }, { replace: true });
  }, [draft.context, draft.isEditable, draft.status, searchParams, setSearchParams]);
  // O fio condutor do ciclo (última rodada de testes) e o resumo de
  // conhecimento vivem no pai — não na Visão geral — para a navegação poder
  // sinalizar pendência a partir de qualquer seção. São efeitos SEPARADOS de
  // propósito: uma indisponibilidade da base de conhecimento não pode apagar o
  // estado do stepper, e vice-versa.
  const [latestRun, setLatestRun] = useState<EvalRun | null>(null);
  useEffect(() => {
    let active = true;
    evalsApi.fetchRuns(1)
      .then((runs) => { if (active) setLatestRun(runs[0] ?? null); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [activeSection, draft.context?.draftRevision]);

  // O resumo de conhecimento é pesado (baixa fatos e documentos inteiros).
  // Carrega uma vez para o ponto da navegação existir em qualquer seção, e
  // depois só atualiza ao entrar nas telas onde ele muda ou é exibido — nunca
  // por autosave, que troca a revisão do rascunho a cada pausa de digitação.
  const [knowledgeSummary, setKnowledgeSummary] = useState<KnowledgeSummary | null>(null);
  const knowledgeLoaded = useRef(false);
  useEffect(() => {
    if (knowledgeLoaded.current && activeSection !== 'overview' && activeSection !== 'knowledge') return;
    let active = true;
    void Promise.all([
      knowledgeApi.fetchFacts(),
      knowledgeApi.fetchDocuments(),
      knowledgeApi.fetchUnanswered('open'),
    ]).then(([facts, documents, unanswered]) => {
      if (!active) return;
      const now = Date.now();
      const reviewFacts = facts.filter((fact) => (
        ['needs_review', 'draft', 'expired'].includes(fact.status)
        || Boolean(fact.expires_at && new Date(fact.expires_at).getTime() <= now)
      )).length;
      const reviewDocuments = documents.filter((document) => ['needs_review', 'error'].includes(document.status)).length;
      knowledgeLoaded.current = true;
      setKnowledgeSummary({
        confirmed: facts.filter((fact) => fact.category !== 'faq' && fact.status === 'confirmed').length,
        faqs: facts.filter((fact) => fact.category === 'faq' && fact.status === 'confirmed').length,
        approvedDocuments: documents.filter((document) => document.status === 'approved').length,
        attention: unanswered.length + reviewFacts + reviewDocuments,
      });
    }).catch(() => {
      // A tela continua útil durante indisponibilidade transitória do resumo.
    });
    return () => { active = false; };
  }, [activeSection]);

  // Fonte única de prontidão: stepper, cards e navegação leem daqui.
  const readiness = useMemo(
    () => (draft.config ? computeAgentReadiness(draft.config) : null),
    [draft.config],
  );
  const pendingSections = useMemo(() => {
    const set = new Set<AgentSection>();
    readiness?.required.forEach((item) => set.add(item.section as AgentSection));
    if (knowledgeSummary && knowledgeSummary.attention > 0) set.add('knowledge');
    return set;
  }, [readiness, knowledgeSummary]);

  const setSection = (section: AgentSection) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (section === 'overview') next.delete('section'); else next.set('section', section);
      return next;
    }, { replace: true });
  };

  const statusLabel = useMemo(() => {
    if (!draft.context) return 'Em configuração';
    if (draft.status === 'conflict') return 'Precisa de atenção';
    if (draft.hasUnpublishedChanges) return 'Alterações não publicadas';
    return draft.context.agentStatus === 'active' ? 'Ativa' : 'Em configuração';
  }, [draft.context, draft.hasUnpublishedChanges, draft.status]);

  // O fio condutor do ciclo: onde estou e qual é o próximo passo, sempre visível.
  const cycleSteps = useMemo(() => {
    const config = draft.config;
    if (!config || !readiness) return [];
    // "Configurar" completa no piso real de publicação (os blockers do
    // compilador), não no ideal. Exigir qualificação aqui fazia o stepper
    // afirmar que faltava configurar quando a publicação já estava liberada —
    // configuração parcial é um estado válido, e o resto vira recomendação.
    const configured = readiness.required.length === 0;
    const tested = Boolean(
      latestRun
      && latestRun.status === 'completed'
      && latestRun.draft_revision === draft.context?.draftRevision
      && ['passed', 'warnings'].includes(latestRun.gate_status),
    );
    const live = Boolean(draft.publishedVersion && !draft.hasUnpublishedChanges);
    // O clique leva para onde a primeira pendência mora — quando o único
    // blocker é a revisão da migração, Identidade seria o destino errado.
    const configureTarget = (readiness.required[0]?.section ?? 'identity') as AgentSection;
    return [
      { id: 'configure', label: 'Configurar', complete: configured, section: configureTarget },
      { id: 'test', label: 'Testar', complete: tested, section: 'publish' as AgentSection },
      { id: 'publish', label: live ? 'No ar' : 'Publicar', complete: live, section: 'publish' as AgentSection },
    ];
  }, [draft.config, draft.context?.draftRevision, draft.hasUnpublishedChanges, draft.publishedVersion, latestRun, readiness]);
  const currentCycleIndex = cycleSteps.findIndex((step) => !step.complete);

  if (draft.status === 'loading') return <div className="eia-card flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando a configuração da agente…</div>;
  if (!draft.context || !draft.config) return <div className="eia-card p-6"><h2 className="font-semibold text-foreground">Não foi possível abrir a agente</h2><p className="mt-2 text-sm text-muted-foreground">{draft.error?.message || 'Nenhuma configuração foi encontrada para este workspace.'}</p><Button variant="secondary" size="sm" className="mt-4" onClick={() => void draft.reload()}><RefreshCw className="h-4 w-4" />Tentar novamente</Button></div>;

  return (
    <div className="space-y-5">
      <AgentSetupAssistant
        open={setupOpen}
        onOpenChange={setSetupOpen}
        agentId={draft.context.agentId}
        currentConfig={draft.config}
        editable={draft.isEditable}
        onApply={async (config) => {
          draft.replaceConfig(config);
          await draft.saveNow({ throwOnError: true });
        }}
        ensureDraftSaved={async () => {
          if (draft.status !== 'saved') await draft.saveNow({ throwOnError: true });
        }}
      />
      <div className="eia-card p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div><p className="eia-eyebrow">Configure sua agente</p><div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-foreground">{draft.config.identity.agentName || 'Sua agente'}</h2><Badge variant={draft.hasUnpublishedChanges ? 'muted' : 'success'}>{statusLabel}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Defina o que ela sabe, como deve vender e quais ações pode realizar.</p><div className="mt-2 flex flex-wrap items-center gap-3"><SaveIndicator status={draft.status} /><span className="text-xs text-muted-foreground">Rascunho r{draft.context.draftRevision}</span>{draft.publishedVersion && <span className="text-xs text-muted-foreground">Versão {draft.publishedVersion.versionNumber} ativa desde {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(draft.publishedVersion.publishedAt))}</span>}</div><div className="mt-4 flex flex-wrap items-center gap-1.5">{cycleSteps.map((step, index) => { const state = step.complete ? 'done' : index === currentCycleIndex ? 'current' : 'pending'; return (<span key={step.id} className="flex items-center gap-1.5"><button type="button" onClick={() => setSection(step.section)} title={state === 'done' ? `${step.label}: concluído` : state === 'current' ? `${step.label}: próximo passo` : step.label} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition', state === 'done' && 'border-success/40 bg-success/10 text-foreground', state === 'current' && 'border-primary bg-primary text-primary-foreground', state === 'pending' && 'border-border text-muted-foreground hover:text-foreground')}>{state === 'done' ? <Check className="h-3 w-3" /> : <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[9px]">{index + 1}</span>}{step.label}</button>{index < cycleSteps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}</span>); })}</div></div>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => setSetupOpen(true)} disabled={!draft.isEditable}><Compass className="h-4 w-4" />Configurar com IA</Button><Button variant="primary" size="sm" onClick={() => setSection('publish')}><ClipboardCheck className="h-4 w-4" />Testar e publicar</Button></div>
        </div>
      </div>

      {draft.status === 'conflict' && <ConflictBanner localConfig={draft.config} resolve={draft.resolveConflict} />}
      {draft.status === 'error' && <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{draft.error?.message || 'Não foi possível salvar o rascunho.'}</span><div className="flex shrink-0 gap-2"><Button variant="primary" size="sm" onClick={() => void draft.saveNow()}>Tentar salvar de novo</Button><Button variant="outline" size="sm" onClick={() => void draft.reload()}>Recarregar</Button></div></div></div>}

      <nav aria-label="Seções da configuração da agente" className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5">
        {sections.map((item) => <button key={item.id} type="button" onClick={() => setSection(item.id)} className={cn('inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition', activeSection === item.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}><item.icon className="h-4 w-4" />{item.label}{pendingSections.has(item.id) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" title="Há pendências nesta seção"><span className="sr-only">— há pendências nesta seção</span></span>}</button>)}
        <button type="button" onClick={() => setSection('advanced')} className={cn('ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition', activeSection === 'advanced' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}><Settings2 className="h-4 w-4" />Prompt e comportamento{pendingSections.has('advanced') && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" title="Há pendências nesta seção"><span className="sr-only">— há pendências nesta seção</span></span>}</button>
      </nav>

      {activeSection === 'overview' && readiness && <Overview config={draft.config} setSection={setSection} editable={draft.isEditable} updateConfig={draft.updateConfig} onStartSetup={() => setSetupOpen(true)} readiness={readiness} knowledgeSummary={knowledgeSummary} latestEvaluation={latestRun} />}
      {activeSection === 'identity' && <IdentityEditor config={draft.config} updateConfig={draft.updateConfig} editable={draft.isEditable} />}
      {activeSection === 'sales' && <SalesEditor config={draft.config} updateConfig={draft.updateConfig} editable={draft.isEditable} />}
      {activeSection === 'knowledge' && <KnowledgeWorkspaceSettings editable={draft.isEditable} updateConfigAndSave={draft.updateConfigAndSave} />}
      {activeSection === 'actions' && <AgentActionsSettings config={draft.config} updateConfig={draft.updateConfig} editable={draft.isEditable} />}
      {activeSection === 'publish' && <AgentPublishSettings agentId={draft.context.agentId} config={draft.config} draftRevision={draft.context.draftRevision} canPublish={draft.context.canPublish} draftSaved={draft.status === 'saved'} onPublished={draft.reload} goToSection={setSection} />}
      {activeSection === 'advanced' && <div className="space-y-5"><div className="eia-card p-6"><p className="eia-eyebrow">Modo avançado</p><h2 className="mt-1 text-xl font-semibold text-foreground">Veja e ajuste o comportamento final</h2><p className="mt-2 max-w-3xl text-sm text-muted-foreground">O prompt abaixo é compilado a partir da configuração. Para preservar uma única fonte de verdade, você edita as instruções avançadas e os campos das seções anteriores; a visualização final permanece somente leitura.</p><div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><div className="rounded-2xl border border-border bg-muted/20 p-4"><FormField label="Instruções personalizadas" hint="(opcional)"><textarea disabled={!draft.isEditable} value={draft.config.customInstructions} onChange={(e) => draft.updateConfig((current) => ({ ...current, customInstructions: e.target.value }))} className={cn(fieldClass, 'min-h-72 resize-y')} placeholder={'Ex.: Ao identificar que o lead já usa IA, pergunte primeiro qual processo deseja melhorar.\n\nNão altere preços, políticas ou regras de segurança aqui.'} /></FormField><p className="mt-3 text-xs leading-relaxed text-muted-foreground">Use este campo somente para exceções comportamentais que não cabem nas demais seções. Regras que permitem invenção, exposição do prompt ou ações sem confirmação bloqueiam a publicação.</p></div><div className="rounded-2xl border border-border p-4"><div className="mb-4"><p className="text-sm font-semibold text-foreground">Prompt compilado do rascunho</p><p className="mt-1 text-xs text-muted-foreground">Atualiza a cada edição, no navegador. Inclui proteções fixas, identidade, processo, conhecimento, ações e suas instruções personalizadas.</p></div><CompiledPromptInspector variant="inline" agentId={draft.context.agentId} config={draft.config} publishedConfig={draft.publishedVersion?.config ?? null} draftSaved={draft.status === 'saved'} /></div></div></div><div className="eia-card p-5"><div className="grid gap-4 lg:grid-cols-3"><div className="rounded-xl border border-border bg-muted/20 p-4"><p className="text-sm font-semibold text-foreground">Variáveis de runtime</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Data e hora, identidade do contato, estado estruturado do lead e resumo da conversa entram somente no turno real ou simulado — nunca são gravados no prompt-base.</p></div><div className="rounded-xl border border-border bg-muted/20 p-4"><p className="text-sm font-semibold text-foreground">Ferramentas habilitadas</p><div className="mt-2 flex flex-wrap gap-1.5">{draft.config.actions.filter((action) => action.enabled).map((action) => <Badge key={action.actionId} variant="outline">{action.actionId === 'appointments' ? 'Agenda' : 'Transferência humana'}</Badge>)}{draft.config.actions.every((action) => !action.enabled) && <span className="text-xs text-muted-foreground">Nenhuma ação habilitada.</span>}</div><p className="mt-2 text-xs text-muted-foreground">No atendimento real, apenas a versão publicada concede essas permissões.</p></div><div className="rounded-xl border border-border bg-muted/20 p-4"><p className="text-sm font-semibold text-foreground">Contexto recuperado</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">No simulador, “O que sustentou a resposta” mostra fontes consultadas, lacunas e ações simuladas por turno.</p><Button variant="secondary" size="sm" className="mt-3" onClick={() => setSection('publish')}>Abrir simulador</Button></div></div></div><AgentObservabilityPanel agentId={draft.context.agentId} /></div>}
    </div>
  );
}
