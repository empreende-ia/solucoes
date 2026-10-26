import { supabase } from '@/integrations/supabase/client';
import type { MetaTemplate, TemplateDraft } from '../../supabase/functions/_shared/whatsapp-templates';

/**
 * Erro com o `code` da edge function preservado: a UI usa
 * 'whatsapp_cloud_not_configured' para trocar o toast por um estado de
 * orientação apontando a aba APIs.
 */
export class WhatsAppTemplatesError extends Error {
  constructor(message: string, public readonly code: string | null = null) {
    super(message);
    this.name = 'WhatsAppTemplatesError';
  }
}

async function invokeTemplates(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('whatsapp-templates', { body });
  if (error) {
    let message = error.message || 'Não foi possível falar com o serviço de templates.';
    let code: string | null = null;
    try {
      const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
      const details = typeof context?.json === 'function'
        ? await context.json() as { error?: string; code?: string }
        : null;
      if (details?.error) message = details.error;
      if (details?.code) code = details.code;
    } catch {
      // Mantém a mensagem da SDK.
    }
    throw new WhatsAppTemplatesError(message, code);
  }
  if (data?.error) throw new WhatsAppTemplatesError(String(data.error), typeof data.code === 'string' ? data.code : null);
  return data ?? {};
}

export const whatsappTemplatesApi = {
  async list(): Promise<MetaTemplate[]> {
    const data = await invokeTemplates({ action: 'list' });
    return Array.isArray(data.templates) ? data.templates as MetaTemplate[] : [];
  },

  async create(template: TemplateDraft): Promise<{ name: string; status: string }> {
    const data = await invokeTemplates({ action: 'create', template });
    const created = (data.template ?? {}) as { name?: string; status?: string };
    return { name: created.name ?? template.name, status: created.status ?? 'PENDING' };
  },

  async remove(name: string): Promise<void> {
    await invokeTemplates({ action: 'delete', name });
  },
};
