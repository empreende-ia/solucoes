import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Loader2,
  Pencil,
  Plus,
  Rocket,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
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
import { cn } from '@/lib/utils';
import { resolveRule, type RuleSection } from '@/lib/evaluationRules';
import type { AgentConfig } from '@/domain/agent-config';
import {
  getAgentCompiledPromptPreview,
  listAgentVersions,
  publishAgentDraft,
  restoreAgentVersionToDraft,
  type AgentVersion,
} from '@/services/agent-config';
import {
  BEHAVIOR_LABELS,
  evalsApi,
  type EvalResult,
  type EvalRun,
  type ExpectedBehavior,
  type GoldenCase,
  type ReviewerVerdict,
} from '@/services/evals';
import { compileAgentPrompt } from '../../../supabase/functions/_shared/agent-prompt-compiler';
import { textToTurns, turnsToText } from '@/lib/scenarioTurns';
import AgentSimulator from './AgentSimulator';

/** Cada alerta do compilador aponta o campo de origem; a seção correspondente abre com um clique. */
function compilerIssueSection(field: string): RuleSection | 'overview' {
  if (field.startsWith('identity.')) return 'identity';
  if (field.startsWith('salesProcess.')) return 'sales';
  if (field.startsWith('knowledgePolicy')) return 'knowledge';
  if (field.startsWith('actions')) return 'actions';
  if (field === 'customInstructions') return 'advanced';
  return 'overview';
}

const fieldClass = 'mt-1.5 w-full rounded-xl border border-input bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20';

interface AgentPublishSettingsProps {
  agentId: string;
  config: AgentConfig;
  draftRevision: number;
  canPublish: boolean;
  draftSaved: boolean;
  onPublished: () => Promise<void> | void;
  /** Abre a seção da configuração que originou uma regra avaliada ou um alerta do compilador. */
  goToSection: (section: RuleSection | 'overview') => void;
}

function statusPresentation(status: EvalResult['result_status']) {
  if (status === 'passed') return { label: 'Passou', icon: CheckCircle2, className: 'text-success' };
  if (status === 'warning') return { label: 'Alerta', icon: AlertTriangle, className: 'text-primary' };
  if (status === 'technical_failure') return { label: 'Falha técnica', icon: XCircle, className: 'text-destructive' };
  if (status === 'unstable') return { label: 'Instável', icon: ShieldAlert, className: 'text-destructive' };
  if (status === 'critical_failure') return { label: 'Crítico', icon: ShieldAlert, className: 'text-destructive' };
  return { label: 'Não executado', icon: ClipboardCheck, className: 'text-muted-foreground' };
}


/**
 * A regra que originou o cenário, com o caminho para corrigi-la.
 *
 * Regra da plataforma não ganha botão: não existe campo para abrir, então a faixa
 * mostra o que fazer no lugar disso.
 */
function RuleBar({
  sourceRule,
  goToSection,
}: {
  sourceRule: string | null | undefined;
  goToSection: (section: RuleSection) => void;
}) {
  const rule = resolveRule(sourceRule);
  if (!rule) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/60 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{rule.label}</p>
        {rule.kind === 'config' ? (
          <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{sourceRule}</p>
        ) : (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{rule.hint}</p>
        )}
      </div>
      {rule.kind === 'config' && (
        <Button variant="secondary" size="sm" onClick={() => goToSection(rule.section)}>
          Abrir configuração
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

const VERDICT_OPTIONS: Array<{ value: ReviewerVerdict; label: string }> = [
  { value: 'keep', label: 'Pode manter assim' },
  { value: 'reject', label: 'Isso não pode acontecer' },
  { value: 'neutral', label: 'Sem opinião' },
];

/**
 * A palavra do operador sobre o veredito automático.
 *
 * Marcar "pode manter" num alerta não silencia nada sozinho: a interface avisa que
 * a regra segue na configuração e oferece os dois caminhos honestos — corrigir o
 * campo ou aceitar o caso, com registro.
 */
function ResultReview({
  result,
  scenario,
  saving,
  onReview,
  onEditScenario,
  goToSection,
}: {
  result: EvalResult;
  scenario: GoldenCase | undefined;
  saving: boolean;
  onReview: (verdict: ReviewerVerdict, acceptScenario?: boolean) => void;
  onEditScenario: (scenario: GoldenCase) => void;
  goToSection: (section: RuleSection) => void;
}) {
  const rule = resolveRule(scenario?.source_rule);
  const accepted = Boolean(scenario?.accepted_at);
  const verdict = result.reviewer_verdict;
  const deviatesFromRule = result.result_status !== 'passed';

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted-foreground">Este comportamento está certo?</span>
        {VERDICT_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={verdict === option.value ? 'primary' : 'outline'}
            size="sm"
            disabled={saving}
            aria-pressed={verdict === option.value}
            onClick={() => onReview(option.value)}
          >
            {saving && verdict === option.value ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {option.label}
          </Button>
        ))}
      </div>

      {verdict === 'keep' && deviatesFromRule && !accepted && (
        <div className="rounded-xl border border-border bg-secondary/60 p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {rule?.kind === 'config'
              ? <>A regra <span className="font-medium text-foreground">{rule.label}</span> continua ligada na configuração. O prompt seguirá pedindo o contrário do que você aprovou, e a resposta vai variar entre uma rodada e outra.</>
              : <>Esta é uma proteção fixa da plataforma. Aceitar registra a sua decisão, mas o comportamento continua sendo verificado a cada rodada.</>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {rule?.kind === 'config' && (
              <Button variant="primary" size="sm" onClick={() => goToSection(rule.section)}>
                Abrir configuração
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="secondary" size="sm" disabled={saving} onClick={() => onReview('keep', true)}>
              Aceitar mesmo assim
            </Button>
          </div>
        </div>
      )}

      {verdict === 'keep' && accepted && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Aceito por você. O alerta continua na lista com o selo, mas sai da fila de atenção.
        </p>
      )}

      {verdict === 'reject' && (
        <div className="rounded-xl border border-border bg-secondary/60 p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {result.result_status === 'passed'
              ? 'O avaliador aprovou e você discordou. Isso não muda esta rodada — muda o teste daqui pra frente.'
              : 'Registrado. Ajuste a situação ou a configuração para que a próxima rodada cobre o comportamento certo.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {scenario && scenario.origin !== 'automatico' && (
              <Button variant="primary" size="sm" onClick={() => onEditScenario(scenario)}>
                <Pencil className="h-3.5 w-3.5" />
                Ajustar esta situação
              </Button>
            )}
            {rule?.kind === 'config' && (
              <Button variant={scenario && scenario.origin !== 'automatico' ? 'secondary' : 'primary'} size="sm" onClick={() => goToSection(rule.section)}>
                Abrir configuração
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentPublishSettings({
  agentId,
  config,
  draftRevision,
  canPublish,
  draftSaved,
  onPublished,
  goToSection,
}: AgentPublishSettingsProps) {
  const [cases, setCases] = useState<GoldenCase[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [openRun, setOpenRun] = useState<{ id: string; draft_revision: number; total_cases: number; done: number; remaining_case_ids: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const cancelRequestedRef = useRef(false);
  const [publishing, setPublishing] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [acceptEvaluationWarnings, setAcceptEvaluationWarnings] = useState(false);
  const [acceptCompilerWarnings, setAcceptCompilerWarnings] = useState(false);
  const [label, setLabel] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [casesOpen, setCasesOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [newCase, setNewCase] = useState({
    title: '',
    query: '',
    expected_behavior: 'responder' as ExpectedBehavior,
    expected_content: '',
    severity: 'warning' as 'critical' | 'warning',
    previousTurns: '',
  });

  const latestRun = runs[0] ?? null;
  const runMatchesDraft = Boolean(
    latestRun?.status === 'completed' && latestRun.draft_revision === draftRevision,
  );
  const gateAllowsPublication = Boolean(
    runMatchesDraft
      && latestRun
      && ['passed', 'warnings'].includes(latestRun.gate_status)
      && latestRun.critical_failures === 0
      && latestRun.unstable === 0
      && latestRun.technical_failures === 0,
  );

  const load = async () => {
    setLoading(true);
    try {
      const [nextCases, nextRuns, nextVersions] = await Promise.all([
        evalsApi.fetchCases(),
        evalsApi.fetchRuns(),
        listAgentVersions(agentId),
      ]);
      setCases(nextCases);
      setRuns(nextRuns);
      setVersions(nextVersions);
      if (nextRuns[0]?.status === 'completed') {
        setResults(await evalsApi.fetchResults(nextRuns[0].id));
      } else {
        setResults([]);
      }
      // Uma rodada 'running' sem execução ativa nesta aba ficou órfã (aba fechada
      // no meio): oferecemos retomar ou descartar em vez de travar por 15 minutos.
      if (nextRuns[0]?.status === 'running') {
        const status = await evalsApi.fetchRunningStatus();
        setOpenRun(status.run);
      } else {
        setOpenRun(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar as situações de teste.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    setAcceptEvaluationWarnings(false);
    setAcceptCompilerWarnings(false);
  }, [draftRevision, latestRun?.id]);

  const activeCases = useMemo(() => cases.filter((item) => item.is_active), [cases]);
  // Compilação local: os alertas aparecem aqui, antes do clique em publicar, e não
  // num toast depois dele. O servidor revalida na publicação.
  const compiledDraft = useMemo(() => {
    try {
      return compileAgentPrompt(config);
    } catch {
      return null;
    }
  }, [config]);
  const localCompilerWarnings = useMemo(() => compiledDraft?.issues.filter((issue) => issue.severity === 'warning') ?? [], [compiledDraft]);
  const localCompilerBlocking = useMemo(() => compiledDraft?.issues.filter((issue) => issue.severity === 'blocking') ?? [], [compiledDraft]);
  const changedAreas = useMemo(() => {
    const published = versions[0]?.config;
    if (!published) return ['Configuração inicial'];
    const candidates: Array<[string, unknown, unknown]> = [
      ['Identidade e negócio', config.identity, published.identity],
      ['Atendimento e vendas', config.salesProcess, published.salesProcess],
      ['Política de conhecimento', config.knowledgePolicy, published.knowledgePolicy],
      ['Ações', config.actions, published.actions],
      ['Instruções personalizadas', config.customInstructions, published.customInstructions],
    ];
    return candidates
      .filter(([, current, previous]) => JSON.stringify(current) !== JSON.stringify(previous))
      .map(([name]) => name);
  }, [config, versions]);

  /** Executa os casos com 4 execuções simultâneas; para de despachar se a pessoa cancelar. */
  const runCases = async (runId: string, caseIds: string[], base: { done: number; total: number }) => {
    setProgress({ done: base.done, total: base.total });
    let cursor = 0;
    let completed = base.done;
    let firstFailure: unknown = null;
    const worker = async () => {
      while (cursor < caseIds.length && !cancelRequestedRef.current) {
        const caseId = caseIds[cursor++];
        try {
          await evalsApi.runCase(runId, caseId);
        } catch (cause) {
          // Um caso que falha (rate limit, caso apagado, rede) precisa PARAR os
          // outros workers: sem isso eles continuavam executando em segundo
          // plano depois do toast de erro, e a rodada ficava aberta sem
          // aparecer como órfã. O cancelamento é cooperativo via a mesma flag.
          if (!firstFailure) firstFailure = cause;
          cancelRequestedRef.current = true;
          return;
        }
        completed += 1;
        setProgress({ done: completed, total: base.total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, caseIds.length) }, worker));
    if (firstFailure) throw firstFailure;
  };

  const announceSummary = (summary: { gate_status: EvalRun['gate_status'] }) => {
    if (summary.gate_status === 'passed') toast.success('Todas as situações passaram. O rascunho pode ser publicado.');
    else if (summary.gate_status === 'warnings') toast.warning('Os testes terminaram com alertas para sua revisão.');
    else toast.error('Há situações que precisam ser corrigidas antes da publicação.');
  };

  /** Conclui uma rodada (nova ou retomada); cancelamento descarta em vez de fechar. */
  const driveRun = async (runId: string, caseIds: string[], base: { done: number; total: number }) => {
    try {
      await runCases(runId, caseIds, base);
    } catch (cause) {
      // Todos os workers já pararam (a falha seta a flag de cancelamento).
      // Descarta a rodada para ela não ficar aberta consumindo o histórico.
      await evalsApi.discardRun(runId).catch(() => undefined);
      await load();
      throw cause;
    }
    if (cancelRequestedRef.current) {
      await evalsApi.discardRun(runId);
      toast.info('Rodada cancelada. Nenhum resultado parcial será considerado.');
      await load();
      return;
    }
    const summary = await evalsApi.finishRun(runId);
    await load();
    announceSummary(summary);
  };

  const requestCancel = () => {
    cancelRequestedRef.current = true;
    setCancelRequested(true);
  };

  const handleRun = async () => {
    if (!draftSaved) {
      toast.error('Aguarde o rascunho terminar de salvar antes de testar.');
      return;
    }
    setRunning(true);
    setResults([]);
    cancelRequestedRef.current = false;
    setCancelRequested(false);
    try {
      const started = await evalsApi.startRun();
      await driveRun(started.run_id, started.case_ids, { done: 0, total: started.case_ids.length });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir a avaliação.');
    } finally {
      setRunning(false);
    }
  };

  const handleResumeRun = async () => {
    if (!openRun) return;
    setRunning(true);
    cancelRequestedRef.current = false;
    setCancelRequested(false);
    try {
      await driveRun(openRun.id, openRun.remaining_case_ids, { done: openRun.done, total: openRun.total_cases });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível retomar a avaliação.');
    } finally {
      setRunning(false);
    }
  };

  const handleDiscardRun = async () => {
    if (!openRun) return;
    try {
      await evalsApi.discardRun(openRun.id);
      toast.success('Rodada descartada. Você já pode executar os testes novamente.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível descartar a rodada.');
    }
  };

  const resetCaseForm = () => {
    setEditingId(null);
    setNewCase({ title: '', query: '', expected_behavior: 'responder', expected_content: '', severity: 'warning', previousTurns: '' });
  };

  const openCreateDialog = () => {
    resetCaseForm();
    setDialogOpen(true);
  };

  const openEditDialog = (item: GoldenCase) => {
    setEditingId(item.id);
    setNewCase({
      title: item.title,
      query: item.query,
      expected_behavior: item.expected_behavior,
      expected_content: item.expected_content ?? '',
      severity: item.severity,
      previousTurns: turnsToText(item.messages ?? []),
    });
    setDialogOpen(true);
  };

  const handleSaveCase = async () => {
    if (!newCase.query.trim()) {
      toast.error('Escreva a mensagem do cliente que deseja testar.');
      return;
    }
    const payload = {
      title: newCase.title.trim() || newCase.query.trim().slice(0, 120),
      query: newCase.query.trim(),
      expected_behavior: newCase.expected_behavior,
      expected_content: newCase.expected_behavior === 'responder' ? newCase.expected_content.trim() || null : null,
      severity: newCase.severity,
      category: (newCase.expected_behavior === 'agendar' ? 'acao' : newCase.expected_behavior === 'transferir' ? 'handoff' : 'factual') as GoldenCase['category'],
      messages: textToTurns(newCase.previousTurns),
    };
    try {
      if (editingId) {
        await evalsApi.updateCase(editingId, payload);
      } else {
        await evalsApi.createCase(payload);
      }
      setDialogOpen(false);
      resetCaseForm();
      await load();
      toast.success(editingId ? 'Situação de teste atualizada.' : 'Situação de teste adicionada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a situação.');
    }
  };

  const handleReview = async (result: EvalResult, verdict: ReviewerVerdict, acceptScenario = false) => {
    setReviewingId(result.id);
    try {
      await evalsApi.reviewResult(result.id, verdict, acceptScenario);
      await load();
      if (acceptScenario) toast.success('Alerta aceito. Ele continua na lista com o selo.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar sua avaliação.');
    } finally {
      setReviewingId(null);
    }
  };

  const handleDeleteCase = async (item: GoldenCase) => {
    if (!window.confirm(`Apagar a situação “${item.title}”? Ela deixa de ser verificada nas próximas rodadas.`)) return;
    setDeletingId(item.id);
    try {
      await evalsApi.deleteCase(item.id);
      await load();
      toast.success('Situação removida.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover a situação.');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePublish = async () => {
    if (!latestRun || !gateAllowsPublication) return;
    setPublishing(true);
    try {
      const preview = await getAgentCompiledPromptPreview(agentId);
      const compilerWarnings = preview.issues.filter((issue) => issue.severity === 'warning');
      // O aceite só pode cobrir alertas que a pessoa VIU. Se o servidor está à
      // frente desta versão da tela e computa um alerta que não foi exibido,
      // enviá-lo como aceito seria consentimento fabricado.
      const seenCodes = new Set(localCompilerWarnings.map((issue) => issue.code));
      if (compilerWarnings.some((issue) => !seenCodes.has(issue.code))) {
        toast.warning('O servidor encontrou alertas que esta tela ainda não mostra. Recarregue a página e tente novamente.');
        return;
      }
      if (compilerWarnings.length > 0 && !acceptCompilerWarnings) {
        toast.warning('Marque a confirmação dos alertas de configuração antes de publicar.');
        return;
      }
      await publishAgentDraft({
        agentId,
        expectedRevision: draftRevision,
        evaluationRunId: latestRun.id,
        label: label.trim() || null,
        acceptedWarningCodes: compilerWarnings.map((issue) => issue.code),
        acceptEvaluationWarnings,
      });
      toast.success('Nova versão publicada. O atendimento real já usa esta configuração.');
      setLabel('');
      await onPublished();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível publicar a agente.');
    } finally {
      setPublishing(false);
    }
  };

  const handleRestore = async (version: AgentVersion) => {
    if (!window.confirm(`Restaurar a versão ${version.versionNumber} no rascunho? A versão ativa continuará atendendo até uma nova publicação.`)) return;
    setRestoringId(version.id);
    try {
      await restoreAgentVersionToDraft(agentId, version.id, draftRevision);
      toast.success(`Versão ${version.versionNumber} restaurada no rascunho. Revise e execute os testes antes de publicar.`);
      await onPublished();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível restaurar esta versão.');
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) {
    return <div className="eia-card flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando situações de teste…</div>;
  }

  return (
    <div className="space-y-5">
      <AgentSimulator onScenarioCreated={load} draftSaved={draftSaved} />
      <div className="eia-card p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="eia-eyebrow">Teste antes de publicar</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">Veja como a agente reage em situações importantes</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Os testes usam o rascunho atual, simulam ações sem alterar dados reais e mantêm a versão publicada atendendo normalmente.</p>
          </div>
          <Button variant="secondary" onClick={openCreateDialog} disabled={running}><Plus className="h-4 w-4" />Adicionar situação</Button>
        </div>

        {openRun && !running && (
          <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium text-foreground">Uma rodada de testes ficou aberta ({openRun.done} de {openRun.total_cases} casos concluídos).</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {openRun.draft_revision === draftRevision
                    ? 'Você pode retomar de onde ela parou ou descartar e começar de novo.'
                    : 'Ela usa uma revisão anterior do rascunho — se concluída, o resultado aparecerá como desatualizado. Recomendamos descartar.'}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant={openRun.draft_revision === draftRevision ? 'primary' : 'secondary'} size="sm" onClick={() => void handleResumeRun()}>Retomar rodada</Button>
                <Button variant={openRun.draft_revision === draftRevision ? 'secondary' : 'primary'} size="sm" onClick={() => void handleDiscardRun()}>Descartar</Button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-muted/20">
          <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setCasesOpen((current) => !current)}
              aria-expanded={casesOpen}
              className="flex items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{activeCases.length} situações serão verificadas</span>
                <span className="mt-1 block text-sm text-muted-foreground">Segurança, fatos, pedidos de parada e ações habilitadas entram automaticamente.</span>
              </span>
              {casesOpen ? <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            </button>
            <div className="flex shrink-0 gap-2">
              <Button variant="primary" onClick={() => void handleRun()} disabled={running || !draftSaved || openRun !== null}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                {running ? `Testando ${progress.done} de ${progress.total}` : runMatchesDraft ? 'Testar novamente' : 'Executar testes'}
              </Button>
              {running && (
                <Button variant="secondary" disabled={cancelRequested} onClick={requestCancel}>
                  {cancelRequested ? 'Cancelando…' : 'Cancelar'}
                </Button>
              )}
            </div>
          </div>

          {running && progress.total > 0 && <div className="mx-5 mb-5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>}

          {casesOpen && (
            <div className="border-t border-border">
              <p className="border-b border-border bg-card/60 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
                As situações <span className="font-medium text-foreground">da configuração</span> são geradas de novo a cada rodada, por isso não podem ser
                editadas nem apagadas — a seta leva ao campo que as originou. As que <span className="font-medium text-foreground">você adiciona</span> ficam sob seu controle.
              </p>
              {activeCases.length === 0 && <p className="px-5 py-4 text-sm text-muted-foreground">Nenhuma situação ativa. Execute os testes para gerar as automáticas a partir da configuração.</p>}
              {activeCases.map((item) => {
                const rule = resolveRule(item.source_rule);
                const automatic = item.origin === 'automatico';
                return (
                  <div key={item.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.query}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {item.severity === 'critical' && <Badge variant="destructive">Crítica</Badge>}
                      {/* O selo marcado é o da exceção: a maioria das linhas vem da configuração. */}
                      <Badge variant="outline" className={automatic ? 'border-border text-muted-foreground' : 'border-primary/30 bg-primary/5 text-primary'}>
                        {automatic ? 'Da configuração' : 'Adicionada por você'}
                      </Badge>
                      {automatic
                        ? rule?.kind === 'config' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Abrir a configuração: ${rule.label}`} title={rule.label} onClick={() => goToSection(rule.section)}>
                              <ArrowUpRight className="h-4 w-4" />
                            </Button>
                          )
                        : (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar a situação ${item.title}`} onClick={() => openEditDialog(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" aria-label={`Apagar a situação ${item.title}`} disabled={deletingId !== null} onClick={() => void handleDeleteCase(item)}>
                              {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </>
                        )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {latestRun && (
        <div className="eia-card p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="eia-eyebrow">Resultado mais recente</p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">{runMatchesDraft ? 'Rascunho atual' : 'Resultado desatualizado'}</h3>
            </div>
            <Badge variant={latestRun.gate_status === 'passed' ? 'success' : latestRun.gate_status === 'warnings' ? 'muted' : 'destructive'}>
              {latestRun.gate_status === 'passed' ? 'Pronto para publicar' : latestRun.gate_status === 'warnings' ? 'Com alertas' : latestRun.gate_status === 'technical_failure' ? 'Falha técnica' : 'Publicação bloqueada'}
            </Badge>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border p-4"><p className="text-2xl font-semibold text-foreground">{latestRun.passed}</p><p className="text-xs text-muted-foreground">Passaram</p></div>
            <div className="rounded-xl border border-border p-4"><p className="text-2xl font-semibold text-primary">{latestRun.warnings}</p><p className="text-xs text-muted-foreground">Alertas{latestRun.accepted_warnings > 0 ? ` · ${latestRun.accepted_warnings} aceito${latestRun.accepted_warnings > 1 ? 's' : ''} por você` : ''}</p></div>
            <div className="rounded-xl border border-border p-4"><p className="text-2xl font-semibold text-destructive">{latestRun.critical_failures + latestRun.unstable}</p><p className="text-xs text-muted-foreground">Críticos ou instáveis</p></div>
            <div className="rounded-xl border border-border p-4"><p className="text-2xl font-semibold text-destructive">{latestRun.technical_failures}</p><p className="text-xs text-muted-foreground">Falhas técnicas</p></div>
          </div>

          <div className="mt-5 space-y-2">
            {results.map((result) => {
              const presentation = statusPresentation(result.result_status);
              const Icon = presentation.icon;
              const expanded = expandedResult === result.id;
              const scenario = cases.find((item) => item.id === result.case_id);
              const accepted = Boolean(scenario?.accepted_at);
              return (
                <div key={result.id} className="rounded-xl border border-border bg-card">
                  <button type="button" className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setExpandedResult(expanded ? null : result.id)}>
                    <Icon className={cn('h-4 w-4 shrink-0', presentation.className)} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{result.query}</span><span className="text-xs text-muted-foreground">{presentation.label}{result.attempts > 1 ? ` · ${result.attempts} execuções` : ''}{accepted && scenario?.accepted_at ? ` · aceito em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(scenario.accepted_at))}` : ''}</span></span>
                    {accepted && <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Aceito por você</Badge>}
                    {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                  </button>
                  {expanded && (
                    <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
                      <p className="text-muted-foreground">{result.judge_reason || 'Sem observações.'}</p>
                      <RuleBar sourceRule={scenario?.source_rule} goToSection={goToSection} />
                      {result.reply && (
                        <div className="rounded-lg bg-muted/40 p-3">
                          <p className="text-xs font-medium text-muted-foreground">Resposta observada</p>
                          <p className="mt-1 whitespace-pre-wrap text-foreground">{result.reply}</p>
                        </div>
                      )}
                      <ResultReview
                        result={result}
                        scenario={scenario}
                        saving={reviewingId === result.id}
                        onReview={(verdict, acceptScenario) => void handleReview(result, verdict, acceptScenario)}
                        onEditScenario={openEditDialog}
                        goToSection={goToSection}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="eia-card p-6">
        <div className="flex items-start gap-3"><Rocket className="mt-0.5 h-5 w-5 text-primary" /><div><h3 className="font-semibold text-foreground">Publicar uma nova versão</h3><p className="mt-1 text-sm text-muted-foreground">Só o rascunho aprovado muda o atendimento real. Você poderá consultar esta versão no histórico.</p></div></div>
        <div className="mt-5 max-w-xl"><label className="text-sm font-medium text-foreground">Nome da versão <span className="font-normal text-muted-foreground">(opcional)</span></label><input value={label} onChange={(event) => setLabel(event.target.value)} className={fieldClass} placeholder="Ex.: Qualificação de agosto" /></div>
        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4"><p className="text-sm font-medium text-foreground">O que mudou nesta versão</p>{changedAreas.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">{changedAreas.map((area) => <Badge key={area} variant="muted">{area}</Badge>)}</div> : <p className="mt-1 text-sm text-muted-foreground">Nenhuma diferença em relação à última versão publicada.</p>}</div>
        {compiledDraft && compiledDraft.issues.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-foreground">Alertas de configuração</p>
            {compiledDraft.issues.map((issue) => (
              <div key={`${issue.code}-${issue.field}`} className={cn('flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm', issue.severity === 'blocking' ? 'border-destructive/20 bg-destructive/5' : 'border-border bg-muted/30')}>
                <span className="flex min-w-0 items-start gap-2">
                  <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', issue.severity === 'blocking' ? 'text-destructive' : 'text-muted-foreground')} />
                  <span className="text-foreground">{issue.message}{issue.severity === 'blocking' && <span className="ml-1 text-xs text-destructive">Bloqueia a publicação.</span>}</span>
                </span>
                <Button variant="secondary" size="sm" onClick={() => goToSection(compilerIssueSection(issue.field))}>
                  Abrir configuração
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {latestRun?.warnings > 0 && runMatchesDraft && <label className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm"><input type="checkbox" className="mt-1" checked={acceptEvaluationWarnings} onChange={(event) => setAcceptEvaluationWarnings(event.target.checked)} /><span><strong>Revisei os alertas dos testes.</strong><span className="mt-1 block text-muted-foreground">Entendo o comportamento observado e aceito publicar esta versão.</span></span></label>}
        {localCompilerWarnings.length > 0 && <label className="mt-3 flex items-start gap-3 rounded-xl border border-border p-4 text-sm"><input type="checkbox" className="mt-1" checked={acceptCompilerWarnings} onChange={(event) => setAcceptCompilerWarnings(event.target.checked)} /><span><strong>Revisei {localCompilerWarnings.length === 1 ? 'o alerta de configuração listado acima' : `os ${localCompilerWarnings.length} alertas de configuração listados acima`}.</strong><span className="mt-1 block text-muted-foreground">Aceito publicar mesmo assim; os alertas continuam visíveis aqui.</span></span></label>}
        {!runMatchesDraft && <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-primary" />Execute os testes depois da última alteração para liberar a publicação.</p>}
        <div className="mt-5"><Button variant="primary" onClick={() => void handlePublish()} disabled={!canPublish || !draftSaved || !gateAllowsPublication || publishing || localCompilerBlocking.length > 0 || (localCompilerWarnings.length > 0 && !acceptCompilerWarnings) || (Boolean(latestRun?.warnings) && !acceptEvaluationWarnings)}>{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}{publishing ? 'Publicando…' : 'Publicar nova versão'}</Button></div>
      </div>

      {versions.length > 0 && <div className="eia-card p-6"><p className="eia-eyebrow">Histórico</p><h3 className="mt-1 text-lg font-semibold text-foreground">Versões publicadas</h3><p className="mt-1 text-sm text-muted-foreground">Restaurar cria um novo rascunho; nada muda no atendimento até você testar e publicar novamente.</p><div className="mt-5 space-y-2">{versions.map((version, index) => <div key={version.id} className="flex flex-col justify-between gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-foreground">Versão {version.versionNumber}</span>{index === 0 && <Badge variant="success">Ativa</Badge>}{version.source === 'restoration' && <Badge variant="muted">Restaurada</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{version.label || 'Sem nome'} · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(version.publishedAt))}</p></div><Button variant="secondary" size="sm" disabled={!canPublish || index === 0 || restoringId !== null || !draftSaved} title={!draftSaved ? 'Aguarde o rascunho terminar de salvar' : undefined} onClick={() => void handleRestore(version)}>{restoringId === version.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Restaurar no rascunho</Button></div>)}</div></div>}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetCaseForm(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editingId ? 'Editar situação de teste' : 'Adicionar situação de teste'}</DialogTitle><DialogDescription>Descreva uma mensagem realista e o comportamento que espera da agente.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <label className="block text-sm font-medium">Nome<input value={newCase.title} onChange={(event) => setNewCase((current) => ({ ...current, title: event.target.value }))} className={fieldClass} placeholder="Ex.: Cliente pergunta sobre desconto" /></label>
            <label className="block text-sm font-medium">Turnos anteriores <span className="font-normal text-muted-foreground">(opcional)</span><textarea value={newCase.previousTurns} onChange={(event) => setNewCase((current) => ({ ...current, previousTurns: event.target.value }))} className={cn(fieldClass, 'min-h-28 resize-y')} placeholder={'Cliente: Vi a apresentação e tenho uma dúvida.\nAgente: Claro. O que você gostaria de entender?\nCliente: Estou comparando duas opções.'} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Uma fala por linha, começando com Cliente: ou Agente:. A mensagem final é preenchida abaixo.</span></label>
            <label className="block text-sm font-medium">Mensagem do cliente<textarea value={newCase.query} onChange={(event) => setNewCase((current) => ({ ...current, query: event.target.value }))} className={cn(fieldClass, 'min-h-24 resize-y')} /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Comportamento esperado<select value={newCase.expected_behavior} onChange={(event) => setNewCase((current) => ({ ...current, expected_behavior: event.target.value as ExpectedBehavior }))} className={fieldClass}>{Object.entries(BEHAVIOR_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label className="block text-sm font-medium">Importância<select value={newCase.severity} onChange={(event) => setNewCase((current) => ({ ...current, severity: event.target.value as 'critical' | 'warning' }))} className={fieldClass}><option value="critical">Crítica — bloqueia publicação</option><option value="warning">Alerta — permite aceite</option></select></label></div>
            {newCase.expected_behavior === 'responder' && <label className="block text-sm font-medium">Informação que deve aparecer<textarea value={newCase.expected_content} onChange={(event) => setNewCase((current) => ({ ...current, expected_content: event.target.value }))} className={cn(fieldClass, 'min-h-20 resize-y')} /></label>}
          </div>
          <DialogFooter><Button variant="secondary" onClick={() => { setDialogOpen(false); resetCaseForm(); }}>Cancelar</Button><Button variant="primary" onClick={() => void handleSaveCase()}>{editingId ? 'Salvar alterações' : 'Adicionar'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
