import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  buildGoLiveSteps,
  fetchSetupReport,
  type CheckAction,
  type CheckStatus,
  type GoLiveStep,
  type GoLiveStepId,
  type SetupReport,
} from '@/services/goLive';

export interface OnboardingStep {
  id: GoLiveStepId;
  title: string;
  description: string;
  isComplete: boolean;
  status: CheckStatus;
  /** Situação real vinda da verificação; vazio quando ela não rodou. */
  message: string;
  details?: string;
  action?: CheckAction;
}

export interface OnboardingStatus {
  loading: boolean;
  /** true quando a consulta de status falhou (rede/RLS) — nesse caso o app NÃO
   *  deve auto-abrir o wizard: estado desconhecido não é "não onboarded". */
  loadFailed: boolean;
  isComplete: boolean;
  isDismissed: boolean;
  settingsId: string | null;
  companyName: string;
  sdrName: string;
  steps: OnboardingStep[];
  completionPercentage: number;
  /** Relatório da verificação real (edge function validate-setup). */
  report: SetupReport | null;
  reportLoading: boolean;
  reportError: string | null;
  /** Os 6 itens do checklist Colocar no ar, com situação e ação. */
  goLiveSteps: GoLiveStep[];
  /** true só quando os 6 itens estão verdes. */
  goLiveReady: boolean;
  refreshReport: (force?: boolean) => Promise<void>;
  markCompleted: () => Promise<boolean>;
  dismiss: () => Promise<boolean>;
  reopen: () => Promise<void>;
  /** Alias de reopen — compatibilidade com Settings.tsx (Refazer onboarding). */
  resetWizard: () => Promise<void>;
  refetch: () => Promise<void>;
}

// Sincroniza todas as instâncias do hook (banner, layout, wizard) sem reload.
const listeners = new Set<() => void>();

/** Avisa todas as instâncias do hook para rebuscar o estado do onboarding. */
export function notifyOnboardingChange() {
  listeners.forEach((fn) => fn());
  void refreshSetupReport(true);
}

// ---------------------------------------------------------------------------
// Relatório da verificação — cache de módulo
//
// O hook é montado em quatro lugares ao mesmo tempo (layout, banner, wizard,
// configurações). Sem este cache, cada montagem dispararia uma invocação da
// validate-setup, que por sua vez faz pings de rede em OpenAI e Meta.
// ---------------------------------------------------------------------------

interface ReportState {
  report: SetupReport | null;
  loading: boolean;
  error: string | null;
}

const REPORT_TTL_MS = 30_000;

let reportState: ReportState = { report: null, loading: false, error: null };
let reportFetchedAt = 0;
/** De quem é o relatório em cache — trocar de conta não pode herdar o anterior. */
let reportUserId: string | null = null;
let reportInFlight: Promise<void> | null = null;
const reportSubscribers = new Set<(state: ReportState) => void>();

function publishReportState(patch: Partial<ReportState>) {
  reportState = { ...reportState, ...patch };
  reportSubscribers.forEach((fn) => fn(reportState));
}

export async function refreshSetupReport(force = false): Promise<void> {
  const isFresh = reportState.report && Date.now() - reportFetchedAt < REPORT_TTL_MS;
  if (!force && isFresh) return;
  if (reportInFlight) return reportInFlight;

  publishReportState({ loading: true });
  reportInFlight = fetchSetupReport()
    .then((report) => {
      reportFetchedAt = Date.now();
      publishReportState({ report, error: null, loading: false });
    })
    .catch((error: unknown) => {
      console.error('[useOnboardingStatus] Falha ao verificar a configuração:', error);
      publishReportState({
        error: error instanceof Error ? error.message : 'Falha ao verificar a configuração.',
        loading: false,
      });
    })
    .finally(() => {
      reportInFlight = null;
    });

  return reportInFlight;
}

interface OnboardingData {
  settingsId: string | null;
  companyName: string;
  sdrName: string;
  completedAt: string | null;
  dismissedAt: string | null;
  hasWhatsappCloud: boolean;
  hasStructuredAgent: boolean;
  hasActiveConnection: boolean;
}

const EMPTY_DATA: OnboardingData = {
  settingsId: null,
  companyName: '',
  sdrName: '',
  completedAt: null,
  dismissedAt: null,
  hasWhatsappCloud: false,
  hasStructuredAgent: false,
  hasActiveConnection: false,
};

/** Quando a verificação não respondeu, o que dá para afirmar vem do banco:
 *  um sinal positivo local vale; a ausência dele fica como desconhecida. */
function localFallbackComplete(id: GoLiveStepId, data: OnboardingData): boolean {
  switch (id) {
    case 'identidade':
      return Boolean(data.companyName && data.sdrName);
    case 'canal':
      return data.hasWhatsappCloud || data.hasActiveConnection;
    case 'agente':
      return data.hasStructuredAgent;
    default:
      return false;
  }
}

export function useOnboardingStatus(): OnboardingStatus {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [data, setData] = useState<OnboardingData>(EMPTY_DATA);
  const [reportSnapshot, setReportSnapshot] = useState<ReportState>(reportState);
  const hasLoadedRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (!hasLoadedRef.current) setLoading(true);

    try {
      const [settingsRes, connectionsRes, draftRes] = await Promise.all([
        (supabase as any)
          .from('lara_settings_public')
          .select('id, company_name, sdr_name, onboarding_completed_at, onboarding_dismissed_at, has_whatsapp_cloud')
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from('channel_connections')
          .select('id')
          .eq('status', 'active')
          .limit(1),
        (supabase as any)
          .from('agent_drafts')
          .select('config')
          .limit(1)
          .maybeSingle(),
      ]);

      // supabase-js não lança em erro de query — sem esta checagem, uma falha
      // de rede/RLS viraria "não onboarded" e o wizard abriria à toa
      if (settingsRes.error) throw settingsRes.error;
      if (connectionsRes.error) throw connectionsRes.error;
      if (draftRes.error) throw draftRes.error;

      const settings = settingsRes.data as {
        id: string;
        company_name: string | null;
        sdr_name: string | null;
        onboarding_completed_at: string | null;
        onboarding_dismissed_at: string | null;
        has_whatsapp_cloud: boolean | null;
      } | null;
      const draftConfig = draftRes.data?.config as Record<string, any> | null | undefined;
      const identity = draftConfig?.identity as Record<string, unknown> | undefined;

      setData({
        settingsId: settings?.id ?? null,
        companyName: settings?.company_name ?? '',
        sdrName: settings?.sdr_name ?? '',
        completedAt: settings?.onboarding_completed_at ?? null,
        dismissedAt: settings?.onboarding_dismissed_at ?? null,
        hasWhatsappCloud: !!settings?.has_whatsapp_cloud,
        // Mesmo critério de "identidade pronta" da visão geral da agente: sem
        // isso, o passo 1 do onboarding (nome+empresa) marcava sozinho o passo
        // "Agente" como configurado, e o checklist mentia.
        hasStructuredAgent: Boolean(
          identity?.agentName
          && identity?.companyName
          && identity?.role
          && identity?.whatCompanySells
          && identity?.primaryAudience,
        ),
        hasActiveConnection: (connectionsRes.data?.length ?? 0) > 0,
      });
      hasLoadedRef.current = true;
      setLoadFailed(false);
    } catch (error) {
      console.error('[useOnboardingStatus] Erro ao buscar status:', error);
      if (!hasLoadedRef.current) setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Registra a instância no broadcast global
  useEffect(() => {
    listeners.add(fetchStatus);
    return () => {
      listeners.delete(fetchStatus);
    };
  }, [fetchStatus]);

  // Assina o relatório compartilhado e garante a primeira carga.
  useEffect(() => {
    const subscriber = (state: ReportState) => setReportSnapshot(state);
    reportSubscribers.add(subscriber);
    setReportSnapshot(reportState);
    return () => {
      reportSubscribers.delete(subscriber);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const userChanged = reportUserId !== user.id;
    reportUserId = user.id;
    if (userChanged) {
      reportFetchedAt = 0;
      publishReportState({ report: null, error: null });
    }
    void refreshSetupReport(userChanged);
  }, [user]);

  const refreshReport = useCallback(async (force = true) => {
    await refreshSetupReport(force);
  }, []);

  const updateOnboarding = useCallback(
    async (patch: Record<string, string | null>): Promise<boolean> => {
      if (!data.settingsId) {
        toast.error('Configurações não encontradas. Recarregue a página e tente de novo.');
        return false;
      }
      const { error } = await (supabase as any)
        .from('lara_settings')
        .update(patch)
        .eq('id', data.settingsId);

      if (error) {
        console.error('[useOnboardingStatus] Erro ao atualizar onboarding:', error);
        toast.error('Erro ao atualizar o onboarding: ' + error.message);
        return false;
      }
      notifyOnboardingChange();
      return true;
    },
    [data.settingsId]
  );

  const markCompleted = useCallback(async (): Promise<boolean> => {
    return updateOnboarding({
      onboarding_completed_at: new Date().toISOString(),
      onboarding_dismissed_at: null,
    });
  }, [updateOnboarding]);

  const dismiss = useCallback(async (): Promise<boolean> => {
    return updateOnboarding({
      onboarding_dismissed_at: new Date().toISOString(),
    });
  }, [updateOnboarding]);

  const reopen = useCallback(async () => {
    await updateOnboarding({
      onboarding_completed_at: null,
      onboarding_dismissed_at: null,
    });
  }, [updateOnboarding]);

  const goLiveSteps = buildGoLiveSteps(reportSnapshot.report).map((step) => {
    if (step.status !== 'unknown') return step;
    // Verificação indisponível: só um sinal positivo do banco pode marcar verde.
    const complete = localFallbackComplete(step.id, data);
    return complete
      ? { ...step, status: 'ok' as CheckStatus, isComplete: true, message: 'Confirmado pelos dados salvos.' }
      : { ...step, message: 'Verificação indisponível agora.' };
  });

  const steps: OnboardingStep[] = goLiveSteps.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    isComplete: step.isComplete,
    status: step.status,
    message: step.message,
    details: step.details,
    action: step.action,
  }));

  const completedCount = steps.filter((s) => s.isComplete).length;
  const completionPercentage = Math.round((completedCount / steps.length) * 100);

  return {
    loading,
    loadFailed,
    isComplete: !!data.completedAt,
    isDismissed: !!data.dismissedAt,
    settingsId: data.settingsId,
    companyName: data.companyName,
    sdrName: data.sdrName,
    steps,
    completionPercentage,
    report: reportSnapshot.report,
    reportLoading: reportSnapshot.loading,
    reportError: reportSnapshot.error,
    goLiveSteps,
    goLiveReady: completedCount === steps.length,
    refreshReport,
    markCompleted,
    dismiss,
    reopen,
    resetWizard: reopen,
    refetch: fetchStatus,
  };
}
