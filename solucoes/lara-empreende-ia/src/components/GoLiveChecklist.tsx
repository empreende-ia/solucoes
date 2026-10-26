import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/Button';
import { SystemHealthCard } from '@/components/SystemHealthCard';
import { TestLeadPanel } from '@/components/TestLeadPanel';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { actionHref, diagnosticResults, type CheckStatus } from '@/services/goLive';

interface GoLiveChecklistProps {
  /** Reabre o assistente de configuração passo a passo. */
  onOpenWizard?: () => void;
}

const REFRESH_INTERVAL_MS = 60000;

function stepIcon(status: CheckStatus) {
  switch (status) {
    case 'ok':
      return <CheckCircle className="h-5 w-5 text-success" aria-hidden="true" />;
    case 'error':
      return <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />;
    default:
      return <Circle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />;
  }
}

function stepStatusLabel(status: CheckStatus) {
  switch (status) {
    case 'ok':
      return 'Pronto';
    case 'error':
      return 'Bloqueia o atendimento';
    case 'warning':
      return 'Pendente';
    default:
      return 'Não verificado';
  }
}

/**
 * Uma lista só, verdadeira, do que falta para a Lara atender. Substitui o banner
 * de 3 passos e o card de saúde: os dois discordavam entre si e nenhum juntava
 * chave de IA com versão publicada, que é a dupla que decide se um lead é
 * respondido.
 */
export const GoLiveChecklist: React.FC<GoLiveChecklistProps> = ({ onOpenWizard }) => {
  const {
    goLiveSteps,
    goLiveReady,
    report,
    reportLoading,
    reportError,
    refreshReport,
  } = useOnboardingStatus();
  const [expanded, setExpanded] = useState(false);

  // Enquanto a aba está aberta, a lista se atualiza sozinha: a pessoa conserta
  // em outra tela e volta aqui sem precisar recarregar.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshReport(true);
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshReport]);

  const readyCount = goLiveSteps.filter((step) => step.isComplete).length;
  const pendingCount = goLiveSteps.length - readyCount;
  const percentage = Math.round((readyCount / goLiveSteps.length) * 100);
  const diagnostics = useMemo(() => diagnosticResults(report), [report]);
  const verifiedAt = report?.generatedAt
    ? new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(report.generatedAt))
    : null;

  return (
    <section className="eia-card p-6" aria-labelledby="go-live-title">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eia-eyebrow">Colocar no ar</p>
          <h2 id="go-live-title" className="text-lg font-semibold text-foreground">
            {goLiveReady ? 'A Lara está pronta para atender.' : 'O que falta para a Lara atender.'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {goLiveReady
              ? 'Os seis itens estão em ordem. A lista continua conferindo sozinha a cada minuto.'
              : `${pendingCount} ${pendingCount === 1 ? 'item pendente' : 'itens pendentes'} de ${goLiveSteps.length}. Cada um tem o botão que resolve.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="eia-pill border border-border bg-secondary text-muted-foreground">
            {readyCount} de {goLiveSteps.length} prontos
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refreshReport(true)}
            disabled={reportLoading}
            aria-label="Verificar de novo"
          >
            {reportLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Verificar
          </Button>
        </div>
      </header>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {reportError && (
        <div className="mt-4 rounded-xl border border-border bg-secondary px-4 py-3">
          <p className="text-sm text-foreground">Não foi possível verificar a configuração agora.</p>
          <p className="mt-1 text-xs text-muted-foreground">{reportError}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void refreshReport(true)}
            disabled={reportLoading}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar de novo
          </Button>
        </div>
      )}

      <ol className="mt-5 space-y-2">
        {goLiveSteps.map((step, index) => {
          const href = actionHref(step.action);
          const isTestStep = step.id === 'teste';
          return (
            <li
              key={step.id}
              className="rounded-xl border border-border bg-secondary px-4 py-3"
            >
              <div className="flex flex-wrap items-start gap-3">
                <span className="mt-0.5 shrink-0">{stepIcon(step.status)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {index + 1}. {step.title}
                    </p>
                    <span className="eia-pill border border-border bg-card text-muted-foreground">
                      {stepStatusLabel(step.status)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {step.isComplete ? step.message || step.description : step.description}
                  </p>
                  {!step.isComplete && step.message && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{step.message}</p>
                  )}
                  {!step.isComplete && step.details && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{step.details}</p>
                  )}
                </div>

                {href && !isTestStep && (
                  <Link to={href} className="shrink-0">
                    <Button variant={step.isComplete ? 'ghost' : 'secondary'} size="sm">
                      {step.action?.label ?? 'Abrir'}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </Link>
                )}
              </div>

              {isTestStep && (
                <div className="mt-3 border-t border-border pt-3">
                  <TestLeadPanel
                    initialConversationId={report?.testConversationId ?? null}
                    onChanged={() => void refreshReport(true)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((visible) => !visible)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={expanded}
        >
          {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        <div className="flex flex-wrap items-center gap-3">
          {verifiedAt && (
            <span className="text-xs text-muted-foreground">Verificado às {verifiedAt}.</span>
          )}
          {onOpenWizard && (
            <Button variant="ghost" size="sm" onClick={onOpenWizard}>
              Abrir assistente
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3">
          <SystemHealthCard results={diagnostics} />
        </div>
      )}
    </section>
  );
};
