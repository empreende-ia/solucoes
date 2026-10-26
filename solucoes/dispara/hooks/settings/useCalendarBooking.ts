'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CalendarBookingConfig } from '../../types';

export const CALENDAR_BOOKING_FALLBACK: CalendarBookingConfig = {
  timezone: 'America/Sao_Paulo',
  slotDurationMinutes: 30,
  slotBufferMinutes: 10,
  workingHours: [
    { day: 'mon', enabled: true, start: '09:00', end: '18:00' },
    { day: 'tue', enabled: true, start: '09:00', end: '18:00' },
    { day: 'wed', enabled: true, start: '09:00', end: '18:00' },
    { day: 'thu', enabled: true, start: '09:00', end: '18:00' },
    { day: 'fri', enabled: true, start: '09:00', end: '18:00' },
    { day: 'sat', enabled: false, start: '09:00', end: '13:00' },
    { day: 'sun', enabled: false, start: '09:00', end: '13:00' },
  ],
  minAdvanceHours: 4,      // 4 horas de antecedência mínima
  maxAdvanceDays: 14,      // Até 2 semanas no futuro
  allowSimultaneous: false, // Não permitir agendamentos simultâneos
  externalWebhookUrl: '', // Webhook externo opcional
};

export const MIN_ADVANCE_OPTIONS = [
  { value: 0, label: 'Não limitar' },
  { value: 1, label: '1 hora' },
  { value: 2, label: '2 horas' },
  { value: 3, label: '3 horas' },
  { value: 4, label: '4 horas' },
  { value: 12, label: '12 horas' },
  { value: 24, label: '24 horas' },
];

export const MAX_ADVANCE_OPTIONS = [
  { value: 0, label: 'Não limitar' },
  { value: 1, label: 'Apenas hoje' },
  { value: 2, label: 'Entre hoje e amanhã' },
  { value: 7, label: 'Até uma semana' },
  { value: 14, label: 'Até duas semanas' },
  { value: 30, label: 'Até um mês' },
];

export const CALENDAR_WEEK_LABELS: Record<string, string> = {
  mon: 'Seg',
  tue: 'Ter',
  wed: 'Qua',
  thu: 'Qui',
  fri: 'Sex',
  sat: 'Sab',
  sun: 'Dom',
};

export interface CalendarAuthStatus {
  connected: boolean;
  calendar?: {
    calendarId?: string | null;
    calendarSummary?: string | null;
    calendarTimeZone?: string | null;
    accountEmail?: string | null;
  } | null;
  channel?: {
    id?: string;
    expiration?: number | null;
    lastNotificationAt?: string | null;
  } | null;
  hasRefreshToken?: boolean;
  expiresAt?: number | null;
}

export interface CalendarCredsStatus {
  clientId: string | null;
  source: 'db' | 'env' | 'none';
  hasClientSecret: boolean;
  isConfigured: boolean;
}

export interface CalendarListItem {
  id: string;
  summary: string;
  timeZone?: string | null;
  primary?: boolean;
}

export interface UseCalendarBookingProps {
  isConnected: boolean;
  calendarBooking?: {
    ok: boolean;
    source?: 'db' | 'default';
    config?: CalendarBookingConfig;
  } | null;
  calendarBookingLoading?: boolean;
  saveCalendarBooking?: (data: Partial<CalendarBookingConfig>) => Promise<void>;
  isSavingCalendarBooking?: boolean;
}

export interface UseCalendarBookingReturn {
  // Config state
  calendarConfig: CalendarBookingConfig;
  isEditingCalendarBooking: boolean;
  setIsEditingCalendarBooking: (editing: boolean) => void;
  calendarDraft: CalendarBookingConfig;
  updateCalendarDraft: (patch: Partial<CalendarBookingConfig>) => void;
  updateWorkingHours: (
    day: string,
    patch: Partial<{ enabled: boolean; start: string; end: string; slots: Array<{ start: string; end: string }> }>
  ) => void;
  handleSaveCalendarBooking: () => Promise<void>;

  // Auth status
  calendarAuthStatus: CalendarAuthStatus | null;
  calendarAuthLoading: boolean;
  calendarAuthError: string | null;
  fetchCalendarAuthStatus: () => Promise<void>;

  // Creds status
  calendarCredsStatus: CalendarCredsStatus | null;
  calendarCredsLoading: boolean;
  calendarCredsError: string | null;
  calendarCredsSaving: boolean;
  calendarClientIdDraft: string;
  setCalendarClientIdDraft: (value: string) => void;
  calendarClientSecretDraft: string;
  setCalendarClientSecretDraft: (value: string) => void;
  fetchCalendarCredsStatus: () => Promise<void>;
  handleSaveCalendarCreds: () => Promise<void>;
  handleRemoveCalendarCreds: () => Promise<void>;

  // Calendar list
  calendarList: CalendarListItem[];
  calendarListLoading: boolean;
  calendarListError: string | null;
  calendarSelectionId: string;
  setCalendarSelectionId: (id: string) => void;
  calendarSelectionSaving: boolean;
  calendarListQuery: string;
  setCalendarListQuery: (query: string) => void;
  filteredCalendarList: CalendarListItem[];
  fetchCalendarList: () => Promise<void>;
  handleSaveCalendarSelection: () => Promise<boolean>;

  // Wizard state
  isCalendarWizardOpen: boolean;
  setIsCalendarWizardOpen: (open: boolean) => void;
  calendarWizardStep: number;
  setCalendarWizardStep: (step: number) => void;
  calendarWizardError: string | null;
  setCalendarWizardError: (error: string | null) => void;
  handleCalendarWizardStepClick: (step: number) => void;
  handleCalendarWizardBack: () => void;
  handleCalendarWizardNext: () => Promise<void>;

  // Connect/Disconnect
  calendarConnectLoading: boolean;
  handleConnectCalendar: () => void;
  handleDisconnectCalendar: () => Promise<void>;

  // Test event
  calendarTestLoading: boolean;
  calendarTestResult: { ok: boolean; link?: string | null } | null;
  handleCalendarTestEvent: () => Promise<boolean>;

  // Base URL
  appOrigin: string;
  calendarBaseUrlDraft: string;
  setCalendarBaseUrlDraft: (url: string) => void;
  calendarBaseUrlEditing: boolean;
  setCalendarBaseUrlEditing: (editing: boolean) => void;

  // Computed values
  calendarBaseUrl: string;
  calendarRedirectUrl: string;
  calendarWebhookUrl: string;
  calendarStep: number;
  calendarCredsSourceLabel: string;
  calendarClientIdValid: boolean;
  calendarClientSecretValid: boolean;
  calendarCredsFormValid: boolean;
  selectedCalendar: CalendarListItem | undefined;
  selectedCalendarTimeZone: string;
  hasCalendarSelection: boolean;
  calendarWizardCanContinue: boolean;

  // Actions
  handlePrimaryCalendarAction: () => void;
  handleCopyCalendarValue: (value: string, label: string) => Promise<void>;
  handleCopyCalendarBundle: () => Promise<void>;
}

const CALENDAR_WIZARD_STORAGE_KEY = 'gcWizardProgress';

export function useCalendarBooking({
  isConnected,
  calendarBooking,
  saveCalendarBooking,
}: UseCalendarBookingProps): UseCalendarBookingReturn {
  // Config state
  const calendarConfig = calendarBooking?.config || CALENDAR_BOOKING_FALLBACK;
  const [isEditingCalendarBooking, setIsEditingCalendarBooking] = useState(false);
  const [calendarDraft, setCalendarDraft] = useState<CalendarBookingConfig>(calendarConfig);

  // Auth status
  const [calendarAuthStatus, setCalendarAuthStatus] = useState<CalendarAuthStatus | null>(null);
  const [calendarAuthLoading, setCalendarAuthLoading] = useState(false);
  const [calendarAuthError, setCalendarAuthError] = useState<string | null>(null);

  // Creds status
  const [calendarCredsStatus, setCalendarCredsStatus] = useState<CalendarCredsStatus | null>(null);
  const [calendarCredsLoading, setCalendarCredsLoading] = useState(false);
  const [calendarCredsSaving, setCalendarCredsSaving] = useState(false);
  const [calendarCredsError, setCalendarCredsError] = useState<string | null>(null);
  const [calendarClientIdDraft, setCalendarClientIdDraft] = useState('');
  const [calendarClientSecretDraft, setCalendarClientSecretDraft] = useState('');

  // Base URL
  const [appOrigin, setAppOrigin] = useState('');
  const [calendarBaseUrlDraft, setCalendarBaseUrlDraft] = useState('');
  const [calendarBaseUrlEditing, setCalendarBaseUrlEditing] = useState(false);

  // Wizard state
  const [isCalendarWizardOpen, setIsCalendarWizardOpen] = useState(false);
  const [calendarWizardStep, setCalendarWizardStep] = useState(0);
  const [calendarWizardError, setCalendarWizardError] = useState<string | null>(null);
  const [calendarConnectLoading, setCalendarConnectLoading] = useState(false);

  // Test event
  const [calendarTestLoading, setCalendarTestLoading] = useState(false);
  const [calendarTestResult, setCalendarTestResult] = useState<{ ok: boolean; link?: string | null } | null>(null);

  // Calendar list
  const [calendarList, setCalendarList] = useState<CalendarListItem[]>([]);
  const [calendarListLoading, setCalendarListLoading] = useState(false);
  const [calendarListError, setCalendarListError] = useState<string | null>(null);
  const [calendarSelectionId, setCalendarSelectionId] = useState('');
  const [calendarSelectionSaving, setCalendarSelectionSaving] = useState(false);
  const [calendarListQuery, setCalendarListQuery] = useState('');

  // Sync draft with config when not editing
  useEffect(() => {
    if (!isEditingCalendarBooking) {
      setCalendarDraft(calendarConfig);
    }
  }, [calendarConfig, isEditingCalendarBooking]);

  // Set app origin
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppOrigin(window.location.origin);
    }
  }, []);

  // Set default base URL from origin
  useEffect(() => {
    if (!appOrigin) return;
    setCalendarBaseUrlDraft((prev) => prev || appOrigin);
  }, [appOrigin]);

  // Sync calendar selection with auth status
  useEffect(() => {
    const calendarId = calendarAuthStatus?.calendar?.calendarId;
    if (calendarId) {
      setCalendarSelectionId(calendarId);
    }
  }, [calendarAuthStatus?.calendar?.calendarId]);

  // Fetch auth status
  const fetchCalendarAuthStatus = useCallback(async () => {
    if (!isConnected) return;
    setCalendarAuthLoading(true);
    setCalendarAuthError(null);
    try {
      const response = await fetch('/api/integrations/google-calendar/status');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as Record<string, unknown>)?.error as string || 'Falha ao carregar status');
      }
      setCalendarAuthStatus(data as CalendarAuthStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao carregar status';
      setCalendarAuthError(message);
      setCalendarWizardError(message);
      setCalendarAuthStatus(null);
    } finally {
      setCalendarAuthLoading(false);
    }
  }, [isConnected]);

  // Fetch creds status
  const fetchCalendarCredsStatus = useCallback(async () => {
    setCalendarCredsLoading(true);
    setCalendarCredsError(null);
    try {
      const response = await fetch('/api/settings/google-calendar');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as Record<string, unknown>)?.error as string || 'Falha ao carregar credenciais');
      }
      setCalendarCredsStatus(data as CalendarCredsStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao carregar credenciais';
      setCalendarCredsError(message);
      setCalendarCredsStatus(null);
    } finally {
      setCalendarCredsLoading(false);
    }
  }, []);

  // Fetch calendar list
  const fetchCalendarList = useCallback(async () => {
    if (!calendarAuthStatus?.connected) return;
    setCalendarListLoading(true);
    setCalendarListError(null);
    try {
      const response = await fetch('/api/integrations/google-calendar/calendars');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as Record<string, unknown>)?.error as string || 'Falha ao listar calendarios');
      }
      const calendars = Array.isArray((data as Record<string, unknown>)?.calendars)
        ? (data as { calendars: CalendarListItem[] }).calendars
        : [];
      const sortedCalendars = [...calendars].sort((a, b) => {
        const aPrimary = Boolean(a?.primary);
        const bPrimary = Boolean(b?.primary);
        if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
        const aLabel = String(a?.summary || a?.id || '');
        const bLabel = String(b?.summary || b?.id || '');
        return aLabel.localeCompare(bLabel, 'pt-BR');
      });
      setCalendarList(sortedCalendars);
      if (!calendarSelectionId && sortedCalendars.length) {
        setCalendarSelectionId(String(sortedCalendars[0].id));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao listar calendarios';
      setCalendarListError(message);
      setCalendarWizardError(message);
      setCalendarList([]);
    } finally {
      setCalendarListLoading(false);
    }
  }, [calendarAuthStatus?.connected, calendarSelectionId]);

  // Initial fetches
  useEffect(() => {
    fetchCalendarAuthStatus();
  }, [fetchCalendarAuthStatus]);

  useEffect(() => {
    fetchCalendarCredsStatus();
  }, [fetchCalendarCredsStatus]);

  // Fetch calendar list when wizard opens and connected
  useEffect(() => {
    if (isCalendarWizardOpen && calendarAuthStatus?.connected) {
      fetchCalendarList();
    }
  }, [isCalendarWizardOpen, calendarAuthStatus?.connected, fetchCalendarList]);

  // Reset connect loading when connected
  useEffect(() => {
    if (calendarAuthStatus?.connected) {
      setCalendarConnectLoading(false);
    }
  }, [calendarAuthStatus?.connected]);

  // Sync creds draft with status
  useEffect(() => {
    setCalendarClientIdDraft(calendarCredsStatus?.clientId || '');
    setCalendarClientSecretDraft('');
  }, [calendarCredsStatus]);

  // Computed values
  const calendarBaseUrl = (calendarBaseUrlDraft || appOrigin || '').replace(/\/$/, '');
  const calendarRedirectUrl = calendarBaseUrl
    ? `${calendarBaseUrl}/api/integrations/google-calendar/callback`
    : 'https://seu-dominio.com/api/integrations/google-calendar/callback';
  const calendarWebhookUrl = calendarBaseUrl
    ? `${calendarBaseUrl}/api/integrations/google-calendar/webhook`
    : 'https://seu-dominio.com/api/integrations/google-calendar/webhook';
  const calendarStep = !calendarCredsStatus?.isConfigured
    ? 1
    : !calendarAuthStatus?.connected
      ? 2
      : 3;
  const calendarCredsSourceLabel = calendarCredsStatus?.source === 'env'
    ? 'variaveis de ambiente'
    : calendarCredsStatus?.source === 'db'
      ? 'configurado aqui'
      : 'nao configurado';
  const calendarClientIdValue = calendarClientIdDraft.trim();
  const calendarClientSecretValue = calendarClientSecretDraft.trim();
  const calendarClientIdValid = !calendarClientIdValue || /\.apps\.googleusercontent\.com$/i.test(calendarClientIdValue);
  const calendarClientSecretValid = !calendarClientSecretValue || calendarClientSecretValue.length >= 10;
  const calendarCredsFormValid = Boolean(
    calendarClientIdValue &&
      calendarClientSecretValue &&
      calendarClientIdValid &&
      calendarClientSecretValid
  );
  const selectedCalendar = calendarList.find((item) => String(item.id) === calendarSelectionId);
  const selectedCalendarTimeZone = selectedCalendar?.timeZone || calendarAuthStatus?.calendar?.calendarTimeZone || calendarDraft.timezone;
  const hasCalendarSelection = Boolean(calendarSelectionId || calendarAuthStatus?.calendar?.calendarId);
  const filteredCalendarList = calendarListQuery.trim()
    ? calendarList.filter((item) => {
      const query = calendarListQuery.trim().toLowerCase();
      return String(item.summary || item.id).toLowerCase().includes(query);
    })
    : calendarList;
  const calendarWizardCanContinue = calendarWizardStep === 0
    ? true
    : calendarWizardStep === 1
      ? Boolean(calendarCredsStatus?.isConfigured)
      : calendarWizardStep === 2
        ? Boolean(calendarAuthStatus?.connected)
        : calendarWizardStep === 3
          ? Boolean(calendarAuthStatus?.connected && hasCalendarSelection)
          : false;

  // URL param handling for wizard
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('gc') === '1') {
      setIsCalendarWizardOpen(true);
      setCalendarWizardError(null);
      const autoStep = calendarStep === 3 ? 3 : calendarStep === 2 ? 2 : 0;
      setCalendarWizardStep(autoStep);
      params.delete('gc');
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', next);
    }
  }, [calendarStep]);

  // Auto-set wizard step when opening
  useEffect(() => {
    if (!isCalendarWizardOpen) return;
    const fromStatus = calendarStep === 3 ? 3 : calendarStep === 2 ? 2 : 0;
    setCalendarWizardStep((prev) => (prev > 0 ? prev : fromStatus));
  }, [isCalendarWizardOpen, calendarStep]);

  // Restore wizard progress from localStorage
  useEffect(() => {
    if (!isCalendarWizardOpen || typeof window === 'undefined') return;
    const storedRaw = window.localStorage.getItem(CALENDAR_WIZARD_STORAGE_KEY);
    if (!storedRaw) return;
    try {
      const stored = JSON.parse(storedRaw) as { step?: number; selectionId?: string; baseUrl?: string };
      if (stored?.baseUrl && !calendarBaseUrlEditing) {
        setCalendarBaseUrlDraft(stored.baseUrl);
      }
      if (stored?.selectionId) {
        setCalendarSelectionId(stored.selectionId);
      }
      if (typeof stored?.step === 'number') {
        setCalendarWizardStep(stored.step);
      }
    } catch {
      // ignore
    }
  }, [isCalendarWizardOpen, calendarBaseUrlEditing]);

  // Save wizard progress to localStorage
  useEffect(() => {
    if (!isCalendarWizardOpen || typeof window === 'undefined') return;
    const payload = {
      step: calendarWizardStep,
      selectionId: calendarSelectionId,
      baseUrl: calendarBaseUrlDraft,
    };
    window.localStorage.setItem(CALENDAR_WIZARD_STORAGE_KEY, JSON.stringify(payload));
  }, [isCalendarWizardOpen, calendarWizardStep, calendarSelectionId, calendarBaseUrlDraft]);

  // Clear wizard error on step change
  useEffect(() => {
    if (!isCalendarWizardOpen) return;
    setCalendarWizardError(null);
  }, [calendarWizardStep, isCalendarWizardOpen]);

  // Reset list query when wizard opens
  useEffect(() => {
    if (isCalendarWizardOpen) {
      setCalendarListQuery('');
    }
  }, [isCalendarWizardOpen]);

  // Reset connect loading when wizard closes
  useEffect(() => {
    if (!isCalendarWizardOpen) {
      setCalendarConnectLoading(false);
    }
  }, [isCalendarWizardOpen]);

  // Validate wizard step based on status
  useEffect(() => {
    if (!isCalendarWizardOpen) return;
    if (calendarWizardStep === 3 && !calendarAuthStatus?.connected) {
      setCalendarWizardStep(calendarCredsStatus?.isConfigured ? 2 : 0);
      return;
    }
    if (calendarWizardStep === 2 && !calendarCredsStatus?.isConfigured) {
      setCalendarWizardStep(0);
    }
  }, [isCalendarWizardOpen, calendarWizardStep, calendarAuthStatus?.connected, calendarCredsStatus?.isConfigured]);

  // Actions
  const updateCalendarDraft = (patch: Partial<CalendarBookingConfig>) => {
    setCalendarDraft((prev) => ({ ...prev, ...patch }));
  };

  const updateWorkingHours = (day: string, patch: Partial<{ enabled: boolean; start: string; end: string; slots: Array<{ start: string; end: string }> }>) => {
    setCalendarDraft((prev) => ({
      ...prev,
      workingHours: prev.workingHours.map((entry) =>
        entry.day === day
          ? { ...entry, ...patch }
          : entry
      ),
    }));
  };

  const handleSaveCalendarBooking = async () => {
    if (!saveCalendarBooking) return;
    await saveCalendarBooking(calendarDraft);
    setIsEditingCalendarBooking(false);
  };

  const handleConnectCalendar = () => {
    setCalendarConnectLoading(true);
    setCalendarWizardError(null);
    window.location.href = '/api/integrations/google-calendar/connect?returnTo=/settings?gc=1';
  };

  const handleDisconnectCalendar = async () => {
    setCalendarAuthLoading(true);
    setCalendarAuthError(null);
    try {
      const response = await fetch('/api/integrations/google-calendar/disconnect', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as Record<string, unknown>)?.error as string || 'Falha ao desconectar');
      }
      toast.success('Google Calendar desconectado');
      await fetchCalendarAuthStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao desconectar';
      setCalendarAuthError(message);
      toast.error(message);
    } finally {
      setCalendarAuthLoading(false);
    }
  };

  const handleSaveCalendarCreds = async () => {
    setCalendarWizardError(null);
    if (!calendarCredsFormValid) {
      setCalendarWizardError('Informe um Client ID e Client Secret validos.');
      return;
    }

    setCalendarCredsSaving(true);
    setCalendarCredsError(null);
    try {
      const response = await fetch('/api/settings/google-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: calendarClientIdDraft.trim(),
          clientSecret: calendarClientSecretDraft.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as Record<string, unknown>)?.error as string || 'Falha ao salvar credenciais');
      }
      toast.success('Credenciais salvas.');
      await fetchCalendarCredsStatus();
      setCalendarWizardStep((prev) => (prev < 2 ? 2 : prev));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar credenciais';
      setCalendarCredsError(message);
      setCalendarWizardError(message);
      toast.error(message);
    } finally {
      setCalendarCredsSaving(false);
    }
  };

  const handleRemoveCalendarCreds = async () => {
    setCalendarCredsSaving(true);
    setCalendarCredsError(null);
    try {
      const response = await fetch('/api/settings/google-calendar', { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as Record<string, unknown>)?.error as string || 'Falha ao remover credenciais');
      }
      toast.success('Credenciais removidas.');
      await fetchCalendarCredsStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao remover credenciais';
      setCalendarCredsError(message);
      setCalendarWizardError(message);
      toast.error(message);
    } finally {
      setCalendarCredsSaving(false);
    }
  };

  const handleSaveCalendarSelection = async (): Promise<boolean> => {
    if (!calendarSelectionId) {
      setCalendarWizardError('Selecione um calendario.');
      return false;
    }
    setCalendarSelectionSaving(true);
    setCalendarListError(null);
    setCalendarWizardError(null);
    try {
      const response = await fetch('/api/integrations/google-calendar/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: calendarSelectionId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as Record<string, unknown>)?.error as string || 'Falha ao salvar calendario');
      }
      toast.success('Calendario atualizado');
      await fetchCalendarAuthStatus();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar calendario';
      setCalendarListError(message);
      setCalendarWizardError(message);
      toast.error(message);
      return false;
    } finally {
      setCalendarSelectionSaving(false);
    }
  };

  const handlePrimaryCalendarAction = () => {
    setCalendarWizardError(null);
    setCalendarConnectLoading(false);
    setCalendarWizardStep(calendarStep === 3 ? 3 : calendarStep === 2 ? 2 : 0);
    setIsCalendarWizardOpen(true);
  };

  const handleCopyCalendarValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error(`Nao foi possivel copiar ${label}`);
    }
  };

  const handleCopyCalendarBundle = async () => {
    const bundle = `Redirect URI: ${calendarRedirectUrl}\nWebhook URL: ${calendarWebhookUrl}`;
    await handleCopyCalendarValue(bundle, 'URLs');
  };

  const handleCalendarTestEvent = async (): Promise<boolean> => {
    if (!calendarAuthStatus?.connected) {
      setCalendarWizardError('Conecte o Google Calendar antes de testar.');
      return false;
    }
    setCalendarTestLoading(true);
    setCalendarTestResult(null);
    try {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const response = await fetch('/api/integrations/google-calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarId: calendarAuthStatus?.calendar?.calendarId || undefined,
          start: start.toISOString(),
          end: end.toISOString(),
          timeZone: selectedCalendarTimeZone,
          summary: 'Teste Dispara',
          description: 'Evento de teste criado pelo Dispara.',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as Record<string, unknown>)?.error as string || 'Falha ao criar evento');
      }
      setCalendarTestResult({ ok: true, link: (data as { htmlLink?: string })?.htmlLink || null });
      toast.success('Evento de teste criado.');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao criar evento';
      setCalendarTestResult({ ok: false });
      setCalendarWizardError(message);
      toast.error(message);
      return false;
    } finally {
      setCalendarTestLoading(false);
    }
  };

  const handleCalendarWizardStepClick = (step: number) => {
    if (step === 2 && !calendarCredsStatus?.isConfigured) {
      setCalendarWizardError('Complete as credenciais primeiro.');
      return;
    }
    if (step === 3 && !calendarAuthStatus?.connected) {
      setCalendarWizardError('Conecte o Google Calendar antes.');
      return;
    }
    setCalendarWizardError(null);
    setCalendarWizardStep(step);
  };

  const handleCalendarWizardBack = () => {
    setCalendarWizardError(null);
    if (calendarWizardStep === 0) {
      setIsCalendarWizardOpen(false);
      return;
    }
    setCalendarWizardStep((prev) => Math.max(0, prev - 1));
  };

  const handleCalendarWizardNext = async () => {
    if (calendarWizardStep === 0) {
      setCalendarWizardError(null);
      setCalendarWizardStep(1);
      return;
    }
    if (calendarWizardStep === 1) {
      if (!calendarCredsStatus?.isConfigured) {
        setCalendarWizardError('Salve as credenciais para continuar.');
        return;
      }
      setCalendarWizardError(null);
      setCalendarWizardStep(2);
      return;
    }
    if (calendarWizardStep === 2) {
      if (!calendarAuthStatus?.connected) {
        setCalendarWizardError('Autorize o Google para continuar.');
        return;
      }
      setCalendarWizardError(null);
      setCalendarWizardStep(3);
      return;
    }
    const effectiveCalendarId = calendarSelectionId || calendarAuthStatus?.calendar?.calendarId;
    if (!effectiveCalendarId) {
      setCalendarWizardError('Selecione um calendario antes de testar.');
      return;
    }
    if (calendarSelectionId && calendarSelectionId !== calendarAuthStatus?.calendar?.calendarId) {
      const saved = await handleSaveCalendarSelection();
      if (!saved) return;
    }
    const ok = await handleCalendarTestEvent();
    if (ok) {
      setIsCalendarWizardOpen(false);
    }
  };

  return {
    // Config state
    calendarConfig,
    isEditingCalendarBooking,
    setIsEditingCalendarBooking,
    calendarDraft,
    updateCalendarDraft,
    updateWorkingHours,
    handleSaveCalendarBooking,

    // Auth status
    calendarAuthStatus,
    calendarAuthLoading,
    calendarAuthError,
    fetchCalendarAuthStatus,

    // Creds status
    calendarCredsStatus,
    calendarCredsLoading,
    calendarCredsError,
    calendarCredsSaving,
    calendarClientIdDraft,
    setCalendarClientIdDraft,
    calendarClientSecretDraft,
    setCalendarClientSecretDraft,
    fetchCalendarCredsStatus,
    handleSaveCalendarCreds,
    handleRemoveCalendarCreds,

    // Calendar list
    calendarList,
    calendarListLoading,
    calendarListError,
    calendarSelectionId,
    setCalendarSelectionId,
    calendarSelectionSaving,
    calendarListQuery,
    setCalendarListQuery,
    filteredCalendarList,
    fetchCalendarList,
    handleSaveCalendarSelection,

    // Wizard state
    isCalendarWizardOpen,
    setIsCalendarWizardOpen,
    calendarWizardStep,
    setCalendarWizardStep,
    calendarWizardError,
    setCalendarWizardError,
    handleCalendarWizardStepClick,
    handleCalendarWizardBack,
    handleCalendarWizardNext,

    // Connect/Disconnect
    calendarConnectLoading,
    handleConnectCalendar,
    handleDisconnectCalendar,

    // Test event
    calendarTestLoading,
    calendarTestResult,
    handleCalendarTestEvent,

    // Base URL
    appOrigin,
    calendarBaseUrlDraft,
    setCalendarBaseUrlDraft,
    calendarBaseUrlEditing,
    setCalendarBaseUrlEditing,

    // Computed values
    calendarBaseUrl,
    calendarRedirectUrl,
    calendarWebhookUrl,
    calendarStep,
    calendarCredsSourceLabel,
    calendarClientIdValid,
    calendarClientSecretValid,
    calendarCredsFormValid,
    selectedCalendar,
    selectedCalendarTimeZone,
    hasCalendarSelection,
    calendarWizardCanContinue,

    // Actions
    handlePrimaryCalendarAction,
    handleCopyCalendarValue,
    handleCopyCalendarBundle,
  };
}
