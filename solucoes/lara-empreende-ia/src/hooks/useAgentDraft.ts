import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentConfig } from '@/domain/agent-config';
import { formatConfigError } from '@/lib/configErrors';
import {
  AgentDraftConflictError,
  getCurrentAgentContext,
  listAgentVersions,
  saveAgentDraft,
  type AgentContext,
  type AgentVersion,
} from '@/services/agent-config';

export type AgentDraftSaveStatus =
  | 'loading'
  | 'saved'
  | 'unsaved'
  | 'saving'
  | 'conflict'
  | 'error';

export type AgentConflictResolution = 'keepMine' | 'takeServer';

interface UseAgentDraftOptions {
  enabled?: boolean;
  autosaveDelayMs?: number;
}

export function useAgentDraft({
  enabled = true,
  autosaveDelayMs = 800,
}: UseAgentDraftOptions = {}) {
  const [context, setContext] = useState<AgentContext | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [publishedVersion, setPublishedVersion] = useState<AgentVersion | null>(null);
  const [status, setStatus] = useState<AgentDraftSaveStatus>('loading');
  const [error, setError] = useState<Error | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configRef = useRef<AgentConfig | null>(null);
  const revisionRef = useRef(0);
  const publishedConfigRef = useRef<AgentConfig | null>(null);
  const savingRef = useRef(false);
  const dirtyGenerationRef = useRef(0);
  // Espelho do status para callbacks estáveis: decisões de salvar/editar leem o
  // valor atual em vez de um closure que pode estar defasado.
  const statusRef = useRef<AgentDraftSaveStatus>('loading');

  const setStatusTracked = useCallback((next: AgentDraftSaveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    if (!enabled) return;
    clearTimer();
    setStatusTracked('loading');
    setError(null);

    try {
      const loaded = await getCurrentAgentContext();
      const publishedVersion = loaded?.publishedVersionId
        ? (await listAgentVersions(loaded.agentId)).find((version) => version.id === loaded.publishedVersionId)
        : null;
      setContext(loaded);
      setConfig(loaded?.draftConfig ?? null);
      setPublishedVersion(publishedVersion ?? null);
      configRef.current = loaded?.draftConfig ?? null;
      revisionRef.current = loaded?.draftRevision ?? 0;
      publishedConfigRef.current = publishedVersion?.config ?? null;
      dirtyGenerationRef.current = 0;
      setStatusTracked('saved');
    } catch (cause) {
      const nextError = cause instanceof Error ? cause : new Error('Falha ao carregar o rascunho.');
      setError(nextError);
      setStatusTracked('error');
    }
  }, [clearTimer, enabled, setStatusTracked]);

  const saveNow = useCallback(async (options?: { throwOnError?: boolean }): Promise<boolean> => {
    if (statusRef.current === 'conflict') {
      if (options?.throwOnError) throw new Error('Resolva o conflito de edição antes de salvar.');
      return false;
    }
    if (!context || !configRef.current) {
      if (options?.throwOnError) throw new Error('O rascunho não está disponível para salvar.');
      return false;
    }
    if (savingRef.current) {
      if (options?.throwOnError) throw new Error('Aguarde o salvamento atual terminar e tente novamente.');
      return false;
    }

    clearTimer();
    savingRef.current = true;
    const savingGeneration = dirtyGenerationRef.current;
    const savingConfig = configRef.current;
    setStatusTracked('saving');
    setError(null);

    try {
      const saved = await saveAgentDraft(context.agentId, savingConfig, revisionRef.current);
      revisionRef.current = saved.revision;
      setContext((current) => current ? {
        ...current,
        draftConfig: saved.config,
        draftRevision: saved.revision,
        baseVersionId: saved.baseVersionId,
        draftUpdatedAt: saved.updatedAt,
      } : current);

      if (dirtyGenerationRef.current === savingGeneration) {
        setStatusTracked('saved');
      } else {
        setStatusTracked('unsaved');
        timerRef.current = setTimeout(() => void saveNow(), autosaveDelayMs);
      }
      return true;
    } catch (cause) {
      const nextError = new Error(formatConfigError(cause, 'Falha ao salvar o rascunho.'));
      setError(nextError);
      setStatusTracked(cause instanceof AgentDraftConflictError ? 'conflict' : 'error');
      if (options?.throwOnError) throw nextError;
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [autosaveDelayMs, clearTimer, context, setStatusTracked]);

  const replaceConfig = useCallback((nextConfig: AgentConfig) => {
    if (!context || context.memberRole === 'observer') return;
    configRef.current = nextConfig;
    setConfig(nextConfig);
    dirtyGenerationRef.current += 1;
    clearTimer();
    // Em conflito a pessoa continua editando localmente — teclas nunca são
    // engolidas — mas o autosave fica suspenso até ela escolher um lado.
    if (statusRef.current === 'conflict') return;
    setStatusTracked('unsaved');
    timerRef.current = setTimeout(() => void saveNow(), autosaveDelayMs);
  }, [autosaveDelayMs, clearTimer, context, saveNow, setStatusTracked]);

  const updateConfig = useCallback((updater: (current: AgentConfig) => AgentConfig) => {
    if (!configRef.current) return;
    replaceConfig(updater(configRef.current));
  }, [replaceConfig]);

  const updateConfigAndSave = useCallback(async (
    updater: (current: AgentConfig) => AgentConfig,
  ): Promise<void> => {
    if (!configRef.current) throw new Error('O rascunho não está disponível para atualizar.');
    replaceConfig(updater(configRef.current));
    await saveNow({ throwOnError: true });
  }, [replaceConfig, saveNow]);

  /**
   * Sai do conflito por decisão explícita: "keepMine" adota a revisão atual do
   * servidor e grava a configuração local por cima; "takeServer" descarta o que
   * está na tela e recarrega o rascunho salvo pela outra sessão.
   */
  const resolveConflict = useCallback(async (resolution: AgentConflictResolution): Promise<void> => {
    if (statusRef.current !== 'conflict') return;
    if (resolution === 'takeServer') {
      await load();
      return;
    }
    if (!configRef.current) {
      await load();
      return;
    }
    try {
      const latest = await getCurrentAgentContext();
      if (!latest) throw new Error('Não foi possível carregar a configuração atual.');
      revisionRef.current = latest.draftRevision;
      // Relê o config DEPOIS do round-trip: teclas digitadas enquanto o
      // servidor respondia já atualizaram configRef, e impor o snapshot
      // capturado antes do await as engoliria — exatamente o que o contrato
      // deste hook promete que não acontece.
      const mine = configRef.current;
      setContext({ ...latest, draftConfig: mine });
      setConfig(mine);
      setError(null);
      setStatusTracked('unsaved');
      await saveNow();
    } catch (cause) {
      const nextError = cause instanceof Error ? cause : new Error('Não foi possível resolver o conflito.');
      setError(nextError);
      setStatusTracked('error');
    }
  }, [load, saveNow, setStatusTracked]);

  useEffect(() => {
    void load();
    return clearTimer;
  }, [clearTimer, load]);

  // Fechar a aba dentro da janela do autosave (ou durante um save) avisaria nada
  // e perderia a última edição; o navegador pede confirmação nesses instantes.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      // 'error' e 'conflict' também são estados com edição não persistida:
      // fechar a aba neles perde a última edição do mesmo jeito.
      if (['unsaved', 'saving', 'error', 'conflict'].includes(statusRef.current)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return {
    context,
    config,
    publishedVersion,
    status,
    error,
    isEditable: Boolean(context && context.memberRole !== 'observer'),
    hasUnpublishedChanges: Boolean(
      context && config && (
        !publishedConfigRef.current
        || JSON.stringify(config) !== JSON.stringify(publishedConfigRef.current)
      )
    ),
    updateConfig,
    updateConfigAndSave,
    replaceConfig,
    saveNow,
    resolveConflict,
    reload: load,
  };
}
