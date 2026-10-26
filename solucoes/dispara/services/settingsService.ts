import type { AiFallbackConfig, AiPromptsConfig, AiRoutesConfig } from '../lib/ai/ai-center-defaults';
import { storage } from '../lib/storage';
import { AppSettings, CalendarBookingConfig, WorkflowExecutionConfig } from '../types';

// =============================================================================
// OCR CONFIGURATION TYPES
// =============================================================================

export type OCRProviderType = 'gemini' | 'mistral'

export interface OCRConfig {
  provider: OCRProviderType
  geminiModel: string
  mistralStatus: {
    isConfigured: boolean
    source: 'database' | 'env' | 'none'
    tokenPreview: string | null
  }
}

// =============================================================================
// CONSOLIDATED SETTINGS - Fetch all independent settings in one request
// =============================================================================

export interface AllSettingsResponse {
  credentials: {
    source: 'db' | 'env_fallback' | 'db_error' | 'none'
    phoneNumberId?: string
    businessAccountId?: string
    displayPhoneNumber?: string
    verifiedName?: string
    hasToken?: boolean
    isConnected: boolean
    warning?: string
  }
  ai: {
    provider: string
    model: string
    providers: Record<string, { isConfigured: boolean; source: string; tokenPreview: string | null }>
    isConfigured: boolean
    source: string
    tokenPreview: string | null
    routes: any
    fallback: any
    prompts: any
  }
  metaApp: {
    source: 'db' | 'env' | 'none'
    appId: string | null
    hasAppSecret: boolean
    isConfigured: boolean
  }
  testContact: { name?: string; phone: string } | null
  domains: {
    domains: Array<{ value: string; label: string; isPrimary: boolean }>
    webhookPath: string
    currentSelection: string | null
  }
  calendarBooking: { ok: boolean; source: 'db' | 'default'; config: CalendarBookingConfig }
  workflowExecution: { ok: boolean; source: 'db' | 'env'; config: WorkflowExecutionConfig }
  timestamp: string
}

/** Resposta de POST /api/settings/meta-app (o App Secret nunca volta). */
export interface MetaAppConfigSaveResult {
  appId?: string | null
  hasAppSecret?: boolean
  isConfigured?: boolean
  appSecretValidation?: 'valid' | 'unavailable' | null
  /** Presente quando não deu para validar o App Secret com a Meta (salvo em verificação). */
  warning?: string
}

export const settingsService = {
  /**
   * Get ALL independent settings in a single request
   * Reduces 8+ API calls to 1 for Settings page
   */
  getAll: async (): Promise<AllSettingsResponse> => {
    const response = await fetch('/api/settings/all', { cache: 'no-store' })
    if (!response.ok) throw new Error('Failed to fetch all settings')
    return response.json()
  },

  /**
   * Get settings - combines local storage (UI state) with server credentials
   */
  get: async (): Promise<AppSettings> => {
    // 1. Get local settings (UI state like testContact)
    const localSettings = storage.settings.get();

    // 2. Get server credentials
    try {
      const response = await fetch('/api/settings/credentials');
      if (response.ok) {
        const serverData = await response.json();
        if (serverData.isConnected) {
          return {
            ...localSettings,
            phoneNumberId: serverData.phoneNumberId,
            businessAccountId: serverData.businessAccountId,
            displayPhoneNumber: serverData.displayPhoneNumber,
            verifiedName: serverData.verifiedName,
            isConnected: true,
            // Don't expose full token to frontend
            accessToken: serverData.hasToken ? '***configured***' : '',
          };
        }
      }
    } catch (error) {
      console.error('Error fetching server credentials:', error);
    }

    return localSettings;
  },

  // =============================================================================
  // WORKFLOW BUILDER DEFAULT
  // =============================================================================

  getWorkflowBuilderDefault: async (): Promise<{ defaultWorkflowId: string }> => {
    const response = await fetch('/api/settings/workflow-builder')
    if (!response.ok) throw new Error('Failed to fetch workflow builder default')
    return response.json()
  },

  saveWorkflowBuilderDefault: async (defaultWorkflowId: string): Promise<void> => {
    const response = await fetch('/api/settings/workflow-builder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultWorkflowId }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error((error as any)?.error || 'Failed to save workflow builder default')
    }
  },

  // =============================================================================
  // WORKFLOW EXECUTION SETTINGS
  // =============================================================================

  getWorkflowExecutionConfig: async (): Promise<{
    ok: boolean;
    source: 'db' | 'env';
    config: WorkflowExecutionConfig;
  }> => {
    const response = await fetch('/api/settings/workflow-execution', { cache: 'no-store' })
    if (!response.ok) throw new Error('Failed to fetch workflow execution config')
    return response.json()
  },

  saveWorkflowExecutionConfig: async (data: Partial<WorkflowExecutionConfig>): Promise<WorkflowExecutionConfig> => {
    const response = await fetch('/api/settings/workflow-execution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((json as any)?.error || 'Failed to save workflow execution config')
    }
    return (json as any)?.config as WorkflowExecutionConfig
  },

  // =============================================================================
  // META APP (opcional) — debug_token e diagnóstico avançado
  // =============================================================================

  getMetaAppConfig: async (): Promise<{
    source: 'db' | 'env' | 'none'
    appId: string | null
    hasAppSecret: boolean
    isConfigured: boolean
  }> => {
    const response = await fetch('/api/settings/meta-app', { cache: 'no-store' })
    if (!response.ok) throw new Error('Failed to fetch Meta App config')
    return response.json()
  },

  /**
   * Lança com a mensagem da API em erro (ex.: App Secret recusado pela Graph — a
   * mensagem diz se o App ID foi salvo). Em sucesso, devolve o JSON: `warning`
   * aparece quando não deu para validar o App Secret com a Meta.
   */
  saveMetaAppConfig: async (data: { appId: string; appSecret: string }): Promise<MetaAppConfigSaveResult> => {
    const response = await fetch('/api/settings/meta-app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json: unknown = await response.json().catch(() => ({}))
    const body: MetaAppConfigSaveResult & { error?: unknown } =
      json && typeof json === 'object' ? (json as MetaAppConfigSaveResult & { error?: unknown }) : {}
    if (!response.ok) {
      throw new Error(typeof body.error === 'string' && body.error ? body.error : 'Failed to save Meta App config')
    }
    return body
  },

  removeMetaAppConfig: async (): Promise<void> => {
    const response = await fetch('/api/settings/meta-app', { method: 'DELETE' })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error((error as any)?.error || 'Failed to remove Meta App config')
    }
  },

  /**
   * Save settings - credentials go to server, UI state stays local
   */
  save: async (settings: AppSettings): Promise<AppSettings> => {
    // 1. Save UI state locally (testContact, etc.)
    const uiSettings = {
      ...settings,
      // Don't save credentials locally
      accessToken: '',
    };
    storage.settings.save(uiSettings);

    // 2. If we have real credentials, save to server
    if (settings.accessToken && settings.accessToken !== '***configured***') {
      try {
        const response = await fetch('/api/settings/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumberId: settings.phoneNumberId,
            businessAccountId: settings.businessAccountId,
            accessToken: settings.accessToken,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to save credentials');
        }

        const result = await response.json();
        return {
          ...settings,
          displayPhoneNumber: result.displayPhoneNumber,
          verifiedName: result.verifiedName,
          isConnected: true,
        };
      } catch (error) {
        console.error('Error saving credentials to server:', error);
        throw error;
      }
    }

    return settings;
  },

  /**
   * Disconnect - remove credentials from server
   */
  disconnect: async (): Promise<void> => {
    try {
      await fetch('/api/settings/credentials', { method: 'DELETE' });
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  },

  /**
   * Fetch phone details from Meta API
   */
  fetchPhoneDetails: async (credentials: { phoneNumberId: string, accessToken: string }) => {
    const response = await fetch('/api/settings/phone-number', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    if (!response.ok) throw new Error('Failed to fetch phone details');
    return response.json();
  },

  /**
   * Get system health status
   */
  getHealth: async () => {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('Failed to fetch health status');
    return response.json();
  },

  // =============================================================================
  // TEST CONNECTION (sem salvar)
  // =============================================================================

  /**
   * Testa conexão com a Meta Graph API.
   * - Se o token vier mascarado (ex: '***configured***'), o backend usa credenciais salvas.
   * - Não persiste nada; apenas valida.
   */
  testConnection: async (data?: {
    phoneNumberId?: string
    businessAccountId?: string
    accessToken?: string
  }): Promise<{
    ok: boolean
    error?: string
    code?: number
    errorSubcode?: number
    details?: any
    phoneNumberId?: string
    businessAccountId?: string | null
    displayPhoneNumber?: string | null
    verifiedName?: string | null
    qualityRating?: string | null
    wabaId?: string | null
    usedStoredCredentials?: boolean
  }> => {
    const response = await fetch('/api/settings/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const msg = (payload as any)?.error || 'Falha ao testar conexão'
      const err: any = new Error(msg)
      err.details = payload
      throw err
    }

    return payload
  },

  /**
   * Get AI settings
   */
  getAIConfig: async () => {
    const response = await fetch('/api/settings/ai');
    if (!response.ok) throw new Error('Failed to fetch AI settings');
    return response.json();
  },

  /**
   * Save AI settings (including OCR configuration)
   */
  saveAIConfig: async (data: {
    apiKey?: string;
    apiKeyProvider?: string;
    provider?: string;
    model?: string;
    routes?: AiRoutesConfig;
    prompts?: AiPromptsConfig;
    fallback?: AiFallbackConfig;
    // OCR fields
    ocr_provider?: OCRProviderType;
    ocr_gemini_model?: string;
    mistral_api_key?: string;
  }) => {
    const response = await fetch('/api/settings/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save AI settings');
    }

    return response.json();
  },

  /**
   * Remove API key for a specific provider (including mistral for OCR)
   */
  removeAIKey: async (provider: 'google' | 'openai' | 'anthropic' | 'mistral') => {
    const response = await fetch(`/api/settings/ai?provider=${provider}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove AI key');
    }

    return response.json();
  },

  // =============================================================================
  // TEST CONTACT - Persisted in Supabase
  // =============================================================================

  /**
   * Get test contact from Supabase
   */
  getTestContact: async (): Promise<{ name?: string; phone: string } | null> => {
    try {
      const response = await fetch('/api/settings/test-contact');
      if (!response.ok) return null;
      return response.json();
    } catch (error) {
      console.error('Error fetching test contact:', error);
      return null;
    }
  },

  /**
   * Save test contact to Supabase
   */
  saveTestContact: async (contact: { name?: string; phone: string }): Promise<void> => {
    const response = await fetch('/api/settings/test-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contact),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save test contact');
    }
  },

  /**
   * Remove test contact from Supabase
   */
  removeTestContact: async (): Promise<void> => {
    const response = await fetch('/api/settings/test-contact', {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove test contact');
    }
  },

  // =============================================================================
  // WHATSAPP TURBO (Adaptive Throttle) - Persisted in Supabase settings
  // =============================================================================

  getWhatsAppThrottle: async (): Promise<any> => {
    const response = await fetch('/api/settings/whatsapp-throttle')
    if (!response.ok) throw new Error('Failed to fetch WhatsApp throttle config')
    return response.json()
  },

  saveWhatsAppThrottle: async (data: {
    enabled?: boolean
    sendConcurrency?: number
    batchSize?: number
    startMps?: number
    maxMps?: number
    minMps?: number
    cooldownSec?: number
    minIncreaseGapSec?: number
    sendFloorDelayMs?: number
    resetState?: boolean
  }): Promise<any> => {
    const response = await fetch('/api/settings/whatsapp-throttle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((json as any)?.error || 'Failed to save WhatsApp throttle config')
    }

    return json
  },

  // =============================================================================
  // AUTO-SUPPRESSÃO (Proteção de Qualidade) - Persisted in Supabase settings
  // =============================================================================

  getAutoSuppression: async (): Promise<any> => {
    const response = await fetch('/api/settings/auto-suppression')
    if (!response.ok) throw new Error('Failed to fetch auto-suppression config')
    return response.json()
  },

  saveAutoSuppression: async (data: any): Promise<any> => {
    const response = await fetch('/api/settings/auto-suppression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((json as any)?.error || 'Failed to save auto-suppression config')
    }

    return json
  },

  // =============================================================================
  // CALENDAR BOOKING CONFIG (Google Calendar)
  // =============================================================================

  getCalendarBookingConfig: async (): Promise<{
    ok: boolean;
    source: 'db' | 'default';
    config: CalendarBookingConfig;
  }> => {
    const response = await fetch('/api/settings/calendar-booking', { cache: 'no-store' })
    if (!response.ok) throw new Error('Failed to fetch calendar booking config')
    return response.json()
  },

  saveCalendarBookingConfig: async (data: Partial<CalendarBookingConfig>): Promise<void> => {
    const response = await fetch('/api/settings/calendar-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((json as any)?.error || 'Failed to save calendar booking config')
    }
  },
};
