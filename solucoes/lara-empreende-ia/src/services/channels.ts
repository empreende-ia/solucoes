import { supabase } from '@/integrations/supabase/client';

export interface ChannelConnection {
  id: string;
  platform: 'whatsapp' | 'instagram';
  provider: string;
  zernio_account_id: string;
  username: string | null;
  display_name: string | null;
  status: 'active' | 'disconnected' | 'error';
  connected_at: string | null;
  disconnected_at: string | null;
}

export interface ZernioStatus {
  hasKey: boolean;
  profileId: string | null;
  webhookConfigured: boolean;
  connections: ChannelConnection[];
}

async function invokeZernio(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('zernio-connect', { body });
  if (error) {
    // FunctionsHttpError guarda o body da resposta em context
    const ctx = (error as any)?.context;
    let detail: string | null = null;
    try {
      if (ctx && typeof ctx.json === 'function') {
        const parsed = await ctx.json();
        detail = parsed?.error ?? null;
      }
    } catch { /* sem body */ }
    throw new Error(detail || error.message || 'Erro ao chamar zernio-connect');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const channelsApi = {
  async status(): Promise<ZernioStatus> {
    const data = await invokeZernio({ action: 'status' });
    return {
      hasKey: !!data.hasKey,
      profileId: data.profileId ?? null,
      webhookConfigured: !!data.webhookConfigured,
      connections: data.connections ?? [],
    };
  },

  async saveKey(apiKey: string): Promise<{ profileId: string }> {
    return await invokeZernio({ action: 'save_key', apiKey });
  },

  // Retorna a authUrl da Zernio — abrir em nova aba para o usuário autorizar na Meta
  async connect(platform: 'whatsapp'): Promise<string> {
    const redirectUrl = `${window.location.origin}/settings?zernio=connected`;
    const data = await invokeZernio({ action: 'connect', platform, redirectUrl });
    return data.authUrl as string;
  },

  async sync(): Promise<ChannelConnection[]> {
    const data = await invokeZernio({ action: 'sync' });
    return data.connections ?? [];
  },

  async disconnect(accountId: string): Promise<void> {
    await invokeZernio({ action: 'disconnect', accountId });
  },

  async remove(accountId: string): Promise<void> {
    await invokeZernio({ action: 'remove', accountId });
  },
};
